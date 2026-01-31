/**
 * Hybrid Embeddings Provider
 *
 * Provides embeddings with configurable mode and fallback strategy:
 *
 * MODES (set via RC_EMBEDDING_MODE or config.js):
 * - 'local'  : Transformers.js → LM Studio (default, free, private)
 * - 'cloud'  : OpenRouter only (fast, paid)
 * - 'hybrid' : Transformers.js → LM Studio → OpenRouter
 *
 * PROVIDERS:
 * 1. Transformers.js (local, CPU-based, dynamic model selection)
 *    - Jina Code Embeddings v2 for code queries (SOTA on CoIR: 68.53%)
 *    - Xenova/gte-base for general queries (high quality)
 * 2. LM Studio (local, GPU-accelerated, single model)
 * 3. OpenRouter (cloud, paid, fast)
 *    - Uses OpenAI text-embedding-3-small with configurable dimensions
 *
 * All models output 768-dimension embeddings (configured in config.js).
 *
 * @module semantic/embeddings
 */

import { env, pipeline } from '@xenova/transformers';
import { mkdir, writeFile } from 'fs/promises';
import {
  EMBEDDING_DIMENSION,
  EMBEDDING_MODE,
  PROVIDER_PRIORITY,
  OPENROUTER_CONFIG,
  TRANSFORMERS_CONFIG,
  LMSTUDIO_CONFIG,
  EMBEDDING_CACHE_CONFIG,
  MODEL_DIMENSIONS
} from './config.js';

// Configure Transformers.js for browser-less environment
env.allowLocalModels = true;
env.allowRemoteModels = true;

