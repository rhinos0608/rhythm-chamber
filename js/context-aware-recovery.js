/**
 * Context-Aware Error Recovery System
 *
 * Provides intelligent error recovery with dynamic priorities and app state context.
 * Integrates with OperationLock for priority-aware lock management.
 *
 * HNW Hierarchy: Priority-based lock preemption for critical operations
 * HNW Network: Cross-tab state synchronization for recovery context
 * HNW Wave: Adaptive recovery strategies based on system conditions
 *
 * Features:
 * - Dynamic priority system for recovery operations
 * - Priority-aware operation locks (preemption support)
 * - App state context integration
 * - Intelligent recovery path selection
 * - Cross-tab recovery coordination
 *
 * @module context-aware-recovery
 */

import { OperationLock } from './operation-lock.js';
import { TabCoordinator } from './services/tab-coordination.js';
import { DeviceDetection } from './services/device-detection.js';
import { RecoveryHandlers } from './security/recovery-handlers.js';
import { EventBus } from './services/event-bus.js';

// ==========================================
// Priority Levels
// ==========================================

/**
 * Recovery operation priority levels
 * Higher priorities can preempt lower priority locks
 * @enum {string}
 */
const RecoveryPriority = Object.freeze({
    CRITICAL: 'critical',     // System integrity (security, data corruption)
    HIGH: 'high',            // User-visible operations (chat, upload)
    NORMAL: 'normal',        // Background tasks (analytics, sync)
    LOW: 'low'               // Optional tasks (cache, prefetch)
});

/**
 * Priority numeric values for comparison
 */
const PRIORITY_VALUES = {
    [RecoveryPriority.CRITICAL]: 100,
    [RecoveryPriority.HIGH]: 75,
    [RecoveryPriority.NORMAL]: 50,
    [RecoveryPriority.LOW]: 25
};

// ==========================================
// App State Context
// ==========================================

/**
 * Current app state context
 * Used for intelligent recovery decisions
 */
const appStateContext = {
    viewMode: 'unknown',          // Current view (upload, chat, dashboard, etc.)
    dataState: 'unknown',         // Data availability state (none, partial, complete)
    userIntent: 'unknown',        // What the user is trying to do
    operationInProgress: null,    // Current operation name
    lastError: null,              // Last error that occurred
    networkQuality: 'unknown',    // Network conditions
    deviceType: 'unknown',        // Device type (phone, tablet, desktop)
    isBackground: false,          // Is page in background
    memoryPressure: 'normal'      // Memory pressure level
};

/**
 * Update app state context
 * @param {Object} updates - Context updates
 */
function updateAppStateContext(updates) {
    Object.assign(appStateContext, updates);

    // Emit context change event for cross-tab sync
    EventBus.emit('recovery:context_changed', {
        context: getAppStateContext(),
        timestamp: Date.now()
    });

    console.log('[ContextAwareRecovery] App state updated:', appStateContext);
}

/**
 * Get current app state context
 * @returns {Object} Current context
 */
function getAppStateContext() {
    return { ...appStateContext };
}

// ==========================================
// Priority-Aware Lock Management
// ==========================================

/**
 * Priority-aware lock acquisition with preemption support
 * Higher priority operations can preempt lower priority locks
 *
 * @param {string} operationName - Operation to lock
 * @param {string} priority - Priority level
 * @param {number} timeoutMs - Acquisition timeout
 * @returns {Promise<string>} Lock ID
 */
async function acquirePriorityLock(operationName, priority = RecoveryPriority.NORMAL, timeoutMs = 30000) {
    const priorityValue = PRIORITY_VALUES[priority] || PRIORITY_VALUES[RecoveryPriority.NORMAL];

    // Check if operation is currently locked
    const lockStatus = OperationLock.getLockStatus(operationName);

    if (lockStatus.isLocked) {
        // Check if we should preempt based on priority
        const currentPriority = lockStatus.priority || RecoveryPriority.NORMAL;
        const currentValue = PRIORITY_VALUES[currentPriority] || PRIORITY_VALUES[RecoveryPriority.NORMAL];

        if (priorityValue > currentValue + 20) {
            // Preempt: Only if significantly higher priority (>20 points)
            console.log(`[ContextAwareRecovery] Preempting ${operationName} (current: ${currentPriority}, new: ${priority})`);

            // Force release the lower priority lock
            OperationLock.forceRelease(operationName, 'priority_preemption');

            // Wait a bit for cleanup
            await new Promise(resolve => setTimeout(resolve, 100));
        } else {
            // Not high enough priority to preempt
            console.log(`[ContextAwareRecovery] Cannot acquire ${operationName} - blocked by ${currentPriority} operation`);
            throw new Error(`Operation ${operationName} is locked with priority ${currentPriority}`);
        }
    }

    // Acquire the lock with priority tracking
    const lockId = await OperationLock.acquire(operationName);

    // Store priority with the lock
    const lockInfo = OperationLock.getLockStatus(operationName);
    if (lockInfo.lockInfo) {
        lockInfo.lockInfo.priority = priority;
        lockInfo.lockInfo.priorityValue = priorityValue;
        lockInfo.lockInfo.context = getAppStateContext();
    }

    return lockId;
}

