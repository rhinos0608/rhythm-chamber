/**
 * Chat UI Controller
 *
 * Handles chat message display, streaming, and user interactions.
 * Separates UI concerns from the Chat module's business logic.
 *
 * @module controllers/chat-ui-controller
 */

import { Chat } from '../chat.js';
import { escapeHtml } from '../utils/html-escape.js';

// ==========================================
// Constants
// ==========================================

const CHAT_UI_MESSAGE_CONTAINER_ID = 'chat-messages';
const CHAT_UI_INPUT_ID = 'chat-input';
const CHAT_UI_SEND_ID = 'chat-send';
const CHAT_UI_SUGGESTIONS_ID = 'chat-suggestions';

// ==========================================
// SSE Sequence Validation (HNW Wave)
// ==========================================

/** SSE sequence buffer for reordering out-of-order chunks */
let sequenceBuffer = new Map();
let nextExpectedSeq = 0;
let gapDetected = false;
// Edge case: Maximum buffer size to prevent unbounded memory growth
const MAX_SEQUENCE_BUFFER_SIZE = 100;

/**
 * Process a chunk with sequence validation
 * Buffers out-of-order chunks and processes in-order
 *
 * @param {number} seq - Sequence number of the chunk
 * @param {string} data - Chunk data
 * @param {function} handler - Function to call with in-order data
 * @returns {boolean} True if processed immediately, false if buffered
 */
function processSequencedChunk(seq, data, handler) {
    // Edge case: Prevent unbounded buffer growth - but be careful not to drop expected data
    if (sequenceBuffer.size >= MAX_SEQUENCE_BUFFER_SIZE) {
        const oldestSeq = Math.min(...sequenceBuffer.keys());
        // CRITICAL: Before dropping, check if we're about to drop expected data
        if (oldestSeq === nextExpectedSeq) {
            // We're about to drop the sequence we're waiting for - process all possible first
            const toProcess = [];
            for (const [bufSeq, bufData] of sequenceBuffer) {
                if (bufSeq === nextExpectedSeq) {
                    toProcess.push({ seq: bufSeq, data: bufData });
                    nextExpectedSeq++;
                    sequenceBuffer.delete(bufSeq);
                }
            }
            // Process consecutive sequences
            for (const item of toProcess) {
                handler(item.data);
            }
            // Now check if we still need to drop
            if (sequenceBuffer.size >= MAX_SEQUENCE_BUFFER_SIZE) {
                const newOldest = Math.min(...sequenceBuffer.keys());
                sequenceBuffer.delete(newOldest);
                console.warn(`[ChatUI] Sequence buffer full (${MAX_SEQUENCE_BUFFER_SIZE}), dropped seq ${newOldest}`);
            }
        } else {
            sequenceBuffer.delete(oldestSeq);
            console.warn(`[ChatUI] Sequence buffer full (${MAX_SEQUENCE_BUFFER_SIZE}), dropped seq ${oldestSeq}`);
        }
    }

    // Add to buffer
    sequenceBuffer.set(seq, data);

    // Process any buffered chunks that are now in-order
    let processed = false;
    while (sequenceBuffer.has(nextExpectedSeq)) {
        handler(sequenceBuffer.get(nextExpectedSeq));
        sequenceBuffer.delete(nextExpectedSeq);
        nextExpectedSeq++;
        processed = true;
    }

    // Detect gaps (for debugging)
    if (!processed && sequenceBuffer.size > 5) {
        if (!gapDetected) {
            gapDetected = true;
            console.warn(`[ChatUI] SSE sequence gap detected: expecting ${nextExpectedSeq}, got ${seq}, buffered ${sequenceBuffer.size}`);
        }
    }

    return processed;
}

/**
 * Reset the sequence buffer (call at stream start)
 */
function resetSequenceBuffer() {
    sequenceBuffer.clear();
    nextExpectedSeq = 0;
    gapDetected = false;
}