// Use centralized config
const DEFAULT_ENDPOINT = LMSTUDIO_CONFIG.endpoint;
const DEFAULT_MODEL = LMSTUDIO_CONFIG.model;
const FALLBACK_MODEL = TRANSFORMERS_CONFIG.generalModel;
const JINA_CODE_MODEL = TRANSFORMERS_CONFIG.codeModel;
const DEFAULT_DIM = EMBEDDING_DIMENSION;
const DIMENSIONS = MODEL_DIMENSIONS;

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
    // Mode determines which providers are used
    this.mode = options.mode || EMBEDDING_MODE;
    this.providerPriority = options.providerPriority || PROVIDER_PRIORITY;

    // LM Studio config
    this.endpoint = options.endpoint || LMSTUDIO_CONFIG.endpoint;
    this.modelName = options.model || LMSTUDIO_CONFIG.model;

    // OpenRouter config
    this.openRouterApiKey = options.openRouterApiKey || OPENROUTER_CONFIG.apiKey;
    this.openRouterBaseUrl = OPENROUTER_CONFIG.baseUrl;
    this.openRouterModel = OPENROUTER_CONFIG.model;

    // Shared config
    this.dimension = options.dimension || EMBEDDING_DIMENSION;
    this.ttl = options.ttl || EMBEDDING_CACHE_CONFIG.ttl;
    this.forceTransformers = options.forceTransformers || TRANSFORMERS_CONFIG.forceOnly;

    this.transformersPipeline = null;
    this.transformersModel = FALLBACK_MODEL;  // Track which model is loaded
    this.initPromises = new Map();  // Per-model loading promises (fixes race condition)
    this.transformersLoading = false;
    this.lmStudioAvailable = null;
    this.openRouterAvailable = null;
    this.lastCheck = 0;
    this.checkInterval = 30000; // Check availability every 30s

    this.cache = new Map();
    this.cacheStats = { hits: 0, misses: 0 };

    console.error(`[Embeddings] Mode: ${this.mode}, Providers: ${this.providerPriority.join(' → ')}, Dimension: ${this.dimension}`);
  }

  /**
   * Get embedding for a single text
   */
  async getEmbedding(text) {
    // Determine which model will be used before caching
    const selectedModel = await this._selectModelForQuery(text);
    const cacheKey = this.getCacheKey(text, selectedModel);

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

    // Cache result with model-aware key
    this.cache.set(cacheKey, {
      embedding,
      timestamp: Date.now()
    });

    return embedding;
  }

  /**
   * Get embeddings for multiple texts (batch processing)
   * Respects provider priority from config (cloud/local/hybrid mode)
   */
  async getBatchEmbeddings(texts) {
    const errors = [];

    console.error(`[Embeddings] getBatchEmbeddings called with ${texts.length} texts, mode: ${this.mode}, providers: ${this.providerPriority.join(', ')}`);

    // Try each provider in priority order (respects EMBEDDING_MODE)
    for (const provider of this.providerPriority) {
      try {
        switch (provider) {
          case 'openrouter':
            console.error(`[Embeddings] Checking OpenRouter: enabled=${OPENROUTER_CONFIG.enabled}, hasKey=${!!this.openRouterApiKey}`);
            if (OPENROUTER_CONFIG.enabled && this.openRouterApiKey) {
              console.error(`[Embeddings] Using OpenRouter for batch of ${texts.length} texts`);
              return await this._fetchBatchEmbeddingsOpenRouter(texts);
            }
            break;

          case 'lmstudio':
            if (LMSTUDIO_CONFIG.enabled && await this.isLMStudioAvailable()) {
              console.error(`[Embeddings] Using LM Studio for batch of ${texts.length} texts`);
              return await this._fetchBatchEmbeddingsLMStudio(texts);
            }
            break;

          case 'transformers':
            if (TRANSFORMERS_CONFIG.enabled) {
              console.error(`[Embeddings] Using Transformers.js for batch of ${texts.length} texts`);
              return await this._fetchBatchWithTransformers(texts);
            }
            break;
        }
      } catch (error) {
        errors.push({ provider, error: error.message });
        console.error(`[Embeddings] ${provider} batch failed:`, error.message);
      }
    }

    // All configured providers failed - try transformers as last resort fallback
    if (!this.providerPriority.includes('transformers') && TRANSFORMERS_CONFIG.enabled) {
      try {
        console.error(`[Embeddings] All configured providers failed, falling back to Transformers.js`);
        return await this._fetchBatchWithTransformers(texts);
      } catch (fallbackError) {
        errors.push({ provider: 'transformers-fallback', error: fallbackError.message });
      }
    }

    // All providers failed
    const errorSummary = errors.map(e => `${e.provider}: ${e.error}`).join('; ');
    throw new Error(`All embedding providers failed for batch: ${errorSummary}`);
  }

  /**
   * Fetch batch embeddings using Transformers.js with model-aware batching
   * Groups queries by type (code vs general) to use optimal models
   */
  async _fetchBatchWithTransformers(texts) {
    // Classify each query by its optimal model
    const codeQueries = [];
    const generalQueries = [];

    for (let i = 0; i < texts.length; i++) {
      if (this._isCodeQuery(texts[i])) {
        codeQueries.push({ text: texts[i], index: i });
      } else {
        generalQueries.push({ text: texts[i], index: i });
      }
    }

    const results = new Array(texts.length);

    // Process code queries with Jina model
    if (codeQueries.length > 0) {
      const codeEmbeddings = await this._fetchBatchWithModel(
        codeQueries.map(q => q.text),
        JINA_CODE_MODEL
      );
      codeQueries.forEach((q, i) => results[q.index] = codeEmbeddings[i]);
    }

    // Process general queries with fallback model
    if (generalQueries.length > 0) {
      const generalEmbeddings = await this._fetchBatchWithModel(
        generalQueries.map(q => q.text),
        FALLBACK_MODEL
      );
      generalQueries.forEach((q, i) => results[q.index] = generalEmbeddings[i]);
    }

    return results;
  }

  /**
   * Fetch embeddings for a batch of texts using a specific model
   * Prevents model switching during batch processing
   */
  async _fetchBatchWithModel(texts, modelName) {
    // Ensure the specified model is loaded
    if (!this.transformersPipeline || this.transformersModel !== modelName) {
      if (!this.initPromises.has(modelName)) {
        this.initPromises.set(modelName, this._initializePipeline(modelName));
      }
      await this.initPromises.get(modelName);

      // Clean up old model's promise
      if (this.transformersModel !== modelName && this.transformersModel) {
        this.initPromises.delete(this.transformersModel);
      }
    }

    // Process batch with the loaded model
    const results = [];
    for (const text of texts) {
      const output = await this.transformersPipeline(text, {
        pooling: 'mean',
        normalize: true
      });

      const tensorData = await output.tolist();
      let embeddingArray;
      if (Array.isArray(tensorData) && tensorData.length > 0 && Array.isArray(tensorData[0])) {
        embeddingArray = tensorData[0];
      } else if (Array.isArray(tensorData)) {
        embeddingArray = tensorData;
      } else {
        throw new Error(`Unexpected tensor structure: ${JSON.stringify(tensorData).slice(0, 100)}`);
      }

      results.push(new Float32Array(embeddingArray));
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
   * Returns the actual source being used (Transformers.js is now primary)
   */
  getCurrentSource() {
    // Transformers.js is always available (it's the primary source)
    // The model used depends on query type (selected dynamically)
    return {
      source: 'transformers',
      model: this.transformersModel || FALLBACK_MODEL,
      fallbackAvailable: this.lmStudioAvailable,
      isCodeSpecialized: this.isCodeSpecific()
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
   * Generate cache key from text and model
   * Includes model name to prevent cross-model cache pollution
   */
  getCacheKey(text, modelName = null) {
    // Simple hash for caching (in production, use crypto.subtle)
    let hash = 0;
    const str = text.trim().substring(0, 200); // Limit key size
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Include model name in cache key to prevent cross-model pollution
    // Use current model if not specified (for backward compatibility)
    const model = modelName || this.transformersModel || FALLBACK_MODEL;
    const modelPrefix = model.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);

    return `emb_${modelPrefix}_${hash}_${str.length}`;
  }

  /**
   * Detect if query contains code-specific patterns
   * Uses heuristic: common programming keywords with context and syntax
   *
   * Three-tier detection to reduce false positives:
   * 1. Strong code patterns - keyword followed by identifier/bracket (rare in natural language)
   * 2. Syntax patterns - brackets/operators in code-like context
   * 3. Weak keywords - only match when combined with other code patterns
   */
  _isCodeQuery(query) {
    if (!query || typeof query !== 'string') return false;

    // First, exclude common natural language phrases that contain code words
    const naturalLanguagePhrases = /\b(the function of|class action|class income|middle class|world class|first class|business class|working class|return on|return ticket|for sale|for free|for ever|while ago|if you|if we|if the|else can|else will)\b/i;
    if (naturalLanguagePhrases.test(query)) {
      // Check for additional strong code indicators before ruling out
      const overridePatterns = /\b(function|class|const|let|var|import|export|def)\s*\(|\b(function|class|const|let|var|import|export|def)\s+[a-z_][a-zA-Z0-9_]*\s*\(/;
      if (!overridePatterns.test(query)) {
        // Only check syntax patterns for potential override
        const syntaxPatterns = /\w+\s*\(\s*\)|\+\+|--|=>|::|&&|\|\||\{[\s\S]*\}/;
        if (syntaxPatterns.test(query)) {
          return true; // Override - has code syntax
        }
        return false; // Natural language phrase detected
      }
    }

    // Strong code-specific indicators (keyword followed by identifier or bracket)
    // Matches: "function foo", "const x", "import {", "class Foo", etc.
    const strongCodePatterns = /\b(function|class|const|let|var|import|export|def|async|await|interface|type|enum|struct|impl|fn|pub|mut)\s+[a-zA-Z_<{\[]/;

    // Syntax patterns that are very rare in natural language
    // Matches: "foo()", "x++", "=>", "::", etc.
    const syntaxPatterns = /\w+\s*\(\s*\)|\+\+|--|=>|::|&&|\|\||[{}();[\]<>&|]\s*\w/;

    // Programming keywords that need context (followed by bracket or operator)
    // Matches: "if(", "for {", "return x", etc.
    const contextualKeywords = /\b(return|static|try|catch|throw|break|continue|switch|case)\b.*[({\w]|\b(if|else|for|while)\s*\(/;

    // Check for standalone function/class keyword (at end or followed by paren)
    const standaloneKeywords = /\b(function|class)\s*\(/;

    // Check for keyword at end of query
    const keywordAtEnd = /\b(function|class|const|def|import|export|async|await|return|static|try|catch|throw|break|continue|switch|case|interface|type|enum|struct|impl|fn|pub|mut)$\b/;

    // Count number of code indicators
    let codeIndicatorCount = 0;
    if (strongCodePatterns.test(query)) codeIndicatorCount += 3;
    if (syntaxPatterns.test(query)) codeIndicatorCount += 2;
    if (contextualKeywords.test(query)) codeIndicatorCount += 1;
    if (standaloneKeywords.test(query)) codeIndicatorCount += 2;
    if (keywordAtEnd.test(query)) codeIndicatorCount += 2;  // Increased from 1 to 2

    // Require at least 2 indicators for code classification (reduces false positives)
    return codeIndicatorCount >= 2;
  }

  /**
   * Select appropriate model based on query content
   * Returns Jina Code Embeddings for code queries, general model otherwise
   */
  async _selectModelForQuery(query) {
    // Check if query contains code patterns
    if (this._isCodeQuery(query)) {
      return JINA_CODE_MODEL;
    }
    return FALLBACK_MODEL;
  }

  /**
   * Fetch embedding from appropriate source based on provider priority
   * Priority determined by EMBEDDING_MODE in config.js
   */
  async _fetchEmbedding(text) {
    const errors = [];

    for (const provider of this.providerPriority) {
      try {
        switch (provider) {
          case 'transformers':
            if (TRANSFORMERS_CONFIG.enabled) {
              return await this._fetchEmbeddingTransformers(text);
            }
            break;

          case 'lmstudio':
            if (LMSTUDIO_CONFIG.enabled && await this.isLMStudioAvailable()) {
              return await this._fetchEmbeddingLMStudio(text);
            }
            break;

          case 'openrouter':
            if (OPENROUTER_CONFIG.enabled && this.openRouterApiKey) {
              return await this._fetchEmbeddingOpenRouter(text);
            }
            break;
        }
      } catch (error) {
        errors.push({ provider, error: error.message });
        console.error(`[Embeddings] ${provider} failed:`, error.message);
      }
    }

    // All providers failed
    const errorSummary = errors.map(e => `${e.provider}: ${e.error}`).join('; ');
    throw new Error(`All embedding providers failed: ${errorSummary}`);
  }

  /**
   * Fetch embedding from OpenRouter API
   */
  async _fetchEmbeddingOpenRouter(text) {
    const { signal, clearTimeout: clearFetchTimeout } = createTimeoutSignal(OPENROUTER_CONFIG.timeout);

    try {
      const response = await fetch(`${this.openRouterBaseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.openRouterModel,
          input: text,
          dimensions: EMBEDDING_DIMENSION  // Request specific dimension
        }),
        signal
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const embedding = data.data?.[0]?.embedding;

      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding response from OpenRouter');
      }

      // Validate dimension
      if (embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(`OpenRouter returned ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSION}`);
      }

      return new Float32Array(embedding);
    } finally {
      clearFetchTimeout();
    }
  }

  /**
   * Fetch batch embeddings from OpenRouter API
   */
  async _fetchBatchEmbeddingsOpenRouter(texts) {
    const { signal, clearTimeout: clearFetchTimeout } = createTimeoutSignal(60000);

    try {
      const response = await fetch(`${this.openRouterBaseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.openRouterModel,
          input: texts,
          dimensions: EMBEDDING_DIMENSION
        }),
        signal
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter batch error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const embeddings = data.data;

      if (!Array.isArray(embeddings)) {
        throw new Error('Invalid batch embedding response from OpenRouter');
      }

      // Sort by index and extract embeddings
      return embeddings
        .sort((a, b) => a.index - b.index)
        .map(item => new Float32Array(item.embedding));
    } finally {
      clearFetchTimeout();
    }
  }

  /**
   * Fetch embedding from LM Studio
   */
  async _fetchEmbeddingLMStudio(text) {
    const { signal, clearTimeout: clearFetchTimeout } = createTimeoutSignal(30000);

    try {
      const response = await fetch(`${this.endpoint}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          input: text
        }),
        signal
      });

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
    } finally {
      // CRITICAL FIX: Always clear timeout, even if fetch throws
      clearFetchTimeout();
    }
  }

  /**
   * Fetch batch embeddings from LM Studio
   */
  async _fetchBatchEmbeddingsLMStudio(texts) {
    const { signal, clearTimeout: clearFetchTimeout } = createTimeoutSignal(60000);

    try {
      const response = await fetch(`${this.endpoint}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          input: texts
        }),
        signal
      });

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
    } finally {
      // CRITICAL FIX: Always clear timeout, even if fetch throws
      clearFetchTimeout();
    }
  }

  /**
   * Fetch embedding from Transformers.js
   * Uses Jina Code Embeddings for code queries, general model otherwise
   */
  async _fetchEmbeddingTransformers(text) {
    // Select appropriate model based on query content
    const selectedModel = await this._selectModelForQuery(text);

    // Reinitialize pipeline if a different model is needed
    if (!this.transformersPipeline || this.transformersModel !== selectedModel) {
      // Use per-model loading promises to prevent race conditions
      if (!this.initPromises.has(selectedModel)) {
        this.initPromises.set(selectedModel, this._initializePipeline(selectedModel));
      }
      await this.initPromises.get(selectedModel);

      // Clean up old model's promise to prevent memory leak
      if (this.transformersModel !== selectedModel && this.transformersModel) {
        this.initPromises.delete(this.transformersModel);
      }
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
   * @param {string} modelName - The model to load (defaults to FALLBACK_MODEL)
   */
  async _initializePipeline(modelName = FALLBACK_MODEL) {
    console.error(`[Embeddings] Loading Transformers.js model: ${modelName}${modelName === JINA_CODE_MODEL ? ' (code-specialized)' : ''}...`);

    try {
      // Dispose old pipeline if switching models to prevent memory leak
      if (this.transformersPipeline && this.transformersModel && this.transformersModel !== modelName) {
        try {
          if (typeof this.transformersPipeline.dispose === 'function') {
            await this.transformersPipeline.dispose();
            console.error(`[Embeddings] Disposed previous model: ${this.transformersModel}`);
          }
        } catch (e) {
          console.warn(`[Embeddings] Failed to dispose old pipeline: ${e.message}`);
        }
        this.transformersPipeline = null;
      }

      this.transformersPipeline = await pipeline('feature-extraction', modelName, {
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            const percent = progress.progress ? Math.round(progress.progress * 100) : progress.progress;
            console.error(`[Embeddings] Loading model: ${percent}%`);
          } else if (progress.status === 'done') {
            console.error(`[Embeddings] Model loaded successfully: ${modelName}`);
          }
        }
      });

      // Track which model is loaded
      this.transformersModel = modelName;

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
        console.warn(`[Embeddings] Dimension mismatch: expected ${this.dimension}, but ${modelName} produces ${actualDim}. Using actual dimension.`);
        this.dimension = actualDim;
      }
    } catch (error) {
      console.error(`[Embeddings] Failed to load Transformers.js model (${modelName}):`, error);
      // Clear the failed promise from map to allow retry
      this.initPromises.delete(modelName);
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
   * Supports dynamic dimension detection for different models
   */
  getDimension() {
    // Check if current model has predefined dimension
    const modelDim = DIMENSIONS[this.modelName];
    if (modelDim) {
      return modelDim;
    }

    // Return detected dimension (updated after first embedding)
    return this.dimension;
  }

  /**
   * Get the current model name
   */
  getModelName() {
    return this.modelName;
  }

  /**
   * Get model version info for cache invalidation
   * Returns detailed information about the currently active model
   */
  getModelInfo() {
    const source = this.getCurrentSource();

    return {
      name: source.model,
      source: source.source,
      dimension: this.getDimension(),
      type: source.isCodeSpecialized ? 'code-specialized' : 'general-purpose',
      fallbackAvailable: source.fallbackAvailable,
      hasDynamicSelection: true  // Indicates support for per-query model selection
    };
  }

  /**
   * Check if the current model is code-specialized
   */
  isCodeSpecific() {
    const model = this.transformersModel || FALLBACK_MODEL;
    return model.includes('jina-embeddings-v2-base-code') || model.includes('jina-code');
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
