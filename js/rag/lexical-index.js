/**
 * BM25 Lexical Index for RAG
 *
 * Provides fast keyword-based search using the BM25 ranking algorithm.
 * Adapted from MCP server for music domain with specialized tokenization
 * for artist names, track titles, and music-specific terms.
 *
 * BM25 formula:
 *   score = IDF(qi) * (f(qi,D) * (k1 + 1)) / (f(qi,D) + k1 * (1 - b + b * |D| / avgdl))
 *
 * @module rag/lexical-index
 */

import { passesFilters } from './filters.js';
import { BM25_CONFIG } from './config.js';

/**
 * Stopwords to filter out (common English words that add little meaning)
 * Alphabetized for maintainability
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by',
  'for', 'from', 'had', 'has', 'have', 'he', 'her', 'how',
  'i', 'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or',
  'our', 'she', 'that', 'the', 'they', 'this', 'to', 'was',
  'we', 'what', 'when', 'where', 'which', 'who', 'why',
  'will', 'with', 'you', 'your'
]);

/**
 * Music-specific terms to preserve (not filter as stopwords)
 */
const MUSIC_PRESERVE = new Set([
  'feat', 'featuring', 'ft', 'vs', 'remix', 'live', 'acoustic',
  'version', 'edit', 'mix', 'cover', 'instrumental', 'original',
  'radio', 'extended', 'remaster', 'remastered', 'deluxe'
]);

/**
 * Lexical Index class using BM25 ranking
 */
export class LexicalIndex {
  constructor(options = {}) {
    // BM25 parameters
    this.k1 = options.k1 ?? BM25_CONFIG.k1;
    this.b = options.b ?? BM25_CONFIG.b;

    // Index storage
    this.documents = new Map();           // chunkId -> { text, metadata, terms }
    this.termFreqs = new Map();            // chunkId -> Map(term -> frequency)
    this.docFreqs = new Map();             // term -> number of documents containing term
    this.docLengths = new Map();           // chunkId -> document length (term count)

    // Statistics
    this.totalDocs = 0;
    this.avgDocLen = 0;
    this.totalTerms = 0;

    // State
    this._indexed = false;
    this._idCounter = 0;  // Counter for unique ID generation
  }

  /**
   * Check if index has been built
   *
   * @returns {boolean} True if indexed
   */
  isIndexed() {
    return this._indexed && this.totalDocs > 0;
  }

  /**
   * Index chunks for lexical search
   *
   * @param {Array} chunks - Array of chunk objects with id, text, and metadata
   */
  index(chunks) {
    for (const chunk of chunks) {
      this._indexChunk(chunk);
    }

    // Recalculate average document length
    this._calculateAvgDocLen();
    this._indexed = true;

    console.log(`[LexicalIndex] Indexed ${this.totalDocs} documents with ${this.docFreqs.size} unique terms`);
  }

  /**
   * Index a single chunk
   *
   * @param {Object} chunk - Chunk object with id, text, type, and metadata
   */
  _indexChunk(chunk) {
    // Handle both { id, text, metadata } and { type, text, metadata } formats
    const id = chunk.id || this._generateId(chunk);
    const text = chunk.text || '';
    const metadata = chunk.metadata || {};
    const type = chunk.type || metadata.type || 'unknown';

    // Extract terms from chunk
    const terms = this._extractTerms({ text, type, metadata });

    // Skip empty documents
    if (terms.length === 0) {
      return;
    }

    // Handle re-indexing: subtract old stats if document already exists
    if (this.documents.has(id)) {
      const oldDocLen = this.docLengths.get(id) || 0;
      this.totalTerms -= oldDocLen;

      // Decrement document frequencies for old terms
      const oldTfMap = this.termFreqs.get(id);
      if (oldTfMap) {
        for (const term of oldTfMap.keys()) {
          const df = this.docFreqs.get(term) || 0;
          if (df <= 1) {
            this.docFreqs.delete(term);
          } else {
            this.docFreqs.set(term, df - 1);
          }
        }
      }
    }

    // Calculate term frequencies
    const tfMap = new Map();
    for (const term of terms) {
      tfMap.set(term, (tfMap.get(term) || 0) + 1);
    }

    // Store document
    this.documents.set(id, {
      text,
      metadata: { ...metadata, type, chunkId: id },
      terms
    });

    // Store term frequencies
    this.termFreqs.set(id, tfMap);

    // Store document length
    this.docLengths.set(id, terms.length);

    // Update document frequencies
    for (const term of tfMap.keys()) {
      this.docFreqs.set(term, (this.docFreqs.get(term) || 0) + 1);
    }

    // Update statistics
    this.totalDocs = this.documents.size;
    this.totalTerms += terms.length;
  }

