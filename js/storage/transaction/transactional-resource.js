/**
 * Transactional Resource Interface
 *
 * Defines the contract that storage backends must implement to participate
 * in the two-phase commit protocol.
 *
 * @module storage/transaction/transactional-resource
 */

/**
 * Base class for transactional storage resources
 * Implements the two-phase commit protocol: prepare, commit, rollback
 */
export class TransactionalResource {
    /**
     * Prepare the resource to commit changes
     * This is the "voting" phase - guarantees that commit() will succeed
     *
     * @param {Object} context - Transaction context
     * @param {string} context.transactionId - Unique transaction identifier
     * @returns {Promise<void>}
     * @throws {Error} If prepare fails (votes NO)
     */
    async prepare(context) {
        throw new Error('TransactionalResource.prepare() must be implemented');
    }

    /**
     * Commit the prepared changes
     * Must be idempotent - safe to call multiple times with same context
     *
     * @param {Object} context - Transaction context
     * @returns {Promise<void>}
     */
    async commit(context) {
        throw new Error('TransactionalResource.commit() must be implemented');
    }

    /**
     * Rollback prepared or partially applied changes
     *
     * @param {Object} context - Transaction context
     * @returns {Promise<void>}
     */
    async rollback(context) {
        throw new Error('TransactionalResource.rollback() must be implemented');
    }

    /**
     * Recovery handler for application startup
     * Scans for pending data and decides roll-forward vs rollback based on commit marker
     *
     * @param {Function} isTxPendingCommit - Callback to check if transaction has commit marker
     * @param {string} transactionId - Transaction ID to check
     * @returns {Promise<boolean>} - True if transaction should be rolled forward
     * @returns {Promise<void>}
     */
    async recover(isTxPendingCommit) {
        throw new Error('TransactionalResource.recover() must be implemented');
    }
}
