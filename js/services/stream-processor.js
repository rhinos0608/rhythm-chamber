/**
 * Stream Processor Service
 *
 * Handles streaming response processing, chunk buffering, and progress callbacks.
 * Extracted from MessageLifecycleCoordinator to separate streaming concerns.
 *
 * Responsibilities:
 * - Process SSE (Server-Sent Events) streams
 * - Buffer and decode streaming chunks
 * - Manage progress callbacks
 * - Handle streaming errors
 *
 * @module services/stream-processor
 */

'use strict';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _Settings = null;
let _isInitialized = false;

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize StreamProcessor with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    _Settings = dependencies.Settings;
    _isInitialized = true;

    console.log('[StreamProcessor] Initialized with dependencies');
}

/**
 * Check if service is initialized
 * @returns {boolean} True if initialized
 */
function isInitialized() {
    return _isInitialized;
}

/**
 * Require initialization or throw error
 * @throws {Error} If service not initialized
 */
function requireInitialized() {
    if (!_isInitialized) {
        throw new Error('[StreamProcessor] Service not initialized. Call init() first.');
    }
}

// ==========================================
// Progress Event Types
// ==========================================

/**
 * Create a thinking progress event
 * @returns {Object} Thinking event
 */
function createThinkingEvent() {
    return { type: 'thinking' };
}

/**
 * Create a token warning event
 * @param {string} message - Warning message
 * @param {Object} tokenInfo - Token information
 * @param {boolean} truncated - Whether conversation was truncated
 * @returns {Object} Token warning event
 */
function createTokenWarningEvent(message, tokenInfo, truncated = false) {
    return {
        type: 'token_warning',
        message,
        tokenInfo,
        truncated,
    };
}

/**
 * Create a token update event
 * @param {Object} tokenInfo - Token information
 * @returns {Object} Token update event
 */
function createTokenUpdateEvent(tokenInfo) {
    return {
        type: 'token_update',
        tokenInfo,
    };
}

/**
 * Create an error event
 * @param {string} message - Error message
 * @returns {Object} Error event
 */
function createErrorEvent(message) {
    return {
        type: 'error',
        message,
    };
}

// ==========================================
// Stream Processing
// ==========================================

/**
 * Process streaming response from LLM
 * @param {Response} response - Fetch response object
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<string>} Complete response content
 */
async function processStream(response, onProgress) {
    if (!response.body) {
        throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            // Decode chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages from buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();

                    if (data === '[DONE]') {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);

                        // Extract content from delta
                        if (parsed.choices && parsed.choices[0]?.delta?.content) {
                            const chunk = parsed.choices[0].delta.content;
                            content += chunk;

                            // Notify progress
                            if (onProgress) {
                                onProgress({
                                    type: 'content',
                                    content: chunk,
                                    fullContent: content,
                                });
                            }
                        }
                    } catch (parseError) {
                        console.warn('[StreamProcessor] Failed to parse SSE data:', parseError);
                    }
                }
            }
        }

        return content;
    } finally {
        reader.releaseLock();
    }
}

/**
 * Process non-streaming response
 * @param {Object} response - LLM response object
 * @param {Function} onProgress - Progress callback
 * @returns {string} Response content
 */
function processNonStream(response, onProgress) {
    if (!response.choices || response.choices.length === 0) {
        throw new Error('No choices in response');
    }

    const content = response.choices[0].message?.content || '';

    // Notify complete content
    if (onProgress && content) {
        onProgress({
            type: 'content',
            content,
            fullContent: content,
            complete: true,
        });
    }

    return content;
}

// ==========================================
// Progress Management
// ==========================================

/**
 * Safely call progress callback
 * @param {Function} onProgress - Progress callback
 * @param {Object} event - Progress event
 */
function notifyProgress(onProgress, event) {
    if (typeof onProgress === 'function') {
        try {
            onProgress(event);
        } catch (error) {
            console.warn('[StreamProcessor] Progress callback error:', error);
        }
    }
}

/**
 * Show toast notification for errors
 * @param {string} message - Error message
 * @param {number} duration - Toast duration in ms
 */
function showErrorToast(message, duration = 5000) {
    if (_Settings?.showToast) {
        _Settings.showToast(message, duration);
    }
}

// ==========================================
// Public API
// ==========================================

const StreamProcessor = {
    init,
    isInitialized,
    createThinkingEvent,
    createTokenWarningEvent,
    createTokenUpdateEvent,
    createErrorEvent,
    processStream,
    processNonStream,
    notifyProgress,
    showErrorToast,
};

// ES Module export
export { StreamProcessor };

console.log('[StreamProcessor] Service loaded');
