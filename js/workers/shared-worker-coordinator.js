/**
 * Shared Worker Coordinator
 * 
 * Client-side coordinator for the SharedWorker fallback when BroadcastChannel
 * is unavailable. Provides the same API surface as BroadcastChannel for
 * seamless integration with TabCoordination.
 * 
 * Features:
 * - Unified message interface matching BroadcastChannel
 * - Automatic reconnection on worker death
 * - Heartbeat for liveness detection
 * - Graceful degradation if SharedWorker unavailable
 * 
 * @module workers/shared-worker-coordinator
 */

// ==========================================
// Configuration
// ==========================================

import { WORKER_TIMEOUTS } from '../config/timeouts.js';

const WORKER_URL = './js/workers/shared-worker.js';

// ==========================================
// State
// ==========================================

/** @type {SharedWorker|null} */
let sharedWorker = null;

/** @type {MessagePort|null} */
let workerPort = null;

/** @type {string|null} */
let portId = null;

/** @type {Set<Function>} */
const messageListeners = new Set();

/** @type {Set<Function>} */
const errorListeners = new Set();

/** @type {number|null} */
let heartbeatInterval = null;

/** @type {number} */
let reconnectAttempts = 0;

/** @type {boolean} */
let isConnected = false;

/** @type {string|null} */
let tabId = null;

/** @type {Map<string, {resolve: Function, reject: Function, timestamp: number}>} */
const pendingClaims = new Map();

/** @type {number} */
let claimIdCounter = 0;

// ==========================================
// Public API
// ==========================================

/**
 * Check if SharedWorker is supported in this browser
 * @returns {boolean}
 */
function isSupported() {
    return typeof SharedWorker !== 'undefined';
}

/**
 * Initialize the SharedWorker connection
 * @param {string} id - Tab identifier
 * @returns {Promise<boolean>} True if connected successfully
 */
async function init(id) {
    tabId = id;

    if (!isSupported()) {
        console.warn('[SharedWorkerCoordinator] SharedWorker not supported');
        return false;
    }

    try {
        return await connect();
    } catch (error) {
        console.error('[SharedWorkerCoordinator] Failed to initialize:', error);
        return false;
    }
}

/**
 * Connect to the SharedWorker
 * @returns {Promise<boolean>}
 */
async function connect() {
    return new Promise((resolve, reject) => {
        try {
            sharedWorker = new SharedWorker(WORKER_URL, {
                name: 'rhythm-chamber-coordinator'
            });

            workerPort = sharedWorker.port;

            // Set up message handler
            workerPort.onmessage = handleWorkerMessage;

            // Set up error handler
            sharedWorker.onerror = (error) => {
                console.error('[SharedWorkerCoordinator] Worker error:', error);
                handleWorkerError(error);
            };

            workerPort.onmessageerror = (error) => {
                console.error('[SharedWorkerCoordinator] Message error:', error);
            };

            // Start the port
            workerPort.start();

            // Wait for connection acknowledgment
            const connectionHandler = (event) => {
                if (event.data?.type === 'CONNECTED') {
                    clearTimeout(timeout);
                    portId = event.data.portId;
                    isConnected = true;
                    reconnectAttempts = 0;

                    // Register this tab
                    postMessage({
                        type: 'REGISTER',
                        tabId
                    });

                    // Start heartbeat
                    startHeartbeat();

                    console.log('[SharedWorkerCoordinator] Connected with port ID:', portId);
                    resolve(true);

                    // Remove this one-time handler (we'll use the main handler)
                    workerPort.removeEventListener('message', connectionHandler);
                }
            };

            const timeout = setTimeout(() => {
                workerPort.removeEventListener('message', connectionHandler);
                reject(new Error('Connection timeout'));
            }, WORKER_TIMEOUTS.CLAIM_ACK_TIMEOUT_MS); // Reuse 3s timeout for connection

            workerPort.addEventListener('message', connectionHandler);

        } catch (error) {
            console.error('[SharedWorkerCoordinator] Connection error:', error);
            reject(error);
        }
    });
}

/**
 * Post a message to all other tabs
 * @param {Object} message - Message to broadcast
 */
function postMessage(message) {
    if (!workerPort || !isConnected) {
        console.warn('[SharedWorkerCoordinator] Cannot post message - not connected');
        return false;
    }

    try {
        workerPort.postMessage({
            ...message,
            type: 'BROADCAST',
            tabId
        });
        return true;
    } catch (error) {
        console.error('[SharedWorkerCoordinator] Failed to post message:', error);
        return false;
    }
}

