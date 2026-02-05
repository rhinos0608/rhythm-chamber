#!/usr/bin/env node

import CodeIndexer from '../src/semantic/indexer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('=== Performance Benchmarks ===\n');

const projectRoot = path.join(__dirname, '..', '..');
const indexer = new CodeIndexer(projectRoot);

try {
  await indexer.initialize();

  // Trigger indexing if needed
  console.log('Checking if indexing is needed...');
  const filesDiscovered = await indexer.discoverFiles();
  console.log(`Files discovered: ${filesDiscovered.length}`);

  if (filesDiscovered.length > 0) {
    console.log('Indexing files...');
    await indexer.indexAll();
  }

  console.log('\n=== Running Benchmarks ===\n');

  // Test 1: Code-only semantic search
  console.time('code-search');
  const codeResults = await indexer.search('event bus', { indexType: 'code', limit: 10 });
  console.timeEnd('code-search');
  console.log(`  Results: ${codeResults.length}\n`);

  // Test 2: Docs-only semantic search
  console.time('docs-search');
  const docsResults = await indexer.search('authentication', { indexType: 'docs', limit: 10 });
  console.timeEnd('docs-search');
  console.log(`  Results: ${docsResults.length}\n`);

  // Test 3: General search
  console.time('general-search');
  const generalResults = await indexer.search('handleMessage function', { limit: 10 });
  console.timeEnd('general-search');
  console.log(`  Results: ${generalResults.length}\n`);

  // Test 4: Multiple sequential searches
  console.time('sequential-searches');
  const queries = ['event bus', 'authentication', 'session', 'database', 'api'];
  const sequentialResults = [];
  for (const query of queries) {
    const results = await indexer.search(query, { limit: 5 });
    sequentialResults.push(results.length);
  }
  console.timeEnd('sequential-searches');
  console.log(`  Total results: ${sequentialResults.reduce((a, b) => a + b, 0)}\n`);

  // Test 5: Parallel searches
  console.time('parallel-searches');
  const parallelPromises = queries.map(q => indexer.search(q, { limit: 5 }));
  const parallelResults = await Promise.all(parallelPromises);
  console.timeEnd('parallel-searches');
  console.log(`  Total results: ${parallelResults.reduce((sum, r) => sum + r.length, 0)}\n`);

  console.log('=== Performance Targets ===\n');
  console.log('Code search: < 50ms');
  console.log('Docs search: < 50ms');
  console.log('General search: < 100ms');
  console.log('Sequential searches (5): < 500ms');
  console.log('Parallel searches (5): < 200ms\n');

} finally {
  await indexer.close();
}
