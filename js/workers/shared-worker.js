/**
 * Shared Worker for Cross-Tab Coordination
 * 
 * This SharedWorker acts as a central message hub when BroadcastChannel is unavailable.
 * It maintains connections to all open tabs and routes messages between them.
 * 
 * Features:
 * - Tab registration and tracking
 * - Message broadcast to all tabs except sender
 * - Tab disconnect detection
 * - Leader election coordination
 * 
 * @module workers/shared-worker
 */

'use strict';

// ==========================================
// State
// ==========================================

/**
 * Connected tab ports
 * @type {Map<string, MessagePort>}
 */
const connectedPorts = new Map();

/**
 * Tab metadata
 * @type {Map<string, {tabId: string, connectedAt: number, lastHeartbeat: number}>}
 */
const tabMetadata = new Map();

/**
 * Port ID counter
 * @type {number}
 */
let portIdCounter = 0;

/**
 * Current leader tab ID
 * @type {string|null}
 */
let currentLeader = null;

// ==========================================
// Connection Handling
// ==========================================

/**
 * Handle new connection from a tab
 * @param {MessageEvent} event - The connect event
 */
self.onconnect = function (event) {
    const port = event.ports[0];
    const portId = `port_${Date.now()}_${++portIdCounter}`;

    console.log(`[SharedWorker] New connection: ${portId}`);

    // Store the port
    connectedPorts.set(portId, port);

    // Set up message handler for this port
    port.onmessage = (messageEvent) => {
        handleMessage(portId, port, messageEvent.data);
    };

    // Set up error handler
    port.onmessageerror = (error) => {
        console.error(`[SharedWorker] Message error on ${portId}:`, error);
    };

    // Send acknowledgment with port ID
    port.postMessage({
        type: 'CONNECTED',
        portId,
        tabCount: connectedPorts.size,
        currentLeader
    });

    // Start the port
    port.start();
};

// ==========================================
// Message Handling
// ==========================================

/**
 * Handle incoming message from a tab
 * @param {string} portId - The sending port's ID
 * @param {MessagePort} senderPort - The sending port
 * @param {Object} message - The message data
 */
function handleMessage(portId, senderPort, message) {
    if (!message || typeof message !== 'object') {
        console.warn(`[SharedWorker] Invalid message from ${portId}:`, message);
        return;
    }

    const { type, tabId, payload } = message;

    switch (type) {
        case 'REGISTER':
            handleRegister(portId, senderPort, tabId);
            break;

        case 'HEARTBEAT':
            handleHeartbeat(portId, tabId);
            break;

        case 'BROADCAST':
            handleBroadcast(portId, message);
            break;

        case 'CLAIM_PRIMARY':
            handleClaimPrimary(portId, tabId);
            break;

        case 'RELEASE_PRIMARY':
            handleReleasePrimary(portId, tabId);
            break;

        case 'DISCONNECT':
            handleDisconnect(portId, tabId);
            break;

        default:
            // Forward unknown messages as broadcasts
            handleBroadcast(portId, message);
    }
}

/**
 * Handle tab registration
 * @param {string} portId - Port ID
 * @param {MessagePort} port - The port
 * @param {string} tabId - Tab identifier
 */
function handleRegister(portId, port, tabId) {
    console.log(`[SharedWorker] Tab registered: ${tabId} on ${portId}`);

    tabMetadata.set(portId, {
        tabId,
        connectedAt: Date.now(),
        lastHeartbeat: Date.now()
    });

    // Notify all tabs of new connection
    broadcastToAll({
        type: 'TAB_CONNECTED',
        tabId,
        tabCount: connectedPorts.size
    }, portId);

    // Send current state to new tab
    port.postMessage({
        type: 'STATE_SYNC',
        tabCount: connectedPorts.size,
        currentLeader,
        connectedTabs: Array.from(tabMetadata.values()).map(m => m.tabId)
    });
}

