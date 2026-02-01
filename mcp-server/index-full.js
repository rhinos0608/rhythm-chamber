/**
 * Full codebase indexing test
 */

import { CodeIndexer } from './src/semantic/indexer.js';

async function main() {
  const indexer = new CodeIndexer(process.cwd(), {
    cacheDir: '.mcp-cache',
    patterns: ['js/**/*.js', 'mcp-server/src/**/*.js'],
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.mcp-cache/**',
      '**/*.test.js',
      '**/*.spec.js',
      '**/coverage/**',
    ],
  });

  console.error('=== Full Codebase Indexing ===\n');
  await indexer.initialize();

  const startTime = Date.now();
  const stats = await indexer.indexAll({ force: false });
  const elapsed = Date.now() - startTime;

  console.error('\n✓ Complete!');
  console.error(`  Files: ${stats.filesIndexed} new, ${stats.filesFromCache} cached`);
  console.error(`  Chunks: ${stats.chunksIndexed}`);
  console.error(`  Time: ${(elapsed / 1000).toFixed(2)}s`);

  const finalStats = indexer.getStats();
  console.error('\nVector Store:');
  console.error(`  Chunks: ${finalStats.vectorStore.chunkCount}`);
  console.error(`  Memory: ${(finalStats.vectorStore.memoryBytes / 1024 / 1024).toFixed(2)} MB`);

  console.error('\nCache:');
  console.error(`  Files: ${finalStats.cache.fileCount}`);
  console.error(`  Chunks: ${finalStats.cache.chunkCount}`);
  console.error(`  Size: ${(finalStats.cache.approximateSize / 1024 / 1024).toFixed(2)} MB`);

  // Test search
  console.error('\n=== Testing Semantic Search ===\n');
  const results = await indexer.search('session management', { limit: 3 });
  console.error('Query: "session management"');
  console.error(`Results: ${results.length}\n`);

  for (const r of results) {
    console.error(`  • ${r.metadata?.name || r.chunkId}`);
    console.error(`    File: ${r.metadata?.file}`);
    console.error(`    Similarity: ${(r.similarity * 100).toFixed(0)}%\n`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
