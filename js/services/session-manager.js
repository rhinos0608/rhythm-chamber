/**
 * Session Manager - Facade
 *
 * This is a FACADE that re-exports all session management functionality
 * from focused modules. Maintains backward compatibility with existing imports.
 *
 * Module structure:
 * - session-state: Session data management and persistence
 * - session-lifecycle: Session creation, activation, deletion
 *
 * @module services/session-manager
 * @example
 * import { SessionManager } from './services/session-manager.js';
 * await SessionManager.initialize();
 * const session = await SessionManager.createSession('My Chat', 'default');
 */

// Import internal coordinator
import * as Internal from './session-manager/index.js';
import { EventBus } from './event-bus.js';
import { SESSION_EVENT_SCHEMAS } from './session-manager/session-lifecycle.js';

// ==========================================
// SessionManager Class (Backward Compatible)
// ==========================================

/**
 * SessionManager class
 * Handles chat session lifecycle: creation, loading, saving, deletion, and switching
 */
export class SessionManager {
    /**
     * Static property to track if event listeners have been registered
     * This is used to prevent duplicate registration
     * @public
     * @static
     * @type {boolean}
     */
    static eventListenersRegistered = false;

    /**
     * Initialize the session manager
     * @public
     * @returns {Promise<void>}
     */
    static async initialize() {
        // Register event schemas for decentralized event management
        EventBus.registerSchemas(SESSION_EVENT_SCHEMAS);

        const manager = Internal.getSessionManager();
        await manager.initialize();
        await this.recoverEmergencyBackup();
        this.registerEventListeners();
    }

