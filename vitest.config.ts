import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    pool: 'forks',
    isolate: true,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '../src/': new URL('./src/', import.meta.url).pathname,
    },
  },
  esbuild: {
    target: 'node18',
  },
});
