#!/usr/bin/env node

/**
 * Codebase Intelligence Index Generator
 *
 * Processes all JavaScript/TypeScript files to extract exports and imports
 * for codebase intelligence indexing.
 *
 * Updated to use @babel/parser for reliable AST-based extraction instead of fragile regex.
 */

const fs = require('fs');
const path = require('path');

// File list from the user request
const FILES = [
  './js/app.js',
  './js/cards.js',
  './js/chat.js',
  './js/config.example.js',
  './js/config.js',
  './js/context-aware-recovery.js',
  './js/controllers/chat-ui-controller.js',
  './js/controllers/demo-controller.js',
  './controllers/file-upload-controller.js',
  './js/controllers/observability-controller.js',
  './js/controllers/reset-controller.js',
  './js/controllers/sidebar-controller.js',
  './js/controllers/spotify-controller.js',
  './js/controllers/view-controller.js',
  './js/data-query.js',
  './js/demo-data.js',
  './js/embedding-worker.js',
  './js/embeddings/embeddings-onboarding.js',
  './js/embeddings/embeddings-progress.js',
  './js/embeddings/embeddings-task-manager.js',
  './js/functions/executors/analytics-executors.js',
  './js/functions/executors/data-executors.js',
  './js/functions/executors/template-executors.js',
  './js/functions/index.js',
  './js/functions/schemas/analytics-queries.js',
  './js/functions/schemas/data-queries.js',
  './js/functions/schemas/template-queries.js',
  './js/functions/schemas/universal-schema.js',
  './js/functions/utils/retry.js',
  './js/functions/utils/validation.js',
  './js/genre-enrichment.js',
  './js/local-embeddings.js',
  './js/local-vector-store.js',
  './js/main.js',
  './js/module-registry.js',
  './js/observability/core-web-vitals.js',
  './js/observability/init-observability.js',
  './js/observability/metrics-exporter.js',
  './js/observability/observability-settings.js',
  './js/ollama.js',
  './js/operation-lock-errors.js',
  './js/operation-lock.js',
  './js/operation-queue.js',
  './js/parser-worker.js',
  './js/parser.js',
  './js/patterns.js',
  './js/payments.js',
  './js/personality.js',
  './js/pricing.js',
  './js/profile-synthesizer.js',
  './js/prompts.js',
  './js/providers/capabilities.js',
  './js/providers/data-provider-interface.js',
  './js/providers/demo-data-provider.js',
  './js/providers/gemini.js',
  './js/providers/lmstudio.js',
  './js/providers/ollama-adapter.js',
  './js/providers/openrouter.js',
  './js/providers/provider-interface.js',
  './js/providers/user-data-provider.js',
  './js/rag.js',
  './js/security.js',
  './js/security/anomaly.js',
  './js/security/checklist.js',
  './js/security/encryption.js',
  './js/security/index.js',
  './js/security/key-manager.js',
  './js/security/message-security.js',
  './js/security/recovery-handlers.js',
  './js/security/safe-mode.js',
  './js/security/secure-token-store.js',
  './js/security/security-coordinator.js',
  './js/security/storage-encryption.js',
  './js/security/token-binding.js',
  './js/services/battery-aware-mode-selector.js',
  './js/services/cascading-abort-controller.js',
  './js/services/circuit-breaker.js',
  './js/services/config-loader.js',
  './js/services/conversation-orchestrator.js',
  './js/services/data-version.js',
  './js/services/device-detection.js',
  './js/services/error-boundary.js',
  './js/services/error-recovery-coordinator.js',
  './js/services/event-bus.js',
  './js/services/fallback-response-service.js',
  './js/services/function-calling-fallback.js',
  './js/services/llm-provider-routing-service.js',
  './js/services/lock-policy-coordinator.js',
  './js/services/message-lifecycle-coordinator.js',
  './js/services/message-operations.js',
  './js/services/pattern-comparison.js',
  './js/services/pattern-stream.js',
  './js/services/performance-profiler.js',
  './js/services/playlist-generator.js',
  './js/services/profile-description-generator.js',
  './js/services/profile-sharing.js',
  './js/services/provider-circuit-breaker.js',
  './js/services/provider-fallback-chain.js',
  './js/services/provider-health-authority.js',
  './js/services/provider-health-monitor.js',
  './js/services/provider-notification-service.js',
  './js/services/session-manager.js',
  './js/services/state-machine-coordinator.js',
  './js/services/storage-degradation-manager.js',
  './js/services/tab-coordination.js',
  './js/services/temporal-analysis.js',
  './js/services/timeout-budget-manager.js',
  './js/services/token-counting-service.js',
  './js/services/tool-call-handling-service.js',
  './js/services/tool-strategies/base-strategy.js',
  './js/services/tool-strategies/index.js',
  './js/services/tool-strategies/intent-extraction-strategy.js',
  './js/services/tool-strategies/native-strategy.js',
  './js/services/tool-strategies/prompt-injection-strategy.js',
  './js/services/turn-queue.js',
  './js/services/vector-clock.js',
  './js/services/wave-telemetry.js',
  './js/services/worker-coordinator.js',
  './js/settings.js',
  './js/spotify.js',
  './js/state/app-state.js',
  './js/storage-breakdown-ui.js',
  './js/storage.js',
  './js/storage/archive-service.js',
  './js/storage/config-api.js',
  './js/storage/event-log-store.js',
  './js/storage/indexeddb.js',
  './js/storage/keys.js',
  './js/storage/lru-cache.js',
  './js/storage/migration.js',
  './js/storage/profiles.js',
  './js/storage/quota-manager.js',
  './js/storage/quota-monitor.js',
  './js/storage/sync-strategy.js',
  './js/storage/transaction.js',
  './js/storage/write-ahead-log.js',
  './js/template-profiles.js',
  './js/token-counter.js',
  './js/utils.js',
  './js/utils/timeout-wrapper.js',
  './js/window-globals-debug.js',
  './js/workers/pattern-worker-pool.js',
  './js/workers/pattern-worker.js',
  './js/workers/shared-worker-coordinator.js',
  './js/workers/shared-worker.js',
  './js/workers/vector-search-worker.js',
  './playwright.config.ts',
  './scripts/dev-server-with-coop-coep.mjs',
  './scripts/lint-window-globals.mjs',
  './test_ghosted_fix.js',
  './tests/integration/keymanager-browser-test.js',
  './tests/integration/keymanager-integration-test.js',
  './tests/integration/storage-encryption-test.js',
  './tests/integration/storage-integration.test.js',
  './tests/rhythm-chamber.spec.ts',
  './tests/token-counter-test.js',
  './tests/unit/chat-queue.test.js',
  './tests/unit/chat-timeout-budget.test.js',
  './tests/unit/config-loader.test.js',
  './tests/unit/data-provider.test.js',
  './tests/unit/embeddings-checkpoint.test.js',
  './tests/unit/error-boundary.test.js',
  './tests/unit/event-bus.test.js',
  './tests/unit/event-log-store.test.js',
  './tests/unit/eventbus-replay.test.js',
  './tests/unit/hnw-improvements.test.js',
  './tests/unit/hnw-structural.test.js',
  './tests/unit/indexeddb-retry.test.js',
  './tests/unit/local-vector-store.test.js',
  './tests/unit/lock-policy-hierarchy.test.js',
  './tests/unit/lru-cache.test.js',
  './tests/unit/observability/core-web-vitals.test.js',
  './tests/unit/observability/metrics-exporter.test.js',
  './tests/unit/observability/performance-profiler.test.js',
  './tests/unit/operation-lock.test.js',
  './tests/unit/pattern-stream.test.js',
  './tests/unit/patterns.test.js',
  './tests/unit/phase2-services.test.js',
  './tests/unit/pricing.test.js',
  './tests/unit/provider-circuit-breaker.test.js',
  './tests/unit/provider-health-monitor.test.js',
  './tests/unit/provider-notification-service.test.js',
  './tests/unit/quota-manager.test.js',
  './tests/unit/schema-adapters.test.js',
  './tests/unit/schemas.test.js',
  './tests/unit/secure-token-store.test.js',
  './tests/unit/storage-migration.test.js',
  './tests/unit/storage-transaction.test.js',
  './tests/unit/tab-coordination.test.js',
  './tests/unit/tab-coordinator-watermark.test.js',
  './tests/unit/timeout-wrapper.test.js',
  './tests/unit/token-binding.test.js',
  './tests/unit/vector-clock.test.js',
  './tests/unit/vitest-setup.js',
  './vitest.config.js'
];

