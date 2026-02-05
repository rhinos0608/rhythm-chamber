#!/usr/bin/env node
/* global console, process, setTimeout */

/**
 * Check Indexing Status
 *
 * Directly checks the status of the semantic indexing system
 * without requiring MCP client connection.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the indexer directly
import { CodeIndexer } from '../src/semantic/indexer.js';

async function main() {
  console.log('=== Rhythm Chamber Semantic Indexer Status ===\n');

  const projectRoot = join(__dirname, '..');
  // Cache is in the root rhythm-chamber directory, not in mcp-server
  const cacheDir = join(projectRoot, '.mcp-cache');

  // Check cache files
  console.log('Cache Files:');
  const cacheFiles = [
    'model-config.json',
    'semantic-embeddings.json',
    'vectors.db'
  ];

  for (const file of cacheFiles) {
    const path = join(cacheDir, file);
    if (existsSync(path)) {
      const stats = statSync(path);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`  ✓ ${file}: ${sizeKB} KB`);
    } else {
      console.log(`  ✗ ${file}: Not found`);
    }
  }

  console.log('\nInitializing Indexer...');

  const indexer = new CodeIndexer(projectRoot, {
    cacheDir,
    semanticSearch: true,
  });

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get stats
  const stats = indexer.getStats();
  console.log('\nIndexer Statistics:');
  console.log(`  Status: ${stats.status || 'Unknown'}`);
  console.log(`  Total files discovered: ${stats.totalFiles || 0}`);
  console.log(`  Files indexed: ${stats.indexedFiles || 0}`);
  console.log(`  Failed files: ${stats.failedFiles || 0}`);
  console.log(`  Total chunks: ${stats.totalChunks || 0}`);

  // Check vector store
  const vectorStoreStats = indexer.vectorStore?.getStats();
  if (vectorStoreStats) {
    console.log('\nVector Store:');
    console.log(`  Storage Type: ${vectorStoreStats.storageType || 'Unknown'}`);
    console.log(`  Total Chunks: ${vectorStoreStats.chunkCount || 0}`);
    console.log(`  Dimension: ${vectorStoreStats.dimension || 0}`);
    console.log(`  Memory: ${((vectorStoreStats.memoryBytes || 0) / 1024 / 1024).toFixed(2)} MB`);

    if (vectorStoreStats.dbPath) {
      const dbExists = existsSync(vectorStoreStats.dbPath);
      console.log(`  Database: ${vectorStoreStats.dbPath}`);
      console.log(`  Database exists: ${dbExists ? 'Yes' : 'No'}`);

      if (dbExists) {
        const dbStats = statSync(vectorStoreStats.dbPath);
        const dbSizeMB = (dbStats.size / 1024 / 1024).toFixed(2);
        console.log(`  Database Size: ${dbSizeMB} MB`);
      }
    }
  }

  // Check migration state
  if (vectorStoreStats?.useSqlite) {
    console.log('\n✓ Using SQLite backend (tiered storage active)');
  } else {
    console.log('\n✓ Using in-memory Map backend');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Status check complete!');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
