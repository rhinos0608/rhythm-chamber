/**
 * Streaming Message Handler
 *
 * Handles SSE sequence validation and streaming message updates.
 * Manages loading indicators and streaming state transitions.
 *
 * @module controllers/streaming-message-handler
 */

import { StreamBuffer } from '../utils/stream-buffer.js';
import { escapeHtml } from '../utils/html-escape.js';
import { parseMarkdown } from '../utils/parser.js';
import { MessageActions } from './message-actions.js';

// ==========================================
// Constants
// ==========================================

const CHAT_UI_MESSAGE_CONTAINER_ID = 'chat-messages';

// SECURITY: Whitelist of valid tool names to prevent XSS
const VALID_TOOL_NAMES = [
    'DataQuery',
    'PatternAnalyzer',
    'PersonalityClassifier',
    'StreamProcessor',
];

/**
 * Validate tool name against whitelist
 * @param {string} toolName - Tool name to validate
 * @returns {boolean} True if tool name is valid
 */
function isValidToolName(toolName) {
    if (typeof toolName !== 'string') return false;
    return VALID_TOOL_NAMES.includes(toolName);
}

// ==========================================
// SSE Sequence Validation (HNW Wave)
// ==========================================

/** Global SSE stream buffer instance for reordering out-of-order chunks */
const streamBuffer = new StreamBuffer();

/** Timeout for chunk processing (30 seconds) - prevents stale buffer corruption */
const CHUNK_PROCESSING_TIMEOUT = 30000;

/** Active timeout tracker for cleanup */
let activeTimeout = null;

/**
 * Process a chunk with sequence validation and timeout protection
 * Buffers out-of-order chunks and processes in-order
 * CRITICAL: Timeout prevents stale buffer corruption during network interruptions
 *
 * @param {number} seq - Sequence number of the chunk
 * @param {string} data - Chunk data
 * @param {function} handler - Function to call with in-order data
 * @returns {boolean} True if processed immediately, false if buffered
 */
function processSequencedChunk(seq, data, handler) {
    // Clear any existing timeout from previous chunk
    // This creates a sliding window: each chunk resets the 30-second timer
    if (activeTimeout) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
    }

    // Add timeout protection for network interruption scenarios
    // CRITICAL: If no chunk arrives within 30 seconds, assume stream failed
    // and reset buffer to prevent stale data corruption in subsequent streams
    activeTimeout = setTimeout(() => {
        console.warn(
            '[StreamingMessageHandler] Chunk processing timeout - resetting buffer to prevent corruption'
        );
        console.warn(
            '[StreamingMessageHandler] This indicates a network interruption or stalled stream'
        );
        resetSequenceBuffer();
        activeTimeout = null;
    }, CHUNK_PROCESSING_TIMEOUT);

    try {
        return streamBuffer.process(seq, data, handler);
        // NOTE: Timeout is NOT cleared here intentionally
        // The timeout stays active until the next chunk arrives (sliding window)
        // or until manual reset/explicit cleanup
    } catch (error) {
        // Ensure timeout is cleared on error to prevent cascading failures
        if (activeTimeout) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
        }
        console.error('[StreamingMessageHandler] Error processing sequenced chunk:', error);
        throw error;
    }
}

/**
 * Reset the sequence buffer (call at stream start)
 * CRITICAL: Clears any active timeout to prevent premature buffer reset
 */
function resetSequenceBuffer() {
    // Clear any pending timeout to avoid race conditions
    if (activeTimeout) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
    }

    streamBuffer.reset();
}

/**
 * Get buffered chunks that haven't been processed
 * @returns {{ pending: number, nextExpected: number, gaps: number[] }}
 */
function getSequenceBufferStatus() {
    return streamBuffer.getStatus();
}

// ==========================================
// Loading & Streaming
// ==========================================

/**
 * Add a loading message placeholder
 * @returns {string|null} ID of the loading element, or null if failed
 */
function addLoadingMessage() {
    const id = 'msg-' + Date.now();
    const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
    if (!messages) {
        console.error('[StreamingMessageHandler] Cannot add loading message: container not found', {
            id,
            containerId: CHAT_UI_MESSAGE_CONTAINER_ID,
        });
        return null;
    }

    const div = document.createElement('div');
    div.className = 'message assistant loading';
    div.id = id;
    div.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;

    return id;
}

/**
 * Update a loading message with streaming content or status
 * @param {string} id - Loading element ID
 * @param {object} state - State update (type, token, content, tool, etc.)
 */
