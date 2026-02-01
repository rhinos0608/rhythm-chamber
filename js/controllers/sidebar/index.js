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
import { ChatUIController } from '../chat-ui-controller.js';
import { escapeHtml } from '../../utils/html-escape.js';

// NOTE: DOM elements and event subscriptions are managed by js/controllers/sidebar-controller.js
// This coordinator only delegates method calls to sub-controllers

/**
 * Initialize sidebar controller and all sub-controllers
 */
async function initSidebar() {
    // Initialize sub-controllers
    await SidebarStateController.init();
    SessionListController.init();

    // NOTE: Event listeners are registered in js/controllers/sidebar-controller.js
    // to avoid double registration. This coordinator only initializes sub-controllers
    // and delegates method calls, but does not register its own event listeners.

    // Initial sidebar hidden (shown only in chat view)
    SidebarStateController.hideForNonChatViews();
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
    appendMessage,
};

/**
 * Teardown helper to remove subscriptions and listeners
 */
SidebarController.destroy = function destroySidebarController() {
    // NOTE: Event listeners are managed by js/controllers/sidebar-controller.js
    // This coordinator only needs to clean up sub-controllers

    // Cleanup sub-controllers
    SidebarStateController.destroy();
    SessionListController.destroy();
    SessionActionsController.destroy();
};

// Export sub-controllers for direct access if needed
export { SidebarStateController, SessionListController, SessionActionsController };

console.log('[SidebarController] Refactored controller loaded (coordinator pattern)');
