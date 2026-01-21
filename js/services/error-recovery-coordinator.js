/**
 * ErrorRecoveryCoordinator - Centralized Error Recovery Authority
 *
 * This service acts as the single authority for all error recovery decisions,
 * resolving conflicts between multiple recovery handlers (Security, Storage, UI, Operational).
 * Implements HNW Hierarchy principles with prioritized recovery chains and race condition prevention.
 *
 * @module ErrorRecoveryCoordinator
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { EventBus } from './event-bus.js';

// Lazy imports to prevent circular dependency
// These are only imported when actually needed, breaking the bootstrap paradox
let _OperationLock = null;
let _TabCoordinator = null;
let _StateMachineCoordinator = null;

/**
 * Recovery priority levels (higher = more important)
 * @readonly
 * @enum {number}
 */
export const RecoveryPriority = Object.freeze({
    CRITICAL: 100,  // Security threats, data corruption
    HIGH: 75,       // Storage failures, data loss risk
    MEDIUM: 50,     // UI failures, user experience
    LOW: 25         // Operational issues, retries
});

/**
 * Recovery domain categories
 * @readonly
 * @enum {string}
 */
export const RecoveryDomain = Object.freeze({
    SECURITY: 'security',
    STORAGE: 'storage',
    UI: 'ui',
    OPERATIONAL: 'operational',
    NETWORK: 'network',
    PROVIDER: 'provider'
});

/**
 * Recovery state enumeration
 * @readonly
 * @enum {string}
 */
export const RecoveryState = Object.freeze({
    IDLE: 'idle',
    ASSESSING: 'assessing',
    RECOVERING: 'recovering',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
});

/**
 * Recovery action result
 * @typedef {Object} RecoveryResult
 * @property {boolean} success - Whether recovery succeeded
 * @property {string} action - Action taken
 * @property {number} durationMs - Recovery duration in milliseconds
 * @property {Error|null} error - Error if recovery failed
 * @property {Object} metadata - Additional recovery metadata
 */

/**
 * Recovery request structure
 * @typedef {Object} RecoveryRequest
 * @property {string} id - Unique recovery request ID
 * @property {RecoveryDomain} domain - Recovery domain
 * @property {RecoveryPriority} priority - Recovery priority
 * @property {Error} error - Original error
 * @property {Object} context - Additional context for recovery
 * @property {string[]} dependencies - Recovery step dependencies
 * @property {number} timestamp - Request timestamp
 * @property {string} tabId - Tab that initiated recovery
 * @property {number} expiresAt - Recovery TTL expiration time (HNW Hierarchy)
 * @property {number} delegationAttempts - Number of delegation attempts (HNW Hierarchy)
 * @property {number} maxDelegations - Maximum allowed delegations (HNW Hierarchy)
 */

/**
 * Recovery TTL configuration
 * @readonly
 */
const RECOVERY_TTL_MS = 60000; // 60 seconds
const MAX_DELEGATION_ATTEMPTS = 3;

/**
 * Recovery plan structure
 * @typedef {Object} RecoveryPlan
 * @property {RecoveryRequest} request - Original recovery request
 * @property {Function[]} steps - Ordered recovery steps
 * @property {number} estimatedDurationMs - Estimated total duration
 * @property {boolean} requiresLock - Whether recovery requires operation lock
 * @property {string} lockName - Name of lock if required
 */

/**
 * Recovery telemetry data
 * @typedef {Object} RecoveryTelemetry
 * @property {RecoveryResult[]} history - Recovery attempt history
 * @property {Map<RecoveryDomain, number>} domainCounts - Recovery counts per domain
 * @property {Map<string, number>} errorCounts - Error occurrence counts
 * @property {number} totalRecoveryTimeMs - Total time spent in recovery
 * @property {number} successRate - Recovery success rate (0-1)
 */

/**
 * ErrorRecoveryCoordinator Class
 *
 * Centralized authority for error recovery across all application domains.
 * Implements prioritized recovery chains with race condition prevention.
 */
export class ErrorRecoveryCoordinator {
    /**
     * @private
     * @type {Map<string, RecoveryRequest>}
     */
    _activeRecoveries = new Map();

    /**
     * @private
     * @type {Map<string, RecoveryPlan>}
     */
    _recoveryPlans = new Map();

    /**
     * @private
     * @type {Map<RecoveryDomain, Array<Function>>}
     */
    _recoveryHandlers = new Map();

    /**
     * @private
     * @type {RecoveryTelemetry}
     */
    _telemetry = {
        history: [],
        domainCounts: new Map(Object.values(RecoveryDomain).map(d => [d, 0])),
        errorCounts: new Map(),
        totalRecoveryTimeMs: 0,
        successRate: 0
    };

