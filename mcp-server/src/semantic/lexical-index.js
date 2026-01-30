/**
 * BM25 Lexical Index
 *
 * Provides fast keyword-based search using the BM25 ranking algorithm.
 * BM25 improves upon TF-IDF by incorporating document length normalization
 * and term saturation parameters.
 *
 * BM25 formula:
 *   score = IDF(qi) * (f(qi,D) * (k1 + 1)) / (f(qi,D) + k1 * (1 - b + b * |D| / avgdl))
 *
 * Where:
 *   - IDF(qi) = log((N - df(qi) + 0.5) / (df(qi) + 0.5))
 *   - f(qi,D) = term frequency in document
 *   - N = total number of documents
 *   - df(qi) = document frequency (number of docs containing term)
 *   - |D| = document length
 *   - avgdl = average document length
 *   - k1 = term saturation parameter (default 1.2)
 *   - b = length normalization parameter (default 0.75)
 */

/**
 * Default BM25 parameters
 */
const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

/**
 * Stopwords to filter out (common English words that add little meaning)
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
  'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how'
]);

/**
 * Lexical Index class using BM25 ranking
 */
export class LexicalIndex {
  constructor(options = {}) {
    // BM25 parameters
    this.k1 = options.k1 ?? DEFAULT_K1;
    this.b = options.b ?? DEFAULT_B;

    // Index storage
    this.documents = new Map();           // chunkId -> { text, metadata, terms }
    this.termFreqs = new Map();            // chunkId -> Map(term -> frequency)
    this.docFreqs = new Map();             // term -> number of documents containing term
    this.docLengths = new Map();           // chunkId -> document length (term count)

    // Statistics
    this.totalDocs = 0;
    this.avgDocLen = 0;
    this.totalTerms = 0;
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
  }

  /**
   * Index a single chunk
   *
   * @param {Object} chunk - Chunk object with id, text, and metadata
   */
  _indexChunk(chunk) {
    const { id, text, metadata } = chunk;

    // Extract terms from chunk
    const terms = this._extractTerms(chunk);

    // Skip empty documents
    if (terms.length === 0) {
      return;
    }

    // Calculate term frequencies
    const tfMap = new Map();
    for (const term of terms) {
      tfMap.set(term, (tfMap.get(term) || 0) + 1);
    }

    // Store document
    this.documents.set(id, {
      text,
      metadata: { ...metadata, chunkId: id },
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
   * Extract meaningful terms from a chunk
   *
   * @param {Object} chunk - Chunk object
   * @returns {Array<string>} Array of normalized terms
   */
  _extractTerms(chunk) {
    const terms = [];

    // Extract symbol name from metadata
    if (chunk.metadata?.name) {
      const symbolTerms = this._tokenizeSymbol(chunk.metadata.name);
      terms.push(...symbolTerms);
    }

    // Extract function calls from metadata
    if (chunk.metadata?.calls) {
      for (const call of chunk.metadata.calls) {
        terms.push(...this._tokenizeSymbol(call));
      }
    }

    // Extract parameters from metadata
    if (chunk.metadata?.params) {
      for (const param of chunk.metadata.params) {
        terms.push(...this._tokenizeSymbol(param));
      }
    }

    // Extract keywords from text
    const textTerms = this._tokenizeText(chunk.text || '');
    terms.push(...textTerms);

    // Filter stopwords and normalize
    return terms.filter(term =>
      term.length > 1 && !STOPWORDS.has(term.toLowerCase())
    );
  }

  /**
   * Tokenize a symbol name (handles camelCase, snake_case, etc.)
   *
   * @param {string} symbol - Symbol name
   * @returns {Array<string>} Array of tokens
   */
  _tokenizeSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      return [];
    }

    const tokens = [];

    // Split on common separators
    const parts = symbol.split(/[^a-zA-Z0-9]+/);

    for (const part of parts) {
      if (!part) continue;

      // Split camelCase
      const camelWords = part
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/\s+/);

      tokens.push(...camelWords);
    }

    return tokens.filter(t => t.length > 1);
  }

  /**
   * Tokenize text content
   *
   * @param {string} text - Text content
   * @returns {Array<string>} Array of tokens
   */
  _tokenizeText(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    // Extract identifiers and words
    const tokens = [];

    // Match identifiers (including camelCase)
    const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const identifiers = text.match(identifierRegex) || [];

    for (const id of identifiers) {
      // Skip common keywords
      if (this._isCommonKeyword(id)) {
        continue;
      }

      // Split camelCase
      const words = id
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .split(/\s+/);

      tokens.push(...words.filter(w => w.length > 2));
    }

    return tokens;
  }

  /**
   * Check if a token is a common JavaScript keyword
   *
   * @param {string} token - Token to check
   * @returns {boolean} True if token is a common keyword
   */
  _isCommonKeyword(token) {
    const keywords = new Set([
      'const', 'let', 'var', 'function', 'return', 'if', 'else',
      'for', 'while', 'class', 'extends', 'import', 'export',
      'from', 'default', 'async', 'await', 'try', 'catch',
      'throw', 'new', 'this', 'super', 'static', 'get', 'set'
    ]);

    return keywords.has(token);
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
   * @returns {Array<Object>} Array of results with chunkId, score, and metadata
   */
  search(query, limit = 10) {
    // Extract and normalize query terms
    const queryTerms = this._extractQueryTerms(query);

    if (queryTerms.length === 0 || this.totalDocs === 0) {
      return [];
    }

    const results = [];

    // Calculate BM25 score for each document
    for (const chunkId of this.documents.keys()) {
      const score = this._calculateBM25(chunkId, queryTerms);

      if (score > 0) {
        const doc = this.documents.get(chunkId);
        results.push({
          chunkId,
          score,
          metadata: doc.metadata
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
   *
   * @param {string} query - Search query string
   * @returns {Array<string>} Array of normalized terms
   */
  _extractQueryTerms(query) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const terms = [];

    // Split on non-word characters
    const tokens = query.split(/[^\w]+/);

    for (const token of tokens) {
      if (!token) continue;

      // Split camelCase
      const words = token
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .split(/\s+/);

      terms.push(...words);
    }

    // Filter stopwords and short terms
    return terms.filter(term =>
      term.length > 1 && !STOPWORDS.has(term)
    );
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
      b: this.b
    };
  }

  /**
   * Export index data
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
  }
}

/**
 * Default export
 */
export default LexicalIndex;