// Try to use @babel/parser for AST-based extraction; fall back to regex if unavailable
let useParser = true;
let parser;

try {
  // eslint-disable-next-line global-require
  parser = require('@babel/parser');
} catch (e) {
  console.warn('[build-index] @babel/parser not available, falling back to regex-based extraction');
  useParser = false;
}

/**
 * Extract exports from file content using AST parser
 * Falls back to regex if parser unavailable
 */
function extractExports(content) {
  const exports = new Set();

  if (useParser) {
    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        errorRecovery: true
      });

      // Traverse the AST to find all export declarations
      for (const statement of ast.program.body) {
        if (statement.type === 'ExportNamedDeclaration') {
          // export { foo, bar as baz }
          for (const specifier of statement.specifiers) {
            exports.add(specifier.exported.name);
          }
        } else if (statement.type === 'ExportDefaultDeclaration') {
          // export default ...
          const decl = statement.declaration;
          if (decl) {
            if (decl.type === 'Identifier') {
              exports.add(decl.name);
            } else if (decl.type === 'FunctionDeclaration' && decl.id) {
              exports.add(decl.id.name);
            } else if (decl.type === 'ClassDeclaration' && decl.id) {
              exports.add(decl.id.name);
            }
            // Anonymous default exports are skipped (not captured)
          }
        } else if (statement.type === 'ExportAllDeclaration') {
          // export * from 'foo' - re-export, skip for now
          continue;
        }
      }

      // Also check for CommonJS module.exports
      for (const statement of ast.program.body) {
        if (statement.type === 'ExpressionStatement') {
          const expr = statement.expression;
          if (expr.type === 'AssignmentExpression' &&
              expr.left.type === 'MemberExpression' &&
              expr.left.object && expr.left.object.name === 'module' &&
              expr.left.property && expr.left.property.name === 'exports') {
            // module.exports = foo
            if (expr.right && expr.right.type === 'Identifier') {
              exports.add(expr.right.name);
            } else if (expr.right && expr.right.type === 'ObjectExpression') {
              // module.exports = { foo, bar }
              for (const prop of expr.right.properties) {
                if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                  exports.add(prop.key.name);
                }
              }
            }
          }
        }
      }

      return Array.from(exports);
    } catch (parseError) {
      console.warn(`[build-index] AST parsing failed, falling back to regex: ${parseError.message}`);
      // Fall through to regex-based extraction
    }
  }

  // Regex-based fallback (original logic with fixes)
  const EXPORT_PATTERNS = [
    // Named exports: export { foo, bar }
    /export\s*\{([^}]+)\}/g,
    // Declaration exports: export const foo = ..., export function bar() {}, export class Baz {}
    /export\s+(?:const|let|var|function\*?|async\s+function|class)\s+(\w+)/g,
    // Default exports: export default function foo() {}, export default class Bar {}
    // Updated: Only capture named exports, require the name to be present
    /export\s+default\s+(?:function\s*\*?\s*|class\s+)(\w+)/g,
    // CommonJS object: module.exports = { foo, bar }
    /module\.exports\s*=\s*\{([^}]+)\}/g,
    // CommonJS single: module.exports = foo
    // Updated: Accept EOF without semicolon
    /module\.exports\s*=\s*(\w+)(?:\s*[;\n]|$)/g,
    // TypeScript exports: export type Foo, export interface Bar
    /export\s+(?:type|interface)\s+(\w+)/g
  ];

  for (const pattern of EXPORT_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        // Handle comma-separated exports with alias support
        const items = match[1].split(',').map(item => item.trim());
        items.forEach(item => {
          // Remove comments and default keywords
          const cleaned = item.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
          if (cleaned && cleaned !== 'default') {
            // Handle "export as" aliasing
            const aliasMatch = cleaned.match(/^(.+?)\s+as\s+(.+)$/i);
            if (aliasMatch) {
              exports.add(aliasMatch[2]);
            } else {
              exports.add(cleaned);
            }
          }
        });
      } else if (match[0]) {
        // For pattern that matched entire export, try to extract name
        const namedMatch = match[0].match(/(?:export|module\.exports)\s+(?:const|let|var|function|class|type|interface)\s+(\w+)/);
        if (namedMatch) {
          exports.add(namedMatch[1]);
        }
      }
    }
  }

  return Array.from(exports);
}

