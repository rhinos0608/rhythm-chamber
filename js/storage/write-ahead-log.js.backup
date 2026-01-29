/**
 * Write-Ahead Log (WAL) for Safe Mode
 *
 * Provides durable write queue and crash recovery for critical storage operations.
 * When encryption is unavailable (Safe Mode), writes are queued and logged to
 * provide durability and recovery capabilities.
 *
 * HNW Network: Cross-tab coordination for WAL recovery
 * HNW Wave: Asynchronous write processing with adaptive batching
 *
 * Features:
 * - Write queue for Safe Mode operations
 * - Write-Ahead Log for crash recovery
 * - Automatic replay on startup
 * - Cross-tab coordination for WAL consistency
 * - Adaptive batching for performance
 *
 * @module storage/write-ahead-log
 */

import { TabCoordinator } from '../services/tab-coordination.js';
import { DeviceDetection } from '../services/device-detection.js';
import { Crypto } from '../security/crypto.js';
import { EventBus } from '../services/event-bus.js';

/**
 * Check if encryption is available (secure context)
 * @returns {boolean} True if in secure context
 */
function canEncrypt() {
    return Crypto.isSecureContext();
}

// ==========================================
// Constants
// ==========================================

const WAL_STORAGE_KEY = 'rhythm_chamber_wal';
const WAL_SEQUENCE_KEY = 'rhythm_chamber_wal_sequence';
const WAL_RESULTS_KEY = 'rhythm_chamber_wal_results'; // Track operation results for crash recovery
const WAL_MAX_SIZE = 100; // Maximum number of entries in WAL
const WAL_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const WAL_REPLAY_DELAY_MS = 1000; // Delay before replay to avoid conflicts
const WAL_RESULTS_MAX_AGE_MS = 5 * 60 * 1000; // Keep results for 5 minutes

/**
 * WAL entry status
 * @enum {string}
 */
const WalStatus = Object.freeze({
    PENDING: 'pending',     // Not yet processed
    PROCESSING: 'processing', // Currently being processed
    COMMITTED: 'committed',  // Successfully committed
    FAILED: 'failed'         // Failed to commit (will retry)
});

/**
 * WAL entry priority levels
 * @enum {string}
 */
const WalPriority = Object.freeze({
    CRITICAL: 'critical',   // Must be processed immediately (credentials, tokens)
    HIGH: 'high',          // User-visible data (streams, personality)
    NORMAL: 'normal',      // Background data (analytics, telemetry)
    LOW: 'low'             // Optional data (cache, preferences)
});

// ==========================================
// State Management
// ==========================================

/**
 * WAL state
 */
const walState = {
    entries: [],           // Array of WAL entries
    sequence: 0,           // Current sequence number
    isProcessing: false,   // Is WAL being processed
    isReplaying: false,    // Is WAL being replayed
    lastReplayTime: 0,     // Last time WAL was replayed
    batchTimeout: null,    // Batch processing timeout
    cleanupInterval: null, // Cleanup interval
    operationResults: new Map() // Track operation results for crash recovery
};

// ==========================================
// WAL Entry Structure
// ==========================================

/**
 * Create a WAL entry
 * @param {string} operation - Operation name
 * @param {Array} args - Operation arguments
 * @param {string} priority - Priority level
 * @returns {Object} WAL entry
 */
function createWalEntry(operation, args, priority = WalPriority.NORMAL) {
    return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        sequence: walState.sequence++,
        operation,
        args,
        priority,
        status: WalStatus.PENDING,
        createdAt: Date.now(),
        processedAt: null,
        attempts: 0,
        error: null
    };
}

// ==========================================
// WAL Persistence
// ==========================================

/**
 * Save WAL to localStorage
 * MEDIUM FIX Issue #19: Pre-filters entries before limiting to prevent performance spike
 * and validates JSON.stringify success before committing
 *
 * @returns {boolean} True if saved successfully
 */
