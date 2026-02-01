/**
 * RAG Query Service
 *
 * Handles RAG query orchestration including:
 * - Query entry point and flow coordination
 * - Vector search and embedding generation
 * - Result aggregation and ranking
 * - Context window management
 * - Response generation with streaming support
 * - Query optimization and caching
 *
 * Extracted from RAG god object for focused responsibility.
 *
 * RESPONSIBILITIES:
 * - Query orchestration and execution
 * - Embedding generation for queries
 * - Vector similarity search
 * - Result ranking and filtering
 * - Context management for chat
 * - Response formatting
 *
 * @module rag/query-service
 */

import { ModuleRegistry } from '../module-registry.js';

/**
 * Query configuration constants
 */
const QUERY_CONFIG = {
    DEFAULT_RESULT_LIMIT: 5,
    SIMILARITY_THRESHOLD: 0.3,
    MAX_CONTEXT_CHUNKS: 3,
};

/**
 * RAG Query Service
 *
 * Provides focused API for executing RAG queries with semantic search.
 * Orchestrates embedding generation, vector search, and result formatting.
 */
export class RAGQueryService {
    constructor(options = {}) {
        this.chunkingService = options.chunkingService;
        this.workerPool = options.workerPool;
        this.checkpointManager = options.checkpointManager;
        this.vectorStore = options.vectorStore;
        this.embeddings = options.embeddings;
    }

    /**
     * Execute RAG query
     *
     * Main query entry point that orchestrates:
     * 1. Embedding generation for query
     * 2. Vector similarity search
     * 3. Result aggregation and ranking
     * 4. Response construction with context
     *
     * @param {string} query - User query text
     * @param {Object} options - Query options
     * @param {number} options.limit - Maximum results to return (default: 5)
     * @param {number} options.threshold - Similarity threshold (default: 0.3)
     * @param {AbortSignal} options.abortSignal - Optional abort signal for cancellation
     * @param {boolean} options.skipQuotaCheck - Skip premium quota check (default: false)
     * @returns {Promise<QueryResult>} Query results with context
     */
    async query(query, options = {}) {
        const {
            limit = QUERY_CONFIG.DEFAULT_RESULT_LIMIT,
            threshold = QUERY_CONFIG.SIMILARITY_THRESHOLD,
            abortSignal = null,
            skipQuotaCheck = false,
        } = options;

        // Validate inputs
        if (!query || typeof query !== 'string') {
            throw new Error('Query must be a non-empty string');
        }

        // Check for cancellation
        if (abortSignal?.aborted) {
            throw new Error('Query cancelled');
        }

        // Execute vector search
        const results = await this.search(query, limit, abortSignal, skipQuotaCheck);

        // Apply threshold filtering
        const filteredResults = results.filter(r => r.score >= threshold);

        // Rank and format results
        const rankedResults = this.rankResults(filteredResults, options);

        return {
            query,
            results: rankedResults,
            count: rankedResults.length,
            context: this._buildContext(rankedResults),
        };
    }

    /**
     * Search for similar chunks using vector similarity
     *
     * @param {string} query - Search query text
     * @param {number} limit - Number of results to return
     * @param {AbortSignal} abortSignal - Optional abort signal
     * @param {boolean} skipQuotaCheck - Skip quota check
     * @returns {Promise<Array<SearchResult>>} Search results with payloads
     */
    async search(query, limit = 5, abortSignal = null, skipQuotaCheck = false) {
        // Check for cancellation
        if (abortSignal?.aborted) {
            throw new Error('Search cancelled');
        }

        // Ensure modules are loaded
        await this._ensureModulesLoaded();

        // Initialize LocalEmbeddings if needed
        if (!this.embeddings?.isReady()) {
            console.log('[RAGQueryService] Initializing LocalEmbeddings...');
            await this.embeddings.initialize(() => {});
        }

        // Initialize LocalVectorStore if needed
        if (!this.vectorStore?.isReady()) {
            console.log('[RAGQueryService] Initializing LocalVectorStore...');
            await this.vectorStore.init();
        }

        // Check for cancellation before embedding generation (expensive)
        if (abortSignal?.aborted) {
            throw new Error('Search cancelled');
        }

        // Generate embedding for query
        const queryVector = await this.generateEmbedding(query);

        // Use async search for non-blocking UI
        const results = await this.vectorStore.searchAsync(
            queryVector,
            limit,
            QUERY_CONFIG.SIMILARITY_THRESHOLD
        );

        // Transform to match Qdrant response format
        return results.map(r => ({
            id: r.id,
            score: r.score,
            payload: r.payload,
        }));
    }

    /**
     * Generate embedding for text
     *
     * Uses LocalEmbeddings module to generate vector representation.
     *
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} Embedding vector
     * @throws {Error} If embedding generation fails
     */
    async generateEmbedding(text) {
        if (!this.embeddings) {
            throw new Error('LocalEmbeddings module not available');
        }

        if (!text || typeof text !== 'string') {
            throw new Error('Text must be a non-empty string');
        }

        try {
            return await this.embeddings.getEmbedding(text);
        } catch (error) {
            console.error('[RAGQueryService] Embedding generation failed:', error);
            throw new Error(`Failed to generate embedding: ${error.message}`);
        }
    }

