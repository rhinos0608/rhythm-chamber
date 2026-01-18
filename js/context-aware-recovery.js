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
 * External storage for priority lock metadata (cross-tab compatible)
 * Uses localStorage to share priority metadata across browser tabs
 * Avoids direct mutation of OperationLock's internal state
 */
const PRIORITY_METADATA_KEY = 'recovery_priority_metadata';

/**
 * Get priority metadata from localStorage (cross-tab compatible)
 */
function getPriorityMetadata(operationName) {
    try {
        const stored = localStorage.getItem(PRIORITY_METADATA_KEY);
        if (stored) {
            const metadata = JSON.parse(stored);
            return metadata[operationName] || null;
        }
    } catch (error) {
        console.warn('[ContextAwareRecovery] Failed to read priority metadata:', error);
    }
    return null;
}

/**
 * Set priority metadata in localStorage (cross-tab compatible)
 */
function setPriorityMetadata(operationName, metadata) {
    try {
        const stored = localStorage.getItem(PRIORITY_METADATA_KEY);
        const allMetadata = stored ? JSON.parse(stored) : {};
        allMetadata[operationName] = metadata;
        localStorage.setItem(PRIORITY_METADATA_KEY, JSON.stringify(allMetadata));
    } catch (error) {
        console.warn('[ContextAwareRecovery] Failed to write priority metadata:', error);
    }
}

/**
 * Delete priority metadata from localStorage (cross-tab compatible)
 */
