import { defineConfig } from 'vitest/config';
import gsgiServer from './extension/server.mjs';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  plugins: [gsgiServer()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
