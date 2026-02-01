/**
 * ESLint Flat Configuration for Rhythm Chamber
 *
 * This configuration supports the monorepo structure:
 * - js/          → Browser environment (ES6 modules, 4-space indent)
 * - mcp-server/  → Node.js environment (2-space indent)
 * - scripts/     → Node.js environment (2-space indent)
 * - tests/       → Test environments (Vitest + Playwright)
 *
 * @see https://eslint.org/docs/latest/use/configure/configuration-files-new
 */

import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
export default [
    // Base recommended rules
    js.configs.recommended,

    // Global ignores
    {
        ignores: [
            'node_modules/',
            'dist/',
            'build/',
            'playwright-report/',
            'test-results/',
            'blob-report/',
            '.state/',
            '.memdb/',
            '.mcp-cache/',
            '.mcp-config/',
            '.claude/',
            '.planning/',
            '.vscode/',
            '.idea/',
            '.test-fixtures/',
            'mcp-server/node_modules/',
            'mcp-server/.mcp-cache/',
            // Generated/vendor files
            'js/vendor/',
            'js/window-globals-debug.js', // Legacy allowed globals
            // One-off verification scripts
            'verify-*.js',
            'test-circular-dep.js',
        ],
    },

    // Browser environment (js/ directory) - 4-space indent
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Web APIs
                indexedDB: 'readonly',
                IDBKeyRange: 'readonly',
                crypto: 'readonly',
                Worker: 'readonly',
                Blob: 'readonly',
                FileReader: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                FormData: 'readonly',
                AbortController: 'readonly',
                AbortSignal: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                queueMicrotask: 'readonly',
                BroadcastChannel: 'readonly',
            },
        },
        rules: {
            // Code quality
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            'no-console': 'off', // Allowed - uses centralized logger
            'no-debugger': 'warn',

            // Style (matches existing browser codebase conventions - 4 spaces)
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
            indent: ['error', 4, { SwitchCase: 1 }],
            'comma-dangle': ['error', 'only-multiline'],
            'arrow-parens': ['error', 'as-needed'],

            // Best practices
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'error',
            'prefer-arrow-callback': 'error',
            'no-throw-literal': 'error',
            'no-return-await': 'warn',
            'require-await': 'warn',

            // Security (aligns with existing lint:globals)
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',

            // Enforce ES modules pattern (complements lint:globals)
            'no-restricted-globals': [
                'error',
                {
                    name: 'event',
                    message: 'Use local event parameter instead.',
                },
            ],
        },
    },

    // Node.js environment (scripts/) - 2-space indent
    {
        files: ['scripts/**/*.js', 'scripts/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            // Code quality
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            'no-console': 'off',
            'no-debugger': 'warn',

            // Style (scripts use 2-space indent)
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
            indent: ['error', 2, { SwitchCase: 1 }],
            'comma-dangle': ['error', 'only-multiline'],
            'arrow-parens': ['error', 'as-needed'],

            // Best practices
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'error',
            'prefer-arrow-callback': 'error',
            'no-throw-literal': 'error',
            'no-return-await': 'warn',
            'require-await': 'off', // Scripts often have placeholder async functions

            // Security
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
        },
    },

    // MCP Server (mcp-server/) - 2-space indent
    {
        files: ['mcp-server/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            // Code quality
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            'no-console': 'off',
            'no-debugger': 'warn',

            // Style (mcp-server uses 2-space indent)
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
            indent: ['error', 2, { SwitchCase: 1 }],
            'comma-dangle': ['error', 'only-multiline'],
            'arrow-parens': ['error', 'as-needed'],

            // Best practices
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'error',
            'prefer-arrow-callback': 'error',
            'no-throw-literal': 'error',
            'no-return-await': 'warn',
            'require-await': 'off', // MCP handlers may have placeholder async

            // Security
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
        },
    },

    // Unit tests (Vitest) - 2-space indent
    // Tests run in happy-dom which provides browser globals
    {
        files: ['tests/unit/**/*.js', 'tests/unit/**/*.test.js', '**/*.test.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
                // Vitest globals
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                vi: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                // Additional browser APIs used in tests
                global: 'readonly',
            },
        },
        rules: {
            // Relaxed rules for tests
            'no-unused-vars': 'off',
            'require-await': 'off',
            indent: ['error', 2, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
        },
    },

    // TypeScript (Playwright E2E specs) - parsing only
    // We only need the parser to avoid syntax errors on ':' types, etc.
    {
        files: ['tests/**/*.spec.ts', 'tests/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            parser: tsParser,
            parserOptions: {
                ecmaFeatures: {
                    jsx: false,
                },
            },
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: {
            'no-unused-vars': 'off',
            'require-await': 'off',
            indent: ['error', 2, { SwitchCase: 1 }],
        },
    },

    // E2E tests (Playwright) - 2-space indent
    {
        files: ['tests/**/*.spec.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: {
            'no-unused-vars': 'off',
            'require-await': 'off',
            indent: ['error', 2, { SwitchCase: 1 }],
        },
    },

    // Architecture tests - 2-space indent
    {
        files: ['tests/architecture/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': 'off',
            'require-await': 'off',
            indent: ['error', 2, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
        },
    },

    // MCP server tests (Node.js test runner) - 2-space indent
    {
        files: ['mcp-server/tests/**/*.js', 'mcp-server/tests/**/*.test.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                // Node.js test runner globals
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                before: 'readonly',
                after: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': 'off',
            'require-await': 'off',
            indent: ['error', 2, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
        },
    },

    // Cloudflare Workers - 2-space indent, Worker runtime globals
    {
        files: ['workers/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Cloudflare Worker globals
                fetch: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                Headers: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                crypto: 'readonly',
                console: 'readonly',
                // Worker-specific
                caches: 'readonly',
                self: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            'no-console': 'off',
            indent: ['error', 2, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
            'comma-dangle': ['error', 'only-multiline'],
            'arrow-parens': ['error', 'as-needed'],
            'no-var': 'error',
            'prefer-const': 'error',
        },
    },

    // Integration tests and other test files
    {
        files: ['tests/integration/**/*.js', 'tests/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
                global: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': 'off',
            'require-await': 'off',
            indent: ['error', 2, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
        },
    },
];
