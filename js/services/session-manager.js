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

/**
 * Get session data safely (returns a snapshot)
 * @returns {Object} Copy of session data
 */
function getSessionData() {
    // Return a copy to prevent external mutations
    return {
        id: _sessionData.id,
        messages: [..._sessionData.messages]
    };
}

/**
 * Set session data safely (no lock - use updateSessionData for concurrent updates)
 * @param {Object} data - New session data
 */
function setSessionData(data) {
    _sessionData = {
        id: data.id || null,
        messages: data.messages ? [...data.messages] : []
    };
}

/**
 * Update session data atomically with mutex protection.
 * This prevents lost update races when multiple async operations
 * try to modify session data concurrently within the same tab.
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
            messages: newData.messages ? [...newData.messages] : []
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

    // Store session data in module-local memory (protected from external mutations)
    _sessionData = {
        id: currentSessionId,
        messages: [...initialMessages]
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
 * @param {string} sessionId - Session ID to load
 * @returns {Promise<Object|null>} Session object or null if not found/invalid
 */
async function loadSession(sessionId) {
    if (!Storage.getSession) {
        console.warn('[SessionManager] Storage not available');
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

        currentSessionId = session.id;
        currentSessionCreatedAt = session.createdAt;

        // Store session data in module-local memory (protected from external mutations)
        _sessionData = {
            id: session.id,
            messages: session.messages || []
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

        console.log('[SessionManager] Loaded session:', sessionId, 'with', (session.messages || []).length, 'messages');
        notifySessionUpdate('session:loaded', { sessionId, messageCount: (session.messages || []).length });
        return session;

    } catch (e) {
        console.error('[SessionManager] Failed to load session:', e);
        return null;
    }
}

/**
 * Save current session to IndexedDB immediately
 * EDGE CASE FIX: Preserves system prompts during truncation
 */
async function saveCurrentSession() {
    if (!currentSessionId || !Storage.saveSession) {
        return;
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
    } catch (e) {
        console.error('[SessionManager] Failed to save session:', e);
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
 * @param {string} sessionId - Session ID to switch to
 * @returns {Promise<boolean>} Success status
 */
async function switchSession(sessionId) {
    // Save current session first
    if (currentSessionId && autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
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
 * @param {string} sessionId - Session ID to delete
 * @returns {Promise<boolean>} Success status
 */
async function deleteSessionById(sessionId) {
    if (!Storage.deleteSession) {
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
 * @param {string} sessionId - Session ID to rename
 * @param {string} newTitle - New title
 * @returns {Promise<boolean>} Success status
 */
async function renameSession(sessionId, newTitle) {
    if (!Storage.getSession || !Storage.saveSession) {
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
 */
async function clearConversation() {
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
 * @returns {Array} Copy of current conversation history
 */
function getHistory() {
    // Return a copy from module-local memory (thread-safe access)
    if (_sessionData.messages) {
        return [..._sessionData.messages];
    }
    return [];
}

/**
 * Add message to current session
 * Automatically tags message with dataVersion for stale data detection
 * EDGE CASE FIX: Implements in-memory sliding window to prevent unbounded growth
 * @param {Object} message - Message object with role and content
 */
function addMessageToHistory(message) {
    // Use module-local state with immutable update pattern (thread-safe)
    if (_sessionData.messages) {
        // Tag message with current data version for stale detection
        if (DataVersion.tagMessage) {
            DataVersion.tagMessage(message);
        }

        // EDGE CASE FIX: Implement in-memory sliding window
        // Keep system messages and recent messages to prevent unbounded memory growth
        // Use a higher limit in memory than on disk (2x) for better UX
        const IN_MEMORY_MAX = MAX_SAVED_MESSAGES * 2;
        const systemMessages = _sessionData.messages.filter(m => m.role === 'system');
        const nonSystemMessages = _sessionData.messages.filter(m => m.role !== 'system');

        // Create new array reference instead of mutating (prevents race conditions)
        if (nonSystemMessages.length >= IN_MEMORY_MAX - systemMessages.length) {
            // Drop oldest non-system message to make room
            _sessionData.messages = [...systemMessages, ...nonSystemMessages.slice(-(IN_MEMORY_MAX - systemMessages.length - 1)), message];
        } else {
            _sessionData.messages = [..._sessionData.messages, message];
        }

        // Sync to window for legacy compatibility (read-only)
        if (typeof window !== 'undefined') {
            window._sessionData = getSessionData();
        }
    }
}

/**
 * Remove message from history at index
 * @param {number} index - Index to remove
 * @returns {boolean} Success status
 */
function removeMessageFromHistory(index) {
    // Use module-local state with immutable update pattern (thread-safe)
    if (_sessionData.messages && index >= 0 && index < _sessionData.messages.length) {
        // Create new array without the removed item (prevents race conditions)
        const newMessages = [..._sessionData.messages];
        newMessages.splice(index, 1);
        _sessionData.messages = newMessages;
        // Sync to window for legacy compatibility (read-only)
        if (typeof window !== 'undefined') {
            window._sessionData = getSessionData();
        }
        return true;
    }
    return false;
}

/**
 * Truncate history to specific length
 * @param {number} length - New length
 * @returns {void}
 */
function truncateHistory(length) {
    // Use module-local state with immutable update pattern (thread-safe)
    if (_sessionData.messages) {
        _sessionData.messages = _sessionData.messages.slice(0, length);
        // Sync to window for legacy compatibility (read-only)
        if (typeof window !== 'undefined') {
            window._sessionData = getSessionData();
        }
    }
}

/**
 * Replace entire history
 * @param {Array} messages - New message array
 * @returns {void}
 */
function replaceHistory(messages) {
    // Use module-local state with immutable update pattern (thread-safe)
    _sessionData.messages = [...messages];
    // Sync to window for legacy compatibility (read-only)
    if (typeof window !== 'undefined') {
        window._sessionData = getSessionData();
    }
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
    removeMessageFromHistory,
    truncateHistory,
    replaceHistory,
    updateSessionData, // NEW: Atomic update with mutex protection

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

    // Exposed for testing
    generateUUID,
    validateSession,

    // Internal state access (for chat.js to prevent duplicate event listeners)
    get eventListenersRegistered() { return _eventListenersRegistered; }
};

// ES Module export
export { SessionManager };

console.log('[SessionManager] Service loaded');