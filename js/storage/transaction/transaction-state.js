/**
 * Transaction State Management
 *
 * Manages fatal error state and nested transaction detection.
 * Prevents cascade failures and undefined behavior.
 *
 * @module storage/transaction/transaction-state
 */

import { EventBus } from '../../services/event-bus.js';

// ==========================================
// Fatal Error State
// ==========================================

/**
 * CRITICAL: Fatal error state prevents cascade failures
 *
 * When transaction rollback fails and all compensation logging fails,
 * the system enters a fatal state where data integrity cannot be guaranteed.
 * All new transactions are blocked until the fatal state is cleared.
 */
let FATAL_STATE = {
    isFatal: false,
    reason: null,
    timestamp: null,
    transactionId: null,
    compensationLogCount: 0,
};

// ==========================================
// Nested Transaction Detection
// ==========================================

let transactionDepth = 0;
const NESTED_TRANSACTION_STACK = [];

/**
 * Manages fatal error state for transactions
 */
export class TransactionStateManager {
    /**
     * Check if system is in fatal error state
     * @returns {boolean} True if in fatal state
     */
    static isFatalState() {
        return FATAL_STATE.isFatal;
    }

    /**
     * Get fatal error state details
     * @returns {Object|null} Fatal state or null if not fatal
     */
    static getFatalState() {
        if (!FATAL_STATE.isFatal) {
            return null;
        }
        return { ...FATAL_STATE };
    }

    /**
     * Enter fatal error state (blocks all new transactions)
     * @param {string} reason - Reason for fatal state
     * @param {string} transactionId - Failed transaction ID
     * @param {number} compensationLogCount - Number of compensation logs
     */
    static enterFatalState(reason, transactionId, compensationLogCount = 0) {
        console.error('[TransactionState] Entering FATAL state:', reason);

        FATAL_STATE = {
            isFatal: true,
            reason,
            timestamp: Date.now(),
            transactionId,
            compensationLogCount,
        };

        EventBus.emit('transaction:fatal_state', { ...FATAL_STATE });
    }

    /**
     * Clear fatal error state (requires explicit user action)
     * @param {string} reason - Reason for clearing
     */
    static clearFatalState(reason = 'Manual recovery') {
        if (FATAL_STATE.isFatal) {
            console.warn('[TransactionState] Fatal state cleared:', reason);
            FATAL_STATE = {
                isFatal: false,
                reason: null,
                timestamp: null,
                transactionId: null,
                compensationLogCount: 0,
            };
            EventBus.emit('transaction:fatal_cleared', { reason, timestamp: Date.now() });
        }
    }
}

/**
 * Guards against nested transaction hazards
 */
export class NestedTransactionGuard {
    /**
     * Check if currently inside a transaction
     * @returns {boolean} True if a transaction is active
     */
    static isInTransaction() {
        return transactionDepth > 0;
    }

    /**
     * Get current transaction depth
     * @returns {number} Current nesting depth
     */
    static getTransactionDepth() {
        return transactionDepth;
    }

    /**
     * Enter transaction (increment depth)
     * @param {string} transactionId - Transaction ID for tracking
     * @throws {Error} If nested transaction detected
     */
    static enterTransaction(transactionId) {
        if (transactionDepth > 0) {
            const error = new Error(
                '[TransactionState] Nested transaction detected. ' +
                    `Current: ${NESTED_TRANSACTION_STACK[transactionDepth - 1]}, ` +
                    `Attempted: ${transactionId}. ` +
                    'Nested transactions can cause deadlocks and undefined behavior.'
            );
            console.error(error.message);
            throw error;
        }

        transactionDepth++;
        NESTED_TRANSACTION_STACK.push(transactionId);
    }

    /**
     * Exit transaction (decrement depth)
     * @param {string} transactionId - Transaction ID to verify
     * @throws {Error} If transaction ID doesn't match
     */
    static exitTransaction(transactionId) {
        const topId = NESTED_TRANSACTION_STACK.pop();

        if (topId !== transactionId) {
            console.error(
                '[TransactionState] Transaction depth mismatch. ' +
                    `Expected: ${topId}, Got: ${transactionId}`
            );
        }

        transactionDepth = Math.max(0, transactionDepth - 1);
    }
}