    /**
     * @private
     * @type {RecoveryState}
     */
    _currentState = RecoveryState.IDLE;

    /**
     * @private
     * @type {string|null}
     */
    _currentRecoveryId = null;

    /**
     * @private
     * @type {boolean}
     */
    _isPrimaryTab = false;

    /**
     * @private
     * @type {number}
     */
    _maxQueueDepth = 10;

    /**
     * @private
     * @type {number}
     */
    _queueTimeoutMs = 30000;

    /**
     * Initialize the ErrorRecoveryCoordinator
     * @public
     * @param {Object} dependencies - Service dependencies (all optional)
     * @param {EventBus} dependencies.eventBus - Event bus for error events
     * @param {OperationLock} dependencies.operationLock - Operation lock service (optional)
     * @param {TabCoordinator} dependencies.tabCoordinator - Tab coordination service (optional)
     * @param {StateMachineCoordinator} dependencies.stateMachine - State machine coordinator (optional)
     * @param {number} dependencies.maxQueueDepth - Maximum recovery queue depth (default: 10)
     * @param {number} dependencies.queueTimeoutMs - Queue timeout in milliseconds (default: 30000)
     */
    constructor({ eventBus, operationLock, tabCoordinator, stateMachine, maxQueueDepth = 10, queueTimeoutMs = 30000 } = {}) {
        this._eventBus = eventBus || EventBus;

        // Store optional dependencies (will be lazily loaded if not provided)
        if (operationLock) _OperationLock = operationLock;
        if (tabCoordinator) _TabCoordinator = tabCoordinator;
        if (stateMachine) _StateMachineCoordinator = stateMachine;

        this._maxQueueDepth = maxQueueDepth;
        this._queueTimeoutMs = queueTimeoutMs;

        this._initializeRecoveryHandlers();
        this._subscribeToErrorEvents();
        this._monitorTabLeadership();

        performance.mark('error-recovery-coordinator-init');
    }

    /**
     * Lazy load OperationLock
     * @private
     * @returns {Promise<OperationLock|null>} OperationLock instance or null
     */
    async _getOperationLock() {
        if (!_OperationLock) {
            try {
                // Dynamic import to avoid circular dependency
                const module = await import('../operation-lock.js');
                _OperationLock = module.OperationLock;
            } catch (e) {
                console.warn('[ErrorRecoveryCoordinator] Failed to lazy load OperationLock:', e);
                return null;
            }
        }
        return _OperationLock;
    }

    /**
     * Lazy load TabCoordinator
     * @private
     * @returns {Promise<TabCoordinator|null>} TabCoordinator instance or null
     */
    async _getTabCoordinator() {
        if (!_TabCoordinator) {
            try {
                const module = await import('./tab-coordination.js');
                _TabCoordinator = module.TabCoordinator;
            } catch (e) {
                console.warn('[ErrorRecoveryCoordinator] Failed to lazy load TabCoordinator:', e);
                return null;
            }
        }
        return _TabCoordinator;
    }

    /**
     * Lazy load StateMachineCoordinator
     * @private
     * @returns {Promise<StateMachineCoordinator|null>} StateMachineCoordinator instance or null
     */
    async _getStateMachine() {
        if (!_StateMachineCoordinator) {
            try {
                const module = await import('./state-machine-coordinator.js');
                _StateMachineCoordinator = module.StateMachineCoordinator;
            } catch (e) {
                console.warn('[ErrorRecoveryCoordinator] Failed to lazy load StateMachineCoordinator:', e);
                return null;
            }
        }
        return _StateMachineCoordinator;
    }

    /**
     * Initialize recovery handlers for each domain
     * @private
     */
    _initializeRecoveryHandlers() {
        // Security domain handlers
        this._recoveryHandlers.set(RecoveryDomain.SECURITY, [
            this._handleSecurityError.bind(this)
        ]);

        // Storage domain handlers
        this._recoveryHandlers.set(RecoveryDomain.STORAGE, [
            this._handleStorageError.bind(this)
        ]);

        // UI domain handlers
        this._recoveryHandlers.set(RecoveryDomain.UI, [
            this._handleUIError.bind(this)
        ]);

        // Operational domain handlers
        this._recoveryHandlers.set(RecoveryDomain.OPERATIONAL, [
            this._handleOperationalError.bind(this)
        ]);

        // Network domain handlers
        this._recoveryHandlers.set(RecoveryDomain.NETWORK, [
            this._handleNetworkError.bind(this)
        ]);

        // Provider domain handlers
        this._recoveryHandlers.set(RecoveryDomain.PROVIDER, [
            this._handleProviderError.bind(this)
        ]);
    }

