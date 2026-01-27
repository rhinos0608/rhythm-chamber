/**
 * Worker Lifecycle Module
 *
 * Handles worker creation, termination, and health monitoring.
 *
 * Responsibilities:
 * - Worker creation and initialization
 * - Heartbeat channel setup and management
 * - Stale worker detection
 * - Worker restart with atomic state transitions
 * - Worker termination and cleanup
 * - Memory leak prevention
 *
 * @module workers/pattern-worker-pool/worker-lifecycle
 */

import { EventBus } from '../../services/event-bus.js';
import { WORKER_TIMEOUTS } from '../../config/timeouts.js';

// ==========================================
// State
// ==========================================

let workers = [];
let initialized = false;
let heartbeatInterval = null;
const workerLastHeartbeat = new Map();
const workerHeartbeatChannels = new Map();
const HEARTBEAT_DEBUG_LOGS = false;

// Page unload cleanup tracking
let unloadHandlerRegistered = false;
let unloadCleanupFn = null;

// ==========================================
// Public API
// ==========================================

/**
 * Create and initialize a new worker
 *
 * @param {number} index - Worker index for logging
 * @returns {Object} Worker info object with worker, busy, and processedCount
 */
export function createWorker(index) {
    const worker = new Worker('./pattern-worker.js');

    // Setup message handlers
    worker.onmessage = null; // Will be set by task-distribution module
    worker.onerror = null; // Will be set by task-distribution module

    const workerInfo = {
        worker,
        busy: false,
        processedCount: 0
    };

    workers.push(workerInfo);

    // RACE CONDITION FIX: Setup heartbeat channel BEFORE tracking heartbeat
    // This prevents race window where stale worker detection could trigger
    // before the channel is ready
    setupHeartbeatChannel(worker, index);

    // Only initialize heartbeat tracking AFTER channel is ready
    workerLastHeartbeat.set(worker, Date.now());

    console.log(`[WorkerLifecycle] Worker ${index} created and initialized`);

    return workerInfo;
}

/**
 * Setup dedicated MessageChannel for heartbeat communication
 * This isolates heartbeat messages from work messages to prevent:
 * 1. Large work payloads delaying heartbeat responses
 * 2. False positive stale detection during heavy computation
 *
 * @param {Worker} worker - The worker to setup heartbeat channel for
 * @param {number} index - Worker index for logging
 */
export function setupHeartbeatChannel(worker, index) {
    let channel;
    try {
        // Create a dedicated MessageChannel for this worker's heartbeats
        channel = new MessageChannel();

        // Store the channel for later use
        workerHeartbeatChannels.set(worker, {
            port: channel.port1,
            index
        });

        // Setup handler for heartbeat responses on port1
        channel.port1.onmessage = (event) => {
            const { type, timestamp } = event.data;
            if (type === 'HEARTBEAT_RESPONSE') {
                workerLastHeartbeat.set(worker, timestamp || Date.now());
                if (HEARTBEAT_DEBUG_LOGS) {
                    console.log(`[WorkerLifecycle] Worker ${index} heartbeat received via dedicated channel`);
                }
            }
        };

        // Transfer port2 to the worker
        worker.postMessage({
            type: 'HEARTBEAT_CHANNEL',
            port: channel.port2
        }, [channel.port2]);

        console.log(`[WorkerLifecycle] Heartbeat channel established for worker ${index}`);
    } catch (error) {
        // CRITICAL FIX: Clean up MessageChannel if postMessage fails
        // If we don't close port1 and remove the listener, it will leak
        if (channel) {
            try {
                channel.port1.close();
            } catch (closeError) {
                console.error('[WorkerLifecycle] Failed to close port1 during cleanup:', closeError);
            }
        }
        workerHeartbeatChannels.delete(worker);

        // Fallback: some environments don't support MessageChannel transferable
        console.warn(`[WorkerLifecycle] MessageChannel not available for worker ${index}, using fallback:`, error.message);
    }
}

/**
 * Send heartbeat to all workers via dedicated channels
 * Falls back to regular postMessage if MessageChannel unavailable
 *
 * @returns {void}
 */
