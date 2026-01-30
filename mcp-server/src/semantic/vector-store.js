/**
 * Tiered Vector Store
 *
 * Provides efficient vector similarity search with automatic scaling:
 * - Tier 1: In-memory Map (best for < 5000 chunks)
 * - Tier 2: sqlite-vec (for 5000+ chunks, auto-upgrade)
 *
 * Uses cosine similarity for semantic search.
 */

import { HybridEmbeddings, cosineSimilarity } from './embeddings.js';

/**
 * Auto-upgrade threshold
 */
const UPGRADE_THRESHOLD = 5000;

/**
 * Default similarity threshold
 */
const DEFAULT_THRESHOLD = 0.3;

/**
 * Default embedding dimension (nomic-embed-text-v1.5)
 */
const DEFAULT_DIM = 768;

/**
 * Vector Store class
 */
export class VectorStore {
  constructor(options = {}) {
    this.vectors = new Map();           // chunkId -> Float32Array
    this.metadata = new Map();          // chunkId -> metadata
    this.chunkCount = 0;
    this.dimension = options.dimension || DEFAULT_DIM;
    this.upgradeThreshold = options.upgradeThreshold || UPGRADE_THRESHOLD;
    this.useSqlite = false;
    this.dbPath = options.dbPath;
    this._upgradeWarned = false;        // Track if we've warned about sqlite upgrade
  }

  /**
   * Add or update a vector
   */
  upsert(chunkId, embedding, metadata = {}) {
    if (!(embedding instanceof Float32Array)) {
      embedding = new Float32Array(embedding);
    }

    this.vectors.set(chunkId, embedding);
    this.metadata.set(chunkId, {
      ...metadata,
      chunkId,
      updatedAt: Date.now()
    });

    this.chunkCount = this.vectors.size;

    // Check if we need to upgrade to sqlite (warn only once)
    if (!this.useSqlite && !this._upgradeWarned && this.chunkCount >= this.upgradeThreshold) {
      console.error(`[VectorStore] Chunk count (${this.chunkCount}) >= threshold (${this.upgradeThreshold}), consider upgrading to sqlite-vec`);
      this._upgradeWarned = true;
    }
  }

  /**
   * Batch upsert multiple vectors
   */
  upsertBatch(items) {
    for (const { chunkId, embedding, metadata } of items) {
      this.upsert(chunkId, embedding, metadata);
    }
  }

  /**
   * Get a vector by ID
   */
  get(chunkId) {
    const vector = this.vectors.get(chunkId);
    const metadata = this.metadata.get(chunkId);

    if (!vector || !metadata) return null;

    return { vector, metadata };
  }

  /**
   * Check if a chunk exists
   */
  has(chunkId) {
    return this.vectors.has(chunkId);
  }

  /**
   * Delete a chunk
   */
  delete(chunkId) {
    const deleted = this.vectors.delete(chunkId);
    this.metadata.delete(chunkId);
    const oldCount = this.chunkCount;
    this.chunkCount = this.vectors.size;

    // Reset warning flag if we drop significantly below threshold (hysteresis)
    // This prevents permanent suppression after deletions
    // Use max() to ensure we don't go negative with small thresholds
    const HYSTERESIS_MARGIN = 500;
    const hysteresisThreshold = Math.max(0, this.upgradeThreshold - HYSTERESIS_MARGIN);
    if (this._upgradeWarned && this.chunkCount <= hysteresisThreshold) {
      this._upgradeWarned = false;
    }

    return deleted;
  }

  /**
   * Clear all vectors
   */
  clear() {
    this.vectors.clear();
    this.metadata.clear();
    this.chunkCount = 0;
    // Note: _upgradeWarned flag is NOT reset here to prevent race conditions
    // The flag should persist across clears unless explicitly reset via resetUpgradeWarning()
  }

  /**
   * Update the embedding dimension (called after actual dimension is detected)
   */
  setDimension(dimension) {
    if (this.dimension !== dimension && this.chunkCount > 0) {
      console.warn(`[VectorStore] Dimension mismatch detected! Existing vectors have ${this.dimension} dims, but trying to use ${dimension} dims. Clearing vector store.`);
      this.clear();
    }
    this.dimension = dimension;
  }

  /**
   * Get current embedding dimension
   */
  getDimension() {
    return this.dimension;
  }

  /**
   * Search for similar vectors
   */
  search(queryEmbedding, options = {}) {
    const {
      limit = 10,
      threshold = DEFAULT_THRESHOLD,
      filters = {}
    } = options;

    if (!(queryEmbedding instanceof Float32Array)) {
      queryEmbedding = new Float32Array(queryEmbedding);
    }

    const results = [];

    for (const [chunkId, vector] of this.vectors.entries()) {
      const metadata = this.metadata.get(chunkId);

      // Apply filters
      if (!this._passesFilters(metadata, filters)) {
        continue;
      }

      // Calculate similarity
      const similarity = cosineSimilarity(queryEmbedding, vector);

      if (similarity >= threshold) {
        results.push({
          chunkId,
          similarity,
          metadata
        });
      }
    }

    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    // Return top results
    return results.slice(0, limit);
  }

