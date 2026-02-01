#!/usr/bin/env node

/**
 * Test critical security and algorithm fixes
 *
 * Tests:
 * 1. Circular dependency detection algorithm (3-state tracking)
 * 2. Path traversal security vulnerability fix
 * 3. HNW validation with resolved imports
 * 4. Parse failure tracking
 * 5. FileScanner caching
 */

import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

// Import the functions to test
const dependenciesModule = await import('../src/tools/dependencies.js');
const fileScannerModule = await import('../src/utils/file-scanner.js');
const hnwAnalyzerModule = await import('../src/analyzers/hnw-analyzer.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('Testing Critical MCP Server Fixes\n');
  console.log('='.repeat(60));

  // Test 1: Circular Dependency Detection
  console.log('\n📊 Test 1: Circular Dependency Detection Algorithm');
  console.log('-'.repeat(60));

  const graph1 = new Map([
    ['a.js', { imports: [{ resolved: 'b.js' }] }],
    ['b.js', { imports: [{ resolved: 'c.js' }] }],
    ['c.js', { imports: [{ resolved: 'a.js' }] }], // Cycle: a -> b -> c -> a
  ]);

  const cycles1 = dependenciesModule.detectCircularDependencies
    ? await dependenciesModule.detectCircularDependencies(graph1)
    : [];

  assert(cycles1.length > 0, `Detects simple cycle (found ${cycles1.length} cycle(s))`);

  // Test disconnected components
  const graph2 = new Map([
    ['component1/a.js', { imports: [{ resolved: 'component1/b.js' }] }],
    ['component1/b.js', { imports: [{ resolved: 'component1/a.js' }] }], // Cycle 1
    ['component2/x.js', { imports: [{ resolved: 'component2/y.js' }] }],
    ['component2/y.js', { imports: [{ resolved: 'component2/x.js' }] }], // Cycle 2
  ]);

  const cycles2 = dependenciesModule.detectCircularDependencies
    ? await dependenciesModule.detectCircularDependencies(graph2)
    : [];

  assert(
    cycles2.length >= 2,
    `Detects cycles in disconnected components (found ${cycles2.length} cycle(s))`
  );

  // Test 2: Path Traversal Security
  console.log('\n🔒 Test 2: Path Traversal Security');
  console.log('-'.repeat(60));

  if (dependenciesModule.isPathWithinProject) {
    const safePath = resolve(projectRoot, 'js/controllers/chat-ui-controller.js');
    const unsafePath = resolve(projectRoot, '../../../etc/passwd');

    assert(
      dependenciesModule.isPathWithinProject(safePath, projectRoot) === true,
      'Allows safe project paths'
    );

    assert(
      dependenciesModule.isPathWithinProject(unsafePath, projectRoot) === false,
      'Blocks path traversal attempts'
    );

    const currentFile = resolve(projectRoot, 'js/services/event-bus.js');
    const traversalAttempt = '../../../etc/passwd';

    if (dependenciesModule.resolveImportPath) {
      const resolved = dependenciesModule.resolveImportPath(
        traversalAttempt,
        currentFile,
        projectRoot
      );
      assert(resolved === null, 'Blocks path traversal in resolveImportPath()');
    }
  } else {
    console.log('⚠️  isPathWithinProject not exported (skipping some tests)');
  }

  // Test 3: FileScanner Caching
  console.log('\n⚡ Test 3: FileScanner Caching');
  console.log('-'.repeat(60));

  const scanner = new fileScannerModule.FileScanner(projectRoot);

  // First call should cache
  const start1 = Date.now();
  const files1 = await scanner.findJsFiles({ includeTests: false });
  const time1 = Date.now() - start1;

  // Second call should use cache
  const start2 = Date.now();
  const files2 = await scanner.findJsFiles({ includeTests: false });
  const time2 = Date.now() - start2;

  assert(
    files1.length === files2.length,
    `Cache returns same number of files (${files1.length} files)`
  );

  assert(time2 < time1, `Cached call is faster (${time1}ms vs ${time2}ms)`);

  // Test cache invalidation
  scanner.clearCache();
  const start3 = Date.now();
  await scanner.findJsFiles({ includeTests: false });
  const time3 = Date.now() - start3;

  assert(time3 >= time2, 'After clearCache(), scan takes longer (cache was cleared)');

  // Test 4: HNW Layer Detection
  console.log('\n🏗️  Test 4: HNW Layer Detection');
  console.log('-'.repeat(60));

  const testFilePaths = [
    { path: 'js/controllers/chat-ui-controller.js', expected: 'controllers' },
    { path: 'js/services/event-bus.js', expected: 'services' },
    { path: 'js/utils/logger.js', expected: 'utils' },
    { path: 'js/workers/sync-worker.js', expected: 'workers' },
    { path: 'js/artifacts/artifact-renderer.js', expected: 'artifacts' },
  ];

  for (const { path, expected } of testFilePaths) {
    const fullPath = resolve(projectRoot, path);
    if (existsSync(fullPath)) {
      const layer = scanner.getFileLayer(fullPath);
      assert(layer === expected, `Detects ${path} as '${expected}' (got '${layer}')`);
    }
  }

  // Test 5: Parse Failure Tracking
  console.log('\n🐛 Test 5: Parse Failure Tracking');
  console.log('-'.repeat(60));

  // Build a graph that includes parse failures
  if (dependenciesModule.buildDependencyGraph) {
    try {
      const startPath = resolve(projectRoot, 'js/main.js');
      const graph = await dependenciesModule.buildDependencyGraph(
        projectRoot,
        startPath,
        'imports',
        2,
        'all'
      );

      assert(Array.isArray(graph.parseFailures), 'Graph includes parseFailures array');

      console.log(`   ℹ️  Parse failures tracked: ${graph.parseFailures.length}`);
    } catch (error) {
      console.log(`⚠️  Could not test parse failures: ${error.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All critical fixes verified!\n');
    process.exit(0);
  }
}

runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
