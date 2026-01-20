import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js'],
    exclude: ['node_modules/**', 'dist/**'],
    globals: false,
    setupFiles: ['./tests/unit/vitest-setup.js']
  }
});