/**
 * Handle heartbeat from tab
 * @param {string} portId - Port ID
 * @param {string} tabId - Tab identifier
 */
function handleHeartbeat(portId, tabId) {
    const metadata = tabMetadata.get(portId);
    if (metadata) {
        metadata.lastHeartbeat = Date.now();
    }
}

/**
 * Handle broadcast request
 * @param {string} senderPortId - The sending port's ID
 * @param {Object} message - Message to broadcast
 */
function handleBroadcast(senderPortId, message) {
    broadcastToAll(message, senderPortId);
}

/**
 * Handle primary claim
 * @param {string} portId - Port ID
 * @param {string} tabId - Tab claiming primary
 */
function handleClaimPrimary(portId, tabId) {
    console.log(`[SharedWorker] Tab ${tabId} claiming primary`);

    // If no leader or same leader, accept
    if (!currentLeader || currentLeader === tabId) {
        currentLeader = tabId;

        // Broadcast leadership change
        broadcastToAll({
            type: 'LEADER_ELECTED',
            leaderId: tabId
        });
    } else {
        // Conflict - notify claimer of current leader
        const port = connectedPorts.get(portId);
        if (port) {
            port.postMessage({
                type: 'CLAIM_REJECTED',
                currentLeader,
                reason: 'leader_exists'
            });
        }
    }
}

/**
 * Handle primary release
 * @param {string} portId - Port ID
 * @param {string} tabId - Tab releasing primary
 */
function handleReleasePrimary(portId, tabId) {
    if (currentLeader === tabId) {
        console.log(`[SharedWorker] Tab ${tabId} releasing primary`);
        currentLeader = null;

        // Broadcast for re-election
        broadcastToAll({
            type: 'LEADER_RELEASED',
            previousLeader: tabId
        });
    }
}

/**
 * Handle tab disconnect
 * @param {string} portId - Port ID
 * @param {string} tabId - Tab identifier
 */
function handleDisconnect(portId, tabId) {
    console.log(`[SharedWorker] Tab disconnecting: ${tabId}`);

    const metadata = tabMetadata.get(portId);
    const disconnectedTabId = tabId || metadata?.tabId;

    // Clean up
    connectedPorts.delete(portId);
    tabMetadata.delete(portId);

    // If the leader disconnected, trigger re-election
    if (currentLeader === disconnectedTabId) {
        currentLeader = null;

        broadcastToAll({
            type: 'LEADER_DISCONNECTED',
            previousLeader: disconnectedTabId,
            tabCount: connectedPorts.size
        });
    } else {
        // Notify remaining tabs
        broadcastToAll({
            type: 'TAB_DISCONNECTED',
            tabId: disconnectedTabId,
            tabCount: connectedPorts.size
        });
    }
}

// ==========================================
// Utilities
// ==========================================

/**
 * Broadcast message to all connected ports except sender
 * @param {Object} message - Message to broadcast
 * @param {string} [excludePortId] - Port ID to exclude
 */
function broadcastToAll(message, excludePortId = null) {
    for (const [portId, port] of connectedPorts) {
        if (portId !== excludePortId) {
            try {
                port.postMessage(message);
            } catch (error) {
                console.error(`[SharedWorker] Failed to send to ${portId}:`, error);
                // Clean up dead port
                connectedPorts.delete(portId);
                tabMetadata.delete(portId);
            }
        }
    }
}

/**
 * Periodic cleanup of stale connections
 */
function cleanupStaleConnections() {
    const staleThreshold = 30000; // 30 seconds without heartbeat
    const now = Date.now();

    for (const [portId, metadata] of tabMetadata) {
        if (now - metadata.lastHeartbeat > staleThreshold) {
            console.log(`[SharedWorker] Cleaning up stale tab: ${metadata.tabId}`);
            handleDisconnect(portId, metadata.tabId);
        }
    }
}

// Run cleanup every 10 seconds
setInterval(cleanupStaleConnections, 10000);

console.log('[SharedWorker] Cross-tab coordination worker initialized');
