/**
 * Session Manager Service
 *
 * Handles chat session lifecycle: creation, loading, saving, deletion, and switching.
 * Extracted from chat.js to separate session concerns from chat orchestration.
 *
 * @module services/session-manager
 */

'use strict';

import { EventBus } from './event-bus.js';
import { Storage } from '../storage.js';
import { DataVersion } from './data-version.js';
import { safeJsonParse } from '../utils/safe-json.js';
import { STORAGE_KEYS } from '../storage/keys.js';
import { AppState } from '../state/app-state.js';

// ==========================================
// Constants
// ==========================================

// Constants for legacy migration
const CONVERSATION_STORAGE_KEY = STORAGE_KEYS.CONVERSATION;  // Legacy key from chat.js
const SESSION_CURRENT_SESSION_KEY = STORAGE_KEYS.CURRENT_SESSION;
const SESSION_EMERGENCY_BACKUP_KEY = STORAGE_KEYS.EMERGENCY_BACKUP;  // Sync backup for beforeunload
const SESSION_EMERGENCY_BACKUP_MAX_AGE_MS = 3600000;  // 1 hour max age for emergency backups

// Message limit constants (DATA LOSS WARNING)
const MAX_SAVED_MESSAGES = 100;  // Maximum messages saved per session
const MESSAGE_LIMIT_WARNING_THRESHOLD = 90;  // Warn when approaching limit
let hasWarnedAboutMessageLimit = false;  // Track if user has been warned

// ==========================================
// State Management
// ==========================================

let currentSessionId = null;
let currentSessionCreatedAt = null;
let autoSaveTimeoutId = null;
let _eventListenersRegistered = false; // Track if event listeners are registered to prevent duplicates

// In-memory session data with async mutex for thread-safety
let _sessionData = { id: null, messages: [] };
let _sessionDataLock = Promise.resolve(); // Async mutex: promises chain sequentially

// Session lock for preventing session switches during message processing
let _processingSessionId = null;  // Session ID currently being processed
let _processingLock = Promise.resolve();  // Processing lock

/**
 * Acquire session processing lock to prevent session switches during message processing
 * This prevents race conditions where a session switch happens mid-message processing
 * @param {string} expectedSessionId - The session ID expected to be active
 * @returns {Promise<{ locked: boolean, currentSessionId: string|null, release?: Function }>} Lock result
 */
async function acquireProcessingLock(expectedSessionId) {
    const previousLock = _processingLock;
    let releaseLock;

    // Create new lock in the chain
    _processingLock = new Promise(resolve => {
        releaseLock = resolve;
    });

    // Wait for previous processing to complete
    await previousLock;

    // Check if session has switched
    if (_processingSessionId !== null && _processingSessionId !== expectedSessionId) {
        // Session changed during lock acquisition
        releaseLock();
        return {
            locked: false,
            currentSessionId: currentSessionId,
            error: 'Session switched during lock acquisition'
        };
    }

    // Acquire the lock
    _processingSessionId = expectedSessionId || currentSessionId;

    return {
        locked: true,
        currentSessionId: currentSessionId,
        release: () => {
            _processingSessionId = null;
            releaseLock();
        }
    };
}

/**
 * Validate session ID matches the current active session
 * Used to prevent processing messages for a different session
 * @param {string} sessionId - Session ID to validate
 * @returns {boolean} True if session ID matches current session
 */
function isCurrentSession(sessionId) {
    if (!sessionId || !currentSessionId) return false;
    return sessionId === currentSessionId;
}

/**
 * Deep clone a message object to prevent external mutations
 * HNW: Ensures message objects cannot be modified from outside the session manager
 * @param {Object} msg - Message object to clone
 * @returns {Object} Deep cloned message
 */
function deepCloneMessage(msg) {
    if (!msg) return msg;
    // Shallow copy is sufficient for message objects (no nested objects)
    // Messages have: role, content, timestamp, dataVersion, etc.
    return { ...msg };
}

/**
 * Deep clone messages array to prevent external mutations
 * @param {Array} messages - Messages array to clone
 * @returns {Array} Deep cloned messages array
 */
function deepCloneMessages(messages) {
    if (!messages) return [];
    return messages.map(deepCloneMessage);
}

/**
 * Get session data safely (returns a deep copy snapshot)
 * HNW: Returns frozen deep copy to prevent external mutations
 * @returns {Object} Deep copy of session data
 */
