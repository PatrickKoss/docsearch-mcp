import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integrations/**/*.test.ts'],
    testTimeout: 15000, // 15 seconds
    hookTimeout: 15000, // 15 seconds
    env: {
      NODE_ENV: 'test',
    },
    // Run integration tests sequentially to avoid resource conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    setupFiles: ['./test/integrations/setup.ts'],
  },
});
