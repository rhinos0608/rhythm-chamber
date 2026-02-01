/**
 * Error Recovery Coordinator - Internal Index
 *
 * Internal coordinator that imports all sub-modules and provides
 * a unified interface for the facade to use.
 *
 * This file is for internal use only. External consumers should
 * import from the facade (error-recovery-coordinator.js).
 *
 * @module services/error-recovery/index
 */

// Import classes and functions from sub-modules
import { RecoveryStrategies } from './recovery-strategies.js';
import {
    RecoveryOrchestration,
    determineRecoveryDomain,
    determineRecoveryPriority,
    shouldHandleRecovery,
    hasConflictingRecovery as hasConflictingRecoveryStatic,
} from './recovery-orchestration.js';
import { RecoveryLockManager } from './recovery-lock-manager.js';
import { RecoveryDomain, RecoveryPriority, RecoveryState } from './constants.js';

// Re-export all module exports for internal use
export * from './recovery-strategies.js';
export * from './recovery-orchestration.js';
export * from './recovery-lock-manager.js';
export * from './constants.js';

// Re-export modules as named exports for convenience
export { RecoveryStrategies, RecoveryOrchestration, RecoveryLockManager };

// ==========================================
// State Management
// ==========================================

let coordinatorInstance = null;

/**
 * Get or create the singleton coordinator instance
 * @returns {Object} Coordinator instance
 */
export function getCoordinator() {
    if (!coordinatorInstance) {
        coordinatorInstance = createCoordinator();
    }
    return coordinatorInstance;
}

/**
 * Create a new coordinator instance
 * @returns {Object} New coordinator instance
 */
export function createCoordinator() {
    // EventBus will be passed in or obtained from the facade
    // For now, use null - it will be set by the facade
    const eventBus = null;

    // Create actual class instances instead of a plain object
    const strategies = new RecoveryStrategies(eventBus);
    const lockManager = new RecoveryLockManager({ eventBus });
    const orchestration = new RecoveryOrchestration({
        eventBus,
        strategies,
        lockManager,
    });

    const instance = {
        _strategies: strategies,
        _lockManager: lockManager,
        _orchestration: orchestration,
        _activeRecoveries: new Map(),
        _recoveryPlans: new Map(),
        _recoveryHandlers: strategies.getHandlers(),
        _maxQueueDepth: 10,
        _queueTimeoutMs: 30000,
        _currentState: RecoveryState.IDLE,

        // Coordinate recovery - delegate to orchestration instance
        async coordinateRecovery(request) {
            return this._orchestration.coordinateRecovery(request);
        },

        // Lock management - use correct method names
        async _acquireRecoveryLock(lockName) {
            return this._lockManager.acquireRecoveryLock(lockName);
        },

        async _validateRecoveryState(request) {
            return this._lockManager.validateRecoveryState(request);
        },

        // Tab coordination - use correct method names
        async _coordinateRecoveryTabs(request) {
            return this._lockManager.coordinateRecoveryTabs(request);
        },

        // Broadcast management - use correct method names
        async broadcastRecoveryRequest(request) {
            return this._lockManager.broadcastRecoveryRequest(request);
        },

        // Handle delegated recovery - use correct method names
        async _handleDelegatedRecovery(message) {
            return this._lockManager.handleDelegatedRecovery(message, this);
        },

        // Get current state
        getCurrentState() {
            return this._orchestration.getCurrentState();
        },

        // Get active recoveries
        getActiveRecoveries() {
            return this._orchestration.getActiveRecoveries();
        },

        // Cancel recovery
        cancelRecovery(recoveryId) {
            return this._orchestration.cancelRecovery(recoveryId);
        },

        // Cleanup
        cleanup() {
            this._activeRecoveries.clear();
            this._recoveryPlans.clear();
            this._lockManager.destroy();
            coordinatorInstance = null;
        },
    };

    // Sync state with orchestration
    instance._activeRecoveries = orchestration._activeRecoveries;

    return instance;
}

/**
 * Reset the coordinator (mainly for testing)
 */
export function resetCoordinator() {
    if (coordinatorInstance) {
        coordinatorInstance.cleanup();
        coordinatorInstance = null;
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
    const coordinator = getCoordinator();
    const domain = determineRecoveryDomain(event, data);
    const priority = determineRecoveryPriority(data);

    if (shouldHandleRecovery({ domain, priority, ...data })) {
        const request = await coordinator._orchestration.createRecoveryRequest(
            domain,
            priority,
            data
        );
        return coordinator.coordinateRecovery(request);
    }

    return { handled: false };
}

/**
 * Check if a recovery request has conflicts
 * @param {Object} request - Recovery request
 * @returns {boolean} True if conflicts exist
 */
export function hasConflicts(request) {
    const coordinator = getCoordinator();
    return hasConflictingRecoveryStatic(request, coordinator._activeRecoveries);
}

/**
 * Get current recovery status
 * @returns {Object} Status information
 */
export function getRecoveryStatus() {
    const coordinator = getCoordinator();
    return {
        activeRecoveries: coordinator._activeRecoveries.size,
        queuedPlans: coordinator._recoveryPlans.size,
        registeredHandlers: coordinator._recoveryHandlers.size,
        currentState: coordinator.getCurrentState(),
    };
}
