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
import { IndexedDBCore } from './indexeddb.js';

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

const MAX_CONNECTION_RETRIES = 5;  // Maximum retry attempts for blocked connections

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
 * @property {number} timestamp - Milliseconds since Unix epoch
 * @property {number} sequenceNumber - Monotonically increasing sequence number
 * @property {string} sourceTab - Tab that created the event
 * @property {string} domain - Event domain for filtering (default: 'global')
 */

// ==========================================
// Core Functions
// ==========================================

// Module-level cached database connection
let cachedDbPromise = null;
let cachedDb = null;

/**
 * Close the cached event log store connection
 * Call this when you need to force a new connection
 */
function closeEventLogStore() {
    if (cachedDb) {
        cachedDb.close();
        cachedDb = null;
    }
    cachedDbPromise = null;
    console.log('[EventLogStore] Connection closed and cache cleared');
}

/**
 * Initialize event log stores
 * Caches and reuses the connection to avoid opening new connections on every call
 * Implements retry with exponential backoff for blocked connections
 * @param {number} [retryCount=0] - Internal retry counter
 * @returns {Promise<IDBDatabase>}
 */
async function initEventLogStores(retryCount = 0) {
    // Return existing connection if valid
    if (cachedDb) {
        return cachedDb;
    }

    // Return existing promise if initialization is in progress
    if (cachedDbPromise) {
        return cachedDbPromise;
    }

    // Create new connection with promise caching
    cachedDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('rhythm-chamber', IndexedDBCore.DB_VERSION);

        request.onerror = () => {
            cachedDbPromise = null;
            reject(request.error);
        };
        request.onblocked = () => {
            console.warn('[EventLogStore] Database upgrade blocked by other tabs');
            EventBus.emit('storage:connection_blocked', {
                reason: 'upgrade_blocked',
                message: 'Event log database upgrade blocked by other tabs',
                retryCount: retryCount + 1
            });

            // Check if we've exceeded max retries
            if (retryCount >= MAX_CONNECTION_RETRIES) {
                console.error(`[EventLogStore] Max retries (${MAX_CONNECTION_RETRIES}) exceeded. Giving up.`);
                cachedDbPromise = null;  // Clear failed promise from cache
                reject(new Error(`Database connection blocked after ${MAX_CONNECTION_RETRIES} retry attempts`));
                return;
            }

            // Retry with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
            console.log(`[EventLogStore] Retrying connection in ${delay}ms (attempt ${retryCount + 1}/${MAX_CONNECTION_RETRIES})`);

            setTimeout(() => {
                // Clear cache and retry
                cachedDbPromise = null;
                initEventLogStores(retryCount + 1).then(resolve).catch(reject);
            }, delay);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create stores if they don't exist during upgrade
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
        };

        request.onsuccess = () => {
            const db = request.result;

            db.onversionchange = () => {
                console.warn('[EventLogStore] Database version changed, closing connection');
                EventBus.emit('storage:connection_blocked', {
                    reason: 'version_change',
                    message: 'Event log database version changed'
                });
                db.close();
                // Clear cache on version change
                cachedDb = null;
                cachedDbPromise = null;
            };

            // Cache the connection
            cachedDb = db;
            cachedDbPromise = null; // Clear the pending promise
            resolve(db);
        };
    });

    return cachedDbPromise;
}

/**
 * Append event to log
 * @param {string} eventType - Event type
 * @param {object} payload - Event payload
 * @param {object} vectorClock - VectorClock state
 * @param {string} sourceTab - Source tab ID
 * @param {string} domain - Event domain (default: 'global')
 * @returns {Promise<StoredEvent>}
 */
