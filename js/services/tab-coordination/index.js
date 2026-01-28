import { DeviceDetection } from '../device-detection.js';
import { WaveTelemetry } from '../wave-telemetry.js';
import { EventBus } from '../event-bus.js';
import { EventLogStore } from '../../storage/event-log-store.js';
import { SharedWorkerCoordinator } from '../../workers/shared-worker-coordinator.js';
import { Crypto } from '../../security/crypto.js';
import { AppState } from '../../state/app-state.js';
import { escapeHtml } from '../../utils/html-escape.js';

import { CHANNEL_NAME, MESSAGE_TYPES, TAB_EVENT_SCHEMAS, TAB_ID, vectorClock } from './constants.js';
import {
    TimingConfig,
    allowUnsignedMessage,
    configureTiming,
    getElectionWindowMs,
    getHeartbeatIntervalMs,
    getMaxMissedHeartbeats,
    isInBootstrapWindow
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
    validateMessageStructure
} from './message-guards.js';

let broadcastChannel = null;
let sharedWorkerFallback = false;
let coordinationTransport = null;

let debugMode = false;

let isPrimaryTab = true;
let electionTimeout = null;
let messageHandler = null;

let electionCandidates = new Set();
let receivedPrimaryClaim = false;
let electionAborted = false;
let hasCalledSecondaryMode = false;
let hasConcededLeadership = false;

let heartbeatInterval = null;
let heartbeatCheckInterval = null;
let lastLeaderHeartbeat = Date.now();
let lastLeaderVectorClock = vectorClock.toJSON();
let lastHeartbeatSentTime = 0;
let heartbeatInProgress = false;

let localSequence = 0;

const messageQueue = [];
let isProcessingQueue = false;

let lastEventWatermark = -1;
const knownWatermarks = new Map();
let watermarkBroadcastInterval = null;
const WATERMARK_BROADCAST_MS = 5000;

let visibilityMonitorCleanup = null;
let networkMonitorCleanup = null;
let wakeFromSleepCleanup = null;

function isKeySessionActive() {
    return Crypto.isSecureContext();
}

function withNonce(msg) {
    localSequence++;
    const timestamp = msg.timestamp || Date.now();
    const nonce = msg.nonce || `${TAB_ID}_${localSequence}_${timestamp}`;
    return {
        ...msg,
        seq: localSequence,
        senderId: TAB_ID,
        origin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
        timestamp,
        nonce
    };
}

async function sendMessage(msg, skipQueue = false) {
    if (!coordinationTransport) {
        return;
    }

    if (!skipQueue && !isKeySessionActive() && !isInBootstrapWindow()) {
        if (messageQueue.length < 100) {
            messageQueue.push({ msg, timestamp: Date.now() });
        }
        return;
    }

    const wrapped = withNonce(msg);
    coordinationTransport.postMessage(wrapped);
}

async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;
    try {
        while (messageQueue.length > 0) {
            const queued = messageQueue.shift();
            await sendMessage(queued.msg, true);
        }
    } finally {
        isProcessingQueue = false;
    }
}

function getAuthorityLevel() {
    return {
        level: isPrimaryTab ? 'primary' : 'secondary',
        canWrite: isPrimaryTab,
        canRead: true,
        tabId: TAB_ID,
        mode: isPrimaryTab ? 'full_access' : 'read_only',
        message: isPrimaryTab
            ? 'Full access - You can make changes'
            : 'Read-only mode - Another tab has primary control'
    };
}

const authorityChangeListeners = [];

function notifyAuthorityChange() {
    const level = getAuthorityLevel();
    EventBus.emit('tab:authority_changed', {
        isPrimary: level.canWrite,
        level: level.level,
        mode: level.mode,
        message: level.message
    });
    for (const listener of authorityChangeListeners) {
        try {
            listener(level);
        } catch (e) {
            console.error('[TabCoordination] Authority listener error:', e);
        }
    }
}

function onAuthorityChange(callback) {
    authorityChangeListeners.push(callback);
    callback(getAuthorityLevel());
    return () => {
        const idx = authorityChangeListeners.indexOf(callback);
        if (idx >= 0) authorityChangeListeners.splice(idx, 1);
    };
}