  /**
   * Generate unique ID for chunk
   * Uses counter + timestamp + content hash to ensure uniqueness in batch operations
   *
   * @param {Object} chunk - Chunk object
   * @returns {string} Generated ID
   */
  _generateId(chunk) {
    const type = chunk.type || 'unknown';
    const text = chunk.text || '';
    // Simple hash from type + first 50 chars of text
    const textHash = text.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '');
    // Use counter to ensure uniqueness even in tight loops
    return `${type}_${textHash}_${Date.now()}_${++this._idCounter}`;
  }

  /**
   * Extract meaningful terms from a chunk
   *
   * @param {Object} chunk - Chunk object with text, type, metadata
   * @returns {Array<string>} Array of normalized terms
   */
  _extractTerms(chunk) {
    const terms = [];

    // Extract from metadata fields
    if (chunk.metadata?.artist) {
      terms.push(...this._tokenizeArtist(chunk.metadata.artist));
    }

    if (chunk.metadata?.artists) {
      for (const artist of chunk.metadata.artists) {
        terms.push(...this._tokenizeArtist(artist));
      }
    }

    if (chunk.metadata?.patternType) {
      terms.push(chunk.metadata.patternType.toLowerCase());
    }

    if (chunk.metadata?.month) {
      terms.push(chunk.metadata.month);
      // Also add year separately
      const [year] = chunk.metadata.month.split('-');
      if (year) terms.push(year);
    }

    // Extract keywords from text
    const textTerms = this._tokenizeText(chunk.text || '');
    terms.push(...textTerms);

    // Filter stopwords and normalize (but preserve music terms)
    return terms.filter(term =>
      term.length > 1 &&
      (!STOPWORDS.has(term.toLowerCase()) || MUSIC_PRESERVE.has(term.toLowerCase()))
    );
  }

  /**
   * Tokenize artist name (handles "feat.", "&", collaborations)
   * Supports Unicode characters for international artist names
   *
   * @param {string} artist - Artist name
   * @returns {Array<string>} Array of tokens
   */
  _tokenizeArtist(artist) {
    if (!artist || typeof artist !== 'string') {
      return [];
    }

    const tokens = [];

    // Add the full artist name as a token (for exact matching)
    tokens.push(artist.toLowerCase().trim());

    // Split on collaboration markers (Unicode-aware)
    const parts = artist
      .split(/\s+(?:feat\.?|featuring|ft\.?|&|and|vs\.?|x|\+)\s+/i)
      .flatMap(part => part.split(/[,;]/));

    for (const part of parts) {
      const cleaned = part.trim().toLowerCase();
      if (cleaned && cleaned.length > 1) {
        tokens.push(cleaned);

        // Also add individual words from multi-word artist names (Unicode-aware)
        // \p{L} matches any Unicode letter
        const words = cleaned.match(/[\p{L}]+/gu) || [];
        if (words.length > 1) {
          tokens.push(...words.filter(w => w.length > 2));
        }
      }
    }

    return tokens;
  }

  /**
   * Tokenize text content
   * Supports Unicode characters for international artist names
   *
   * @param {string} text - Text content
   * @returns {Array<string>} Array of tokens
   */
  _tokenizeText(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const tokens = [];

    // Match words including Unicode letters (supports international artist names)
    // \p{L} matches any Unicode letter, \p{N} matches any Unicode number
    const wordRegex = /[\p{L}][\p{L}\p{N}']*\b/gu;
    const words = text.match(wordRegex) || [];

    for (const word of words) {
      const lower = word.toLowerCase();

      // Skip very short words (except music terms)
      if (lower.length < 3 && !MUSIC_PRESERVE.has(lower)) {
        continue;
      }

      // Keep music-specific terms
      if (MUSIC_PRESERVE.has(lower)) {
        tokens.push(lower);
        continue;
      }

      tokens.push(lower);
    }

    // Extract numbers (years, play counts)
    const numberRegex = /\b(19|20)\d{2}\b|\b\d+\s*(?:plays?|hours?|tracks?)\b/gi;
    const numbers = text.match(numberRegex) || [];
    for (const num of numbers) {
      tokens.push(num.toLowerCase().replace(/\s+/g, ''));
    }

    return tokens;
  }

  /**
   * Calculate average document length
   */
  _calculateAvgDocLen() {
    if (this.totalDocs === 0) {
      this.avgDocLen = 0;
      return;
    }

    let totalLen = 0;
    for (const len of this.docLengths.values()) {
      totalLen += len;
    }

    this.avgDocLen = totalLen / this.totalDocs;
  }

  /**
   * Calculate IDF (Inverse Document Frequency) for a term
   *
   * @param {string} term - The term
   * @returns {number} IDF score
   */
  _calculateIDF(term) {
    const docFreq = this.docFreqs.get(term) || 0;

    if (docFreq === 0) {
      return 0;
    }

    // IDF formula with +0.5 smoothing
    return Math.log(1 + (this.totalDocs - docFreq + 0.5) / (docFreq + 0.5));
  }

  /**
   * Calculate BM25 score for a document given query terms
   *
   * @param {string} chunkId - Document ID
   * @param {Array<string>} queryTerms - Query terms
   * @returns {number} BM25 score
   */
  _calculateBM25(chunkId, queryTerms) {
    const tfMap = this.termFreqs.get(chunkId);
    if (!tfMap) {
      return 0;
    }

    const docLen = this.docLengths.get(chunkId) || 0;
    if (docLen === 0 || this.avgDocLen === 0) {
      return 0;
    }

    let score = 0;

    for (const term of queryTerms) {
      const tf = tfMap.get(term) || 0;

      if (tf === 0) {
        continue;
      }

      // Calculate IDF for this term
      const idf = this._calculateIDF(term);

      // BM25 formula
      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + this.b * docLen / this.avgDocLen);
      const bm25 = idf * numerator / denominator;

      score += bm25;
    }

    return score;
  }

  /**
   * Search using BM25 ranking
   *
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results
   * @param {Object} filters - Optional filters to apply
   * @returns {Array<Object>} Array of results with chunkId, score, and metadata
   */
  search(query, limit = 10, filters = null) {
    // Extract and normalize query terms
    const queryTerms = this._extractQueryTerms(query);

    if (queryTerms.length === 0 || this.totalDocs === 0) {
      return [];
    }

    const results = [];

    // Calculate BM25 score for each document
    for (const chunkId of this.documents.keys()) {
      const doc = this.documents.get(chunkId);

      // Apply filters using shared utility
      if (filters && !passesFilters(doc.metadata, filters)) {
        continue;
      }

      const score = this._calculateBM25(chunkId, queryTerms);

      if (score > 0) {
        results.push({
          chunkId,
          score,
          metadata: doc.metadata,
          payload: doc.metadata  // Compatibility with vector store format
        });
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Return top results
    return results.slice(0, limit);
  }

  /**
   * Extract query terms from search query
   * Supports Unicode characters for international artist name searches
   *
   * @param {string} query - Search query string
   * @returns {Array<string>} Array of normalized terms
   */
  _extractQueryTerms(query) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const terms = [];

    // Split on non-letter/non-number characters (Unicode-aware)
    // Match sequences of Unicode letters and numbers
    const tokens = query.match(/[\p{L}\p{N}]+/gu) || [];

    for (const token of tokens) {
      if (!token) continue;

      const lower = token.toLowerCase();

      // Keep music-specific terms regardless of length
      if (MUSIC_PRESERVE.has(lower)) {
        terms.push(lower);
        continue;
      }

      // Skip stopwords
      if (STOPWORDS.has(lower)) {
        continue;
      }

      // Skip very short terms
      if (lower.length < 2) {
        continue;
      }

      terms.push(lower);
    }

    return terms;
  }

  /**
   * Get a document by ID
   *
   * @param {string} chunkId - Document ID
   * @returns {Object|null} Document object or null
   */
  get(chunkId) {
    return this.documents.get(chunkId) || null;
  }

  /**
   * Check if a document exists
   *
   * @param {string} chunkId - Document ID
   * @returns {boolean} True if document exists
   */
  has(chunkId) {
    return this.documents.has(chunkId);
  }

  /**
   * Delete a document from the index
   *
   * @param {string} chunkId - Document ID
   * @returns {boolean} True if document was deleted
   */
  delete(chunkId) {
    if (!this.documents.has(chunkId)) {
      return false;
    }

    const tfMap = this.termFreqs.get(chunkId);
    const docLen = this.docLengths.get(chunkId);

    // Update document frequencies
    if (tfMap) {
      for (const term of tfMap.keys()) {
        const df = this.docFreqs.get(term) || 0;
        if (df <= 1) {
          this.docFreqs.delete(term);
        } else {
          this.docFreqs.set(term, df - 1);
        }
      }
    }

    // Remove from indexes
    this.documents.delete(chunkId);
    this.termFreqs.delete(chunkId);
    this.docLengths.delete(chunkId);

    // Update statistics
    this.totalDocs = this.documents.size;
    this.totalTerms -= docLen || 0;

    // Recalculate average document length
    this._calculateAvgDocLen();

    return true;
  }

  /**
   * Clear all documents from the index
   */
  clear() {
    this.documents.clear();
    this.termFreqs.clear();
    this.docFreqs.clear();
    this.docLengths.clear();
    this.totalDocs = 0;
    this.avgDocLen = 0;
    this.totalTerms = 0;
    this._indexed = false;
  }

  /**
   * Get index statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      totalDocs: this.totalDocs,
      totalTerms: this.totalTerms,
      avgDocLen: this.avgDocLen,
      uniqueTerms: this.docFreqs.size,
      k1: this.k1,
      b: this.b,
      indexed: this._indexed
    };
  }

  /**
   * Export index data (for persistence)
   *
   * @returns {Object} Export data
   */
  export() {
    const data = {
      version: 1,
      k1: this.k1,
      b: this.b,
      totalDocs: this.totalDocs,
      avgDocLen: this.avgDocLen,
      totalTerms: this.totalTerms,
      documents: {},
      termFreqs: {},
      docFreqs: Array.from(this.docFreqs.entries()),
      docLengths: Array.from(this.docLengths.entries())
    };

    for (const [chunkId, doc] of this.documents.entries()) {
      data.documents[chunkId] = doc;
    }

    for (const [chunkId, tfMap] of this.termFreqs.entries()) {
      data.termFreqs[chunkId] = Array.from(tfMap.entries());
    }

    return data;
  }

  /**
   * Import index data
   *
   * @param {Object} data - Export data
   */
  import(data) {
    this.clear();

    if (data.version !== 1) {
      throw new Error(`Unsupported lexical index version: ${data.version}`);
    }

    this.k1 = data.k1;
    this.b = data.b;

    // Import documents
    for (const [chunkId, doc] of Object.entries(data.documents)) {
      this.documents.set(chunkId, doc);
    }

    // Import term frequencies
    for (const [chunkId, tfEntries] of Object.entries(data.termFreqs)) {
      this.termFreqs.set(chunkId, new Map(tfEntries));
    }

    // Import document frequencies
    for (const [term, df] of data.docFreqs) {
      this.docFreqs.set(term, df);
    }

    // Import document lengths
    for (const [chunkId, len] of data.docLengths) {
      this.docLengths.set(chunkId, len);
    }

    this.totalDocs = data.totalDocs;
    this.avgDocLen = data.avgDocLen;
    this.totalTerms = data.totalTerms;
    this._indexed = true;
  }
}

/**
 * Default export
 */
export default LexicalIndex;
