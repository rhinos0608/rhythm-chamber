/**
 * WorkerCoordinator Service
 *
 * Centralized Web Worker lifecycle management with race condition prevention,
 * automatic cleanup, and health monitoring.
 *
 * HNW Hierarchy: Single authority for all worker operations
 * HNW Network: Coordinates worker communication via registry pattern
 * HNW Wave: Deterministic cleanup timing with page unload handlers
 *
 * Features:
 * - Worker registration and tracking
 * - Race condition prevention with promise-based initialization
 * - Automatic cleanup on page unload
 * - Health monitoring with heartbeat tracking
 * - Memory leak prevention
 * - Debug mode for worker lifecycle inspection
 *
 * @module services/worker-coordinator
 */

// ==========================================
// Worker Registry
// ==========================================

/**
 * Worker types tracked by coordinator
 */
const WorkerType = {
    PARSER: 'parser',
    EMBEDDING: 'embedding',
    PATTERN: 'pattern',
    VECTOR_SEARCH: 'vector_search',
    PATTERN_POOL: 'pattern_pool'
};

/**
 * Worker registry entry
 * @typedef {Object} WorkerEntry
 * @property {string} type - Worker type identifier
 * @property {Worker|null} instance - Worker instance or null if not created
 * @property {boolean} initialized - Whether worker handlers are set up
 * @property {boolean} persistent - Whether worker should persist after use
 * @property {number} createdAt - Timestamp when worker was created
 * @property {number} lastUsed - Timestamp of last worker activity
 * @property {number} heartbeatInterval - Heartbeat check interval in ms
 * @property {number|null} heartbeatTimer - Timer ID for heartbeat checks
 * @property {number} missedHeartbeats - Count of consecutive missed heartbeats
 * @property {Function|null} cleanup - Custom cleanup function
 * @property {Promise<Worker>|null} initializingPromise - Promise for worker initialization (race prevention)
 */

/**
 * Centralized worker registry
 * @type {Map<string, WorkerEntry>}
 */
const workerRegistry = new Map();

/**
 * Maximum heartbeat misses before worker is considered stale
 */
const MAX_MISSED_HEARTBEATS = 3;

/**
 * Default heartbeat check interval (5 seconds)
 */
const DEFAULT_HEARTBEAT_INTERVAL = 5000;

/**
 * Debug mode flag
 */
let debugMode = false;

/**
 * Coordinator initialization state
 */
let coordinatorInitialized = false;

/**
 * Cleanup interval ID for idle workers
 */
let cleanupIntervalId = null;

// ==========================================
// Worker Registration
// ==========================================

/**
 * Register a worker type with the coordinator
 * Called by modules that create workers
 *
 * @param {string} type - Worker type from WorkerType enum
 * @param {Object} options - Worker configuration options
 * @param {boolean} options.persistent - Should worker persist after use (default: false)
 * @param {number} options.heartbeatInterval - Heartbeat check interval in ms (default: 5000)
 * @param {Function} options.cleanup - Custom cleanup function
 * @returns {string} Registration ID for this worker type
 */
function registerWorker(type, options = {}) {
    const entry = {
        type,
        instance: null,
        initialized: false,
        persistent: options.persistent ?? false,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        heartbeatInterval: options.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL,
        heartbeatTimer: null,
        missedHeartbeats: 0,
        cleanup: options.cleanup || null,
        initializingPromise: null // Race condition prevention
    };

    workerRegistry.set(type, entry);

    if (debugMode) {
        console.log(`[WorkerCoordinator] Registered worker type: ${type}`);
    }

    return type;
}

/**
 * Unregister a worker type and clean up
 * @param {string} type - Worker type to unregister
 */
function unregisterWorker(type) {
    const entry = workerRegistry.get(type);
    if (!entry) {
        return;
    }

    terminateWorker(type);
    workerRegistry.delete(type);

    if (debugMode) {
        console.log(`[WorkerCoordinator] Unregistered worker type: ${type}`);
    }
}

// ==========================================
// Worker Lifecycle Management
// ==========================================

/**
 * Create or retrieve a worker instance with race condition prevention
 * Uses promise-based initialization to ensure handlers are ready
 *
 * @param {string} type - Worker type
 * @param {string} workerPath - Path to worker script
 * @param {Function} initHandlers - Function to set up worker message handlers
 * @returns {Promise<Worker>} Worker instance with handlers initialized
 */