/**
 * Add a message listener
 * @param {string} eventType - Should be 'message'
 * @param {Function} handler - Message handler
 */
function addEventListener(eventType, handler) {
    if (eventType === 'message') {
        messageListeners.add(handler);
    } else if (eventType === 'error') {
        errorListeners.add(handler);
    }
}

/**
 * Remove a message listener
 * @param {string} eventType - Should be 'message'
 * @param {Function} handler - Message handler
 */
function removeEventListener(eventType, handler) {
    if (eventType === 'message') {
        messageListeners.delete(handler);
    } else if (eventType === 'error') {
        errorListeners.delete(handler);
    }
}

/**
 * Close the connection
 */
function close() {
    if (workerPort && isConnected) {
        try {
            // Notify worker of disconnect
            workerPort.postMessage({
                type: 'DISCONNECT',
                tabId
            });
        } catch (e) {
            // Ignore errors during close
        }
    }

    stopHeartbeat();
    isConnected = false;

    if (workerPort) {
        // Feature-detect close; some environments may not support it
        if (typeof workerPort.close === 'function') {
            try {
                workerPort.close();
            } catch (e) {
                // Swallow close errors
            }
        }
        workerPort = null;
    }

    if (sharedWorker) {
        try {
            sharedWorker.port?.close?.();
        } catch (_) {
            // Ignore
        }
        sharedWorker = null;
    }

    portId = null;
    pendingClaims.clear();

    console.log('[SharedWorkerCoordinator] Connection closed');
}

/**
 * Get connection status
 * @returns {{connected: boolean, portId: string|null, tabId: string|null, reconnectAttempts: number}}
 */
function getStatus() {
    return {
        connected: isConnected,
        portId,
        tabId,
        reconnectAttempts
    };
}

/**
 * Claim primary (leader) role with ACK mechanism
 * Prevents multi-writer race conditions by waiting for acknowledgment
 * MEDIUM FIX Issue #14: Added disconnect handler cleanup for pending claims
 *
 * @returns {Promise<{granted: boolean, leaderId: string|null, reason: string|null}>}
 */
async function claimPrimary() {
    if (!workerPort || !isConnected) {
        console.warn('[SharedWorkerCoordinator] Cannot claim primary - not connected');
        return { granted: false, leaderId: null, reason: 'not_connected' };
    }

    // Generate unique claim ID
    const claimId = `claim_${Date.now()}_${++claimIdCounter}`;

    return new Promise((resolve, reject) => {
        // Set up timeout for claim response
        const timeout = setTimeout(() => {
            // MEDIUM FIX Issue #14: Clean up claim on timeout
            pendingClaims.delete(claimId);
            reject(new Error('Leader claim timeout - no acknowledgment received'));
        }, WORKER_TIMEOUTS.CLAIM_ACK_TIMEOUT_MS);

        // Store pending claim
        pendingClaims.set(claimId, {
            resolve: (result) => {
                clearTimeout(timeout);
                resolve(result);
            },
            reject: (error) => {
                clearTimeout(timeout);
                reject(error);
            },
            timestamp: Date.now()
        });

        // MEDIUM FIX Issue #14: Add disconnect handler to clean up pending claim
        // This prevents memory leaks if the worker disconnects unexpectedly
        const disconnectHandler = () => {
            if (pendingClaims.has(claimId)) {
                clearTimeout(timeout);
                pendingClaims.delete(claimId);
                reject(new Error('Worker disconnected during primary claim'));
            }
        };

        // CRITICAL FIX: MessagePort uses 'close' event, not 'disconnect'
        // 'disconnect' event doesn't exist on MessagePort, so this listener never fires
        // causing memory leaks when the port is closed
        workerPort.addEventListener('close', disconnectHandler, { once: true });

        // Send claim request
        try {
            workerPort.postMessage({
                type: 'CLAIM_PRIMARY',
                tabId,
                claimId
            });
        } catch (error) {
            clearTimeout(timeout);
            // MEDIUM FIX Issue #14: Clean up on postMessage error
            pendingClaims.delete(claimId);
            // Remove disconnect handler since we're rejecting anyway
            workerPort.removeEventListener('close', disconnectHandler);
            reject(error);
        }
    });
}

/**
 * Release primary (leader) role
 * @returns {boolean} True if release message was sent
 */
