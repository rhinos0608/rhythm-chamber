/**
 * Session Actions Controller
 *
 * Manages session operations: create, delete, rename, and switch.
 * Handles inline rename editing, confirmation modals, and UI updates.
 *
 * Responsibilities:
 * - Create new session
 * - Delete session with confirmation modal
 * - Rename session with inline editing
 * - Switch between sessions
 * - Event listener cleanup for memory leak prevention
 *
 * @module controllers/sidebar/session-actions-controller
 */

import { Chat } from '../../chat.js';
import { ChatUIController } from '../chat-ui-controller.js';
import { TokenCounter } from '../../token-counter.js';
import { AppState } from '../../state/app-state.js';
import { SessionListController } from './session-list-controller.js';
import { SidebarStateController } from './state-controller.js';
import { escapeHtml } from '../../utils/html-escape.js';

// State tracking
let pendingDeleteSessionId = null;

// Rename input tracking for event listener cleanup (MEMORY LEAK FIX)
let currentRenameInput = null;
let currentRenameBlurHandler = null;
let currentRenameKeydownHandler = null;
// Render guard flag to prevent race conditions during re-render (MEMORY LEAK FIX)
let renameInProgress = false;

/**
 * Handle session click - switch to that session
 * @param {string} sessionId - Session ID to switch to
 */
async function handleSessionClick(sessionId) {
    const currentId = Chat.getCurrentSessionId();
    if (sessionId === currentId) return;

    try {
        await Chat.switchSession(sessionId);
    } catch (error) {
        console.error('[SessionActionsController] Failed to switch session:', error);
        return;
    }

    // Re-render chat messages
    renderChatMessages();

    // Update active state in sidebar
    SessionListController.updateActiveState(sessionId);

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        SidebarStateController.close();
    }
}

/**
 * Render chat messages for current session
 */
function renderChatMessages() {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;

    messages.innerHTML = '';
    const history = Chat.getHistory();
    history.forEach(msg => {
        if (msg.role === 'user' || msg.role === 'assistant') {
            appendMessage(msg.role, msg.content);
        }
    });
}

/**
 * Append a message to chat (helper for session switching)
 * @param {string} role - Message role ('user' or 'assistant')
 * @param {string} content - Message content
 */
function appendMessage(role, content) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;

    const div = document.createElement('div');
    div.className = `message ${role}`;

    // Render content using the same safe markdown parser as the chat UI
    let parsedContent = '';
    if (content) {
        if (ChatUIController?.parseMarkdown) {
            parsedContent = ChatUIController.parseMarkdown(content);
        } else {
            parsedContent = escapeHtml(content);
        }
    }

    div.innerHTML = `<div class="message-content">${parsedContent}</div>`;
    messages.appendChild(div);
}

/**
 * Handle new chat button
 */
async function handleNewChat() {
    try {
        await Chat.createNewSession();
    } catch (error) {
        console.error('[SessionActionsController] Failed to create new session:', error);
        return;
    }

    // Clear chat messages
    const messages = document.getElementById('chat-messages');
    if (messages) {
        messages.innerHTML = '';
    }

    // Reset token counter display
    if (TokenCounter?.resetDisplay) {
        TokenCounter.resetDisplay();
    }

    // Show suggestions
    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) {
        suggestions.style.display = 'flex';
    }

    // Refresh session list
    await SessionListController.renderSessionList();

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        SidebarStateController.close();
    }
}

/**
 * Handle session delete - show confirmation modal
 * @param {string} sessionId - Session ID to delete
 */
