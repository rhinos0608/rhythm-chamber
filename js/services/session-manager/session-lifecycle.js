/**
 * Session Lifecycle Module
 *
 * Manages session lifecycle operations including:
 * - Session creation, loading, and switching
 * - Session deletion and cleanup
 * - Session renaming
 * - Session state transitions
 *
 * Responsibilities:
 * - Session CRUD operations (Create, Read, Update, Delete)
 * - Session state management and transitions
 * - Session cleanup and recovery
 * - Event emission for lifecycle changes
 *
 * @module services/session-manager/session-lifecycle
 */

'use strict';

import { EventBus } from '../event-bus.js';
import { Storage } from '../../storage.js';
import { STORAGE_KEYS } from '../../storage/keys.js';
import * as SessionState from './session-state.js';
import lockManager from '../session-lock-manager.js';
import { AppState } from '../../state/app-state.js';

// ==========================================
// Event Schemas for EventBus Registration
// ==========================================

/**
 * Session event schemas for decentralized event management
 * These schemas are registered with EventBus to enable type-safe event handling
 * and provide documentation for available session events.
 */
export const SESSION_EVENT_SCHEMAS = {
    'session:created': {
        description: 'New session created',
        payload: { sessionId: 'string', title: 'string' }
    },
    'session:loaded': {
        description: 'Session loaded from storage',
        payload: { sessionId: 'string', messageCount: 'number' }
    },
    'session:switched': {
        description: 'Switched to different session',
        payload: { fromSessionId: 'string|null', toSessionId: 'string' }
    },
    'session:deleted': {
        description: 'Session deleted',
        payload: { sessionId: 'string' }
    },
    'session:updated': {
        description: 'Session data updated',
        payload: { sessionId: 'string', field: 'string' }
    }
};

// ==========================================
// Constants
// ==========================================

const SESSION_CURRENT_SESSION_KEY = STORAGE_KEYS.CURRENT_SESSION;
const MAX_SAVED_MESSAGES = 100;
const MESSAGE_LIMIT_WARNING_THRESHOLD = 90;
const BASE_RETRY_DELAY_MS = 100;

let hasWarnedAboutMessageLimit = false;
let previousSessionId = null;
let autoSaveTimeoutId = null;

// ==========================================
// UUID Utilities
// ==========================================

/**
 * Generate a UUID v4 for session IDs
 * @returns {string} A randomly generated UUID following version 4 format
 */
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Validate UUID v4 format
 * SECURITY FIX: Ensures sessionId parameter matches expected UUID format
 * before being used in storage operations or logging
 * @param {string} sessionId - Session ID to validate
 * @returns {boolean} True if valid UUID v4 format
 */