function getSessionData() {
    // Return a deep copy to prevent external mutations
    const snapshot = {
        id: _sessionData.id,
        messages: deepCloneMessages(_sessionData.messages)
    };
    // Freeze the snapshot to prevent any mutations
    return Object.freeze(snapshot);
}

/**
 * Set session data safely (no lock - use updateSessionData for concurrent updates)
 * Creates deep copies of all message objects to prevent external mutations
 * @param {Object} data - New session data
 */
function setSessionData(data) {
    _sessionData = {
        id: data.id || null,
        messages: deepCloneMessages(data.messages)
    };
}

/**
 * Sync session ID to AppState for centralized state management
 * This ensures components reading from AppState see consistent session state
 * @param {string|null} sessionId - Session ID to sync
 */
function syncSessionIdToAppState(sessionId) {
    if (AppState?.update && typeof AppState.update === 'function') {
        try {
            AppState.update('ui', { currentSessionId: sessionId });
        } catch (e) {
            console.warn('[SessionManager] Failed to sync session ID to AppState:', e);
        }
    }
}

/**
 * Update session data atomically with mutex protection.
 * This prevents lost update races when multiple async operations
 * try to modify session data concurrently within the same tab.
 * HNW: Uses deep cloning to prevent external mutations
 *
 * @param {Function} updaterFn - Function that receives current data and returns new data
 * @returns {Promise<void>}
 */
async function updateSessionData(updaterFn) {
    const previousLock = _sessionDataLock;
    let releaseLock;

    // Create new lock in the chain
    _sessionDataLock = new Promise(resolve => {
        releaseLock = resolve;
    });

    // Wait for previous updates to complete
    await previousLock;

    try {
        const currentData = getSessionData();
        const newData = updaterFn(currentData);
        _sessionData = {
            id: newData.id || null,
            messages: deepCloneMessages(newData.messages)
        };

        // Sync to window for legacy compatibility (read-only)
        if (typeof window !== 'undefined') {
            window._sessionData = getSessionData();
        }
    } finally {
        releaseLock(); // Release the lock for next operation
    }
}

// ==========================================
// Core Functions
// ==========================================

/**
 * Generate a UUID v4 for session IDs
 * @returns {string} A randomly generated UUID following version 4 format
 */