    /**
     * Subscribe to error events from EventBus
     * @private
     */
    _subscribeToErrorEvents() {
        // Subscribe to all error events with highest priority
        this._eventBus.on('ERROR:*', async (event, data) => {
            await this._handleErrorEvent(event, data);
        }, { priority: 1000 });

        // Subscribe to security-specific errors
        this._eventBus.on('SECURITY:ERROR', async (event, data) => {
            await this._handleSecurityError(data);
        }, { priority: 1000 });

        // Subscribe to storage errors
        this._eventBus.on('STORAGE:ERROR', async (event, data) => {
            await this._handleStorageError(data);
        }, { priority: 1000 });

        // Listen for delegated recovery requests via BroadcastChannel
        this._setupRecoveryDelegationListener();
    }

    /**
     * Setup BroadcastChannel listener for recovery delegation
     * @private
     */
    _setupRecoveryDelegationListener() {
        if (typeof BroadcastChannel === 'undefined') {
            console.log('[ErrorRecoveryCoordinator] BroadcastChannel not available, skipping delegation listener');
            return;
        }

        try {
            this._recoveryChannel = new BroadcastChannel('rhythm_chamber_recovery');
            this._recoveryChannel.onmessage = async (event) => {
                if (event.data?.type === 'RECOVERY_DELEGATION') {
                    await this._handleDelegatedRecovery(event.data);
                }
            };
            console.log('[ErrorRecoveryCoordinator] Recovery delegation listener active');
        } catch (e) {
            console.warn('[ErrorRecoveryCoordinator] Failed to setup delegation listener:', e);
        }
    }

    /**
     * Monitor tab leadership status
     * @private
     */
    async _monitorTabLeadership() {
        // Update primary tab status (graceful degradation if TabCoordinator unavailable)
        const checkLeadership = async () => {
            const tabCoordinator = await this._getTabCoordinator();
            if (tabCoordinator && tabCoordinator.isPrimary) {
                this._isPrimaryTab = tabCoordinator.isPrimary();
            } else {
                // Default to primary if TabCoordinator unavailable
                this._isPrimaryTab = true;
            }
        };

        await checkLeadership();

        // Subscribe to leadership changes if TabCoordinator is available
        const tabCoordinator = await this._getTabCoordinator();
        if (tabCoordinator && tabCoordinator.on) {
            try {
                tabCoordinator.on('leadership-change', checkLeadership);
            } catch (e) {
                console.warn('[ErrorRecoveryCoordinator] Failed to subscribe to leadership changes:', e);
            }
        }
    }

    /**
     * Handle incoming error events
     * @private
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    async _handleErrorEvent(event, data) {
        performance.mark(`error-recovery-${event}-start`);

        try {
            // Determine recovery domain from event
            const domain = this._determineRecoveryDomain(event, data);

            // Determine priority from error severity
            const priority = this._determineRecoveryPriority(data);

            // Create recovery request
            const request = await this._createRecoveryRequest(domain, priority, data);

            // Process recovery
            await this.coordinateRecovery(request);

        } catch (error) {
            console.error('[ErrorRecoveryCoordinator] Failed to handle error event:', error);
            this._recordTelemetry(null, error);
        } finally {
            performance.measure(`error-recovery-${event}`, `error-recovery-${event}-start`);
        }
    }

    /**
     * Determine recovery domain from event and error data
     * @private
     * @param {string} event - Event name
     * @param {Object} data - Error data
     * @returns {RecoveryDomain} Recovery domain
     */
    _determineRecoveryDomain(event, data) {
        if (event.startsWith('SECURITY:') || data.domain === 'security') {
            return RecoveryDomain.SECURITY;
        }
        if (event.startsWith('STORAGE:') || data.domain === 'storage') {
            return RecoveryDomain.STORAGE;
        }
        if (event.startsWith('UI:') || data.domain === 'ui') {
            return RecoveryDomain.UI;
        }
        if (event.startsWith('NETWORK:') || data.domain === 'network') {
            return RecoveryDomain.NETWORK;
        }
        if (event.startsWith('PROVIDER:') || data.domain === 'provider') {
            return RecoveryDomain.PROVIDER;
        }
        return RecoveryDomain.OPERATIONAL;
    }

    /**
     * Determine recovery priority from error data
     * @private
     * @param {Object} data - Error data
     * @returns {RecoveryPriority} Recovery priority
     */
    _determineRecoveryPriority(data) {
        // Security threats are always critical
        if (data.critical || data.threatLevel === 'high') {
            return RecoveryPriority.CRITICAL;
        }

        // Data loss risk is high priority
        if (data.dataLossRisk || data.domain === 'storage') {
            return RecoveryPriority.HIGH;
        }

        // User-facing issues are medium priority
        if (data.userFacing || data.domain === 'ui') {
            return RecoveryPriority.MEDIUM;
        }

        // Default to low priority
        return RecoveryPriority.LOW;
    }

