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
 * - Session state transitions via injected state interface
 * - Session cleanup and recovery
 * - Event emission for lifecycle changes
 *
 * Architecture Note:
 * This module does NOT directly import session-state.js to avoid circular dependencies.
 * Instead, it uses an injected state accessor interface passed through initialize().
 * This follows the Facade pattern where state operations go through the index.js coordinator.
 *
 * @module services/session-manager/session-lifecycle
 */

'use strict';

import { Storage } from '../../storage.js';
import { STORAGE_KEYS } from '../../storage/keys.js';
import lockManager from '../session-lock-manager.js';
import { AppState } from '../../state/app-state.js';
import * as SessionPersistence from './session-persistence.js';

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
// State Accessor Interface (Dependency Injection)
// ==========================================

/**
 * State accessor interface to avoid circular dependency with session-state.js
 * This is injected via initialize() to maintain facade pattern compliance.
 * @type {Object|null}
 */
let stateAccessor = null;

/**
 * Event emitter interface for cross-module communication (HNW compliance)
 * This is injected via initialize() to avoid direct EventBus import.
 * @type {Object|null}
 */
let eventEmitter = null;

/**
 * Initialize the lifecycle module with state accessor and event emitter interfaces
 * This follows dependency injection pattern to avoid circular imports and
 * complies with HNW architecture by using injected event emitter instead of direct EventBus import.
 * @param {Object} accessor - State accessor object with get/set/update methods
 * @param {Object} emitter - Event emitter interface with emit() method
 */
export function initialize(accessor, emitter = null) {
    stateAccessor = accessor;
    eventEmitter = emitter;
}

/**
 * Reset the state accessor and event emitter (mainly for testing)
 */
export function reset() {
    stateAccessor = null;
    eventEmitter = null;
    hasWarnedAboutMessageLimit = false;
    previousSessionId = null;
}

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
 * Notify session update via injected event emitter (HNW compliance)
 * Uses state accessor to get current session ID without circular dependency.
 * Uses injected event emitter to avoid direct EventBus dependency.
 * @param {string} [eventType='session:updated'] - Event type for EventBus
 * @param {Object} [eventPayload={}] - Additional event payload
 * @returns {void}
 */
function notifySessionUpdate(eventType = 'session:updated', eventPayload = {}) {
    // HNW Compliance: Use injected event emitter instead of direct EventBus import
    if (!eventEmitter || typeof eventEmitter.emit !== 'function') {
        console.warn('[SessionLifecycle] Event emitter not available, skipping event:', eventType);
        return;
    }

    // Use state accessor to get current session ID (no circular import)
    // Only add sessionId if not already in eventPayload (for events like session:switched)
    if (!eventPayload.sessionId) {
        const currentSessionId = stateAccessor?.getCurrentSessionId?.() ?? null;
        eventPayload = { sessionId: currentSessionId, ...eventPayload };
    }
    // Emit via injected event emitter - follows HNW architecture
    eventEmitter.emit(eventType, eventPayload);
}

/**
 * Cleanup resources for a specific session
 * Called when switching away from a session to prevent memory leaks
 * @param {string} sessionId - Session ID to cleanup
 * @returns {void}
 */
function cleanupSessionResources(sessionId) {
    // Cancel any pending operations for this session
    // Event listeners are handled by EventBus which doesn't require manual cleanup
    // State references are cleaned up when switching to new session
    if (previousSessionId === sessionId) {
        previousSessionId = null;
    }
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
 * Schedule a debounced save of the current session
 * This prevents excessive saves during rapid message additions
 * @param {number} delayMs - Delay in milliseconds before saving (default: 2000)
 */
export function saveConversation(delayMs = 2000) {
    // Cancel any pending save
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
    }

    // Debounce the save
    autoSaveTimeoutId = setTimeout(async () => {
        await saveCurrentSession();
        autoSaveTimeoutId = null;
    }, delayMs);
}

/**
 * Save current session to IndexedDB immediately
 * EDGE CASE FIX: Preserves system prompts during truncation
 * HIGH PRIORITY FIX: Returns boolean indicating success for caller error handling
 * @returns {Promise<boolean>} True if save succeeded, false otherwise
 */
