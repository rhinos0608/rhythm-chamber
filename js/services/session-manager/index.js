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
import { ErrorBoundary } from '../error-boundary.js';

// ==========================================
// Initialize Lifecycle Module with State Accessor
// ==========================================

// Initialize session-lifecycle with state accessor to avoid circular dependency
// This follows the Facade pattern where lifecycle uses state through injected interface
SessionLifecycle.initialize({
    getCurrentSessionId: SessionState.getCurrentSessionId,
    setCurrentSessionId: SessionState.setCurrentSessionId,
    getCurrentSessionCreatedAt: SessionState.getCurrentSessionCreatedAt,
    setCurrentSessionCreatedAt: SessionState.setCurrentSessionCreatedAt,
    syncSessionIdToAppState: SessionState.syncSessionIdToAppState,
    getSessionData: SessionState.getSessionData,
    setSessionData: SessionState.setSessionData,
    updateSessionData: SessionState.updateSessionData,
    getHistory: SessionState.getHistory
});

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

        // Load session
        async loadSession(sessionId) {
            return await this.lifecycle.loadSession(sessionId);
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
            return await ErrorBoundary.wrap(
                async () => SessionPersistence.saveCurrentSession(),
                {
                    context: 'sessionSave',
                    fallback: false,
                    rethrow: false,
                    onError: (error) => {
                        console.error('[SessionManager] Failed to save current session:', error);
                    }
                }
            );
        },

        saveConversation(delayMs) {
            // Sync operation - use wrapSync
            ErrorBoundary.wrapSync(
                () => SessionPersistence.saveConversation(delayMs),
                {
                    context: 'sessionSaveConversation',
                    fallback: null,
                    rethrow: false,
                    onError: (error) => {
                        console.error('[SessionManager] Failed to save conversation:', error);
                    }
                }
            );
        },

        async flushPendingSaveAsync() {
            return await ErrorBoundary.wrap(
                async () => SessionPersistence.flushPendingSaveAsync(),
                {
                    context: 'sessionFlushPending',
                    fallback: false,
                    rethrow: false,
                    onError: (error) => {
                        console.error('[SessionManager] Failed to flush pending save:', error);
                    }
                }
            );
        },

        emergencyBackupSync() {
            // Sync operation - use wrapSync, best-effort only
            ErrorBoundary.wrapSync(
                () => SessionPersistence.emergencyBackupSync(),
                {
                    context: 'sessionEmergencyBackup',
                    fallback: null,
                    rethrow: false,
                    onError: (error) => {
                        console.warn('[SessionManager] Emergency backup failed:', error);
                    }
                }
            );
        },

        async recoverEmergencyBackup() {
            return await ErrorBoundary.wrap(
                async () => SessionPersistence.recoverEmergencyBackup(),
                {
                    context: 'sessionRecoverBackup',
                    fallback: null,
                    rethrow: false,
                    onError: (error) => {
                        console.error('[SessionManager] Failed to recover emergency backup:', error);
                    }
                }
            );
        },

        // ==========================================
        // Message History Management Methods
        // ==========================================

        /**
         * Get conversation history
         * @returns {Array} Copy of message history
         */
        getHistory() {
            // Safe sync operation - return empty array on error
            return ErrorBoundary.wrapSync(
                () => SessionState.getHistory(),
                {
                    context: 'sessionGetHistory',
                    fallback: [],
                    rethrow: false,
                    onError: (error) => {
                        console.error('[SessionManager] Failed to get history:', error);
                    }
                }
            );
        },

        /**
         * Add a single message to history
         * @param {Object} message - Message to add
         * @returns {Promise<void>}
         */
        async addMessageToHistory(message) {
            return await ErrorBoundary.wrap(
                async () => SessionState.addMessageToHistory(message),
                {
                    context: 'sessionAddMessage',
                    fallback: false,
                    rethrow: true,
                    onError: (error) => {
                        console.error('[SessionManager] Failed to add message to history:', error);
                    }
                }
            );
        },

        /**
         * Add multiple messages to history atomically
         * @param {Array} messages - Messages to add
         * @returns {Promise<void>}
         */
        async addMessagesToHistory(messages) {
            return await ErrorBoundary.wrap(
                async () => SessionState.addMessagesToHistory(messages),
                {
                    context: 'sessionAddMessages',
                    fallback: false,
                    rethrow: true,
                    onError: (error) => {
                        console.error('[SessionManager] Failed to add messages to history:', error);
                    }
                }
            );
        },

        /**
         * Truncate history to length
         * @param {number} length - Target length
         * @returns {Promise<void>}
         */
        async truncateHistory(length) {
            return await ErrorBoundary.wrap(
                async () => SessionState.truncateHistory(length),
                {
                    context: 'sessionTruncate',
                    fallback: false,
                    rethrow: true,
                    onError: (error) => {
                        console.error('[SessionManager] Failed to truncate history:', error);
                    }
                }
            );
        },

        /**
         * Remove message from history at index
         * @param {number} index - Index to remove
         * @returns {Promise<boolean>} Success status
         */
        async removeMessageFromHistory(index) {
            return await ErrorBoundary.wrap(
                async () => SessionState.removeMessageFromHistory(index),
                {
                    context: 'sessionRemoveMessage',
                    fallback: false,
                    rethrow: true,
                    onError: (error) => {
                        console.error('[SessionManager] Failed to remove message from history:', error);
                    }
                }
            );
        },

        /**
         * Clear conversation and create new session
         * @returns {Promise<void>}
         */
        async clearConversation() {
            return await ErrorBoundary.wrap(
                async () => SessionLifecycle.clearAllSessions(),
                {
                    context: 'sessionClear',
                    fallback: false,
                    rethrow: true,
                    onError: (error) => {
                        console.error('[SessionManager] Failed to clear conversation:', error);
                    }
                }
            );
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
    if (!Storage || typeof Storage.getAllSessions !== 'function') {
        console.warn('[SessionManager] Storage not available');
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
 * Load session by ID (activates the session)
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Session data
 */
export async function loadSession(sessionId) {
    const manager = getSessionManager();
    return await manager.loadSession(sessionId);
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
