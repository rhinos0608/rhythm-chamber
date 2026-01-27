/**
 * Recovery Orchestration Module
 *
 * Core orchestration logic for error recovery coordination.
 * Extracted from error-recovery-coordinator.js for better separation of concerns.
 *
 * @module RecoveryOrchestration
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { RecoveryState } from './constants.js';

const RECOVERY_TTL_MS = 60000; // 60 seconds
const MAX_DELEGATION_ATTEMPTS = 3;

/**
 * RecoveryOrchestration Class
 *
 * Manages recovery workflow orchestration, state management, and queue handling.
 */
export class RecoveryOrchestration {
    /**
     * @private
     * @type {Object}
     */
    _eventBus;

    /**
     * @private
     * @type {Object}
     */
    _strategies;

    /**
     * @private
     * @type {Object}
     */
    _lockManager;

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
     * @type {number}
     */
    _maxQueueDepth;

    /**
     * @private
     * @type {number}
     */
    _queueTimeoutMs;

    /**
     * Initialize RecoveryOrchestration
     * @public
     * @param {Object} dependencies - Service dependencies
     * @param {Object} dependencies.eventBus - Event bus
     * @param {Object} dependencies.strategies - Recovery strategies
     * @param {Object} dependencies.lockManager - Lock manager
     * @param {number} dependencies.maxQueueDepth - Max queue depth
     * @param {number} dependencies.queueTimeoutMs - Queue timeout
     */
    constructor({ eventBus, strategies, lockManager, maxQueueDepth = 10, queueTimeoutMs = 30000 }) {
        this._eventBus = eventBus;
        this._strategies = strategies;
        this._lockManager = lockManager;
        this._maxQueueDepth = maxQueueDepth;
        this._queueTimeoutMs = queueTimeoutMs;
    }