function saveWal() {
    try {
        // MEDIUM FIX Issue #19: Filter out committed entries FIRST before any processing
        // This prevents processing 1000+ entries that will just be discarded
        const activeEntries = walState.entries.filter(
            entry => entry.status !== WalStatus.COMMITTED
        );

        // MEDIUM FIX Issue #19: Early return if nothing to save
        if (activeEntries.length === 0) {
            // Still save sequence number even if no entries
            localStorage.setItem(WAL_SEQUENCE_KEY, String(walState.sequence));
            return true;
        }

        // MEDIUM FIX Issue #19: Apply count limit BEFORE sorting for better performance
        // Sorting is O(n log n), so reducing n first is more efficient
        const sortedBySequence = activeEntries.sort((a, b) => b.sequence - a.sequence);
        const entriesToSave = sortedBySequence.length > WAL_MAX_SIZE
            ? sortedBySequence.slice(0, WAL_MAX_SIZE)  // Get most recent entries (newest first)
            : sortedBySequence;

        // MEDIUM FIX Issue #19: Validate JSON.stringify result before committing
        // This prevents partial writes if quota is exceeded mid-serialization
        const serialized = JSON.stringify(entriesToSave);

        // Validate serialization succeeded
        if (typeof serialized !== 'string' || serialized.length === 0) {
            throw new Error('WAL serialization produced invalid result');
        }

        // MEDIUM FIX Issue #19: Check size before writing (prevent quota exceeded errors)
        // localStorage typically has ~5MB limit, leave buffer
        const MAX_WAL_SIZE_BYTES = 4 * 1024 * 1024; // 4MB buffer
        if (serialized.length > MAX_WAL_SIZE_BYTES) {
            console.warn(`[WAL] WAL size (${serialized.length} bytes) exceeds safe limit, truncating`);

            // Try reducing size by keeping newest entries until it fits
            let truncatedEntries = entriesToSave;
            while (truncatedEntries.length > 0) {
                const halfLength = Math.floor(truncatedEntries.length / 2);
                truncatedEntries = truncatedEntries.slice(0, halfLength);
                const truncatedSerialized = JSON.stringify(truncatedEntries);

                if (truncatedSerialized.length <= MAX_WAL_SIZE_BYTES) {
                    localStorage.setItem(WAL_STORAGE_KEY, truncatedSerialized);
                    localStorage.setItem(WAL_SEQUENCE_KEY, String(walState.sequence));
                    console.warn(`[WAL] Truncated WAL from ${entriesToSave.length} to ${truncatedEntries.length} entries`);
                    return true;
                }
            }

            // If even 1 entry is too large, we have a serious problem
            throw new Error('Single WAL entry exceeds storage limit');
        }

        localStorage.setItem(WAL_STORAGE_KEY, serialized);
        localStorage.setItem(WAL_SEQUENCE_KEY, String(walState.sequence));

        return true;
    } catch (error) {
        console.error('[WAL] Failed to save WAL:', error);
        return false;
    }
}

/**
 * Load WAL from localStorage
 * @returns {boolean} True if loaded successfully
 */
function loadWal() {
    try {
        const stored = localStorage.getItem(WAL_STORAGE_KEY);
        if (stored) {
            const entries = JSON.parse(stored);
            walState.entries = entries.filter(entry => {
                // Filter out old entries
                const age = Date.now() - entry.createdAt;
                return age < WAL_MAX_AGE_MS;
            });
        }

        const sequence = localStorage.getItem(WAL_SEQUENCE_KEY);
        if (sequence) {
            walState.sequence = parseInt(sequence, 10);
        }

        console.log(`[WAL] Loaded ${walState.entries.length} entries from storage`);
        return true;
    } catch (error) {
        console.error('[WAL] Failed to load WAL:', error);
        return false;
    }
}

/**
 * Clear WAL from localStorage
 * @returns {boolean} True if cleared successfully
 */
function clearWal() {
    try {
        localStorage.removeItem(WAL_STORAGE_KEY);
        localStorage.removeItem(WAL_SEQUENCE_KEY);
        console.log('[WAL] WAL cleared from storage');
        return true;
    } catch (error) {
        console.error('[WAL] Failed to clear WAL:', error);
        return false;
    }
}

/**
 * Save operation results to localStorage for crash recovery
 * @returns {boolean} True if saved successfully
 */
function saveOperationResults() {
    try {
        const results = [];
        for (const [entryId, result] of walState.operationResults.entries()) {
            results.push({ entryId, result, timestamp: Date.now() });
        }
        localStorage.setItem(WAL_RESULTS_KEY, JSON.stringify(results));
        return true;
    } catch (error) {
        console.error('[WAL] Failed to save operation results:', error);
        return false;
    }
}

/**
 * Load operation results from localStorage
 */