    /**
     * Rank and filter search results
     *
     * Scores and sorts chunks by relevance. Can apply custom ranking
     * logic based on chunk type, metadata, or content.
     *
     * @param {Array<Chunk>} chunks - Retrieved chunks
     * @param {Object} options - Ranking options
     * @param {string} options.rankBy - Ranking criteria ('score', 'type', 'custom')
     * @param {Array<string>} options.preferredTypes - Preferred chunk types
     * @returns {Array<Chunk>} Ranked chunks
     */
    rankResults(chunks, options = {}) {
        if (!chunks || chunks.length === 0) {
            return [];
        }

        // Default ranking by score
        const ranked = [...chunks].sort((a, b) => b.score - a.score);

        // Apply type-based boosting if preferred types specified
        if (options.preferredTypes && options.preferredTypes.length > 0) {
            const preferredSet = new Set(options.preferredTypes);
            ranked.forEach(chunk => {
                if (preferredSet.has(chunk.payload?.type)) {
                    chunk.score *= 1.1; // 10% boost for preferred types
                }
            });

            // Re-sort after boosting
            ranked.sort((a, b) => b.score - a.score);
        }

        return ranked;
    }

    /**
     * Get semantic context for chat queries
     *
     * Returns relevant chunks formatted for injection into system prompt.
     * Used to provide RAG context to LLM chat sessions.
     *
     * @param {string} query - User query
     * @param {number} limit - Maximum chunks to include (default: 3)
     * @returns {Promise<string|null>} Formatted context or null if no results
     */
    async getSemanticContext(query, limit = QUERY_CONFIG.MAX_CONTEXT_CHUNKS) {
        try {
            // Skip quota check for context retrieval
            const results = await this.search(query, limit, null, true);

            if (results.length === 0) {
                return null;
            }

            const context = results.map(r => r.payload.text).join('\n\n');
            return `SEMANTIC SEARCH RESULTS:\n${context}`;
        } catch (err) {
            console.error('[RAGQueryService] Semantic context error:', err);
            return null;
        }
    }

    /**
     * Build context from search results
     *
     * Formats search results into a context string for LLM consumption.
     *
     * @private
     * @param {Array<SearchResult>} results - Search results
     * @returns {string} Formatted context
     */
    _buildContext(results) {
        if (!results || results.length === 0) {
            return '';
        }

        return results
            .map(r => {
                const text = r.payload?.text || '';
                const type = r.payload?.type || '';
                const score = r.score ? ` (${(r.score * 100).toFixed(0)}% relevance)` : '';
                return `[${type}${score}]: ${text}`;
            })
            .join('\n\n');
    }

    /**
     * Ensure required modules are loaded
     *
     * Lazy-loads LocalEmbeddings and LocalVectorStore modules on demand.
     *
     * @private
     * @returns {Promise<void>}
     */
    async _ensureModulesLoaded() {
        // Get or load LocalEmbeddings
        if (!this.embeddings) {
            let LocalEmbeddings = ModuleRegistry.getModuleSync('LocalEmbeddings');

            if (!LocalEmbeddings) {
                await ModuleRegistry.preloadModules(['LocalEmbeddings', 'LocalVectorStore']);
                LocalEmbeddings = await ModuleRegistry.getModule('LocalEmbeddings');
            }

            if (!LocalEmbeddings) {
                throw new Error(
                    'Failed to load LocalEmbeddings module. Check browser compatibility.'
                );
            }

            this.embeddings = LocalEmbeddings;
        }

        // Get or load LocalVectorStore
        if (!this.vectorStore) {
            let LocalVectorStore = ModuleRegistry.getModuleSync('LocalVectorStore');

            if (!LocalVectorStore) {
                await ModuleRegistry.preloadModules(['LocalVectorStore']);
                LocalVectorStore = await ModuleRegistry.getModule('LocalVectorStore');
            }

            if (!LocalVectorStore) {
                throw new Error(
                    'Failed to load LocalVectorStore module. Check browser compatibility.'
                );
            }

            this.vectorStore = LocalVectorStore;
        }
    }

    /**
     * Get query service status
     *
     * Returns information about service readiness and configuration.
     *
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            chunkingService: !!this.chunkingService,
            workerPool: !!this.workerPool,
            checkpointManager: !!this.checkpointManager,
            vectorStore: !!this.vectorStore,
            embeddings: !!this.embeddings,
            modulesLoaded: !!(this.embeddings && this.vectorStore),
        };
    }

    /**
     * Check if service is ready for queries
     *
     * @returns {boolean} True if ready
     */
    isReady() {
        return !!(this.embeddings && this.vectorStore);
    }

    /**
     * Clear cached modules (useful for testing or reset)
     *
     * @returns {void}
     */
    clearCache() {
        this.embeddings = null;
        this.vectorStore = null;
    }
}

// Export singleton instance
export const ragQueryService = new RAGQueryService();

/**
 * @typedef {Object} QueryResult
 * @property {string} query - Original query text
 * @property {Array<SearchResult>} results - Ranked search results
 * @property {number} count - Number of results
 * @property {string} context - Formatted context for LLM
 */

/**
 * @typedef {Object} SearchResult
 * @property {number} id - Result ID
 * @property {number} score - Similarity score (0-1)
 * @property {Object} payload - Result payload with text and metadata
 */

/**
 * @typedef {Object} Chunk
 * @property {string} type - Chunk type
 * @property {string} text - Chunk text content
 * @property {Object} metadata - Chunk metadata
 */
