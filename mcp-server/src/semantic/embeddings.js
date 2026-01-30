/**
 * Hybrid Embeddings Provider
 *
 * Provides embeddings with a two-tier fallback strategy:
 * 1. Primary: LM Studio API (fast, GPU-accelerated)
 * 2. Fallback: Transformers.js (always available, CPU-based)
 *
 * Environment variables:
 * - RC_LMSTUDIO_ENDPOINT: LM Studio API endpoint (default: http://localhost:1234/v1)
 * - RC_EMBEDDING_MODEL: Model name (default: text-embedding-nomic-embed-text-v1.5)
 * - RC_EMBEDDING_DIM: Embedding dimension (default: 768 for gte-base/nomic-embed)
 * - NOTE: Both LM Studio and Transformers.js use 768-dim for true hybrid fallback
 * - RC_EMBEDDING_TTL: Cache TTL in seconds (default: 600)
 * - RC_FORCE_TRANSFORMERS: Force Transformers.js usage (for testing)
 *
 * Common embedding models:
 * - text-embedding-nomic-embed-text-v1.5 (768 dim) - Default, excellent quality, lightweight (84MB)
 * - Xenova/gte-base (768 dim) - Fallback, high quality, CPU-based
 * - text-embedding-qwen3-embedding-0.6b (768 dim) - High quality, larger model
 * - nomic-ai/nomic-embed-text-v1.5 (768 dim) - Nomic AI format (needs text-embedding- prefix in LM Studio)
 * - Xenova/all-MiniLM-L6-v2 (384 dim) - Fast but lower quality (not recommended for code search)
 */

import { env, pipeline } from '@xenova/transformers';
import { mkdir, writeFile } from 'fs/promises';

// Configure Transformers.js for browser-less environment
env.allowLocalModels = true;
env.allowRemoteModels = true;

const DEFAULT_ENDPOINT = 'http://localhost:1234/v1';
const DEFAULT_MODEL = 'text-embedding-nomic-embed-text-v1.5';
const FALLBACK_MODEL = 'Xenova/gte-base';

// Model dimensions (must match actual model output)
const DIMENSIONS = {
  'text-embedding-nomic-embed-text-v1.5': 768,
  'text-embedding-qwen3-embedding-0.6b': 768,
  'Xenova/all-MiniLM-L6-v2': 384,
  'Xenova/gte-base': 768
};

// Use 768 dimensions to match both LM Studio and fallback
const DEFAULT_DIM = 768; // gte-base fallback (768-dim) - enables true hybrid

/**
 * Create a timeout signal for fetch (Node.js 20.x compatible)
 */
function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clearTimeout: () => clearTimeout(timeout) };
}

/**
 * Hybrid Embeddings Provider
 */
export class HybridEmbeddings {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.RC_LMSTUDIO_ENDPOINT || DEFAULT_ENDPOINT;
    this.modelName = options.model || process.env.RC_EMBEDDING_MODEL || DEFAULT_MODEL;
    this.dimension = options.dimension || parseInt(process.env.RC_EMBEDDING_DIM || '768');
    this.ttl = options.ttl || parseInt(process.env.RC_EMBEDDING_TTL || '600') * 1000;
    this.forceTransformers = options.forceTransformers || process.env.RC_FORCE_TRANSFORMERS === 'true';

    this.transformersPipeline = null;
    this.transformersLoading = false;
    this.lmStudioAvailable = null;
    this.lastCheck = 0;
    this.checkInterval = 30000; // Check availability every 30s

