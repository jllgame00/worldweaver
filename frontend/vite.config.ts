import react from '@vitejs/plugin-react';
import type { ProxyOptions } from 'vite';
import { defineConfig } from 'vitest/config';

const backendProxy: ProxyOptions = {
  target: 'http://127.0.0.1:8000',
  // Keep the browser Host and Origin paired for the backend's same-origin check.
  changeOrigin: false,
  xfwd: false,
  bypass(req) {
    const address = req.socket.remoteAddress ?? '';
    if (address !== '::1' && !/^(?:::ffff:)?127\./.test(address)) return false;
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': backendProxy,
      '/health': backendProxy,
    },
  },
  // Each DOM worker loads the canonical schema and all studios. Bound contention on developer machines.
  test: { environment: 'jsdom', pool: 'threads', maxWorkers: 4, setupFiles: ['./src/testSetup.ts'] },
});