function releasePrimary() {
    if (!workerPort || !isConnected) {
        console.warn('[SharedWorkerCoordinator] Cannot release primary - not connected');
        return false;
    }

    try {
        workerPort.postMessage({
            type: 'RELEASE_PRIMARY',
            tabId
        });
        return true;
    } catch (error) {
        console.error('[SharedWorkerCoordinator] Failed to release primary:', error);
        return false;
    }
}

// ==========================================
// Internal Functions
// ==========================================

/**
 * Handle message from worker
 * @param {MessageEvent} event
 */
function handleWorkerMessage(event) {
    const message = event.data;

    if (!message || typeof message !== 'object') {
        return;
    }

    // Handle ACK messages for leadership claims
    if (message.type === 'LEADER_GRANTED' || message.type === 'CLAIM_REJECTED') {
        const claimId = message.claimId;
        const pendingClaim = pendingClaims.get(claimId);

        if (pendingClaim) {
            pendingClaims.delete(claimId);

            if (message.type === 'LEADER_GRANTED') {
                console.log(`[SharedWorkerCoordinator] Leadership granted (claimId: ${claimId})`);
                pendingClaim.resolve({
                    granted: true,
                    leaderId: message.leaderId,
                    reason: null
                });
            } else {
                console.log(`[SharedWorkerCoordinator] Leadership rejected - ${message.reason} (claimId: ${claimId})`);
                pendingClaim.resolve({
                    granted: false,
                    leaderId: message.currentLeader,
                    reason: message.reason
                });
            }
        } else {
            console.warn(`[SharedWorkerCoordinator] Received ${message.type} for unknown claim: ${claimId}`);
        }
        return;  // Don't forward ACK messages to listeners
    }

    // Create a BroadcastChannel-like event object
    const syntheticEvent = {
        data: message,
        origin: 'SharedWorker',
        source: null
    };

    // Notify all listeners
    for (const listener of messageListeners) {
        try {
            listener(syntheticEvent);
        } catch (error) {
            console.error('[SharedWorkerCoordinator] Listener error:', error);
        }
    }
}

/**
 * Handle worker error
 * @param {Event} error
 */
function handleWorkerError(error) {
    isConnected = false;

    // Notify error listeners
    for (const listener of errorListeners) {
        try {
            listener(error);
        } catch (e) {
            console.error('[SharedWorkerCoordinator] Error listener threw:', e);
        }
    }

    // Clear pending claims on disconnect/error to avoid hung promises
    pendingClaims.forEach(({ reject }) => {
        try {
            reject(new Error('Worker disconnected'));
        } catch (_) {
            // ignore
        }
    });
    pendingClaims.clear();

    // Attempt reconnection
    attemptReconnect();
}

/**
 * Attempt to reconnect to the worker
 */
async function attemptReconnect() {
    while (reconnectAttempts < WORKER_TIMEOUTS.MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[SharedWorkerCoordinator] Reconnection attempt ${reconnectAttempts}/${WORKER_TIMEOUTS.MAX_RECONNECT_ATTEMPTS}`);

        await new Promise(resolve => setTimeout(resolve, WORKER_TIMEOUTS.RECONNECT_DELAY_MS));

        try {
            await connect();
            return; // Success - exit loop
        } catch (error) {
            console.error('[SharedWorkerCoordinator] Reconnection failed:', error);
            // Continue to next attempt
        }
    }
    console.error('[SharedWorkerCoordinator] Max reconnection attempts reached');
}

/**
 * Start heartbeat
 */
function startHeartbeat() {
    stopHeartbeat();

    heartbeatInterval = setInterval(() => {
        if (workerPort && isConnected) {
            try {
                workerPort.postMessage({
                    type: 'HEARTBEAT',
                    tabId
                });
            } catch (error) {
                console.error('[SharedWorkerCoordinator] Heartbeat failed:', error);
                handleWorkerError(error);
            }
        }
    }, WORKER_TIMEOUTS.HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop heartbeat
 */
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// ==========================================
// Export
// ==========================================

const SharedWorkerCoordinator = {
    isSupported,
    init,
    postMessage,
    addEventListener,
    removeEventListener,
    close,
    getStatus,
    claimPrimary,  // NEW: ACK-based leadership claim
    releasePrimary  // NEW: Leadership release
};

export { SharedWorkerCoordinator };

console.log('[SharedWorkerCoordinator] Module loaded');
