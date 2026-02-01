/**
 * Multi-Model Cache Manager
 *
 * Manages isolated cache namespaces for multiple embedding models.
 * Each model has its own cache file to prevent cross-contamination.
 *
 * Features:
 * - Per-model cache isolation (separate files per model)
 * - Model-aware cache keys
 * - Bulk operations across all models
 * - Comparison and analysis capabilities
 *
 * @module semantic/multi-model-cache
 */

import { mkdir, readFile, writeFile, stat, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { EmbeddingCache } from './cache.js';

/**
 * Cache file naming pattern
 * Format: semantic-embeddings-{sanizedName}-{hash}.json
 * Uses URL encoding for reversible sanitization + hash for uniqueness
 */
function getCacheFileName(cacheDir, modelName) {
  // Use URL encoding for reversible sanitization (preserves info)
  const encoded = encodeURIComponent(modelName).substring(0, 80);

  // Add hash for guaranteed uniqueness and collision prevention
  // Use FULL SHA-256 (64 hex chars = 256 bits) - practically impossible to collide
  const fullHash = createHash('sha256').update(modelName).digest('hex');

  return join(cacheDir, `semantic-embeddings-${encoded}-${fullHash}.json`);
}

/**
 * Extract model name from cache filename
 * Reverse of getCacheFileName
 */
function extractModelFromFileName(cacheFile) {
  // Match: semantic-embeddings-{encoded}-{full-64-char-hash}.json
  const match = cacheFile.match(/semantic-embeddings-([^-]+)-[a-f0-9]{64}\.json$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Multi-Model Cache Manager
 *
 * Manages multiple isolated caches, one per embedding model.
 * Each cache maintains separate embeddings to enable model comparison.
 */
export class MultiModelCacheManager {
  constructor(cacheDir, options = {}) {
    this.cacheDir = cacheDir;
    this.options = options;
    this.caches = new Map(); // modelName -> EmbeddingCache instance
    this.initPromises = new Map(); // modelName -> initialization Promise (mutex)
    this.initialized = false;
  }

  /**
   * Initialize all model caches
   * Scans cache directory for existing model caches
   */
  async initialize() {
    if (!existsSync(this.cacheDir)) {
      await mkdir(this.cacheDir, { recursive: true });
    }

    // Discover existing model caches
    const files = await readdir(this.cacheDir);
    const modelCacheFiles = files.filter(f => f.startsWith('semantic-embeddings-') && f !== 'semantic-embeddings.json');

    console.error(`[MultiModelCache] Found ${modelCacheFiles.length} existing model caches`);

    // Initialize discovered caches
    for (const file of modelCacheFiles) {
      const modelName = extractModelFromFileName(file);
      if (modelName) {
        await this.getOrCreateCache(modelName);
      }
    }

    this.initialized = true;
    return this;
  }

  /**
   * Get or create a cache for a specific model
   * @param {string} modelName - Model name (e.g., 'jinaai/jina-embeddings-v2-base-code')
   * @returns {Promise<EmbeddingCache>} The model's cache
   */
  async getOrCreateCache(modelName) {
    // Fast path: cache already initialized
    if (this.caches.has(modelName)) {
      return this.caches.get(modelName);
    }

    // Check if there's an ongoing initialization (mutex pattern)
    if (this.initPromises.has(modelName)) {
      console.error(`[MultiModelCache] Cache initialization in progress for: ${modelName}, waiting...`);
      return await this.initPromises.get(modelName);
    }

    // Create new initialization promise
    const initPromise = (async () => {
      try {
        const cacheFile = getCacheFileName(this.cacheDir, modelName);
        const cache = new EmbeddingCache(this.cacheDir, {
          ...this.options,
          cacheFile,
          modelVersion: modelName, // Use modelName as version for isolation
        });

        await cache.initialize();
        this.caches.set(modelName, cache);

        console.error(`[MultiModelCache] Initialized cache for model: ${modelName}`);
        return cache;
      } finally {
        // Clean up initialization promise after completion
        this.initPromises.delete(modelName);
      }
    })();

    // Store promise before awaiting (enables mutex behavior)
    this.initPromises.set(modelName, initPromise);

    return await initPromise;
  }

  /**
   * Get the active model's cache (for single-model operations)
   * Uses the configured active model from ModelConfigManager
   * @returns {Promise<EmbeddingCache>} The active model's cache
   */
  async getActiveCache() {
    // Import here to avoid circular dependency
    const { getModelConfig } = await import('./model-config.js');
    const config = getModelConfig();
    const activeModel = config.getActiveModel();

    return await this.getOrCreateCache(activeModel);
  }

  /**
   * Set the active model (delegates to ModelConfigManager)
   * @param {string} modelName - Model name to set as active
   * @returns {Promise<Object>} Result of setting active model
   */
  async setActiveModel(modelName) {
    const { getModelConfig } = await import('./model-config.js');
    const config = getModelConfig();

    // Pre-initialize the cache for the new model
    await this.getOrCreateCache(modelName);

    // Set as active
    return config.setActiveModel(modelName);
  }

  /**
   * Get the active model name
   * @returns {Promise<string>} Active model name
   */
  async getActiveModelName() {
    const { getModelConfig } = await import('./model-config.js');
    const config = getModelConfig();
    return config.getActiveModel();
  }

  /**
   * Get cache for a specific model (must exist)
   * @param {string} modelName - Model name
   * @returns {EmbeddingCache|null} The model's cache or null if not found
   */
  getCache(modelName) {
    return this.caches.get(modelName) || null;
  }

  /**
   * Check if a model has a cache
   * @param {string} modelName - Model name
   * @returns {boolean} True if cache exists
   */
  hasCache(modelName) {
    return this.caches.has(modelName);
  }

  /**
   * Get all model names that have caches
   * @returns {string[]} Array of model names
   */
  getModelNames() {
    return Array.from(this.caches.keys());
  }

  /**
   * Get statistics for all model caches
   * @returns {Object} Map of modelName -> stats
   */
  getAllStats() {
    const stats = {};
    for (const [modelName, cache] of this.caches) {
      stats[modelName] = cache.getStats();
    }
    return stats;
  }

  /**
   * Save all dirty caches
   * @returns {Promise<Object>} Save results per model
   */
  async saveAll() {
    const results = {};

    for (const [modelName, cache] of this.caches) {
      try {
        const saved = await cache.save();
        results[modelName] = { success: saved };
      } catch (error) {
        results[modelName] = { success: false, error: error.message };
      }
    }

    return results;
  }

  /**
   * Get chunk embeddings from all models for comparison
   * @param {string} chunkId - Chunk ID to retrieve
   * @returns {Object} Map of modelName -> embedding
   */
  getChunkFromAllModels(chunkId) {
    const result = {};

    for (const [modelName, cache] of this.caches) {
      const embedding = cache.getChunkEmbedding(chunkId);
      if (embedding) {
        result[modelName] = embedding;
      }
    }

    return result;
  }

  /**
   * Compare embeddings across models for a specific chunk
   * @param {string} chunkId - Chunk ID to compare
   * @returns {Object} Comparison metrics
   */
  compareChunk(chunkId) {
    const embeddings = this.getChunkFromAllModels(chunkId);
    const models = Object.keys(embeddings);

    if (models.length < 2) {
      return {
        chunkId,
        models: models.length,
        message: 'Need at least 2 models for comparison',
      };
    }

    // Calculate cosine similarity between all pairs
    const similarities = {};
    const dimensionMismatches = {};

    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const modelA = models[i];
        const modelB = models[j];
        const embA = embeddings[modelA];
        const embB = embeddings[modelB];

        const key = `${modelA} <-> ${modelB}`;

        if (embA && embB) {
          if (embA.length === embB.length) {
            // Same dimensions - calculate similarity
            similarities[key] = this._cosineSimilarity(embA, embB);
          } else {
            // Dimension mismatch - report error
            dimensionMismatches[key] = {
              error: 'dimension_mismatch',
              dimensionA: embA.length,
              dimensionB: embB.length,
              message: `Cannot compare: dimensions ${embA.length} vs ${embB.length}`,
            };
          }
        }
      }
    }

    return {
      chunkId,
      models: models.length,
      modelNames: models,
      similarities,
      dimensionMismatches,
      dimensions: models.map(m => embeddings[m].length),
    };
  }

  /**
   * Calculate cosine similarity between two embeddings
   * Assumes a.length === b.length (validated by caller)
   * @private
   */
  _cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Clear a specific model's cache
   * @param {string} modelName - Model name to clear
   */
  async clearModel(modelName) {
    const cache = this.caches.get(modelName);
    if (cache) {
      await cache.delete();
      this.caches.delete(modelName);
    }
  }

  /**
   * Clear all model caches
   */
  async clearAll() {
    for (const [modelName, cache] of this.caches) {
      await cache.delete();
    }
    this.caches.clear();
  }

  /**
   * Get cached files that are valid across all models
   * @returns {Promise<Object>} Map of filePath -> validity per model
   */
  async checkFilesValidAllModels(filePaths) {
    const result = {};

    for (const filePath of filePaths) {
      result[filePath] = {};
      for (const [modelName, cache] of this.caches) {
        result[filePath][modelName] = await cache.isFileValid(filePath);
      }
    }

    return result;
  }

  /**
   * Generate comparison report across all models
   * @returns {Object} Comprehensive comparison report
   */
  generateComparisonReport() {
    const report = {
      timestamp: new Date().toISOString(),
      models: this.getModelNames(),
      summary: {},
      perModelStats: this.getAllStats(),
      fileCoverage: {},
      chunkComparison: {},
    };

    // Count files and chunks per model
    for (const [modelName, cache] of this.caches) {
      const stats = cache.getStats();
      report.summary[modelName] = {
        files: stats.fileCount,
        chunks: stats.chunkCount,
        size: stats.approximateSize,
      };
    }

    // Check which files are covered by which models
    const allFiles = new Set();
    for (const cache of this.caches.values()) {
      for (const file of cache.getCachedFiles()) {
        allFiles.add(file);
      }
    }

    for (const file of allFiles) {
      report.fileCoverage[file] = {};
      for (const [modelName, cache] of this.caches) {
        report.fileCoverage[file][modelName] = cache.getFileChunks(file).length;
      }
    }

    return report;
  }
}

export default MultiModelCacheManager;
