#!/usr/bin/env node

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', '.mcp-cache', 'vectors.db');

const db = new Database(dbPath, { readonly: true });

console.log('=== Database Statistics ===\n');

// Basic counts
const statsStmt = db.prepare(`
  SELECT
    'Code chunks' as label, COUNT(*) as count FROM chunk_metadata
  UNION ALL
  SELECT 'Docs chunks', COUNT(*) FROM chunk_metadata_docs
  UNION ALL
  SELECT 'Symbols', COUNT(*) FROM symbols
  UNION ALL
  SELECT 'Symbol usages', COUNT(*) FROM symbol_usages
  UNION ALL
  SELECT 'File index', COUNT(*) FROM file_index
  UNION ALL
  SELECT 'Vector chunks (code)', (SELECT COUNT(*) FROM vec_chunks_chunks)
  UNION ALL
  SELECT 'Vector chunks (docs)', (SELECT COUNT(*) FROM vec_chunks_docs_chunks)
`);

const stats = statsStmt.all();
stats.forEach(row => {
  console.log(`${row.label}: ${row.count}`);
});

console.log('\n=== FTS5 Tables ===\n');

const ftsTablesStmt = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table'
    AND name LIKE '%fts%'
  ORDER BY name
`);

const ftsTables = ftsTablesStmt.all();
ftsTables.forEach(row => {
  const name = row.name;
  try {
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM ${name}`);
    const count = countStmt.get();
    console.log(`${name}: ${count.count} rows`);
  } catch (error) {
    console.log(`${name}: ERROR - ${error.message}`);
  }
});

console.log('\n=== Data Integrity Checks ===\n');

// Check for orphaned records
const integrityChecks = [
  {
    name: 'Orphaned vector chunks (code)',
    query: `SELECT COUNT(*) FROM vec_chunks_chunks
            WHERE chunk_id NOT IN (SELECT CAST(vec_rowid as TEXT) FROM chunk_metadata WHERE vec_rowid IS NOT NULL)`
  },
  {
    name: 'Orphaned metadata (code)',
    query: `SELECT COUNT(*) FROM chunk_metadata
            WHERE vec_rowid IS NOT NULL
            AND CAST(vec_rowid as TEXT) NOT IN (SELECT chunk_id FROM vec_chunks_chunks)`
  },
  {
    name: 'Orphaned vector chunks (docs)',
    query: `SELECT COUNT(*) FROM vec_chunks_docs_chunks
            WHERE chunk_id NOT IN (SELECT CAST(vec_rowid as TEXT) FROM chunk_metadata_docs WHERE vec_rowid IS NOT NULL)`
  },
  {
    name: 'Orphaned metadata (docs)',
    query: `SELECT COUNT(*) FROM chunk_metadata_docs
            WHERE vec_rowid IS NOT NULL
            AND CAST(vec_rowid as TEXT) NOT IN (SELECT chunk_id FROM vec_chunks_docs_chunks)`
  },
  {
    name: 'Symbols without chunks',
    query: `SELECT COUNT(*) FROM symbols
            WHERE chunk_id NOT IN (SELECT chunk_id FROM chunk_metadata)`
  }
];

integrityChecks.forEach(({ name, query }) => {
  try {
    const stmt = db.prepare(query);
    const result = stmt.get();
    console.log(`${name}: ${Object.values(result)[0]}`);
  } catch (error) {
    console.log(`${name}: ERROR - ${error.message}`);
  }
});

console.log('\n=== Migration Status ===\n');

const migrationStmt = db.prepare(`SELECT value FROM _metadata WHERE key='migration_version'`);
const migration = migrationStmt.get();
console.log(`Migration version: ${migration ? migration.value : 'Not found'}`);

db.close();
