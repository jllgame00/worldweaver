import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const [sourceFile, exportFile] = process.argv.slice(2);
const p = JSON.parse(readFileSync(sourceFile, 'utf8'));
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const vite = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
try {
  const { defaults, generateAtlas, worldIssues, acceptAtlas, resolvedWorld } =
    await vite.ssrLoadModule('/src/atlasWorkflow.ts');
  const { importProject } = await vite.ssrLoadModule('/src/scenarioWorkflow.ts');
  const { isProject } = await vite.ssrLoadModule('/src/validation.ts');
  const initial = hash(p);
  const w = await generateAtlas(p, '갈대섬의 비상 배급로', 74001, { ...defaults, landform: 'islands' }, []);
  assert.deepEqual(
    worldIssues(p, w)
      .filter((f) => f.severity === 'error')
      .map((f) => f.code),
    [],
  );
  // Fix the receipt ID so standalone fixture exports can be reproduced byte-for-byte.
  crypto.randomUUID = () => 'ce725c86-7723-4042-afad-000000000001';
  const accepted = acceptAtlas(p, w, p.revision, true);
  const json = JSON.stringify(accepted, null, 2);
  const reopened = importProject(json);
  assert.equal(hash(reopened), hash(accepted));
  assert.equal(isProject(reopened), true);
  assert.equal(hash(p), initial);
  assert.deepEqual(reopened.scenario, p.scenario);
  assert.deepEqual(reopened.canonicalFacts, p.canonicalFacts);
  assert.deepEqual(
    worldIssues(reopened, resolvedWorld(reopened))
      .filter((f) => f.severity === 'error')
      .map((f) => f.code),
    [],
  );
  const gateIds = new Set(reopened.scenario.locations.map((l) => l.id));
  assert.ok(reopened.world.routes.some((r) => gateIds.has(r.from) || gateIds.has(r.to)));
  assert.ok(reopened.world.routes.some((r) => r.mode === 'sea'));
  assert.ok(reopened.world.routes.some((r) => r.mode === 'tunnel'));
  writeFileSync(exportFile, json, 'utf8');
  for (const defect of ['foreign', 'no-position']) {
    const damaged = structuredClone(accepted);
    if (defect === 'foreign') damaged.world.placements[0].locationId = 'missing';
    else delete damaged.world.placements[0].position;
    assert.equal(isProject(damaged), false, defect);
    assert.throws(() => importProject(JSON.stringify(damaged)));
  }
  console.log(
    JSON.stringify({
      projectSha256: hash(reopened),
      worldSha256: hash(w),
      seed: w.seed,
      placements: reopened.world.placements.length,
      places: w.locations.length,
      routes: w.routes.length,
      routeModes: [...new Set(w.routes.map((r) => r.mode))],
      bytes: Buffer.byteLength(json),
    }),
  );
} finally {
  await vite.close();
}
