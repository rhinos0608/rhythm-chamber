/**
 * Sidebar Controller
 *
 * Handles sidebar state, session list rendering, and session management UI.
 * Uses AppState for centralized state management.
 *
 * HNW Integration:
 * - Subscribes to AppState for reactive updates
 * - Uses AppState.get() for reading state
 * - Uses AppState.update() for state changes
 */

import { Storage } from '../storage.js';
import { Chat } from '../chat.js';
import { ChatUIController } from './chat-ui-controller.js';
import { TokenCounter } from '../token-counter.js';
import { AppState } from '../state/app-state.js';
import { EventBus } from '../services/event-bus.js';
import { escapeHtml } from '../utils/html-escape.js';
import { Utils } from '../utils.js';
import { STORAGE_KEYS } from '../storage/keys.js';
import { setupModalFocusTrap } from '../utils/focus-trap.js';

const SIDEBAR_STATE_KEY = STORAGE_KEYS.SIDEBAR_COLLAPSED;
let pendingDeleteSessionId = null;
let _unsubscribe = null; // AppState subscription cleanup

// Rename input tracking for event listener cleanup (MEMORY LEAK FIX)
let currentRenameInput = null;
let currentRenameBlurHandler = null;
let currentRenameKeydownHandler = null;
// Render guard flag to prevent race conditions during re-render (MEMORY LEAK FIX)
let renameInProgress = false;

// Focus trap cleanup for delete chat modal
let deleteChatModalFocusTrapCleanup = null;

// DOM elements (lazily initialized)
let chatSidebar = null;
let sidebarSessions = null;
let sidebarToggleBtn = null;
let sidebarCollapseBtn = null;
let sidebarOverlay = null;
let newChatBtn = null;

// Resize handler for mobile overlay state sync (RESPONSIVE FIX)
let resizeHandler = null;

/**
 * Initialize DOM element references
 */
function initDOMReferences() {
    chatSidebar = document.getElementById('chat-sidebar');
    sidebarSessions = document.getElementById('sidebar-sessions');
    sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
    sidebarOverlay = document.getElementById('sidebar-overlay');
    newChatBtn = document.getElementById('new-chat-btn');
}

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize sidebar state and event listeners
 * Uses AppState for centralized state management
 */
async function initSidebar() {
    initDOMReferences();

    // Restore collapsed state from unified storage or localStorage
    let savedState = null;
    if (Storage.getConfig) {
        savedState = await Storage.getConfig(SIDEBAR_STATE_KEY);
    }
    if (savedState === null) {
        savedState = localStorage.getItem(SIDEBAR_STATE_KEY);
    }

    // Update AppState with restored sidebar state
    const collapsed = savedState === 'true' || savedState === true;
    AppState.setSidebarCollapsed(collapsed);
    updateSidebarVisibility();

    // Setup event listeners
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }
    if (sidebarCollapseBtn) {
        sidebarCollapseBtn.addEventListener('click', toggleSidebar);
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }
    if (newChatBtn) {
        newChatBtn.addEventListener('click', handleNewChat);
    }

    // Setup event delegation for session actions (prevents XSS from inline onclick)
    if (sidebarSessions) {
        sidebarSessions.addEventListener('click', handleSessionAction);
    }

    // Register for session updates from EventBus
    SidebarController._sessionHandler = EventBus.on('session:*', renderSessionList);

    // Subscribe to AppState for reactive view changes
    // If a previous subscription exists, unsubscribe first to avoid duplicates
    if (typeof _unsubscribe === 'function') {
        try {
            _unsubscribe();
        } catch (e) {
            console.warn('[SidebarController] previous unsubscribe threw:', e);
        }
        _unsubscribe = null;
    }

    _unsubscribe = AppState.subscribe(async (state, changedDomains) => {
        if (changedDomains.includes('view')) {
            // Auto-show/hide sidebar based on view
            if (state.view.current === 'chat') {
                if (chatSidebar) {
                    chatSidebar.classList.remove('hidden');
                    updateSidebarVisibility();
                    // Safely await renderSessionList with error handling
                    try {
                        await renderSessionList();
                    } catch (err) {
                        console.error('[SidebarController] Failed to render session list:', err);
                    }
                }
            } else {
                hideSidebarForNonChatViews();
            }
        }

        if (changedDomains.includes('ui')) {
            updateSidebarVisibility();
        }
    });

    // Setup resize handler to sync overlay state on breakpoint changes (RESPONSIVE FIX)
    // Remove existing handler if present
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
    }
    resizeHandler = Utils.throttle(() => {
        // Re-evaluate overlay visibility when crossing mobile breakpoint
        updateSidebarVisibility();
    }, 100); // Throttle resize to once per 100ms
    window.addEventListener('resize', resizeHandler);

    // Initial sidebar hidden (shown only in chat view)
    hideSidebarForNonChatViews();
}

