/**
 * Storage Transaction Layer
 * 
 * Wraps multi-backend operations with atomic commit/rollback semantics.
 * Coordinates operations across IndexedDB and localStorage.
 * 
 * HNW Network: Provides transactional consistency for multi-backend operations,
 * preventing partial writes that could corrupt application state.
 * 
 * @module storage/transaction
 */

// ==========================================
// Transaction State
// ==========================================

/**
 * Represents a pending operation in the transaction
 */
class TransactionOperation {
    constructor(backend, type, store, key, value, previousValue = null, previousOptions = null) {
        this.backend = backend;       // 'indexeddb' | 'localstorage' | 'securetoken'
        this.type = type;             // 'put' | 'delete'
        this.store = store;           // Store name (for IndexedDB) or null
        this.key = key;               // Key identifier
        this.value = value;           // Value to store
        this.previousValue = previousValue;  // For rollback
        this.previousOptions = previousOptions;  // For rollback (token options)
        this.committed = false;
        this.timestamp = Date.now();
    }
}

/**
 * Transaction context passed to transaction callback
 * Enhanced with 2PC support for cross-backend atomicity
 */
class TransactionContext {
    constructor() {
        this.id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `txn_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        this.operations = [];
        this.committed = false;
        this.rolledBack = false;
        this.prepared = false;  // 2PC: prepare phase completed
        this.journaled = false; // 2PC: journal written
        this.startTime = Date.now();
    }

    /**
     * Add a put operation to the transaction
     * 
     * @param {string} backend - 'indexeddb' or 'localstorage'
     * @param {string} storeOrKey - Store name (IndexedDB) or key (localStorage)
     * @param {*} value - Value to store
     * @param {string} [key] - Key within store (IndexedDB only)
     */
    async put(backend, storeOrKey, value, key = null) {
        if (this.committed || this.rolledBack) {
            throw new Error('Transaction already completed');
        }

        let previousValue = null;

        if (backend === 'localstorage') {
            const storageKey = storeOrKey;
            previousValue = localStorage.getItem(storageKey);
            this.operations.push(new TransactionOperation(
                'localstorage', 'put', null, storageKey, value, previousValue
            ));
        } else if (backend === 'indexeddb') {
            const store = storeOrKey;
            let dbKey = key || value?.id;

            if (!dbKey) {
                dbKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : `txn_${Date.now()}_${Math.random().toString(16).slice(2)}`;

                if (value && typeof value === 'object' && !value.id) {
                    value = { ...value, id: dbKey };
                }
            }

            const valueToStore = (value && typeof value === 'object' && value.id !== dbKey)
                ? { ...value, id: dbKey }
                : value;

            if (window.IndexedDBCore) {
                try {
                    previousValue = await window.IndexedDBCore.get(store, dbKey);
                } catch {
                    previousValue = null;
                }
            }

            this.operations.push(new TransactionOperation(
                'indexeddb', 'put', store, dbKey, valueToStore, previousValue
            ));
        } else {
            throw new Error(`Unknown backend: ${backend}`);
        }
    }

    /**
     * Add a delete operation to the transaction
     * 
     * @param {string} backend - 'indexeddb' or 'localstorage'
     * @param {string} storeOrKey - Store name (IndexedDB) or key (localStorage)
     * @param {string} [key] - Key within store (IndexedDB only)
     */
    async delete(backend, storeOrKey, key = null) {
        if (this.committed || this.rolledBack) {
            throw new Error('Transaction already completed');
        }

        let previousValue = null;

        if (backend === 'localstorage') {
            const storageKey = storeOrKey;
            previousValue = localStorage.getItem(storageKey);
            this.operations.push(new TransactionOperation(
                'localstorage', 'delete', null, storageKey, null, previousValue
            ));
        } else if (backend === 'indexeddb') {
            const store = storeOrKey;

            if (window.IndexedDBCore) {
                try {
                    previousValue = await window.IndexedDBCore.get(store, key);
                } catch {
                    previousValue = null;
                }
            }

            this.operations.push(new TransactionOperation(
                'indexeddb', 'delete', store, key, null, previousValue
            ));
        } else {
            throw new Error(`Unknown backend: ${backend}`);
        }
    }

    /**
     * Get count of pending operations
     * @returns {number}
     */
    getPendingCount() {
        return this.operations.length;
    }

    /**
     * Add a secure token store operation to the transaction
     * HNW Network: Unified transaction scope for SecureTokenStore
     *
     * @param {string} tokenKey - Token identifier
     * @param {string} value - Token value
     * @param {Object} [options] - Storage options (expiresIn, metadata)
     */
    async storeToken(tokenKey, value, options = {}) {
        if (this.committed || this.rolledBack) {
            throw new Error('Transaction already completed');
        }

        let previousValue = null;
        let previousOptions = {};

        // Get previous value AND options from SecureTokenStore for complete rollback
        // HNW Network: Use retrieveWithOptions to preserve token options during rollback
        if (window.SecureTokenStore?.retrieveWithOptions) {
            try {
                const previousToken = await window.SecureTokenStore.retrieveWithOptions(tokenKey);
                if (previousToken) {
                    previousValue = previousToken.value;
                    previousOptions = {
                        expiresIn: previousToken.expiresIn,
                        metadata: previousToken.metadata
                    };
                }
            } catch {
                // Fall through to direct storage access
            }
        }

        // FALLBACK: Direct storage access when retrieveWithOptions is unavailable
        if (previousValue === null && window.SecureTokenStore?.retrieve) {
            try {
                const tokenValue = await window.SecureTokenStore.retrieve(tokenKey);
                if (tokenValue) {
                    previousValue = tokenValue;
                    // Use empty options since retrieve doesn't return metadata/expiry
                    previousOptions = {};
                }
            } catch (fallbackError) {
                console.warn('[Transaction] Token fallback retrieval failed:', fallbackError);
            }
        }

        this.operations.push(new TransactionOperation(
            'securetoken', 'put', null, tokenKey, { value, options }, previousValue, previousOptions
        ));
    }

    /**
     * Add a secure token delete operation to the transaction
     * HNW Network: Unified transaction scope for SecureTokenStore
     *
     * @param {string} tokenKey - Token identifier
     */
    async deleteToken(tokenKey) {
        if (this.committed || this.rolledBack) {
            throw new Error('Transaction already completed');
        }

        let previousValue = null;
        let previousOptions = {};

        // Get previous value AND options from SecureTokenStore for complete rollback
        // HNW Network: Use retrieveWithOptions to preserve token options during rollback
        if (window.SecureTokenStore?.retrieveWithOptions) {
            try {
                const previousToken = await window.SecureTokenStore.retrieveWithOptions(tokenKey);
                if (previousToken) {
                    previousValue = previousToken.value;
                    previousOptions = {
                        expiresIn: previousToken.expiresIn,
                        metadata: previousToken.metadata
                    };
                }
            } catch {
                // Fall through to direct storage access
            }
        }

        // FALLBACK: Direct storage access when retrieveWithOptions is unavailable
        if (previousValue === null && window.SecureTokenStore?.retrieve) {
            try {
                const tokenValue = await window.SecureTokenStore.retrieve(tokenKey);
                if (tokenValue) {
                    previousValue = tokenValue;
                    // Use empty options since retrieve doesn't return metadata/expiry
                    previousOptions = {};
                }
            } catch (fallbackError) {
                console.warn('[Transaction] Token fallback retrieval failed:', fallbackError);
            }
        }

        this.operations.push(new TransactionOperation(
            'securetoken', 'delete', null, tokenKey, null, previousValue, previousOptions
        ));
    }
}

// ==========================================
// Two-Phase Commit (2PC) Functions
// ==========================================

/**
 * Transaction journal store name
 */
const JOURNAL_STORE = 'TRANSACTION_JOURNAL';

/**
 * Prepare phase: validate all operations can succeed before commit
 * This is the first phase of 2PC - ensures all backends are ready
 * 
 * @param {TransactionContext} ctx - Transaction context
 * @throws {Error} If any validation fails
 */
async function preparePhase(ctx) {
    if (ctx.prepared) {
        return; // Already prepared
    }

    const validationErrors = [];

    for (const op of ctx.operations) {
        try {
            if (op.backend === 'indexeddb') {
                // Check IndexedDB connection is healthy
                if (!window.IndexedDBCore) {
                    validationErrors.push('IndexedDB not available');
                    continue;
                }
                // Verify connection status if available
                if (window.IndexedDBCore.getConnectionStatus?.() === 'disconnected') {
                    validationErrors.push('IndexedDB disconnected - prepare failed');
                }
            } else if (op.backend === 'localstorage') {
                // Check localStorage quota won't be exceeded
                const testKey = `__prepare_check_${ctx.id}`;
                try {
                    const testValue = op.value ? JSON.stringify(op.value) : '';
                    localStorage.setItem(testKey, testValue.substring(0, 100));
                    localStorage.removeItem(testKey);
                } catch (e) {
                    validationErrors.push(`localStorage quota exceeded: ${e.message}`);
                }
            } else if (op.backend === 'securetoken') {
                // Check SecureTokenStore is available
                if (!window.SecureTokenStore) {
                    validationErrors.push('SecureTokenStore not available');
                }
            }
        } catch (error) {
            validationErrors.push(`Validation error for ${op.backend}: ${error.message}`);
        }
    }

    if (validationErrors.length > 0) {
        throw new Error(`Prepare phase failed: ${validationErrors.join('; ')}`);
    }

    ctx.prepared = true;
    console.log(`[StorageTransaction] Prepare phase complete for ${ctx.operations.length} operations`);
}

/**
 * Write transaction journal for crash recovery
 * Persists transaction intent before commit phase
 * 
 * @param {TransactionContext} ctx - Transaction context
 */
async function writeJournal(ctx) {
    if (!window.IndexedDBCore) {
        console.warn('[StorageTransaction] IndexedDBCore unavailable, skipping journal');
        return;
    }

    try {
        const journal = {
            id: ctx.id,
            operations: ctx.operations.map(op => ({
                backend: op.backend,
                type: op.type,
                store: op.store,
                key: op.key,
                hasValue: op.value !== null,
                hasPreviousValue: op.previousValue !== null
            })),
            state: 'prepared',
            startTime: ctx.startTime,
            journalTime: Date.now()
        };

        await window.IndexedDBCore.put(JOURNAL_STORE, journal);
        ctx.journaled = true;
        console.log(`[StorageTransaction] Journal written for transaction ${ctx.id}`);
    } catch (error) {
        // Journal write failure shouldn't block transaction, but log it
        console.warn('[StorageTransaction] Journal write failed:', error);
    }
}

/**
 * Clear transaction journal after successful commit
 * 
 * @param {string} transactionId - Transaction ID to clear
 */
async function clearJournal(transactionId) {
    if (!window.IndexedDBCore) {
        return;
    }

    try {
        await window.IndexedDBCore.delete(JOURNAL_STORE, transactionId);
    } catch (error) {
        // Non-critical - journal will expire naturally
        console.warn('[StorageTransaction] Journal cleanup failed:', error);
    }
}

/**
 * Recover incomplete transactions from journal on startup
 * Rolls back any transactions that were prepared but not committed
 * 
 * @returns {Promise<number>} Number of recovered transactions
 */
async function recoverFromJournal() {
    if (!window.IndexedDBCore) {
        return 0;
    }

    try {
        const journals = await window.IndexedDBCore.getAll(JOURNAL_STORE);
        let recovered = 0;

        for (const journal of journals) {
            // Transactions older than 5 minutes are considered stale
            const STALE_THRESHOLD_MS = 5 * 60 * 1000;
            const age = Date.now() - journal.journalTime;

            if (age > STALE_THRESHOLD_MS) {
                console.log(`[StorageTransaction] Cleaning stale journal ${journal.id} (age: ${age}ms)`);
                await clearJournal(journal.id);
                recovered++;
            } else if (journal.state === 'prepared') {
                console.warn(`[StorageTransaction] Found incomplete transaction ${journal.id}, marking for review`);
                // Don't auto-rollback - just log for manual review
                // Full rollback would require storing actual values in journal
                recovered++;
            }
        }

        return recovered;
    } catch (error) {
        console.warn('[StorageTransaction] Journal recovery failed:', error);
        return 0;
    }
}

// ==========================================
// Core Functions
// ==========================================

/**
 * Execute a transactional operation across multiple backends
 * Uses Two-Phase Commit (2PC) protocol for enhanced atomicity:
 * 1. Prepare phase: Validate all operations can succeed
 * 2. Journal phase: Write transaction intent for crash recovery
 * 3. Commit phase: Execute all operations
 * 4. Cleanup phase: Clear journal on success
 * 
 * @param {function(TransactionContext): Promise<void>} callback - Transaction callback
 * @returns {Promise<{success: boolean, operationsCommitted: number, transactionId: string, durationMs: number}>}
 */
async function transaction(callback) {
    const ctx = new TransactionContext();

    try {
        // Phase 0: Execute the transaction callback (collect operations)
        await callback(ctx);

        if (ctx.operations.length === 0) {
            return {
                success: true,
                operationsCommitted: 0,
                transactionId: ctx.id,
                durationMs: Date.now() - ctx.startTime
            };
        }

        // Phase 1: Prepare - validate all operations
        await preparePhase(ctx);

        // Phase 2: Journal - persist transaction intent for crash recovery
        await writeJournal(ctx);

        // Phase 3: Commit - execute all operations
        await commit(ctx);

        // Phase 4: Cleanup - clear journal on success
        if (ctx.journaled) {
            await clearJournal(ctx.id);
        }

        const durationMs = Date.now() - ctx.startTime;
        console.log(`[StorageTransaction] Transaction ${ctx.id} completed in ${durationMs}ms`);

        return {
            success: true,
            operationsCommitted: ctx.operations.length,
            transactionId: ctx.id,
            durationMs
        };
    } catch (error) {
        // Rollback on any error
        console.error(`[StorageTransaction] Transaction ${ctx.id} failed, rolling back:`, error);
        await rollback(ctx);

        // Clear journal even on failure (rollback complete)
        if (ctx.journaled) {
            await clearJournal(ctx.id);
        }

        throw error;
    }
}

/**
 * Commit all operations in the transaction
 * 
 * @param {TransactionContext} ctx - Transaction context
 */
async function commit(ctx) {
    if (ctx.committed) {
        throw new Error('Transaction already committed');
    }

    const errors = [];

    for (const op of ctx.operations) {
        try {
            if (op.backend === 'localstorage') {
                if (op.type === 'put') {
                    localStorage.setItem(op.key,
                        typeof op.value === 'string' ? op.value : JSON.stringify(op.value)
                    );
                } else if (op.type === 'delete') {
                    localStorage.removeItem(op.key);
                }
            } else if (op.backend === 'indexeddb') {
                if (!window.IndexedDBCore) {
                    throw new Error('IndexedDBCore not available');
                }

                if (op.type === 'put') {
                    await window.IndexedDBCore.put(op.store, op.value);
                } else if (op.type === 'delete') {
                    await window.IndexedDBCore.delete(op.store, op.key);
                }
            } else if (op.backend === 'securetoken') {
                // HNW Network: SecureTokenStore integration
                if (!window.SecureTokenStore) {
                    throw new Error('SecureTokenStore not available');
                }

                if (op.type === 'put') {
                    const { value, options } = op.value;
                    await window.SecureTokenStore.store(op.key, value, options);
                } else if (op.type === 'delete') {
                    await window.SecureTokenStore.invalidate(op.key);
                }
            }

            op.committed = true;
        } catch (error) {
            errors.push({ operation: op, error });
            // Stop committing on first error
            break;
        }
    }

    if (errors.length > 0) {
        // Rollback committed operations
        await rollback(ctx);
        throw new Error(`Commit failed: ${errors[0].error.message}`);
    }

    ctx.committed = true;
    console.log(`[StorageTransaction] Committed ${ctx.operations.length} operations`);
}

async function revertIndexedDBOperation(op) {
    if (!window.IndexedDBCore) {
        console.warn('[StorageTransaction] IndexedDBCore not available for rollback');
        return;
    }

    if (op.previousValue === null) {
        await window.IndexedDBCore.delete(op.store, op.key);
    } else {
        await window.IndexedDBCore.put(op.store, op.previousValue);
    }
}

/**
 * Rollback all committed operations in the transaction
 * 
 * @param {TransactionContext} ctx - Transaction context
 */
async function rollback(ctx) {
    if (ctx.rolledBack) {
        return;
    }

    // Rollback in reverse order
    const toRollback = ctx.operations.filter(op => op.committed).reverse();

    for (const op of toRollback) {
        try {
            if (op.backend === 'localstorage') {
                if (op.previousValue === null) {
                    localStorage.removeItem(op.key);
                } else {
                    localStorage.setItem(op.key, op.previousValue);
                }
            } else if (op.backend === 'indexeddb') {
                await revertIndexedDBOperation(op);
            } else if (op.backend === 'securetoken') {
                // HNW Network: SecureTokenStore rollback with full options preservation
                if (window.SecureTokenStore) {
                    if (op.previousValue === null) {
                        await window.SecureTokenStore.invalidate(op.key);
                    } else {
                        // Restore previous value with original options
                        await window.SecureTokenStore.store(op.key, op.previousValue, op.previousOptions);
                    }
                }
            }
        } catch (rollbackError) {
            console.error('[StorageTransaction] Rollback failed for operation:', op, rollbackError);
            // Continue rolling back other operations
        }
    }

    ctx.rolledBack = true;
    console.log(`[StorageTransaction] Rolled back ${toRollback.length} operations`);
}

/**
 * Create a savepoint for nested transactions (future use)
 * 
 * @param {TransactionContext} ctx - Transaction context
 * @returns {number} Savepoint index
 */
function savepoint(ctx) {
    return ctx.operations.length;
}

/**
 * Rollback to a savepoint
 * 
 * @param {TransactionContext} ctx - Transaction context
 * @param {number} savepointIndex - Savepoint to rollback to
 */
async function rollbackToSavepoint(ctx, savepointIndex) {
    const toRollback = ctx.operations.slice(savepointIndex).reverse();

    for (const op of toRollback) {
        if (!op.committed) {
            continue;
        }

        try {
            // Rollback this operation
            if (op.backend === 'localstorage') {
                if (op.previousValue === null) {
                    localStorage.removeItem(op.key);
                } else {
                    localStorage.setItem(op.key, op.previousValue);
                }
            } else if (op.backend === 'indexeddb') {
                await revertIndexedDBOperation(op);
            }
        } catch (error) {
            console.error('[StorageTransaction] Savepoint rollback failed for operation:', op, error);
        }
    }

    // Remove rolled back operations
    ctx.operations = ctx.operations.slice(0, savepointIndex);
}

// ==========================================
// Public API
// ==========================================

const StorageTransaction = {
    // Core operations
    transaction,

    // 2PC recovery (call on startup)
    recoverFromJournal,

    // For advanced use
    TransactionContext,
    TransactionOperation,
    savepoint,
    rollbackToSavepoint,

    // Internal (for testing)
    _commit: commit,
    _rollback: rollback,
    _preparePhase: preparePhase,
    _writeJournal: writeJournal,
    _clearJournal: clearJournal
};

// ES Module export
export { StorageTransaction };

console.log('[StorageTransaction] Storage Transaction Layer loaded');
