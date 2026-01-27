/**
 * Session State Module
 *
 * Manages session state including data access, message history,
 * and atomic updates with mutex protection for concurrent access.
 *
 * Responsibilities:
 * - Session data get/set/update operations
 * - Message history management
 * - Deep cloning for immutability
 * - Mutex protection for concurrent access
 * - State synchronization with AppState
 *
 * @module services/session-manager/session-state
 */

'use strict';

import { DataVersion } from '../data-version.js';
import { AppState } from '../../state/app-state.js';
import { Mutex } from '../../utils/concurrency/mutex.js';
import { SESSION } from '../../constants/session.js';

// ==========================================
// Constants
// ==========================================

// L2: Use shared constants instead of duplicated values
const MAX_SAVED_MESSAGES = SESSION.MAX_SAVED_MESSAGES;  // Maximum messages saved per session
const IN_MEMORY_MAX = MAX_SAVED_MESSAGES * 2;  // In-memory limit (2x for better UX)

// ==========================================
// State
// ==========================================

let currentSessionId = null;
let currentSessionCreatedAt = null;

// In-memory session data with mutex protection
let _sessionData = { id: null, messages: [], _version: 0 };
const _sessionDataMutex = new Mutex();

// ==========================================
// Deep Cloning Utilities
// ==========================================

/**
 * Deep clone a message object to prevent external mutations
 * M1 FIX: Now uses actual deep cloning via structuredClone with JSON fallback
 * HNW: Ensures message objects cannot be modified from outside
 * @param {Object} msg - Message object to clone
 * @returns {Object} Deep cloned message
 */
export function deepCloneMessage(msg) {
    if (!msg) return msg;
    // Use structuredClone if available (modern browsers, Node 17+)
    // Falls back to JSON.parse/stringify for older environments
    // Note: JSON approach converts Date to string, undefined to null, drops functions
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(msg);
        } catch (e) {
            // structuredClone throws on circular references, functions, etc.
            // Fall back to JSON approach
            return fallbackClone(msg);
        }
    }
    return fallbackClone(msg);
}

/**
 * Fallback deep clone using JSON.parse/stringify
 * @param {Object} msg - Message object to clone
 * @returns {Object} Deep cloned message
 * @private
 */
function fallbackClone(msg) {
    try {
        return JSON.parse(JSON.stringify(msg));
    } catch (e) {
        // If JSON fails (circular refs), return shallow copy as last resort
        return { ...msg };
    }
}

/**
 * Deep clone messages array to prevent external mutations
 * @param {Array} messages - Messages array to clone
 * @returns {Array} Deep cloned messages array
 */
export function deepCloneMessages(messages) {
    if (!messages) return [];
    return messages.map(deepCloneMessage);
}

// ==========================================
// Session Data Access
// ==========================================

/**
 * Get session data safely (returns a deep copy snapshot)
 * HNW: Returns frozen deep copy to prevent external mutations
 * @returns {Object} Deep copy of session data with _version field for stale data detection
 */
export function getSessionData() {
    // Return a deep copy to prevent external mutations
    const snapshot = {
        id: _sessionData.id,
        messages: deepCloneMessages(_sessionData.messages),
        _version: _sessionData._version
    };
    // Freeze the snapshot to prevent any mutations
    return Object.freeze(snapshot);
}

/**
 * Set session data safely (no lock - use updateSessionData for concurrent updates)
 * Creates deep copies of all message objects to prevent external mutations
 * @param {Object} data - New session data
 */
export function setSessionData(data) {
    _sessionData = {
        id: data.id || null,
        messages: deepCloneMessages(data.messages),
        _version: 0  // Reset version on direct set
    };
    // Also update current session ID for consistency
    currentSessionId = data.id || null;
}

/**
 * Sync session ID to AppState for centralized state management
 * This ensures components reading from AppState see consistent session state
 * @param {string|null} sessionId - Session ID to sync
 */
export function syncSessionIdToAppState(sessionId) {
    if (AppState?.update && typeof AppState.update === 'function') {
        try {
            AppState.update('ui', { currentSessionId: sessionId });
        } catch (e) {
            console.warn('[SessionState] Failed to sync session ID to AppState:', e);
        }
    }
}

/**
 * Update session data atomically with mutex protection.
 * This prevents lost update races when multiple async operations
 * try to modify session data concurrently within the same tab.
 * HNW: Uses deep cloning to prevent external mutations
 * HNW: Uses state versioning to detect and reject stale updates
 *
 * @param {Function|Object} options - Either an updater function or options object
 * @param {Function} options.updaterFn - Function that receives current data and returns new data
 * @param {number} [options.expectedVersion] - Expected version for optimistic locking
 * @returns {Promise<{success: boolean, version: number}>} Result with success status and new version
 */