// ==========================================
// Visibility Management
// ==========================================

/**
 * Hide sidebar when not in chat view
 */
function hideSidebarForNonChatViews() {
    const viewState = AppState.get('view');
    if (chatSidebar && viewState.current !== 'chat') {
        chatSidebar.classList.add('hidden');
    }
}

/**
 * Update sidebar visibility based on state
 */
function updateSidebarVisibility() {
    if (!chatSidebar) return;

    const uiState = AppState.get('ui');

    if (uiState.sidebarCollapsed) {
        chatSidebar.classList.add('collapsed');
    } else {
        chatSidebar.classList.remove('collapsed');
    }

    // Mobile overlay
    if (sidebarOverlay) {
        if (!uiState.sidebarCollapsed && window.innerWidth <= 768) {
            sidebarOverlay.classList.add('visible');
        } else {
            sidebarOverlay.classList.remove('visible');
        }
    }
}

/**
 * Toggle sidebar collapsed state
 */
function toggleSidebar() {
    const currentCollapsed = AppState.get('ui').sidebarCollapsed;
    const newCollapsed = !currentCollapsed;

    // Update AppState
    AppState.setSidebarCollapsed(newCollapsed);

    // Save to unified storage and localStorage
    if (Storage.setConfig) {
        Storage.setConfig(SIDEBAR_STATE_KEY, newCollapsed)
            .catch(err => console.warn('[SidebarController] Failed to save sidebar state:', err));
    }
    localStorage.setItem(SIDEBAR_STATE_KEY, newCollapsed.toString());

    // Mobile: Toggle open class
    if (window.innerWidth <= 768) {
        if (newCollapsed) {
            chatSidebar.classList.remove('open');
        } else {
            chatSidebar.classList.add('open');
        }
    }
}

/**
 * Close sidebar (mobile)
 */
function closeSidebar() {
    // Update AppState
    AppState.setSidebarCollapsed(true);

    // Save to unified storage and localStorage
    if (Storage.setConfig) {
        Storage.setConfig(SIDEBAR_STATE_KEY, true)
            .catch(err => console.warn('[SidebarController] Failed to save sidebar state on close:', err));
    }
    localStorage.setItem(SIDEBAR_STATE_KEY, 'true');

    if (chatSidebar) {
        chatSidebar.classList.remove('open');
    }
}

// ==========================================
// Session List Rendering
// ==========================================

/**
 * Render session list in sidebar
 */
