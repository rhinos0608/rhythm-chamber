/**
 * Semantic Query Executors
 *
 * Execution logic for semantic search using RAG (Retrieval-Augmented Generation).
 * Performs vector-based similarity search on the user's listening history.
 */

/**
 * Execute semantic search query
 * @param {Object} args - Function arguments from LLM
 * @param {string} args.query - Natural language search query
 * @param {number} [args.limit=5] - Maximum results to return
 * @param {Array} streams - User's streaming data (unused for semantic search)
 * @returns {Promise<Object>} Search results for LLM
 */
async function executeSemanticSearch(args, streams) {
    const { query, limit = 5 } = args;

    // Validate query
    if (!query || typeof query !== 'string') {
        return {
            error: "Search query must be a non-empty string. Please provide a natural language description of what you're looking for.",
        };
    }

    // Normalize limit to reasonable bounds
    const normalizedLimit = Math.min(Math.max(1, parseInt(limit) || 5), 10);

    try {
        // Dynamic import of RAG module (may not be loaded yet)
        const { RAG } = await import('../../rag.js');

        // Check if RAG is configured (embeddings exist)
        if (!RAG.isConfigured?.()) {
            return {
                error: 'Semantic search is not available. The user needs to generate embeddings first. Please suggest they go to Settings > Semantic Search > Generate Embeddings, or use a different search method like searching for specific tracks or artists.',
            };
        }

        // Perform semantic search
        const results = await RAG.search(query, normalizedLimit);

        // Handle empty results gracefully
        if (!results || results.length === 0) {
            return {
                query,
                count: 0,
                results: [],
                message:
                    "No relevant matches found for this query. The user's listening history may not contain patterns matching this description, or they may need to regenerate embeddings.",
            };
        }

        // Format results for LLM consumption (token-efficient)
        return {
            query,
            count: results.length,
            results: results.map(r => {
                const payload = r.payload || {};
                return {
                    relevance: Math.round(r.score * 100) + '%',
                    type: payload.type || 'unknown',
                    content: payload.text || '',
                    metadata: {
                        month: payload.metadata?.month,
                        year: payload.metadata?.year,
                        artist: payload.metadata?.artist,
                        period: payload.metadata?.period,
                    },
                };
            }),
        };
    } catch (err) {
        // Return helpful error message instead of throwing
        console.error('[SemanticExecutors] Search failed:', err);
        return {
            error: `Semantic search encountered an error: ${err.message}. Please try a different query or use a standard search method.`,
        };
    }
}

// ==========================================
// Executor Registry
// ==========================================

// ES Module export
export const SemanticExecutors = {
    semantic_search: executeSemanticSearch,
};

console.log('[SemanticExecutors] Module loaded');
