import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integrations/**/*.test.ts'],
    testTimeout: 120000, // 2 minutes for container startup
    hookTimeout: 120000, // 2 minutes for setup/teardown
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