async function createWorker(type, workerPath, initHandlers) {
    if (typeof Worker === 'undefined') {
        throw new Error('Web Workers not supported');
    }

    const entry = workerRegistry.get(type);
    if (!entry) {
        throw new Error(`Worker type ${type} not registered`);
    }

    // If already initialized, reuse
    if (entry.instance && entry.initialized) {
        entry.lastUsed = Date.now();
        if (debugMode) {
            console.log(`[WorkerCoordinator] Reusing existing ${type} worker`);
        }
        return entry.instance;
    }

    // If another caller is initializing, wait for them
    if (entry.initializingPromise) {
        if (debugMode) {
            console.log(`[WorkerCoordinator] Waiting for existing ${type} worker initialization`);
        }
        return entry.initializingPromise;
    }

    // Start initialization
    entry.initializingPromise = (async () => {
        try {
            if (debugMode) {
                console.log(`[WorkerCoordinator] Creating ${type} worker from ${workerPath}`);
            }

            const worker = new Worker(workerPath, { type: 'module' });

            entry.instance = worker;
            entry.createdAt = Date.now();
            entry.lastUsed = Date.now();

            if (debugMode) {
                console.log(`[WorkerCoordinator] Initializing handlers for ${type} worker`);
            }

            await initHandlers(worker);
            entry.initialized = true;

            startHeartbeat(type);

            if (debugMode) {
                console.log(`[WorkerCoordinator] ${type} worker ready`);
            }

            return worker;
        } catch (error) {
            // Clean up any partially created resources
            const workerInstance = entry.instance;
            entry.instance = null;
            entry.initialized = false;

            // Terminate the worker if it was created before the error
            if (workerInstance) {
                try {
                    workerInstance.onmessage = null;
                    workerInstance.onerror = null;
                    workerInstance.terminate();
                } catch (terminateError) {
                    console.warn(`[WorkerCoordinator] Error terminating failed ${type} worker:`, terminateError);
                }
            }

            // Call custom cleanup if registered
            if (entry.cleanup) {
                try {
                    entry.cleanup();
                } catch (cleanupError) {
                    console.warn(`[WorkerCoordinator] Custom cleanup error for ${type}:`, cleanupError);
                }
            }

            throw new Error(`Failed to create ${type} worker: ${error.message}`);
        } finally {
            // Clear the promise so future callers can retry if needed
            entry.initializingPromise = null;
        }
    })();

    return entry.initializingPromise;
}

/**
 * Terminate a specific worker
 * @param {string} type - Worker type to terminate
 * @returns {boolean} True if worker was terminated
 */
function terminateWorker(type) {
    const entry = workerRegistry.get(type);
    if (!entry || !entry.instance) {
        return false;
    }

    stopHeartbeat(type);

    if (entry.cleanup) {
        try {
            entry.cleanup();
        } catch (error) {
            console.warn(`[WorkerCoordinator] Cleanup error for ${type}:`, error);
        }
    }

    try {
        entry.instance.onmessage = null;
        entry.instance.onerror = null;
        entry.instance.terminate();
        if (debugMode) {
            console.log(`[WorkerCoordinator] Terminated ${type} worker`);
        }
    } catch (error) {
        console.warn(`[WorkerCoordinator] Termination error for ${type}:`, error);
    }

    entry.instance = null;
    entry.initialized = false;
    entry.missedHeartbeats = 0;

    return true;
}

/**
 * Terminate all registered workers
 * Called on page unload to prevent memory leaks
 * @returns {number} Number of workers terminated
 */
function terminateAll() {
    let terminated = 0;

    for (const [type, entry] of workerRegistry.entries()) {
        if (entry.instance) {
            terminateWorker(type);
            terminated++;
        }
    }

    if (debugMode) {
        console.log(`[WorkerCoordinator] Terminated ${terminated} workers`);
    }

    return terminated;
}

/**
 * Clean up idle non-persistent workers
 * Workers not used for more than 5 minutes are terminated
 * @returns {number} Number of workers cleaned up
 */
function cleanupIdleWorkers() {
    const IDLE_THRESHOLD = 5 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;

    for (const [type, entry] of workerRegistry.entries()) {
        if (entry.persistent) {
            continue;
        }

        if (entry.instance && (now - entry.lastUsed) > IDLE_THRESHOLD) {
            terminateWorker(type);
            cleaned++;
        }
    }

    if (debugMode && cleaned > 0) {
        console.log(`[WorkerCoordinator] Cleaned up ${cleaned} idle workers`);
    }

    return cleaned;
}

// ==========================================
// Health Monitoring
// ==========================================

/**
 * Start heartbeat monitoring for a worker
 * @param {string} type - Worker type
 */
function startHeartbeat(type) {
    const entry = workerRegistry.get(type);
    if (!entry || !entry.instance) {
        return;
    }

    stopHeartbeat(type);

    entry.heartbeatTimer = setInterval(() => {
        if (!entry.instance) {
            stopHeartbeat(type);
            return;
        }

        entry.missedHeartbeats++;

        if (entry.missedHeartbeats > MAX_MISSED_HEARTBEATS) {
            console.warn(`[WorkerCoordinator] ${type} worker stale, restarting`);
            terminateWorker(type);
            entry.missedHeartbeats = 0;
        }
    }, entry.heartbeatInterval);

    if (debugMode) {
        console.log(`[WorkerCoordinator] Started heartbeat for ${type}`);
    }
}

