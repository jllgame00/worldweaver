// @vitest-environment node
import { once } from 'node:events';
import { createServer as createHttpServer, request } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import config from '../vite.config';

const backend = createHttpServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(req.headers));
});
let vite: Awaited<ReturnType<typeof createViteServer>>;
let vitePort: number;

beforeAll(async () => {
  await once(backend.listen(0, '127.0.0.1'), 'listening');
  const backendAddress = backend.address();
  if (!backendAddress || typeof backendAddress === 'string') throw new Error('Expected an HTTP port');

  const target = `http://127.0.0.1:${backendAddress.port}`;
  const api = config.server?.proxy?.['/api'];
  if (!api) throw new Error('Expected an API proxy in the Vite config');
  vite = await createViteServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: {
      ...config.server,
      host: '127.0.0.1',
      port: 0,
      ws: false,
      proxy: { '/api': typeof api === 'string' ? target : { ...api, target } },
    },
  });
  await vite.listen();
  const viteAddress = vite.httpServer?.address();
  if (!viteAddress || typeof viteAddress === 'string') throw new Error('Expected a Vite port');
  vitePort = viteAddress.port;
});

afterAll(async () => {
  await vite?.close();
  await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
});

function postCandidate(hostname: string) {
  const host = `${hostname}:${vitePort}`;
  return new Promise<{ status?: number; body: string }>((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1',
      port: vitePort,
      path: '/api/candidates',
      method: 'POST',
      headers: { host, origin: `http://${host}`, 'content-type': 'application/json' },
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end('{}');
  });
}

test.each(['127.0.0.1', 'localhost'])('preserves the browser origin at %s through the API proxy', async hostname => {
  const response = await postCandidate(hostname);
  expect(response.status).toBe(200);
  const headers: unknown = JSON.parse(response.body);
  const host = `${hostname}:${vitePort}`;
  expect(headers).toMatchObject({ host, origin: `http://${host}` });
  for (const name of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip']) {
    expect(headers).not.toHaveProperty(name);
  }
});

test('blocks API proxying from a non-loopback socket', async () => {
  // Simulate the socket address so the test works without a LAN interface.
  vite.httpServer?.prependOnceListener('request', req => {
    Object.defineProperty(req.socket, 'remoteAddress', { value: '192.0.2.4' });
  });
  expect((await postCandidate('localhost')).status).toBe(404);
});

test('refuses to move to a new browser origin when the requested port is occupied', async () => {
  const contender = await createViteServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { ...config.server, port: vitePort, ws: false },
  });
  try {
    await expect(contender.listen()).rejects.toThrow(`Port ${vitePort} is already in use`);
  } finally {
    await contender.close();
  }
});
