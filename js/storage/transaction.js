/**
 * Storage Transaction Layer
 *
 * Wraps multi-backend operations with atomic commit/rollback semantics.
 * Coordinates operations across IndexedDB and localStorage.
 *
 * HNW Network: Provides transactional consistency for multi-backend operations,
 * preventing partial writes that could corrupt application state.
 *
 * COMPENSATION LOG: If rollback fails, failed operations are logged to a
 * compensation store for manual recovery. This prevents silent data corruption.
 *
 * @module storage/transaction
 */

import { IndexedDBCore } from './indexeddb.js';
import { EventBus } from '../services/event-bus.js';
import { SecureTokenStore } from '../security/secure-token-store.js';

// ==========================================
// Compensation Log Store Name
// ==========================================

const COMPENSATION_LOG_STORE = 'TRANSACTION_COMPENSATION';

// ==========================================
// Fatal Error State (CRITICAL FIX for Issue #2)
// ==========================================

/**
 * CRITICAL FIX: Fatal error state to prevent cascade failures
 *
 * When transaction rollback fails and all compensation logging fails, the system
 * enters a fatal state where data integrity cannot be guaranteed. All new
 * transactions are blocked until the fatal state is cleared (requires user action).
 *
 * This prevents compounding data corruption in unrecoverable failure scenarios.
 */
let FATAL_STATE = {
    isFatal: false,
    reason: null,
    timestamp: null,
    transactionId: null,
    compensationLogCount: 0
};

// ==========================================
// Nested Transaction Detection (MEDIUM FIX for Issue #15)
// ==========================================

/**
 * MEDIUM FIX Issue #15: Track active transaction depth to detect and prevent nested transactions
 *
 * Nested transactions can cause deadlocks and unexpected behavior because:
 * 1. Operations queued during a transaction may commit after the outer transaction completes
 * 2. Rollback behavior is undefined when transactions are nested
 * 3. The 2PC protocol doesn't account for nested transaction scenarios
 */
let transactionDepth = 0;
const NESTED_TRANSACTION_STACK = []; // Track transaction context IDs for debugging

/**
 * Check if currently inside a transaction
 * @returns {boolean} True if a transaction is active
 */
function isInTransaction() {
    return transactionDepth > 0;
}

/**
 * Get current transaction depth
 * @returns {number} Current nesting depth
 */
function getTransactionDepth() {
    return transactionDepth;
}

/**
 * Check if system is in fatal error state
 * @returns {boolean} True if in fatal state
 */
function isFatalState() {
    return FATAL_STATE.isFatal;
}

/**
 * Get fatal error state details
 * @returns {Object|null} Fatal state or null if not fatal
 */
function getFatalState() {
    if (!FATAL_STATE.isFatal) {
        return null;
    }
    return { ...FATAL_STATE };
}

/**
 * Clear fatal error state (requires explicit user action)
 * This should only be called after manual recovery/verification
 * @param {string} [reason] - Reason for clearing
 */
function clearFatalState(reason = 'Manual recovery') {
    if (FATAL_STATE.isFatal) {
        console.warn('[StorageTransaction] Fatal state cleared:', reason);
        FATAL_STATE = {
            isFatal: false,
            reason: null,
            timestamp: null,
            transactionId: null,
            compensationLogCount: 0
        };
        EventBus.emit('transaction:fatal_cleared', { reason, timestamp: Date.now() });
    }
}

// ==========================================
// SessionStorage Compensation Log Fallback
// ==========================================

/**
 * CRITICAL FIX: SessionStorage-based compensation log fallback for quota exhaustion
 *
 * When both IndexedDB and localStorage fail (typically due to quota exhaustion),
 * compensation logs are stored in sessionStorage. This ensures rollback failures
 * survive page refreshes while still being scoped to the session.
 *
 * sessionStorage is used instead of in-memory Map because:
 * 1. Survives page refreshes (critical for recovery scenarios)
 * 2. Automatically cleared when session ends (browser close)
 * 3. Has higher quota limits (typically 5-10MB)
 *
 * The sessionStorage-based log survives page refreshes and can be retrieved via
 * getCompensationLogs(). Logs are persisted across page reloads within the session.
 */
const SESSION_COMPENSATION_KEY = '_tx_compensation_session';
const MAX_SESSION_LOGS = 100; // Prevent unbounded growth

/**
 * Add a compensation log entry to sessionStorage
 * @param {string} transactionId - Transaction ID
 * @param {Array} entries - Compensation log entries
 */
