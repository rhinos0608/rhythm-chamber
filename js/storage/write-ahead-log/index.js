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
 * **REFACTORED**: This file is now a facade that composes focused modules:
 * - config.js: Constants and configuration
 * - state.js: State management
 * - entry-factory.js: Entry creation
 * - persistence.js: localStorage operations
 * - operation-executor.js: Storage operation execution
 * - batch-processor.js: Batch processing logic
 * - recovery.js: Crash recovery and replay
 * - monitoring.js: Statistics and maintenance
 * - write-queue.js: Queue management and blocking
 * - initialization.js: Setup and lifecycle
 *
 * @module storage/write-ahead-log
 */

// Import all modules and constants
import { init } from './initialization.js';
import { queueWrite, waitForReplayComplete, isReplaying, waitForResult } from './write-queue.js';
import { processWal, stopProcessing, cleanupWal } from './batch-processor.js';
import { replayWal } from './recovery.js';
import { getWalStats, startMonitoring, stopMonitoring } from './monitoring.js';
import { clearWal, getOperationResult } from './persistence.js';
import { WalStatus, WalPriority } from './config.js';

/**
 * WriteAheadLog Public API
 * Facade that provides a clean interface to the WAL system
 */
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

// Re-export constants for direct imports
export { WalStatus, WalPriority };

export default WriteAheadLog;

console.log('[WAL] Write-Ahead Log module loaded');