async function renderSessionList() {
    // Clean up rename input listeners before re-rendering (MEMORY LEAK FIX)
    // Only cleanup if not actively renaming (RENDER GUARD FIX)
    if (!renameInProgress) {
        cleanupRenameInput();
    }

    if (!sidebarSessions) return;

    const sessions = await Chat.listSessions();
    const currentId = Chat.getCurrentSessionId();

    // Use the session list as the single source-of-truth
    const sessionsToRender = sessions;

    if (sessionsToRender.length === 0) {
        sidebarSessions.innerHTML = `
            <div class="sidebar-empty" role="status">
                <span class="emoji" aria-hidden="true">💬</span>
                <p>Your chat history is empty.<br>Ask a question to start exploring!</p>
                <button class="empty-action" data-action="new-chat-from-empty" aria-label="Start a new chat">Start a Chat</button>
            </div>
        `;
        return;
    }

    sidebarSessions.innerHTML = sessionsToRender.map(session => {
        const isActive = session.id === currentId;
        const date = new Date(session.updatedAt || session.createdAt);
        const dateStr = formatRelativeDate(date);
        const emoji = session.metadata?.personalityEmoji || '🎵';
        const title = session.title || 'New Chat';
        const activeLabel = isActive ? ' (current)' : '';

        // SAFE: Use data-action attributes instead of inline onclick to prevent XSS
        // session.id is escaped via escapeHtml() to prevent injection
        // A11Y: Added proper roles and labels for screen readers
        return `
            <div class="session-item ${isActive ? 'active' : ''}"
                 role="listitem"
                 tabindex="${isActive ? '0' : '-1'}"
                 aria-label="${escapeHtml(title)}${activeLabel}"
                 data-session-id="${escapeHtml(session.id)}"
                 data-action="sidebar-session-click">
                <div class="session-title">${escapeHtml(title)}</div>
                <div class="session-meta">
                    <span class="emoji" aria-hidden="true">${emoji}</span>
                    <span>${dateStr}</span>
                    <span aria-hidden="true">·</span>
                    <span>${session.messageCount || 0} msgs</span>
                </div>
                <div class="session-actions">
                    <button class="session-action-btn"
                            data-action="sidebar-session-rename"
                            data-session-id="${escapeHtml(session.id)}"
                            aria-label="Rename chat: ${escapeHtml(title)}"
                            title="Rename">✏️</button>
                    <button class="session-action-btn delete"
                            data-action="sidebar-session-delete"
                            data-session-id="${escapeHtml(session.id)}"
                            aria-label="Delete chat: ${escapeHtml(title)}"
                            title="Delete">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Format date as relative string
 */
function formatRelativeDate(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
}

/**
 * Validate session ID format to prevent injection attacks
 * Session IDs must be alphanumeric with hyphens and underscores only
 * @param {string} id - Session ID to validate
 * @returns {boolean} True if valid format
 */
function isValidSessionId(id) {
    return /^[a-z0-9\-_]+$/i.test(id);
}

/**
 * Handle session actions via event delegation (XSS prevention)
 * Routes click events from data-action attributes to appropriate handlers
 */
function handleSessionAction(event) {
    // Find the clicked element or its ancestor with data-action
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const sessionId = target.dataset.sessionId;

    // SECURITY: Validate session ID format before use
    if (sessionId && !isValidSessionId(sessionId)) {
        console.warn('[SidebarController] Invalid session ID format:', sessionId);
        return;
    }

    switch (action) {
        case 'sidebar-session-click':
            event.preventDefault();
            if (sessionId) {
                handleSessionClick(sessionId);
            }
            break;
        case 'new-chat-from-empty':
            event.preventDefault();
            handleNewChat();
            break;
        case 'sidebar-session-rename':
            event.stopPropagation();
            event.preventDefault();
            if (sessionId) {
                handleSessionRename(sessionId);
            }
            break;
        case 'sidebar-session-delete':
            event.stopPropagation();
            event.preventDefault();
            if (sessionId) {
                handleSessionDelete(sessionId);
            }
            break;
    }
}

// ==========================================
// Session Actions
// ==========================================

/**
 * Handle session click - switch to that session
 */
async function handleSessionClick(sessionId) {
    const currentId = Chat.getCurrentSessionId();
    if (sessionId === currentId) return;

    try {
        await Chat.switchSession(sessionId);
    } catch (error) {
        console.error('[SidebarController] Failed to switch session:', error);
        return;
    }

    // Re-render chat messages
    const messages = document.getElementById('chat-messages');
    if (messages) {
        messages.innerHTML = '';
        const history = Chat.getHistory();
        history.forEach(msg => {
            if (msg.role === 'user' || msg.role === 'assistant') {
                appendMessage(msg.role, msg.content);
            }
        });
    }

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
}

/**
 * Handle new chat button
 */
async function handleNewChat() {
    try {
        await Chat.createNewSession();
    } catch (error) {
        console.error('[SidebarController] Failed to create new session:', error);
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

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
}

/**
 * Handle session delete - show confirmation modal
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
            console.error('[SidebarController] Failed to delete session (returned false)');
            return;
        }

        // Remove session from sidebar
        const sessionEl = document.querySelector(`[data-session-id="${sessionId}"]`);
        if (sessionEl) {
            sessionEl.remove();
        }
    } catch (error) {
        console.error('[SidebarController] Failed to delete session:', error);
        return;
    }

    // If we deleted the current session, clear messages
    const messages = document.getElementById('chat-messages');
    if (messages) {
        messages.innerHTML = '';
    }
}

/**
 * Handle session rename
 */
async function handleSessionRename(sessionId) {
    // Guard against concurrent rename operations (RENDER GUARD FIX)
    if (renameInProgress) {
        console.warn('[SidebarController] Rename already in progress, ignoring duplicate request');
        return;
    }
    renameInProgress = true;

    // Clean up any existing rename input listeners first (MEMORY LEAK FIX)
    cleanupRenameInput();

    const sessionEl = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (!sessionEl) {
        // Reset flag if session not found (RENDER GUARD FIX)
        renameInProgress = false;
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
            const sessionEl = document.querySelector(`[data-session-id="${sessionId}"]`);
            if (sessionEl) {
                const currentId = Chat.getCurrentSessionId();
                const activeLabel = sessionId === currentId ? ' (current)' : '';
                sessionEl.setAttribute('aria-label', `${newTitle}${activeLabel}`);
            }
        } catch (error) {
            console.error('[SidebarController] Failed to rename session:', error);
            // Revert to original title on error
            input.value = currentTitle;
        }
        // Clean up listeners after save completes (MEMORY LEAK FIX)
        cleanupRenameInput();
        // Reset render guard flag (RENDER GUARD FIX)
        renameInProgress = false;
    };

    currentRenameKeydownHandler = (e) => {
        if (e.key === 'Enter') {
            input.blur();
        } else if (e.key === 'Escape') {
            input.value = currentTitle;
            // Reset flag on cancel since blur won't fire (RENDER GUARD FIX)
            renameInProgress = false;
            cleanupRenameInput();
        }
    };

    input.addEventListener('blur', currentRenameBlurHandler);
    input.addEventListener('keydown', currentRenameKeydownHandler);
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

// ==========================================
// Message Rendering (for session switching)
// ==========================================

/**
 * Append a message to chat (helper for session switching)
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

// ==========================================
// Public API
// ==========================================

// ES Module export
export const SidebarController = {
    init: initSidebar,
    toggle: toggleSidebar,
    close: closeSidebar,
    updateVisibility: updateSidebarVisibility,
    hideForNonChatViews: hideSidebarForNonChatViews,
    renderSessionList,
    // Session actions (exposed for onclick handlers)
    handleSessionClick,
    handleNewChat,
    handleSessionDelete,
    handleSessionRename,
    hideDeleteChatModal,
    confirmDeleteChat,
    // Utilities
    formatRelativeDate,
    escapeHtml, // Export centralized escapeHtml utility
    appendMessage
};

// Teardown helper to remove subscriptions and listeners
SidebarController.destroy = function destroySidebarController() {
    // Unsubscribe AppState
    if (typeof _unsubscribe === 'function') {
        try {
            _unsubscribe();
        } catch (e) {
            console.warn('[SidebarController] unsubscribe failed during destroy:', e);
        }
        _unsubscribe = null;
    }

    // Unregister session update callback from EventBus
    if (SidebarController._sessionHandler && typeof SidebarController._sessionHandler === 'function') {
        try {
            SidebarController._sessionHandler();
            SidebarController._sessionHandler = null;
        } catch (e) {
            console.warn('[SidebarController] Failed to unregister session update callback:', e);
        }
    }

    // Remove resize handler (RESPONSIVE FIX - cleanup)
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }

    // Clean up rename input event listeners (MEMORY LEAK FIX)
    cleanupRenameInput();

    // Remove DOM event listeners if initialized
    try {
        if (sidebarToggleBtn) sidebarToggleBtn.removeEventListener('click', toggleSidebar);
        if (sidebarCollapseBtn) sidebarCollapseBtn.removeEventListener('click', toggleSidebar);
        if (sidebarOverlay) sidebarOverlay.removeEventListener('click', closeSidebar);
        if (newChatBtn) newChatBtn.removeEventListener('click', handleNewChat);
    } catch (e) {
        console.warn('[SidebarController] Failed to remove event listener:', e);
    }
};


console.log('[SidebarController] Controller loaded');

// SECURITY: Removed global window exposure to reduce attack surface
// The controller is now accessible via ES module imports only

