/**
 * Serialized Model Runner
 *
 * Executes embedding models sequentially with no concurrency.
 * Each model gets its own isolated run with dedicated cache.
 *
 * Features:
 * - Queue-based execution (no concurrent model calls)
 * - Progress tracking per model
 * - Error isolation (one model failure doesn't stop others)
 * - Detailed progress reporting
 *
 * @module semantic/model-runner
 */

import { HybridEmbeddings } from './embeddings.js';
import { MultiModelCacheManager } from './multi-model-cache.js';
import { CodeChunker } from './chunker.js';
import { MODEL_DIMENSIONS } from './config.js';

/**
 * Task status enum
 */
const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

/**
 * Serialized Model Runner
 *
 * Runs multiple embedding models sequentially, ensuring no concurrent
 * calls to different models. Each model processes the same files
 * with its own isolated cache.
 */
export class SerializedModelRunner {
  constructor(multiModelCache, options = {}) {
    this.multiModelCache = multiModelCache;
    this.options = {
      onProgress: null, // (modelName, status, details) => void
      onError: null, // (modelName, error) => void
      batchSize: 10, // Chunks per batch
      ...options,
    };

    this.queue = [];
    this.results = new Map();
    this.isRunning = false;
  }

  /**
   * Add models to the execution queue
   * @param {Array<string>} modelNames - Model names to run
   * @param {Array<string>} files - Files to process
   * @param {Object} config - Per-model configuration
   * @throws {Error} If validation fails
   */
  addModels(modelNames, files, config = {}) {
    // FIX #6: Comprehensive input validation

    // Validate modelNames
    if (!Array.isArray(modelNames)) {
      throw new Error('modelNames must be an array');
    }
    if (modelNames.length === 0) {
      throw new Error('modelNames cannot be empty');
    }
    if (modelNames.length > 10) {
      throw new Error('modelNames cannot exceed 10 models (to prevent excessive memory usage)');
    }

    // Validate each model name
    const seenModels = new Set();
    for (const modelName of modelNames) {
      if (typeof modelName !== 'string') {
        throw new Error(`Model name must be a string, got: ${typeof modelName}`);
      }
      if (modelName.trim() === '') {
        throw new Error('Model name cannot be empty');
      }

      // Check for duplicates
      if (seenModels.has(modelName)) {
        throw new Error(`Duplicate model name detected: ${modelName}`);
      }
      seenModels.add(modelName);

      // Validate model is known
      if (!(modelName in MODEL_DIMENSIONS)) {
        const knownModels = Object.keys(MODEL_DIMENSIONS).join(', ');
        throw new Error(
          `Unknown model: "${modelName}". Known models: ${knownModels}`
        );
      }
    }

    // Validate files
    if (!Array.isArray(files)) {
      throw new Error('files must be an array');
    }
    if (files.length === 0) {
      throw new Error('files cannot be empty');
    }

    // Validate each file path
    for (const filePath of files) {
      if (typeof filePath !== 'string') {
        throw new Error(`File path must be a string, got: ${typeof filePath}`);
      }
      if (filePath.trim() === '') {
        throw new Error('File path cannot be empty');
      }
    }

    // Validate config
    if (config !== null && typeof config !== 'object') {
      throw new Error('config must be an object');
    }

    // FIX #7: Validate dimension compatibility across all models
    // All models must have the same dimension for comparison to work
    const dimensions = modelNames.map(m => MODEL_DIMENSIONS[m]);
    const firstDim = dimensions[0];
    const incompatibleModels = [];

    for (let i = 0; i < modelNames.length; i++) {
      if (dimensions[i] !== firstDim) {
        incompatibleModels.push({
          model: modelNames[i],
          dimension: dimensions[i],
          expectedDimension: firstDim,
        });
      }
    }

    if (incompatibleModels.length > 0) {
      const issues = incompatibleModels
        .map(({ model, dimension, expectedDimension }) =>
          `"${model}" has ${dimension}D (expected ${expectedDimension}D)`
        )
        .join('; ');
      throw new Error(
        `Dimension incompatibility detected: ${issues}. All models must have the same dimension for comparison.`
      );
    }

    // Add validated models to queue
    for (const modelName of modelNames) {
      this.queue.push({
        modelName,
        files,
        config: config[modelName] || {},
        status: TaskStatus.PENDING,
        startTime: null,
        endTime: null,
        error: null,
      });
    }

    console.error(`[ModelRunner] Added ${modelNames.length} models to queue (validated)`);
  }