export async function updateSessionData(options) {
    // Support both old API (updaterFn function) and new API (options object)
    const updaterFn = typeof options === 'function' ? options : options.updaterFn;
    const expectedVersion = (typeof options === 'object' && options !== null && 'expectedVersion' in options)
        ? options.expectedVersion
        : undefined;

    return _sessionDataMutex.runExclusive(async () => {
        const currentData = getSessionData();

        // State versioning check: reject if expected version doesn't match
        // This prevents stale updates from overwriting newer state
        if (expectedVersion !== undefined && currentData._version !== expectedVersion) {
            console.warn(
                `[SessionState] Version mismatch: expected ${expectedVersion}, got ${currentData._version}. ` +
                `Update rejected to prevent lost data.`
            );
            return { success: false, version: currentData._version };
        }

        const newData = updaterFn(currentData);
        const newVersion = currentData._version + 1;

        _sessionData = {
            id: newData.id || null,
            messages: deepCloneMessages(newData.messages),
            _version: newVersion
        };

        // Session data is now only available via ES module exports
        // Use: import { getSessionData } from './session-state.js'

        return { success: true, version: newVersion };
    });
}

// ==========================================
// Session ID Management
// ==========================================

/**
 * Get current session ID
 * @returns {string|null}
 */
export function getCurrentSessionId() {
    return currentSessionId;
}

/**
 * Set current session ID (internal use)
 * @param {string} sessionId - Session ID to set
 */
export function setCurrentSessionId(sessionId) {
    currentSessionId = sessionId;
}

/**
 * Get current session creation timestamp
 * @returns {string|null} ISO timestamp
 */
export function getCurrentSessionCreatedAt() {
    return currentSessionCreatedAt;
}

/**
 * Set current session creation timestamp (internal use)
 * @param {string} timestamp - ISO timestamp
 */
export function setCurrentSessionCreatedAt(timestamp) {
    currentSessionCreatedAt = timestamp;
}

// ==========================================
// Message History Access
// ==========================================

/**
 * Get conversation history
 * HNW: Returns deep copy to prevent external mutations
 * @returns {Array} Deep copy of current conversation history
 */
export function getHistory() {
    // Return a deep copy from module-local memory (thread-safe access)
    if (_sessionData.messages) {
        return deepCloneMessages(_sessionData.messages);
    }
    return [];
}

// ==========================================
// Message History Updates
// ==========================================

/**
 * Add message to current session
 * Automatically tags message with dataVersion for stale data detection
 * EDGE CASE FIX: Implements in-memory sliding window to prevent unbounded growth
 * Now uses mutex protection via updateSessionData to prevent race conditions
 * @param {Object} message - Message object with role and content
 * @returns {Promise<void>}
 */
export async function addMessageToHistory(message) {
    // Tag message with current data version for stale detection
    if (DataVersion.tagMessage) {
        DataVersion.tagMessage(message);
    }

    // Use updateSessionData for mutex protection
    await updateSessionData((currentData) => {
        // EDGE CASE FIX: Implement in-memory sliding window
        // Keep system messages and recent messages to prevent unbounded memory growth
        // Use a higher limit in memory than on disk (2x) for better UX
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
export async function addMessagesToHistory(messages) {
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
 * TD-7: Added comprehensive array bounds validation including type checking
 * @param {number} index - Index to remove
 * @returns {Promise<boolean>} Success status
 */
export async function removeMessageFromHistory(index) {
    let success = false;
    await updateSessionData((currentData) => {
        // TD-7: Comprehensive bounds checking
        // 1. Check messages array exists
        // 2. Check index is a valid number (not NaN, null, undefined)
        // 3. Check index is within array bounds [0, length)
        // Note: Number.isInteger() handles null, undefined, NaN, floats correctly
        const isValidIndex = currentData.messages &&
                             Number.isInteger(index) &&
                             index >= 0 &&
                             index < currentData.messages.length;

        if (isValidIndex) {
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
export async function truncateHistory(length) {
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
export async function replaceHistory(messages) {
    await updateSessionData((currentData) => {
        // Create new object (cannot mutate frozen currentData)
        return {
            id: currentData.id,
            messages: [...messages]
        };
    });
}

console.log('[SessionState] Module loaded');
