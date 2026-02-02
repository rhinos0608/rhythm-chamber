#!/usr/bin/env node
/**
 * Multi-Model Embeddings Comparison Example
 *
 * This script demonstrates how to:
 * 1. Run multiple embedding models sequentially (no concurrency)
 * 2. Create isolated caches for each model
 * 3. Compare embeddings across models
 * 4. Generate comprehensive reports
 *
 * Usage:
 *   node mcp-server/examples/multi-model-comparison.js <directory>
 *
 * Example:
 *   node mcp-server/examples/multi-model-comparison.js ./mcp-server/src
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MultiModelCacheManager } from '../src/semantic/multi-model-cache.js';
import { SerializedModelRunner } from '../src/semantic/model-runner.js';
import { ComparisonEngine } from '../src/semantic/comparison-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Main execution function
 */
async function main() {
  // Get target directory from command line
  const targetDir = process.argv[2] || resolve(__dirname, '../src');

  console.error('═══════════════════════════════════════════════════════');
  console.error('  Multi-Model Embeddings Comparison System');
  console.error('═══════════════════════════════════════════════════════');
  console.error('');
  console.error(`Target Directory: ${targetDir}`);
  console.error('');

  // Configuration for multiple models
  const models = [
    {
      name: 'Xenova/gte-base',
      mode: 'local',
      description: 'General-purpose embeddings (Transformers.js)',
    },
    {
      name: 'jinaai/jina-embeddings-v2-base-code',
      mode: 'local',
      description: 'Code-specialized embeddings (Transformers.js)',
    },
    {
      name: 'text-embedding-embeddinggemma-300m',
      mode: 'local',
      endpoint: 'http://localhost:1234/v1',
      description: 'Gemma embeddings (LM Studio)',
    },
  ];

  // Initialize multi-model cache manager
  const cacheDir = resolve(__dirname, '../.mcp-cache');
  const cacheManager = new MultiModelCacheManager(cacheDir, {
    enabled: true,
  });

  await cacheManager.initialize();
  console.error(`✓ Cache manager initialized with ${cacheManager.getModelNames().length} existing caches`);
  console.error('');

  // Get files to process (JavaScript files for this example)
  const { readdir } = await import('fs/promises');
  const { glob } = await import('glob');

  const files = await glob('**/*.js', {
    cwd: targetDir,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  });

  console.error(`Found ${files.length} JavaScript files to process`);
  console.error('');

  // Create model runner
  const runner = new SerializedModelRunner(cacheManager, {
    onProgress: (modelName, status, details) => {
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      console.error(`[${timestamp}] ${modelName}: ${status}`);

      if (status === 'file-processed') {
        console.error(`         └─ ${details.filePath}`);
      } else if (status === 'started') {
        console.error(`         └─ Model ${details.current}/${details.total}`);
      } else if (status === 'completed') {
        console.error(`         └─ ${details.chunksProcessed} chunks in ${details.duration}ms`);
      }
    },
    onError: (modelName, error) => {
      console.error(`✗ ${modelName} failed:`, error.message);
    },
    batchSize: 20,
  });

  // Build configuration map
  const config = {};
  for (const model of models) {
    config[model.name] = {
      mode: model.mode,
      endpoint: model.endpoint,
    };
  }

  // Add models to queue
  const modelNames = models.map(m => m.name);
  runner.addModels(modelNames, files.slice(0, 50), config); // Limit to 50 files for demo

  // Run all models sequentially
  console.error('═══════════════════════════════════════════════════════');
  console.error('  Running Models (Serialized Execution)');
  console.error('═══════════════════════════════════════════════════════');
  console.error('');

  const startTime = Date.now();
  const results = await runner.runAll();
  const totalTime = Date.now() - startTime;

  console.error('');
  console.error('═══════════════════════════════════════════════════════');
  console.error('  Execution Summary');
  console.error('═══════════════════════════════════════════════════════');
  console.error('');

  for (const [modelName, result] of Object.entries(results.models)) {
    const model = models.find(m => m.name === modelName);
    console.error(`${modelName}`);
    console.error(`  Status: ${result.status}`);
    console.error(`  Files: ${result.filesProcessed}`);
    console.error(`  Chunks: ${result.chunksProcessed}`);
    if (result.duration) {
      console.error(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
    }
    if (result.error) {
      console.error(`  Error: ${result.error}`);
    }
    console.error('');
  }

  console.error(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
  console.error('');

  // Save all caches
  console.error('Saving caches...');
  await cacheManager.saveAll();
  console.error('✓ All caches saved');
  console.error('');

  // Generate comparison report
  console.error('═══════════════════════════════════════════════════════');
  console.error('  Comparison Report');
  console.error('═══════════════════════════════════════════════════════');
  console.error('');

  const comparisonEngine = new ComparisonEngine(cacheManager);
  const report = await comparisonEngine.generateFullReport();

  console.error('Model Coverage:');
  for (const [file, coverage] of Object.entries(report.fileCoverage).slice(0, 10)) {
    const fileName = file.split('/').pop();
    const coverageStr = Object.entries(coverage)
      .map(([model, count]) => `${model.split('/').pop()}: ${count}`)
      .join(', ');
    console.error(`  ${fileName}: ${coverageStr}`);
  }
  console.error('  ...');
  console.error('');

  if (report.comparison.chunkSample && report.comparison.chunkSample.similarities) {
    console.error('Average Cosine Similarities:');
    for (const [pair, stats] of Object.entries(report.comparison.chunkSample.similarities)) {
      console.error(`  ${pair}:`);
      console.error(`    Mean: ${stats.mean.toFixed(4)}`);
      console.error(`    Min: ${stats.min.toFixed(4)}`);
      console.error(`    Max: ${stats.max.toFixed(4)}`);
      console.error(`    StdDev: ${stats.stdDev.toFixed(4)}`);
    }
    console.error('');
  }

  if (report.comparison.anomalies) {
    console.error('Anomaly Detection (threshold: 0.5):');
    console.error(`  Total Chunks: ${report.comparison.anomalies.total}`);
    console.error(`  Anomalies Found: ${report.comparison.anomalies.anomaliesFound}`);
    console.error(`  Anomaly Rate: ${(report.comparison.anomalies.anomalyRate * 100).toFixed(1)}%`);
    console.error('');

    if (report.comparison.anomalies.anomalies.length > 0) {
      console.error('  Top Anomalies:');
      for (const anomaly of report.comparison.anomalies.anomalies.slice(0, 5)) {
        console.error(`    ${anomaly.chunkId}: ${anomaly.pair} = ${anomaly.similarity.toFixed(4)}`);
      }
    }
  }

  console.error('');
  console.error('═══════════════════════════════════════════════════════');
  console.error('  Done!');
  console.error('═══════════════════════════════════════════════════════');
}

// Run main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