  /**
   * Execute all models in the queue sequentially
   * @returns {Promise<Object>} Results for each model
   */
  async runAll() {
    if (this.isRunning) {
      throw new Error('ModelRunner is already running');
    }

    this.isRunning = true;
    this.results.clear();

    const totalModels = this.queue.length;
    let completedModels = 0;

    console.error(`[ModelRunner] Starting execution of ${totalModels} models`);

    try {
      for (const task of this.queue) {
        task.status = TaskStatus.RUNNING;
        task.startTime = Date.now();

        this._notifyProgress(task.modelName, 'started', {
          total: totalModels,
          current: completedModels + 1,
        });

        try {
          const result = await this._runModel(task);
          this.results.set(task.modelName, result);

          task.status = TaskStatus.COMPLETED;
          completedModels++;

          this._notifyProgress(task.modelName, 'completed', {
            total: totalModels,
            current: completedModels,
            chunksProcessed: result.chunksProcessed,
            filesProcessed: result.filesProcessed,
            duration: result.duration,
          });

          console.error(
            `[ModelRunner] Completed ${task.modelName}: ${result.chunksProcessed} chunks, ${result.duration}ms`
          );
        } catch (error) {
          task.status = TaskStatus.FAILED;
          task.error = error.message;

          this._notifyError(task.modelName, error);

          console.error(`[ModelRunner] Failed ${task.modelName}:`, error.message);

          // Store error result
          this.results.set(task.modelName, {
            success: false,
            error: error.message,
            chunksProcessed: 0,
            filesProcessed: 0,
            duration: Date.now() - task.startTime,
          });
        } finally {
          task.endTime = Date.now();
        }
      }

      // Compile final results
      return this._compileResults();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run a single model with its configuration
   * @private
   */
  async _runModel(task) {
    const { modelName, files, config } = task;

    // Get or create cache for this model
    const cache = await this.multiModelCache.getOrCreateCache(modelName);

    // Initialize embeddings provider with model-specific config
    const embeddings = new HybridEmbeddings({
      mode: config.mode || 'local',
      model: modelName,
      ...config,
    });

    let chunksProcessed = 0;
    let filesProcessed = 0;
    const errors = [];

    try {
      // Process each file
      for (const filePath of files) {
      try {
        // Check if file is already cached and valid
        const isValid = await cache.isFileValid(filePath);
        if (isValid) {
          const chunks = cache.getFileChunks(filePath);
          chunksProcessed += chunks.length;
          filesProcessed++;

          this._notifyProgress(modelName, 'file-cached', {
            filePath,
            chunks: chunks.length,
          });

          continue;
        }

        // Read and chunk the file
        const content = await this._readFile(filePath);

        // Create chunker instance and chunk the file
        const chunker = new CodeChunker();
        const chunks = chunker.chunk(filePath, content);

        // Invalidate old cache for this file
        cache.invalidateFile(filePath);

        // Generate embeddings for all chunks
        const texts = chunks.map(c => c.text);
        const embeddingsArray = await embeddings.getBatchEmbeddings(texts);

        // Get file modification time
        const fileStat = await this._getFileStat(filePath);

        // Store in cache
        await cache.storeFileChunks(filePath, chunks, fileStat.mtimeMs, embeddingsArray);

        chunksProcessed += chunks.length;
        filesProcessed++;

        this._notifyProgress(modelName, 'file-processed', {
          filePath,
          chunks: chunks.length,
        });

      } catch (error) {
        errors.push({ file: filePath, error: error.message });
        console.error(`[ModelRunner] Error processing ${filePath} with ${modelName}:`, error.message);
      }
    }

    // Save cache for this model
    await cache.save();

    return {
      success: true,
      modelName,
      chunksProcessed,
      filesProcessed,
      errors,
      duration: Date.now() - task.startTime,
      cacheStats: cache.getStats(),
    };
    } finally {
      // CRITICAL: Dispose embeddings instance to free memory
      // Transformers.js models can be 100MB-500MB each

      // Step 1: Clear loading promises FIRST (before dispose)
      if (embeddings && embeddings.initPromises) {
        // Wait for any pending initialization to complete
        const promises = Array.from(embeddings.initPromises.values());
        await Promise.allSettled(promises);
        embeddings.initPromises.clear();
      }

      // Step 2: Then dispose the pipeline
      if (embeddings && embeddings.transformersPipeline) {
        try {
          await embeddings.transformersPipeline.dispose();
          embeddings.transformersPipeline = null;
          console.error(`[ModelRunner] Disposed embeddings pipeline for ${modelName}`);
        } catch (disposeError) {
          console.error(`[ModelRunner] CRITICAL: Failed to dispose pipeline for ${modelName}:`, disposeError);
          // Don't throw - allow other cleanup to continue
        }
      }

      // Step 3: Clear the reference to the entire embeddings object
      embeddings = null;
    }
  }

  /**
   * Read file content
   * @private
   */
  async _readFile(filePath) {
    const { readFile } = await import('fs/promises');
    return await readFile(filePath, 'utf-8');
  }

  /**
   * Get file stats
   * @private
   */
  async _getFileStat(filePath) {
    const { stat } = await import('fs/promises');
    return await stat(filePath);
  }

  /**
   * Notify progress callback
   * @private
   */
  _notifyProgress(modelName, status, details) {
    if (this.options.onProgress) {
      try {
        this.options.onProgress(modelName, status, details);
      } catch (error) {
        console.error('[ModelRunner] Progress callback error:', error);
      }
    }
  }

  /**
   * Notify error callback
   * @private
   */
  _notifyError(modelName, error) {
    if (this.options.onError) {
      try {
        this.options.onError(modelName, error);
      } catch (error) {
        console.error('[ModelRunner] Error callback error:', error);
      }
    }
  }

  /**
   * Compile final results from all model runs
   * @private
   */
  _compileResults() {
    const summary = {
      totalModels: this.queue.length,
      completed: 0,
      failed: 0,
      models: {},
    };

    for (const task of this.queue) {
      const result = this.results.get(task.modelName);
      summary.models[task.modelName] = {
        status: task.status,
        ...result,
      };

      if (task.status === TaskStatus.COMPLETED) {
        summary.completed++;
      } else if (task.status === TaskStatus.FAILED) {
        summary.failed++;
      }
    }

    return summary;
  }

  /**
   * Get current queue status
   */
  getQueueStatus() {
    return this.queue.map(task => ({
      model: task.modelName,
      status: task.status,
      progress: task.endTime
        ? 100
        : task.startTime
          ? Math.round(((Date.now() - task.startTime) / (task.endTime || Date.now())) * 100)
          : 0,
    }));
  }

  /**
   * Clear the queue
   */
  clearQueue() {
    if (this.isRunning) {
      throw new Error('Cannot clear queue while running');
    }
    this.queue = [];
    this.results.clear();
  }

  /**
   * Get results for a specific model
   * @param {string} modelName - Model name
   * @returns {Object|null} Model results or null if not found
   */
  getModelResults(modelName) {
    return this.results.get(modelName) || null;
  }
}

export default SerializedModelRunner;