    /**
     * Create a recovery request
     * @private
     * @param {RecoveryDomain} domain - Recovery domain
     * @param {RecoveryPriority} priority - Recovery priority
     * @param {Object} errorData - Error data
     * @returns {Promise<RecoveryRequest>} Recovery request
     */
    async _createRecoveryRequest(domain, priority, errorData) {
        const tabCoordinator = await this._getTabCoordinator();
        const tabId = tabCoordinator ? tabCoordinator.getTabId() : 'unknown';

        return {
            id: `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            domain,
            priority,
            error: errorData.error || new Error(errorData.message || 'Unknown error'),
            context: errorData.context || {},
            dependencies: errorData.dependencies || [],
            timestamp: Date.now(),
            tabId,
            // HNW Hierarchy: TTL and re-delegation tracking
            expiresAt: Date.now() + RECOVERY_TTL_MS,
            delegationAttempts: 0,
            maxDelegations: MAX_DELEGATION_ATTEMPTS
        };
    }

    /**
     * Coordinate recovery for a given request
     * @public
     * @param {RecoveryRequest} request - Recovery request
     * @returns {Promise<RecoveryResult>} Recovery result
     */
    async coordinateRecovery(request) {
        const startTime = performance.now();
        performance.mark('recovery-coordination-start');

        // HNW Hierarchy: Check if recovery request has expired
        if (request.expiresAt && Date.now() > request.expiresAt) {
            console.warn(`[ErrorRecoveryCoordinator] Recovery ${request.id} expired (TTL: ${RECOVERY_TTL_MS}ms)`);
            this._eventBus.emit('RECOVERY:EXPIRED', {
                recoveryId: request.id,
                domain: request.domain,
                age: Date.now() - request.timestamp
            });
            return {
                success: false,
                action: 'expired',
                durationMs: 0,
                error: null,
                metadata: { reason: 'ttl_expired', requestId: request.id }
            };
        }

        // Check if this tab should handle recovery
        if (!this._shouldHandleRecovery(request)) {
            console.log('[ErrorRecoveryCoordinator] Skipping recovery - not primary tab');
            return {
                success: false,
                action: 'skipped',
                durationMs: 0,
                error: null,
                metadata: { reason: 'not_primary_tab' }
            };
        }

        // Check for conflicting recoveries
        if (this._hasConflictingRecovery(request)) {
            console.warn('[ErrorRecoveryCoordinator] Conflicting recovery detected, queuing');
            await this._queueRecovery(request);
            return {
                success: false,
                action: 'queued',
                durationMs: 0,
                error: null,
                metadata: { reason: 'conflicting_recovery' }
            };
        }

        // Create recovery plan
        const plan = await this._createRecoveryPlan(request);

        // Execute recovery plan
        const result = await this._executeRecoveryPlan(plan);

        // Record telemetry
        this._recordTelemetry(result, request.error);

        performance.measure('recovery-coordination', 'recovery-coordination-start');

        return result;
    }

    /**
     * Determine if this tab should handle recovery
     * @private
     * @param {RecoveryRequest} request - Recovery request
     * @returns {boolean} True if this tab should handle recovery
     */
    _shouldHandleRecovery(request) {
        // Critical errors always handled immediately
        if (request.priority === RecoveryPriority.CRITICAL) {
            return true;
        }

        // Otherwise, only primary tab handles recovery
        return this._isPrimaryTab;
    }

    /**
     * Check for conflicting recoveries
     * @private
     * @param {RecoveryRequest} request - Recovery request
     * @returns {boolean} True if conflicting recovery exists
     */
    _hasConflictingRecovery(request) {
        // Check for active recovery in same domain
        for (const [id, active] of this._activeRecoveries) {
            if (active.domain === request.domain && active.priority >= request.priority) {
                return true;
            }
        }
        return false;
    }

    /**
     * Queue recovery for later execution with depth limits and timeout
     * @private
     * @param {RecoveryRequest} request - Recovery request
     * @returns {Promise<void>}
     * @throws {Error} If queue depth exceeded or timeout occurs
     */
    async _queueRecovery(request) {
        // Check queue depth limit
        if (this._activeRecoveries.size >= this._maxQueueDepth) {
            console.warn(`[ErrorRecoveryCoordinator] Queue depth exceeded (${this._activeRecoveries.size}/${this._maxQueueDepth}), dropping oldest recovery`);

            // Remove oldest recovery from queue
            const oldestId = this._activeRecoveries.keys().next().value;
            if (oldestId) {
                this._activeRecoveries.delete(oldestId);
                this._eventBus.emit('RECOVERY:DROPPED', { recoveryId: oldestId, reason: 'queue_depth_exceeded' });
            }
        }

        // Add to pending recoveries
        this._eventBus.emit('RECOVERY:QUEUED', { request });

        // Wait for current recovery to complete with event-driven approach
        await this._waitForIdleState(this._queueTimeoutMs);

        // Retry recovery
        try {
            await this.coordinateRecovery(request);
        } catch (error) {
            console.error('[ErrorRecoveryCoordinator] Queued recovery failed:', error);
            this._eventBus.emit('RECOVERY:FAILED', { request, error });
            throw error;
        }
    }

    /**
     * Create recovery plan for request
     * @private
     * @param {RecoveryRequest} request - Recovery request
     * @returns {Promise<RecoveryPlan>} Recovery plan
     */
    async _createRecoveryPlan(request) {
        const handlers = this._recoveryHandlers.get(request.domain) || [];
        const steps = [];

        // Add domain-specific handlers
        for (const handler of handlers) {
            steps.push(handler);
        }

        // Add dependency-aware steps
        for (const dep of request.dependencies) {
            const depHandler = this._getDependencyHandler(dep);
            if (depHandler) {
                steps.push(depHandler);
            }
        }

        // Estimate duration
        const estimatedDurationMs = steps.length * 1000; // 1s per step

        // Determine if lock is required
        const requiresLock = request.domain === RecoveryDomain.STORAGE ||
            request.domain === RecoveryDomain.SECURITY;
        const lockName = requiresLock ? `recovery_${request.domain}` : null;

        return {
            request,
            steps,
            estimatedDurationMs,
            requiresLock,
            lockName
        };
    }

    /**
     * Get dependency handler
     * @private
     * @param {string} dependency - Dependency name
     * @returns {Function|null} Dependency handler or null
     */
    _getDependencyHandler(dependency) {
        // Map dependencies to handlers
        const handlerMap = {
            'operation_lock': this._acquireRecoveryLock.bind(this),
            'state_validation': this._validateRecoveryState.bind(this),
            'tab_coordination': this._coordinateRecoveryTabs.bind(this)
        };
        return handlerMap[dependency] || null;
    }

    /**
     * Execute recovery plan
     * @private
     * @param {RecoveryPlan} plan - Recovery plan
     * @returns {Promise<RecoveryResult>} Recovery result
     */
    async _executeRecoveryPlan(plan) {
        this._currentState = RecoveryState.RECOVERING;
        this._currentRecoveryId = plan.request.id;
        this._activeRecoveries.set(plan.request.id, plan.request);
        this._emitStateChange();

        performance.mark('recovery-execution-start');
        const executionStartTime = performance.now();

        try {
            // Acquire lock if required
            let lockId = null;
            if (plan.requiresLock && plan.lockName) {
                lockId = await this._acquireRecoveryLock(plan.lockName);
            }

            // Execute recovery steps
            let lastError = null;
            for (const step of plan.steps) {
                try {
                    await step(plan.request);
                } catch (error) {
                    lastError = error;
                    console.error('[ErrorRecoveryCoordinator] Recovery step failed:', error);
                    // Continue with next step (progressive recovery)
                }
            }

            // Release lock if acquired
            if (lockId) {
                const operationLock = await this._getOperationLock();
                if (operationLock && operationLock.release) {
                    try {
                        operationLock.release(plan.lockName, lockId);
                    } catch (e) {
                        console.warn('[ErrorRecoveryCoordinator] Failed to release lock:', e);
                    }
                }
            }

            const success = !lastError;
            const duration = performance.now() - executionStartTime;

            return {
                success,
                action: 'recovery_completed',
                durationMs: duration,
                error: lastError,
                metadata: {
                    recoveryId: plan.request.id,
                    domain: plan.request.domain,
                    stepsCompleted: plan.steps.length
                }
            };

        } catch (error) {
            console.error('[ErrorRecoveryCoordinator] Recovery execution failed:', error);
            return {
                success: false,
                action: 'recovery_failed',
                durationMs: performance.now() - executionStartTime,
                error,
                metadata: {
                    recoveryId: plan.request.id,
                    domain: plan.request.domain
                }
            };
        } finally {
            this._currentState = RecoveryState.IDLE;
            this._currentRecoveryId = null;
            this._activeRecoveries.delete(plan.request.id);
            this._emitStateChange();
            performance.measure('recovery-execution', 'recovery-execution-start');
        }
    }

    /**
     * Acquire recovery lock
     * @private
     * @param {string} lockName - Lock name
     * @returns {Promise<string>} Lock ID
     */
    async _acquireRecoveryLock(lockName) {
        const operationLock = await this._getOperationLock();
        if (!operationLock) {
            console.warn('[ErrorRecoveryCoordinator] OperationLock unavailable, skipping lock');
            return null; // Return null to indicate lock not acquired
        }

        try {
            const lockId = await operationLock.acquire(lockName);
            return lockId;
        } catch (error) {
            console.warn('[ErrorRecoveryCoordinator] Failed to acquire lock:', error);
            throw new Error(`Cannot acquire recovery lock: ${lockName}`);
        }
    }

    /**
     * Validate recovery state
     * @private
     * @param {RecoveryRequest} request - Recovery request
     * @returns {Promise<void>}
     */
    async _validateRecoveryState(request) {
        const stateMachine = await this._getStateMachine();
        if (!stateMachine) {
            // Allow recovery if state machine unavailable (defensive)
            console.warn('[ErrorRecoveryCoordinator] StateMachine unavailable, skipping state validation');
            return;
        }

        // Validate current application state
        const currentState = stateMachine.getCurrentState();

        // Check if recovery is allowed in current state
        const allowedStates = ['idle', 'error', 'demo'];
        if (!allowedStates.includes(currentState)) {
            throw new Error(`Recovery not allowed in state: ${currentState}`);
        }
    }

    /**
     * Coordinate recovery across tabs
     * @private
     * @param {RecoveryRequest} request - Recovery request
     * @returns {Promise<void>}
     */
    async _coordinateRecoveryTabs(request) {
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
     * @param {RecoveryRequest} request - Recovery request to delegate
     * @returns {Promise<{ delegated: boolean, reason: string }>}
     */
    async broadcastRecoveryRequest(request) {
        const tabCoordinator = await this._getTabCoordinator();

        // If we're the leader or no tab coordinator, handle locally
        if (!tabCoordinator || tabCoordinator.isPrimary()) {
            return { delegated: false, reason: 'is_leader' };
        }

        // HNW Hierarchy: Check delegation attempts limit
        if (request.delegationAttempts >= request.maxDelegations) {
            console.warn(`[ErrorRecoveryCoordinator] Max delegations (${request.maxDelegations}) reached for recovery ${request.id}`);
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
            const vectorClock = tabCoordinator.getVectorClockState?.() || {};

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
                sourceTabId: tabCoordinator.getTabId(),
                delegatedAt: Date.now()
            };

            channel.postMessage(delegationMessage);
            channel.close();

            console.log(`[ErrorRecoveryCoordinator] Delegated recovery ${request.id} to leader tab (attempt ${request.delegationAttempts}/${request.maxDelegations})`);

            this._eventBus.emit('RECOVERY:DELEGATED', {
                recoveryId: request.id,
                sourceTabId: tabCoordinator.getTabId(),
                delegationAttempt: request.delegationAttempts
            });

            return { delegated: true, reason: 'delegated_to_leader' };

        } catch (error) {
            console.warn('[ErrorRecoveryCoordinator] Failed to broadcast recovery:', error);
            return { delegated: false, reason: 'broadcast_failed' };
        }
    }

    /**
     * Handle incoming delegated recovery requests (leader only)
     * @private
     * @param {Object} message - Delegated recovery message
     * @returns {Promise<void>}
     */
    async _handleDelegatedRecovery(message) {
        const tabCoordinator = await this._getTabCoordinator();
        if (tabCoordinator && !tabCoordinator.isPrimary()) {
            console.log('[ErrorRecoveryCoordinator] Ignoring delegated recovery - not leader');
            return;
        }

        // Merge VectorClock for causal ordering
        if (message.vectorClock && tabCoordinator?.getVectorClock) {
            const localClock = tabCoordinator.getVectorClock();
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

        console.log(`[ErrorRecoveryCoordinator] Processing delegated recovery from tab ${message.sourceTabId}`);

        // Process the recovery
        await this.coordinateRecovery(request);
    }

    /**
     * Handle security errors
     * @private
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async _handleSecurityError(data) {
        console.log('[ErrorRecoveryCoordinator] Handling security error:', data);

        // Emit security recovery event
        this._eventBus.emit('SECURITY:RECOVERY', {
            error: data.error,
            context: data.context,
            action: data.recoveryAction || 'default'
        });
    }

    /**
     * Handle storage errors
     * @private
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async _handleStorageError(data) {
        console.log('[ErrorRecoveryCoordinator] Handling storage error:', data);

        // Emit storage recovery event
        this._eventBus.emit('STORAGE:RECOVERY', {
            error: data.error,
            context: data.context,
            action: data.recoveryAction || 'fallback'
        });
    }

    /**
     * Handle UI errors
     * @private
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async _handleUIError(data) {
        console.log('[ErrorRecoveryCoordinator] Handling UI error:', data);

        // Emit UI recovery event
        this._eventBus.emit('UI:RECOVERY', {
            error: data.error,
            context: data.context,
            widgetId: data.widgetId
        });
    }

    /**
     * Handle operational errors
     * @private
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async _handleOperationalError(data) {
        console.log('[ErrorRecoveryCoordinator] Handling operational error:', data);

        // Emit operational recovery event
        this._eventBus.emit('OPERATIONAL:RECOVERY', {
            error: data.error,
            context: data.context,
            retryable: data.retryable !== false
        });
    }

    /**
     * Handle network errors
     * @private
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async _handleNetworkError(data) {
        console.log('[ErrorRecoveryCoordinator] Handling network error:', data);

        // Emit network recovery event
        this._eventBus.emit('NETWORK:RECOVERY', {
            error: data.error,
            url: data.url,
            retryable: true
        });
    }

    /**
     * Handle provider errors
     * @private
     * @param {Object} data - Error data
     * @returns {Promise<void>}
     */
    async _handleProviderError(data) {
        console.log('[ErrorRecoveryCoordinator] Handling provider error:', data);

        // Emit provider recovery event
        this._eventBus.emit('PROVIDER:RECOVERY', {
            error: data.error,
            provider: data.provider,
            fallbackAvailable: data.fallbackAvailable
        });
    }

    /**
     * Record recovery telemetry
     * @private
     * @param {RecoveryResult} result - Recovery result
     * @param {Error} error - Original error
     */
    _recordTelemetry(result, error) {
        if (result) {
            this._telemetry.history.push(result);
            this._telemetry.totalRecoveryTimeMs += result.durationMs;

            // Update domain counts
            const domainCount = this._telemetry.domainCounts.get(result.metadata?.domain) || 0;
            this._telemetry.domainCounts.set(result.metadata?.domain, domainCount + 1);

            // Update success rate
            const successCount = this._telemetry.history.filter(r => r.success).length;
            this._telemetry.successRate = successCount / this._telemetry.history.length;
        }

        if (error) {
            const errorKey = error.name || error.constructor.name;
            const errorCount = this._telemetry.errorCounts.get(errorKey) || 0;
            this._telemetry.errorCounts.set(errorKey, errorCount + 1);
        }
    }

    /**
     * Get recovery telemetry
     * @public
     * @returns {RecoveryTelemetry} Recovery telemetry data
     */
    getTelemetry() {
        return {
            ...this._telemetry,
            domainCounts: new Map(this._telemetry.domainCounts),
            errorCounts: new Map(this._telemetry.errorCounts)
        };
    }

    /**
     * Get current recovery state
     * @public
     * @returns {RecoveryState} Current recovery state
     */
    getCurrentState() {
        return this._currentState;
    }

    /**
     * Get active recoveries
     * @public
     * @returns {Map<string, RecoveryRequest>} Active recoveries
     */
    getActiveRecoveries() {
        return new Map(this._activeRecoveries);
    }

    /**
     * Cancel recovery by ID
     * @public
     * @param {string} recoveryId - Recovery ID to cancel
     * @returns {boolean} True if recovery was cancelled
     */
    cancelRecovery(recoveryId) {
        const recovery = this._activeRecoveries.get(recoveryId);
        if (recovery) {
            this._activeRecoveries.delete(recoveryId);
            if (this._currentRecoveryId === recoveryId) {
                this._currentState = RecoveryState.CANCELLED;
            }
            this._eventBus.emit('RECOVERY:CANCELLED', { recoveryId });
            return true;
        }
        return false;
    }

    /**
     * Wait for idle state with event-driven approach
     * @private
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<void>} Resolves when idle, rejects on timeout
     */
    async _waitForIdleState(timeoutMs) {
        return new Promise((resolve, reject) => {
            // Check immediately if already idle
            if (this._currentState === RecoveryState.IDLE) {
                resolve();
                return;
            }

            let timeoutHandle = null;
            let unsubscribe = null;

            // Setup timeout
            timeoutHandle = setTimeout(() => {
                if (unsubscribe) {
                    unsubscribe();
                }
                const error = new Error(`Recovery queue timeout (${timeoutMs}ms)`);
                error.code = 'RECOVERY_QUEUE_TIMEOUT';
                reject(error);
            }, timeoutMs);

            // Subscribe to state changes
            unsubscribe = this._eventBus.on('RECOVERY:STATE_CHANGE', (event, data) => {
                if (data.state === RecoveryState.IDLE) {
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }
                    if (unsubscribe) {
                        unsubscribe();
                    }
                    resolve();
                }
            });
        });
    }

    /**
     * Emit state change event
     * @private
     */
    _emitStateChange() {
        this._eventBus.emit('RECOVERY:STATE_CHANGE', {
            state: this._currentState,
            recoveryId: this._currentRecoveryId
        });
    }

    /**
     * Register custom recovery handler
     * @public
     * @param {RecoveryDomain} domain - Recovery domain
     * @param {Function} handler - Recovery handler function
     */
    registerHandler(domain, handler) {
        if (!this._recoveryHandlers.has(domain)) {
            this._recoveryHandlers.set(domain, []);
        }
        this._recoveryHandlers.get(domain).push(handler);
    }

    /**
     * Clear recovery telemetry
     * @public
     */
    clearTelemetry() {
        this._telemetry = {
            history: [],
            domainCounts: new Map(Object.values(RecoveryDomain).map(d => [d, 0])),
            errorCounts: new Map(),
            totalRecoveryTimeMs: 0,
            successRate: 0
        };
    }

    // ==========================================
    // Global System Health (P2.2)
    // ==========================================

    /**
     * Check global system health across all circuit breakers
     * HNW Network: Monitors all provider circuits for cascade failure detection
     * 
     * @public
     * @returns {Promise<{ healthy: boolean, degradedMode: boolean, openCircuits: number, totalCircuits: number, providers: Object }>}
     */
    async checkSystemHealth() {
        try {
            // Dynamic import to avoid circular dependency
            const { ProviderCircuitBreaker } = await import('./provider-circuit-breaker.js');

            const allStatus = ProviderCircuitBreaker.getAllStatus();
            const providerNames = Object.keys(allStatus);
            const totalCircuits = providerNames.length;

            let openCircuits = 0;
            let halfOpenCircuits = 0;

            for (const provider of providerNames) {
                const status = allStatus[provider];
                if (status.state === 'open') {
                    openCircuits++;
                } else if (status.state === 'half_open') {
                    halfOpenCircuits++;
                }
            }

            // Enter degraded mode if ≥50% of providers are open
            const degradedThreshold = totalCircuits * 0.5;
            const degradedMode = openCircuits >= degradedThreshold;

            if (degradedMode) {
                console.warn(`[ErrorRecoveryCoordinator] DEGRADED MODE: ${openCircuits}/${totalCircuits} circuits open`);
                this._eventBus.emit('SYSTEM:DEGRADED_MODE', {
                    openCircuits,
                    totalCircuits,
                    reason: 'circuit_breaker_threshold',
                    timestamp: Date.now()
                });
            }

            return {
                healthy: openCircuits === 0,
                degradedMode,
                openCircuits,
                halfOpenCircuits,
                totalCircuits,
                providers: allStatus
            };
        } catch (e) {
            console.warn('[ErrorRecoveryCoordinator] Failed to check system health:', e);
            return {
                healthy: true, // Assume healthy if check fails
                degradedMode: false,
                openCircuits: 0,
                totalCircuits: 0,
                providers: {}
            };
        }
    }

    /**
     * Get performance percentiles from telemetry history
     * HNW Wave: Analyzes timing patterns for anomaly detection
     * 
     * @public
     * @param {string} [category] - Optional category filter
     * @returns {{ p50: number, p95: number, p99: number, count: number }}
     */
    getPerformancePercentiles(category = null) {
        const durations = this._telemetry.history
            .filter(r => !category || r.metadata?.domain === category)
            .map(r => r.durationMs)
            .filter(d => d != null && d >= 0)
            .sort((a, b) => a - b);

        if (durations.length === 0) {
            return { p50: 0, p95: 0, p99: 0, count: 0 };
        }

        const percentile = (arr, p) => {
            if (arr.length === 0) return 0;
            const idx = Math.ceil(arr.length * p) - 1;
            return arr[Math.max(0, Math.min(idx, arr.length - 1))];
        };

        return {
            p50: percentile(durations, 0.50),
            p95: percentile(durations, 0.95),
            p99: percentile(durations, 0.99),
            count: durations.length
        };
    }

    /**
     * Get adaptive recovery timeout based on historical data
     * HNW Wave: Uses p95 from history with 1.5x multiplier
     * 
     * @public
     * @param {string} domain - Recovery domain
     * @returns {number} Timeout in milliseconds (minimum 30000)
     */
    getAdaptiveRecoveryTimeout(domain) {
        const domainHistory = this._telemetry.history
            .filter(r => r.metadata?.domain === domain && r.success)
            .map(r => r.durationMs)
            .sort((a, b) => a - b);

        if (domainHistory.length < 5) {
            return 30000; // Default minimum
        }

        // Calculate p95
        const p95Index = Math.ceil(domainHistory.length * 0.95) - 1;
        const p95 = domainHistory[Math.max(0, p95Index)];

        // Apply 1.5x multiplier with 30s minimum
        return Math.max(p95 * 1.5, 30000);
    }
}

// Export singleton instance
export default new ErrorRecoveryCoordinator({
    eventBus: EventBus
});