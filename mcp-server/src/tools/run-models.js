/**
 * Run Multiple Embedding Models Tool
 *
 * Run multiple embedding models sequentially with isolated caches.
 * Each model processes the same files independently for comparison.
 *
 * @module tools/run-models
 */

import { MultiModelCacheManager } from '../semantic/multi-model-cache.js';
import { SerializedModelRunner } from '../semantic/model-runner.js';
import { CodeChunker } from '../semantic/chunker.js';
import { glob } from 'glob';
import { resolve } from 'path';
import { MODEL_DIMENSIONS } from '../semantic/config.js';

/**
 * Tool schema
 */
export const schema = {
  name: 'run_multi_models',
  description: `
Run multiple embedding models sequentially with isolated caches for comparison.

Features:
- Queue-based execution (no concurrent model calls)
- Progress tracking per model
- Error isolation (one model failure doesn't stop others)
- Isolated caches per model

Example:
{
  "models": ["Xenova/gte-base", "text-embedding-embeddinggemma-300m"],
  "pattern": "**/*.js",
  "config": {
    "Xenova/gte-base": {"mode": "local"},
    "text-embedding-embeddinggemma-300m": {"mode": "local", "endpoint": "http://localhost:1234/v1"}
  }
}
  `,
  inputSchema: {
    type: 'object',
    properties: {
      models: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of model names to run',
      },
      pattern: {
        type: 'string',
        description: 'Glob pattern for files to process (e.g., "**/*.js")',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific file paths to process (alternative to pattern)',
      },
      limit: {
        type: 'number',
        description: 'Limit number of files to process (for testing)',
        default: 50,
      },
      config: {
        type: 'object',
        description: 'Per-model configuration (mode, endpoint, etc.)',
      },
      batchSize: {
        type: 'number',
        description: 'Number of chunks per batch',
        default: 20,
      },
      saveCaches: {
        type: 'boolean',
        description: 'Save caches after processing',
        default: true,
      },
      cacheDir: {
        type: 'string',
        description: 'Cache directory path (optional, defaults to .mcp-cache)',
      },
    },
    required: ['models'],
  },
};

/**
 * Tool handler
 */
export async function handler(args, projectRoot) {
  const {
    models,
    pattern,
    files,
    limit = 50,
    config = {},
    batchSize = 20,
    saveCaches = true,
    cacheDir,
  } = args;

  try {
    if (!models || models.length === 0) {
      throw new Error('models array is required');
    }

    // Validate model names against MODEL_DIMENSIONS registry
    const invalidModels = models.filter(m => !MODEL_DIMENSIONS[m]);
    if (invalidModels.length > 0) {
      const availableModels = Object.keys(MODEL_DIMENSIONS).slice(0, 10).join(', ');
      throw new Error(
        `Unknown model(s): ${invalidModels.join(', ')}.\n` +
        `Available models: ${availableModels}...`
      );
    }

    const cachePath = cacheDir || resolve(projectRoot, '.mcp-cache');

    // Initialize cache manager
    const cacheManager = new MultiModelCacheManager(cachePath, {
      enabled: true,
    });
    await cacheManager.initialize();

    // Get files to process
    let targetFiles = [];

    if (files && files.length > 0) {
      targetFiles = files.map(f => resolve(projectRoot, f));
    } else if (pattern) {
      targetFiles = await glob(pattern, {
        cwd: projectRoot,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
      });
    } else {
      throw new Error('Must specify either pattern or files');
    }

    // Apply limit
    targetFiles = targetFiles.slice(0, limit);

    if (targetFiles.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                warning: 'No files found to process',
                pattern,
                projectRoot,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Create model runner with progress tracking
    const progress = [];
    const errors = [];

    const runner = new SerializedModelRunner(cacheManager, {
      batchSize,
      onProgress: (modelName, status, details) => {
        progress.push({
          timestamp: new Date().toISOString(),
          model: modelName,
          status,
          details,
        });
      },
      onError: (modelName, error) => {
        errors.push({
          model: modelName,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      },
    });

    // Add models to queue
    runner.addModels(models, targetFiles, config);

    // Run all models
    const startTime = Date.now();
    const results = await runner.runAll();
    const totalTime = Date.now() - startTime;

    // Save caches if requested
    if (saveCaches) {
      await cacheManager.saveAll();
    }

    // Get comparison stats
    const comparisonStats = cacheManager.getAllStats();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              operation: 'run_multi_models',
              models,
              filesProcessed: targetFiles.length,
              totalTime,
              results,
              progress,
              errors,
              comparisonStats,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error.message,
              stack: error.stack,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
