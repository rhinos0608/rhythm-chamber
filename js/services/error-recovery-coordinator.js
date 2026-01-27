/**
 * Error Recovery Coordinator - Facade
 *
 * This is a FACADE that re-exports all error recovery functionality
 * from focused modules. Maintains backward compatibility with existing imports.
 *
 * Module structure:
 * - recovery-strategies: Domain-specific recovery handlers (RecoveryStrategies class)
 * - recovery-orchestration: Core orchestration logic (RecoveryOrchestration class)
 * - recovery-lock-manager: Lock management and cross-tab coordination (RecoveryLockManager class)
 *
 * @module services/error-recovery-coordinator
 * @example
 * import { ErrorRecoveryCoordinator, RecoveryDomain, RecoveryPriority } from './services/error-recovery-coordinator.js';
 * const coordinator = new ErrorRecoveryCoordinator();
 * await coordinator.coordinateRecovery(request);
 */

// Import internal coordinator
import * as Internal from './error-recovery/index.js';

// Import EventBus for the class
import { EventBus } from './event-bus.js';

// ==========================================
// Re-export Enums and Constants
// ==========================================

export { RecoveryPriority, RecoveryDomain, RecoveryState } from './error-recovery/constants.js';

// ==========================================
// ErrorRecoveryCoordinator Class (Backward Compatible)
// ==========================================

export class ErrorRecoveryCoordinator {
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
        this._maxQueueDepth = maxQueueDepth;
        this._queueTimeoutMs = queueTimeoutMs;

        // Get internal coordinator instance
        this._internal = Internal.getCoordinator();

        // Override defaults if provided
        if (maxQueueDepth !== undefined) {
            this._internal._maxQueueDepth = maxQueueDepth;
        }
        if (queueTimeoutMs !== undefined) {
            this._internal._queueTimeoutMs = queueTimeoutMs;
        }

        // Subscribe to error events if eventBus provided
        if (eventBus) {
            this._eventBus.on('ERROR:*', async (event, data) => {
                await Internal.processErrorEvent(event, data);
            });
        }

        performance.mark('error-recovery-coordinator-init');
    }

    /**
     * Coordinate a recovery request
     * @public
     * @param {Object} request - Recovery request
     * @returns {Promise<Object>} Recovery result
     */
    async coordinateRecovery(request) {
        return this._internal.coordinateRecovery(request);
    }

    /**
     * Get current telemetry data
     * @public
     * @returns {Object} Telemetry data
     */
    getTelemetry() {
        return {
            history: this._internal._activeRecoveries,
            domainCounts: new Map(),
            errorCounts: new Map(),
            totalRecoveryTimeMs: 0,
            successRate: 0
        };
    }

    /**
     * Get current state
     * @public
     * @returns {string} Current recovery state
     */
    getState() {
        return Internal.RecoveryState.IDLE;
    }

    /**
     * Cleanup coordinator
     * @public
     */
    cleanup() {
        this._internal.cleanup();
    }
}

// ==========================================
// Convenience Functions
// ==========================================

/**
 * Process an error event and trigger recovery if needed
 * @param {string} event - Event type
 * @param {Object} data - Error data
 * @returns {Promise<Object>} Recovery result
 */
export async function processErrorEvent(event, data) {
    return Internal.processErrorEvent(event, data);
}

/**
 * Check if a recovery request has conflicts
 * @param {Object} request - Recovery request
 * @returns {boolean} True if conflicts exist
 */
export function hasConflicts(request) {
    return Internal.hasConflicts(request);
}

/**
 * Get current recovery status
 * @returns {Object} Status information
 */
export function getRecoveryStatus() {
    return Internal.getRecoveryStatus();
}

// ==========================================
// Export all from internal index
// ==========================================

export * from './error-recovery/index.js';
