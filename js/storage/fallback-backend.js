/**
 * Fallback Storage Backend
 *
 * Provides in-memory and localStorage-based storage fallback when IndexedDB is unavailable.
 * This enables the app to work in private browsing mode or when IndexedDB is blocked.
 *
 * IMPORTANT: Data stored in this backend:
 * - In-memory mode: Lost on page refresh
 * - localStorage mode: Lost on logout/browser close (in private mode)
 * - Limited to ~5MB total (localStorage quota)
 *
 * @module storage/fallback-backend
 */

import { EventBus } from '../services/event-bus.js';

// ==========================================
// Fallback Mode Detection
// ==========================================

/**
 * Fallback modes
 * - MEMORY: Pure in-memory, no persistence
 * - LOCALSTORAGE: Use localStorage as backing store
 */
const FALLBACK_MODES = {
    MEMORY: 'memory',
    LOCALSTORAGE: 'localStorage',
};

// Current fallback mode (determined at init)
let currentMode = FALLBACK_MODES.MEMORY;

// In-memory store
const memoryStore = new Map();

// Track if we've shown the warning
let warningShown = false;

// ==========================================
// Private Browsing Detection
// ==========================================

/**
 * Detect if running in private browsing mode
 * @returns {Promise<boolean>}
 */
async function detectPrivateBrowsing() {
    // Method 1: Try IndexedDB (most reliable)
    try {
        const testDB = await tryOpenIndexedDB();
        if (testDB) {
            testDB.close();
            return false;
        }
    } catch (e) {
        // IndexedDB failed - might be private mode
        console.warn('[Fallback] IndexedDB unavailable:', e.message);
    }

    // Method 2: Check File System Access API (blocked in private mode)
    if (typeof navigator?.storage?.getDirectory === 'function') {
        try {
            await navigator.storage.getDirectory();
            return false; // Available - not private mode
        } catch (e) {
            console.warn('[Fallback] File System API blocked, likely private mode');
        }
    }

    // Method 3: Check localStorage quota (reduced in private mode)
    try {
        const testKey = '__private_mode_test__';
        const testValue = 'x'.repeat(1024 * 1024); // 1MB test
        localStorage.setItem(testKey, testValue);
        localStorage.removeItem(testKey);
        // If we got here, localStorage works and has decent quota
        return false;
    } catch (e) {
        // localStorage might be available but with reduced quota
        // Still not definitive for private mode detection
    }

    // Method 4: Check safari's private browsing indicator
    try {
        const isSafariPrivate = window.safari?.pushNotification?.toString()?.includes('incognito');
        if (isSafariPrivate) return true;
    } catch (e) {
        // Ignore
    }

    // If we get here, assume private mode (better to be safe)
    return true;
}

/**
 * Try to open a test IndexedDB
 * @returns {Promise<IDBDatabase|null>}
 */
async function tryOpenIndexedDB() {
    if (!window.indexedDB) return null;

    return new Promise((resolve, reject) => {
        const testName = '__indexeddb_test__';
        const testVersion = 1;

        try {
            const request = indexedDB.open(testName, testVersion);

            request.onsuccess = () => {
                const db = request.result;
                db.close();
                // Clean up
                indexedDB.deleteDatabase(testName);
                resolve(db);
            };

            request.onerror = () => {
                reject(new Error(request.error?.message || 'IndexedDB open failed'));
            };

            request.onblocked = () => {
                reject(new Error('IndexedDB blocked'));
            };

            // Timeout for slow/blocking scenarios
            setTimeout(() => {
                reject(new Error('IndexedDB timeout'));
            }, 1000);
        } catch (e) {
            reject(e);
        }
    });
}

// ==========================================
// Storage Mode Selection
// ==========================================

/**
 * Determine the best fallback mode
 * @returns {Promise<string>} The fallback mode to use
 */
async function determineFallbackMode() {
    // Try localStorage first (persistence across refresh)
    if (isLocalStorageAvailable()) {
        return FALLBACK_MODES.LOCALSTORAGE;
    }

    // Fall back to pure memory (no persistence)
    return FALLBACK_MODES.MEMORY;
}

/**
 * Check if localStorage is available and working
 * @returns {boolean}
 */
function isLocalStorageAvailable() {
    try {
        const test = '__ls_test__';
        localStorage.setItem(test, '1');
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        return false;
    }
}

// ==========================================
// Data Serialization
// ==========================================

/**
 * Prefix for localStorage keys
 */
const LS_PREFIX = 'rhythm_fallback_';

/**
 * Get localStorage key for a store
 * @param {string} storeName - Store name
 * @returns {string}
 */
function getLSKey(storeName) {
    return `${LS_PREFIX}${storeName}`;
}

/**
 * Serialize data for storage
 * @param {any} data - Data to serialize
 * @returns {string} Serialized data
 */
function serialize(data) {
    return JSON.stringify(data);
}