function generateUUID() {
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
function isValidUUID(sessionId) {
    // UUID v4 regex: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where x is any hex digit and y is 8, 9, a, or b
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidV4Regex.test(sessionId);
}

/**
 * Initialize session manager
 * Attempts to recover emergency backup and load current session
 *
 * @returns {Promise<string|null>} Current session ID or null if none exists
 */
async function init() {
    // Recover any emergency backup from previous session (tab closed mid-save)
    await recoverEmergencyBackup();

    // Try to load current session or create new one
    await loadOrCreateSession();

    return currentSessionId;
}

/**
 * Load existing session or create a new one
 * Uses unified Storage API with localStorage fallback
 * @returns {Promise<Object>} The loaded or newly created session object
 */
async function loadOrCreateSession() {
    // Try unified storage first for current session ID
    let savedSessionId = null;
    if (Storage.getConfig) {
        savedSessionId = await Storage.getConfig(SESSION_CURRENT_SESSION_KEY);
    }
    // Fallback to localStorage
    if (!savedSessionId) {
        try {
            savedSessionId = localStorage.getItem(SESSION_CURRENT_SESSION_KEY);
        } catch (e) {
            console.error('[SessionManager] Failed to get current session ID from localStorage:', e);
        }
    }

    if (savedSessionId) {
        const session = await loadSession(savedSessionId);
        if (session) {
            return session;
        }
    }

    // Migrate from legacy sessionStorage if exists
    try {
        const legacyData = sessionStorage.getItem(CONVERSATION_STORAGE_KEY);
        if (legacyData) {
            const history = safeJsonParse(legacyData, []);
            if (history.length > 0) {
                console.log('[SessionManager] Migrating legacy conversation to session storage');
                await createNewSession(history);
                sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
                return;
            }
        }
    } catch (e) {
        console.warn('[SessionManager] Legacy migration failed:', e);
    }

    // No saved session, create new
    await createNewSession();
}

/**
 * Create a new session
 * @param {Array} initialMessages - Optional initial messages (for migration)
 * @returns {Promise<string>} New session ID
 */
async function createNewSession(initialMessages = []) {
    // Flush any pending saves for previous session
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        await saveCurrentSession();
    }

    // Reset message limit warning flag for new session (DATA LOSS WARNING)
    hasWarnedAboutMessageLimit = false;

    currentSessionId = generateUUID();
    currentSessionCreatedAt = new Date().toISOString();

    // Sync to AppState for centralized state management
    syncSessionIdToAppState(currentSessionId);

    // Store session data in module-local memory (protected from external mutations)
    // Use deep cloning to prevent external mutations
    _sessionData = {
        id: currentSessionId,
        messages: deepCloneMessages(initialMessages)
    };
    // Sync to window for legacy compatibility (read-only)
    if (typeof window !== 'undefined') {
        window._sessionData = getSessionData();
    }

    // Save current session ID to unified storage and localStorage
    if (Storage.setConfig) {
        Storage.setConfig(SESSION_CURRENT_SESSION_KEY, currentSessionId).catch(e => {
            console.error('[SessionManager] Failed to save session ID to unified storage:', e);
            // Notify user if toast available - this is a critical data persistence issue
            if (typeof window !== 'undefined' && window.showToast) {
                window.showToast('Warning: Session may not be remembered on reload due to storage issues.', 4000);
            }
        });
    }
    try {
        localStorage.setItem(SESSION_CURRENT_SESSION_KEY, currentSessionId);
    } catch (e) {
        console.error('[SessionManager] Failed to set current session ID in localStorage:', e);
        // Notify user - this is a critical data persistence issue
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast('Warning: Session may not be remembered on reload due to storage issues.', 4000);
        }
    }

    // Save immediately if we have messages
    if (initialMessages.length > 0) {
        await saveCurrentSession();
    }

    console.log('[SessionManager] Created new session:', currentSessionId);
    notifySessionUpdate('session:created', { sessionId: currentSessionId, title: 'New Chat' });
    return currentSessionId;
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
        console.warn('[SessionManager] Storage not available');
        return null;
    }

    // SECURITY FIX: Validate UUID format before using in storage operations
    if (!sessionId || typeof sessionId !== 'string' || !isValidUUID(sessionId)) {
        console.warn('[SessionManager] Invalid session ID format:', sessionId);
        return null;
    }

    try {
        const session = await Storage.getSession(sessionId);

        if (!session) {
            console.warn(`[SessionManager] Session ${sessionId} not found`);
            return null;
        }

        // Validate session structure (HNW defensive)
        if (!validateSession(session)) {
            console.warn(`[SessionManager] Session ${sessionId} is corrupted`);
            return null;
        }

        // Update module-level state (outside mutex for simplicity - these are scalars)
        currentSessionId = session.id;
        currentSessionCreatedAt = session.createdAt;

        // Sync to AppState for centralized state management
        syncSessionIdToAppState(currentSessionId);

        // HIGH PRIORITY FIX: Use updateSessionData mutex to prevent race conditions
        // with concurrent operations that may be modifying session data
        await updateSessionData(() => ({
            id: session.id,
            messages: session.messages || []
        }));

        // Save current session ID to unified storage and localStorage
        let savePromise;
        if (Storage.setConfig) {
            savePromise = Storage.setConfig(SESSION_CURRENT_SESSION_KEY, currentSessionId).catch(e => {
                console.error('[SessionManager] Failed to save session ID to unified storage:', e);
                // Notify user if toast available - this is a critical data persistence issue
                if (typeof window !== 'undefined' && window.showToast) {
                    window.showToast('Warning: Session may not be remembered on reload due to storage issues.', 4000);
                }
            });
        }
        try {
            localStorage.setItem(SESSION_CURRENT_SESSION_KEY, currentSessionId);
        } catch (e) {
            console.error('[SessionManager] Failed to set current session ID in localStorage:', e);
            // Notify user - this is a critical data persistence issue
            if (typeof window !== 'undefined' && window.showToast) {
                window.showToast('Warning: Session may not be remembered on reload due to storage issues.', 4000);
            }
        }

        console.log('[SessionManager] Loaded session:', sessionId, 'with', (session.messages || []).length, 'messages');
        notifySessionUpdate('session:loaded', { sessionId, messageCount: (session.messages || []).length });
        // Return promise for storage operation to allow caller to handle completion
        return savePromise || Promise.resolve(session);

    } catch (e) {
        console.error('[SessionManager] Failed to load session:', e);
        return null;
    }
}

