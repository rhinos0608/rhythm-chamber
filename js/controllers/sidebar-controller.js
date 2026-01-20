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

const SIDEBAR_STATE_KEY = 'rhythm_chamber_sidebar_collapsed';
let pendingDeleteSessionId = null;
let _unsubscribe = null; // AppState subscription cleanup

// DOM elements (lazily initialized)
let chatSidebar = null;
let sidebarSessions = null;
let sidebarToggleBtn = null;
let sidebarCollapseBtn = null;
let sidebarOverlay = null;
let newChatBtn = null;

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

    // Register for session updates from Chat module
    if (Chat?.onSessionUpdate) {
        Chat.onSessionUpdate(renderSessionList);
    }

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

    _unsubscribe = AppState.subscribe((state, changedDomains) => {
        if (changedDomains.includes('view')) {
            // Auto-show/hide sidebar based on view
            if (state.view.current === 'chat') {
                if (chatSidebar) {
                    chatSidebar.classList.remove('hidden');
                    updateSidebarVisibility();
                    renderSessionList();
                }
            } else {
                hideSidebarForNonChatViews();
            }
        }

        if (changedDomains.includes('ui')) {
            updateSidebarVisibility();
        }
    });

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
        Storage.setConfig(SIDEBAR_STATE_KEY, newCollapsed).catch(() => { });
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
        Storage.setConfig(SIDEBAR_STATE_KEY, true).catch(() => { });
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
    if (!sidebarSessions) return;

    const sessions = await Chat.listSessions();
    const currentId = Chat.getCurrentSessionId();

    if (sessions.length === 0) {
        sidebarSessions.innerHTML = `
            <div class="sidebar-empty">
                <div class="emoji">💬</div>
                <p>No conversations yet.<br>Start a new chat!</p>
            </div>
        `;
        return;
    }

    sidebarSessions.innerHTML = sessions.map(session => {
        const isActive = session.id === currentId;
        const date = new Date(session.updatedAt || session.createdAt);
        const dateStr = formatRelativeDate(date);
        const emoji = session.metadata?.personalityEmoji || '🎵';

        return `
            <div class="session-item ${isActive ? 'active' : ''}" 
                 data-session-id="${session.id}"
                 onclick="SidebarController.handleSessionClick('${session.id}')">
                <div class="session-title">${escapeHtml(session.title || 'New Chat')}</div>
                <div class="session-meta">
                    <span class="emoji">${emoji}</span>
                    <span>${dateStr}</span>
                    <span>·</span>
                    <span>${session.messageCount || 0} msgs</span>
                </div>
                <div class="session-actions">
                    <button class="session-action-btn" 
                            onclick="event.stopPropagation(); SidebarController.handleSessionRename('${session.id}')"
                            title="Rename">✏️</button>
                    <button class="session-action-btn delete" 
                            onclick="event.stopPropagation(); SidebarController.handleSessionDelete('${session.id}')"
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
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

    await Chat.switchSession(sessionId);

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
    await Chat.createNewSession();

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

    await Chat.deleteSessionById(sessionId);

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
    const sessionEl = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (!sessionEl) return;

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

    // Save on blur or enter
    const saveTitle = async () => {
        const newTitle = input.value.trim() || 'New Chat';
        await Chat.renameSession(sessionId, newTitle);
    };

    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            input.blur();
        } else if (e.key === 'Escape') {
            input.value = currentTitle;
            input.blur();
        }
    });
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
    escapeHtml,
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

    // Remove DOM event listeners if initialized
    try {
        if (sidebarToggleBtn) sidebarToggleBtn.removeEventListener('click', toggleSidebar);
        if (sidebarCollapseBtn) sidebarCollapseBtn.removeEventListener('click', toggleSidebar);
        if (sidebarOverlay) sidebarOverlay.removeEventListener('click', closeSidebar);
        if (newChatBtn) newChatBtn.removeEventListener('click', handleNewChat);
    } catch (e) {
        // Non-fatal
    }
};


console.log('[SidebarController] Controller loaded');