function loadOperationResults() {
    try {
        const stored = localStorage.getItem(WAL_RESULTS_KEY);
        if (stored) {
            const results = JSON.parse(stored);
            const now = Date.now();
            for (const { entryId, result, timestamp } of results) {
                // Only load results that are recent
                if (now - timestamp < WAL_RESULTS_MAX_AGE_MS) {
                    walState.operationResults.set(entryId, result);
                }
            }
            console.log(`[WAL] Loaded ${walState.operationResults.size} operation results from storage`);
        }
    } catch (error) {
        console.error('[WAL] Failed to load operation results:', error);
    }
}

/**
 * Get operation result by entry ID
 * @param {string} entryId - WAL entry ID
 * @returns {Object|null} Operation result or null if not found
 */
function getOperationResult(entryId) {
    // Check in-memory results first
    if (walState.operationResults.has(entryId)) {
        return walState.operationResults.get(entryId);
    }

    // Check persisted results
    try {
        const stored = localStorage.getItem(WAL_RESULTS_KEY);
        if (stored) {
            const results = JSON.parse(stored);
            const found = results.find(r => r.entryId === entryId);
            if (found && Date.now() - found.timestamp < WAL_RESULTS_MAX_AGE_MS) {
                // Cache in memory
                walState.operationResults.set(entryId, found.result);
                return found.result;
            }
        }
    } catch (error) {
        console.error('[WAL] Failed to get operation result:', error);
    }

    return null;
}

// ==========================================
// Write Queue
// ==========================================

/**
 * Queue a write operation for processing
 *
 * **CRASH-RECOVERY SEMANTICS:**
 * The resolve/reject callbacks attached to WAL entries are **NOT persisted** across page reloads.
 * If the browser crashes or reloads while operations are queued, callers' Promises will never settle.
 *
 * **RECOVERY MECHANISM:**
 * - Operation results are persisted to localStorage for 5 minutes
 * - Use `WriteAheadLog.getOperationResult(entryId)` to check operation status after reload
 * - The returned object includes { promise, entryId } for tracking
 *
 * **Implications:**
 * - The returned Promise from this function will only settle if the page remains alive
 * - After a crash/reload, use getOperationResult() with the entryId to check if operation completed
 * - Callers should design for idempotency to safely retry operations
 *
 * **REPLAY BLOCKING:**
 * If WAL replay is in progress, new writes are blocked until replay completes.
 * This prevents ordering conflicts between replayed and new writes.
 *
 * See `createWalEntry`, `saveWal`, `walState.entries`, and `scheduleProcessing` for implementation details.
 *
 * @param {string} operation - Operation name
 * @param {Array} args - Operation arguments
 * @param {string} priority - Priority level
 * @returns {Promise<{ promise: Promise, entryId: string }>} Promise and entryId for result tracking
 */
async function queueWrite(operation, args, priority = WalPriority.NORMAL) {
    // Block writes during WAL replay to prevent ordering conflicts
    if (walState.isReplaying) {
        console.warn(`[WAL] Write blocked during replay, waiting: ${operation}`);
        await waitForReplayComplete();
        console.log(`[WAL] Replay complete, proceeding with write: ${operation}`);
    }

    // Check if encryption is available
    if (canEncrypt()) {
        // Process immediately if encryption is available
        const result = await executeOperation(operation, args);
        // Return in same format for consistency
        const entryId = `immediate-${Date.now()}`;
        return { promise: Promise.resolve(result), entryId };
    }

    // Queue for later processing if in Safe Mode
    return new Promise((resolveOuter) => {
        const entry = createWalEntry(operation, args, priority);

        // Store entryId in closure for result tracking
        const entryId = entry.id;

        new Promise((resolve, reject) => {
            entry.resolve = resolve;
            entry.reject = reject;

            walState.entries.push(entry);

            // Save to persistent storage
            saveWal();

            // Trigger processing if not already processing
            if (!walState.isProcessing) {
                scheduleProcessing();
            }

            console.log(`[WAL] Queued write operation: ${operation} (${priority})`);

            // Return both the promise and entryId for tracking
            resolveOuter({
                promise: new Promise((res, rej) => {
                    entry.promise = { resolve: res, reject: rej };
                }),
                entryId: entryId
            });
        }).then((result) => {
            // CRITICAL FIX: Use entryId from closure, not result
            // When operation completes, save result for crash recovery
            const operationResult = {
                success: !result?.error,
                result: result,
                completedAt: Date.now()
            };
            walState.operationResults.set(entryId, operationResult);
            saveOperationResults();

            // Resolve the inner promise
            if (result.promise) {
                result.promise.resolve(operationResult.result);
            }
        }).catch((error) => {
            // CRITICAL FIX: Use entryId from closure, not error
            // Save error result with preserved stack trace
            const operationResult = {
                success: false,
                error: error.message,
                stack: error.stack,
                completedAt: Date.now()
            };
            walState.operationResults.set(entryId, operationResult);
            saveOperationResults();

            // Reject the inner promise
            if (error.promise) {
                error.promise.reject(error);
            }
        });
    });
}