/**
 * Stop heartbeat monitoring for a worker
 * @param {string} type - Worker type
 */
function stopHeartbeat(type) {
    const entry = workerRegistry.get(type);
    if (!entry || !entry.heartbeatTimer) {
        return;
    }

    clearInterval(entry.heartbeatTimer);
    entry.heartbeatTimer = null;
    entry.missedHeartbeats = 0;

    if (debugMode) {
        console.log(`[WorkerCoordinator] Stopped heartbeat for ${type}`);
    }
}

/**
 * Reset heartbeat counter (called when worker responds)
 * @param {string} type - Worker type
 */
function resetHeartbeat(type) {
    const entry = workerRegistry.get(type);
    if (entry) {
        entry.missedHeartbeats = 0;
        entry.lastUsed = Date.now();
    }
}

/**
 * Get health status of all workers
 * @returns {Object} Health status report
 */
function getHealthStatus() {
    const status = {};

    for (const [type, entry] of workerRegistry.entries()) {
        status[type] = {
            instance: !!entry.instance,
            initialized: entry.initialized,
            persistent: entry.persistent,
            age: Date.now() - entry.createdAt,
            idle: Date.now() - entry.lastUsed,
            missedHeartbeats: entry.missedHeartbeats,
            healthy: entry.missedHeartbeats <= MAX_MISSED_HEARTBEATS
        };
    }

    return status;
}

// ==========================================
// Debug and Inspection
// ==========================================

/**
 * Enable debug mode for detailed logging
 */
function enableDebugMode() {
    debugMode = true;
    console.log('[WorkerCoordinator] Debug mode enabled');
}

/**
 * Disable debug mode
 */
function disableDebugMode() {
    debugMode = false;
}

/**
 * Get registry information for debugging
 * @returns {Object} Registry state
 */
function getRegistryInfo() {
    const info = {};

    for (const [type, entry] of workerRegistry.entries()) {
        info[type] = {
            instance: !!entry.instance,
            initialized: entry.initialized,
            persistent: entry.persistent,
            createdAt: new Date(entry.createdAt).toISOString(),
            lastUsed: new Date(entry.lastUsed).toISOString(),
            heartbeatInterval: entry.heartbeatInterval,
            heartbeatActive: !!entry.heartbeatTimer,
            missedHeartbeats: entry.missedHeartbeats
        };
    }

    return info;
}

/**
 * Get statistics about worker usage
 * @returns {Object} Worker statistics
 */
function getStats() {
    let total = 0;
    let active = 0;
    let persistent = 0;

    for (const entry of workerRegistry.values()) {
        total++;
        if (entry.instance) {
            active++;
        }
        if (entry.persistent) {
            persistent++;
        }
    }

    return {
        total,
        active,
        idle: total - active,
        persistent,
        utilization: total > 0 ? (active / total * 100).toFixed(1) + '%' : '0%'
    };
}

// ==========================================
// Initialization and Cleanup
// ==========================================

/**
 * Initialize the coordinator
 * Should be called during app bootstrap
 */
function init() {
    if (coordinatorInitialized) {
        return;
    }

    registerWorker(WorkerType.PARSER, {
        persistent: false,
        heartbeatInterval: 5000
    });

    registerWorker(WorkerType.EMBEDDING, {
        persistent: true,
        heartbeatInterval: 10000
    });

    registerWorker(WorkerType.PATTERN, {
        persistent: false,
        heartbeatInterval: 5000
    });

    registerWorker(WorkerType.VECTOR_SEARCH, {
        persistent: true,
        heartbeatInterval: 10000
    });

    registerWorker(WorkerType.PATTERN_POOL, {
        persistent: true,
        heartbeatInterval: 5000
    });

    window.addEventListener('beforeunload', terminateAll);

    cleanupIntervalId = setInterval(cleanupIdleWorkers, 60000);

    coordinatorInitialized = true;

    if (debugMode) {
        console.log('[WorkerCoordinator] Initialized with 5 worker types');
    }
}

/**
 * Cleanup the coordinator
 * Should be called during app shutdown
 */
function destroy() {
    terminateAll();
    workerRegistry.clear();
    window.removeEventListener('beforeunload', terminateAll);

    if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
    }

    coordinatorInitialized = false;

    if (debugMode) {
        console.log('[WorkerCoordinator] Destroyed');
    }
}

// ==========================================
// Public API
// ==========================================

export const WorkerCoordinator = {
    WorkerType,
    registerWorker,
    unregisterWorker,
    createWorker,
    terminateWorker,
    terminateAll,
    cleanupIdleWorkers,
    resetHeartbeat,
    getHealthStatus,
    getRegistryInfo,
    getStats,
    enableDebugMode,
    disableDebugMode,
    init,
    destroy
};

export default WorkerCoordinator;