    /**
     * Create a recovery request
     * @public
     * @param {RecoveryDomain} domain - Recovery domain
     * @param {RecoveryPriority} priority - Recovery priority
     * @param {Object} errorData - Error data
     * @returns {Promise<RecoveryRequest>} Recovery request
     */
    async createRecoveryRequest(domain, priority, errorData) {
        return {
            id: `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            domain,
            priority,
            error: errorData.error || new Error(errorData.message || 'Unknown error'),
            context: errorData.context || {},
            dependencies: errorData.dependencies || [],
            timestamp: Date.now(),
            tabId: 'unknown', // Will be set by coordinator
            expiresAt: Date.now() + RECOVERY_TTL_MS,
            delegationAttempts: 0,
            maxDelegations: MAX_DELEGATION_ATTEMPTS
        };
    }

    /**
     * Create recovery plan for request
     * @public
     * @param {RecoveryRequest} request - Recovery request
     * @returns {Promise<RecoveryPlan>} Recovery plan
     */
    async createRecoveryPlan(request) {
        const handlers = this._strategies.getHandlers().get(request.domain) || [];
        const steps = [];

        // Add domain-specific handlers
        for (const handler of handlers) {
            steps.push(handler);
        }

        // Add dependency-aware steps
        for (const dep of request.dependencies) {
            const depHandlerName = this._strategies.getDependencyHandlerName(dep);
            if (depHandlerName && this._lockManager[depHandlerName]) {
                steps.push(this._lockManager[depHandlerName].bind(this._lockManager));
            }
        }

        // Estimate duration
        const estimatedDurationMs = steps.length * 1000;

        // Determine if lock is required
        const requiresLock = request.domain === 'storage' || request.domain === 'security';
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
     * Execute recovery plan
     * @public
     * @param {RecoveryPlan} plan - Recovery plan
     * @returns {Promise<RecoveryResult>} Recovery result
     */
    async executeRecoveryPlan(plan) {
        this._currentState = RecoveryState.RECOVERING;
        this._currentRecoveryId = plan.request.id;
        this._activeRecoveries.set(plan.request.id, plan.request);
        this._emitStateChange();

        const executionStartTime = performance.now();

        try {
            // Acquire lock if required
            let lockId = null;
            if (plan.requiresLock && plan.lockName) {
                lockId = await this._lockManager.acquireRecoveryLock(plan.lockName);
            }

            // Execute recovery steps
            let lastError = null;
            for (const step of plan.steps) {
                try {
                    await step(plan.request);
                } catch (error) {
                    lastError = error;
                    console.error('[RecoveryOrchestration] Recovery step failed:', error);
                    // Continue with next step (progressive recovery)
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
            console.error('[RecoveryOrchestration] Recovery execution failed:', error);
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
        }
    }

    /**
     * Coordinate recovery for a given request
     * @public
     * @param {RecoveryRequest} request - Recovery request
     * @returns {Promise<RecoveryResult>} Recovery result
     */
    async coordinateRecovery(request) {
        const startTime = performance.now();

        // Check if recovery request has expired
        if (request.expiresAt && Date.now() > request.expiresAt) {
            console.warn(`[RecoveryOrchestration] Recovery ${request.id} expired (TTL: ${RECOVERY_TTL_MS}ms)`);
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

        // Check for conflicting recoveries
        if (this._hasConflictingRecovery(request)) {
            console.warn('[RecoveryOrchestration] Conflicting recovery detected, queuing');
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
        const plan = await this.createRecoveryPlan(request);

        // Execute recovery plan
        const result = await this.executeRecoveryPlan(plan);

        return result;
    }

    /**
     * Check for conflicting recoveries
     * @private
     * @param {RecoveryRequest} request - Recovery request
     * @returns {boolean} True if conflicting recovery exists
     */
    _hasConflictingRecovery(request) {
        for (const [id, active] of this._activeRecoveries) {
            if (active.domain === request.domain && active.priority >= request.priority) {
                return true;
            }
        }
        return false;
    }

    /**
     * Queue recovery for later execution
     * @private
     * @param {RecoveryRequest} request - Recovery request
     * @returns {Promise<void>}
     */
    async _queueRecovery(request) {
        // Check queue depth limit
        if (this._activeRecoveries.size >= this._maxQueueDepth) {
            console.warn(`[RecoveryOrchestration] Queue depth exceeded (${this._activeRecoveries.size}/${this._maxQueueDepth}), dropping oldest recovery`);

            const oldestId = this._activeRecoveries.keys().next().value;
            if (oldestId) {
                this._activeRecoveries.delete(oldestId);
                this._eventBus.emit('RECOVERY:DROPPED', { recoveryId: oldestId, reason: 'queue_depth_exceeded' });
            }
        }

        // Add to pending recoveries
        this._eventBus.emit('RECOVERY:QUEUED', { request });

        // Wait for current recovery to complete
        await this._waitForIdleState(this._queueTimeoutMs);

        // Retry recovery
        try {
            await this.coordinateRecovery(request);
        } catch (error) {
            console.error('[RecoveryOrchestration] Queued recovery failed:', error);
            this._eventBus.emit('RECOVERY:FAILED', { request, error });
            throw error;
        }
    }

    /**
     * Wait for idle state
     * @private
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<void>} Resolves when idle, rejects on timeout
     */
    async _waitForIdleState(timeoutMs) {
        return new Promise((resolve, reject) => {
            if (this._currentState === RecoveryState.IDLE) {
                resolve();
                return;
            }

            let timeoutHandle = null;
            let unsubscribe = null;

            timeoutHandle = setTimeout(() => {
                if (unsubscribe) {
                    unsubscribe();
                }
                const error = new Error(`Recovery queue timeout (${timeoutMs}ms)`);
                error.code = 'RECOVERY_QUEUE_TIMEOUT';
                reject(error);
            }, timeoutMs);

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
     * Emit state change event
     * @private
     */
    _emitStateChange() {
        this._eventBus.emit('RECOVERY:STATE_CHANGE', {
            state: this._currentState,
            recoveryId: this._currentRecoveryId
        });
    }
}
