/**
 * Session List Controller
 *
 * Manages rendering and interaction with the session list in the sidebar.
 * Handles session display, active state, and relative date formatting.
 *
 * Responsibilities:
 * - Render session list with proper formatting
 * - Format relative dates (Today, Yesterday, X days ago, etc.)
 * - Handle session click events
 * - Display empty state when no sessions
 * - XSS prevention via HTML escaping
 *
 * @module controllers/sidebar/session-list-controller
 */

import { Chat } from '../../chat.js';
import { escapeHtml } from '../../utils/html-escape.js';
import { SESSION } from '../../constants/session.js';

// DOM element reference (cached)
let sidebarSessions = null;

/**
 * Initialize DOM references
 */
function initDOMReferences() {
    sidebarSessions = document.getElementById('sidebar-sessions');
}

/**
 * Initialize session list controller
 */
function init() {
    initDOMReferences();
}

/**
 * Format date as relative string
 * @param {Date} date - Date to format
 * @returns {string} Relative date string
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
 * M6 FIX: Now uses shared SESSION constants with proper length limits
 * @param {string} id - Session ID to validate
 * @returns {boolean} True if valid format
 */
function isValidSessionId(id) {
    // Check for null/undefined and type first
    if (id == null || typeof id !== 'string') {
        return false;
    }
    // Check length limits (M6: 1 < length <= 64)
    if (id.length === 0 || id.length > SESSION.MAX_ID_LENGTH) {
        return false;
    }
    // Use shared constant pattern for validation
    return SESSION.ID_PATTERN.test(id);
}

/**
 * Render session list in sidebar
 * Displays empty state when no sessions exist
 */
async function renderSessionList() {
    if (!sidebarSessions) return;

    const sessions = await Chat.listSessions();
    const currentId = Chat.getCurrentSessionId();

    // Use the session list as the single source-of-truth
    const sessionsToRender = sessions;

    if (sessionsToRender.length === 0) {
        renderEmptyState();
        return;
    }

    renderSessions(sessionsToRender, currentId);
}

/**
 * Render empty state when no sessions exist
 */
function renderEmptyState() {
    sidebarSessions.innerHTML = `
        <div class="sidebar-empty" role="status">
            <span class="emoji" aria-hidden="true">💬</span>
            <p>Your chat history is empty.<br>Ask a question to start exploring!</p>
            <button class="empty-action" data-action="new-chat-from-empty" aria-label="Start a new chat">Start a Chat</button>
        </div>
    `;
}

/**
 * Render sessions list
 * @param {Array} sessions - Sessions to render
 * @param {string} currentId - Current active session ID
 */
function renderSessions(sessions, currentId) {
    sidebarSessions.innerHTML = sessions.map(session => {
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
 * Get DOM reference to sessions container
 * @returns {Element|null}
 */
function getContainer() {
    return sidebarSessions;
}

/**
 * Check if container has sessions
 * @returns {boolean}
 */
function hasSessions() {
    return sidebarSessions &&
           sidebarSessions.querySelector('.session-item') !== null;
}

/**
 * Get all session elements
 * @returns {NodeList}
 */
function getSessionElements() {
    return sidebarSessions ?
           sidebarSessions.querySelectorAll('.session-item') :
           [];
}

/**
 * Get session element by ID
 * @param {string} sessionId - Session ID to find
 * @returns {Element|null}
 */
function getSessionElement(sessionId) {
    if (!sidebarSessions) return null;
    return sidebarSessions.querySelector(`[data-session-id="${sessionId}"]`);
}

/**
 * Remove session element from DOM
 * @param {string} sessionId - Session ID to remove
 */
function removeSessionElement(sessionId) {
    const sessionEl = getSessionElement(sessionId);
    if (sessionEl) {
        sessionEl.remove();
    }
}

/**
 * Update session active state
 * @param {string} sessionId - Session ID to mark as active
 */
function updateActiveState(sessionId) {
    const sessions = getSessionElements();
    sessions.forEach(el => {
        const isCurrent = el.dataset.sessionId === sessionId;
        el.classList.toggle('active', isCurrent);
        el.tabIndex = isCurrent ? '0' : '-1';

        // Update aria-label
        const titleEl = el.querySelector('.session-title');
        if (titleEl && isCurrent) {
            const currentLabel = el.getAttribute('aria-label') || '';
            if (!currentLabel.includes(' (current)')) {
                el.setAttribute('aria-label', currentLabel + ' (current)');
            }
        }
    });
}

/**
 * Cleanup DOM references
 */
function destroy() {
    sidebarSessions = null;
}

// ES Module export
export const SessionListController = {
    init,
    renderSessionList,
    renderEmptyState,
    renderSessions,
    formatRelativeDate,
    isValidSessionId,
    getContainer,
    hasSessions,
    getSessionElements,
    getSessionElement,
    removeSessionElement,
    updateActiveState,
    destroy
};

console.log('[SessionListController] Session list controller loaded');
