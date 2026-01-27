/**
 * Sidebar Controller (Coordinator)
 *
 * Refactored coordinator that routes to specialized sub-controllers.
 * Maintains backward compatibility by exposing the original API.
 *
 * Architecture:
 * - StateController: Manages collapse/expand state and visibility
 * - SessionListController: Handles session list rendering
 * - SessionActionsController: Manages session operations (create, delete, rename, switch)
 *
 * This file serves as the main entry point, coordinating between sub-controllers
 * while maintaining the original SidebarController API for backward compatibility.
 *
 * @module controllers/sidebar
 */

import { SidebarStateController } from './state-controller.js';
import { SessionListController } from './session-list-controller.js';
import { SessionActionsController } from './session-actions-controller.js';
import { Storage } from '../../storage.js';
import { AppState } from '../../state/app-state.js';
import { EventBus } from '../../services/event-bus.js';
import { Chat } from '../../chat.js';
import { ChatUIController } from '../chat-ui-controller.js';
import { escapeHtml } from '../../utils/html-escape.js';

// Private state
let _unsubscribe = null; // AppState subscription cleanup
let _sessionHandler = null; // EventBus session handler cleanup

// DOM elements (lazily initialized)
let sidebarSessions = null;
let sidebarToggleBtn = null;
let sidebarCollapseBtn = null;
let sidebarOverlay = null;
let newChatBtn = null;

/**
 * Initialize DOM element references
 */
function initDOMReferences() {
    sidebarSessions = document.getElementById('sidebar-sessions');
    sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
    sidebarOverlay = document.getElementById('sidebar-overlay');
    newChatBtn = document.getElementById('new-chat-btn');
}

/**
 * Initialize sidebar controller and all sub-controllers
 */
async function initSidebar() {
    initDOMReferences();

    // Initialize sub-controllers
    await SidebarStateController.init();
    SessionListController.init();

    // Setup event listeners for state management
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', SidebarStateController.toggle);
    }
    if (sidebarCollapseBtn) {
        sidebarCollapseBtn.addEventListener('click', SidebarStateController.toggle);
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', SidebarStateController.close);
    }
    if (newChatBtn) {
        newChatBtn.addEventListener('click', SessionActionsController.handleNewChat);
    }

    // Setup event delegation for session actions (prevents XSS from inline onclick)
    if (sidebarSessions) {
        sidebarSessions.addEventListener('click', handleSessionAction);
    }

    // Register for session updates from EventBus
    _sessionHandler = EventBus.on('session:*', SessionListController.renderSessionList);

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
                const chatSidebar = document.getElementById('chat-sidebar');
                if (chatSidebar) {
                    chatSidebar.classList.remove('hidden');
                    SidebarStateController.updateVisibility();
                    // Safely await renderSessionList with error handling
                    try {
                        await SessionListController.renderSessionList();
                    } catch (err) {
                        console.error('[SidebarController] Failed to render session list:', err);
                    }
                }
            } else {
                SidebarStateController.hideForNonChatViews();
            }
        }

        if (changedDomains.includes('ui')) {
            SidebarStateController.updateVisibility();
        }
    });

    // Initial sidebar hidden (shown only in chat view)
    SidebarStateController.hideForNonChatViews();
}

/**
 * Handle session actions via event delegation (XSS prevention)
 * Routes click events from data-action attributes to appropriate handlers
 * @param {Event} event - Click event
 */
function handleSessionAction(event) {
    // Find the clicked element or its ancestor with data-action
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const sessionId = target.dataset.sessionId;

    // SECURITY: Validate session ID format before use
    if (sessionId && !SessionListController.isValidSessionId(sessionId)) {
        console.warn('[SidebarController] Invalid session ID format:', sessionId);
        return;
    }

    switch (action) {
        case 'sidebar-session-click':
            event.preventDefault();
            if (sessionId) {
                SessionActionsController.handleSessionClick(sessionId);
            }
            break;
        case 'new-chat-from-empty':
            event.preventDefault();
            SessionActionsController.handleNewChat();
            break;
        case 'sidebar-session-rename':
            event.stopPropagation();
            event.preventDefault();
            if (sessionId) {
                SessionActionsController.handleSessionRename(sessionId);
            }
            break;
        case 'sidebar-session-delete':
            event.stopPropagation();
            event.preventDefault();
            if (sessionId) {
                SessionActionsController.handleSessionDelete(sessionId);
            }
            break;
    }
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

// ==========================================
// Public API - Backward Compatible
// ==========================================

/**
 * Main SidebarController export
 * Coordinates between sub-controllers while maintaining original API
 */
export const SidebarController = {
    // Initialization
    init: initSidebar,

    // State management (delegated to SidebarStateController)
    toggle: SidebarStateController.toggle,
    close: SidebarStateController.close,
    updateVisibility: SidebarStateController.updateVisibility,
    hideForNonChatViews: SidebarStateController.hideForNonChatViews,

    // Session list (delegated to SessionListController)
    renderSessionList: SessionListController.renderSessionList,
    formatRelativeDate: SessionListController.formatRelativeDate,

    // Session actions (delegated to SessionActionsController)
    handleSessionClick: SessionActionsController.handleSessionClick,
    handleNewChat: SessionActionsController.handleNewChat,
    handleSessionDelete: SessionActionsController.handleSessionDelete,
    handleSessionRename: SessionActionsController.handleSessionRename,
    hideDeleteChatModal: SessionActionsController.hideDeleteChatModal,
    confirmDeleteChat: SessionActionsController.confirmDeleteChat,

    // Utilities
    escapeHtml,
    appendMessage
};

/**
 * Teardown helper to remove subscriptions and listeners
 */
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
    if (_sessionHandler && typeof _sessionHandler === 'function') {
        try {
            _sessionHandler();
            _sessionHandler = null;
        } catch (e) {
            console.warn('[SidebarController] Failed to unregister session update callback:', e);
        }
    }

    // Cleanup sub-controllers
    SidebarStateController.destroy();
    SessionListController.destroy();
    SessionActionsController.destroy();

    // Remove DOM event listeners if initialized
    try {
        if (sidebarToggleBtn) sidebarToggleBtn.removeEventListener('click', SidebarStateController.toggle);
        if (sidebarCollapseBtn) sidebarCollapseBtn.removeEventListener('click', SidebarStateController.toggle);
        if (sidebarOverlay) sidebarOverlay.removeEventListener('click', SidebarStateController.close);
        if (newChatBtn) newChatBtn.removeEventListener('click', SessionActionsController.handleNewChat);
        if (sidebarSessions) sidebarSessions.removeEventListener('click', handleSessionAction);
    } catch (e) {
        console.warn('[SidebarController] Failed to remove event listener:', e);
    }
};

// Export sub-controllers for direct access if needed
export { SidebarStateController, SessionListController, SessionActionsController };

// Also export as default for compatibility
export default SidebarController;

console.log('[SidebarController] Refactored controller loaded (coordinator pattern)');
