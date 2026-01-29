/**
 * Write-Ahead Log Operation Executor
 *
 * Executes storage operations for the WAL system.
 * Handles both normal execution and idempotent replay execution.
 *
 * @module storage/write-ahead-log/operation-executor
 */

/**
 * Execute a storage operation
 * @param {string} operation - Operation name
 * @param {Array} args - Operation arguments
 * @returns {Promise<any>} Operation result
 */
export async function executeOperation(operation, args) {
    // Import Storage dynamically to avoid circular dependency
    const { Storage } = await import('../../storage.js');

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
export async function executeOperationForReplay(operation, args, isReplay = true) {
    // Import Storage dynamically to avoid circular dependency
    const { Storage } = await import('../../storage.js');

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