function disableWriteOperations() {
    if (typeof document === 'undefined') return;

    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    if (uploadZone) {
        uploadZone.style.pointerEvents = 'none';
        uploadZone.style.opacity = '0.5';
    }
    if (fileInput) fileInput.disabled = true;

    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Read-only mode (close other tab to enable)';
    }
    if (chatSend) chatSend.disabled = true;

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.disabled = true;

    const spotifyConnectBtn = document.getElementById('spotify-connect-btn');
    if (spotifyConnectBtn) spotifyConnectBtn.disabled = true;

    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) newChatBtn.disabled = true;
}

function handleSecondaryMode() {
    stopWatermarkBroadcast();
    if (typeof document !== 'undefined') {
        const modal = document.getElementById('multi-tab-modal');
        if (modal) {
            modal.style.display = 'flex';
            const msgEl = modal.querySelector('.modal-message');
            if (msgEl) {
                msgEl.textContent =
                    'Rhythm Chamber is open in another tab. ' +
                    'This tab is now read-only to prevent data corruption. ' +
                    'Close the other tab to regain full access here.';
            }
        }
    }
    disableWriteOperations();
    notifyAuthorityChange();
    EventBus.emit('tab:secondary_mode', { primaryTabId: null });
}

function enterSafeMode(reason) {
    console.error(`[TabCoordination] ENTERING SAFE MODE: ${reason}`);
    disableWriteOperations();

    if (typeof document !== 'undefined') {
        const modal = document.getElementById('multi-tab-modal');
        if (modal) {
            modal.style.display = 'flex';
            const msgEl = modal.querySelector('.modal-message');
            if (msgEl) {
                msgEl.textContent =
                    'A critical error occurred in tab coordination. ' +
                    'This tab has been placed in safe mode to prevent data corruption. ' +
                    'Please refresh the page. Error: ' + reason;
            }
        }
    }

    sendMessage({
        type: MESSAGE_TYPES.SAFE_MODE_CHANGED,
        tabId: TAB_ID,
        enabled: true,
        reason
    }, true);
}

function claimPrimary() {
    if (hasConcededLeadership || receivedPrimaryClaim) {
        console.error('[TabCoordination] Refusing to claim primary (split-brain prevention)');
        return;
    }
    isPrimaryTab = true;
    hasCalledSecondaryMode = false;
    sendMessage({ type: MESSAGE_TYPES.CLAIM_PRIMARY, tabId: TAB_ID }, true);
    notifyAuthorityChange();
    EventBus.emit('tab:primary_claimed', { tabId: TAB_ID });
}

async function initiateReElection() {
    if (electionTimeout) {
        clearTimeout(electionTimeout);
    }
    electionCandidates = new Set([TAB_ID]);
    receivedPrimaryClaim = false;
    electionAborted = false;
    hasCalledSecondaryMode = false;

    await sendMessage({ type: MESSAGE_TYPES.CANDIDATE, tabId: TAB_ID });
    await new Promise(resolve => {
        electionTimeout = setTimeout(resolve, getElectionWindowMs());
    });

    if (!isPrimaryTab && !electionAborted) {
        claimPrimary();
        startHeartbeat();
        startWatermarkBroadcast();
        stopHeartbeatMonitor();
    }
}

function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    WaveTelemetry.setExpected('heartbeat_interval', getHeartbeatIntervalMs());
    sendHeartbeat().catch(error => console.error('[TabCoordination] Initial heartbeat failed:', error));

    heartbeatInterval = setInterval(async () => {
        if (heartbeatInProgress) return;
        heartbeatInProgress = true;
        try {
            await sendHeartbeat();
        } catch (e) {
            console.error('[TabCoordination] Heartbeat error:', e);
        } finally {
            heartbeatInProgress = false;
        }
    }, getHeartbeatIntervalMs());
}