function updateLoadingMessage(id, state) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn('[StreamingMessageHandler] Cannot update loading message: element not found', {
            id,
            stateType: state.type,
        });
        return;
    }

    switch (state.type) {
        case 'tool_start': {
            el.className = 'message tool-execution';
            // SECURITY: Validate tool name against whitelist before display
            const startToolName = isValidToolName(state.tool) ? state.tool : 'tool';
            // security-validated: Uses escapeHtml() from js/utils/html-escape.js
            // Escaping method: DOM-based textContent assignment
            // Data flow: state.tool → whitelist validation → escapeHtml() → innerHTML insertion
            // Additional security: Tool names validated against VALID_TOOL_NAMES whitelist
            // Review date: 2026-01-28
            el.innerHTML = `<span class="icon">⚡</span> Analyzing data with ${escapeHtml(startToolName)}...`;
            break;
        }

        case 'tool_end': {
            el.className = 'message assistant loading';
            // SECURITY: Validate tool name against whitelist before display
            const toolName = isValidToolName(state.tool) ? state.tool : 'Tool';
            const errorMsg = state.error || state.result?.error;
            const statusIcon = errorMsg ? '⚠️' : '✅';
            const statusText = errorMsg ? 'failed' : 'finished';
            // security-validated: Uses escapeHtml() from js/utils/html-escape.js
            // Escaping method: DOM-based textContent assignment
            // Data flow: state.tool, errorMsg → whitelist validation → escapeHtml() → innerHTML insertion
            // Additional security: Tool names validated against VALID_TOOL_NAMES whitelist
            // Review date: 2026-01-28
            el.innerHTML = `
                <div class="tool-status ${errorMsg ? 'error' : 'success'}">
                    ${statusIcon} ${escapeHtml(toolName)} ${statusText}
                </div>
                <div class="typing-indicator"><span></span><span></span><span></span></div>
            `;
            break;
        }

        case 'thinking':
            if (state.content) {
                // Thinking block from reasoning model
                let thinkingEl = el.querySelector('.thinking-block');
                if (!thinkingEl) {
                    thinkingEl = document.createElement('details');
                    thinkingEl.className = 'thinking-block';
                    // security-validated: Static HTML only, no dynamic content
                    // Template structure is hardcoded with no user input
                    // Review date: 2026-01-28
                    thinkingEl.innerHTML =
                        '<summary>💭 Model reasoning</summary><div class="thinking-content"></div>';
                    el.insertBefore(thinkingEl, el.firstChild);
                }
                const content = thinkingEl.querySelector('.thinking-content');
                if (content) content.textContent = state.content;
            } else if (!el.dataset.streaming) {
                // Reset to thinking indicator
                el.className = 'message assistant loading';
                // security-validated: Static HTML only, no dynamic content
                // Template structure is hardcoded with no user input
                // Review date: 2026-01-28
                el.innerHTML =
                    '<div class="typing-indicator"><span></span><span></span><span></span></div>';
            }
            break;

        case 'token': {
            // Streaming token
            if (!el.dataset.streaming) {
                // First token - switch to streaming mode
                el.dataset.streaming = 'true';
                el.className = 'message assistant streaming';
                // security-validated: Static HTML only, no dynamic content
                // Template structure is hardcoded with no user input
                // I18N FIX: Add dir="auto" to support bidirectional text (RTL/LTR)
                // Review date: 2026-01-28
                el.innerHTML = '<div class="message-content streaming-content" dir="auto"></div>';
            }
            const contentEl = el.querySelector('.streaming-content');
            if (contentEl && state.token) {
                // Escape and append token
                // security-validated: Uses escapeHtml() from js/utils/html-escape.js
                // Escaping method: DOM-based textContent assignment
                // Data flow: state.token (from AI response) → escapeHtml() → innerHTML insertion
                // Line breaks converted to <br> AFTER escaping (safe order)
                // Review date: 2026-01-28
                const escaped = escapeHtml(state.token).replace(/\n/g, '<br>');
                contentEl.innerHTML += escaped;

                // Scroll to show new content
                const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
                if (messages) messages.scrollTop = messages.scrollHeight;
            }
            break;
        }

        case 'token_update':
            // Update token counter display
            if (state.tokenInfo) {
                updateTokenDisplay(state.tokenInfo);
            }
            break;

        case 'token_warning':
            // Show token warning
            if (state.tokenInfo) {
                showTokenWarning(state.message, state.tokenInfo, state.truncated);
            }
            break;
    }
}

/**
 * Update the token counter display
 * @param {object} tokenInfo - Token information from TokenCounter
 */
function updateTokenDisplay(tokenInfo) {
    const counterEl = document.getElementById('token-counter');
    if (!counterEl) return;

    // Show the counter
    counterEl.style.display = 'block';

    // Update counts
    const countEl = document.getElementById('token-count');
    const limitEl = document.getElementById('token-limit');
    const percentEl = document.getElementById('token-percent');
    const barFillEl = document.getElementById('token-bar-fill');

    if (countEl) countEl.textContent = tokenInfo.total.toLocaleString();
    if (limitEl) limitEl.textContent = tokenInfo.contextWindow.toLocaleString();

    const usagePercent = Math.round(tokenInfo.usagePercent);
    if (percentEl) percentEl.textContent = `(${usagePercent}%)`;

    // Update progress bar
    if (barFillEl) {
        barFillEl.style.width = `${Math.min(usagePercent, 100)}%`;

        // Color coding based on usage
        if (usagePercent > 85) {
            barFillEl.style.backgroundColor = 'var(--danger, #dc3545)';
        } else if (usagePercent > 70) {
            barFillEl.style.backgroundColor = 'var(--warning, #ffc107)';
        } else {
            barFillEl.style.backgroundColor = 'var(--success, #28a745)';
        }
    }

    // Update warnings display
    const warningsEl = document.getElementById('token-warnings');
    if (warningsEl) {
        warningsEl.innerHTML = '';

        if (tokenInfo.warnings && tokenInfo.warnings.length > 0) {
            tokenInfo.warnings.forEach(warning => {
                const warningDiv = document.createElement('div');
                warningDiv.className = `token-warning ${warning.level}`;
                warningDiv.textContent = warning.message;
                warningsEl.appendChild(warningDiv);
            });
        }
    }
}

