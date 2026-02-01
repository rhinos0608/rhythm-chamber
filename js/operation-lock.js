/**
 * Operation Lock System (Legacy Wrapper)
 *
 * ⚠️ DEPRECATED: This file now re-exports from js/utils/concurrency/lock-manager.js
 * The lock management logic has been moved to the utils/concurrency module
 * as part of the Phase 1 Foundation refactoring (see PLAN.md).
 *
 * New code should import directly from:
 *   import { LockManager } from './utils/concurrency/lock-manager.js';
 *
 * This wrapper is maintained for backward compatibility with existing imports.
 *
 * ═══════════════════════════════════════════════════════════════
 * USAGE CONTRACT (unchanged)
 * ═══════════════════════════════════════════════════════════════
 *
 * PATTERN 1 - Guard (quick check, abort if locked):
 *   Use when you want to give immediate UI feedback that an operation
 *   is already running and the user should wait.
 *
 *   if (OperationLock.isLocked('file_processing')) {
 *       showToast('Upload already in progress, please wait');
 *       return; // Abort without trying to acquire
 *   }
 *
 * PATTERN 2 - Acquire (blocking, exclusive access):
 *   Use when you NEED exclusive access and the operation cannot proceed
 *   without it. Always release in finally block.
 *
 *   const lockId = await OperationLock.acquire('file_processing');
 *   try {
 *       await doDestructiveWork();
 *   } finally {
 *       OperationLock.release('file_processing', lockId);
 *   }
 *
 * PATTERN 3 - Acquire with Timeout (for long operations):
 *   Use when you want to avoid indefinite blocking.
 *
 *   const lockId = await OperationLock.acquireWithTimeout('embedding_generation', 60000);
 *   try {
 *       await longRunningOperation();
 *   } finally {
 *       OperationLock.release('embedding_generation', lockId);
 *   }
 *
 * WHEN TO USE WHICH:
 * - Pattern 1: UI event handlers (button clicks, drag-drop)
 * - Pattern 2: Critical sections with data mutations
 * - Pattern 3: Operations that might take a long time
 *
 * ⚠️ NEVER: Use isLocked() as a guard then immediately acquire()
 *    This creates a race condition between check and acquire.
 *    Either use pure guard pattern OR pure acquire pattern.
 *
 * ═══════════════════════════════════════════════════════════════
 */

// Re-export everything from the new location
export {
    LockManager as OperationLock,
    LockAcquisitionError,
    LockTimeoutError,
    LockReleaseError,
    LockForceReleaseError,
    DeadlockError,
    OPERATIONS,
} from './utils/concurrency/lock-manager.js';

// Re-export default as OperationLock
import { LockManager } from './utils/concurrency/lock-manager.js';
export default LockManager;

console.log(
    '[OperationLock] Legacy wrapper - re-exporting from js/utils/concurrency/lock-manager.js'
);