async function appendEvent(eventType, payload, vectorClock, sourceTab, domain = 'global') {
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
        timestamp: Date.now(),
        sequenceNumber,
        sourceTab,
        domain
    };

    return new Promise((resolve, reject) => {
        const request = store.add(event);
        request.onsuccess = () => {
            // Check if compaction needed
            checkCompaction().catch(err => {
                console.error('[EventLogStore] Compaction check failed:', err);
                if (err.name === 'QuotaExceededError') {
                    EventBus.emit('storage:quota_exceeded', { error: err });
                }
            });
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
        const range = IDBKeyRange.lowerBound(afterSequenceNumber + 1);
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
    return getEvents(fromSequenceNumber, Infinity);
}

/**
 * Compact event log
 * Removes old events while preserving recent history and checkpoints
 * @returns {Promise<{deleted: number, kept: number}>}
 */
async function compactEventLog() {
    // Get total event count first (before creating transaction)
    const totalCount = await countEvents();

    if (totalCount < COMPACTION_CONFIG.maxEvents) {
        return { deleted: 0, kept: totalCount };
    }

    // Get latest checkpoint first (before creating transaction)
    const latestCheckpoint = await getLatestCheckpoint();

    // Calculate cutoff - delete events BELOW the cutoff sequence number
    // Goal: Keep the most recent events, remove old ones
    let cutoffSequence;
    if (latestCheckpoint) {
        // With checkpoint: keep events AFTER the checkpoint (higher sequence numbers)
        // Delete events with sequence < (checkpoint.sequenceNumber + minEventsAfterCheckpoint)
        // This ensures we keep at least minEventsAfterCheckpoint events after the checkpoint
        cutoffSequence = latestCheckpoint.sequenceNumber;
    } else {
        // No checkpoint: get highest sequence number and derive cutoff
        // Keep the most recent maxEvents worth of events
        const events = await getEvents(-1, 1); // Get first event to check
        if (events.length === 0) {
            return { deleted: 0, kept: 0 };
        }
        // Get the last event (highest sequence)
        const db = await initEventLogStores();
        const tx = db.transaction([EVENT_LOG_STORE], 'readonly');
        const store = tx.objectStore(EVENT_LOG_STORE);
        const index = store.index('sequenceNumber');

        const lastEvent = await new Promise((resolve, reject) => {
            const request = index.openCursor(null, 'prev');
            request.onsuccess = () => {
                const cursor = request.result;
                resolve(cursor ? cursor.value : null);
            };
            request.onerror = () => reject(request.error);
        });

        if (!lastEvent) {
            return { deleted: 0, kept: totalCount };
        }

        // Calculate cutoff based on highest sequence number, keeping maxEvents
        cutoffSequence = lastEvent.sequenceNumber - COMPACTION_CONFIG.maxEvents;
    }

    // Clamp cutoff to >= 0 to avoid negative sequence numbers
    cutoffSequence = Math.max(0, cutoffSequence);

    // Now create the transaction
    const db = await initEventLogStores();
    const tx = db.transaction([EVENT_LOG_STORE], 'readwrite');
    const store = tx.objectStore(EVENT_LOG_STORE);
    const index = store.index('sequenceNumber');

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

    // Get both stores synchronously
    const eventStore = tx.objectStore(EVENT_LOG_STORE);
    const checkpointStore = tx.objectStore(CHECKPOINT_STORE);

    // Start both clear operations synchronously
    const eventRequest = eventStore.clear();
    const checkpointRequest = checkpointStore.clear();

    // Wait for the transaction to complete
    await new Promise((resolve, reject) => {
        let completed = 0;
        let hasError = false;

        const checkComplete = () => {
            if (hasError) return;
            if (++completed === 2) resolve();
        };

        eventRequest.onerror = () => {
            hasError = true;
            reject(eventRequest.error);
        };

        checkpointRequest.onerror = () => {
            hasError = true;
            reject(checkpointRequest.error);
        };

        eventRequest.onsuccess = checkComplete;
        checkpointRequest.onsuccess = checkComplete;
    });

    console.log('[EventLogStore] Event log cleared');
}

// ==========================================
// Public API
// ==========================================

export const EventLogStore = {
    initEventLogStores,
    closeEventLogStore,
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