async function sendHeartbeat() {
    const wallClockTime = Date.now();
    const currentVectorClock = vectorClock.tick();

    if (lastHeartbeatSentTime > 0) {
        const actualInterval = wallClockTime - lastHeartbeatSentTime;
        WaveTelemetry.record('heartbeat_interval', actualInterval);
        DeviceDetection.recordHeartbeatQuality(actualInterval);
    }
    lastHeartbeatSentTime = wallClockTime;

    await sendMessage({
        type: MESSAGE_TYPES.HEARTBEAT,
        tabId: TAB_ID,
        timestamp: wallClockTime,
        vectorClock: currentVectorClock,
        deviceInfo: {
            isMobile: DeviceDetection.isMobile(),
            networkQuality: DeviceDetection.getNetworkState().quality
        }
    });
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function startHeartbeatMonitor() {
    if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval);
    }

    lastLeaderHeartbeat = Date.now();
    heartbeatCheckInterval = setInterval(() => {
        const now = Date.now();
        const maxMissed = getMaxMissedHeartbeats();
        const intervalMs = getHeartbeatIntervalMs();
        const maxAgeMs = intervalMs * maxMissed + TimingConfig.failover.promotionDelayMs;
        if (now - lastLeaderHeartbeat > maxAgeMs) {
            initiateReElection().catch(e => console.error('[TabCoordination] Re-election failed:', e));
        }
    }, 500);
}

function stopHeartbeatMonitor() {
    if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval);
        heartbeatCheckInterval = null;
    }
}

function startWatermarkBroadcast() {
    if (watermarkBroadcastInterval) return;
    watermarkBroadcastInterval = setInterval(() => {
        broadcastWatermark().catch(() => {});
    }, WATERMARK_BROADCAST_MS);
}

function stopWatermarkBroadcast() {
    if (!watermarkBroadcastInterval) return;
    clearInterval(watermarkBroadcastInterval);
    watermarkBroadcastInterval = null;
}

async function broadcastWatermark() {
    if (!isPrimaryTab) return;
    await sendMessage({
        type: MESSAGE_TYPES.EVENT_WATERMARK,
        tabId: TAB_ID,
        watermark: lastEventWatermark,
        vectorClock: vectorClock.tick()
    });
}

function updateEventWatermark(watermark) {
    lastEventWatermark = watermark;
    if (isPrimaryTab) {
        broadcastWatermark().catch(() => {});
    }
}

function getEventWatermark() {
    return lastEventWatermark;
}

function getKnownWatermarks() {
    return new Map(knownWatermarks);
}

async function handleReplayRequest(requestingTabId, fromWatermark) {
    if (!isPrimaryTab) return;
    try {
        const events = await EventLogStore.getEvents(fromWatermark, 1000);
        events.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        await sendMessage({
            type: MESSAGE_TYPES.REPLAY_RESPONSE,
            tabId: TAB_ID,
            events,
            vectorClock: vectorClock.tick()
        });
    } catch (error) {
        console.error('[TabCoordination] Error handling replay request:', error);
    }
}

async function handleReplayResponse(events) {
    if (isPrimaryTab) return;
    try {
        for (const event of events) {
            await EventBus.emit(event.type, event.payload, {
                skipEventLog: true,
                domain: event.domain || 'global'
            });
        }
        if (events.length > 0) {
            const lastEvent = events[events.length - 1];
            updateEventWatermark(lastEvent.sequenceNumber);
        }
    } catch (error) {
        console.error('[TabCoordination] Error handling replay response:', error);
    }
}

async function requestEventReplay(fromWatermark) {
    if (isPrimaryTab) {
        console.warn('[TabCoordination] Primary tab should not request replay');
        return;
    }
    if (!coordinationTransport) {
        console.warn('[TabCoordination] No coordination transport available for replay request');
        return;
    }
    await sendMessage({
        type: MESSAGE_TYPES.REPLAY_REQUEST,
        tabId: TAB_ID,
        fromWatermark,
        vectorClock: vectorClock.tick()
    });
}

function needsReplay() {
    if (isPrimaryTab) return false;
    let highestWatermark = lastEventWatermark;
    for (const watermark of knownWatermarks.values()) {
        if (watermark > highestWatermark) {
            highestWatermark = watermark;
        }
    }
    return highestWatermark > lastEventWatermark;
}

async function autoReplayIfNeeded() {
    if (!needsReplay()) return false;
    await requestEventReplay(lastEventWatermark);
    return true;
}

function broadcastSafeModeChange(enabled, reason) {
    sendMessage({
        type: MESSAGE_TYPES.SAFE_MODE_CHANGED,
        tabId: TAB_ID,
        enabled,
        reason
    });
}