/**
 * Get buffered chunks that haven't been processed
 * @returns {{ pending: number, gaps: number[] }}
 */
function getSequenceBufferStatus() {
    const bufferedSeqs = Array.from(sequenceBuffer.keys()).sort((a, b) => a - b);
    const gaps = [];

    for (let i = nextExpectedSeq; i < Math.max(...bufferedSeqs, nextExpectedSeq); i++) {
        if (!sequenceBuffer.has(i)) {
            gaps.push(i);
        }
    }

    return {
        pending: sequenceBuffer.size,
        nextExpected: nextExpectedSeq,
        gaps
    };
}

// ==========================================
// Message Rendering
// ==========================================

/**
 * Parse markdown to HTML for chat messages (safe subset only)
 * Improved version with better handling of nested patterns
 * @param {string} text - Raw markdown text
 * @returns {string} HTML string
 */
function parseMarkdown(text) {
    if (!text) return '';

    const escaped = escapeHtml(text);

    // Use a more robust approach that handles nesting better
    // Process in order: code blocks, bold, italic, line breaks

    // First, protect code blocks (inline code)
    const codeBlocks = [];
    let processedText = escaped.replace(/`([^`]+)`/g, (match, code) => {
        const placeholder = `__CODE_${codeBlocks.length}__`;
        codeBlocks.push(`<code>${code}</code>`);
        return placeholder;
    });

    // Process bold: **text** or __text__
    // Use a more specific pattern to avoid matching within words
    processedText = processedText
        .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__([\s\S]+?)__/g, '<strong>$1</strong>');

    // Process italic: *text* or _text_
    // Use negative lookahead/lookbehind to avoid matching within bold
    processedText = processedText
        .replace(/(?<!\*)\*(?!\*)([^\*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        .replace(/(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g, '<em>$1</em>');

    // Restore code blocks
    codeBlocks.forEach((code, i) => {
        processedText = processedText.replace(`__CODE_${i}__`, code);
    });

    // Process line breaks
    // Convert double newlines to paragraph breaks, single to line breaks
    processedText = processedText
        .replace(/\n\n+/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Wrap in paragraphs if we have content
    if (!processedText.includes('<p>') && !processedText.includes('</p>')) {
        processedText = `<p>${processedText}</p>`;
    }

    return processedText;
}

/**
 * Create a message element
 * @param {string} text - Message content
 * @param {string} role - 'user' or 'assistant'
 * @param {boolean} isError - Is this an error message
 * @returns {HTMLElement} Message element
 */
function createMessageElement(text, role, isError = false) {
    const div = document.createElement('div');
    div.className = `message ${role}${isError ? ' error' : ''}`;

    // Parse markdown for assistant messages, escape user messages
    // SAFE: content is escaped via escapeHtml() (assistant) or parseMarkdown() (which also escapes)
    // The final insertion into innerHTML is safe because all data has been escaped
    const content = role === 'assistant' ? parseMarkdown(text) : escapeHtml(text);
    // I18N FIX: Add dir="auto" to support bidirectional text (RTL/LTR)
    div.innerHTML = `<div class="message-content" dir="auto">${content}</div>`;

    return div;
}

/**
 * Add a message to the chat UI
 * @param {string} text - Message content
 * @param {string} role - 'user' or 'assistant'
 * @param {boolean} isError - Is this an error message
 * @param {object} options - Additional options
 * @returns {HTMLElement} The created message element
 */
function addMessage(text, role, isError = false, options = {}) {
    const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
    if (!messages) {
        console.warn('[ChatUI] Message container not found');
        return null;
    }

    const messageEl = createMessageElement(text, role, isError);

    // Add action buttons for messages
    if (role === 'user' && options.editable !== false) {
        addUserMessageActions(messageEl, text);
    } else if (role === 'assistant' && !isError && options.actions !== false) {
        addAssistantMessageActions(messageEl, text);
    } else if (role === 'assistant' && isError) {
        // Add retry button for error messages
        addErrorMessageActions(messageEl);
    }

    messages.appendChild(messageEl);
    messages.scrollTop = messages.scrollHeight;

    return messageEl;
}

/**
 * Add action buttons to user messages
 * @param {HTMLElement} messageEl - Message element
 * @param {string} originalText - Original message text
 */
function addUserMessageActions(messageEl, originalText) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn edit';
    editBtn.innerHTML = '✎';
    editBtn.title = 'Edit';
    editBtn.onclick = () => {
        enableEditMode(messageEl, originalText);
    };
    actionsDiv.appendChild(editBtn);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete';
    deleteBtn.onclick = () => {
        const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
        const index = Array.from(messages.children).indexOf(messageEl);
        if (Chat?.deleteMessage?.(index)) {
            messageEl.remove();
        }
    };
    actionsDiv.appendChild(deleteBtn);

    messageEl.appendChild(actionsDiv);
}

/**
 * Add action buttons to assistant messages
 * @param {HTMLElement} messageEl - Message element
 * @param {string} text - Message text
 */
function addAssistantMessageActions(messageEl, text) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn copy';
    copyBtn.innerHTML = '📋';
    copyBtn.title = 'Copy';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.innerHTML = '✓';
            setTimeout(() => { copyBtn.innerHTML = '📋'; }, 1500);
        }).catch((err) => {
            console.error('[ChatUI] Failed to copy text:', err);
            copyBtn.innerHTML = '✗';
            setTimeout(() => { copyBtn.innerHTML = '📋'; }, 1500);
            // Show toast for better visibility
            if (window.showToast) {
                window.showToast('Failed to copy to clipboard. Please copy manually.', 3000);
            }
        });
    };
    actionsDiv.appendChild(copyBtn);

    // Regenerate button
    const regenBtn = document.createElement('button');
    regenBtn.className = 'action-btn regenerate';
    regenBtn.innerHTML = '↻';
    regenBtn.title = 'Regenerate';
    regenBtn.onclick = async () => {
        if (window.processMessageResponse && Chat?.regenerateLastResponse) {
            messageEl.remove();
            await window.processMessageResponse((options) =>
                Chat.regenerateLastResponse(options)
            );
        }
    };
    actionsDiv.appendChild(regenBtn);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete';
    deleteBtn.onclick = () => {
        const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
        const index = Array.from(messages.children).indexOf(messageEl);
        if (Chat?.deleteMessage?.(index)) {
            messageEl.remove();
        }
    };
    actionsDiv.appendChild(deleteBtn);

    messageEl.appendChild(actionsDiv);
}

/**
 * Add action buttons to error messages (Try Again)
 * @param {HTMLElement} messageEl - Message element
 */
function addErrorMessageActions(messageEl) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions error-actions';

    // Try Again button
    const retryBtn = document.createElement('button');
    retryBtn.className = 'action-btn retry';
    retryBtn.innerHTML = '↻ Try Again';
    retryBtn.title = 'Try Again';
    retryBtn.onclick = async () => {
        if (window.processMessageResponse && Chat?.regenerateLastResponse) {
            messageEl.remove();
            await window.processMessageResponse((options) =>
                Chat.regenerateLastResponse(options)
            );
        }
    };
    actionsDiv.appendChild(retryBtn);

    messageEl.appendChild(actionsDiv);
}

/**
 * Enable edit mode for a message
 * @param {HTMLElement} messageEl - Message element
 * @param {string} currentText - Current message text
 */
function enableEditMode(messageEl, currentText) {
    const contentEl = messageEl.querySelector('.message-content');
    const actionsEl = messageEl.querySelector('.message-actions');

    // Hide original content and actions
    if (contentEl) contentEl.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';

    // Create edit form
    const editContainer = document.createElement('div');
    editContainer.className = 'edit-container';

    const textarea = document.createElement('textarea');
    textarea.className = 'edit-textarea';
    textarea.value = currentText;
    textarea.rows = Math.min(10, currentText.split('\n').length + 1);

    const buttonRow = document.createElement('div');
    buttonRow.className = 'edit-buttons';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.textContent = 'Save & Regenerate';
    saveBtn.onclick = async () => {
        const newText = textarea.value.trim();
        if (!newText) return;

        // Get message index in chat history
        const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
        const index = Array.from(messages.children).indexOf(messageEl);

        // Validate we can edit
        if (!Chat?.editMessage) {
            console.error('[ChatUI] Chat.editMessage not available');
            return;
        }

        // Remove edit UI
        editContainer.remove();

        // Update displayed content
        if (contentEl) {
            contentEl.textContent = newText;
            contentEl.style.display = '';
        }
        if (actionsEl) actionsEl.style.display = '';

        // Remove all messages after this one (AI responses to be regenerated)
        while (messageEl.nextElementSibling) {
            messageEl.nextElementSibling.remove();
        }

        // Use processMessageResponse to handle the edit with proper loading UI
        // editMessage internally truncates history and calls sendMessage
        if (window.processMessageResponse) {
            await window.processMessageResponse((options) =>
                Chat.editMessage(index, newText, options)
            );
        } else {
            // Fallback: call editMessage directly without progress UI
            console.warn('[ChatUI] processMessageResponse not available, using fallback');
            await Chat.editMessage(index, newText);
        }

        // FOCUS FIX: Return focus to chat input after successful edit
        restoreFocusToChatInput();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary btn-sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
        editContainer.remove();
        if (contentEl) contentEl.style.display = '';
        if (actionsEl) actionsEl.style.display = '';
        // FOCUS FIX: Return focus to chat input on cancel
        const chatInput = document.getElementById(CHAT_UI_INPUT_ID);
        if (chatInput) chatInput.focus();
    };

    buttonRow.appendChild(saveBtn);
    buttonRow.appendChild(cancelBtn);
    editContainer.appendChild(textarea);
    editContainer.appendChild(buttonRow);

    messageEl.appendChild(editContainer);
    textarea.focus();
}

/**
 * Restore focus to chat input after message operations
 * @private
 */
function restoreFocusToChatInput() {
    const chatInput = document.getElementById(CHAT_UI_INPUT_ID);
    if (chatInput) {
        chatInput.focus();
    }
}

// ==========================================
// Loading & Streaming
// ==========================================

/**
 * Add a loading message placeholder
 * @returns {string} ID of the loading element
 */
function addLoadingMessage() {
    const id = 'msg-' + Date.now();
    const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
    if (!messages) return id;

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
    if (!el) return;

    switch (state.type) {
        case 'tool_start':
            el.className = 'message tool-execution';
            // SAFE: state.tool is a predefined tool name from internal tool registry
            el.innerHTML = `<span class="icon">⚡</span> Analyzing data with ${escapeHtml(state.tool)}...`;
            break;

        case 'tool_end':
            el.className = 'message assistant loading';
            // SAFE: state.tool and error messages come from internal tool system
            const errorMsg = state.error || state.result?.error;
            const statusIcon = errorMsg ? '⚠️' : '✅';
            const statusText = errorMsg ? 'failed' : 'finished';
            el.innerHTML = `
                <div class="tool-status ${errorMsg ? 'error' : 'success'}">
                    ${statusIcon} ${escapeHtml(state.tool || 'Tool')} ${statusText}
                </div>
                <div class="typing-indicator"><span></span><span></span><span></span></div>
            `;
            break;

        case 'thinking':
            if (state.content) {
                // Thinking block from reasoning model
                let thinkingEl = el.querySelector('.thinking-block');
                if (!thinkingEl) {
                    thinkingEl = document.createElement('details');
                    thinkingEl.className = 'thinking-block';
                    // SAFE: Static HTML template
                    thinkingEl.innerHTML = '<summary>💭 Model reasoning</summary><div class="thinking-content"></div>';
                    el.insertBefore(thinkingEl, el.firstChild);
                }
                const content = thinkingEl.querySelector('.thinking-content');
                if (content) content.textContent = state.content;
            } else if (!el.dataset.streaming) {
                // Reset to thinking indicator
                el.className = 'message assistant loading';
                // SAFE: Static HTML template
                el.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
            }
            break;

        case 'token':
            // Streaming token
            if (!el.dataset.streaming) {
                // First token - switch to streaming mode
                el.dataset.streaming = 'true';
                el.className = 'message assistant streaming';
                // SAFE: Static HTML template structure
                // I18N FIX: Add dir="auto" to support bidirectional text (RTL/LTR)
                el.innerHTML = '<div class="message-content streaming-content" dir="auto"></div>';
            }
            const contentEl = el.querySelector('.streaming-content');
            if (contentEl && state.token) {
                // Escape and append token
                // SAFE: state.token is from AI response and is escaped before insertion
                const escaped = escapeHtml(state.token).replace(/\n/g, '<br>');
                contentEl.innerHTML += escaped;

                // Scroll to show new content
                const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
                if (messages) messages.scrollTop = messages.scrollHeight;
            }
            break;

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
    warningDiv.innerHTML = `
        <div class="message-content" dir="auto">
            <strong>${icon} ${title}</strong><br>
            ${escapeHtml(message)}<br>
            <small>Usage: ${tokenInfo.total}/${tokenInfo.contextWindow} tokens (${Math.round(tokenInfo.usagePercent)}%)</small>
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
    addAssistantMessageActions(messageEl, fullContent);
}

