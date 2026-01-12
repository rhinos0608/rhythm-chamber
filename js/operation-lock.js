/**
 * Operation Lock System
 * 
 * Provides mutual exclusion for destructive operations to prevent
 * concurrent state corruption. Part of HNW Hierarchy fix.
 * 
 * Usage:
 *   const lockId = await OperationLock.acquire('file_processing');
 *   try { ... } finally { OperationLock.release('file_processing', lockId); }
 */

// Named operations that can be locked
const OPERATIONS = {
    FILE_PROCESSING: 'file_processing',
    EMBEDDING_GENERATION: 'embedding_generation',
    PRIVACY_CLEAR: 'privacy_clear',
    SPOTIFY_FETCH: 'spotify_fetch',
    CHAT_SAVE: 'chat_save'
};

// Conflict matrix: which operations cannot run concurrently
const CONFLICT_MATRIX = {
    [OPERATIONS.FILE_PROCESSING]: [OPERATIONS.PRIVACY_CLEAR, OPERATIONS.EMBEDDING_GENERATION],
    [OPERATIONS.EMBEDDING_GENERATION]: [OPERATIONS.PRIVACY_CLEAR, OPERATIONS.FILE_PROCESSING],
    [OPERATIONS.PRIVACY_CLEAR]: [OPERATIONS.FILE_PROCESSING, OPERATIONS.EMBEDDING_GENERATION, OPERATIONS.CHAT_SAVE],
    [OPERATIONS.SPOTIFY_FETCH]: [],  // Spotify can run alongside others
    [OPERATIONS.CHAT_SAVE]: [OPERATIONS.PRIVACY_CLEAR]
};

// Current locks state
const activeLocks = new Map();  // operationName -> { ownerId, acquiredAt }
let lockIdCounter = 0;

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
        blockedBy: blockedBy.length > 0 ? blockedBy : undefined
    };
}

/**
 * Acquire a lock for an operation
 * @param {string} operationName - The operation to lock
 * @returns {Promise<string>} Lock owner ID (needed for release)
 * @throws {Error} If operation is blocked by conflicting locks
 */
async function acquire(operationName) {
    const { canAcquire: allowed, blockedBy } = canAcquire(operationName);

    if (!allowed) {
        const msg = `Operation '${operationName}' blocked by: ${blockedBy.join(', ')}`;
        console.warn(`[OperationLock] ${msg}`);
        throw new Error(msg);
    }

    const ownerId = generateOwnerId();
    activeLocks.set(operationName, {
        ownerId,
        acquiredAt: Date.now()
    });

    console.log(`[OperationLock] Acquired '${operationName}' (${ownerId})`);
    dispatchLockEvent('acquired', operationName);

    return ownerId;
}

/**
 * Release a lock
 * @param {string} operationName - The operation to unlock
 * @param {string} ownerId - The owner ID from acquire()
 * @returns {boolean} True if released, false if lock didn't match
 */
function release(operationName, ownerId) {
    const lock = activeLocks.get(operationName);

    if (!lock) {
        console.warn(`[OperationLock] No lock found for '${operationName}'`);
        return false;
    }

    if (lock.ownerId !== ownerId) {
        console.warn(`[OperationLock] Owner mismatch for '${operationName}': expected ${lock.ownerId}, got ${ownerId}`);
        return false;
    }

    const duration = Date.now() - lock.acquiredAt;
    activeLocks.delete(operationName);

    console.log(`[OperationLock] Released '${operationName}' (held for ${duration}ms)`);
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
 * Force release all locks (emergency use only)
 * Use with caution - may leave operations in inconsistent state
 */
function forceReleaseAll() {
    const released = [...activeLocks.keys()];
    activeLocks.clear();
    console.warn(`[OperationLock] Force released all locks: ${released.join(', ')}`);
    released.forEach(op => dispatchLockEvent('released', op));
    return released;
}

/**
 * Dispatch a custom event for lock state changes
 * UI can listen for these to update button states
 */
function dispatchLockEvent(action, operationName) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('operationlock', {
            detail: { action, operationName, activeLocks: getActiveLocks() }
        }));
    }
}

/**
 * Wrap an async function with automatic lock acquisition/release
 * @param {string} operationName - The operation to lock
 * @param {Function} fn - Async function to execute
 * @returns {Promise<*>} Result of fn
 */
async function withLock(operationName, fn) {
    const ownerId = await acquire(operationName);
    try {
        return await fn();
    } finally {
        release(operationName, ownerId);
    }
}

// Public API
const OperationLock = {
    OPERATIONS,
    acquire,
    release,
    isLocked,
    canAcquire,
    getActiveLocks,
    forceReleaseAll,
    withLock
};

// Make available globally
if (typeof window !== 'undefined') {
    window.OperationLock = OperationLock;
}

console.log('[OperationLock] Module loaded');