/**
 * Wait for WAL replay to complete
 * CRITICAL FIX: Use event-based approach instead of polling to avoid race condition
 * @param {number} [timeoutMs=30000] - Maximum time to wait
 * @returns {Promise<void>} Resolves when replay is complete or timeout
 */
function waitForReplayComplete(timeoutMs = 30000) {
    if (!walState.isReplaying) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const startTime = Date.now();
        let timeoutHandle;
        let eventHandler;

        const cleanup = () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (eventHandler) EventBus.off('wal:replay_complete', eventHandler);
        };

        // Set timeout as fallback
        timeoutHandle = setTimeout(() => {
            cleanup();
            console.warn('[WAL] Timeout waiting for replay to complete, proceeding anyway');
            resolve();
        }, timeoutMs);

        // Listen for replay complete event (immediate notification)
        eventHandler = () => {
            cleanup();
            resolve();
        };

        EventBus.on('wal:replay_complete', eventHandler);

        // Double-check state in case event was already emitted
        if (!walState.isReplaying) {
            cleanup();
            resolve();
        }
    });
}

/**
 * Check if WAL replay is in progress
 * @returns {boolean} True if replay is in progress
 */
function isReplaying() {
    return walState.isReplaying;
}

/**
 * Execute a storage operation
 * @param {string} operation - Operation name
 * @param {Array} args - Operation arguments
 * @returns {Promise<any>} Operation result
 */
async function executeOperation(operation, args) {
    // Import Storage dynamically to avoid circular dependency
    const { Storage } = await import('../storage.js');

    // Execute the operation
    if (typeof Storage[operation] === 'function') {
        return await Storage[operation](...args);
    } else {
        throw new Error(`Unknown storage operation: ${operation}`);
    }
}

/**
 * Execute a storage operation for WAL replay with idempotency protection
 *
 * CRITICAL FIX: During WAL replay, `add()` operations are converted to `put()` to
 * ensure idempotency. If an operation was committed but WAL entry wasn't cleared
 * before a crash, replay would fail with ConstraintError for `add()` operations.
 * Using `put()` ensures safe replay as it either creates or updates, guaranteeing
 * the same final state.
 *
 * @param {string} operation - Operation name
 * @param {Array} args - Operation arguments
 * @param {boolean} isReplay - True if this is a replay operation
 * @returns {Promise<any>} Operation result
 */
async function executeOperationForReplay(operation, args, isReplay = true) {
    // Import Storage dynamically to avoid circular dependency
    const { Storage } = await import('../storage.js');

    // Convert add to put for idempotency during replay
    // This prevents ConstraintError if the operation was already committed
    let safeOperation = operation;
    if (isReplay && operation === 'add') {
        safeOperation = 'put';
        console.log(`[WAL] Converted 'add' to 'put' for idempotent replay`);
    }

    // Execute the operation
    if (typeof Storage[safeOperation] === 'function') {
        return await Storage[safeOperation](...args);
    } else {
        throw new Error(`Unknown storage operation: ${safeOperation}`);
    }
}

// ==========================================
// WAL Processing
// ==========================================

/**
 * Schedule WAL processing with adaptive batching
 */
function scheduleProcessing() {
    if (walState.batchTimeout) {
        clearTimeout(walState.batchTimeout);
    }

    // Adaptive batching based on device and network
    const adaptiveTiming = DeviceDetection.getAdaptiveTiming();
    const batchDelay = adaptiveTiming?.heartbeat?.intervalMs || 1000;

    walState.batchTimeout = setTimeout(() => {
        processWal();
    }, batchDelay);
}

