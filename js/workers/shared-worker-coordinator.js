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

const WORKER_URL = './js/workers/shared-worker.js';
const HEARTBEAT_INTERVAL_MS = 5000;
const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_ATTEMPTS = 3;

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
            }, 5000);

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
    workerPort = null;
    sharedWorker = null;
    portId = null;

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

    // Attempt reconnection
    attemptReconnect();
}

/**
 * Attempt to reconnect to the worker
 */
async function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('[SharedWorkerCoordinator] Max reconnection attempts reached');
        return;
    }

    reconnectAttempts++;
    console.log(`[SharedWorkerCoordinator] Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));

    try {
        await connect();
    } catch (error) {
        console.error('[SharedWorkerCoordinator] Reconnection failed:', error);
        attemptReconnect();
    }
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
    }, HEARTBEAT_INTERVAL_MS);
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
    getStatus
};

export { SharedWorkerCoordinator };

console.log('[SharedWorkerCoordinator] Module loaded');
