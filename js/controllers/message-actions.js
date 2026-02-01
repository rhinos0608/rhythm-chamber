/**
 * Message Actions
 *
 * Handles action button creation and event handling for messages.
 * Manages edit mode UI and focus management.
 *
 * @module controllers/message-actions
 */

import { Chat } from '../chat.js';

// ==========================================
// Constants
// ==========================================

const CHAT_UI_MESSAGE_CONTAINER_ID = 'chat-messages';
const CHAT_UI_INPUT_ID = 'chat-input';

// ==========================================
// Action Buttons
// ==========================================

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
        navigator.clipboard
            .writeText(text)
            .then(() => {
                copyBtn.innerHTML = '✓';
                setTimeout(() => {
                    copyBtn.innerHTML = '📋';
                }, 1500);
            })
            .catch(err => {
                console.error('[MessageActions] Failed to copy text:', err);
                copyBtn.innerHTML = '✗';
                setTimeout(() => {
                    copyBtn.innerHTML = '📋';
                }, 1500);
            });
    };
    actionsDiv.appendChild(copyBtn);

    // Regenerate button
    const regenBtn = document.createElement('button');
    regenBtn.className = 'action-btn regenerate';
    regenBtn.innerHTML = '↻';
    regenBtn.title = 'Regenerate';
    regenBtn.onclick = async () => {
        if (Chat?.regenerateLastResponse) {
            messageEl.remove();
            await Chat.regenerateLastResponse();
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
        if (Chat?.regenerateLastResponse) {
            messageEl.remove();
            await Chat.regenerateLastResponse();
        }
    };
    actionsDiv.appendChild(retryBtn);

    messageEl.appendChild(actionsDiv);
}

// ==========================================
// Edit Mode
// ==========================================

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
            console.error('[MessageActions] Chat.editMessage not available');
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

        // Call editMessage directly
        await Chat.editMessage(index, newText);

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
 */
function restoreFocusToChatInput() {
    const chatInput = document.getElementById(CHAT_UI_INPUT_ID);
    if (chatInput) {
        chatInput.focus();
    }
}

// ==========================================
// Public API
// ==========================================

export const MessageActions = {
    addUserMessageActions,
    addAssistantMessageActions,
    addErrorMessageActions,
    enableEditMode,
    restoreFocusToChatInput,
};

console.log('[MessageActions] Module loaded');