    /**
     * Register browser event listeners for auto-save behavior
     * @public
     * @static
     */
    static registerEventListeners() {
        if (this.eventListenersRegistered) {
            console.warn('[SessionManager] Event listeners already registered');
            return;
        }
        if (typeof window === 'undefined') {
            return; // Not in browser environment
        }
        // Async save when tab goes hidden
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.flushPendingSaveAsync();
            }
        });
        // Sync backup when tab is closing
        window.addEventListener('beforeunload', () => {
            this.emergencyBackupSync();
        });
        // Mobile Safari compatibility
        window.addEventListener('pagehide', () => {
            this.emergencyBackupSync();
        });
        this.eventListenersRegistered = true;
        console.log('[SessionManager] Event listeners registered');
    }

    /**
     * Initialize the session manager (backward compatible alias)
     * @public
     * @returns {Promise<void>}
     */
    static async init() {
        return this.initialize();
    }

    /**
     * Set user context/personality (backward compatible)
     * NOTE: This method is deprecated and does nothing in the refactored version
     * @public
     * @param {Object} personality - Personality context
     */
    static setUserContext(personality) {
        // Deprecated method - personality is now handled differently
        console.warn('[SessionManager] setUserContext() is deprecated and has no effect');
    }

    /**
     * Create a new session
     * @public
     * @param {string} title - Session title
     * @param {string} personality - Personality type
     * @returns {Promise<Object>} Created session
     */
    static async createSession(title, personality) {
        const manager = Internal.getSessionManager();
        return await manager.createSession(title, personality);
    }

    /**
     * Create a new session (backward compatibility alias)
     * @public
     * @param {Array} initialMessages - Optional initial messages
     * @returns {Promise<string>} Session ID
     */
    static async createNewSession(initialMessages) {
        const manager = Internal.getSessionManager();

        // Create the session lifecycle with initial messages
        const sessionId = await Internal.createSession(initialMessages || []);

        // Create session object with metadata
        const session = {
            id: sessionId,
            title: 'New Chat',
            personality: 'default',
            createdAt: new Date().toISOString(),
            messages: initialMessages || [],
            metadata: {
                personality: 'default'
            }
        };

        // Update session data with full session object
        Internal.setSessionData(session);

        return session.id;
    }

    /**
     * Load a session by ID
     * @public
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Loaded session
     */
    static async loadSession(sessionId) {
        return await Internal.loadSession(sessionId);
    }

    /**
     * Activate a session
     * @public
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Activated session
     */
    static async activateSession(sessionId) {
        const manager = Internal.getSessionManager();
        return await manager.activateSession(sessionId);
    }

    /**
     * Switch to a different session
     * @public
     * @param {string} sessionId - Session ID to switch to
     * @returns {Promise<boolean>} Success status
     */
    static async switchSession(sessionId) {
        return await Internal.switchSession(sessionId);
    }

    /**
     * Get current session
     * @public
     * @returns {Object|null} Current session
     */
    static getCurrentSession() {
        const manager = Internal.getSessionManager();
        return manager.getCurrentSession();
    }

    /**
     * Get all sessions
     * @public
     * @returns {Promise<Array>} All sessions
     */
    static async getAllSessions() {
        return await Internal.getAllSessions();
    }

    /**
     * Delete a session
     * @public
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>} Success status
     */
    static async deleteSession(sessionId) {
        return await Internal.deleteSession(sessionId);
    }

    /**
     * Clear all sessions
     * @public
     * @returns {Promise<boolean>} Success status
     */
    static async clearAllSessions() {
        return await Internal.clearAllSessions();
    }

    /**
     * Rename a session
     * @public
     * @param {string} sessionId - Session ID
     * @param {string} newTitle - New title
     * @returns {Promise<boolean>} Success status
     */
    static async renameSession(sessionId, newTitle) {
        return await Internal.renameSession(sessionId, newTitle);
    }

    /**
     * Switch to a different session
     * @public
     * @param {string} sessionId - Session ID to switch to
     * @returns {Promise<boolean>} Success status
     */
    static async switchSession(sessionId) {
        return await Internal.switchSession(sessionId);
    }

    /**
     * Save current session
     * @public
     * @returns {Promise<boolean>} Success status
     */
    static async saveCurrentSession() {
        const manager = Internal.getSessionManager();
        return await manager.saveCurrentSession();
    }

    /**
     * Save the current conversation with debounce delay
     * @public
     * @param {number} delayMs - Delay in milliseconds before saving (default: 2000)
     */
    static saveConversation(delayMs = 2000) {
        const manager = Internal.getSessionManager();
        manager.saveConversation(delayMs);
    }

    /**
     * Flush any pending save operations
     * @public
     * @returns {Promise<void>}
     */
    static async flushPendingSaveAsync() {
        const manager = Internal.getSessionManager();
        await manager.flushPendingSaveAsync();
    }

    /**
     * Perform an emergency synchronous backup
     * @public
     */
    static emergencyBackupSync() {
        const manager = Internal.getSessionManager();
        manager.emergencyBackupSync();
    }

    /**
     * Get current session ID
     * @public
     * @returns {string} Current session ID
     */
    static getCurrentSessionId() {
        return Internal.getCurrentSessionId();
    }

    /**
     * Get message history
     * @public
     * @returns {Array} Message history
     */
    static getHistory() {
        const manager = Internal.getSessionManager();
        return manager.getHistory();
    }

    /**
     * Add a single message to history
     * @public
     * @param {Object} message - Message to add
     * @returns {Promise<void>}
     */
    static async addMessageToHistory(message) {
        const manager = Internal.getSessionManager();
        return await manager.addMessageToHistory(message);
    }

    /**
     * Add multiple messages to history atomically
     * @public
     * @param {Array} messages - Messages to add
     * @returns {Promise<void>}
     */
    static async addMessagesToHistory(messages) {
        const manager = Internal.getSessionManager();
        return await manager.addMessagesToHistory(messages);
    }

    /**
     * Remove message from history by index
     * @public
     * @param {number} index - Message index
     * @returns {Promise<boolean>} Success status
     */
    static async removeMessageFromHistory(index) {
        const manager = Internal.getSessionManager();
        return await manager.removeMessageFromHistory(index);
    }

    /**
     * Truncate history to specified length
     * @public
     * @param {number} length - Target length
     * @returns {Promise<void>}
     */
    static async truncateHistory(length) {
        const manager = Internal.getSessionManager();
        return await manager.truncateHistory(length);
    }

    /**
     * Replace entire history
     * @public
     * @param {Array} messages - New messages
     * @returns {Promise<boolean>} Success status
     */
    static async replaceHistory(messages) {
        return await Internal.replaceHistory(messages);
    }

    /**
     * Update session data with function
     * @public
     * @param {Function} updaterFn - Update function
     * @returns {Promise<boolean>} Success status
     */
    static async updateSessionData(updaterFn) {
        return await Internal.updateSessionData(updaterFn);
    }

    /**
     * Clear conversation and create new session
     * @public
     * @returns {Promise<void>}
     */
    static async clearConversation() {
        const manager = Internal.getSessionManager();
        return await manager.clearConversation();
    }

    /**
     * Delete session by ID (alias for deleteSession)
     * @public
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>} Success status
     */
    static async deleteSessionById(sessionId) {
        return await Internal.deleteSession(sessionId);
    }

    /**
     * List all sessions (alias for getAllSessions)
     * @public
     * @returns {Promise<Array>} All sessions
     */
    static async listSessions() {
        return await Internal.getAllSessions();
    }

    /**
     * Generate a UUID v4 for session IDs
     * @public
     * @returns {string} A randomly generated UUID
     */
    static generateUUID() {
        return Internal.generateUUID();
    }

    /**
     * Validate session structure
     * @public
     * @param {Object} session - Session object to validate
     * @returns {boolean} True if session has valid structure
     */
    static validateSession(session) {
        return Internal.validateSession(session);
    }
}

// ==========================================
// Convenience Functions (Module-level API)
// ==========================================

/**
 * Get all sessions
 * @param {void}
 * @returns {Promise<Array>} All sessions
 */
export async function getAllSessions() {
    return await Internal.getAllSessions();
}

/**
 * Get session by ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Session data
 */
export async function getSession(sessionId) {
    return await Internal.getSession(sessionId);
}

/**
 * Delete session
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteSession(sessionId) {
    return await Internal.deleteSession(sessionId);
}

/**
 * Rename session
 * @param {string} sessionId - Session ID
 * @param {string} newTitle - New title
 * @returns {Promise<boolean>} Success status
 */
export async function renameSession(sessionId, newTitle) {
    return await Internal.renameSession(sessionId, newTitle);
}

// ==========================================
// Export all from internal index
// ==========================================

export * from './session-manager/index.js';

// Re-export session event schemas for external use
export { SESSION_EVENT_SCHEMAS };