function showSafeModeWarningFromRemote(reason) {
    if (typeof document === 'undefined') return;
    let banner = document.getElementById('safe-mode-remote-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'safe-mode-remote-banner';
        banner.className = 'safe-mode-banner';
        banner.innerHTML = `
            <span class="safe-mode-icon">⚠️</span>
            <span class="safe-mode-message">Safe Mode activated in another tab: <strong>${escapeHtml(reason || 'Unknown reason')}</strong></span>
            <button class="safe-mode-dismiss" data-action="dismiss-safe-mode-banner" aria-label="Dismiss warning">×</button>
        `;
        const dismissBtn = banner.querySelector('.safe-mode-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => banner.remove());
        }
        document.body.prepend(banner);
    } else {
        const msgEl = banner.querySelector('.safe-mode-message');
        if (msgEl) {
            msgEl.innerHTML = `Safe Mode activated in another tab: <strong>${escapeHtml(reason || 'Unknown reason')}</strong>`;
        }
        banner.style.display = 'flex';
    }
}

function hideSafeModeWarning() {
    if (typeof document === 'undefined') return;
    const banner = document.getElementById('safe-mode-remote-banner');
    if (banner) {
        banner.style.display = 'none';
    }
}

function setupNetworkMonitoring() {
    if (typeof window === 'undefined') return null;
    return DeviceDetection.startNetworkMonitoring?.() || null;
}

