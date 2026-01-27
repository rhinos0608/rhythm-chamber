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

// Re-export all module exports for internal use
export * from './session-state.js';
export * from './session-lifecycle.js';

// Re-export modules as named exports for convenience
export { SessionState, SessionLifecycle };

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

        // Current session
        currentSession: null,

        // Initialize
        async initialize() {
            // Initialize state
            await this.state.initialize();
        },

        // Create new session
        async createSession(title, personality) {
            return await this.lifecycle.createSession(title, personality);
        },

        // Activate session
        async activateSession(sessionId) {
            return await this.lifecycle.activateSession(sessionId);
        },

        // Get current session
        getCurrentSession() {
            return this.currentSession;
        },

        // Cleanup
        cleanup() {
            this.currentSession = null;
            managerInstance = null;
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
    const manager = getSessionManager();
    return await SessionState.getAllSessions();
}

/**
 * Get session by ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Session data
 */
export async function getSession(sessionId) {
    return await SessionState.getSession(sessionId);
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
