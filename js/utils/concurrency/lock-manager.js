/**
 * Lock Manager - Operation-Level Mutual Exclusion
 *
 * Provides mutual exclusion for destructive operations to prevent
 * concurrent state corruption. Part of HNW Hierarchy fix.
 *
 * ═══════════════════════════════════════════════════════════════
 * USAGE CONTRACT
 * ═══════════════════════════════════════════════════════════════
 *
 * PATTERN 1 - Guard (quick check, abort if locked):
 *   Use when you want to give immediate UI feedback that an operation
 *   is already running and the user should wait.
 *
 *   if (LockManager.isLocked('file_processing')) {
 *       showToast('Upload already in progress, please wait');
 *       return; // Abort without trying to acquire
 *   }
 *
 * PATTERN 2 - Acquire (blocking, exclusive access):
 *   Use when you NEED exclusive access and the operation cannot proceed
 *   without it. Always release in finally block.
 *
 *   const lockId = await LockManager.acquire('file_processing');
 *   try {
 *       await doDestructiveWork();
 *   } finally {
 *       LockManager.release('file_processing', lockId);
 *   }
 *
 * PATTERN 3 - Acquire with Timeout (for long operations):
 *   Use when you want to avoid indefinite blocking.
 *
 *   const lockId = await LockManager.acquireWithTimeout('embedding_generation', 60000);
 *   try {
 *       await longRunningOperation();
 *   } finally {
 *       LockManager.release('embedding_generation', lockId);
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

// Define error classes
export class LockAcquisitionError extends Error {
    constructor(operationName, blockedBy) {
        super(
            `Cannot acquire lock for '${operationName}'. Blocked by: ${blockedBy?.join(', ') || 'unknown'}`
        );
        this.name = 'LockAcquisitionError';
        this.code = 'LOCK_ACQUISITION_FAILED';
    }
}

export class LockTimeoutError extends Error {
    constructor(operationName, timeoutMs) {
        super(`Timeout acquiring lock for '${operationName}' after ${timeoutMs}ms`);
        this.name = 'LockTimeoutError';
        this.code = 'LOCK_TIMEOUT';
    }
}

export class LockReleaseError extends Error {
    constructor(operationName, providedOwnerId, actualOwnerId) {
        super(
            `Cannot release lock for '${operationName}'. Provided owner: ${providedOwnerId}, Actual owner: ${actualOwnerId || 'none'}`
        );
        this.name = 'LockReleaseError';
        this.code = 'LOCK_RELEASE_FAILED';
    }
}

export class LockForceReleaseError extends Error {
    constructor(operationName) {
        super(`Lock for '${operationName}' was force-released`);
        this.name = 'LockForceReleaseError';
        this.code = 'LOCK_FORCE_RELEASED';
    }
}

export class DeadlockError extends Error {
    constructor(operationName, cycle) {
        super(`Deadlock detected for '${operationName}': ${cycle.join(' -> ')}`);
        this.name = 'DeadlockError';
        this.code = 'DEADLOCK_DETECTED';
        this.cycle = cycle;
    }
}

// Named operations that can be locked
export const OPERATIONS = {
    FILE_PROCESSING: 'file_processing',
    EMBEDDING_GENERATION: 'embedding_generation',
    PRIVACY_CLEAR: 'privacy_clear',
    SPOTIFY_FETCH: 'spotify_fetch',
    CHAT_SAVE: 'chat_save',
};

// Conflict matrix: which operations cannot run concurrently
const CONFLICT_MATRIX = {
    // UPDATED: file_processing and embedding_generation no longer block each other
    // RAG uses a snapshot of streams at start; dataHash staleness check handles new uploads
    [OPERATIONS.FILE_PROCESSING]: [OPERATIONS.PRIVACY_CLEAR],
    [OPERATIONS.EMBEDDING_GENERATION]: [OPERATIONS.PRIVACY_CLEAR],
    [OPERATIONS.PRIVACY_CLEAR]: [
        OPERATIONS.FILE_PROCESSING,
        OPERATIONS.EMBEDDING_GENERATION,
        OPERATIONS.CHAT_SAVE,
    ],
    [OPERATIONS.SPOTIFY_FETCH]: [], // Spotify can run alongside others
    [OPERATIONS.CHAT_SAVE]: [OPERATIONS.PRIVACY_CLEAR],
};

// Current locks state
const activeLocks = new Map(); // operationName -> { ownerId, acquiredAt }
let lockIdCounter = 0;

// HNW Hierarchy: Pending lock requests for deadlock detection
const pendingRequests = new Map(); // operationName -> Set<waitingFor>

/**
 * Build a dependency graph from pending requests and current locks
 * @returns {Object} Graph where keys are operations and values are arrays of operations they're waiting for
 */
function buildLockDependencyGraph() {
    const graph = {};

    // Add pending request dependencies
    for (const [op, waitingFor] of pendingRequests) {
        graph[op] = [...waitingFor];
    }

    // Add active lock holders (they depend on completing their work)
    for (const [op] of activeLocks) {
        if (!graph[op]) {
            graph[op] = [];
        }
    }

    return graph;
}

