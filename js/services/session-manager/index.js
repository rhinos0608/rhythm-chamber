/**
 * Session Manager - Internal Index
 *
 * Internal coordinator that imports all sub-modules and provides
 * a unified interface for the facade to use.
 *
 * This file is for internal use only. External consumers should
 * import from the facade (session-manager.js).
 *
 * @module services/session-manager/index
 */

// Import all sub-modules
import * as SessionState from './session-state.js';
import * as SessionLifecycle from './session-lifecycle.js';
import * as SessionPersistence from './session-persistence.js';
import { Storage } from '../../storage.js';

// Re-export all module exports for internal use
export * from './session-state.js';
export * from './session-lifecycle.js';
export * from './session-persistence.js';

// Re-export modules as named exports for convenience
export { SessionState, SessionLifecycle, SessionPersistence };

// ==========================================
// State Management
// ==========================================

let managerInstance = null;

/**
 * Get or create the singleton session manager instance
 * @returns {Object} Manager instance
 */
export function getSessionManager() {
    if (!managerInstance) {
        managerInstance = createManager();
    }
    return managerInstance;
}

/**
 * Create a new session manager instance
 * @returns {Object} New manager instance
 */
export function createManager() {
    const instance = {
        // State management
        state: SessionState,

        // Lifecycle management
        lifecycle: SessionLifecycle,

        // Persistence management
        persistence: SessionPersistence,

        // Current session
        currentSession: null,

        // Initialize
        async initialize() {
            // Initialize state (SessionState doesn't have initialize, so just set up)
            // The state module is already initialized on import
        },

        // Create new session
        async createSession(title, personality) {
            // Note: title and personality are currently not used by lifecycle.createSession
            // The lifecycle layer expects initialMessages array
            const sessionId = await this.lifecycle.createSession([]);
            // Update manager's currentSession reference
            this.currentSession = SessionState.getSessionData();
            return this.currentSession;
        },

        // Activate session
        async activateSession(sessionId) {
            const session = await this.lifecycle.activateSession(sessionId);
            // Update manager's currentSession reference
            this.currentSession = SessionState.getSessionData();
            return this.currentSession;
        },

        // Get current session
        getCurrentSession() {
            return this.currentSession;
        },

        // Cleanup
        cleanup() {
            this.currentSession = null;
            managerInstance = null;
        },

        // ==========================================
        // Persistence Methods
        // ==========================================

        async saveCurrentSession() {
            return await SessionPersistence.saveCurrentSession();
        },

        saveConversation(delayMs) {
            SessionPersistence.saveConversation(delayMs);
        },

        async flushPendingSaveAsync() {
            return await SessionPersistence.flushPendingSaveAsync();
        },

        emergencyBackupSync() {
            SessionPersistence.emergencyBackupSync();
        },

        async recoverEmergencyBackup() {
            return await SessionPersistence.recoverEmergencyBackup();
        },

        // ==========================================
        // Message History Management Methods
        // ==========================================

        /**
         * Get conversation history
         * @returns {Array} Copy of message history
         */
        getHistory() {
            return SessionState.getHistory();
        },

        /**
         * Add a single message to history
         * @param {Object} message - Message to add
         * @returns {Promise<void>}
         */
        async addMessageToHistory(message) {
            return await SessionState.addMessageToHistory(message);
        },

        /**
         * Add multiple messages to history atomically
         * @param {Array} messages - Messages to add
         * @returns {Promise<void>}
         */
        async addMessagesToHistory(messages) {
            return await SessionState.addMessagesToHistory(messages);
        },

        /**
         * Truncate history to length
         * @param {number} length - Target length
         * @returns {Promise<void>}
         */
        async truncateHistory(length) {
            return await SessionState.truncateHistory(length);
        },

        /**
         * Remove message from history at index
         * @param {number} index - Index to remove
         * @returns {Promise<boolean>} Success status
         */
        async removeMessageFromHistory(index) {
            return await SessionState.removeMessageFromHistory(index);
        },

        /**
         * Clear conversation and create new session
         * @returns {Promise<void>}
         */
        async clearConversation() {
            return await SessionLifecycle.clearAllSessions();
        }
    };

    return instance;
}

/**
 * Reset the manager (mainly for testing)
 */
export function resetManager() {
    if (managerInstance) {
        managerInstance.cleanup();
        managerInstance = null;
    }
}

// ==========================================
// Convenience Functions
// ==========================================

/**
 * Get all sessions
 * @returns {Promise<Array>} All sessions
 */
export async function getAllSessions() {
    if (!Storage.getAllSessions) {
        return [];
    }
    try {
        return await Storage.getAllSessions();
    } catch (e) {
        console.error('[SessionManager] Failed to get all sessions:', e);
        return [];
    }
}

/**
 * Clear all sessions
 * @returns {Promise<boolean>} Success status
 */
export async function clearAllSessions() {
    const manager = getSessionManager();
    // Delete all sessions and clear current
    try {
        const sessions = await Storage.getAllSessions();
        for (const session of sessions) {
            await SessionLifecycle.deleteSession(session.id);
        }
    } catch (e) {
        console.error('[SessionManager] Failed to delete sessions:', e);
    }
    manager.currentSession = null;

    // Create a new session and update manager reference
    const sessionId = await SessionLifecycle.createSession([]);
    manager.currentSession = SessionState.getSessionData();
    return true;
}

/**
 * Switch to a different session
 * @param {string} sessionId - Session ID to switch to
 * @returns {Promise<boolean>} Success status
 */
export async function switchSession(sessionId) {
    const result = await SessionLifecycle.switchSession(sessionId);
    // Update manager's currentSession reference after successful switch
    if (result) {
        const manager = getSessionManager();
        manager.currentSession = SessionState.getSessionData();
    }
    return result;
}

/**
 * Get session by ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Session data
 */
export async function getSession(sessionId) {
    if (!Storage.getSession) {
        return null;
    }
    return await Storage.getSession(sessionId);
}

/**
 * Delete session
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteSession(sessionId) {
    return await SessionLifecycle.deleteSession(sessionId);
}

/**
 * Rename session
 * @param {string} sessionId - Session ID
 * @param {string} newTitle - New title
 * @returns {Promise<boolean>} Success status
 */
export async function renameSession(sessionId, newTitle) {
    return await SessionLifecycle.renameSession(sessionId, newTitle);
}
