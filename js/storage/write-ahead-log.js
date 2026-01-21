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
import { SafeMode } from '../security/safe-mode.js';

// ==========================================
// Constants
// ==========================================

const WAL_STORAGE_KEY = 'rhythm_chamber_wal';
const WAL_SEQUENCE_KEY = 'rhythm_chamber_wal_sequence';
const WAL_MAX_SIZE = 100; // Maximum number of entries in WAL
const WAL_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const WAL_REPLAY_DELAY_MS = 1000; // Delay before replay to avoid conflicts

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
    cleanupInterval: null  // Cleanup interval
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
 * @returns {boolean} True if saved successfully
 */
function saveWal() {
    try {
        // Filter out committed entries before saving (keep only pending/processing/failed)
        const activeEntries = walState.entries.filter(
            entry => entry.status !== WalStatus.COMMITTED
        );

        // Limit WAL size
        const entriesToSave = activeEntries
            .sort((a, b) => b.sequence - a.sequence)
            .slice(0, WAL_MAX_SIZE);

        localStorage.setItem(WAL_STORAGE_KEY, JSON.stringify(entriesToSave));
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
 * **Implications:**
 * - The returned Promise from this function will only settle if the page remains alive
 * - After a crash/reload, queued WAL entries are replayed but original callbacks are lost
 * - Callers should NOT rely on Promise completion for critical operations
 *
 * **Recommended alternatives:**
 * - Poll the persisted WAL state to check operation completion
 * - Use external persisted acknowledgement (e.g., operation result stored separately)
 * - Re-query operation state after page reload using operation IDs
 * - Design for idempotency to safely retry operations
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
 * @returns {Promise<any>} Promise that resolves when operation is processed (only if page remains alive)
 */
async function queueWrite(operation, args, priority = WalPriority.NORMAL) {
    // Block writes during WAL replay to prevent ordering conflicts
    if (walState.isReplaying) {
        console.warn(`[WAL] Write blocked during replay, waiting: ${operation}`);
        await waitForReplayComplete();
        console.log(`[WAL] Replay complete, proceeding with write: ${operation}`);
    }
    
    // Check if encryption is available
    if (SafeMode.canEncrypt()) {
        // Process immediately if encryption is available
        return executeOperation(operation, args);
    }

    // Queue for later processing if in Safe Mode
    return new Promise((resolve, reject) => {
        const entry = createWalEntry(operation, args, priority);
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
    });
}

/**
 * Wait for WAL replay to complete
 * @param {number} [timeoutMs=30000] - Maximum time to wait
 * @returns {Promise<void>} Resolves when replay is complete or timeout
 */
function waitForReplayComplete(timeoutMs = 30000) {
    if (!walState.isReplaying) {
        return Promise.resolve();
    }
    
    return new Promise((resolve) => {
        const startTime = Date.now();
        
        const checkInterval = setInterval(() => {
            if (!walState.isReplaying) {
                clearInterval(checkInterval);
                resolve();
            } else if (Date.now() - startTime > timeoutMs) {
                console.warn('[WAL] Timeout waiting for replay to complete, proceeding anyway');
                clearInterval(checkInterval);
                resolve(); // Continue anyway after timeout to prevent deadlock
            }
        }, 100);
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
                    if (SafeMode.canEncrypt()) {
                        const result = await executeOperation(entry.operation, entry.args);

                        entry.status = WalStatus.COMMITTED;
                        entry.error = null;

                        // Resolve promise if queued
                        if (entry.resolve) {
                            entry.resolve(result);
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

                    // Reject promise if too many attempts
                    if (entry.attempts >= 3) {
                        if (entry.reject) {
                            entry.reject(error);
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
            if (SafeMode.canEncrypt()) {
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

        if (hasPending && !SafeMode.canEncrypt()) {
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
        if (typeof window !== 'undefined' && window.EventBus?.emit) {
            window.EventBus.emit('wal:replay_complete', {
                timestamp: Date.now(),
                entriesReplayed: entriesReplayedCount
            });
        }
    }

        console.log(`[WAL] Replaying ${pendingEntries.length} entries`);

        // Reset PROCESSING entries to PENDING
        walState.entries.forEach(entry => {
            if (entry.status === WalStatus.PROCESSING) {
                entry.status = WalStatus.PENDING;
                entry.error = 'Reset after crash';
            }
        });

        // Process the WAL
        await processWal();

        console.log('[WAL] Crash recovery replay complete');

    } catch (error) {
        console.error('[WAL] Error replaying WAL:', error);
    } finally {
        walState.isReplaying = false;
        
        // Emit event for any blocked writes waiting on replay
        if (typeof window !== 'undefined' && window.EventBus?.emit) {
            window.EventBus.emit('wal:replay_complete', {
                timestamp: Date.now(),
                entriesReplayed: pendingEntries?.length || 0
            });
        }
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

    // Monitoring
    getWalStats,
    startMonitoring,
    stopMonitoring,

    // Maintenance
    cleanupWal,
    clearWal,

    // Constants
    WalStatus,
    WalPriority
};

// Named exports for direct imports
export { WalStatus, WalPriority };

export default WriteAheadLog;

console.log('[WAL] Write-Ahead Log module loaded');