/**
 * Extract imports from file content
 */
function extractImports(content) {
  const imports = new Set();

  // Try AST-based extraction first
  if (useParser) {
    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        errorRecovery: true
      });

      for (const statement of ast.program.body) {
        if (statement.type === 'ImportDeclaration') {
          if (statement.source) {
            // Remove any query parameters and get relative path
            const sourceValue = statement.source.value;
            imports.add(sourceValue);
          }
        }
      }

      // Also check for CommonJS require() calls
      for (const statement of ast.program.body) {
        if (statement.type === 'ExpressionStatement') {
          const expr = statement.expression;
          if (expr.type === 'CallExpression' &&
              expr.callee && expr.callee.name === 'require' &&
              expr.arguments.length > 0) {
            const arg = expr.arguments[0];
            if (arg.type === 'StringLiteral') {
              imports.add(arg.value);
            }
          }
        }
      }

      return Array.from(imports);
    } catch (parseError) {
      console.warn(`[build-index] AST import parsing failed, falling back to regex: ${parseError.message}`);
      // Fall through to regex
    }
  }

  // Regex-based fallback
  const IMPORT_PATTERNS = [
    // ES6 imports: import { foo, bar } from 'baz', import foo from 'bar', import * as foo from 'bar'
    /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
    // Side-effect imports: import 'foo'
    /import\s+['"]([^'"]+)['"]/g,
    // CommonJS requires: require('foo')
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  for (const pattern of IMPORT_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        imports.add(match[1]);
      }
    }
  }

  return Array.from(imports);
}