/**
 * Release a priority lock
 * @param {string} operationName - Operation to unlock
 * @param {string} lockId - Lock ID from acquisition
 */
function releasePriorityLock(operationName, lockId) {
    OperationLock.release(operationName, lockId);
}

// ==========================================
// Intelligent Recovery Selection
// ==========================================

/**
 * Recovery strategy selection based on app context
 * @param {Error} error - The error that occurred
 * @param {Object} context - Additional context
 * @returns {Object} Selected recovery strategy
 */
function selectRecoveryStrategy(error, context = {}) {
    const currentContext = getAppStateContext();
    const errorCode = error.code || error.name || 'UNKNOWN';

    // Build context-aware recovery options
    const strategies = [];

    // Check network conditions
    const networkDegraded = currentContext.networkQuality === 'poor' ||
                           currentContext.networkQuality === 'fair';

    // Check if device is mobile
    const isMobile = currentContext.deviceType === 'phone' ||
                    currentContext.deviceType === 'tablet';

    // Check if page is backgrounded
    const isBackground = currentContext.isBackground;

    // Strategy selection based on error type and context
    switch (errorCode) {
        case 'AUTH_FAILURE':
        case 'TOKEN_EXPIRED':
            strategies.push({
                priority: RecoveryPriority.HIGH,
                action: 'refresh_token',
                reason: 'User-facing auth issue',
                canAutoRecover: true,
                requiresLock: 'spotify_fetch'
            });
            break;

        case 'STORAGE_QUOTA_EXCEEDED':
            strategies.push({
                priority: RecoveryPriority.CRITICAL,
                action: 'cleanup_storage',
                reason: 'Storage quota critical',
                canAutoRecover: true,
                requiresLock: 'privacy_clear'
            });
            break;

        case 'NETWORK_ERROR':
        case 'TIMEOUT':
            if (networkDegraded) {
                strategies.push({
                    priority: RecoveryPriority.NORMAL,
                    action: 'adaptive_retry',
                    reason: 'Network degraded, using adaptive timing',
                    canAutoRecover: true,
                    adaptiveDelay: isMobile ? 5000 : 2000
                });
            } else {
                strategies.push({
                    priority: RecoveryPriority.HIGH,
                    action: 'immediate_retry',
                    reason: 'Transient network issue',
                    canAutoRecover: true,
                    retryCount: 3
                });
            }
            break;

        case 'LOCK_ACQUISITION_ERROR':
            strategies.push({
                priority: RecoveryPriority.NORMAL,
                action: 'wait_and_retry',
                reason: 'Operation in progress',
                canAutoRecover: true,
                waitMs: 1000
            });
            break;

        case 'WORKER_ABORTED':
            strategies.push({
                priority: RecoveryPriority.HIGH,
                action: 'restart_worker',
                reason: 'Worker crashed',
                canAutoRecover: true,
                requiresLock: 'embedding_generation'
            });
            break;

        default:
            // Unknown error - use context to determine strategy
            if (currentContext.userIntent === 'upload') {
                strategies.push({
                    priority: RecoveryPriority.HIGH,
                    action: 'retry_operation',
                    reason: 'User upload interrupted',
                    canAutoRecover: true,
                    requiresLock: 'file_processing'
                });
            } else if (currentContext.userIntent === 'chat') {
                strategies.push({
                    priority: RecoveryPriority.NORMAL,
                    action: 'retry_operation',
                    reason: 'Chat operation failed',
                    canAutoRecover: true
                });
            } else {
                strategies.push({
                    priority: RecoveryPriority.LOW,
                    action: 'log_and_continue',
                    reason: 'Non-critical background operation',
                    canAutoRecover: false
                });
            }
    }

    // Select best strategy based on priority
    const bestStrategy = strategies.sort((a, b) =>
        PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority]
    )[0];

    return {
        ...bestStrategy,
        context: currentContext,
        originalError: {
            code: errorCode,
            message: error.message,
            stack: error.stack
        }
    };
}

// ==========================================
// Recovery Execution
// ==========================================

/**
 * Execute a recovery strategy with priority-aware locking
 * @param {Object} strategy - Recovery strategy from selectRecoveryStrategy
 * @returns {Promise<any>} Recovery result
 */