export function sendHeartbeat() {
    if (!initialized || workers.length === 0) {
        return;
    }

    const timestamp = Date.now();

    workers.forEach((workerInfo, index) => {
        try {
            const channelInfo = workerHeartbeatChannels.get(workerInfo.worker);

            if (channelInfo && channelInfo.port) {
                // Use dedicated heartbeat channel (preferred - doesn't contend with work)
                channelInfo.port.postMessage({
                    type: 'HEARTBEAT',
                    timestamp
                });
            } else {
                // Fallback: use regular worker postMessage
                workerInfo.worker.postMessage({
                    type: 'HEARTBEAT',
                    timestamp
                });
            }
        } catch (error) {
            console.error(`[WorkerLifecycle] Failed to send heartbeat to worker ${index}:`, error);
        }
    });
}

/**
 * Check for stale workers and restart them
 * CRITICAL FIX: Preserve pending requests during worker restart
 *
 * @param {Function} onRequestFailed - Callback for failed requests
 * @returns {Array<Object>} Array of stale worker info that need restart
 */
export function checkStaleWorkers(onRequestFailed) {
    if (!initialized || workers.length === 0) {
        return [];
    }

    const now = Date.now();
    const staleWorkers = [];

    workers.forEach((workerInfo, index) => {
        const lastHeartbeat = workerLastHeartbeat.get(workerInfo.worker);

        // If no heartbeat received or heartbeat is too old, mark as stale
        if (!lastHeartbeat || (now - lastHeartbeat) > WORKER_TIMEOUTS.STALE_WORKER_TIMEOUT_MS) {
            staleWorkers.push({ workerInfo, index });
        }
    });

    return staleWorkers;
}

/**
 * Restart a single worker with atomic state transition
 * CRITICAL FIX: Prevents race conditions when multiple workers restart simultaneously
 *
 * @param {Object} workerInfo - Worker info object containing worker reference
 * @param {number} index - Worker index for logging
 * @returns {boolean} Success status
 */
export function restartWorker(workerInfo, index) {
    const oldWorker = workerInfo.worker;
    const oldChannel = workerHeartbeatChannels.get(oldWorker);

    try {
        // ATOMIC TRANSITION: Clear old worker state FIRST
        // This prevents any other code from trying to use the old worker
        // or its heartbeat channel during the restart process.

        // Step 1: Close and cleanup heartbeat channel atomically
        if (oldChannel && oldChannel.port) {
            try {
                oldChannel.port.close();
            } catch (e) {
                console.error('[WorkerLifecycle] Failed to close heartbeat channel:', e);
                EventBus.emit('worker:cleanup_failed', { error: e.message, workerIndex: index });
            }
        }
        workerHeartbeatChannels.delete(oldWorker);
        workerLastHeartbeat.delete(oldWorker);

        // Step 2: Terminate old worker (now completely disconnected)
        oldWorker.terminate();

        // Step 3: Create new worker and setup fresh state
        const newWorker = new Worker('./pattern-worker.js');

        // Setup message handlers BEFORE any messages can arrive
        // Note: These will be overwritten by task-distribution module
        newWorker.onmessage = null;
        newWorker.onerror = null;

        // ATOMIC UPDATE: Replace worker reference only AFTER everything is ready
        workerInfo.worker = newWorker;
        workerInfo.busy = false;

        // Initialize heartbeat tracking for new worker
        workerLastHeartbeat.set(newWorker, Date.now());

        // Setup new heartbeat channel (completes the initialization)
        setupHeartbeatChannel(newWorker, index);

        console.log(`[WorkerLifecycle] Worker ${index} restarted successfully with new heartbeat channel`);
        return true;
    } catch (error) {
        console.error(`[WorkerLifecycle] Failed to restart worker ${index}:`, error);

        // Recovery attempt: If restart failed, ensure old worker is cleaned up
        // to prevent zombie workers from hanging around
        try {
            if (oldWorker) {
                oldWorker.terminate();
            }
            if (oldChannel && oldChannel.port) {
                oldChannel.port.close();
            }
        } catch (cleanupError) {
            console.error('[WorkerLifecycle] Error during cleanup after failed restart:', cleanupError);
        }

        // Mark worker as unusable but keep it in the array to maintain indexing
        workerInfo.worker = null;
        workerInfo.busy = false;
        return false;
    }
}