function deletePriorityMetadata(operationName) {
    try {
        const stored = localStorage.getItem(PRIORITY_METADATA_KEY);
        if (stored) {
            const allMetadata = JSON.parse(stored);
            delete allMetadata[operationName];
            localStorage.setItem(PRIORITY_METADATA_KEY, JSON.stringify(allMetadata));
        }
    } catch (error) {
        console.warn('[ContextAwareRecovery] Failed to delete priority metadata:', error);
    }
}

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

    // Robust retry loop around acquire to handle TOCTOU race conditions
    const maxRetries = 5;
    const backoffMs = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // First check if operation is currently locked
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

                    // Wait a bit for cleanup and retry acquisition
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue; // Retry acquisition after preemption
                } else {
                    // Not high enough priority to preempt
                    console.log(`[ContextAwareRecovery] Cannot acquire ${operationName} - blocked by ${currentPriority} operation`);
                    throw new Error(`Operation ${operationName} is locked with priority ${currentPriority}`);
                }
            }

            // Try to acquire the lock atomically
            const lockId = await OperationLock.acquire(operationName);

            // Successfully acquired - store priority metadata externally
            // to avoid directly mutating OperationLock's internal state
            const priorityMetadata = {
                priority,
                priorityValue,
                context: getAppStateContext(),
                lockId,
                timestamp: Date.now()
            };

            // Store in localStorage for cross-tab access
            setPriorityMetadata(operationName, priorityMetadata);

            console.log(`[ContextAwareRecovery] Acquired priority lock for ${operationName} (priority: ${priority}, attempt: ${attempt + 1})`);
            return lockId;

        } catch (error) {
            // If this is a LockAcquisitionError and we have retries left, continue
            if (error.name === 'LockAcquisitionError' && attempt < maxRetries - 1) {
                console.log(`[ContextAwareRecovery] Acquisition attempt ${attempt + 1} failed, retrying with backoff...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs * (attempt + 1)));
                continue;
            }

            // Final attempt or different error - throw it
            console.error(`[ContextAwareRecovery] Failed to acquire priority lock after ${attempt + 1} attempts:`, error);
            throw error;
        }
    }

    // Should never reach here, but for safety:
    throw new Error(`Failed to acquire lock for ${operationName} after ${maxRetries} attempts`);
}

/**
 * Release a priority lock
 * @param {string} operationName - Operation to unlock
 * @param {string} lockId - Lock ID from acquisition
 */
function releasePriorityLock(operationName, lockId) {
    // Clean up external priority metadata from localStorage
    const metadata = getPriorityMetadata(operationName);
    if (metadata && metadata.lockId === lockId) {
        deletePriorityMetadata(operationName);
        console.log(`[ContextAwareRecovery] Released priority lock for ${operationName}`);
    }

    // Release the actual lock
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

    // Acquire lock if required
    let lockId = null;
    if (requiresLock) {
        lockId = await acquirePriorityLock(requiresLock, priority);
    }

    try {
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

        return result;

    } catch (error) {
        console.error('[ContextAwareRecovery] Recovery failed:', error);
        throw error;

    } finally {
        // Always release lock if acquired (prevents lock leaks)
        if (lockId) {
            releasePriorityLock(requiresLock, lockId);
        }

        // Always clear recovery in progress state
        updateAppStateContext({
            operationInProgress: null
        });
    }
}

/**
 * Execute retry with adaptive timing
 * @param {Object} strategy - Retry strategy with operation/fn callback
 * @returns {Promise<any>} Retry result
 */
async function executeRetry(strategy) {
    const { adaptiveDelay, retryCount = 3, operation, fn } = strategy;
    const baseDelay = adaptiveDelay || 1000;

    // Get the retryable operation (support both naming conventions)
    const retryableOperation = operation || fn;

    if (typeof retryableOperation !== 'function') {
        throw new Error('executeRetry requires a retryable operation function (operation or fn)');
    }

    for (let i = 0; i < retryCount; i++) {
        try {
            // Check network quality before retry to adjust delay
            const networkState = DeviceDetection.getNetworkState();
            let adjustedDelay = baseDelay;

            if (networkState.quality === 'poor') {
                // Use longer delays on poor networks
                adjustedDelay = baseDelay * 3;
            } else if (networkState.quality === 'fair') {
                // Moderate delay on fair networks
                adjustedDelay = baseDelay * 1.5;
            }

            // Wait for adaptive delay
            await new Promise(resolve => setTimeout(resolve, adjustedDelay));

            // Execute the original operation (real errors can be thrown and retried)
            const result = await retryableOperation();

            return { result, retried: true, attempt: i + 1 };

        } catch (error) {
            // Check if this was the final attempt
            if (i === retryCount - 1) {
                console.error(`[ContextAwareRecovery] All ${retryCount} retry attempts failed`);
                throw error; // Final attempt failed - rethrow the error
            }

            // Log retry attempt and continue
            console.log(`[ContextAwareRecovery] Retry ${i + 1}/${retryCount} failed: ${error.message}, trying again...`);
        }
    }
}

/**
 * Cleanup storage for quota recovery
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanupStorageForRecovery() {
    console.log('[ContextAwareRecovery] Executing storage cleanup for quota recovery...');

    try {
        // Import storage dynamically
        const { Storage } = await import('./storage.js');

        // Guard for missing methods on Storage
        if (typeof Storage.clearAllData !== 'function') {
            console.error('[ContextAwareRecovery] Storage.clearAllData method not available');
            const result = {
                cleared: false,
                spaceFreed: 0,
                error: 'Storage.clearAllData method not available'
            };
            EventBus.emit('recovery:storage_cleanup', result);
            return result;
        }

        // Call the real cleanup API
        console.log('[ContextAwareRecovery] Calling Storage.clearAllData()...');
        const cleanupResult = await Storage.clearAllData();

        // Compute actual values from the returned data
        const result = {
            cleared: cleanupResult.indexedDB?.cleared || cleanupResult.localStorage?.cleared || false,
            spaceFreed: cleanupResult.localStorage?.keys || 0, // Number of items cleared
            details: cleanupResult,
            timestamp: Date.now()
        };

        console.log('[ContextAwareRecovery] Storage cleanup completed:', result);

        // Emit event with real result for UI to show notification
        EventBus.emit('recovery:storage_cleanup', result);

        return result;

    } catch (error) {
        console.error('[ContextAwareRecovery] Storage cleanup failed:', error);

        // Return failure result with error details
        const result = {
            cleared: false,
            spaceFreed: 0,
            error: error.message,
            timestamp: Date.now()
        };

        // Still emit event for UI error handling
        EventBus.emit('recovery:storage_cleanup', result);

        return result;
    }
}

/**
 * Restart worker for recovery
 * @param {string} workerType - Type of worker to restart
 * @returns {Promise<Object>} Restart result
 */
async function restartWorkerForRecovery(workerType) {
    // Add null/falsy guard for workerType parameter
    if (!workerType || typeof workerType !== 'string') {
        console.error('[ContextAwareRecovery] Invalid workerType provided:', workerType);
        return {
            restarted: false,
            workerType,
            error: 'Invalid workerType parameter'
        };
    }

    console.log(`[ContextAwareRecovery] Restarting worker: ${workerType}`);

    try {
        // Import worker coordinator
        const { WorkerCoordinator } = await import('./services/worker-coordinator.js');

        // Reset and restart the worker (only when workerType is valid)
        await WorkerCoordinator.resetHeartbeat(workerType.toUpperCase());

        return {
            restarted: true,
            workerType
        };
    } catch (error) {
        console.error('[ContextAwareRecovery] Failed to restart worker:', error);
        return {
            restarted: false,
            workerType,
            error: error.message
        };
    }
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