/**
 * Deserialize data from storage
 * @param {string} serialized - Serialized data
 * @returns {any} Deserialized data
 */
function deserialize(serialized) {
    if (!serialized) return undefined;
    try {
        return JSON.parse(serialized);
    } catch (e) {
        console.error('[Fallback] Deserialization error:', e);
        return undefined;
    }
}

// ==========================================
// Primitive Operations
// ==========================================

/**
 * Put a record in the fallback store
 * @param {string} storeName - Store name
 * @param {object} data - Data to store
 * @returns {Promise<any>} The stored record's key
 */
async function put(storeName, data) {
    const key = data.id || data.key || 'default';

    if (currentMode === FALLBACK_MODES.LOCALSTORAGE) {
        try {
            const lsKey = getLSKey(storeName);
            const existing = deserialize(localStorage.getItem(lsKey)) || {};

            // Handle both single-record stores (like streams) and key-value stores
            if (storeName === 'streams' || storeName === 'chunks' || storeName === 'embeddings') {
                // These are array-based stores, replace entire store
                localStorage.setItem(lsKey, serialize(data?.data ?? data));
            } else {
                // These are key-value stores
                existing[key] = data;
                localStorage.setItem(lsKey, serialize(existing));
            }

            return key;
        } catch (e) {
            if (isQuotaError(e)) {
                // Fallback to memory if localStorage is full
                console.warn('[Fallback] localStorage quota exceeded, switching to memory mode');
                currentMode = FALLBACK_MODES.MEMORY;
                memoryStore.set(`${storeName}:${key}`, data);
                return key;
            }
            throw e;
        }
    } else {
        // Memory mode
        memoryStore.set(`${storeName}:${key}`, data);
        return key;
    }
}

/**
 * Get a record from the fallback store
 * @param {string} storeName - Store name
 * @param {string} key - Record key
 * @returns {Promise<any>} The record or undefined
 */
async function get(storeName, key) {
    if (currentMode === FALLBACK_MODES.LOCALSTORAGE) {
        try {
            const lsKey = getLSKey(storeName);
            const stored = deserialize(localStorage.getItem(lsKey));

            if (!stored) return undefined;

            // Handle different store structures
            if (storeName === 'streams' || storeName === 'chunks' || storeName === 'embeddings') {
                // CRITICAL FIX Issue #1: Return consistent structure matching IndexedDB
                // IndexedDB returns {id, data, savedAt} wrapper, not raw data
                const storedData = stored.data || stored;
                return {
                    id: key,
                    data: storedData,
                    savedAt: stored.savedAt || Date.now(),
                };
            } else {
                // Key-value stores
                return stored[key];
            }
        } catch (e) {
            console.error('[Fallback] Get error:', e);
            return undefined;
        }
    } else {
        // Memory mode
        return memoryStore.get(`${storeName}:${key}`);
    }
}

/**
 * Get all records from a store
 * @param {string} storeName - Store name
 * @returns {Promise<Array>} All records
 */
async function getAll(storeName) {
    if (currentMode === FALLBACK_MODES.LOCALSTORAGE) {
        try {
            const lsKey = getLSKey(storeName);
            const stored = deserialize(localStorage.getItem(lsKey));

            if (!stored) return [];

            // Return as array if it's an object (key-value store)
            if (typeof stored === 'object' && !Array.isArray(stored)) {
                return Object.values(stored);
            }

            return Array.isArray(stored) ? stored : [stored];
        } catch (e) {
            console.error('[Fallback] getAll error:', e);
            return [];
        }
    } else {
        // Memory mode - collect all keys with this store prefix
        const results = [];
        for (const [fullKey, value] of memoryStore.entries()) {
            if (fullKey.startsWith(`${storeName}:`)) {
                results.push(value);
            }
        }
        return results;
    }
}

/**
 * Clear all records from a store
 * @param {string} storeName - Store name
 * @returns {Promise<void>}
 */
async function clear(storeName) {
    if (currentMode === FALLBACK_MODES.LOCALSTORAGE) {
        try {
            const lsKey = getLSKey(storeName);
            localStorage.removeItem(lsKey);
        } catch (e) {
            console.error('[Fallback] Clear error:', e);
        }
    } else {
        // Memory mode - remove all keys with this store prefix
        for (const fullKey of memoryStore.keys()) {
            if (fullKey.startsWith(`${storeName}:`)) {
                memoryStore.delete(fullKey);
            }
        }
    }
}

/**
 * Delete a specific record
 * CRITICAL FIX Issue #2: Implements proper backup/rollback to prevent data corruption
 * on quota exceeded errors. Clone before modification, rollback on failure.
 *
 * @param {string} storeName - Store name
 * @param {string} key - Record key
 * @returns {Promise<void>}
 */
