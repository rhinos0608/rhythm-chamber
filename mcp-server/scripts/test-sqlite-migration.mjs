#!/usr/bin/env node
/**
 * SQLite Migration Integration Test
 *
 * Tests the automatic migration from Map to sqlite-vec storage.
 * This simulates the OOM scenario at 423+ files (~5000 chunks).
 *
 * Run with: node scripts/test-sqlite-migration.mjs
 */

/* eslint-disable no-process-ex, no-empty */
import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import from mcp-server source
import { VectorStore } from '../src/semantic/vector-store.js';

/**
 * Configuration
 */
const CONFIG = {
    // Test scenarios
    scenarios: [
        {
            name: 'Small dataset (no migration)',
            chunkCount: 100,
            expectMigration: false,
        },
        {
            name: 'At migration threshold',
            chunkCount: 5000,
            expectMigration: true,
        },
        {
            name: 'OOM scenario (423+ files)',
            chunkCount: 20000, // Simulates large codebase
            expectMigration: true,
        },
    ],
    // Embedding dimension
    dimension: 768,
    // Migration threshold
    migrationThreshold: 5000,
};

/**
 * Create a test VectorStore instance
 */
function createTestStore(dbPath) {
    return new VectorStore({
        dimension: CONFIG.dimension,
        dbPath,
        migrationThreshold: CONFIG.migrationThreshold,
    });
}

/**
 * Generate test embeddings
 */
function generateEmbedding(chunkId) {
    // Generate deterministic embeddings based on chunkId
    const embedding = new Float32Array(CONFIG.dimension);
    for (let i = 0; i < CONFIG.dimension; i++) {
        // Use chunkId to create unique but reproducible values
        embedding[i] = ((chunkId + i) % 100) / 100;
    }
    return embedding;
}

/**
 * Generate test metadata
 */
function generateMetadata(chunkId) {
    return {
        text: `Test chunk ${chunkId}`,
        name: `testFunction_${chunkId}`,
        type: chunkId % 3 === 0 ? 'class' : 'function',
        file: `test_file_${Math.floor(chunkId / 10)}.js`,
        line: chunkId % 1000,
        exported: chunkId % 2 === 0,
        layer: ['services', 'controllers', 'utils'][chunkId % 3],
    };
}

/**
 * Run a test scenario
 */
async function runScenario(scenario) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Scenario: ${scenario.name}`);
    console.log(`${'='.repeat(60)}`);

    // Create temp database path
    const dbPath = join(tmpdir(), `test-migration-${Date.now()}.db`);

    try {
        const store = createTestStore(dbPath);

        console.log(`\nInserting ${scenario.chunkCount} chunks...`);
        const startTime = Date.now();

        // Insert chunks in batches
        const batchSize = 100;
        for (let i = 0; i < scenario.chunkCount; i += batchSize) {
            const batchEnd = Math.min(i + batchSize, scenario.chunkCount);

            for (let j = i; j < batchEnd; j++) {
                const embedding = generateEmbedding(j);
                const metadata = generateMetadata(j);
                store.upsert(`chunk_${j}`, embedding, metadata);
            }

            // Progress indicator
            if (batchEnd % 1000 === 0 || batchEnd === scenario.chunkCount) {
                const progress = ((batchEnd / scenario.chunkCount) * 100).toFixed(1);
                console.log(`  Progress: ${batchEnd}/${scenario.chunkCount} (${progress}%)`);
            }
        }

        const insertTime = Date.now() - startTime;
        console.log(`Insert completed in ${insertTime}ms`);
        console.log(`Average: ${(insertTime / scenario.chunkCount).toFixed(2)}ms per chunk`);

        // Check migration status
        const stats = store.getStats();
        console.log(`\nStorage type: ${stats.storageType}`);
        console.log(`Total chunks: ${stats.chunkCount}`);
        console.log(`Database size: ${(stats.dbSizeBytes / 1024 / 1024).toFixed(2)} MB`);

        // Verify migration expectation
        const migrated = stats.storageType === 'sqlite-vec';
        if (migrated !== scenario.expectMigration) {
            throw new Error(
                `Migration expectation failed: expected ${scenario.expectMigration}, got ${migrated}`
            );
        }
        console.log(`✓ Migration status: ${migrated ? 'Migrated' : 'Not migrated'}`);

        // Test search functionality
        console.log(`\nTesting search functionality...`);
        const queryEmbedding = generateEmbedding(0);
        const searchResults = store.search(queryEmbedding, {
            limit: 10,
            threshold: 0.3,
        });

        console.log(`Search returned ${searchResults.length} results`);
        if (searchResults.length > 0) {
            console.log(
                `Top result: ${searchResults[0].chunkId} (similarity: ${searchResults[0].similarity.toFixed(4)})`
            );
        }

        // Verify search results are valid
        if (searchResults.length === 0 && scenario.chunkCount > 0) {
            throw new Error('Search returned no results!');
        }
        console.log('✓ Search working correctly');

        // Test get functionality
        console.log(`\nTesting get functionality...`);
        const chunk = store.get('chunk_0');
        if (!chunk) {
            throw new Error('Failed to retrieve chunk_0!');
        }
        console.log(`✓ Retrieved chunk_0: ${chunk.metadata.name}`);

        // Cleanup
        store.close();
        if (existsSync(dbPath)) {
            rmSync(dbPath);
        }

        console.log(`\n✓ Scenario passed!`);

        return {
            success: true,
            migrated,
            chunkCount: scenario.chunkCount,
            insertTime,
            dbSizeBytes: stats.dbSizeBytes,
        };
    } catch (error) {
        // Cleanup on error
        if (existsSync(dbPath)) {
            try {
                rmSync(dbPath);
            } catch {}
        }
        throw error;
    }
}

/**
 * Main test runner
 */
async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  SQLite Migration Integration Test                         ║
║  Testing OOM prevention at 423+ files (~5000 chunks)       ║
╚════════════════════════════════════════════════════════════╝
`);

    const results = [];

    for (const scenario of CONFIG.scenarios) {
        try {
            const result = await runScenario(scenario);
            results.push(result);
        } catch (error) {
            console.error(`\n✗ Scenario failed: ${error.message}`);
            console.error(error.stack);
            results.push({
                success: false,
                scenario: scenario.name,
                error: error.message,
            });
        }
    }

    // Print summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('Test Summary');
    console.log(`${'='.repeat(60)}\n`);

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    for (const result of results) {
        if (result.success) {
            console.log(
                `✓ ${result.chunkCount} chunks: migrated=${result.migrated}, ` +
                    `time=${result.insertTime}ms, ` +
                    `size=${(result.dbSizeBytes / 1024 / 1024).toFixed(2)} MB`
            );
        } else {
            console.log(`✗ ${result.scenario}: ${result.error}`);
        }
    }

    console.log(`\nTotal: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }

    console.log('\n✓ All integration tests passed!');
}

// Run tests
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