/**
 * Detect if there's a cycle in the dependency graph starting from a given node
 * @param {Object} graph - Dependency graph
 * @param {string} start - Starting node
 * @param {Set} [visited] - Visited nodes
 * @param {Array} [path] - Current path being explored
 * @returns {string[]|null} The cycle if found, null otherwise
 */
function detectCycle(graph, start, visited = new Set(), path = []) {
    if (path.includes(start)) {
        // Found a cycle - return the cycle portion
        const cycleStart = path.indexOf(start);
        return [...path.slice(cycleStart), start];
    }

    if (visited.has(start)) {
        return null; // Already explored this node, no cycle through here
    }

    visited.add(start);
    path.push(start);

    const neighbors = graph[start] || [];
    for (const neighbor of neighbors) {
        // Check if the neighbor is currently holding a lock
        if (activeLocks.has(neighbor)) {
            const cycle = detectCycle(graph, neighbor, visited, path);
            if (cycle) return cycle;
        }
    }

    path.pop();
    return null;
}

/**
 * Generate a unique lock owner ID
 */
function generateOwnerId() {
    return `lock_${Date.now()}_${++lockIdCounter}`;
}

/**
 * Check if an operation can be acquired (no conflicting locks)
 * @param {string} operationName - The operation to check
 * @returns {{ canAcquire: boolean, blockedBy?: string[] }}
 */
function canAcquire(operationName) {
    const conflicts = CONFLICT_MATRIX[operationName] || [];
    const blockedBy = [];

    for (const conflict of conflicts) {
        if (activeLocks.has(conflict)) {
            blockedBy.push(conflict);
        }
    }

    return {
        canAcquire: blockedBy.length === 0,
        blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
    };
}

/**
 * Acquire a lock for an operation
 * @param {string} operationName - The operation to lock
 * @returns {Promise<string>} Lock owner ID (needed for release)
 * @throws {LockAcquisitionError} If operation is blocked by conflicting locks
 */
async function acquire(operationName) {
    const { canAcquire: allowed, blockedBy } = canAcquire(operationName);

    if (!allowed) {
        console.warn(
            `[LockManager] Operation '${operationName}' blocked by: ${blockedBy.join(', ')}`
        );
        throw new LockAcquisitionError(operationName, blockedBy);
    }

    const ownerId = generateOwnerId();
    activeLocks.set(operationName, {
        ownerId,
        acquiredAt: Date.now(),
    });

    console.log(`[LockManager] Acquired '${operationName}' (${ownerId})`);
    dispatchLockEvent('acquired', operationName);

    return ownerId;
}

/**
 * Acquire a lock with timeout
 * @param {string} operationName - The operation to lock
 * @param {number} timeoutMs - Maximum wait time in milliseconds
 * @returns {Promise<string>} Lock owner ID
 * @throws {LockTimeoutError} If timeout is reached
 * @throws {LockAcquisitionError} If operation is blocked
 */
async function acquireWithTimeout(operationName, timeoutMs = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            return await acquire(operationName);
        } catch (error) {
            // If it's not a LockAcquisitionError, re-throw it
            if (!(error instanceof LockAcquisitionError)) {
                throw error;
            }

            // If timeout is reached, throw timeout error
            if (Date.now() - startTime >= timeoutMs) {
                console.warn(
                    `[LockManager] Timeout acquiring '${operationName}' after ${timeoutMs}ms`
                );
                throw new LockTimeoutError(operationName, timeoutMs);
            }

            // Wait 100ms before retry
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    throw new LockTimeoutError(operationName, timeoutMs);
}

/**
 * Acquire a lock with deadlock detection
 *
 * HNW Hierarchy: This function tracks pending requests and detects cycles
 * in the dependency graph to prevent indefinite hangs from circular dependencies.
 *
 * @param {string} operationName - The operation to lock
 * @param {number} timeoutMs - Maximum wait time in milliseconds
 * @returns {Promise<string>} Lock owner ID
 * @throws {DeadlockError} If circular dependency detected
 * @throws {LockTimeoutError} If timeout is reached
 * @throws {LockAcquisitionError} If operation is blocked
 */
async function acquireWithDeadlockDetection(operationName, timeoutMs = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            // Clean up any previous pending request
            pendingRequests.delete(operationName);
            return await acquire(operationName);
        } catch (error) {
            // If it's not a LockAcquisitionError, re-throw it
            if (!(error instanceof LockAcquisitionError)) {
                pendingRequests.delete(operationName);
                throw error;
            }

            // Track what we're waiting for (for deadlock detection)
            const { blockedBy } = canAcquire(operationName);
            if (blockedBy && blockedBy.length > 0) {
                pendingRequests.set(operationName, new Set(blockedBy));

                // Check for deadlock (circular dependency)
                const graph = buildLockDependencyGraph();
                const cycle = detectCycle(graph, operationName);

                if (cycle) {
                    pendingRequests.delete(operationName);
                    console.error(`[LockManager] Deadlock detected: ${cycle.join(' → ')}`);
                    throw new DeadlockError(operationName, cycle);
                }
            }

            // If timeout is reached, throw timeout error
            if (Date.now() - startTime >= timeoutMs) {
                pendingRequests.delete(operationName);
                console.warn(
                    `[LockManager] Timeout acquiring '${operationName}' after ${timeoutMs}ms`
                );
                throw new LockTimeoutError(operationName, timeoutMs);
            }

            // Wait 100ms before retry
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    pendingRequests.delete(operationName);
    throw new LockTimeoutError(operationName, timeoutMs);
}

