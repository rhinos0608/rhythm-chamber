import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/api-compatibility.test.js'],
    exclude: ['node_modules/**', 'dist/**', 'tests/unit/**/!(api-compatibility).test.js'],
    globals: false,
    setupFiles: [],
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
});