async function deleteRecord(storeName, key) {
    if (currentMode === FALLBACK_MODES.LOCALSTORAGE) {
        try {
            const lsKey = getLSKey(storeName);
            const storedJson = localStorage.getItem(lsKey);

            // No data to delete from
            if (!storedJson) return;

            const stored = deserialize(storedJson);

            if (stored && typeof stored === 'object') {
                // CRITICAL FIX Issue #2: Clone before modification for rollback capability
                const backup = JSON.parse(JSON.stringify(stored));

                // Now safe to modify in-place
                delete stored[key];

                try {
                    localStorage.setItem(lsKey, JSON.stringify(stored));
                } catch (e) {
                    // CRITICAL FIX Issue #2: Rollback on failure (e.g., quota exceeded)
                    // Restore the original data to the stored object
                    Object.assign(stored, backup);
                    console.error('[Fallback] Delete failed, rolled back:', e);
                    throw e;
                }
            }
        } catch (e) {
            console.error('[Fallback] Delete error:', e);
            throw e; // Re-throw to allow caller to handle
        }
    } else {
        memoryStore.delete(`${storeName}:${key}`);
    }
}

/**
 * Count records in a store
 * @param {string} storeName - Store name
 * @returns {Promise<number>} Record count
 */
async function count(storeName) {
    const all = await getAll(storeName);
    return Array.isArray(all) ? all.length : Object.keys(all).length;
}

// ==========================================
// Utility Functions
// ==========================================

/**
 * Check if error is a quota error
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
function isQuotaError(error) {
    return (
        error.name === 'QuotaExceededError' ||
        error.code === 22 ||
        error.code === 1014 ||
        error.message?.includes('quota') ||
        error.message?.includes('storage')
    );
}

/**
 * Get current fallback mode
 * @returns {string}
 */
function getMode() {
    return currentMode;
}

/**
 * Get storage stats
 * @returns {{ mode: string, isPrivate: boolean, memoryEntries: number }}
 */
function getStats() {
    return {
        mode: currentMode,
        isPrivate: currentMode === FALLBACK_MODES.MEMORY,
        memoryEntries: memoryStore.size,
        hasLocalStorage: isLocalStorageAvailable(),
    };
}

/**
 * Clear all fallback data
 * @returns {Promise<void>}
 */
async function clearAll() {
    // Clear memory
    memoryStore.clear();

    // Clear localStorage entries
    if (currentMode === FALLBACK_MODES.LOCALSTORAGE) {
        // CRITICAL FIX: Collect all keys first, then remove them
        // Iterating while modifying causes skipped items due to index shifting
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(LS_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        // Remove after collection to avoid iteration issues
        for (const key of keysToRemove) {
            localStorage.removeItem(key);
        }
    }
}

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize the fallback backend
 * @returns {Promise<{ mode: string, isPrivate: boolean }>}
 */
async function init() {
    console.log('[Fallback] Initializing fallback backend...');

    // Detect private browsing
    const isPrivate = await detectPrivateBrowsing();

    // Determine fallback mode
    currentMode = await determineFallbackMode();

    console.log(`[Fallback] Using ${currentMode} mode (private browsing: ${isPrivate})`);

    // Show warning once
    if (!warningShown && isPrivate) {
        showFallbackWarning(currentMode);
        warningShown = true;
    }

    // Emit event for app to handle
    EventBus.emit('storage:fallback_active', {
        mode: currentMode,
        isPrivate,
        message: getFallbackMessage(currentMode, isPrivate),
    });

    return { mode: currentMode, isPrivate };
}

/**
 * Get appropriate message for current fallback state
 * @param {string} mode - Current fallback mode
 * @param {boolean} isPrivate - Whether in private browsing
 * @returns {string}
 */
function getFallbackMessage(mode, isPrivate) {
    if (isPrivate && mode === FALLBACK_MODES.MEMORY) {
        return 'Private browsing detected: Your data will not be saved after closing this tab.';
    } else if (isPrivate && mode === FALLBACK_MODES.LOCALSTORAGE) {
        return 'Private browsing detected: Your data will be saved temporarily but cleared when you close the browser.';
    } else {
        return 'Using temporary storage. Your data will not persist across sessions.';
    }
}

/**
 * Show a warning to the user about fallback mode
 * @param {string} mode - Current fallback mode
 */
function showFallbackWarning(mode) {
    const message = getFallbackMessage(mode, true);

    // Emit event for UI to display
    EventBus.emit('storage:fallback_warning', {
        mode,
        message,
        actions: [
            { label: 'Continue with temporary storage', action: 'continue' },
            { label: 'How to enable full storage', action: 'learn_more' },
        ],
    });

    console.warn('[Fallback] ', message);
}

// ==========================================
// Public API
// ==========================================

export const FallbackBackend = {
    // Initialization
    init,
    detectPrivateBrowsing,

    // Mode info
    getMode,
    getStats,

    // Primitive operations (matching IndexedDBCore interface)
    put,
    get,
    getAll,
    clear,
    delete: deleteRecord,
    count,

    // Utility
    clearAll,
};

console.log('[FallbackBackend] Module loaded');