export function isValidUUID(sessionId) {
    // UUID v4 regex: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where x is any hex digit and y is 8, 9, a, or b
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidV4Regex.test(sessionId);
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Validate session structure
 * @param {Object} session - Session object to validate
 * @returns {boolean} True if session has valid structure
 */
export function validateSession(session) {
    return session
        && typeof session.id === 'string'
        && Array.isArray(session.messages)
        && typeof session.createdAt === 'string';
}

/**
 * Generate a title for the session based on first user message
 * Edge case safe: Uses Array.from to avoid splitting emoji surrogate pairs
 * EDGE CASE FIX: Handles null, undefined, empty string, and non-string content
 * @param {Array} messages - Array of message objects
 * @returns {string} Generated session title
 */
function generateSessionTitle(messages) {
    const firstUserMsg = messages.find(m => m.role === 'user');
    // EDGE CASE FIX: Add explicit check for non-empty string content
    if (firstUserMsg?.content && typeof firstUserMsg.content === 'string' && firstUserMsg.content.trim().length > 0) {
        // Edge case: Use Array.from to respect grapheme clusters and avoid splitting emoji
        const chars = Array.from(firstUserMsg.content.trim());
        const title = chars.slice(0, 50).join('');
        return chars.length > 50 ? title + '...' : title;
    }
    return 'New Chat';
}

/**
 * Notify session update via EventBus
 * @param {string} [eventType='session:updated'] - Event type for EventBus
 * @param {Object} [eventPayload={}] - Additional event payload
 * @returns {void}
 */
function notifySessionUpdate(eventType = 'session:updated', eventPayload = {}) {
    // Emit via centralized EventBus - no legacy listeners
    EventBus.emit(eventType, { sessionId: SessionState.getCurrentSessionId(), ...eventPayload });
}

/**
 * Acquire session processing lock to prevent session switches during message processing
 * This prevents race conditions where a session switch happens mid-message processing
 *
 * Delegates to SessionLockManager for lock management
 *
 * @param {string} expectedSessionId - The session ID expected to be active
 * @returns {Promise<{ locked: boolean, currentSessionId: string|null, release?: Function, error?: string }>} Lock result
 */
async function acquireProcessingLock(expectedSessionId) {
    return lockManager.acquireProcessingLock(expectedSessionId);
}

/**
 * Save current session to IndexedDB immediately
 * EDGE CASE FIX: Preserves system prompts during truncation
 * HIGH PRIORITY FIX: Returns boolean indicating success for caller error handling
 * @returns {Promise<boolean>} True if save succeeded, false otherwise
 */
async function saveCurrentSession() {
    const currentSessionId = SessionState.getCurrentSessionId();
    if (!currentSessionId || !Storage.saveSession) {
        return false;
    }

    // Get messages from module-local memory (thread-safe access)
    const sessionData = SessionState.getSessionData();
    const messages = sessionData.messages || [];
    const messageCount = messages.length;
    const currentSessionCreatedAt = SessionState.getCurrentSessionCreatedAt();

    // Warn when approaching message limit (DATA LOSS WARNING)
    if (messageCount >= MESSAGE_LIMIT_WARNING_THRESHOLD && !hasWarnedAboutMessageLimit) {
        hasWarnedAboutMessageLimit = true;
        console.warn(`[SessionLifecycle] Approaching message limit: ${messageCount}/${MAX_SAVED_MESSAGES}`);
    }

    try {
        // EDGE CASE FIX: Preserve system prompts during truncation
        // System prompts are critical for LLM behavior - they should not be truncated
        const systemMessages = messages.filter(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');
        const messagesToSave = messageCount > MAX_SAVED_MESSAGES
            ? [...systemMessages, ...nonSystemMessages.slice(-(MAX_SAVED_MESSAGES - systemMessages.length))]
            : messages;

        // Get personality from AppState (ES module, not global)
        const personality = AppState.get('data.personality') || {};
        const isLiteMode = AppState.get('lite.isLiteMode') || false;

        const session = {
            id: currentSessionId,
            title: generateSessionTitle(messages),
            createdAt: currentSessionCreatedAt,
            messages: messagesToSave,
            metadata: {
                personalityName: personality.name || 'Unknown',
                personalityEmoji: personality.emoji || '🎵',
                isLiteMode
            }
        };

        // Log warning when messages are actually truncated (DATA LOSS WARNING)
        if (messageCount > MAX_SAVED_MESSAGES) {
            const truncatedCount = messageCount - messagesToSave.length;
            console.warn(`[SessionLifecycle] Truncated ${truncatedCount} old messages (kept ${systemMessages.length} system prompts + ${MAX_SAVED_MESSAGES - systemMessages.length} most recent)`);
        }

        await Storage.saveSession(session);
        console.log('[SessionLifecycle] Session saved:', currentSessionId);
        notifySessionUpdate('session:updated', { sessionId: currentSessionId, field: 'messages' });
        return true;
    } catch (e) {
        console.error('[SessionLifecycle] Failed to save session:', e);
        // HIGH PRIORITY FIX: Notify user of save failure - this is a data loss risk
        console.warn('[SessionLifecycle] Failed to save conversation. Data may be lost on refresh.');
        return false;
    }
}

// ==========================================
// Session Creation
// ==========================================

/**
 * Create a new session
 * @param {Array} initialMessages - Optional initial messages (for migration)
 * @returns {Promise<string>} New session ID
 */
export async function createSession(initialMessages = []) {
    // Flush any pending saves for previous session
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        await saveCurrentSession();
    }

    // Reset message limit warning flag for new session (DATA LOSS WARNING)
    hasWarnedAboutMessageLimit = false;

    const currentSessionId = generateUUID();
    const currentSessionCreatedAt = new Date().toISOString();

    // Update session state
    SessionState.setCurrentSessionId(currentSessionId);
    SessionState.setCurrentSessionCreatedAt(currentSessionCreatedAt);

    // Sync to AppState for centralized state management
    SessionState.syncSessionIdToAppState(currentSessionId);

    // Store session data in module-local memory (protected from external mutations)
    SessionState.setSessionData({
        id: currentSessionId,
        messages: initialMessages
    });

    // Save current session ID to unified storage and localStorage
    if (Storage.setConfig) {
        Storage.setConfig(SESSION_CURRENT_SESSION_KEY, currentSessionId).catch(e => {
            console.error('[SessionLifecycle] Failed to save session ID to unified storage:', e);
            // Log warning - toast notification removed (no global window.showToast)
            console.warn('[SessionLifecycle] Session may not be remembered on reload due to storage issues.');
        });
    }
    try {
        localStorage.setItem(SESSION_CURRENT_SESSION_KEY, currentSessionId);
    } catch (e) {
        console.error('[SessionLifecycle] Failed to set current session ID in localStorage:', e);
        // Log warning - toast notification removed (no global window.showToast)
        console.warn('[SessionLifecycle] Session may not be remembered on reload due to storage issues.');
    }

    // Save immediately if we have messages
    if (initialMessages.length > 0) {
        await saveCurrentSession();
    }

    console.log('[SessionLifecycle] Created new session:', currentSessionId);
    notifySessionUpdate('session:created', { sessionId: currentSessionId, title: 'New Chat' });
    return currentSessionId;
}

// ==========================================
// Session Loading
// ==========================================

/**
 * Load a session by ID (alias for activateSession)
 * HIGH PRIORITY FIX: Now uses mutex protection via updateSessionData to prevent race conditions
 * SECURITY FIX: Validates UUID format before using in storage operations
 * @param {string} sessionId - Session ID to load
 * @returns {Promise<Object|null>} Session object or null if not found/invalid
 */
export async function activateSession(sessionId) {
    return loadSession(sessionId);
}

/**
 * Load a session by ID
 * HIGH PRIORITY FIX: Now uses mutex protection via updateSessionData to prevent race conditions
 * SECURITY FIX: Validates UUID format before using in storage operations
 * @param {string} sessionId - Session ID to load
 * @returns {Promise<Object|null>} Session object or null if not found/invalid
 */
async function loadSession(sessionId) {
    if (!Storage.getSession) {
        console.warn('[SessionLifecycle] Storage not available');
        return null;
    }

    // SECURITY FIX: Validate UUID format before using in storage operations
    if (!sessionId || typeof sessionId !== 'string' || !isValidUUID(sessionId)) {
        console.warn('[SessionLifecycle] Invalid session ID format:', sessionId);
        return null;
    }

    try {
        const session = await Storage.getSession(sessionId);

        if (!session) {
            console.warn(`[SessionLifecycle] Session ${sessionId} not found`);
            return null;
        }

        // Validate session structure (HNW defensive)
        if (!validateSession(session)) {
            console.warn(`[SessionLifecycle] Session ${sessionId} is corrupted`);
            return null;
        }

        // Update module-level state
        SessionState.setCurrentSessionId(session.id);
        SessionState.setCurrentSessionCreatedAt(session.createdAt);

        // Sync to AppState for centralized state management
        SessionState.syncSessionIdToAppState(session.id);

        // HIGH PRIORITY FIX: Use updateSessionData mutex to prevent race conditions
        await SessionState.updateSessionData(() => ({
            id: session.id,
            messages: session.messages || []
        }));

        // Save current session ID to unified storage and localStorage
        if (Storage.setConfig) {
            Storage.setConfig(SESSION_CURRENT_SESSION_KEY, session.id).catch(e => {
                console.error('[SessionLifecycle] Failed to save session ID to unified storage:', e);
                console.warn('[SessionLifecycle] Session may not be remembered on reload due to storage issues.');
            });
        }
        try {
            localStorage.setItem(SESSION_CURRENT_SESSION_KEY, session.id);
        } catch (e) {
            console.error('[SessionLifecycle] Failed to set current session ID in localStorage:', e);
            console.warn('[SessionLifecycle] Session may not be remembered on reload due to storage issues.');
        }

        console.log('[SessionLifecycle] Loaded session:', sessionId, 'with', (session.messages || []).length, 'messages');
        notifySessionUpdate('session:loaded', { sessionId, messageCount: (session.messages || []).length });
        return session;

    } catch (e) {
        console.error('[SessionLifecycle] Failed to load session:', e);
        return null;
    }
}

// ==========================================
// Session Switching
// ==========================================

/**
 * Switch to a different session
 * SESSION LOCKING: Waits for any ongoing message processing to complete
 * @param {string} sessionId - Session ID to switch to
 * @returns {Promise<boolean>} Success status
 */
export async function switchSession(sessionId) {
    const currentSessionId = SessionState.getCurrentSessionId();

    // Acquire the lock (not just check it)
    // Hold lock through the save operation to prevent race conditions
    const MAX_SWITCH_RETRIES = 3;
    let attempt = 0;
    let lockResult;

    while (attempt < MAX_SWITCH_RETRIES) {
        attempt++;
        lockResult = await acquireProcessingLock(currentSessionId);
        if (lockResult.locked) break;

        console.warn('[SessionLifecycle] Failed to acquire lock for session switch:', lockResult.error);
        if (attempt >= MAX_SWITCH_RETRIES) {
            return false;
        }
        await new Promise(resolve => setTimeout(resolve, BASE_RETRY_DELAY_MS));
    }

    try {
        // CRITICAL FIX: Always save current session before switching
        // Previous conditional (only if autoSaveTimeoutId) created data loss window
        if (currentSessionId) {
            // Cancel any pending save and save immediately
            if (autoSaveTimeoutId) {
                clearTimeout(autoSaveTimeoutId);
                autoSaveTimeoutId = null;
            }
            await saveCurrentSession();
        }

        // Track the previous session ID before switching
        previousSessionId = currentSessionId;

        const session = await loadSession(sessionId);
        if (session) {
            notifySessionUpdate('session:switched', { fromSessionId: previousSessionId, toSessionId: sessionId });
            return true;
        }
        return false;
    } finally {
        // Release lock after save completes
        if (lockResult?.locked && lockResult.release) {
            lockResult.release();
        }
    }
}

// ==========================================
// Session Deletion
// ==========================================

/**
 * Delete a session by ID
 * SECURITY FIX: Validates UUID format before using in storage operations
 * @param {string} sessionId - Session ID to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteSession(sessionId) {
    if (!Storage.deleteSession) {
        return false;
    }

    // SECURITY FIX: Validate UUID format before using in storage operations
    if (!sessionId || typeof sessionId !== 'string' || !isValidUUID(sessionId)) {
        console.warn('[SessionLifecycle] Invalid session ID format:', sessionId);
        return false;
    }

    try {
        await Storage.deleteSession(sessionId);

        // If we deleted the current session, create a new one
        const currentSessionId = SessionState.getCurrentSessionId();
        if (sessionId === currentSessionId) {
            await createSession();
        }

        notifySessionUpdate('session:deleted', { sessionId });
        return true;
    } catch (e) {
        console.error('[SessionLifecycle] Failed to delete session:', e);
        return false;
    }
}

// ==========================================
// Session Renaming
// ==========================================

/**
 * Rename a session
 * SECURITY FIX: Validates UUID format before using in storage operations
 * @param {string} sessionId - Session ID to rename
 * @param {string} newTitle - New title
 * @returns {Promise<boolean>} Success status
 */
export async function renameSession(sessionId, newTitle) {
    if (!Storage.getSession || !Storage.saveSession) {
        return false;
    }

    // SECURITY FIX: Validate UUID format before using in storage operations
    if (!sessionId || typeof sessionId !== 'string' || !isValidUUID(sessionId)) {
        console.warn('[SessionLifecycle] Invalid session ID format:', sessionId);
        return false;
    }

    try {
        const session = await Storage.getSession(sessionId);
        if (session) {
            session.title = newTitle;
            await Storage.saveSession(session);
            notifySessionUpdate('session:updated', { sessionId, field: 'title' });
            return true;
        }
        return false;
    } catch (e) {
        console.error('[SessionLifecycle] Failed to rename session:', e);
        return false;
    }
}

// ==========================================
// Session Cleanup
// ==========================================

/**
 * Clear conversation history and create new session
 * CRITICAL FIX: Save pending changes before clearing to prevent data loss
 */
export async function clearAllSessions() {
    // CRITICAL FIX: Save current session before clearing to prevent data loss
    const currentSessionId = SessionState.getCurrentSessionId();
    if (currentSessionId) {
        // Cancel any pending save and save immediately
        if (autoSaveTimeoutId) {
            clearTimeout(autoSaveTimeoutId);
            autoSaveTimeoutId = null;
        }
        await saveCurrentSession();
    }

    // Clear module-local state
    SessionState.setSessionData({ id: null, messages: [] });

    await createSession();
}

console.log('[SessionLifecycle] Module loaded');
