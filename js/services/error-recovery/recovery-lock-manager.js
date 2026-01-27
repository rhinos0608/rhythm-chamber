/**
 * Recovery Lock Manager Module
 *
 * Lock management and cross-tab coordination for recovery operations.
 * Extracted from error-recovery-coordinator.js for better separation of concerns.
 *
 * @module RecoveryLockManager
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

/**
 * RecoveryLockManager Class
 *
 * Manages lock acquisition, state validation, and cross-tab coordination
 * for recovery operations.
 */
export class RecoveryLockManager {
    /**
     * @private
     * @type {Object}
     */
    _eventBus;

    /**
     * @private
     * @type {Object}
     */
    _operationLock;

    /**
     * @private
     * @type {Object}
     */
    _tabCoordinator;

    /**
     * @private
     * @type {Object}
     */
    _stateMachine;

    /**
     * @private
     * @type {boolean}
     */
    _isPrimaryTab = false;

    /**
     * @private
     * @type {BroadcastChannel|null}
     */
    _recoveryChannel = null;

    /**
     * Initialize RecoveryLockManager
     * @public
     * @param {Object} dependencies - Service dependencies
     * @param {Object} dependencies.eventBus - Event bus
     * @param {Object} dependencies.operationLock - Operation lock service (optional)
     * @param {Object} dependencies.tabCoordinator - Tab coordination service (optional)
     * @param {Object} dependencies.stateMachine - State machine coordinator (optional)
     */
    constructor({ eventBus, operationLock, tabCoordinator, stateMachine } = {}) {
        this._eventBus = eventBus;
        this._operationLock = operationLock;
        this._tabCoordinator = tabCoordinator;
        this._stateMachine = stateMachine;
    }

    /**
     * Acquire recovery lock
     * @public
     * @param {string} lockName - Lock name
     * @returns {Promise<string|null>} Lock ID or null if lock not acquired
     * @throws {Error} If lock acquisition fails
     */
    async acquireRecoveryLock(lockName) {
        if (!this._operationLock) {
            console.warn('[RecoveryLockManager] OperationLock unavailable, skipping lock');
            return null;
        }

        try {
            const lockId = await this._operationLock.acquire(lockName);
            return lockId;
        } catch (error) {
            console.warn('[RecoveryLockManager] Failed to acquire lock:', error);
            throw new Error(`Cannot acquire recovery lock: ${lockName}`);
        }
    }

    /**
     * Validate recovery state
     * @public
     * @param {Object} request - Recovery request
     * @returns {Promise<void>}
     * @throws {Error} If recovery not allowed in current state
     */
    async validateRecoveryState(request) {
        if (!this._stateMachine) {
            // Allow recovery if state machine unavailable (defensive)
            console.warn('[RecoveryLockManager] StateMachine unavailable, skipping state validation');
            return;
        }

        // Validate current application state
        const currentState = this._stateMachine.getCurrentState();

        // Check if recovery is allowed in current state
        const allowedStates = ['idle', 'error', 'demo'];
        if (!allowedStates.includes(currentState)) {
            throw new Error(`Recovery not allowed in state: ${currentState}`);
        }
    }

    /**
     * Coordinate recovery across tabs
     * @public
     * @param {Object} request - Recovery request
     * @returns {Promise<void>}
     */
    async coordinateRecoveryTabs(request) {
        // Notify other tabs of recovery
        this._eventBus.emit('RECOVERY:STARTED', {
            recoveryId: request.id,
            tabId: request.tabId,
            domain: request.domain
        });
    }

    /**
     * Broadcast recovery request to leader tab for delegation
     * HNW Network: Non-leader tabs delegate recovery to leader for coordination
     *
     * @public
     * @param {Object} request - Recovery request to delegate
     * @returns {Promise<{ delegated: boolean, reason: string }>}
     */
    async broadcastRecoveryRequest(request) {
        // If we're the leader or no tab coordinator, handle locally
        if (!this._tabCoordinator || this._tabCoordinator.isPrimary()) {
            return { delegated: false, reason: 'is_leader' };
        }

        // HNW Hierarchy: Check delegation attempts limit
        if (request.delegationAttempts >= request.maxDelegations) {
            console.warn(`[RecoveryLockManager] Max delegations (${request.maxDelegations}) reached for recovery ${request.id}`);
            this._eventBus.emit('RECOVERY:DELEGATION_EXHAUSTED', {
                recoveryId: request.id,
                attempts: request.delegationAttempts
            });
            return { delegated: false, reason: 'max_delegations_reached' };
        }

        // Increment delegation attempts
        request.delegationAttempts = (request.delegationAttempts || 0) + 1;

        try {
            // Get VectorClock for causal ordering
            const vectorClock = this._tabCoordinator.getVectorClockState?.() || {};

            // Create BroadcastChannel for recovery delegation
            const channel = new BroadcastChannel('rhythm_chamber_recovery');

            const delegationMessage = {
                type: 'RECOVERY_DELEGATION',
                request: {
                    id: request.id,
                    domain: request.domain,
                    priority: request.priority,
                    error: request.error?.message || 'Unknown error',
                    context: request.context,
                    timestamp: request.timestamp,
                    // HNW Hierarchy: Pass TTL and delegation tracking
                    expiresAt: request.expiresAt,
                    delegationAttempts: request.delegationAttempts,
                    maxDelegations: request.maxDelegations
                },
                vectorClock,
                sourceTabId: this._tabCoordinator.getTabId(),
                delegatedAt: Date.now()
            };

            channel.postMessage(delegationMessage);
            channel.close();

            console.log(`[RecoveryLockManager] Delegated recovery ${request.id} to leader tab (attempt ${request.delegationAttempts}/${request.maxDelegations})`);

            this._eventBus.emit('RECOVERY:DELEGATED', {
                recoveryId: request.id,
                sourceTabId: this._tabCoordinator.getTabId(),
                delegationAttempt: request.delegationAttempts
            });

            return { delegated: true, reason: 'delegated_to_leader' };

        } catch (error) {
            console.warn('[RecoveryLockManager] Failed to broadcast recovery:', error);
            return { delegated: false, reason: 'broadcast_failed' };
        }
    }