  /**
   * Extract meaningful terms from query text
   * Identifies code identifiers, camelCase words, and quoted strings
   *
   * @param {string} queryText - The query text to analyze
   * @returns {string[]} Array of extracted terms
   */
  _extractQueryTerms(queryText) {
    if (!queryText) return [];

    const terms = [];

    // Extract identifiers (camelCase, snake_case, etc.)
    const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const identifiers = queryText.match(identifierRegex) || [];
    terms.push(...identifiers);

    // Extract quoted strings
    const quotedRegex = /['"]([^'"]+)['"]/g;
    let match;
    while ((match = quotedRegex.exec(queryText)) !== null) {
      terms.push(match[1]);
    }

    // Extract words from camelCase (e.g., "getChunkById" -> ["get", "Chunk", "By", "Id"])
    for (const id of identifiers) {
      const camelWords = id
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .split(/\s+/);
      terms.push(...camelWords.filter(w => w.length > 2));
    }

    // Return unique, non-empty terms
    return [...new Set(terms.filter(t => t && t.length > 1))];
  }

  /**
   * Calculate name match score for query terms
   * Checks for exact matches and partial matches with symbol names
   *
   * @param {string[]} queryTerms - Extracted query terms
   * @param {string} symbolName - The symbol name to compare against
   * @returns {number} Match score from 0 to 1
   */
  _calculateNameMatch(queryTerms, symbolName) {
    if (!queryTerms.length || !symbolName) return 0;

    const nameLower = symbolName.toLowerCase();
    let maxScore = 0;

    for (const term of queryTerms) {
      const termLower = term.toLowerCase();

      // Exact match
      if (termLower === nameLower) {
        return 1.0;
      }

      // Prefix match (e.g., "get" matches "getChunk")
      if (nameLower.startsWith(termLower)) {
        maxScore = Math.max(maxScore, 0.8);
      }

      // Contains match
      if (nameLower.includes(termLower) || termLower.includes(nameLower)) {
        maxScore = Math.max(maxScore, 0.5);
      }

      // Check camelCase components
      const camelWords = symbolName
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .split(/\s+/);

      for (const word of camelWords) {
        if (word === termLower) {
          maxScore = Math.max(maxScore, 0.7);
        }
      }
    }

    return maxScore;
  }

  /**
   * Search by text (requires embedding provider)
   * Now supports symbol name boosting for better relevance
   */
  async searchByText(query, embeddings, options = {}) {
    const {
      queryText = null,
      ...remainingOptions
    } = options;

    const queryEmbedding = await embeddings.getEmbedding(query);
    const results = this.search(queryEmbedding, remainingOptions);

    // Apply symbol name boost if query text is provided
    if (queryText) {
      const queryTerms = this._extractQueryTerms(queryText);

      if (queryTerms.length > 0) {
        // Boost results with matching symbol names by 0.15
        const NAME_BOOST = 0.15;

        const boosted = results.map(r => {
          const nameMatch = this._calculateNameMatch(queryTerms, r.metadata?.name || '');

          if (nameMatch > 0) {
            return {
              ...r,
              similarity: Math.min(1.0, r.similarity + (nameMatch * NAME_BOOST)),
              nameMatchBoost: nameMatch * NAME_BOOST
            };
          }

          return r;
        });

        // Re-sort after boosting
        boosted.sort((a, b) => b.similarity - a.similarity);
        return boosted;
      }
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      chunkCount: this.chunkCount,
      dimension: this.dimension,
      useSqlite: this.useSqlite,
      memoryBytes: this._estimateMemoryUsage(),
      upgradeThreshold: this.upgradeThreshold
    };
  }

  /**
   * Export all data
   */
  export() {
    const data = {
      version: 1,
      chunkCount: this.chunkCount,
      dimension: this.dimension,
      vectors: {},
      metadata: {}
    };

    for (const [chunkId, vector] of this.vectors.entries()) {
      // Convert Float32Array to regular array for JSON serialization
      data.vectors[chunkId] = Array.from(vector);
    }

    for (const [chunkId, metadata] of this.metadata.entries()) {
      data.metadata[chunkId] = metadata;
    }

    return data;
  }