/**
 * Get relative path from project root for a file
 */
function getRelativePath(absolutePath) {
  const rootDir = process.cwd();
  if (absolutePath.startsWith(rootDir)) {
    return path.relative(rootDir, absolutePath);
  }
  return absolutePath;
}

/**
 * Process a single file
 * @param {string} filePath - Absolute path to the file
 */
function processFile(filePath) {
  const isAbsolute = path.isAbsolute(filePath);

  if (!isAbsolute) {
    filePath = path.resolve(process.cwd(), filePath);
  }

  if (!fs.existsSync(filePath)) {
    return {
      exports: [],
      imports: [],
      error: 'File not found',
      indexed: Date.now()
    };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const exports = extractExports(content);
    const imports = extractImports(content).filter(imp => {
      // Filter out self-imports (imports that match the current file path)
      const impPath = path.resolve(process.cwd(), imp);
      return impPath !== filePath;
    });

    return {
      exports,
      imports,
      indexed: Date.now()
    };
  } catch (error) {
    return {
      exports: [],
      imports: [],
      error: error.message,
      indexed: Date.now()
    };
  }
}

/**
 * Main execution
 */
function main() {
  const startTime = Date.now();
  console.log('Processing files...');

  const result = {
    version: 1,
    updated: startTime,
    files: {}
  };

  for (const file of FILES) {
    const absolutePath = path.resolve(process.cwd(), file);
    console.log(`Processing: ${file}`);
    // Use absolute path as key, pass absolute path to processFile
    result.files[absolutePath] = processFile(absolutePath);
  }

  // Convert absolute path keys to relative paths
  const relativeResult = {
    ...result,
    files: {}
  };

  for (const [absolutePath, data] of Object.entries(result.files)) {
    const relativePath = getRelativePath(absolutePath);
    relativeResult.files[relativePath] = data;
  }

  const outputPath = path.join(__dirname, 'codebase-index.json');
  fs.writeFileSync(outputPath, JSON.stringify(relativeResult, null, 2));

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nComplete! Processed ${FILES.length} files in ${duration}s`);
  console.log(`Index written to: ${outputPath}`);

  // Print summary
  let totalExports = 0;
  let totalImports = 0;
  let errorCount = 0;

  for (const [filePath, data] of Object.entries(relativeResult.files)) {
    totalExports += data.exports.length;
    totalImports += data.imports.length;
    if (data.error) errorCount++;
  }

  console.log(`\nSummary:`);
  console.log(`- Total exports: ${totalExports}`);
  console.log(`- Total imports: ${totalImports}`);
  console.log(`- Files with errors: ${errorCount}`);

  return relativeResult;
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { processFile, extractExports, extractImports, main };
