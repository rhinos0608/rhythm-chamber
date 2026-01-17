/**
 * Event Log Store
 *
 * Persistent event log with IndexedDB backing for event replay and causality tracking.
 * Implements VectorClock-based ordering for distributed event coordination.
 *
 * HNW Considerations:
 * - Hierarchy: Single source of truth for event persistence
 * - Network: Enables event replay across browser tabs
 * - Wave: Checkpoints for rapid replay and recovery
 *
 * @module storage/event-log-store
 */

import { VectorClock } from '../services/vector-clock.js';
import { EventBus } from '../services/event-bus.js';
import { initDatabaseWithRetry } from './indexeddb.js';

// ==========================================
// Store Configuration
// ==========================================

const EVENT_LOG_STORE = 'event_log';
const CHECKPOINT_STORE = 'event_checkpoint';

const COMPACTION_CONFIG = {
    maxEvents: 10000,              // Maximum events before compaction
    checkpointInterval: 100,       // Create checkpoint every N events
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    minEventsAfterCheckpoint: 50   // Minimum events to keep after checkpoint
};

// ==========================================
// Event Schema
// ==========================================

/**
 * Event structure stored in log
 * @typedef {Object} StoredEvent
 * @property {string} id - Unique event identifier
 * @property {string} type - Event type
 * @property {object} payload - Event payload
 * @property {object} vectorClock - VectorClock for ordering
 * @property {number} timestamp - High-resolution timestamp
 * @property {number} sequenceNumber - Monotonically increasing sequence number
 * @property {string} sourceTab - Tab that created the event
 */

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize event log stores
 * @returns {Promise<IDBDatabase>}
 */
async function initEventLogStores() {
    const db = await initDatabaseWithRetry({
        onVersionChange: () => {
            console.warn('[EventLogStore] Database version changed, closing connection');
            EventBus.emit('storage:connection_blocked', {
                reason: 'version_change',
                message: 'Event log database version changed'
            });
        }
    });

    // Create stores if they don't exist
    if (!db.objectStoreNames.contains(EVENT_LOG_STORE)) {
        const eventStore = db.createObjectStore(EVENT_LOG_STORE, { keyPath: 'id' });
        eventStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: true });
        eventStore.createIndex('type', 'type', { unique: false });
        eventStore.createIndex('timestamp', 'timestamp', { unique: false });
    }

    if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
        const checkpointStore = db.createObjectStore(CHECKPOINT_STORE, { keyPath: 'id' });
        checkpointStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: true });
    }

    return db;
}

/**
 * Append event to log
 * @param {string} eventType - Event type
 * @param {object} payload - Event payload
 * @param {object} vectorClock - VectorClock state
 * @param {string} sourceTab - Source tab ID
 * @returns {Promise<StoredEvent>}
 */
async function appendEvent(eventType, payload, vectorClock, sourceTab) {
    const db = await initEventLogStores();
    const tx = db.transaction([EVENT_LOG_STORE], 'readwrite');
    const store = tx.objectStore(EVENT_LOG_STORE);

    // Get current sequence number
    const sequenceNumber = await getNextSequenceNumber(store);

    const event = {
        id: `${eventType}_${sequenceNumber}_${Date.now()}`,
        type: eventType,
        payload: structuredClone ? structuredClone(payload) : JSON.parse(JSON.stringify(payload)),
        vectorClock: structuredClone ? structuredClone(vectorClock) : JSON.parse(JSON.stringify(vectorClock)),
        timestamp: performance.now(),
        sequenceNumber,
        sourceTab
    };

    return new Promise((resolve, reject) => {
        const request = store.add(event);
        request.onsuccess = () => {
            // Check if compaction needed
            checkCompaction().catch(err => console.warn('[EventLogStore] Compaction check failed:', err));
            resolve(event);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get next sequence number
 * @param {IDBObjectStore} store - Object store
 * @returns {Promise<number>}
 */
async function getNextSequenceNumber(store) {
    return new Promise((resolve, reject) => {
        const index = store.index('sequenceNumber');
        const request = index.openCursor(null, 'prev');

        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                const lastEvent = cursor.value;
                resolve(lastEvent.sequenceNumber + 1);
            } else {
                resolve(0); // First event
            }
        };

        request.onerror = () => reject(request.error);
    });
}

/**
 * Get events after a sequence number
 * @param {number} afterSequenceNumber - Start after this sequence
 * @param {number} [limit=1000] - Maximum events to return
 * @returns {Promise<StoredEvent[]>}
 */
async function getEvents(afterSequenceNumber = -1, limit = 1000) {
    const db = await initEventLogStores();
    const tx = db.transaction([EVENT_LOG_STORE], 'readonly');
    const store = tx.objectStore(EVENT_LOG_STORE);
    const index = store.index('sequenceNumber');

    return new Promise((resolve, reject) => {
        const range = IDBKeyRange.lowerBound(afterSequenceNumber + 1, true);
        const request = index.openCursor(range);

        const events = [];
        let count = 0;

        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor && count < limit) {
                events.push(cursor.value);
                count++;
                cursor.continue();
            } else {
                resolve(events);
            }
        };

        request.onerror = () => reject(request.error);
    });
}

/**
 * Get event by ID
 * @param {string} eventId - Event ID
 * @returns {Promise<StoredEvent|null>}
 */