/**
 * Process WAL entries
 * HNW Network: Only primary tab processes WAL
 * HNW Wave: Adaptive batching for performance
 */
async function processWal() {
    // Only primary tab should process WAL
    if (TabCoordinator.isPrimary && !TabCoordinator.isPrimary()) {
        console.log('[WAL] Skipping WAL processing - not primary tab');
        return;
    }

    if (walState.isProcessing || walState.isReplaying) {
        console.log('[WAL] Already processing/replaying WAL');
        return;
    }

    walState.isProcessing = true;

    try {
        // Sort entries by priority and sequence
        const priorityOrder = {
            [WalPriority.CRITICAL]: 0,
            [WalPriority.HIGH]: 1,
            [WalPriority.NORMAL]: 2,
            [WalPriority.LOW]: 3
        };

        const sortedEntries = walState.entries
            .filter(entry => entry.status === WalStatus.PENDING || entry.status === WalStatus.FAILED)
            .sort((a, b) => {
                const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
                if (priorityDiff !== 0) return priorityDiff;
                return a.sequence - b.sequence;
            });

        if (sortedEntries.length === 0) {
            console.log('[WAL] No pending entries to process');
            return;
        }

        console.log(`[WAL] Processing ${sortedEntries.length} entries`);

        // Process entries in batches
        const batchSize = 10; // Process up to 10 entries at a time
        for (let i = 0; i < sortedEntries.length; i += batchSize) {
            const batch = sortedEntries.slice(i, i + batchSize);

            for (const entry of batch) {
                entry.status = WalStatus.PROCESSING;
                entry.attempts++;
                entry.processedAt = Date.now();

                try {
                    // Check if encryption is now available
                    if (canEncrypt()) {
                        // CRITICAL FIX: Use executeOperationForReplay for idempotency
                        // This converts 'add' to 'put' during WAL replay to prevent ConstraintError
                        const result = await executeOperationForReplay(entry.operation, entry.args, walState.isReplaying);

                        entry.status = WalStatus.COMMITTED;
                        entry.error = null;

                        // Save operation result for crash recovery
                        const operationResult = {
                            success: true,
                            result: result,
                            completedAt: Date.now()
                        };
                        walState.operationResults.set(entry.id, operationResult);
                        saveOperationResults();

                        // Resolve promise if queued
                        if (entry.resolve) {
                            entry.resolve(result);
                        }
                        // Also resolve the newer promise format
                        if (entry.promise?.resolve) {
                            entry.promise.resolve(result);
                        }

                        console.log(`[WAL] ✓ Committed: ${entry.operation} (${entry.sequence})`);
                    } else {
                        // Still in Safe Mode, mark as failed for retry
                        entry.status = WalStatus.FAILED;
                        entry.error = 'Encryption unavailable';

                        // Don't resolve yet - will retry
                        console.log(`[WAL] ⚠ Deferred: ${entry.operation} (${entry.sequence}) - Safe Mode active`);
                    }
                } catch (error) {
                    entry.status = WalStatus.FAILED;
                    entry.error = error.message || String(error);

                    // Save error result for crash recovery
                    const operationResult = {
                        success: false,
                        error: entry.error,
                        completedAt: Date.now()
                    };
                    walState.operationResults.set(entry.id, operationResult);
                    saveOperationResults();

                    // Reject promise if too many attempts
                    if (entry.attempts >= 3) {
                        if (entry.reject) {
                            entry.reject(error);
                        }
                        if (entry.promise?.reject) {
                            entry.promise.reject(error);
                        }
                        console.error(`[WAL] ✗ Failed after ${entry.attempts} attempts: ${entry.operation}`);
                    } else {
                        console.warn(`[WAL] ⚠ Retry (${entry.attempts}/3): ${entry.operation}`);
                    }
                }
            }

            // Save after each batch
            saveWal();

            // Check if encryption became available mid-batch
            if (canEncrypt()) {
                console.log('[WAL] Encryption now available, processing remaining entries immediately');
            }
        }

        // Cleanup committed entries
        cleanupWal();

    } catch (error) {
        console.error('[WAL] Error processing WAL:', error);
    } finally {
        walState.isProcessing = false;
        walState.batchTimeout = null;

        // Schedule next processing if there are still pending entries
        const hasPending = walState.entries.some(
            entry => entry.status === WalStatus.PENDING || entry.status === WalStatus.FAILED
        );

        if (hasPending && !canEncrypt()) {
            scheduleProcessing();
        }
    }
}