    /**
     * Handle incoming delegated recovery requests (leader only)
     * @public
     * @param {Object} message - Delegated recovery message
     * @returns {Promise<void>}
     */
    async handleDelegatedRecovery(message) {
        if (this._tabCoordinator && !this._tabCoordinator.isPrimary()) {
            console.log('[RecoveryLockManager] Ignoring delegated recovery - not leader');
            return;
        }

        // Merge VectorClock for causal ordering
        if (message.vectorClock && this._tabCoordinator?.getVectorClock) {
            const localClock = this._tabCoordinator.getVectorClock();
            if (localClock) {
                localClock.merge(message.vectorClock);
            }
        }

        // Reconstruct request
        const request = {
            ...message.request,
            error: new Error(message.request.error),
            tabId: message.sourceTabId,
            dependencies: []
        };

        console.log(`[RecoveryLockManager] Processing delegated recovery from tab ${message.sourceTabId}`);

        // Emit event for coordinator to process
        this._eventBus.emit('RECOVERY:DELEGATED_REQUEST', { request });
    }

    /**
     * Monitor tab leadership status
     * @public
     * @returns {Promise<void>}
     */
    async monitorTabLeadership() {
        // Update primary tab status (graceful degradation if TabCoordinator unavailable)
        const checkLeadership = async () => {
            if (this._tabCoordinator && this._tabCoordinator.isPrimary) {
                this._isPrimaryTab = this._tabCoordinator.isPrimary();
            } else {
                // Default to primary if TabCoordinator unavailable
                this._isPrimaryTab = true;
            }
        };

        await checkLeadership();

        // Subscribe to leadership changes if TabCoordinator is available
        if (this._tabCoordinator && this._tabCoordinator.on) {
            try {
                this._tabCoordinator.on('leadership-change', checkLeadership);
            } catch (e) {
                console.warn('[RecoveryLockManager] Failed to subscribe to leadership changes:', e);
            }
        }
    }

    /**
     * Setup BroadcastChannel listener for recovery delegation
     * @public
     */
    setupDelegationListener() {
        if (typeof BroadcastChannel === 'undefined') {
            console.log('[RecoveryLockManager] BroadcastChannel not available, skipping delegation listener');
            return;
        }

        try {
            this._recoveryChannel = new BroadcastChannel('rhythm_chamber_recovery');
            this._recoveryChannel.onmessage = async (event) => {
                if (event.data?.type === 'RECOVERY_DELEGATION') {
                    await this.handleDelegatedRecovery(event.data);
                }
            };
            console.log('[RecoveryLockManager] Recovery delegation listener active');
        } catch (e) {
            console.warn('[RecoveryLockManager] Failed to setup delegation listener:', e);
        }
    }

    /**
     * Check if this is the primary tab
     * @public
     * @returns {boolean} True if primary tab
     */
    isPrimaryTab() {
        return this._isPrimaryTab;
    }

    /**
     * Release recovery lock
     * @public
     * @param {string} lockName - Lock name
     * @param {string} lockId - Lock ID
     * @returns {Promise<void>}
     */
    async releaseRecoveryLock(lockName, lockId) {
        if (!this._operationLock) {
            return;
        }

        try {
            await this._operationLock.release(lockName, lockId);
        } catch (e) {
            console.warn('[RecoveryLockManager] Failed to release lock:', e);
        }
    }

    /**
     * Cleanup resources
     * @public
     */
    destroy() {
        if (this._recoveryChannel) {
            this._recoveryChannel.close();
            this._recoveryChannel = null;
        }
    }
}