async function getEventById(eventId) {
    const db = await initEventLogStores();
    const tx = db.transaction([EVENT_LOG_STORE], 'readonly');
    const store = tx.objectStore(EVENT_LOG_STORE);

    return new Promise((resolve, reject) => {
        const request = store.get(eventId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Create checkpoint at current sequence number
 * @param {number} sequenceNumber - Current sequence number
 * @param {object} metadata - Checkpoint metadata
 * @returns {Promise<object>}
 */
async function createCheckpoint(sequenceNumber, metadata = {}) {
    const db = await initEventLogStores();
    const tx = db.transaction([CHECKPOINT_STORE], 'readwrite');
    const store = tx.objectStore(CHECKPOINT_STORE);

    const checkpoint = {
        id: `checkpoint_${sequenceNumber}`,
        sequenceNumber,
        timestamp: Date.now(),
        metadata
    };

    return new Promise((resolve, reject) => {
        const request = store.put(checkpoint);
        request.onsuccess = () => resolve(checkpoint);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get latest checkpoint
 * @returns {Promise<object|null>}
 */
async function getLatestCheckpoint() {
    const db = await initEventLogStores();
    const tx = db.transaction([CHECKPOINT_STORE], 'readonly');
    const store = tx.objectStore(CHECKPOINT_STORE);
    const index = store.index('sequenceNumber');

    return new Promise((resolve, reject) => {
        const request = index.openCursor(null, 'prev');
        request.onsuccess = () => {
            const cursor = request.result;
            resolve(cursor ? cursor.value : null);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get events since checkpoint
 * @param {number} fromSequenceNumber - Start sequence number
 * @returns {Promise<StoredEvent[]>}
 */
async function getEventsSinceCheckpoint(fromSequenceNumber) {
    return getEvents(fromSequenceNumber);
}

/**
 * Compact event log
 * Removes old events while preserving recent history and checkpoints
 * @returns {Promise<{deleted: number, kept: number}>}
 */
async function compactEventLog() {
    const db = await initEventLogStores();
    const tx = db.transaction([EVENT_LOG_STORE], 'readwrite');
    const store = tx.objectStore(EVENT_LOG_STORE);
    const index = store.index('sequenceNumber');

    // Get total event count
    const totalCount = await countEvents();

    if (totalCount < COMPACTION_CONFIG.maxEvents) {
        return { deleted: 0, kept: totalCount };
    }

    // Calculate cutoff
    const latestCheckpoint = await getLatestCheckpoint();
    const cutoffSequence = latestCheckpoint
        ? latestCheckpoint.sequenceNumber + COMPACTION_CONFIG.minEventsAfterCheckpoint
        : totalCount - COMPACTION_CONFIG.maxEvents;

    return new Promise((resolve, reject) => {
        const range = IDBKeyRange.upperBound(cutoffSequence, true);
        const request = index.openCursor(range);

        let deleted = 0;

        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                cursor.delete();
                deleted++;
                cursor.continue();
            } else {
                resolve({ deleted, kept: totalCount - deleted });
            }
        };

        request.onerror = () => reject(request.error);
    });
}

/**
 * Count total events
 * @returns {Promise<number>}
 */
async function countEvents() {
    const db = await initEventLogStores();
    const tx = db.transaction([EVENT_LOG_STORE], 'readonly');
    const store = tx.objectStore(EVENT_LOG_STORE);

    return new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Check if compaction is needed
 * @returns {Promise<boolean>}
 */
async function checkCompaction() {
    const count = await countEvents();
    if (count >= COMPACTION_CONFIG.maxEvents) {
        console.log(`[EventLogStore] Compaction needed: ${count} events`);
        const result = await compactEventLog();
        EventBus.emit('storage:event_log_compacted', {
            deleted: result.deleted,
            kept: result.kept
        });
        return true;
    }
    return false;
}

/**
 * Get event log statistics
 * @returns {Promise<object>}
 */
async function getEventLogStats() {
    const [totalCount, latestCheckpoint] = await Promise.all([
        countEvents(),
        getLatestCheckpoint()
    ]);

    return {
        totalEvents: totalCount,
        latestCheckpointSequence: latestCheckpoint?.sequenceNumber || -1,
        latestCheckpointTimestamp: latestCheckpoint?.timestamp || null,
        compactionThreshold: COMPACTION_CONFIG.maxEvents
    };
}

/**
 * Clear event log (use with caution)
 * @returns {Promise<void>}
 */
async function clearEventLog() {
    const db = await initEventLogStores();
    const tx = db.transaction([EVENT_LOG_STORE, CHECKPOINT_STORE], 'readwrite');

    await new Promise((resolve, reject) => {
        const eventStore = tx.objectStore(EVENT_LOG_STORE);
        const eventRequest = eventStore.clear();
        eventRequest.onsuccess = resolve;
        eventRequest.onerror = () => reject(eventRequest.error);
    });

    await new Promise((resolve, reject) => {
        const checkpointStore = tx.objectStore(CHECKPOINT_STORE);
        const checkpointRequest = checkpointStore.clear();
        checkpointRequest.onsuccess = resolve;
        checkpointRequest.onerror = () => reject(checkpointRequest.error);
    });

    console.log('[EventLogStore] Event log cleared');
}

// ==========================================
// Public API
// ==========================================

export const EventLogStore = {
    initEventLogStores,
    appendEvent,
    getEvents,
    getEventById,
    createCheckpoint,
    getLatestCheckpoint,
    getEventsSinceCheckpoint,
    compactEventLog,
    countEvents,
    getEventLogStats,
    clearEventLog,

    // Configuration
    COMPACTION_CONFIG,
    EVENT_LOG_STORE,
    CHECKPOINT_STORE
};

console.log('[EventLogStore] Event log persistence initialized');