/**
 * Start the heartbeat interval
 *
 * @returns {void}
 */
export function startHeartbeat() {
    if (heartbeatInterval) {
        console.log('[WorkerLifecycle] Heartbeat already running');
        return;
    }

    console.log(`[WorkerLifecycle] Starting heartbeat (interval: ${WORKER_TIMEOUTS.HEARTBEAT_INTERVAL_MS}ms)`);

    heartbeatInterval = setInterval(() => {
        sendHeartbeat();
        // Note: checkStaleWorkers and restartWorker will be called by task-distribution module
    }, WORKER_TIMEOUTS.HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop the heartbeat interval
 *
 * @returns {void}
 */
export function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        console.log('[WorkerLifecycle] Heartbeat stopped');
    }
}

/**
 * Terminate all workers and cleanup resources
 * CRITICAL FIX: Prevents memory leaks on page unload
 *
 * @returns {void}
 */
export function terminate() {
    // Stop heartbeat monitoring
    stopHeartbeat();

    // Clean up heartbeat channels
    for (const [worker, channelInfo] of workerHeartbeatChannels.entries()) {
        try {
            if (channelInfo && channelInfo.port) {
                channelInfo.port.close();
            }
        } catch (e) {
            console.error('[WorkerLifecycle] Failed to close heartbeat channel during termination:', e);
            EventBus.emit('worker:cleanup_failed', { error: e.message, workerIndex: workers.findIndex(w => w.worker === worker) });
        }
    }
    workerHeartbeatChannels.clear();

    // Clear heartbeat tracking
    workerLastHeartbeat.clear();

    // Terminate all workers
    for (const workerInfo of workers) {
        if (workerInfo.worker) {
            workerInfo.worker.terminate();
        }
    }

    workers = [];
    initialized = false;

    // CRITICAL FIX: Remove page unload handler to prevent leaks
    if (unloadHandlerRegistered && unloadCleanupFn && typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', unloadCleanupFn);
        unloadHandlerRegistered = false;
        unloadCleanupFn = null;
        console.log('[WorkerLifecycle] Removed beforeunload handler');
    }

    console.log('[WorkerLifecycle] Terminated all workers and heartbeat channels');
}

/**
 * Set the initialization state
 *
 * @param {boolean} value - Initialization state
 * @returns {void}
 */
export function setInitialized(value) {
    initialized = value;
}

/**
 * Get the initialization state
 *
 * @returns {boolean} Initialization state
 */
export function isInitialized() {
    return initialized;
}

/**
 * Get all workers
 *
 * @returns {Array<Object>} Array of worker info objects
 */
export function getWorkers() {
    return workers;
}

/**
 * Set workers array (for initialization)
 *
 * @param {Array} workerArray - Array of worker info objects
 * @returns {void}
 */
export function setWorkers(workerArray) {
    workers = workerArray;
}

/**
 * Register page unload handler for cleanup
 *
 * @param {Function} terminateFn - Termination function to call on unload
 * @returns {void}
 */
export function registerUnloadHandler(terminateFn) {
    if (!unloadHandlerRegistered && typeof window !== 'undefined') {
        unloadCleanupFn = terminateFn;
        window.addEventListener('beforeunload', unloadCleanupFn);
        unloadHandlerRegistered = true;
        console.log('[WorkerLifecycle] Registered beforeunload handler for cleanup');
    }
}

/**
 * Get worker last heartbeat timestamp
 *
 * @param {Worker} worker - Worker instance
 * @returns {number|undefined} Last heartbeat timestamp
 */
export function getLastHeartbeat(worker) {
    return workerLastHeartbeat.get(worker);
}

/**
 * Set worker last heartbeat timestamp
 *
 * @param {Worker} worker - Worker instance
 * @param {number} timestamp - Heartbeat timestamp
 * @returns {void}
 */
export function setLastHeartbeat(worker, timestamp) {
    workerLastHeartbeat.set(worker, timestamp);
}

/**
 * Get worker heartbeat channel info
 *
 * @param {Worker} worker - Worker instance
 * @returns {Object|undefined} Channel info with port and index
 */
export function getHeartbeatChannel(worker) {
    return workerHeartbeatChannels.get(worker);
}