    this.cache = new Map();
    this.cacheStats = { hits: 0, misses: 0 };
  }

  /**
   * Get embedding for a single text
   */
  async getEmbedding(text) {
    const cacheKey = this.getCacheKey(text);

    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.ttl) {
        this.cacheStats.hits++;
        return cached.embedding;
      }
      this.cache.delete(cacheKey);
    }

    this.cacheStats.misses++;

    // Get embedding
    const embedding = await this._fetchEmbedding(text);

    // Cache result
    this.cache.set(cacheKey, {
      embedding,
      timestamp: Date.now()
    });

    return embedding;
  }

  /**
   * Get embeddings for multiple texts (batch processing)
   */
  async getBatchEmbeddings(texts) {
    const results = [];

    // Check if we should use LM Studio (supports batching)
    const useLMStudio = await this.isLMStudioAvailable();

    if (useLMStudio && !this.forceTransformers) {
      // LM Studio supports batch requests
      try {
        const batchEmbeddings = await this._fetchBatchEmbeddingsLMStudio(texts);
        return batchEmbeddings;
      } catch (error) {
        console.error('[Embeddings] LM Studio batch failed, falling back to individual:', error.message);
      }
    }

    // Process individually
    for (const text of texts) {
      results.push(await this.getEmbedding(text));
    }

    return results;
  }

  /**
   * Check if LM Studio is available
   */
  async isLMStudioAvailable() {
    if (this.forceTransformers) return false;

    const now = Date.now();
    if (this.lmStudioAvailable !== null && now - this.lastCheck < this.checkInterval) {
      return this.lmStudioAvailable;
    }

    this.lastCheck = now;

    try {
      const { signal, clearTimeout: clearFetchTimeout } = createTimeoutSignal(5000);
      const response = await fetch(`${this.endpoint}/models`, {
        method: 'GET',
        signal
      });
      clearFetchTimeout();

      if (response.ok) {
        const data = await response.json();
        const hasEmbeddingModel = data.data?.some(m =>
          m.id.includes(this.modelName) || m.id.includes('embedding')
        );

        this.lmStudioAvailable = hasEmbeddingModel;

        if (hasEmbeddingModel) {
          console.error(`[Embeddings] LM Studio available with model: ${this.modelName}`);
        } else {
          console.error('[Embeddings] LM Studio running but no embedding model loaded');
        }

        return hasEmbeddingModel;
      }

      this.lmStudioAvailable = false;
      return false;
    } catch (error) {
      console.error('[Embeddings] LM Studio not available:', error.message);
      this.lmStudioAvailable = false;
      return false;
    }
  }

  /**
   * Get current embedding source
   */
  getCurrentSource() {
    return {
      source: this.lmStudioAvailable ? 'lmstudio' : 'transformers',
      model: this.lmStudioAvailable ? this.modelName : FALLBACK_MODEL,
      available: this.lmStudioAvailable !== null
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      ...this.cacheStats,
      size: this.cache.size,
      hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheStats = { hits: 0, misses: 0 };
  }

  /**
   * Generate cache key from text
   */
  getCacheKey(text) {
    // Simple hash for caching (in production, use crypto.subtle)
    let hash = 0;
    const str = text.trim().substring(0, 200); // Limit key size
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `emb_${hash}_${str.length}`;
  }

  /**
   * Fetch embedding from appropriate source
   */
  async _fetchEmbedding(text) {
    // Try LM Studio first
    if (!this.forceTransformers && await this.isLMStudioAvailable()) {
      try {
        return await this._fetchEmbeddingLMStudio(text);
      } catch (error) {
        console.error('[Embeddings] LM Studio failed, falling back to Transformers:', error.message);
        this.lmStudioAvailable = false;
      }
    }

    // Fallback to Transformers.js
    return await this._fetchEmbeddingTransformers(text);
  }

  /**
   * Fetch embedding from LM Studio
   */
  async _fetchEmbeddingLMStudio(text) {
    const { signal, clearTimeout: clearFetchTimeout } = createTimeoutSignal(30000);
    const response = await fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        input: text
      }),
      signal
    });
    clearFetchTimeout();

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LM Studio error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Handle different response formats
    const embedding = data.data?.[0]?.embedding || data.embedding || data;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Invalid embedding response from LM Studio');
    }

    return new Float32Array(embedding);
  }

  /**
   * Fetch batch embeddings from LM Studio
   */
  async _fetchBatchEmbeddingsLMStudio(texts) {
    const { signal, clearTimeout: clearFetchTimeout } = createTimeoutSignal(60000);
    const response = await fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        input: texts
      }),
      signal
    });
    clearFetchTimeout();

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LM Studio batch error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Handle batch response format
    const embeddings = data.data || data;

    if (!Array.isArray(embeddings)) {
      throw new Error('Invalid batch embedding response from LM Studio');
    }

    return embeddings.map(item =>
      new Float32Array(item.embedding || item)
    );
  }

  /**
   * Fetch embedding from Transformers.js
   */
  async _fetchEmbeddingTransformers(text) {
    // Initialize pipeline if needed
    if (!this.transformersPipeline) {
      // Use initPromise to prevent race conditions from concurrent calls
      if (!this.initPromise) {
        this.initPromise = this._initializePipeline();
      }
      await this.initPromise;
    }

    // Generate embedding
    const output = await this.transformersPipeline(text, {
      pooling: 'mean',
      normalize: true
    });

    // Convert to Float32Array
    // CRITICAL FIX: Handle nested array structure from feature-extraction pipeline
    // With pooling, output is [[batch, hidden_size]], we need the inner array
    const tensorData = await output.tolist();

    // Flatten nested array structure if present
    let embeddingArray;
    if (Array.isArray(tensorData) && tensorData.length > 0 && Array.isArray(tensorData[0])) {
      // Nested array: [[0.1, 0.2, ..., 0.768]] -> extract inner array
      embeddingArray = tensorData[0];
    } else if (Array.isArray(tensorData)) {
      // Flat array: [0.1, 0.2, ..., 0.768]
      embeddingArray = tensorData;
    } else {
      // Unexpected structure
      throw new Error(`Unexpected tensor structure: ${JSON.stringify(tensorData).slice(0, 100)}`);
    }

    return new Float32Array(embeddingArray);
  }

  /**
   * Initialize the Transformers.js pipeline
   */
  async _initializePipeline() {
    console.error(`[Embeddings] Loading Transformers.js model: ${FALLBACK_MODEL}...`);

    try {
      this.transformersPipeline = await pipeline('feature-extraction', FALLBACK_MODEL, {
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            const percent = progress.progress ? Math.round(progress.progress * 100) : progress.progress;
            console.error(`[Embeddings] Loading model: ${percent}%`);
          } else if (progress.status === 'done') {
            console.error('[Embeddings] Model loaded successfully');
          }
        }
      });

      // Detect actual dimension from first embedding
      const testOutput = await this.transformersPipeline('test', {
        pooling: 'mean',
        normalize: true
      });
      const testTensor = await testOutput.tolist();

      // CRITICAL FIX: Handle nested array structure correctly
      // feature-extraction with pooling returns [[batch, hidden_size]]
      // We need to get the inner dimension (hidden_size), not batch size
      let actualDim;
      if (Array.isArray(testTensor)) {
        if (testTensor.length === 0) {
          actualDim = 384; // Fallback default
        } else if (Array.isArray(testTensor[0])) {
          // Nested array: [[0.1, 0.2, ...]] -> use inner array length
          actualDim = testTensor[0].length;
        } else {
          // Flat array: [0.1, 0.2, ...] -> use outer length
          actualDim = testTensor.length;
        }
      } else {
        // Tensor-like object with dims property
        actualDim = testTensor.dims?.[testTensor.dims.length - 1] || 384;
      }

      if (actualDim !== this.dimension) {
        console.warn(`[Embeddings] Dimension mismatch: expected ${this.dimension}, but ${FALLBACK_MODEL} produces ${actualDim}. Using actual dimension.`);
        this.dimension = actualDim;
      }
    } catch (error) {
      console.error('[Embeddings] Failed to load Transformers.js model:', error);
      this.initPromise = null; // Reset to allow retry
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Embedding dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get embedding dimension
   */
  getDimension() {
    return this.dimension;
  }
}

/**
 * Singleton instance for reuse
 */
let singletonInstance = null;

/**
 * Get or create singleton instance
 */
export function getEmbeddingsInstance(options = {}) {
  if (!singletonInstance) {
    singletonInstance = new HybridEmbeddings(options);
  }
  return singletonInstance;
}

/**
 * Reset singleton (mainly for testing)
 */
export function resetEmbeddingsInstance() {
  if (singletonInstance) {
    singletonInstance.clearCache();
  }
  singletonInstance = null;
}

/**
 * Export cosineSimilarity as a named export for convenience
 * (Exported as a function reference to the static method)
 */
export const cosineSimilarity = HybridEmbeddings.cosineSimilarity.bind(HybridEmbeddings);

export default HybridEmbeddings;
