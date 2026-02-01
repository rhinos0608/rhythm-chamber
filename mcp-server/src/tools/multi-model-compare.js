/**
 * Multi-Model Comparison Tool
 *
 * Compare embeddings across multiple models to analyze:
 * - Cosine similarity between models
 * - Ranking overlap and correlations
 * - Anomaly detection
 *
 * @module tools/multi-model-compare
 */

import { MultiModelCacheManager } from '../semantic/multi-model-cache.js';
import { ComparisonEngine } from '../semantic/comparison-engine.js';
import { resolve } from 'path';

/**
 * Tool schema
 */
export const schema = {
  name: 'multi_model_compare',
  description: `
Compare embeddings across multiple models to analyze similarities, rankings, and anomalies.

Supports:
- Cosine similarity comparison between models
- Ranking overlap analysis (Kendall's Tau, Pearson correlation)
- Anomaly detection (chunks where models disagree significantly)
- Comprehensive comparison reports

Examples:
1. Compare specific chunks: {"chunkIds": ["chunk-1", "chunk-2"], "threshold": 0.5}
2. Generate full report: {"generateReport": true}
3. Detect anomalies: {"detectAnomalies": true, "threshold": 0.5}
  `,
  inputSchema: {
    type: 'object',
    properties: {
      chunkIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific chunk IDs to compare (optional if generateReport)',
      },
      threshold: {
        type: 'number',
        description: 'Similarity threshold for anomaly detection (default: 0.5)',
        default: 0.5,
      },
      generateReport: {
        type: 'boolean',
        description: 'Generate comprehensive comparison report',
        default: false,
      },
      detectAnomalies: {
        type: 'boolean',
        description: 'Run anomaly detection on all chunks',
        default: false,
      },
      cacheDir: {
        type: 'string',
        description: 'Cache directory path (optional, defaults to .mcp-cache)',
      },
    },
  },
};

/**
 * Tool handler
 */
export async function handler(args, projectRoot) {
  const { chunkIds, threshold = 0.5, generateReport, detectAnomalies, cacheDir } = args;

  try {
    const cachePath = cacheDir || resolve(projectRoot, '.mcp-cache');

    // Initialize cache manager
    const cacheManager = new MultiModelCacheManager(cachePath, {
      enabled: true,
    });
    await cacheManager.initialize();

    const models = cacheManager.getModelNames();

    if (models.length < 2) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'Need at least 2 models for comparison',
                availableModels: models,
                message: 'Run embeddings with multiple models first to create comparison data',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const engine = new ComparisonEngine(cacheManager);

    // Handle different operation types
    if (generateReport) {
      const report = await engine.generateFullReport();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                operation: 'full_report',
                models,
                report,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (detectAnomalies) {
      // Get all chunks from first model
      const firstModel = models[0];
      const firstCache = cacheManager.getCache(firstModel);

      if (!firstCache) {
        throw new Error(`Cache not found for model: ${firstModel}`);
      }

      const allChunks = [];
      for (const file of firstCache.getCachedFiles()) {
        const chunks = firstCache.getFileChunks(file);
        allChunks.push(...chunks);
      }

      const anomalies = await engine.detectAnomalies(allChunks, threshold);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                operation: 'anomaly_detection',
                threshold,
                models,
                anomalies,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Default: compare specific chunks
    if (chunkIds && chunkIds.length > 0) {
      const comparison = await engine.compareChunks(chunkIds);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                operation: 'compare_chunks',
                models,
                chunkIds,
                comparison,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // No specific operation requested - return status
    const stats = cacheManager.getAllStats();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              operation: 'status',
              models,
              stats,
              message: 'Specify chunkIds to compare, or use generateReport/detectAnomalies',
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