/**
 * Release a lock
 * @param {string} operationName - The operation to unlock
 * @param {string} ownerId - The owner ID from acquire()
 * @returns {boolean} True if released, false if lock didn't match
 * @throws {LockReleaseError} If release fails
 */
function release(operationName, ownerId) {
    const lock = activeLocks.get(operationName);

    if (!lock) {
        const error = new LockReleaseError(operationName, ownerId, null);
        console.warn(`[LockManager] ${error.message}`);
        throw error;
    }

    if (lock.ownerId !== ownerId) {
        const error = new LockReleaseError(operationName, ownerId, lock.ownerId);
        console.warn(`[LockManager] ${error.message}`);
        throw error;
    }

    const duration = Date.now() - lock.acquiredAt;
    activeLocks.delete(operationName);

    console.log(`[LockManager] Released '${operationName}' (held for ${duration}ms)`);
    dispatchLockEvent('released', operationName);

    return true;
}

/**
 * Check if an operation is currently locked
 * @param {string} operationName - The operation to check
 * @returns {boolean}
 */
function isLocked(operationName) {
    return activeLocks.has(operationName);
}

/**
 * Get all currently active locks
 * @returns {string[]} Array of operation names that are locked
 */
function getActiveLocks() {
    return [...activeLocks.keys()];
}

/**
 * Get detailed lock status for diagnostics
 * @param {string} operationName - The operation to check
 * @returns {{ canAcquire: boolean, blockedBy?: string[], activeLocks: string[], timestamp: number }}
 */
function getLockStatus(operationName) {
    const check = canAcquire(operationName);
    const active = getActiveLocks();

    return {
        canAcquire: check.canAcquire,
        blockedBy: check.blockedBy,
        activeLocks: active,
        timestamp: Date.now(),
    };
}

/**
 * Get lock information including duration held
 * @returns {Array<{operation: string, heldFor: number, ownerId: string}>}
 */
function getLockDetails() {
    const now = Date.now();
    const details = [];

    for (const [operation, lock] of activeLocks.entries()) {
        details.push({
            operation,
            heldFor: now - lock.acquiredAt,
            ownerId: lock.ownerId,
        });
    }

    return details;
}

/**
 * Force release all locks (emergency use only)
 * Use with caution - may leave operations in inconsistent state
 * @param {string} reason - Reason for force release (for logging)
 * @returns {{ released: string[], reason: string }} Released operations and reason
 */
function forceReleaseAll(reason = 'Emergency') {
    const released = [...activeLocks.keys()];
    activeLocks.clear();

    console.warn(
        `[LockManager] Force released all locks: ${released.join(', ')} - Reason: ${reason}`
    );
    released.forEach(op => dispatchLockEvent('released', op));

    return { released, reason };
}

/**
 * Dispatch a custom event for lock state changes
 * UI can listen for these to update button states
 */
function dispatchLockEvent(action, operationName) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent('lockmanager', {
                detail: { action, operationName, activeLocks: getActiveLocks() },
            })
        );
    }
}

/**
 * Wrap an async function with automatic lock acquisition/release
 * @param {string} operationName - The operation to lock
 * @param {Function} fn - Async function to execute
 * @returns {Promise<*>} Result of fn
 * @throws {LockAcquisitionError} If lock cannot be acquired
 */
async function withLock(operationName, fn) {
    const ownerId = await acquire(operationName);
    try {
        return await fn();
    } finally {
        release(operationName, ownerId);
    }
}

/**
 * Wrap an async function with automatic lock acquisition/release and timeout
 * @param {string} operationName - The operation to lock
 * @param {Function} fn - Async function to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<*>} Result of fn
 * @throws {LockTimeoutError} If timeout is reached
 */
async function withLockAndTimeout(operationName, fn, timeoutMs = 30000) {
    const ownerId = await acquireWithTimeout(operationName, timeoutMs);
    try {
        return await fn();
    } finally {
        release(operationName, ownerId);
    }
}

// ES Module export
export const LockManager = {
    OPERATIONS,
    acquire,
    acquireWithTimeout,
    acquireWithDeadlockDetection,
    release,
    isLocked,
    canAcquire,
    getActiveLocks,
    getLockStatus,
    getLockDetails,
    forceReleaseAll,
    withLock,
    withLockAndTimeout,
};

// Export default
export default LockManager;

console.log('[LockManager] Module loaded with deadlock detection, diagnostics and timeout support');