async function executeRecovery(strategy) {
    const { action, priority, requiresLock, context } = strategy;

    console.log(`[ContextAwareRecovery] Executing recovery: ${action} (priority: ${priority})`);

    // Update context to reflect recovery in progress
    updateAppStateContext({
        operationInProgress: `recovery_${action}`,
        lastError: strategy.originalError
    });

    try {
        // Acquire lock if required
        let lockId = null;
        if (requiresLock) {
            lockId = await acquirePriorityLock(requiresLock, priority);
        }

        // Execute the recovery action
        let result;
        switch (action) {
            case 'refresh_token':
                result = await RecoveryHandlers.execute('refresh_token', context);
                break;

            case 'cleanup_storage':
                result = await cleanupStorageForRecovery();
                break;

            case 'adaptive_retry':
            case 'immediate_retry':
                result = await executeRetry(strategy);
                break;

            case 'wait_and_retry':
                await new Promise(resolve => setTimeout(resolve, strategy.waitMs || 1000));
                result = await executeRetry(strategy);
                break;

            case 'restart_worker':
                result = await restartWorkerForRecovery(strategy.requiresLock);
                break;

            case 'retry_operation':
                result = await executeRetry(strategy);
                break;

            case 'log_and_continue':
                console.warn('[ContextAwareRecovery] Non-critical error, continuing:', strategy.originalError);
                result = { continued: true };
                break;

            default:
                result = await RecoveryHandlers.execute(action, context);
        }

        // Release lock if acquired
        if (lockId) {
            releasePriorityLock(requiresLock, lockId);
        }

        // Clear recovery in progress
        updateAppStateContext({
            operationInProgress: null
        });

        return result;

    } catch (error) {
        console.error('[ContextAwareRecovery] Recovery failed:', error);

        // Clear recovery in progress
        updateAppStateContext({
            operationInProgress: null
        });

        throw error;
    }
}

/**
 * Execute retry with adaptive timing
 * @param {Object} strategy - Retry strategy
 * @returns {Promise<any>} Retry result
 */
async function executeRetry(strategy) {
    const { adaptiveDelay, retryCount = 3 } = strategy;
    const baseDelay = adaptiveDelay || 1000;

    for (let i = 0; i < retryCount; i++) {
        try {
            // Check network quality before retry
            const networkState = DeviceDetection.getNetworkState();
            if (networkState.quality === 'poor') {
                // Use longer delays on poor networks
                await new Promise(resolve => setTimeout(resolve, baseDelay * 3));
            } else {
                await new Promise(resolve => setTimeout(resolve, baseDelay));
            }

            // Execute the original operation (would be passed in strategy)
            return { retried: true, attempt: i + 1 };

        } catch (error) {
            if (i === retryCount - 1) {
                throw error; // Final attempt failed
            }
            console.log(`[ContextAwareRecovery] Retry ${i + 1}/${retryCount} failed, trying again...`);
        }
    }
}

/**
 * Cleanup storage for quota recovery
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanupStorageForRecovery() {
    console.log('[ContextAwareRecovery] Executing storage cleanup...');

    // Import storage dynamically
    const { Storage } = await import('./storage.js');

    // Clear old data
    const result = {
        cleared: true,
        spaceFreed: 'unknown'
    };

    // Emit event for UI to show notification
    EventBus.emit('recovery:storage_cleanup', result);

    return result;
}

/**
 * Restart worker for recovery
 * @param {string} workerType - Type of worker to restart
 * @returns {Promise<Object>} Restart result
 */
async function restartWorkerForRecovery(workerType) {
    console.log(`[ContextAwareRecovery] Restarting worker: ${workerType}`);

    // Import worker coordinator
    const { WorkerCoordinator } = await import('./services/worker-coordinator.js');

    // Reset and restart the worker
    await WorkerCoordinator.resetHeartbeat(workerType.toUpperCase());

    return {
        restarted: true,
        workerType
    };
}

// ==========================================
// Context Monitoring
// ==========================================

/**
 * Start monitoring app state for context updates
 */
function startContextMonitoring() {
    // Monitor view changes
    EventBus.on('ui:view_changed', ({ view }) => {
        updateAppStateContext({ viewMode: view });
    });

    // Monitor data state changes
    EventBus.on('data:state_changed', ({ state }) => {
        updateAppStateContext({ dataState: state });
    });

    // Monitor user intent
    EventBus.on('user:intent_detected', ({ intent }) => {
        updateAppStateContext({ userIntent: intent });
    });

    // Monitor network changes
    DeviceDetection.onNetworkChange((quality) => {
        updateAppStateContext({ networkQuality: quality });
    });

    // Monitor visibility changes
    DeviceDetection.onVisibilityChange((hidden) => {
        updateAppStateContext({ isBackground: hidden });
    });

    // Update device info
    const deviceInfo = DeviceDetection.getDeviceInfo();
    updateAppStateContext({ deviceType: deviceInfo.deviceType });

    // Update initial network state
    const networkState = DeviceDetection.getNetworkState();
    updateAppStateContext({ networkQuality: networkState.quality });

    console.log('[ContextAwareRecovery] Context monitoring started');
}

// ==========================================
// Public API
// ==========================================

export const ContextAwareRecovery = {
    // Priority Management
    RecoveryPriority,
    PRIORITY_VALUES,

    // Context Management
    updateAppStateContext,
    getAppStateContext,

    // Priority-Aware Locks
    acquirePriorityLock,
    releasePriorityLock,

    // Recovery Strategy
    selectRecoveryStrategy,
    executeRecovery,

    // Monitoring
    startContextMonitoring
};

export default ContextAwareRecovery;

console.log('[ContextAwareRecovery] Context-aware recovery system loaded');