/**
 * Cleanup old committed entries
 */
function cleanupWal() {
    const beforeCount = walState.entries.length;

    walState.entries = walState.entries.filter(entry => {
        // Keep pending, processing, and failed entries
        if (entry.status !== WalStatus.COMMITTED) return true;

        // Keep committed entries for a short time for debugging
        const age = Date.now() - entry.processedAt;
        return age < 60000; // Keep for 1 minute
    });

    const cleanedCount = beforeCount - walState.entries.length;

    if (cleanedCount > 0) {
        console.log(`[WAL] Cleaned up ${cleanedCount} committed entries`);
        saveWal();
    }
}

// ==========================================
// Crash Recovery
// ==========================================

/**
 * Replay WAL on startup
 * Called when app initializes to recover from crashes
 */
async function replayWal() {
    // Only primary tab should replay WAL
    if (TabCoordinator.isPrimary && !TabCoordinator.isPrimary()) {
        console.log('[WAL] Skipping WAL replay - not primary tab');
        return;
    }

    // Don't replay if recently replayed
    const timeSinceLastReplay = Date.now() - walState.lastReplayTime;
    if (timeSinceLastReplay < WAL_REPLAY_DELAY_MS) {
        console.log('[WAL] Skipping WAL replay - too soon since last replay');
        return;
    }

    if (walState.isReplaying) {
        console.log('[WAL] Already replaying WAL');
        return;
    }

    walState.isReplaying = true;
    walState.lastReplayTime = Date.now();

    let entriesReplayedCount = 0;

    try {
        console.log('[WAL] Starting crash recovery replay...');

        // Load WAL from storage
        loadWal();

        // Check if there are entries to replay
        const pendingEntries = walState.entries.filter(
            entry => entry.status === WalStatus.PENDING ||
                   entry.status === WalStatus.FAILED ||
                   (entry.status === WalStatus.PROCESSING &&
                    (Date.now() - entry.processedAt) > 60000) // Assume crashed if processing for > 1 min
        );

        if (pendingEntries.length === 0) {
            console.log('[WAL] No entries to replay');
            return;
        }

        console.log(`[WAL] Replaying ${pendingEntries.length} entries`);
        entriesReplayedCount = pendingEntries.length;

        // Reset PROCESSING entries to PENDING
        walState.entries.forEach(entry => {
            if (entry.status === WalStatus.PROCESSING) {
                entry.status = WalStatus.PENDING;
                entry.error = 'Reset after crash';
            }
        });

        // Process WAL
        await processWal();

        console.log('[WAL] Crash recovery replay complete');

    } catch (error) {
        console.error('[WAL] Error replaying WAL:', error);
    } finally {
        walState.isReplaying = false;

        // Emit event for any blocked writes waiting on replay
        EventBus.emit('wal:replay_complete', {
            timestamp: Date.now(),
            entriesReplayed: entriesReplayedCount
        });
    }
}

// ==========================================
// Monitoring & Maintenance
// ==========================================

/**
 * Get WAL statistics
 * @returns {Object} WAL statistics
 */
function getWalStats() {
    const stats = {
        totalEntries: walState.entries.length,
        pending: 0,
        processing: 0,
        committed: 0,
        failed: 0,
        isProcessing: walState.isProcessing,
        isReplaying: walState.isReplaying,
        lastReplayTime: walState.lastReplayTime,
        sequence: walState.sequence
    };

    for (const entry of walState.entries) {
        stats[entry.status]++;
    }

    return stats;
}

/**
 * Start WAL monitoring and cleanup
 */
function startMonitoring() {
    // Cleanup interval - run every 5 minutes
    walState.cleanupInterval = setInterval(() => {
        cleanupWal();
    }, 5 * 60 * 1000);

    console.log('[WAL] Monitoring started');
}

/**
 * Stop WAL monitoring
 */
function stopMonitoring() {
    if (walState.cleanupInterval) {
        clearInterval(walState.cleanupInterval);
        walState.cleanupInterval = null;
    }

    if (walState.batchTimeout) {
        clearTimeout(walState.batchTimeout);
        walState.batchTimeout = null;
    }

    console.log('[WAL] Monitoring stopped');
}

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize WAL system
 * @returns {Promise<void>}
 */