/**
 * Show a token warning message
 * @param {string} message - Warning message
 * @param {object} tokenInfo - Token information
 * @param {boolean} truncated - Whether truncation was applied
 */
function showTokenWarning(message, tokenInfo, truncated) {
    const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
    if (!messages) return;

    const warningDiv = document.createElement('div');
    warningDiv.className = 'message system-warning';

    const icon = truncated ? '⚠️' : 'ℹ️';
    const title = truncated ? 'Context Truncated' : 'Token Warning';

    // SAFE: message and tokenInfo values are from internal token counting system
    // I18N FIX: Add dir="auto" to support bidirectional text (RTL/LTR)
    // SECURITY FIX: Escape all interpolated values including tokenInfo properties
    warningDiv.innerHTML = `
        <div class="message-content" dir="auto">
            <strong>${escapeHtml(icon)} ${escapeHtml(title)}</strong><br>
            ${escapeHtml(message)}<br>
            <small>Usage: ${escapeHtml(String(tokenInfo.total))}/${escapeHtml(String(tokenInfo.contextWindow))} tokens (${escapeHtml(String(Math.round(tokenInfo.usagePercent)))}%)</small>
        </div>
    `;

    messages.appendChild(warningDiv);
    messages.scrollTop = messages.scrollHeight;
}

/**
 * Remove a message element by ID
 * @param {string} id - Element ID
 */
function removeMessageElement(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/**
 * Finalize a streamed message - parse markdown and add actions
 * @param {HTMLElement} messageEl - Message element
 * @param {string} fullContent - Full message content
 */
function finalizeStreamedMessage(messageEl, fullContent) {
    if (!messageEl) {
        console.error(
            '[StreamingMessageHandler] Cannot finalize streamed message: element is null',
            { contentLength: fullContent?.length }
        );
        // Fallback: create a new message element
        const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
        if (!messages) {
            console.error(
                '[StreamingMessageHandler] Container not found for fallback message creation'
            );
            return;
        }
        const newEl = createMessageElement(fullContent || 'No content', 'assistant', false);
        messages.appendChild(newEl);
        messages.scrollTop = messages.scrollHeight;
        return;
    }

    // Parse markdown now that full content is available
    const contentEl = messageEl.querySelector('.streaming-content');
    if (contentEl && fullContent) {
        contentEl.innerHTML = parseMarkdown(fullContent);
        contentEl.classList.remove('streaming-content');
    }

    // Remove streaming indicators
    messageEl.classList.remove('streaming');
    messageEl.classList.add('assistant');
    delete messageEl.dataset.streaming;
    messageEl.removeAttribute('id');

    // Add action buttons
    MessageActions.addAssistantMessageActions(messageEl, fullContent);
}

/**
 * Create a message element (for fallback in finalizeStreamedMessage)
 * @param {string} text - Message content
 * @param {string} role - 'user' or 'assistant'
 * @param {boolean} isError - Is this an error message
 * @returns {HTMLElement} Message element
 */
function createMessageElement(text, role, isError = false) {
    const div = document.createElement('div');
    div.className = `message ${role}${isError ? ' error' : ''}`;

    // Parse markdown for assistant messages, escape user messages
    const content = role === 'assistant' ? parseMarkdown(text) : escapeHtml(text);
    div.innerHTML = `<div class="message-content" dir="auto">${content}</div>`;

    return div;
}

/**
 * Cleanup function to clear active timeout and reset buffer
 * Call this when component unmounts or when streams are canceled
 * Prevents memory leaks from orphaned timeouts
 *
 * @example
 *   // On component unmount
 *   onUnmount(() => {
 *       StreamingMessageHandler.cleanupStreamingHandler();
 *   });
 *
 *   // On stream cancel
 *   function cancelStream() {
 *       StreamingMessageHandler.cleanupStreamingHandler();
 *   }
 */
function cleanupStreamingHandler() {
    // Clear any active timeout to prevent memory leak
    if (activeTimeout) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
    }
    // Reset buffer to clear any pending data
    streamBuffer.reset();
}

// ==========================================
// Public API
// ==========================================

export const StreamingMessageHandler = {
    addLoadingMessage,
    updateLoadingMessage,
    removeMessageElement,
    finalizeStreamedMessage,
    processSequencedChunk,
    resetSequenceBuffer,
    getSequenceBufferStatus,
    cleanupStreamingHandler,
};

console.log('[StreamingMessageHandler] Module loaded');