/**
 * Save current session to IndexedDB immediately
 * EDGE CASE FIX: Preserves system prompts during truncation
 * HIGH PRIORITY FIX: Returns boolean indicating success for caller error handling
 * @returns {Promise<boolean>} True if save succeeded, false otherwise
 */
async function saveCurrentSession() {
    if (!currentSessionId || !Storage.saveSession) {
        return false;
    }

    // Get messages from module-local memory (thread-safe access)
    const messages = _sessionData.messages || [];
    const messageCount = messages.length;

    // Warn when approaching message limit (DATA LOSS WARNING)
    if (messageCount >= MESSAGE_LIMIT_WARNING_THRESHOLD && !hasWarnedAboutMessageLimit) {
        hasWarnedAboutMessageLimit = true;
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast(
                `You have ${messageCount} messages in this chat. Only the most recent ${MAX_SAVED_MESSAGES} messages will be saved permanently.`,
                6000
            );
        }
        console.warn(`[SessionManager] Approaching message limit: ${messageCount}/${MAX_SAVED_MESSAGES}`);
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
            console.warn(`[SessionManager] Truncated ${truncatedCount} old messages (kept ${systemMessages.length} system prompts + ${MAX_SAVED_MESSAGES - systemMessages.length} most recent)`);
        }

        await Storage.saveSession(session);
        console.log('[SessionManager] Session saved:', currentSessionId);
        notifySessionUpdate('session:updated', { sessionId: currentSessionId, field: 'messages' });
        return true;
    } catch (e) {
        console.error('[SessionManager] Failed to save session:', e);
        // HIGH PRIORITY FIX: Notify user of save failure - this is a data loss risk
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast('Warning: Failed to save conversation. Data may be lost on refresh.', 5000);
        }
        return false;
    }
}

/**
 * Debounced save conversation
 * @param {number} delayMs - Debounce delay in milliseconds (default: 2000)
 */
function saveConversation(delayMs = 2000) {
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
 * Flush pending save asynchronously
 * Use when we have time (visibilitychange)
 * This has time to complete because tab is going hidden, not closing
 */
async function flushPendingSaveAsync() {
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        autoSaveTimeoutId = null;
    }
    if (currentSessionId && _sessionData.id) {
        try {
            await saveCurrentSession();
            console.log('[SessionManager] Session flushed on visibility change');
        } catch (e) {
            console.error('[SessionManager] Flush save failed:', e);
        }
    }
}

/**
 * Emergency synchronous backup to localStorage
 * Use when tab is closing - beforeunload requires sync completion
 * Next load will detect this and migrate to IndexedDB
 */
function emergencyBackupSync() {
    if (!currentSessionId || !_sessionData.id) return;

    const messages = _sessionData.messages || [];
    if (messages.length === 0) return;

    const backup = {
        sessionId: currentSessionId,
        createdAt: currentSessionCreatedAt,
        messages: messages.slice(-100),
        timestamp: Date.now()
    };

    try {
        localStorage.setItem(SESSION_EMERGENCY_BACKUP_KEY, JSON.stringify(backup));
        console.log('[SessionManager] Emergency backup saved to localStorage');
    } catch (e) {
        // localStorage might be full or unavailable
        console.error('[SessionManager] Emergency backup failed:', e);
    }
}

/**
 * Recover emergency backup on load
 * If we have a backup newer than what's in IndexedDB, restore it
 */
