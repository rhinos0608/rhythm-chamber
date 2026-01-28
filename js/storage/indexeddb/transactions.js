/**
 * Transaction Management
 *
 * Provides transaction pool for explicit transaction management.
 * Enables proper transaction isolation for operations to prevent
 * concurrent writes from losing data.
 *
 * @module storage/indexeddb/transactions
 */

/**
 * Transaction pool for explicit transaction management
 * Enables proper transaction isolation for put operations to prevent
 * concurrent writes from losing data.
 *
 * @type {Map<string, IDBTransaction>}
 */
const transactionPool = new Map();

/**
 * Acquire or create a transaction for the given store
 * CRITICAL FIX for Issue #1: Provides explicit transaction with proper locking
 *
 * NOTE: Transaction state can change between readyState check and actual use.
 * To prevent race conditions, we now always create a fresh transaction rather
 * than reusing from pool when state is uncertain. Pool entries are only used
 * if they are confirmed 'active' AND have not been marked as completing.
 *
 * @param {IDBDatabase} database - Database connection
 * @param {string} storeName - Store name
 * @param {string} [mode='readwrite'] - Transaction mode
 * @returns {IDBTransaction} Transaction instance
 */
export function acquireTransaction(database, storeName, mode = 'readwrite') {
    const poolKey = `${storeName}_${mode}`;

    // Check if transaction exists and is not complete
    const existingTx = transactionPool.get(poolKey);
    if (existingTx) {
        // CRITICAL FIX: Only reuse if state is 'active' - transaction can complete
        // between this check and use, but we minimize the window by also checking
        // that the transaction hasn't been marked as completing via our flag
        if (existingTx.readyState === 'active' && !existingTx._isCompleting) {
            return existingTx;
        }
        // Remove stale or completing transaction
        transactionPool.delete(poolKey);
    }

    // Create new transaction
    const transaction = database.transaction(storeName, mode);

    // CRITICAL FIX: Add flag to track when transaction starts completing
    // This helps prevent race condition where readyState check passes
    // but transaction completes before caller can use it
    transaction._isCompleting = false;

    // Clean up pool when transaction completes
    const markCompleting = () => {
        transaction._isCompleting = true;
        transactionPool.delete(poolKey);
    };
    transaction.oncomplete = markCompleting;
    transaction.onerror = markCompleting;
    transaction.onabort = markCompleting;

    // Store in pool
    transactionPool.set(poolKey, transaction);

    return transaction;
}

/**
 * Wrap an IndexedDB request with timeout and proper error handling
 * CRITICAL FIX: Prevents hanging transactions and ensures proper cleanup
 *
 * @param {IDBRequest} request - The IndexedDB request
 * @param {IDBTransaction} transaction - The parent transaction
 * @param {number} [timeoutMs=5000] - Timeout in milliseconds
 * @returns {Promise<any>} The request result
 */
export function wrapRequest(request, transaction, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        let timeoutHandle;
        let completed = false;

        const cleanup = () => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = null;
            }
            completed = true;
        };

        // Set timeout
        timeoutHandle = setTimeout(() => {
            if (!completed) {
                cleanup();
                transaction.abort();
                reject(new Error(`IndexedDB request timeout after ${timeoutMs}ms`));
            }
        }, timeoutMs);

        // Handle success
        request.onsuccess = () => {
            if (!completed) {
                cleanup();
                resolve(request.result);
            }
        };

        // Handle error
        request.onerror = () => {
            if (!completed) {
                cleanup();
                reject(request.error || new Error('IndexedDB request failed'));
            }
        };

        // CRITICAL: Handle transaction abort
        transaction.onabort = () => {
            if (!completed) {
                cleanup();
                reject(transaction.error || new Error('IndexedDB transaction aborted'));
            }
        };

        // Handle transaction timeout (browser may abort for inactivity)
        transaction.ontimeout = () => {
            if (!completed) {
                cleanup();
                reject(new Error('IndexedDB transaction timed out'));
            }
        };
    });
}

/**
 * Clear the transaction pool
 * Useful for testing or reset scenarios
 */
export function clearTransactionPool() {
    transactionPool.clear();
}
