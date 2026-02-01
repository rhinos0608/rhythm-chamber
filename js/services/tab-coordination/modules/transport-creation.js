/**
 * Tab Coordinator - Transport Creation Module
 *
 * Handles transport layer creation and initialization:
 * - Creates BroadcastChannel transport
 * - Creates SharedWorker transport as fallback
 * - Returns unified transport interface
 *
 * @module tab-coordination/modules/transport-creation
 */

import { CHANNEL_NAME } from '../constants.js';
import { SharedWorkerCoordinator } from '../../../workers/shared-worker-coordinator.js';
import { setTransport, setBroadcastChannel, setSharedWorkerFallback } from './message-sender.js';

// ==========================================
// Transport Creation
// ==========================================

/**
 * Create coordination transport
 * @param {boolean} useSharedWorker - Whether to use SharedWorker instead of BroadcastChannel
 */
export function createTransport(useSharedWorker = false) {
    if (useSharedWorker) {
        // Create SharedWorker-based transport
        const transport = {
            postMessage: msg => SharedWorkerCoordinator.postMessage(msg),
            addEventListener: (type, handler) =>
                SharedWorkerCoordinator.addEventListener(type, handler),
            removeEventListener: (type, handler) =>
                SharedWorkerCoordinator.removeEventListener(type, handler),
            close: () => SharedWorkerCoordinator.close(),
        };

        setTransport(transport);
        setSharedWorkerFallback(true);
        return transport;
    }

    // Create BroadcastChannel-based transport
    const broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    const transport = {
        postMessage: msg => broadcastChannel.postMessage(msg),
        addEventListener: (type, handler) => broadcastChannel.addEventListener(type, handler),
        removeEventListener: (type, handler) => broadcastChannel.removeEventListener(type, handler),
        close: () => broadcastChannel.close(),
    };

    setTransport(transport);
    setBroadcastChannel(broadcastChannel);
    setSharedWorkerFallback(false);

    return transport;
}

/**
 * Initialize transport with automatic fallback
 * Tries BroadcastChannel first, falls back to SharedWorker
 * @returns {Promise<boolean>} True if transport was created successfully
 */
export async function initializeTransport() {
    // Try BroadcastChannel first
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        createTransport(false);
        return true;
    }

    // Fall back to SharedWorker
    if (SharedWorkerCoordinator.isSupported()) {
        const connected = await SharedWorkerCoordinator.init();
        if (connected) {
            createTransport(true);
            return true;
        }
    }

    return false;
}
