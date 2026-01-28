/**
 * Provider Interface Error Handling
 *
 * Error normalization and JSON parsing utilities.
 * Part of the refactored ProviderInterface module.
 *
 * @module providers/interface/errors
 */

/**
 * Normalize provider errors to consistent format
 * @param {Error} error - Original error
 * @param {string} provider - Provider name
 * @returns {Error} Normalized error
 */
export function normalizeProviderError(error, provider) {
    const normalized = new Error(error.message);
    normalized.provider = provider;
    normalized.originalError = error;

    // Categorize error type
    if (error.name === 'AbortError' || error.message.includes('timed out')) {
        normalized.type = 'timeout';
        normalized.recoverable = true;
        normalized.suggestion = 'Try again or switch to a different model';
    } else if (error.message.includes('401') || error.message.includes('403')) {
        normalized.type = 'auth';
        normalized.recoverable = true;
        normalized.suggestion = 'Check your API key in Settings';
    } else if (error.message.includes('429')) {
        normalized.type = 'rate_limit';
        normalized.recoverable = true;
        normalized.suggestion = 'Wait a moment and try again';
    } else if (error.message.includes('not running') || error.message.includes('ECONNREFUSED')) {
        normalized.type = 'connection';
        normalized.recoverable = true;
        normalized.suggestion = `Start ${provider} server and try again`;
    } else {
        normalized.type = 'unknown';
        normalized.recoverable = false;
    }

    return normalized;
}

/**
 * Safely parse JSON from a response with proper error handling
 * Distinguishes between network errors and JSON parse errors
 * @param {Response} response - Fetch response object
 * @param {object} fallback - Fallback value if parsing fails
 * @returns {Promise<object>} Parsed JSON or fallback
 */
export async function safeJSONParse(response, fallback = null) {
    // First check content-type header
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
        console.warn(`[ProviderInterface] Expected JSON but got ${contentType}`);
        return fallback;
    }

    // Clone the response so we can fall back to text() if JSON parsing fails
    // This is necessary because response.json() consumes the body
    try {
        return await response.clone().json();
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.error('[ProviderInterface] JSON parse error - response may be malformed:', error.message);
            // Try to get text for debugging (using the original response since clone was consumed)
            try {
                const text = await response.text();
                console.debug('[ProviderInterface] Response preview:', text.substring(0, 200));
            } catch (e) {
                // Response body already consumed by failed json() attempt, ignore
            }
        }
        return fallback;
    }
}
