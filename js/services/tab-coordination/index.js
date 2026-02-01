// ==========================================
// Module Imports (11 modules from refactoring)
// ==========================================

import * as Authority from './modules/authority.js';
import * as Election from './modules/election.js';
import * as Heartbeat from './modules/heartbeat.js';
import * as Watermark from './modules/watermark.js';
import * as MessageSender from './modules/message-sender.js';
import * as MessageQueue from './modules/message-queue.js';
import * as MessageHandler from './modules/message-handler.js';
import * as SafeMode from './modules/safe-mode.js';
import * as Monitoring from './modules/monitoring.js';
import * as SleepDetection from './modules/sleep-detection.js';
import * as TransportCreation from './modules/transport-creation.js';

// ==========================================
// Direct Dependencies (re-exported for backward compatibility)
// ==========================================

import { DeviceDetection } from '../device-detection.js';
import { Crypto } from '../../security/crypto.js';

import {
    CHANNEL_NAME,
    MESSAGE_TYPES,
    TAB_EVENT_SCHEMAS,
    TAB_ID,
    vectorClock,
} from './constants.js';
import {
    TimingConfig,
    allowUnsignedMessage,
    configureTiming,
    getElectionWindowMs,
    getHeartbeatIntervalMs,
    getMaxMissedHeartbeats,
    isInBootstrapWindow,
} from './timing.js';
import {
    MESSAGE_RATE_LIMITS,
    MESSAGE_SCHEMA,
    checkAndTrackSequence,
    getOutOfOrderCount,
    getRateTracking,
    getRemoteSequenceCount,
    isNonceFresh,
    isRateLimited,
    pruneStaleRemoteSequences,
    resetOutOfOrderCount,
    validateMessageStructure,
} from './message-guards.js';

// ==========================================
// Legacy State (for backward compatibility)
// ==========================================

// Import from shared-state to prevent circular dependencies
import {
    debugMode as sharedDebugMode,
    setDebugMode,
    isKeySessionActive as sharedIsKeySessionActive,
} from './modules/shared-state.js';

// Re-export for backward compatibility
export let debugMode = sharedDebugMode;

// Helper to set debug mode (updates shared state)
function updateDebugMode(value) {
    setDebugMode(value);
    debugMode = value;
}

// ==========================================
// Helper Functions (using modules)
// ==========================================

export function isKeySessionActive() {
    // Use shared-state implementation
    return sharedIsKeySessionActive();
}

// ==========================================
// Main Initialization
// ==========================================

async function init() {
    const { EventBus } = await import('../event-bus.js');

    EventBus.registerSchemas(TAB_EVENT_SCHEMAS);
    updateDebugMode(false);

    if (typeof window === 'undefined') {
        return true;
    }

    // Initialize transport with automatic fallback
    const transportCreated = await TransportCreation.initializeTransport();
    if (!transportCreated) {
        console.warn('[TabCoordination] No transport available');
        return true;
    }

    // Create and attach message handler
    const messageHandler = MessageHandler.createMessageHandler();
    const transport = MessageSender.getTransport();
    if (transport) {
        transport.addEventListener('message', messageHandler);
    }

    // TESTING FALLBACK: Check for test marker in sessionStorage
    try {
        const isTestEnvironment =
            typeof import.meta !== 'undefined' &&
            import.meta.env &&
            (import.meta.env.MODE === 'test' || import.meta.env.DEV);
        if (isTestEnvironment) {
            const testMarker = sessionStorage.getItem('test_simulate_primary_tab');
            if (testMarker) {
                console.log('[TabCoordination] Test mode: Simulating secondary tab');
                Authority.setIsPrimaryTab(false);
                await Election.handleSecondaryModeWithWatermark();
                return false;
            }
        }
    } catch (e) {
        // Ignore sessionStorage errors
    }

    // Check localStorage for existing primary
    try {
        const existingPrimary = localStorage.getItem('rhythm_chamber_tab_election');
        if (existingPrimary) {
            const data = JSON.parse(existingPrimary);
            const ageMs = Date.now() - data.timestamp;
            const isTestEnvironment =
                typeof import.meta !== 'undefined' &&
                import.meta.env &&
                (import.meta.env.MODE === 'test' || import.meta.env.DEV);
            const electionWindowMs = isTestEnvironment ? 30000 : 5000;

            if (ageMs < electionWindowMs && data.tabId !== TAB_ID && data.isPrimary) {
                console.log('[TabCoordination] Detected existing primary, going to secondary');
                Authority.setIsPrimaryTab(false);
                await Election.handleSecondaryModeWithWatermark();
                return false;
            }
        }
    } catch (e) {
        console.warn('[TabCoordination] localStorage access error:', e);
    }

    // Send candidate message
    // FIX: Await sendMessage to catch errors and ensure message is sent
    try {
        await MessageSender.sendMessage({ type: MESSAGE_TYPES.CANDIDATE, tabId: TAB_ID });
    } catch (sendError) {
        console.error('[TabCoordination] Failed to send candidate message:', sendError);
        // Continue with election anyway - other tabs may have seen our candidacy via other means
    }

    // Wait for election window
    await new Promise(resolve => {
        setTimeout(resolve, getElectionWindowMs());
    });

    // Determine election winner
    const won = await Election.completeElection();

    if (won) {
        Heartbeat.startHeartbeat();
        // Watermark broadcast already started in Election.claimPrimary()
    } else {
        Heartbeat.startHeartbeatMonitor();
        await Election.handleSecondaryModeWithWatermark();
    }

    // Setup monitoring
    Monitoring.setupAllMonitoring();

    // Delayed re-check for late-joining tabs
    setTimeout(async () => {
        if (Authority.getIsPrimaryTab()) {
            MessageSender.sendMessage(
                {
                    type: MESSAGE_TYPES.CLAIM_PRIMARY,
                    tabId: TAB_ID,
                    vectorClock: vectorClock.tick(),
                },
                true
            );

            try {
                localStorage.setItem(
                    'rhythm_chamber_tab_election',
                    JSON.stringify({
                        tabId: TAB_ID,
                        timestamp: Date.now(),
                        isPrimary: true,
                    })
                );
            } catch (e) {
                // localStorage might not be available
            }
        }
    }, 100);

    // Listen for localStorage events from other tabs
    window.addEventListener('storage', async e => {
        if (e.key === 'rhythm_chamber_tab_election' && e.newValue && Authority.getIsPrimaryTab()) {
            try {
                const data = JSON.parse(e.newValue);
                if (data.tabId !== TAB_ID && data.isPrimary) {
                    console.log('[TabCoordination] Detected primary via localStorage, conceding');
                    Authority.setIsPrimaryTab(false);
                    await Election.handleSecondaryModeWithWatermark();
                }
            } catch (parseError) {
                // Ignore parse errors
            }
        }
    });

    // Process message queue
    MessageQueue.processMessageQueue().catch(error => {
        console.error('[TabCoordination] Message queue processing error:', error);
    });

    return Authority.getIsPrimaryTab();
}