export async function saveCurrentSession() {
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
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast(
                `You have ${messageCount} messages in this chat. Only the most recent ${MAX_SAVED_MESSAGES} messages will be saved permanently.`,
                6000
            );
        }
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

        const session = {
            id: currentSessionId,
            title: generateSessionTitle(messages),
            createdAt: currentSessionCreatedAt,
            messages: messagesToSave,
            metadata: {
                personalityName: window._userContext?.personality?.name || 'Unknown',
                personalityEmoji: window._userContext?.personality?.emoji || '🎵',
                isLiteMode: false
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
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast('Warning: Failed to save conversation. Data may be lost on refresh.', 5000);
        }
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
    await SessionPersistence.flushPendingSaveAsync();

    // Reset message limit warning flag for new session (DATA LOSS WARNING)
    hasWarnedAboutMessageLimit = false;

    const currentSessionId = generateUUID();
    const currentSessionCreatedAt = new Date().toISOString();

    // Update session state via state accessor (no circular import)
    if (stateAccessor) {
        stateAccessor.setCurrentSessionId?.(currentSessionId);
        stateAccessor.setCurrentSessionCreatedAt?.(currentSessionCreatedAt);
        stateAccessor.syncSessionIdToAppState?.(currentSessionId);
        stateAccessor.setSessionData?.({
            id: currentSessionId,
            messages: initialMessages
        });
    }

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

    // CRITICAL FIX: Always persist session to storage before emitting event
    // This ensures renderSessionList() sees the new session via Storage.getAllSessions()
    // Previously, empty sessions were not saved, causing them to be missing from sidebar
    await SessionPersistence.saveCurrentSession();

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
export async function loadSession(sessionId) {
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

        // Update module-level state via state accessor (no circular import)
        if (stateAccessor) {
            stateAccessor.setCurrentSessionId?.(session.id);
            stateAccessor.setCurrentSessionCreatedAt?.(session.createdAt);
            stateAccessor.syncSessionIdToAppState?.(session.id);

            // HIGH PRIORITY FIX: Use updateSessionData mutex to prevent race conditions
            await stateAccessor.updateSessionData?.(() => ({
                id: session.id,
                messages: session.messages || []
            }));
        }

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
    const currentSessionId = stateAccessor?.getCurrentSessionId?.() ?? null;

    // NOTE ON CROSS-TAB RACE CONDITIONS:
    // The acquireProcessingLock() below is per-tab (in-memory). It protects against
    // concurrent operations within the same tab but NOT against other tabs.
    // Cross-tab coordination relies on:
    // 1. TabCoordinator for leader election (who can write)
    // 2. IndexedDB transaction atomicity for data consistency
    // 3. Emergency backup to localStorage for crash recovery
    // If two tabs switch sessions simultaneously, the last write to IndexedDB wins.

    // Acquire the lock (not just check it)
    // Hold lock through the save operation to prevent intra-tab race conditions
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
        // FIX: Also trigger emergency backup for cross-tab crash protection
        if (currentSessionId) {
            // Use SessionPersistence to flush and save
            await SessionPersistence.flushPendingSaveAsync();
            await SessionPersistence.saveCurrentSession();
            // Emergency backup for crash protection (sync, won't block)
            if (SessionPersistence.emergencyBackupSync) {
                SessionPersistence.emergencyBackupSync();
            }
        }

        // Track the previous session ID before switching
        previousSessionId = currentSessionId;

        const session = await loadSession(sessionId);
        if (session) {
            notifySessionUpdate('session:switched', { fromSessionId: previousSessionId, toSessionId: sessionId });
            // Cleanup resources for previous session AFTER event is emitted to prevent memory leaks
            if (previousSessionId) {
                cleanupSessionResources(previousSessionId);
            }
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
        const currentSessionId = stateAccessor?.getCurrentSessionId?.() ?? null;
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
    const currentSessionId = stateAccessor?.getCurrentSessionId?.() ?? null;
    if (currentSessionId) {
        // Use SessionPersistence to flush and save
        await SessionPersistence.flushPendingSaveAsync();
        await SessionPersistence.saveCurrentSession();
    }

    // Clear module-local state via state accessor
    if (stateAccessor) {
        stateAccessor.setSessionData?.({ id: null, messages: [] });
    }

    await createSession();
}

console.log('[SessionLifecycle] Module loaded');
