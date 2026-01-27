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

// ==========================================
// SessionManager Class (Backward Compatible)
// ==========================================

/**
 * SessionManager class
 * Handles chat session lifecycle: creation, loading, saving, deletion, and switching
 */
export class SessionManager {
    /**
     * Initialize the session manager
     * @public
     * @returns {Promise<void>}
     */
    static async initialize() {
        const manager = Internal.getSessionManager();
        await manager.initialize();
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
     * Load a session by ID
     * @public
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Loaded session
     */
    static async loadSession(sessionId) {
        return await Internal.getSession(sessionId);
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
     * Rename a session
     * @public
     * @param {string} sessionId - Session ID
     * @param {string} newTitle - New title
     * @returns {Promise<boolean>} Success status
     */
    static async renameSession(sessionId, newTitle) {
        return await Internal.renameSession(sessionId, newTitle);
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
