/**
 * Fallback Response Generation
 *
 * Generates static fallback responses when all providers fail.
 *
 * @module fallback/fallback-response
 */

/**
 * Generate fallback response when all providers fail
 * @param {Array} messages - Chat messages
 * @returns {Promise<Object>} Fallback response
 */
export async function generateFallbackResponse(messages) {
    const { FallbackResponseService } = await import('../fallback-response-service.js');

    const lastMessage = messages[messages.length - 1];
    const queryContext = generateQueryContext(lastMessage?.content);

    const fallbackResponse = FallbackResponseService.generateFallbackResponse(
        lastMessage?.content || '',
        queryContext
    );

    return {
        content: fallbackResponse,
        status: 'success',
        role: 'assistant',
        isFallback: true,
    };
}

/**
 * Generate query context for fallback response
 * @private
 * @param {string} message - User message
 * @returns {Object} Query context
 */
function generateQueryContext(message) {
    // Basic context - can be enhanced
    return {
        message,
        timestamp: Date.now(),
        hasPersonality: false,
        hasPatterns: false,
    };
}
