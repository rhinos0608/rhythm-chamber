/**
 * Chat Sessions Store Module
 *
 * Handles CRUD operations for chat sessions.
 * Sessions include user conversations with the AI assistant.
 *
 * @module storage/stores/sessions
 */

import { IndexedDBCore } from '../indexeddb.js';
import { queuedOperation } from '../operations/queue.js';
import { STORES } from './registry.js';

/**
 * Save a chat session
 * @param {Object} session - Session object (must have id)
 * @returns {Promise<IDBValidKey>} Storage key
 * @throws {Error} If session has no id
 */
export async function saveSession(session) {
    return queuedOperation(async () => {
        if (!session.id) throw new Error('Session must have an id');

        const now = new Date().toISOString();
        const data = {
            ...session,
            updatedAt: now,
            createdAt: session.createdAt || now,
            messageCount: session.messages?.length || 0
        };
        const result = await IndexedDBCore.put(STORES.CHAT_SESSIONS, data);
        return result;
    });
}

/**
 * Get a session by ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} Session object or null
 */
export async function getSession(sessionId) {
    return IndexedDBCore.get(STORES.CHAT_SESSIONS, sessionId);
}

/**
 * Get all sessions ordered by updatedAt (most recent first)
 * @returns {Promise<Array>} Array of sessions
 */
export async function getAllSessions() {
    return IndexedDBCore.getAllByIndex(STORES.CHAT_SESSIONS, 'updatedAt', 'prev');
}

/**
 * Delete a session by ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<void>}
 */
export async function deleteSession(sessionId) {
    await IndexedDBCore.delete(STORES.CHAT_SESSIONS, sessionId);
}

/**
 * Get session count
 * @returns {Promise<number>} Number of sessions
 */
export async function getSessionCount() {
    return IndexedDBCore.count(STORES.CHAT_SESSIONS);
}

/**
 * Clear all sessions
 * @returns {Promise<void>}
 */
export async function clearAllSessions() {
    await IndexedDBCore.clear(STORES.CHAT_SESSIONS);
}

/**
 * Clear sessions older than maxAgeMs
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 30 days)
 * @returns {Promise<{deleted: number}>} Number of sessions deleted
 */
export async function clearExpiredSessions(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
    const sessions = await getAllSessions();
    if (!sessions || sessions.length === 0) return { deleted: 0 };

    const cutoffDate = new Date(Date.now() - maxAgeMs);
    let deletedCount = 0;

    for (const session of sessions) {
        if (new Date(session.updatedAt) < cutoffDate) {
            await deleteSession(session.id);
            deletedCount++;
        }
    }

    return { deleted: deletedCount };
}

/**
 * Get sessions created within date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of sessions in range
 */
export async function getSessionsByDateRange(startDate, endDate) {
    const sessions = await getAllSessions();
    return sessions.filter(session => {
        const sessionDate = new Date(session.createdAt);
        return sessionDate >= startDate && sessionDate <= endDate;
    });
}

/**
 * Search sessions by title/message content
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of matching sessions
 */
export async function searchSessions(query) {
    const sessions = await getAllSessions();
    const lowerQuery = query.toLowerCase();

    return sessions.filter(session => {
        // Search in title
        if (session.title && session.title.toLowerCase().includes(lowerQuery)) {
            return true;
        }
        // Search in messages
        if (session.messages) {
            return session.messages.some(msg =>
                msg.content && msg.content.toLowerCase().includes(lowerQuery)
            );
        }
        return false;
    });
}