  /**
   * Import data
   */
  import(data) {
    this.clear();  // This resets _upgradeWarned flag

    if (data.version !== 1) {
      throw new Error(`Unsupported vector store version: ${data.version}`);
    }

    this.dimension = data.dimension;

    for (const [chunkId, vectorArray] of Object.entries(data.vectors)) {
      const vector = new Float32Array(vectorArray);
      const metadata = data.metadata[chunkId] || {};
      this.upsert(chunkId, vector, metadata);
    }

    console.error(`[VectorStore] Imported ${this.chunkCount} chunks`);
  }

  /**
   * Apply filters to metadata
   */
  _passesFilters(metadata, filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return true;
    }

    // File path filter
    if (filters.filePath && metadata.file !== filters.filePath) {
      return false;
    }

    // Chunk type filter
    if (filters.chunkType && metadata.type !== filters.chunkType) {
      return false;
    }

    // Exported only filter
    if (filters.exportedOnly === true && !metadata.exported) {
      return false;
    }

    // Layer filter (for HNW architecture)
    if (filters.layer) {
      const fileLayer = this._extractLayer(metadata.file || '');
      if (fileLayer !== filters.layer) {
        return false;
      }
    }

    // File pattern filter (with ReDoS protection)
    if (filters.filePattern) {
      try {
        // Limit pattern complexity to prevent ReDoS
        const patternStr = filters.filePattern;
        if (patternStr.length > 200) {
          console.warn('[VectorStore] filePattern too long, truncating');
          return false;
        }

        // Disallow nested quantifiers and complex patterns
        if (/(?:\*\*|\*\?|\{|\})|\^|\$/.test(patternStr)) {
          console.warn('[VectorStore] filePattern contains unsupported pattern, ignoring filter');
          return false;
        }

        const pattern = new RegExp(patternStr);
        if (!pattern.test(metadata.file || '')) {
          return false;
        }
      } catch (e) {
        console.warn('[VectorStore] Invalid filePattern:', e.message);
        return false;
      }
    }

    return true;
  }

  /**
   * Extract HNW layer from file path
   */
  _extractLayer(filePath) {
    if (filePath.includes('/controllers/')) return 'controllers';
    if (filePath.includes('/services/')) return 'services';
    if (filePath.includes('/providers/')) return 'providers';
    if (filePath.includes('/utils/')) return 'utils';
    if (filePath.includes('/storage/')) return 'storage';
    return 'unknown';
  }

  /**
   * Estimate memory usage
   */
  _estimateMemoryUsage() {
    // Each float32 is 4 bytes
    const vectorBytes = this.chunkCount * this.dimension * 4;
    // Rough estimate for metadata (JSON overhead)
    const metadataBytes = this.chunkCount * 500;

    return vectorBytes + metadataBytes;
  }

  /**
   * Find similar chunks to a given chunk
   */
  findSimilar(chunkId, options = {}) {
    const chunk = this.get(chunkId);
    if (!chunk) {
      return [];
    }

    const { limit = 10, threshold = DEFAULT_THRESHOLD } = options;

    const results = [];
    const vector = chunk.vector;

    for (const [otherId, otherVector] of this.vectors.entries()) {
      if (otherId === chunkId) continue;

      const similarity = cosineSimilarity(vector, otherVector);

      if (similarity >= threshold) {
        results.push({
          chunkId: otherId,
          similarity,
          metadata: this.metadata.get(otherId)
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Get chunks by file
   */
  getByFile(filePath) {
    const chunks = [];

    for (const [chunkId, metadata] of this.metadata.entries()) {
      if (metadata.file === filePath) {
        chunks.push({
          chunkId,
          metadata,
          vector: this.vectors.get(chunkId)
        });
      }
    }

    return chunks;
  }

  /**
   * Get all unique files
   */
  getFiles() {
    const files = new Set();

    for (const metadata of this.metadata.values()) {
      if (metadata.file) {
        files.add(metadata.file);
      }
    }

    return Array.from(files);
  }

  /**
   * Get chunks by type
   */
  getByType(type) {
    const chunks = [];

    for (const [chunkId, metadata] of this.metadata.entries()) {
      if (metadata.type === type) {
        chunks.push({
          chunkId,
          metadata,
          vector: this.vectors.get(chunkId)
        });
      }
    }

    return chunks;
  }

  /**
   * Merge another vector store into this one
   */
  merge(otherStore) {
    for (const [chunkId, vector] of otherStore.vectors.entries()) {
      const metadata = otherStore.metadata.get(chunkId);

      // Only add if not already present or if newer
      const existing = this.metadata.get(chunkId);
      if (!existing || (metadata.updatedAt && existing.updatedAt && metadata.updatedAt > existing.updatedAt)) {
        this.upsert(chunkId, vector, metadata);
      }
    }
  }
}

/**
 * Re-export cosine similarity for convenience
 */
export { cosineSimilarity };

/**
 * Default export
 */
export { VectorStore as default };