async function recoverEmergencyBackup() {
    let backupStr = null;
    try {
        backupStr = localStorage.getItem(SESSION_EMERGENCY_BACKUP_KEY);
    } catch (e) {
        console.error('[SessionManager] Failed to get emergency backup from localStorage:', e);
        return false;
    }
    if (!backupStr) return false;

    const backup = safeJsonParse(backupStr, null);
    if (!backup) {
        console.warn('[SessionManager] Emergency backup is corrupted or invalid');
        return false;
    }

    try {
        // Only recover if backup is recent (< 1 hour old)
        if (Date.now() - backup.timestamp > SESSION_EMERGENCY_BACKUP_MAX_AGE_MS) {
            console.log('[SessionManager] Emergency backup too old, discarding');
            try {
                localStorage.removeItem(SESSION_EMERGENCY_BACKUP_KEY);
            } catch (e) {
                console.error('[SessionManager] Failed to remove expired emergency backup from localStorage:', e);
            }
            return false;
        }

        let saveSuccess = false;

        // Check if session exists with fewer messages
        const existing = await Storage.getSession?.(backup.sessionId);
        if (existing) {
            const existingCount = existing.messages?.length || 0;
            const backupCount = backup.messages?.length || 0;

            if (backupCount > existingCount) {
                // Backup has more messages - update existing session
                existing.messages = backup.messages;
                existing.createdAt = backup.createdAt || existing.createdAt;
                await Storage.saveSession(existing);
                saveSuccess = true;
                console.log('[SessionManager] Recovered', backupCount - existingCount, 'messages from emergency backup');
            } else {
                saveSuccess = true; // No recovery needed, existing has more messages
            }
        } else if (backup.messages && backup.messages.length > 0) {
            // Session doesn't exist, create it from backup
            await Storage.saveSession?.({
                id: backup.sessionId,
                title: 'Recovered Chat',
                createdAt: backup.createdAt || new Date().toISOString(),
                messages: backup.messages
            });
            saveSuccess = true;
            console.log('[SessionManager] Created new session from emergency backup');
        }

        // Only remove backup if save was successful
        if (saveSuccess) {
            try {
                localStorage.removeItem(SESSION_EMERGENCY_BACKUP_KEY);
            } catch (e) {
                console.error('[SessionManager] Failed to remove emergency backup from localStorage after successful recovery:', e);
            }
        }
        return true;
    } catch (e) {
        console.error('[SessionManager] Emergency backup recovery failed:', e);
        return false;
    }
}

// Track previous session for switch events
let previousSessionId = null;

/**
 * Switch to a different session
 * SESSION LOCKING: Waits for any ongoing message processing to complete
 * @param {string} sessionId - Session ID to switch to
 * @returns {Promise<boolean>} Success status
 */
async function switchSession(sessionId) {
    // SESSION LOCKING: Wait for any ongoing message processing to complete
    // This prevents race conditions where a session switch happens mid-message
    if (_processingSessionId !== null) {
        console.warn('[SessionManager] Waiting for message processing to complete before switching sessions...');
        // Wait for the processing lock to be released
        await _processingLock;
        console.log('[SessionManager] Message processing completed, proceeding with session switch');
    }

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
}

/**
 * Get all sessions for sidebar display
 * @returns {Promise<Array>} Array of session objects
 */
async function listSessions() {
    if (!Storage.getAllSessions) {
        return [];
    }
    try {
        return await Storage.getAllSessions();
    } catch (e) {
        console.error('[SessionManager] Failed to list sessions:', e);
        return [];
    }
}

/**
 * Delete a session by ID
 * SECURITY FIX: Validates UUID format before using in storage operations
 * @param {string} sessionId - Session ID to delete
 * @returns {Promise<boolean>} Success status
 */
async function deleteSessionById(sessionId) {
    if (!Storage.deleteSession) {
        return false;
    }

    // SECURITY FIX: Validate UUID format before using in storage operations
    if (!sessionId || typeof sessionId !== 'string' || !isValidUUID(sessionId)) {
        console.warn('[SessionManager] Invalid session ID format:', sessionId);
        return false;
    }

    try {
        await Storage.deleteSession(sessionId);

        // If we deleted the current session, create a new one
        if (sessionId === currentSessionId) {
            await createNewSession();
        }

        notifySessionUpdate('session:deleted', { sessionId });
        return true;
    } catch (e) {
        console.error('[SessionManager] Failed to delete session:', e);
        return false;
    }
}

/**
 * Rename a session
 * SECURITY FIX: Validates UUID format before using in storage operations
 * @param {string} sessionId - Session ID to rename
 * @param {string} newTitle - New title
 * @returns {Promise<boolean>} Success status
 */
async function renameSession(sessionId, newTitle) {
    if (!Storage.getSession || !Storage.saveSession) {
        return false;
    }

    // SECURITY FIX: Validate UUID format before using in storage operations
    if (!sessionId || typeof sessionId !== 'string' || !isValidUUID(sessionId)) {
        console.warn('[SessionManager] Invalid session ID format:', sessionId);
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
        console.error('[SessionManager] Failed to rename session:', e);
        return false;
    }
}

/**
 * Clear conversation history and create new session
 * CRITICAL FIX: Save pending changes before clearing to prevent data loss
 */
