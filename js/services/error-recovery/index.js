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

// Import all sub-modules
import * as RecoveryStrategies from './recovery-strategies.js';
import * as RecoveryOrchestration from './recovery-orchestration.js';
import * as RecoveryLockManager from './recovery-lock-manager.js';

// Re-export all module exports for internal use
export * from './recovery-strategies.js';
export * from './recovery-orchestration.js';
export * from './recovery-lock-manager.js';

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
    const instance = {
        _activeRecoveries: new Map(),
        _recoveryPlans: new Map(),
        _recoveryHandlers: new Map(),
        _maxQueueDepth: 10,
        _queueTimeoutMs: 30000,

        // Initialize strategies
        _initializeRecoveryHandlers() {
            RecoveryStrategies.initializeStrategies(this._recoveryHandlers);
        },

        // Coordinate recovery
        async coordinateRecovery(request) {
            return RecoveryOrchestration.coordinateRecovery(request, this);
        },

        // Lock management
        async _acquireRecoveryLock(lockName) {
            return RecoveryLockManager.acquireLock(lockName);
        },

        async _validateRecoveryState(request) {
            return RecoveryLockManager.validateState(request);
        },

        // Tab coordination
        async _coordinateRecoveryTabs(request) {
            return RecoveryLockManager.coordinateTabs(request);
        },

        // Broadcast management
        async broadcastRecoveryRequest(request) {
            return RecoveryLockManager.broadcastRequest(request);
        },

        // Handle delegated recovery
        async _handleDelegatedRecovery(message) {
            return RecoveryLockManager.handleDelegation(message, this);
        },

        // Cleanup
        cleanup() {
            this._activeRecoveries.clear();
            this._recoveryPlans.clear();
            coordinatorInstance = null;
        }
    };

    // Initialize strategies
    instance._initializeRecoveryHandlers();

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
    const domain = RecoveryOrchestration.determineRecoveryDomain(event, data);
    const priority = RecoveryOrchestration.determineRecoveryPriority(data);

    if (RecoveryOrchestration.shouldHandleRecovery({ domain, priority, ...data })) {
        const request = await RecoveryOrchestration.createRecoveryRequest(domain, priority, data);
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
    return RecoveryOrchestration.hasConflictingRecovery(request, coordinator._activeRecoveries);
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
        registeredHandlers: coordinator._recoveryHandlers.size
    };
}