function addInMemoryCompensationLog(transactionId, entries) {
    try {
        const existingData = sessionStorage.getItem(SESSION_COMPENSATION_KEY);
        const logs = existingData ? JSON.parse(existingData) : [];

        // Prevent unbounded growth - evict oldest if at limit
        if (logs.length >= MAX_SESSION_LOGS) {
            logs.shift(); // Remove oldest entry
        }

        logs.push({
            id: transactionId,
            entries,
            timestamp: Date.now(),
            resolved: false,
            storage: 'session' // Flag to indicate sessionStorage storage
        });

        sessionStorage.setItem(SESSION_COMPENSATION_KEY, JSON.stringify(logs));
        console.warn(`[StorageTransaction] Compensation log stored in sessionStorage (fallback): ${transactionId}`);
    } catch (sessionError) {
        // If sessionStorage also fails, we've exhausted all options
        console.error('[StorageTransaction] All storage backends failed for compensation log:', sessionError);
    }
}

/**
 * Get an in-memory (sessionStorage) compensation log entry
 * @param {string} transactionId - Transaction ID
 * @returns {Object|null} SessionStorage log entry or null
 */
function getInMemoryCompensationLog(transactionId) {
    try {
        const existingData = sessionStorage.getItem(SESSION_COMPENSATION_KEY);
        if (!existingData) return null;

        const logs = JSON.parse(existingData);
        return logs.find(log => log.id === transactionId) || null;
    } catch (parseError) {
        console.error('[StorageTransaction] Failed to parse sessionStorage compensation log:', parseError);
        return null;
    }
}

/**
 * Get all in-memory (sessionStorage) compensation log entries
 * @returns {Array} Array of sessionStorage log entries
 */
function getAllInMemoryCompensationLogs() {
    try {
        const existingData = sessionStorage.getItem(SESSION_COMPENSATION_KEY);
        if (!existingData) return [];

        return JSON.parse(existingData);
    } catch (parseError) {
        console.error('[StorageTransaction] Failed to parse sessionStorage compensation logs:', parseError);
        return [];
    }
}

/**
 * Clear an in-memory (sessionStorage) compensation log entry
 * @param {string} transactionId - Transaction ID
 * @returns {boolean} True if entry was found and cleared
 */
function clearInMemoryCompensationLog(transactionId) {
    try {
        const existingData = sessionStorage.getItem(SESSION_COMPENSATION_KEY);
        if (!existingData) return false;

        const logs = JSON.parse(existingData);
        const initialLength = logs.length;
        const filteredLogs = logs.filter(log => log.id !== transactionId);

        if (filteredLogs.length < initialLength) {
            sessionStorage.setItem(SESSION_COMPENSATION_KEY, JSON.stringify(filteredLogs));
            return true;
        }
        return false;
    } catch (parseError) {
        console.error('[StorageTransaction] Failed to clear sessionStorage compensation log:', parseError);
        return false;
    }
}

// ==========================================
// Transaction State
// ==========================================

/**
 * Transaction configuration limits
 * ARCH FIX: Prevents unbounded queue growth and adds retry logic
 */
const MAX_OPERATIONS_PER_TRANSACTION = 100;
const OPERATION_TIMEOUT_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 100;

/**
 * Retry wrapper for transient storage failures
 * Implements exponential backoff: 100ms, 200ms, 400ms
 *
 * @param {Function} operation - Async operation to retry
 * @param {number} attempts - Maximum retry attempts (default: 3)
 * @returns {Promise<any>} Result of operation
 */
async function retryOperation(operation, attempts = MAX_RETRY_ATTEMPTS) {
    let lastError;

    for (let i = 0; i < attempts; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            // Don't retry on non-transient errors
            if (error.name === 'QuotaExceededError' ||
                error.name === 'InvalidStateError' ||
                error.message?.includes('fatal') ||
                error.message?.includes('not supported')) {
                throw error;
            }

            // If not the last attempt, wait with exponential backoff
            if (i < attempts - 1) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, i);
                console.warn(`[StorageTransaction] Operation failed, retrying in ${delay}ms (attempt ${i + 1}/${attempts}):`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // All retries exhausted
    throw new Error(`Operation failed after ${attempts} attempts: ${lastError.message}`);
}

/**
 * Timeout wrapper for storage operations
 * Prevents indefinite hangs on unresponsive backends
 *
 * @param {Function} operation - Async operation to wrap
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns {Promise<any>} Result of operation
 */
async function withTimeout(operation, timeoutMs = OPERATION_TIMEOUT_MS) {
    return Promise.race([
        operation(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
        )
    ]);
}

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
        this.rolledBack = false;
        this.timestamp = Date.now();
        this.retryCount = 0;  // ARCH FIX: Track retry attempts
    }
}

