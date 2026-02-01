import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        include: ['tests/unit/**/*.test.js', 'tests/unit/**/*.spec.js', 'tests/architecture/**/*.test.js'],
        exclude: ['node_modules/**', 'dist/**'],
        globals: false,
        setupFiles: [
            './tests/setup.js',
            './tests/unit/vitest-setup.js',
            './tests/unit/services/storage-degradation/setup.js',
        ],
        testTimeout: 10000,
        hookTimeout: 30000,
        environmentMatchGlobs: [['**/tests/architecture/**/*.test.js', 'node']],
    },
});
