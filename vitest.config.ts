import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
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
