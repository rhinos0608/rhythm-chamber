/**
 * Chat UI Controller
 * 
 * Handles chat message display, streaming, and user interactions.
 * Separates UI concerns from the Chat module's business logic.
 * 
 * @module controllers/chat-ui-controller
 */

// ==========================================
// Constants
// ==========================================

const CHAT_UI_MESSAGE_CONTAINER_ID = 'chat-messages';
const CHAT_UI_INPUT_ID = 'chat-input';
const CHAT_UI_SEND_ID = 'chat-send';
const CHAT_UI_SUGGESTIONS_ID = 'chat-suggestions';

// ==========================================
// Message Rendering
// ==========================================

/**
 * Escape HTML to prevent injection in rendered content
 * @param {string} text - Raw text
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => {
        switch (char) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&#39;';
            default:
                return char;
        }
    });
}

/**
 * Parse markdown to HTML for chat messages (safe subset only)
 * @param {string} text - Raw markdown text
 * @returns {string} HTML string
 */
function parseMarkdown(text) {
    if (!text) return '';

    const escaped = escapeHtml(text);

    return escaped
        // Bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        // Italic: *text* or _text_
        .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        // Code inline: `code`
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
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
    const content = role === 'assistant' ? parseMarkdown(text) : escapeHtml(text);
    div.innerHTML = `<div class="message-content">${content}</div>`;

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
        if (window.Chat?.deleteMessage?.(index)) {
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
        });
    };
    actionsDiv.appendChild(copyBtn);

    // Regenerate button
    const regenBtn = document.createElement('button');
    regenBtn.className = 'action-btn regenerate';
    regenBtn.innerHTML = '↻';
    regenBtn.title = 'Regenerate';
    regenBtn.onclick = async () => {
        if (window.processMessageResponse && window.Chat?.regenerateLastResponse) {
            messageEl.remove();
            await window.processMessageResponse((options) =>
                window.Chat.regenerateLastResponse(options)
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
        if (window.Chat?.deleteMessage?.(index)) {
            messageEl.remove();
        }
    };
    actionsDiv.appendChild(deleteBtn);

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

        // Update chat history
        const messages = document.getElementById(CHAT_UI_MESSAGE_CONTAINER_ID);
        const index = Array.from(messages.children).indexOf(messageEl);

        if (window.Chat?.editMessage?.(index, newText)) {
            // Remove edit UI
            editContainer.remove();

            // Update displayed content
            if (contentEl) {
                contentEl.textContent = newText;
                contentEl.style.display = '';
            }
            if (actionsEl) actionsEl.style.display = '';

            // Remove all messages after this one and regenerate
            while (messageEl.nextElementSibling) {
                messageEl.nextElementSibling.remove();
            }

            // Regenerate response
            if (window.processMessageResponse && window.Chat?.regenerateLastResponse) {
                await window.processMessageResponse((options) =>
                    window.Chat.regenerateLastResponse(options)
                );
            }
        }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary btn-sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
        editContainer.remove();
        if (contentEl) contentEl.style.display = '';
        if (actionsEl) actionsEl.style.display = '';
    };

    buttonRow.appendChild(saveBtn);
    buttonRow.appendChild(cancelBtn);
    editContainer.appendChild(textarea);
    editContainer.appendChild(buttonRow);

    messageEl.appendChild(editContainer);
    textarea.focus();
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
            el.innerHTML = `<span class="icon">⚡</span> Analyzing data with ${state.tool}...`;
            break;

        case 'tool_end':
            // Transition back to thinking
            break;

        case 'thinking':
            if (state.content) {
                // Thinking block from reasoning model
                let thinkingEl = el.querySelector('.thinking-block');
                if (!thinkingEl) {
                    thinkingEl = document.createElement('details');
                    thinkingEl.className = 'thinking-block';
                    thinkingEl.innerHTML = '<summary>💭 Model reasoning</summary><div class="thinking-content"></div>';
                    el.insertBefore(thinkingEl, el.firstChild);
                }
                const content = thinkingEl.querySelector('.thinking-content');
                if (content) content.textContent = state.content;
            } else if (!el.dataset.streaming) {
                // Reset to thinking indicator
                el.className = 'message assistant loading';
                el.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
            }
            break;

        case 'token':
            // Streaming token
            if (!el.dataset.streaming) {
                // First token - switch to streaming mode
                el.dataset.streaming = 'true';
                el.className = 'message assistant streaming';
                el.innerHTML = '<div class="message-content streaming-content"></div>';
            }
            const contentEl = el.querySelector('.streaming-content');
            if (contentEl && state.token) {
                // Escape and append token
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

    warningDiv.innerHTML = `
        <div class="message-content">
            <strong>${icon} ${title}</strong><br>
            ${message}<br>
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

/**
 * Get the current input value
 * @returns {string}
 */
function getInputValue() {
    const input = document.getElementById(CHAT_UI_INPUT_ID);
    return input?.value?.trim() || '';
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
        messages.innerHTML = '<div class="message assistant">What would you like to explore about your listening patterns?</div>';
    }

    // Show suggestions again
    const suggestions = document.getElementById(CHAT_UI_SUGGESTIONS_ID);
    if (suggestions) suggestions.style.display = '';
}

// ==========================================
// Public API
// ==========================================

window.ChatUIController = {
    // Message rendering
    parseMarkdown,
    createMessageElement,
    addMessage,

    // Loading & streaming
    addLoadingMessage,
    updateLoadingMessage,
    removeMessageElement,
    finalizeStreamedMessage,

    // Input handling
    getInputValue,
    clearInput,
    hideSuggestions,
    clearMessages,

    // Edit mode
    enableEditMode
};

console.log('[ChatUIController] Controller loaded');