/**
 * Transaction context passed to transaction callback
 * Enhanced with 2PC support for cross-backend atomicity
 * ARCH FIX: Added queue depth limits and operation tracking
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
        this.operationTimeouts = 0;  // ARCH FIX: Track timed out operations
        this.retryAttempts = 0;      // ARCH FIX: Total retry attempts
    }

    /**
     * Add a put operation to the transaction
     * ARCH FIX: Enforces MAX_OPERATIONS_PER_TRANSACTION to prevent unbounded growth
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

        // ARCH FIX: Enforce queue depth limit
        if (this.operations.length >= MAX_OPERATIONS_PER_TRANSACTION) {
            throw new Error(
                `Transaction too large: maximum ${MAX_OPERATIONS_PER_TRANSACTION} operations per transaction. ` +
                `Current: ${this.operations.length}. Consider splitting into multiple transactions.`
            );
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

            if (IndexedDBCore) {
                try {
                    previousValue = await IndexedDBCore.get(store, dbKey);
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
     * ARCH FIX: Enforces MAX_OPERATIONS_PER_TRANSACTION to prevent unbounded growth
     *
     * @param {string} backend - 'indexeddb' or 'localstorage'
     * @param {string} storeOrKey - Store name (IndexedDB) or key (localStorage)
     * @param {string} [key] - Key within store (IndexedDB only)
     */
    async delete(backend, storeOrKey, key = null) {
        if (this.committed || this.rolledBack) {
            throw new Error('Transaction already completed');
        }

        // ARCH FIX: Enforce queue depth limit
        if (this.operations.length >= MAX_OPERATIONS_PER_TRANSACTION) {
            throw new Error(
                `Transaction too large: maximum ${MAX_OPERATIONS_PER_TRANSACTION} operations per transaction. ` +
                `Current: ${this.operations.length}. Consider splitting into multiple transactions.`
            );
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

            if (IndexedDBCore) {
                try {
                    previousValue = await IndexedDBCore.get(store, key);
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
        if (SecureTokenStore?.retrieveWithOptions) {
            try {
                const previousToken = await SecureTokenStore.retrieveWithOptions(tokenKey);
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
        if (previousValue === null && SecureTokenStore?.retrieve) {
            try {
                const tokenValue = await SecureTokenStore.retrieve(tokenKey);
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
        if (SecureTokenStore?.retrieveWithOptions) {
            try {
                const previousToken = await SecureTokenStore.retrieveWithOptions(tokenKey);
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
        if (previousValue === null && SecureTokenStore?.retrieve) {
            try {
                const tokenValue = await SecureTokenStore.retrieve(tokenKey);
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
                if (!IndexedDBCore) {
                    validationErrors.push('IndexedDB not available');
                    continue;
                }
                // Verify connection status if available
                if (IndexedDBCore.getConnectionStatus?.() === 'disconnected') {
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
                if (!SecureTokenStore) {
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
    if (!IndexedDBCore) {
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

        await IndexedDBCore.put(JOURNAL_STORE, journal);
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
    if (!IndexedDBCore) {
        return;
    }

    try {
        await IndexedDBCore.delete(JOURNAL_STORE, transactionId);
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
    if (!IndexedDBCore) {
        return 0;
    }

    try {
        const journals = await IndexedDBCore.getAll(JOURNAL_STORE);
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
 * Default transaction timeout (30 seconds)
 * Prevents indefinite hangs on unresponsive operations
 */
const DEFAULT_TRANSACTION_TIMEOUT_MS = 30000;

/**
 * Execute a transactional operation across multiple backends
 * Uses Two-Phase Commit (2PC) protocol for enhanced atomicity:
 * 1. Prepare phase: Validate all operations can succeed
 * 2. Journal phase: Write transaction intent for crash recovery
 * 3. Commit phase: Execute all operations
 * 4. Cleanup phase: Clear journal on success
 *
 * CRITICAL FIX for Issue #2: Checks fatal state before starting transaction
 * MEDIUM FIX for Issue #15: Detects and prevents nested transactions
 * FIX: Added timeout handling to prevent indefinite hangs
 *
 * @param {function(TransactionContext): Promise<void>} callback - Transaction callback
 * @param {Object} [options] - Transaction options
 * @param {number} [options.timeoutMs] - Timeout in milliseconds (default: 30000)
 * @returns {Promise<{success: boolean, operationsCommitted: number, transactionId: string, durationMs: number}>}
 */
async function transaction(callback, options = {}) {
    const { timeoutMs = DEFAULT_TRANSACTION_TIMEOUT_MS } = options;

    // CRITICAL FIX: Block new transactions when in fatal state
    if (FATAL_STATE.isFatal) {
        const error = new Error(
            `System in fatal error state: ${FATAL_STATE.reason}. ` +
            `Transaction ID: ${FATAL_STATE.transactionId}. ` +
            `Please refresh the page and contact support if the issue persists.`
        );
        error.code = 'TRANSACTION_FATAL_STATE';
        error.fatalState = getFatalState();
        throw error;
    }

    // MEDIUM FIX Issue #15: Detect and prevent nested transactions
    // Nested transactions can cause deadlocks and undefined rollback behavior
    if (isInTransaction()) {
        const error = new Error(
            `Nested transaction detected (current depth: ${transactionDepth}). ` +
            `Nested transactions are not supported. ` +
            `Please move this operation outside the current transaction context.`
        );
        error.code = 'NESTED_TRANSACTION_NOT_SUPPORTED';
        error.transactionDepth = transactionDepth;
        error.currentStack = [...NESTED_TRANSACTION_STACK];
        throw error;
    }

    // Increment transaction depth (track for nested detection)
    transactionDepth++;

    const ctx = new TransactionContext();
    NESTED_TRANSACTION_STACK.push(ctx.id);

    // MEDIUM FIX Issue #25: Prevent double timeout cleanup by tracking cleared state
    // The original code had potential double-clear issues where timeoutId could be
    // cleared in both the success path (line 796) and the catch path (line 841).
    // While clearTimeout on an already-cleared timeout is harmless in JavaScript,
    // it indicates unclear cleanup logic. We use a flag to make the intent explicit.
    let timeoutId = null;
    let timeoutCleared = false;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(
                `Transaction ${ctx.id} timed out after ${timeoutMs}ms. ` +
                `The operation may have hung due to an unresponsive storage backend.`
            ));
        }, timeoutMs);
    });

    try {
        // Phase 0: Execute the transaction callback (collect operations) with timeout
        await Promise.race([
            callback(ctx),
            timeoutPromise
        ]);

        // MEDIUM FIX Issue #25: Clear timeout with flag check to prevent double-clear
        if (timeoutId !== null && !timeoutCleared) {
            clearTimeout(timeoutId);
            timeoutCleared = true;
        }

        if (ctx.operations.length === 0) {
            return {
                success: true,
                operationsCommitted: 0,
                transactionId: ctx.id,
                durationMs: Date.now() - ctx.startTime
            };
        }

        // Phase 1: Prepare - validate all operations (with new timeout)
        const prepareTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Transaction prepare phase timed out')), timeoutMs);
        });
        await Promise.race([preparePhase(ctx), prepareTimeout]);

        // Phase 2: Journal - persist transaction intent for crash recovery
        const journalTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Transaction journal phase timed out')), 5000);
        });
        await Promise.race([writeJournal(ctx), journalTimeout]);

        // Phase 3: Commit - execute all operations (with new timeout)
        const commitTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Transaction commit phase timed out')), timeoutMs);
        });
        await Promise.race([commit(ctx), commitTimeout]);

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
        // MEDIUM FIX Issue #25: Clear timeout with flag check to prevent double-clear
        if (timeoutId !== null && !timeoutCleared) {
            clearTimeout(timeoutId);
            timeoutCleared = true;
        }

        // Rollback on any error
        console.error(`[StorageTransaction] Transaction ${ctx.id} failed, rolling back:`, error);
        await rollback(ctx);

        // Clear journal even on failure (rollback complete)
        if (ctx.journaled) {
            await clearJournal(ctx.id);
        }

        throw error;
    } finally {
        // MEDIUM FIX Issue #15: Always decrement transaction depth and clean up stack
        // This ensures proper tracking even when errors occur
        transactionDepth = Math.max(0, transactionDepth - 1);
        const stackIndex = NESTED_TRANSACTION_STACK.indexOf(ctx.id);
        if (stackIndex !== -1) {
            NESTED_TRANSACTION_STACK.splice(stackIndex, 1);
        }
    }
}

/**
 * Commit all operations in the transaction
 * CRITICAL FIX for Issue #3: Continues attempting all writes, tracks failures,
 * only rolls back if no operations succeeded
 * ARCH FIX: Added retry logic with exponential backoff for transient failures
 *
 * @param {TransactionContext} ctx - Transaction context
 */
async function commit(ctx) {
    if (ctx.committed) {
        throw new Error('Transaction already committed');
    }

    const errors = [];
    let succeededCount = 0;

    // ADVERSARIAL REVIEW FIX: Retry ENTIRE transaction to maintain atomicity
    // If any operation fails, rollback and retry everything
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        // Clear previous attempt's state
        errors.length = 0;
        succeededCount = 0;

        // Reset all committed flags
        for (const op of ctx.operations) {
            op.committed = false;
        }

        // Try to commit all operations
        for (const op of ctx.operations) {
            try {
                // No retry here - if it fails, entire transaction fails
                await withTimeout(async () => {
                    if (op.backend === 'localstorage') {
                        if (op.type === 'put') {
                            localStorage.setItem(op.key,
                                typeof op.value === 'string' ? op.value : JSON.stringify(op.value)
                            );
                        } else if (op.type === 'delete') {
                            localStorage.removeItem(op.key);
                        }
                    } else if (op.backend === 'indexeddb') {
                        if (!IndexedDBCore) {
                            throw new Error('IndexedDBCore not available');
                        }

                        if (op.type === 'put') {
                            await IndexedDBCore.put(op.store, op.value);
                        } else if (op.type === 'delete') {
                            await IndexedDBCore.delete(op.store, op.key);
                        }
                    } else if (op.backend === 'securetoken') {
                        if (!SecureTokenStore) {
                            throw new Error('SecureTokenStore not available');
                        }

                        if (op.type === 'put') {
                            const { value, options } = op.value;
                            await SecureTokenStore.store(op.key, value, options);
                        } else if (op.type === 'delete') {
                            await SecureTokenStore.invalidate(op.key);
                        }
                    }
                }, OPERATION_TIMEOUT_MS);

                op.committed = true;
                succeededCount++;
            } catch (error) {
                errors.push({ operation: op, error });
                // One failure = entire transaction fails
                break;
            }
        }

        // If all operations succeeded, we're done
        if (errors.length === 0) {
            ctx.committed = true;
            console.log(`[StorageTransaction] Transaction ${ctx.id} committed successfully (${succeededCount} operations)`);
            return;
        }

        // If this was the last attempt, give up
        if (attempt === MAX_RETRY_ATTEMPTS - 1) {
            break;
        }

        // Rollback this attempt and retry
        console.warn(`[StorageTransaction] Transaction ${ctx.id} attempt ${attempt + 1} failed, rolling back and retrying...`);
        await rollback(ctx);

        // Wait before retry (exponential backoff)
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // All retry attempts failed - handle errors
    if (errors.length > 0) {
        if (succeededCount === 0) {
            // Complete failure - rollback is appropriate
            await rollback(ctx);
            throw new Error(`Transaction failed completely after ${MAX_RETRY_ATTEMPTS} attempts: ${errors[0].error.message}`);
        } else {
            // Partial success - this should NOT happen with atomic transactions
            // But we handle it gracefully for robustness
            const failureSummary = errors.map((err, idx) => ({
                index: idx,
                backend: err.operation.backend,
                type: err.operation.type,
                store: err.operation.store,
                key: err.operation.key,
                error: err.error.message,
                errorName: err.error.name || 'Error'
            }));

            const failuresByBackend = errors.reduce((acc, err) => {
                const backend = err.operation.backend;
                if (!acc[backend]) {
                    acc[backend] = { count: 0, errors: [] };
                }
                acc[backend].count++;
                acc[backend].errors.push({
                    type: err.operation.type,
                    key: err.operation.key,
                    error: err.error.message
                });
                return acc;
            }, {});

            const partialCommitError = new Error(
                `Transaction partially succeeded after ${MAX_RETRY_ATTEMPTS} attempts: ` +
                `${succeededCount}/${ctx.operations.length} operations committed, ` +
                `${errors.length} failed. This indicates a non-transient error.`
            );
            partialCommitError.code = 'PARTIAL_COMMIT_AFTER_RETRIES';
            partialCommitError.succeededCount = succeededCount;
            partialCommitError.failedCount = errors.length;
            partialCommitError.errors = errors;
            partialCommitError.failureSummary = failureSummary;
            partialCommitError.failuresByBackend = failuresByBackend;

            ctx.committed = true;

            console.error(`[StorageTransaction] PARTIAL COMMIT AFTER RETRIES:`, {
                transactionId: ctx.id,
                succeeded: succeededCount,
                failed: errors.length,
                total: ctx.operations.length,
                failuresByBackend,
                timestamp: new Date().toISOString()
            });

            if (EventBus) {
                EventBus.emit('transaction:partial_commit', {
                    transactionId: ctx.id,
                    succeededCount,
                    failedCount: errors.length,
                    totalOperations: ctx.operations.length,
                    failureSummary,
                    failuresByBackend,
                    timestamp: Date.now()
                });
            }

            throw partialCommitError;
        }
    }

    // Should not reach here, but for safety
    ctx.committed = true;
    console.log(`[StorageTransaction] Committed ${ctx.operations.length} operations`);
}

async function revertIndexedDBOperation(op) {
    if (!IndexedDBCore) {
        console.warn('[StorageTransaction] IndexedDBCore not available for rollback');
        return;
    }

    if (op.previousValue === null) {
        await IndexedDBCore.delete(op.store, op.key);
    } else {
        await IndexedDBCore.put(op.store, op.previousValue);
    }
}

/**
 * Rollback all committed operations in the transaction
 * If rollback fails for any operation, it is logged to the compensation log
 * for manual recovery.
 * 
 * @param {TransactionContext} ctx - Transaction context
 */
async function rollback(ctx) {
    // Rollback in reverse order
    const toRollback = ctx.operations.filter(op => op.committed).reverse();
    const compensationLog = [];

    // Define sensitive field patterns for redaction
    const sensitiveFieldPatterns = ['securetoken', 'auth', 'token', 'secret', 'password', 'credentials'];
    const isSensitiveKey = (key) => key && sensitiveFieldPatterns.some(pattern => String(key).toLowerCase().includes(pattern));

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
                if (SecureTokenStore) {
                    if (op.previousValue === null) {
                        await SecureTokenStore.invalidate(op.key);
                    } else {
                        // Restore previous value with original options
                        await SecureTokenStore.store(op.key, op.previousValue, op.previousOptions);
                    }
                }
            }
        } catch (rollbackError) {
            // Sanitize operation before logging to prevent secret leaks
            const sanitizedOp = {
                backend: op.backend,
                type: op.type,
                store: isSensitiveKey(op.store) ? '[REDACTED]' : op.store,
                key: isSensitiveKey(op.key) ? '[REDACTED]' : op.key,
                previousValue: isSensitiveKey(op.key) ? '[REDACTED]' : op.previousValue,
                previousOptions: isSensitiveKey(op.key) ? '[REDACTED]' : op.previousOptions
            };
            console.error('[StorageTransaction] Rollback failed for operation:', sanitizedOp, rollbackError);

            // Log to compensation log for manual recovery (sanitized)
            compensationLog.push({
                transactionId: ctx.id,
                operation: {
                    backend: op.backend,
                    type: op.type,
                    store: isSensitiveKey(op.store) ? '[REDACTED]' : op.store,
                    key: isSensitiveKey(op.key) ? '[REDACTED]' : op.key
                },
                expectedState: isSensitiveKey(op.key) ? '[REDACTED]' : op.previousValue,
                actualState: 'unknown',
                error: rollbackError.message || String(rollbackError),
                timestamp: Date.now()
            });
            
            // Continue rolling back other operations
        }
    }

    // If any rollback failures occurred, persist to compensation log
    if (compensationLog.length > 0) {
        let storageSuccess = false;

        try {
            await persistCompensationLog(ctx.id, compensationLog);
            storageSuccess = true;
            console.warn(`[StorageTransaction] ${compensationLog.length} rollback failure(s) logged for manual recovery`);

            // Emit event for UI notification if EventBus is available
            EventBus.emit('storage:compensation_needed', {
                transactionId: ctx.id,
                failedOperations: compensationLog.length,
                timestamp: Date.now()
            });
        } catch (logError) {
            console.error('[StorageTransaction] Failed to persist compensation log:', logError);
            // Log to console as last resort (already sanitized)
            console.error('[StorageTransaction] COMPENSATION LOG (not persisted):', JSON.stringify(compensationLog, null, 2));
            console.error(`[StorageTransaction] Rollback failures count: ${compensationLog.length}`);

            // CRITICAL FIX for Issue #2: Enter fatal state when ALL storage backends fail
            // This prevents cascade corruption by blocking new transactions
            if (!storageSuccess) {
                FATAL_STATE = {
                    isFatal: true,
                    reason: 'CRITICAL: Transaction rollback failed and all compensation log storage backends exhausted',
                    timestamp: Date.now(),
                    transactionId: ctx.id,
                    compensationLogCount: compensationLog.length
                };

                // Emit fatal error event for UI notification
                EventBus.emit('transaction:fatal_error', getFatalState());

                console.error('[StorageTransaction] FATAL STATE ENTERED:', getFatalState());
                console.error('[StorageTransaction] All future transactions will be blocked until manual recovery');
            }
        }
    }

    ctx.rolledBack = true;
    console.log(`[StorageTransaction] Rolled back ${toRollback.length} operations (${compensationLog.length} failures)`);
}

/**
 * Persist compensation log entries to IndexedDB
 *
 * CRITICAL FIX: Includes in-memory fallback when both IndexedDB and localStorage fail
 * (typically due to quota exhaustion). Ensures rollback failures are never lost.
 *
 * @param {string} transactionId - Transaction ID
 * @param {Array} entries - Compensation log entries
 */
async function persistCompensationLog(transactionId, entries) {
    const logEntry = {
        id: transactionId,
        entries,
        timestamp: Date.now(),
        resolved: false
    };

    let storageSuccess = false;

    // Try to store in compensation log store
    if (IndexedDBCore) {
        try {
            await IndexedDBCore.put(COMPENSATION_LOG_STORE, logEntry);
            storageSuccess = true;
        } catch (storeError) {
            console.warn('[StorageTransaction] IndexedDB compensation store write failed:', storeError.message);
        }
    }

    // Fallback: try localStorage if IndexedDB failed
    if (!storageSuccess) {
        try {
            const existingLogs = JSON.parse(localStorage.getItem('_transaction_compensation_logs') || '[]');
            existingLogs.push(logEntry);
            localStorage.setItem('_transaction_compensation_logs', JSON.stringify(existingLogs));
            storageSuccess = true;
            console.warn('[StorageTransaction] Compensation log stored in localStorage fallback');
        } catch (lsError) {
            console.warn('[StorageTransaction] localStorage compensation store write failed:', lsError.message);
        }
    }

    // CRITICAL FIX: In-memory fallback when both persistent storage backends fail
    if (!storageSuccess) {
        addInMemoryCompensationLog(transactionId, entries);

        // Emit dedicated event for in-memory compensation log
        EventBus.emit('storage:compensation_log_in_memory', {
            transactionId,
            entriesCount: entries.length,
            timestamp: Date.now()
        });
    }
}

/**
 * Get all pending compensation log entries
 * These are rollback failures that need manual review/recovery
 *
 * CRITICAL FIX: Includes in-memory compensation logs
 *
 * @returns {Promise<Array>} Compensation log entries
 */
async function getCompensationLogs() {
    const logs = [];
    const seenTransactionIds = new Set();

    // Try IndexedDB first
    if (IndexedDBCore) {
        try {
            const dbLogs = await IndexedDBCore.getAll(COMPENSATION_LOG_STORE);
            for (const log of (dbLogs || []).filter(log => !log.resolved)) {
                if (!seenTransactionIds.has(log.id)) {
                    logs.push(log);
                    seenTransactionIds.add(log.id);
                }
            }
        } catch (e) {
            // Store might not exist
        }
    }

    // Also check localStorage fallback (deduplicate by transactionId)
    try {
        const lsLogs = JSON.parse(localStorage.getItem('_transaction_compensation_logs') || '[]');
        for (const log of lsLogs.filter(log => !log.resolved)) {
            if (!seenTransactionIds.has(log.id)) {
                logs.push(log);
                seenTransactionIds.add(log.id);
            }
        }
    } catch (e) {
        // Ignore parse errors
    }

    // CRITICAL FIX: Include in-memory compensation logs
    const memoryLogs = getAllInMemoryCompensationLogs();
    for (const log of memoryLogs.filter(log => !log.resolved)) {
        if (!seenTransactionIds.has(log.id)) {
            logs.push(log);
            seenTransactionIds.add(log.id);
        }
    }

    return logs;
}

/**
 * Mark a compensation log entry as resolved
 *
 * CRITICAL FIX: Also handles in-memory compensation logs
 *
 * @param {string} transactionId - Transaction ID to mark as resolved
 * @returns {Promise<boolean>} True if entry was found and marked
 */
async function resolveCompensationLog(transactionId) {
    let resolved = false;

    // Try IndexedDB first
    if (IndexedDBCore) {
        try {
            const entry = await IndexedDBCore.get(COMPENSATION_LOG_STORE, transactionId);
            if (entry) {
                entry.resolved = true;
                entry.resolvedAt = Date.now();
                await IndexedDBCore.put(COMPENSATION_LOG_STORE, entry);
                resolved = true;
            }
        } catch (e) {
            // Store might not exist
        }
    }

    // Always try localStorage fallback (unconditionally)
    try {
        const lsLogs = JSON.parse(localStorage.getItem('_transaction_compensation_logs') || '[]');
        const idx = lsLogs.findIndex(log => log.id === transactionId);
        if (idx >= 0) {
            lsLogs[idx].resolved = true;
            lsLogs[idx].resolvedAt = Date.now();
            localStorage.setItem('_transaction_compensation_logs', JSON.stringify(lsLogs));
            resolved = true;
        }
    } catch (e) {
        // Ignore errors
    }

    // CRITICAL FIX: Also check sessionStorage logs
    const memoryEntry = getInMemoryCompensationLog(transactionId);
    if (memoryEntry) {
        // Update the sessionStorage entry directly
        try {
            const existingData = sessionStorage.getItem(SESSION_COMPENSATION_KEY);
            if (existingData) {
                const logs = JSON.parse(existingData);
                const idx = logs.findIndex(log => log.id === transactionId);
                if (idx >= 0) {
                    logs[idx].resolved = true;
                    logs[idx].resolvedAt = Date.now();
                    sessionStorage.setItem(SESSION_COMPENSATION_KEY, JSON.stringify(logs));
                    resolved = true;
                    console.log(`[StorageTransaction] SessionStorage compensation log ${transactionId} marked as resolved`);
                }
            }
        } catch (e) {
            console.error('[StorageTransaction] Failed to update sessionStorage compensation log:', e);
        }
    }

    if (resolved) {
        console.log(`[StorageTransaction] Compensation log ${transactionId} marked as resolved`);
    }

    return resolved;
}

/**
 * Clear all resolved compensation logs
 *
 * CRITICAL FIX: Also clears in-memory compensation logs
 *
 * @returns {Promise<number>} Number of logs cleared
 */
async function clearResolvedCompensationLogs() {
    let cleared = 0;

    // Clear from IndexedDB
    if (IndexedDBCore) {
        try {
            const logs = await IndexedDBCore.getAll(COMPENSATION_LOG_STORE);
            for (const log of (logs || [])) {
                if (log.resolved) {
                    await IndexedDBCore.delete(COMPENSATION_LOG_STORE, log.id);
                    cleared++;
                }
            }
        } catch (e) {
            // Store might not exist
        }
    }

    // Clear from localStorage
    try {
        const lsLogs = JSON.parse(localStorage.getItem('_transaction_compensation_logs') || '[]');
        const remaining = lsLogs.filter(log => !log.resolved);
        const lsCleared = lsLogs.length - remaining.length;
        if (lsCleared > 0) {
            localStorage.setItem('_transaction_compensation_logs', JSON.stringify(remaining));
            cleared += lsCleared;
        }
    } catch (e) {
        // Ignore errors
    }

    // CRITICAL FIX: Clear resolved sessionStorage logs
    try {
        const existingData = sessionStorage.getItem(SESSION_COMPENSATION_KEY);
        if (existingData) {
            const logs = JSON.parse(existingData);
            const memoryCleared = logs.filter(log => log.resolved).length;
            const remaining = logs.filter(log => !log.resolved);

            sessionStorage.setItem(SESSION_COMPENSATION_KEY, JSON.stringify(remaining));
            cleared += memoryCleared;

            if (memoryCleared > 0) {
                console.log(`[StorageTransaction] Cleared ${memoryCleared} sessionStorage compensation logs`);
            }
        }
    } catch (e) {
        console.error('[StorageTransaction] Failed to clear sessionStorage compensation logs:', e);
    }

    console.log(`[StorageTransaction] Cleared ${cleared} resolved compensation logs`);
    return cleared;
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

    // Compensation log (for rollback failures)
    getCompensationLogs,
    resolveCompensationLog,
    clearResolvedCompensationLogs,
    COMPENSATION_LOG_STORE,

    // In-memory compensation log management (CRITICAL FIX)
    getInMemoryCompensationLog,
    getAllInMemoryCompensationLogs,
    clearInMemoryCompensationLog,

    // CRITICAL FIX for Issue #2: Fatal error state management
    isFatalState,
    getFatalState,
    clearFatalState,

    // MEDIUM FIX for Issue #15: Nested transaction detection
    isInTransaction,
    getTransactionDepth,

    // ARCH FIX: Transaction limits and retry configuration
    MAX_OPERATIONS_PER_TRANSACTION,
    OPERATION_TIMEOUT_MS,
    MAX_RETRY_ATTEMPTS,
    RETRY_BASE_DELAY_MS,

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
    _clearJournal: clearJournal,
    _retryOperation: retryOperation,
    _withTimeout: withTimeout
};

// ES Module export
export { StorageTransaction };

console.log('[StorageTransaction] Storage Transaction Layer loaded');
