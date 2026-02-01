/**
 * Tab Coordinator - Watermark Module
 *
 * Handles event watermark broadcast and replay:
 * - Broadcasts event watermarks from primary tab
 * - Tracks known watermarks from all tabs
 * - Handles event replay requests
 * - Determines if replay is needed
 *
 * @module tab-coordination/modules/watermark
 */

import { EventBus } from '../../event-bus.js';
import { EventLogStore } from '../../../storage/event-log-store.js';
import { MESSAGE_TYPES, TAB_ID, vectorClock } from '../constants.js';
import { sendMessage } from './message-sender.js';
import { getIsPrimaryTab } from './authority.js';

// ==========================================
// Watermark State
// ==========================================

let lastEventWatermark = -1;
const knownWatermarks = new Map();
let watermarkBroadcastInterval = null;
const WATERMARK_BROADCAST_MS = 5000;

// ==========================================
// Watermark Getters
// ==========================================

/**
 * Get the current event watermark
 */
export function getEventWatermark() {
    return lastEventWatermark;
}

/**
 * Get all known watermarks from other tabs
 */
export function getKnownWatermarks() {
    return new Map(knownWatermarks);
}

/**
 * Get a specific tab's watermark
 */
export function getTabWatermark(tabId) {
    return knownWatermarks.get(tabId);
}

/**
 * Set a tab's watermark
 */
export function setTabWatermark(tabId, watermark) {
    knownWatermarks.set(tabId, watermark);
}

/**
 * Clear all known watermarks
 */
export function clearKnownWatermarks() {
    knownWatermarks.clear();
}

// ==========================================
// Watermark Broadcast
// ==========================================

/**
 * Start periodic watermark broadcast (primary only)
 */
export function startWatermarkBroadcast() {
    if (watermarkBroadcastInterval) return;

    watermarkBroadcastInterval = setInterval(() => {
        broadcastWatermark().catch(error => {
            console.error('[TabCoordination] Watermark broadcast error:', error, {
                isPrimaryTab: getIsPrimaryTab(),
                watermark: lastEventWatermark,
                vectorClock: vectorClock.toJSON(),
            });
        });
    }, WATERMARK_BROADCAST_MS);
}

/**
 * Stop watermark broadcast
 */
export function stopWatermarkBroadcast() {
    if (!watermarkBroadcastInterval) return;

    clearInterval(watermarkBroadcastInterval);
    watermarkBroadcastInterval = null;
}

/**
 * Broadcast current watermark to all tabs
 */
async function broadcastWatermark() {
    if (!getIsPrimaryTab()) return;

    await sendMessage({
        type: MESSAGE_TYPES.EVENT_WATERMARK,
        tabId: TAB_ID,
        watermark: lastEventWatermark,
        vectorClock: vectorClock.tick(),
    });
}

/**
 * Update event watermark and broadcast if primary
 */
export function updateEventWatermark(watermark) {
    lastEventWatermark = watermark;

    if (getIsPrimaryTab()) {
        broadcastWatermark().catch(error => {
            console.error('[TabCoordination] Event watermark update error:', error, {
                watermark,
                isPrimaryTab: getIsPrimaryTab(),
                vectorClock: vectorClock.toJSON(),
            });
        });
    }
}

// ==========================================
// Event Replay
// ==========================================

/**
 * Handle replay request from secondary tab
 */
export async function handleReplayRequest(requestingTabId, fromWatermark) {
    if (!getIsPrimaryTab()) return;

    try {
        const events = await EventLogStore.getEvents(fromWatermark, 1000);
        events.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

        await sendMessage({
            type: MESSAGE_TYPES.REPLAY_RESPONSE,
            tabId: TAB_ID,
            events,
            vectorClock: vectorClock.tick(),
        });
    } catch (error) {
        console.error('[TabCoordination] Error handling replay request:', error);
    }
}

/**
 * Handle replay response from primary tab
 */
export async function handleReplayResponse(events) {
    if (getIsPrimaryTab()) return;

    try {
        for (const event of events) {
            await EventBus.emit(event.type, event.payload, {
                skipEventLog: true,
                domain: event.domain || 'global',
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

/**
 * Request event replay from primary tab
 */
export async function requestEventReplay(fromWatermark) {
    if (getIsPrimaryTab()) {
        console.warn('[TabCoordination] Primary tab should not request replay');
        return;
    }

    await sendMessage({
        type: MESSAGE_TYPES.REPLAY_REQUEST,
        tabId: TAB_ID,
        fromWatermark,
        vectorClock: vectorClock.tick(),
    });
}

/**
 * Check if replay is needed
 */
export function needsReplay() {
    if (getIsPrimaryTab()) return false;

    let highestWatermark = lastEventWatermark;
    for (const watermark of knownWatermarks.values()) {
        if (watermark > highestWatermark) {
            highestWatermark = watermark;
        }
    }

    return highestWatermark > lastEventWatermark;
}

/**
 * Automatically request replay if needed
 */
export async function autoReplayIfNeeded() {
    if (!needsReplay()) return false;

    await requestEventReplay(lastEventWatermark);
    return true;
}

// ==========================================
// Cleanup
// ==========================================

/**
 * Stop watermark broadcast and clear state
 */
export function cleanupWatermark() {
    stopWatermarkBroadcast();
    knownWatermarks.clear();
    lastEventWatermark = -1;
}