function cleanup() {
    // Send release primary message if we're primary
    if (Authority.getIsPrimaryTab()) {
        MessageSender.sendMessage({ type: MESSAGE_TYPES.RELEASE_PRIMARY, tabId: TAB_ID }, true);
    }

    // Cleanup all modules
    Heartbeat.cleanupHeartbeat();
    Watermark.cleanupWatermark();
    Election.cleanupElection();
    Monitoring.cleanupMonitoring();
    MessageQueue.clearQueue();
    MessageSender.closeTransport();
}

// ==========================================
// Public API Functions (backward compatibility)
// ==========================================

function isPrimary() {
    return Authority.getIsPrimaryTab();
}

function getTabId() {
    return TAB_ID;
}

function isWriteAllowed() {
    return Authority.getIsPrimaryTab();
}

function assertWriteAuthority(operation = 'write operation') {
    if (!Authority.getIsPrimaryTab()) {
        const error = new Error(
            `Write authority denied: ${operation}. This tab is in read-only mode.`
        );
        error.code = 'WRITE_AUTHORITY_DENIED';
        error.isSecondaryTab = true;
        error.suggestion = 'Close other tabs or refresh this page to become primary';
        throw error;
    }
}

// ==========================================
// TabCoordinator Public API
// ==========================================

const TabCoordinator = {
    // Initialization
    init,
    cleanup,

    // Authority
    isPrimary,
    getTabId,
    isWriteAllowed,
    getAuthorityLevel: Authority.getAuthorityLevel,
    assertWriteAuthority,
    onAuthorityChange: Authority.onAuthorityChange,

    // Timing
    configureTiming,
    getTimingConfig() {
        return structuredClone
            ? structuredClone(TimingConfig)
            : JSON.parse(JSON.stringify(TimingConfig));
    },

    // Device Detection (delegated)
    getClockSkew: () => 0,
    getClockSkewHistory: () => [],
    resetClockSkewTracking: () => {},

    getAdaptiveTiming: () => null,
    getDeviceInfo: () => DeviceDetection.getDeviceInfo(),
    getNetworkState: () => DeviceDetection.getNetworkState(),
    getHeartbeatQualityStats: () => DeviceDetection.getHeartbeatQualityStats(),

    // Vector Clock
    getVectorClock: () => vectorClock.clone(),
    getVectorClockState: () => vectorClock.toJSON(),
    isConflict: remoteClock => vectorClock.isConcurrent(remoteClock),

    // Watermark & Replay
    updateEventWatermark: Watermark.updateEventWatermark,
    getEventWatermark: Watermark.getEventWatermark,
    getKnownWatermarks: Watermark.getKnownWatermarks,
    requestEventReplay: Watermark.requestEventReplay,
    needsReplay: Watermark.needsReplay,
    autoReplayIfNeeded: Watermark.autoReplayIfNeeded,

    // Safe Mode
    broadcastSafeModeChange: SafeMode.broadcastSafeModeChange,

    // Message Guards
    getOutOfOrderCount,
    resetOutOfOrderCount,
    pruneStaleRemoteSequences: () => pruneStaleRemoteSequences(debugMode),
    getRemoteSequenceCount,

    // Message Queue
    getQueueSize: MessageQueue.getQueueSize,
    getQueueInfo: () => MessageQueue.getQueueInfo(isKeySessionActive()),
    processQueue: MessageQueue.processMessageQueue,

    // Message Ordering
    getPendingCount: MessageSender.getPendingCount,
    getAllPendingCounts: MessageSender.getAllPendingCounts,
    clearPendingMessages: MessageSender.clearPendingMessages,

    // Transport
    getTransportType: MessageSender.getTransportType,
    isUsingFallback: MessageSender.isUsingFallback,

    // Message Validation
    validateMessageStructure,
    MESSAGE_SCHEMA,
    MESSAGE_TYPES,
    getMessageRateLimit: type => MESSAGE_RATE_LIMITS[type],
    getRateTracking,

    // Internal (for testing)
    _startHeartbeat: Heartbeat.startHeartbeat,
    _stopHeartbeat: Heartbeat.stopHeartbeat,
};

// ==========================================
// Module Re-exports (for direct access if needed)
// ==========================================

export {
    Authority,
    Election,
    Heartbeat,
    Watermark,
    MessageSender,
    MessageQueue,
    MessageHandler,
    SafeMode,
    Monitoring,
    SleepDetection,
    TransportCreation,
};

// Main export - backward compatible
export { TabCoordinator };