function handleSessionDelete(sessionId) {
    pendingDeleteSessionId = sessionId;
    const modal = document.getElementById('delete-chat-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * Hide delete chat confirmation modal
 */
function hideDeleteChatModal() {
    pendingDeleteSessionId = null;
    const modal = document.getElementById('delete-chat-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Confirm and execute the delete
 */
async function confirmDeleteChat() {
    if (!pendingDeleteSessionId) return;

    const sessionId = pendingDeleteSessionId;
    hideDeleteChatModal();

    try {
        const success = await Chat.deleteSessionById(sessionId);
        if (!success) {
            console.error('[SessionActionsController] Failed to delete session (returned false)');
            return;
        }

        // Remove session from sidebar
        SessionListController.removeSessionElement(sessionId);

        // Check if sidebar is now empty
        if (!SessionListController.hasSessions()) {
            await SessionListController.renderSessionList();
        }
    } catch (error) {
        console.error('[SessionActionsController] Failed to delete session:', error);
        return;
    }

    // If we deleted the current session, clear messages
    const currentId = Chat.getCurrentSessionId();
    if (!currentId || currentId === sessionId) {
        const messages = document.getElementById('chat-messages');
        if (messages) {
            messages.innerHTML = '';
        }
    }
}

/**
 * Handle session rename
 * @param {string} sessionId - Session ID to rename
 */
function handleSessionRename(sessionId) {
    // Guard against concurrent rename operations (RENDER GUARD FIX)
    if (renameInProgress) {
        console.warn(
            '[SessionActionsController] Rename already in progress, ignoring duplicate request'
        );
        return;
    }

    // MEMORY LEAK FIX: Use try-finally to ensure cleanup happens even on error
    try {
        renameInProgress = true;

        // Clean up any existing rename input listeners first (MEMORY LEAK FIX)
        cleanupRenameInput();

        const sessionEl = SessionListController.getSessionElement(sessionId);
        if (!sessionEl) {
            return;
        }

        const titleEl = sessionEl.querySelector('.session-title');
        const currentTitle = titleEl.textContent;

        // Replace with input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'session-title-input';
        input.value = currentTitle;
        titleEl.replaceWith(input);
        input.focus();
        input.select();

        // Store reference for cleanup (MEMORY LEAK FIX)
        currentRenameInput = input;

        // Save on blur or enter
        currentRenameBlurHandler = async () => {
            const newTitle = input.value.trim() || 'New Chat';
            try {
                await Chat.renameSession(sessionId, newTitle);

                // A11Y FIX: Update the session element's aria-label after successful rename
                // This ensures screen readers announce the new name
                const sessionEl = SessionListController.getSessionElement(sessionId);
                if (sessionEl) {
                    const currentId = Chat.getCurrentSessionId();
                    const activeLabel = sessionId === currentId ? ' (current)' : '';
                    sessionEl.setAttribute('aria-label', `${newTitle}${activeLabel}`);
                }
            } catch (error) {
                console.error('[SessionActionsController] Failed to rename session:', error);
                // Revert to original title on error
                input.value = currentTitle;
            }
            // Clean up listeners after save completes (MEMORY LEAK FIX)
            cleanupRenameInput();
            // Reset render guard flag (RENDER GUARD FIX)
            renameInProgress = false;

            // Refresh session list to show updated title
            await SessionListController.renderSessionList();
        };

        currentRenameKeydownHandler = e => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = currentTitle;
                // Reset flag on cancel since blur won't fire (RENDER GUARD FIX)
                renameInProgress = false;
                cleanupRenameInput();
                // Refresh to restore original title
                SessionListController.renderSessionList();
            }
        };

        input.addEventListener('blur', currentRenameBlurHandler);
        input.addEventListener('keydown', currentRenameKeydownHandler);
    } catch (error) {
        // MEMORY LEAK FIX: Log error but don't propagate - ensure cleanup happens
        console.error('[SessionActionsController] Error during rename setup:', error);
    } finally {
        // MEMORY LEAK FIX: Always reset flag, even if an error occurs
        // This ensures renameInProgress is cleared if getSessionElement throws
        // or any other error happens during the rename setup
        if (!currentRenameInput) {
            // If no input was created, reset the flag immediately
            renameInProgress = false;
        }
    }
}

/**
 * Clean up rename input event listeners (MEMORY LEAK FIX)
 * Called before re-rendering session list and in destroy()
 */
function cleanupRenameInput() {
    if (currentRenameInput) {
        if (currentRenameBlurHandler) {
            currentRenameInput.removeEventListener('blur', currentRenameBlurHandler);
        }
        if (currentRenameKeydownHandler) {
            currentRenameInput.removeEventListener('keydown', currentRenameKeydownHandler);
        }
        currentRenameInput = null;
        currentRenameBlurHandler = null;
        currentRenameKeydownHandler = null;
    }
}

/**
 * Get pending delete session ID
 * @returns {string|null}
 */
function getPendingDeleteId() {
    return pendingDeleteSessionId;
}

/**
 * Check if rename is in progress
 * @returns {boolean}
 */
function isRenameInProgress() {
    return renameInProgress;
}

/**
 * Cancel current rename operation
 */
function cancelRename() {
    if (renameInProgress) {
        cleanupRenameInput();
        renameInProgress = false;
    }
}

/**
 * Cleanup all state and listeners
 */
function destroy() {
    // Clean up rename input event listeners (MEMORY LEAK FIX)
    cleanupRenameInput();

    // Reset state
    pendingDeleteSessionId = null;
    renameInProgress = false;
}

// ES Module export
export const SessionActionsController = {
    handleSessionClick,
    handleNewChat,
    handleSessionDelete,
    hideDeleteChatModal,
    confirmDeleteChat,
    handleSessionRename,
    cleanupRenameInput,
    getPendingDeleteId,
    isRenameInProgress,
    cancelRename,
    destroy,
};

console.log('[SessionActionsController] Session actions controller loaded');