function setupWakeFromSleepDetection() {
    if (typeof window === 'undefined' || !window.addEventListener) return null;

    let lastVisibilityCheckTime = Date.now();
    const SLEEP_DETECTION_THRESHOLD_MS = 30000;

    const handler = () => {
        const now = Date.now();
        const delta = now - lastVisibilityCheckTime;
        lastVisibilityCheckTime = now;
        if (delta > SLEEP_DETECTION_THRESHOLD_MS) {
            if (!isPrimaryTab) {
                initiateReElection().catch(() => {});
            }
        }
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
}

function createMessageHandler() {
    return async (event) => {
        try {
            const structureValidation = validateMessageStructure(event.data);
            if (!structureValidation.valid) {
                return;
            }

            const { type, tabId, vectorClock: remoteClock, seq, senderId, origin, timestamp, nonce } = event.data;

            if (isRateLimited(type)) {
                return;
            }

            const isUnsigned = !!event.data.unsigned;
            if (isUnsigned && !allowUnsignedMessage()) {
                return;
            }

            if (origin && typeof window !== 'undefined' && origin !== window.location.origin) {
                return;
            }

            const isFresh = timestamp && (Date.now() - timestamp) < 60000;
            if (!isFresh) {
                return;
            }

            if (nonce && !isNonceFresh(nonce)) {
                return;
            }

            const ordering = checkAndTrackSequence({ seq, senderId, localTabId: TAB_ID, debugMode });
            if (!ordering.shouldProcess) {
                return;
            }

            if (remoteClock && typeof remoteClock === 'object') {
                vectorClock.merge(remoteClock);
            }

            switch (type) {
                case MESSAGE_TYPES.CANDIDATE: {
                    if (isPrimaryTab && tabId !== TAB_ID) {
                        await sendMessage({
                            type: MESSAGE_TYPES.CLAIM_PRIMARY,
                            tabId: TAB_ID,
                            vectorClock: vectorClock.tick()
                        });
                    }
                    electionCandidates.add(tabId);
                    break;
                }

                case MESSAGE_TYPES.CLAIM_PRIMARY: {
                    if (tabId !== TAB_ID) {
                        receivedPrimaryClaim = true;
                        electionAborted = true;
                        if (isPrimaryTab && !hasConcededLeadership) {
                            isPrimaryTab = false;
                            hasCalledSecondaryMode = true;
                            try {
                                handleSecondaryMode();
                                hasConcededLeadership = true;
                            } catch (error) {
                                isPrimaryTab = true;
                                hasCalledSecondaryMode = false;
                                receivedPrimaryClaim = false;
                                electionAborted = false;
                                enterSafeMode('secondary_mode_transition_failed');
                            }
                        } else if (!isPrimaryTab && !hasConcededLeadership) {
                            try {
                                handleSecondaryMode();
                                hasConcededLeadership = true;
                            } catch (error) {
                                enterSafeMode('secondary_mode_entry_failed');
                            }
                        }
                    }
                    break;
                }

                case MESSAGE_TYPES.RELEASE_PRIMARY: {
                    if (!isPrimaryTab && tabId !== TAB_ID) {
                        initiateReElection().catch(() => {});
                    }
                    break;
                }

                case MESSAGE_TYPES.HEARTBEAT: {
                    if (!isPrimaryTab && tabId !== TAB_ID) {
                        lastLeaderHeartbeat = Date.now();
                        lastLeaderVectorClock = remoteClock || lastLeaderVectorClock;
                    }
                    break;
                }

                case MESSAGE_TYPES.EVENT_WATERMARK: {
                    if (tabId !== TAB_ID && typeof event.data.watermark === 'number') {
                        knownWatermarks.set(tabId, event.data.watermark);
                    }
                    break;
                }

                case MESSAGE_TYPES.REPLAY_REQUEST: {
                    await handleReplayRequest(tabId, event.data.fromWatermark);
                    break;
                }

                case MESSAGE_TYPES.REPLAY_RESPONSE: {
                    await handleReplayResponse(event.data.events || []);
                    break;
                }

                case MESSAGE_TYPES.SAFE_MODE_CHANGED: {
                    if (tabId !== TAB_ID) {
                        if (event.data.enabled) {
                            showSafeModeWarningFromRemote(event.data.reason);
                        } else {
                            hideSafeModeWarning();
                        }
                        try {
                            AppState?.update?.('operations', { safeMode: !!event.data.enabled });
                        } catch (e) {
                            void e;
                        }
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('[TabCoordination] Message handler error:', error);
        }
    };
}

function createTransport(useSharedWorker = false) {
    if (useSharedWorker) {
        coordinationTransport = {
            postMessage: (msg) => SharedWorkerCoordinator.postMessage(msg),
            addEventListener: (type, handler) => SharedWorkerCoordinator.addEventListener(type, handler),
            removeEventListener: (type, handler) => SharedWorkerCoordinator.removeEventListener(type, handler),
            close: () => SharedWorkerCoordinator.close()
        };
        return;
    }

    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    coordinationTransport = {
        postMessage: (msg) => broadcastChannel.postMessage(msg),
        addEventListener: (type, handler) => broadcastChannel.addEventListener(type, handler),
        removeEventListener: (type, handler) => broadcastChannel.removeEventListener(type, handler),
        close: () => broadcastChannel.close()
    };
}

async function init() {
    EventBus.registerSchemas(TAB_EVENT_SCHEMAS);
    debugMode = false; // Debug mode is internal to AppState, not exposed via get()

    if (typeof window === 'undefined') {
        return true;
    }

    if ('BroadcastChannel' in window) {
        sharedWorkerFallback = false;
        createTransport(false);
    } else if (SharedWorkerCoordinator.isSupported()) {
        const connected = await SharedWorkerCoordinator.init(TAB_ID);
        if (connected) {
            sharedWorkerFallback = true;
            createTransport(true);
        }
    }

    if (!coordinationTransport) {
        return true;
    }

    messageHandler = createMessageHandler();
    coordinationTransport.addEventListener('message', messageHandler);

    electionCandidates = new Set([TAB_ID]);
    receivedPrimaryClaim = false;
    electionAborted = false;
    hasCalledSecondaryMode = false;
    hasConcededLeadership = false;

    await sendMessage({ type: MESSAGE_TYPES.CANDIDATE, tabId: TAB_ID });

    await new Promise(resolve => {
        electionTimeout = setTimeout(resolve, getElectionWindowMs());
    });

    if (!electionAborted) {
        const sortedCandidates = Array.from(electionCandidates).sort();
        const winner = sortedCandidates[0];
        isPrimaryTab = (winner === TAB_ID);
        if (isPrimaryTab) {
            claimPrimary();
            startHeartbeat();
            startWatermarkBroadcast();
        } else {
            startHeartbeatMonitor();
            handleSecondaryMode();
        }
    } else {
        isPrimaryTab = false;
        startHeartbeatMonitor();
        handleSecondaryMode();
    }

    window.addEventListener('beforeunload', cleanup);
    visibilityMonitorCleanup = DeviceDetection.startVisibilityMonitoring?.() || null;
    networkMonitorCleanup = setupNetworkMonitoring();
    wakeFromSleepCleanup = setupWakeFromSleepDetection();

    processMessageQueue().catch(() => {});

    return isPrimaryTab;
}

function cleanup() {
    stopHeartbeat();
    stopHeartbeatMonitor();
    stopWatermarkBroadcast();
    messageQueue.length = 0;

    if (isPrimaryTab && coordinationTransport) {
        sendMessage({ type: MESSAGE_TYPES.RELEASE_PRIMARY, tabId: TAB_ID }, true);
    }

    if (coordinationTransport) {
        coordinationTransport.removeEventListener('message', messageHandler);
        coordinationTransport.close();
        coordinationTransport = null;
    }

    if (broadcastChannel) {
        broadcastChannel.close();
        broadcastChannel = null;
    }

    if (sharedWorkerFallback) {
        SharedWorkerCoordinator.close();
        sharedWorkerFallback = false;
    }

    if (electionTimeout) {
        clearTimeout(electionTimeout);
        electionTimeout = null;
    }

    if (visibilityMonitorCleanup) {
        visibilityMonitorCleanup();
        visibilityMonitorCleanup = null;
    }
    if (networkMonitorCleanup) {
        networkMonitorCleanup();
        networkMonitorCleanup = null;
    }
    if (wakeFromSleepCleanup) {
        wakeFromSleepCleanup();
        wakeFromSleepCleanup = null;
    }

    electionCandidates = new Set();
    receivedPrimaryClaim = false;
    electionAborted = false;
    hasCalledSecondaryMode = false;
    hasConcededLeadership = false;

    knownWatermarks.clear();
}

function isPrimary() {
    return isPrimaryTab;
}

function getTabId() {
    return TAB_ID;
}

function isWriteAllowed() {
    return isPrimaryTab;
}

function assertWriteAuthority(operation = 'write operation') {
    if (!isPrimaryTab) {
        const error = new Error(`Write authority denied: ${operation}. This tab is in read-only mode.`);
        error.code = 'WRITE_AUTHORITY_DENIED';
        error.isSecondaryTab = true;
        error.suggestion = 'Close other tabs or refresh this page to become primary';
        throw error;
    }
}

const TabCoordinator = {
    init,
    isPrimary,
    getTabId,
    cleanup,

    isWriteAllowed,
    getAuthorityLevel,
    assertWriteAuthority,
    onAuthorityChange,

    configureTiming,
    getTimingConfig() {
        return structuredClone ? structuredClone(TimingConfig) : JSON.parse(JSON.stringify(TimingConfig));
    },

    getClockSkew: () => 0,
    getClockSkewHistory: () => [],
    resetClockSkewTracking: () => {},

    getAdaptiveTiming: () => null,
    getDeviceInfo: () => DeviceDetection.getDeviceInfo(),
    getNetworkState: () => DeviceDetection.getNetworkState(),
    getHeartbeatQualityStats: () => DeviceDetection.getHeartbeatQualityStats(),

    getVectorClock: () => vectorClock.clone(),
    getVectorClockState: () => vectorClock.toJSON(),
    isConflict: (remoteClock) => vectorClock.isConcurrent(remoteClock),

    updateEventWatermark,
    getEventWatermark,
    getKnownWatermarks,
    requestEventReplay,
    needsReplay,
    autoReplayIfNeeded,

    broadcastSafeModeChange,

    getOutOfOrderCount,
    resetOutOfOrderCount,
    pruneStaleRemoteSequences: () => pruneStaleRemoteSequences(debugMode),
    getRemoteSequenceCount,

    getQueueSize: () => messageQueue.length,
    getQueueInfo: () => ({
        size: messageQueue.length,
        isProcessing: isProcessingQueue,
        isWatching: false,
        isReady: isKeySessionActive()
    }),
    processQueue: processMessageQueue,

    getTransportType: () => sharedWorkerFallback ? 'SharedWorker' : 'BroadcastChannel',
    isUsingFallback: () => sharedWorkerFallback,

    validateMessageStructure,
    MESSAGE_SCHEMA,
    MESSAGE_TYPES,
    getMessageRateLimit: (type) => MESSAGE_RATE_LIMITS[type],
    getRateTracking,

    _startHeartbeat: startHeartbeat,
    _stopHeartbeat: stopHeartbeat
};

export { TabCoordinator };