async function clearConversation() {
    // CRITICAL FIX: Save current session before clearing to prevent data loss
    if (currentSessionId) {
        // Cancel any pending save and save immediately
        if (autoSaveTimeoutId) {
            clearTimeout(autoSaveTimeoutId);
            autoSaveTimeoutId = null;
        }
        await saveCurrentSession();
    }

    // Clear module-local state
    _sessionData = { id: null, messages: [] };
    // Sync to window for legacy compatibility (read-only)
    if (typeof window !== 'undefined') {
        window._sessionData = getSessionData();
    }
    await createNewSession();
}

/**
 * Get current session ID
 * @returns {string|null}
 */
function getCurrentSessionId() {
    return currentSessionId;
}

/**
 * Get conversation history
 * HNW: Returns deep copy to prevent external mutations
 * @returns {Array} Deep copy of current conversation history
 */
function getHistory() {
    // Return a deep copy from module-local memory (thread-safe access)
    if (_sessionData.messages) {
        return deepCloneMessages(_sessionData.messages);
    }
    return [];
}

/**
 * Add message to current session
 * Automatically tags message with dataVersion for stale data detection
 * EDGE CASE FIX: Implements in-memory sliding window to prevent unbounded growth
 * Now uses mutex protection via updateSessionData to prevent race conditions
 * @param {Object} message - Message object with role and content
 * @returns {Promise<void>}
 */
async function addMessageToHistory(message) {
    // Tag message with current data version for stale detection
    if (DataVersion.tagMessage) {
        DataVersion.tagMessage(message);
    }

    // Use updateSessionData for mutex protection
    await updateSessionData((currentData) => {
        // EDGE CASE FIX: Implement in-memory sliding window
        // Keep system messages and recent messages to prevent unbounded memory growth
        // Use a higher limit in memory than on disk (2x) for better UX
        const IN_MEMORY_MAX = MAX_SAVED_MESSAGES * 2;
        const existingMessages = currentData.messages || [];
        const systemMessages = existingMessages.filter(m => m.role === 'system');
        const nonSystemMessages = existingMessages.filter(m => m.role !== 'system');

        // Create new object to return (cannot mutate frozen currentData)
        let newMessages;
        if (nonSystemMessages.length >= IN_MEMORY_MAX - systemMessages.length) {
            // Drop oldest non-system message to make room
            newMessages = [...systemMessages, ...nonSystemMessages.slice(-(IN_MEMORY_MAX - systemMessages.length - 1)), message];
        } else {
            newMessages = [...existingMessages, message];
        }

        return {
            id: currentData.id,
            messages: newMessages
        };
    });
}

/**
 * Add multiple messages to current session atomically in a single transaction
 * CRITICAL FIX: Prevents race conditions when adding message turns (user + assistant)
 * Multiple sequential addMessageToHistory calls can be interleaved with other operations,
 * but this function adds all messages within a single mutex lock for atomicity.
 * @param {Array<Object>} messages - Array of message objects with role and content
 * @returns {Promise<void>}
 */
async function addMessagesToHistory(messages) {
    if (!messages || messages.length === 0) {
        return;
    }

    // Tag all messages with current data version for stale detection
    if (DataVersion.tagMessage) {
        messages.forEach(msg => DataVersion.tagMessage(msg));
    }

    // Use updateSessionData for mutex protection - adds all messages in one transaction
    await updateSessionData((currentData) => {
        // EDGE CASE FIX: Implement in-memory sliding window
        // Keep system messages and recent messages to prevent unbounded memory growth
        const IN_MEMORY_MAX = MAX_SAVED_MESSAGES * 2;
        const existingMessages = currentData.messages || [];
        const systemMessages = existingMessages.filter(m => m.role === 'system');
        const nonSystemMessages = existingMessages.filter(m => m.role !== 'system');

        // Add all new messages at once
        const newNonSystemMessages = [...nonSystemMessages, ...messages.filter(m => m.role !== 'system')];
        const newSystemMessages = [...systemMessages, ...messages.filter(m => m.role === 'system')];

        // Truncate if needed - create new object (cannot mutate frozen currentData)
        let newMessages;
        if (newNonSystemMessages.length >= IN_MEMORY_MAX - newSystemMessages.length) {
            newMessages = [
                ...newSystemMessages,
                ...newNonSystemMessages.slice(-(IN_MEMORY_MAX - newSystemMessages.length))
            ];
        } else {
            newMessages = [...newSystemMessages, ...newNonSystemMessages];
        }

        return {
            id: currentData.id,
            messages: newMessages
        };
    });
}