// ==========================================
// Input Handling
// ==========================================

// Edge case: Maximum message length to prevent performance issues
const MAX_MESSAGE_LENGTH = 50000; // 50K characters

/**
 * Get the current input value
 * Edge case: Trims and validates length
 * @returns {string}
 */
function getInputValue() {
    const input = document.getElementById(CHAT_UI_INPUT_ID);
    const value = input?.value?.trim() || '';
    // Edge case: Enforce maximum message length
    // Use Array.from to properly handle Unicode surrogate pairs (emojis, rare CJK chars)
    // which prevents splitting multi-byte characters during truncation
    if (value.length > MAX_MESSAGE_LENGTH) {
        console.warn(`[ChatUI] Message exceeds ${MAX_MESSAGE_LENGTH} characters, truncating`);
        const chars = Array.from(value);
        if (chars.length > MAX_MESSAGE_LENGTH) {
            return chars.slice(0, MAX_MESSAGE_LENGTH).join('');
        }
    }
    return value;
}

/**
 * Clear the input
 */
function clearInput() {
    const input = document.getElementById(CHAT_UI_INPUT_ID);
    if (input) input.value = '';
}

/**
 * Hide the suggestions panel
 */
function hideSuggestions() {
    const suggestions = document.getElementById(CHAT_UI_SUGGESTIONS_ID);
    if (suggestions) suggestions.style.display = 'none';
}

/**
 * Clear all messages from the chat
 */
function clearMessages() {
    const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
    if (messages) {
        // SAFE: Static HTML with no user input
        messages.innerHTML = '<div class="message assistant">What would you like to explore about your listening patterns?</div>';
    }

    // Show suggestions again
    const suggestions = document.getElementById(CHAT_UI_SUGGESTIONS_ID);
    if (suggestions) suggestions.style.display = '';
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const ChatUIController = {
    // Message rendering
    parseMarkdown,
    createMessageElement,
    addMessage,

    // Loading & streaming
    addLoadingMessage,
    updateLoadingMessage,
    removeMessageElement,
    finalizeStreamedMessage,

    // SSE sequence validation
    processSequencedChunk,
    resetSequenceBuffer,
    getSequenceBufferStatus,

    // Input handling
    getInputValue,
    clearInput,
    hideSuggestions,
    clearMessages,

    // Edit mode
    enableEditMode,
    restoreFocusToChatInput
};


console.log('[ChatUIController] Controller loaded');
