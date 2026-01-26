/**
 * Semantic Query Schemas
 *
 * Function schemas for semantic search using RAG (Retrieval-Augmented Generation).
 * These tools search the user's listening history using natural language meaning
 * rather than exact keyword matches.
 */

const SEMANTIC_QUERY_SCHEMAS = [
    {
        type: "function",
        function: {
            name: "semantic_search",
            description: "Search the user's local listening history using natural language concepts and semantic meaning. Use this when the user asks questions about patterns, moods, themes, or time periods in their music listening history. Examples: 'songs I listened to during breakup periods', 'uplifting morning music', 'artists I discovered in 2020', 'what I was listening to when I was happy', 'music from my college years', 'sad songs I used to listen to'. This is different from exact track/artist searches - it finds music based on context and meaning.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Natural language search query about patterns, moods, themes, emotions, or time periods in the user's listening history"
                    },
                    limit: {
                        type: "integer",
                        description: "Maximum number of results to return (default: 5, max: 10)"
                    }
                },
                required: ["query"]
            }
        }
    }
];

// ES Module export
export { SEMANTIC_QUERY_SCHEMAS as SemanticQuerySchemas };

console.log('[SemanticQuerySchemas] Module loaded');