/**
 * Remove message from history at index
 * HIGH PRIORITY FIX: Now uses mutex protection via updateSessionData
 * @param {number} index - Index to remove
 * @returns {Promise<boolean>} Success status
 */
async function removeMessageFromHistory(index) {
    let success = false;
    await updateSessionData((currentData) => {
        if (currentData.messages && index >= 0 && index < currentData.messages.length) {
            // Create new array without the removed item (cannot mutate frozen currentData)
            const newMessages = [...currentData.messages];
            newMessages.splice(index, 1);
            success = true;
            return {
                id: currentData.id,
                messages: newMessages
            };
        }
        return currentData;
    });
    return success;
}

/**
 * Truncate history to specific length
 * HIGH PRIORITY FIX: Now uses mutex protection via updateSessionData
 * @param {number} length - New length
 * @returns {Promise<void>}
 */
async function truncateHistory(length) {
    await updateSessionData((currentData) => {
        // Create new object (cannot mutate frozen currentData)
        if (currentData.messages) {
            return {
                id: currentData.id,
                messages: currentData.messages.slice(0, length)
            };
        }
        return currentData;
    });
}

/**
 * Replace entire history
 * HIGH PRIORITY FIX: Now uses mutex protection via updateSessionData
 * @param {Array} messages - New message array
 * @returns {Promise<void>}
 */
async function replaceHistory(messages) {
    await updateSessionData((currentData) => {
        // Create new object (cannot mutate frozen currentData)
        return {
            id: currentData.id,
            messages: [...messages]
        };
    });
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Validate session structure
 * @param {Object} session - Session object to validate
 * @returns {boolean} True if session has valid structure
 */
function validateSession(session) {
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
    EventBus.emit(eventType, { sessionId: currentSessionId, ...eventPayload });
}

/**
 * Set user context for session metadata
 * @param {Object} personality - Personality data
 * @returns {void}
 */
function setUserContext(personality) {
    if (typeof window !== 'undefined') {
        window._userContext = { personality };
    }
}

// ==========================================
// Event Handlers
// ==========================================

// Set up event listeners if in browser environment
// Prevent duplicate registration by checking flag
if (typeof window !== 'undefined' && !_eventListenersRegistered) {
    _eventListenersRegistered = true;

    // Async save when tab goes hidden (mobile switch, minimize, tab switch)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushPendingSaveAsync();
        }
    });

    // Sync backup when tab is actually closing
    window.addEventListener('beforeunload', emergencyBackupSync);

    // Also handle pagehide for mobile Safari compatibility
    window.addEventListener('pagehide', emergencyBackupSync);
}

// ==========================================
// Public API
// ==========================================

const SessionManager = {
    // Lifecycle
    init,
    createNewSession,
    loadSession,
    switchSession,
    deleteSessionById,
    renameSession,
    clearConversation,

    // Data Access
    getCurrentSessionId,
    getHistory,
    addMessageToHistory,
    addMessagesToHistory, // NEW: Batch add with atomic transaction
    removeMessageFromHistory,
    truncateHistory,
    replaceHistory,
    updateSessionData, // Atomic update with mutex protection

    // Persistence
    saveCurrentSession,
    saveConversation,
    flushPendingSaveAsync,
    emergencyBackupSync,
    recoverEmergencyBackup,

    // Utilities
    listSessions,
    setUserContext,
    // NOTE: onSessionUpdate removed - use EventBus.on('session:*') instead

    // Session locking (prevents session switches during message processing)
    acquireProcessingLock,
    isCurrentSession,

    // Exposed for testing
    generateUUID,
    isValidUUID,
    validateSession,

    // Internal state access (for chat.js to prevent duplicate event listeners)
    get eventListenersRegistered() { return _eventListenersRegistered; }
};

// ES Module export
export { SessionManager };

// Deprecation warning for window._sessionData legacy global
// Warns when code reads from window._sessionData instead of using SessionManager
if (typeof window !== 'undefined') {
    let _hasWarnedAboutSessionData = false;
    Object.defineProperty(window, '_sessionData', {
        get() {
            if (!_hasWarnedAboutSessionData) {
                _hasWarnedAboutSessionData = true;
                console.warn('[SessionManager] DEPRECATION: window._sessionData is deprecated. Use SessionManager.getSessionData() or AppState instead.');
            }
            return this.__sessionData__;
        },
        set(value) {
            this.__sessionData__ = value;
        },
        enumerable: true,
        configurable: true
    });
}

console.log('[SessionManager] Service loaded');