/**
 * Message Renderer
 *
 * Handles message element creation and markdown parsing.
 * Separates rendering concerns from other UI logic.
 *
 * @module controllers/message-renderer
 */

import { escapeHtml } from '../utils/html-escape.js';
import { parseMarkdown } from '../utils/parser.js';
import { MessageActions } from './message-actions.js';

// ==========================================
// Constants
// ==========================================

const CHAT_UI_MESSAGE_CONTAINER_ID = 'chat-messages';

// ==========================================
// Message Rendering
// ==========================================

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
    // security-validated: Uses escapeHtml() from js/utils/html-escape.js
    // Escaping method: DOM-based textContent assignment
    // Data flow: text parameter → escapeHtml() or parseMarkdown() (which also escapes) → innerHTML insertion
    // User messages: Direct HTML escaping
    // Assistant messages: Markdown parsing with internal escaping
    // The final insertion into innerHTML is safe because all data has been escaped
    // I18N FIX: Add dir="auto" to support bidirectional text (RTL/LTR)
    // Review date: 2026-01-28
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
        console.warn('[MessageRenderer] Message container not found');
        return null;
    }

    const messageEl = createMessageElement(text, role, isError);

    // Add action buttons for messages
    if (role === 'user' && options.editable !== false) {
        MessageActions.addUserMessageActions(messageEl, text);
    } else if (role === 'assistant' && !isError && options.actions !== false) {
        MessageActions.addAssistantMessageActions(messageEl, text);
    } else if (role === 'assistant' && isError) {
        // Add retry button for error messages
        MessageActions.addErrorMessageActions(messageEl);
    }

    messages.appendChild(messageEl);
    messages.scrollTop = messages.scrollHeight;

    return messageEl;
}

// ==========================================
// Public API
// ==========================================

export const MessageRenderer = {
    parseMarkdown,
    createMessageElement,
    addMessage,
};

console.log('[MessageRenderer] Module loaded');