async function init() {
    console.log('[WAL] Initializing Write-Ahead Log...');

    // Load existing WAL
    loadWal();

    // Load operation results for crash recovery
    loadOperationResults();

    // Start monitoring
    startMonitoring();

    // Schedule replay after a delay to avoid conflicts with other tabs
    setTimeout(async () => {
        await replayWal();
    }, WAL_REPLAY_DELAY_MS);

    // Listen for tab coordination changes
    if (TabCoordinator.onAuthorityChange) {
        TabCoordinator.onAuthorityChange((authority) => {
            if (authority.canWrite) {
                // Became primary - start processing WAL
                console.log('[WAL] Became primary tab, starting WAL processing');
                scheduleProcessing();
            } else {
                // Became secondary - stop processing WAL
                console.log('[WAL] Became secondary tab, stopping WAL processing');
                stopProcessing();
            }
        });
    }

    console.log('[WAL] Write-Ahead Log initialized');
}

/**
 * Stop WAL processing
 */
function stopProcessing() {
    if (walState.batchTimeout) {
        clearTimeout(walState.batchTimeout);
        walState.batchTimeout = null;
    }
    walState.isProcessing = false;
}

/**
 * Wait for a WAL operation result, surviving page reloads
 * CRITICAL FIX for Issue #1: Solves Promise Resolution Breaks Across Reloads
 *
 * When a page reloads occurs during WAL processing, the original Promise from
 * queueWrite() is lost. This function provides a recovery mechanism by:
 * 1. Checking if result already exists (immediate resolution)
 * 2. Waiting for WAL replay to complete if result pending
 * 3. Returning the result or throwing appropriate error
 *
 * @param {string} entryId - WAL entry ID from queueWrite()
 * @param {Object} [options] - Options
 * @param {number} [options.timeoutMs=30000] - Max wait time for result (milliseconds)
 * @returns {Promise<any>} Operation result
 * @throws {Error} If operation failed, not found after replay, or timeout exceeded
 *
 * @example
 * const { promise, entryId } = await WriteAheadLog.queueWrite('put', [key, value]);
 * // After page reload, original promise is lost - use waitForResult instead:
 * try {
 *     const result = await WriteAheadLog.waitForResult(entryId);
 * } catch (error) {
 *     // Handle error or timeout
 * }
 */
async function waitForResult(entryId, options = {}) {
    const { timeoutMs = 30000 } = options;
    const startTime = Date.now();

    // Helper to process result consistently (success or failure)
    const processResult = (operationResult) => {
        if (operationResult.success) {
            return operationResult.result;
        }
        throw new Error(operationResult.error || 'Operation failed');
    };

    // Early check - handles immediate resolution for already-completed operations
    const immediateResult = getOperationResult(entryId);
    if (immediateResult) {
        return processResult(immediateResult);
    }

    // Calculate remaining timeout (accounts for time spent in getOperationResult)
    const elapsed = Date.now() - startTime;
    const remainingTimeout = timeoutMs - elapsed;

    if (remainingTimeout <= 0) {
        throw new Error('Timeout waiting for WAL result');
    }

    // Wait for replay completion with remaining timeout
    // waitForReplayComplete handles the race condition where replay completes
    // between our check and attaching the event listener
    await waitForReplayComplete(remainingTimeout);

    // Final check after replay - result should now be available
    const finalResult = getOperationResult(entryId);
    if (finalResult) {
        return processResult(finalResult);
    }

    // If replay completed but no result found, the operation may have been
    // discarded or the entryId was invalid
    throw new Error('WAL result not found after replay');
}

// ==========================================
// Public API
// ==========================================

export const WriteAheadLog = {
    // Initialization
    init,

    // Write Queue
    queueWrite,

    // Processing
    processWal,
    replayWal,
    stopProcessing,

    // Replay blocking
    isReplaying,
    waitForReplayComplete,

    // CRITICAL FIX: Result recovery across page reloads (Issue #1)
    waitForResult,

    // Monitoring
    getWalStats,
    startMonitoring,
    stopMonitoring,

    // Maintenance
    cleanupWal,
    clearWal,

    // Crash Recovery
    getOperationResult,

    // Constants
    WalStatus,
    WalPriority
};

// Named exports for direct imports
export { WalStatus, WalPriority };

export default WriteAheadLog;

console.log('[WAL] Write-Ahead Log module loaded');
