/**
 * IndexedDB Schema Migrations
 *
 * Handles all database schema migrations from version 1 through 6.
 * Each migration function is responsible for creating the necessary
 * object stores and indexes for that version.
 *
 * @module storage/indexeddb/migrations
 */

import { INDEXEDDB_STORES } from './config.js';

/**
 * Migration to version 1: Initial schema
 * Creates the base stores for streams, chunks, embeddings, personality, and settings.
 *
 * @param {IDBDatabase} database - Database instance
 */
export function migrateToV1(database) {
    const stores = ['streams', 'chunks', 'embeddings', 'personality', 'settings'];
    stores.forEach(storeName => {
        if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: 'id' });
        }
    });
}

/**
 * Migration to version 2: Add chat sessions store
 * Adds the chat_sessions store with an updatedAt index.
 *
 * @param {IDBDatabase} database - Database instance
 */
export function migrateToV2(database) {
    if (!database.objectStoreNames.contains('chat_sessions')) {
        const sessionsStore = database.createObjectStore('chat_sessions', { keyPath: 'id' });
        sessionsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
    }
}

/**
 * Migration to version 3: Add config and token stores
 * Adds unified config and token stores for encrypted credentials.
 *
 * @param {IDBDatabase} database - Database instance
 */
export function migrateToV3(database) {
    if (!database.objectStoreNames.contains('config')) {
        database.createObjectStore('config', { keyPath: 'key' });
    }
    if (!database.objectStoreNames.contains('tokens')) {
        database.createObjectStore('tokens', { keyPath: 'key' });
    }
}

/**
 * Migration to version 4: Add event log system
 * Adds event log and checkpoint stores for event replay functionality.
 *
 * @param {IDBDatabase} database - Database instance
 */
export function migrateToV4(database) {
    if (!database.objectStoreNames.contains('event_log')) {
        const eventLogStore = database.createObjectStore('event_log', { keyPath: 'id' });
        eventLogStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: true });
        eventLogStore.createIndex('type', 'type', { unique: false });
        eventLogStore.createIndex('timestamp', 'timestamp', { unique: false });
    }
    if (!database.objectStoreNames.contains('event_checkpoint')) {
        const checkpointStore = database.createObjectStore('event_checkpoint', { keyPath: 'id' });
        checkpointStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: true });
    }
    if (!database.objectStoreNames.contains('migration')) {
        database.createObjectStore('migration', { keyPath: 'id' });
    }
}

/**
 * Migration to version 5: Add demo mode stores
 * Adds stores for demo mode data including streams, patterns, and personality.
 *
 * @param {IDBDatabase} database - Database instance
 */
export function migrateToV5(database) {
    if (!database.objectStoreNames.contains('demo_streams')) {
        const demoStreamsStore = database.createObjectStore('demo_streams', { keyPath: 'id' });
        demoStreamsStore.createIndex('timestamp', 'timestamp', { unique: false });
        demoStreamsStore.createIndex('type', 'type', { unique: false });
    }
    if (!database.objectStoreNames.contains('demo_patterns')) {
        const demoPatternsStore = database.createObjectStore('demo_patterns', { keyPath: 'id' });
        demoPatternsStore.createIndex('timestamp', 'timestamp', { unique: false });
    }
    if (!database.objectStoreNames.contains('demo_personality')) {
        database.createObjectStore('demo_personality', { keyPath: 'id' });
    }
}

/**
 * Migration to version 6: Add transaction journal and compensation stores
 * HNW Network: Provides durable transaction intent logging for multi-backend atomicity.
 *
 * @param {IDBDatabase} database - Database instance
 */
export function migrateToV6(database) {
    if (!database.objectStoreNames.contains('TRANSACTION_JOURNAL')) {
        const journalStore = database.createObjectStore('TRANSACTION_JOURNAL', { keyPath: 'id' });
        journalStore.createIndex('journalTime', 'journalTime', { unique: false });
    }
    if (!database.objectStoreNames.contains('TRANSACTION_COMPENSATION')) {
        const compensationStore = database.createObjectStore('TRANSACTION_COMPENSATION', { keyPath: 'id' });
        compensationStore.createIndex('timestamp', 'timestamp', { unique: false });
        compensationStore.createIndex('resolved', 'resolved', { unique: false });
    }
}

/**
 * Run migrations from oldVersion to newVersion
 * Sequentially applies each migration function to ensure proper schema evolution.
 *
 * @param {IDBDatabase} database - Database instance
 * @param {number} oldVersion - Previous version number
 * @param {number} newVersion - New version number
 */
export function runMigrations(database, oldVersion, newVersion) {
    console.log(`[IndexedDB] Migrating from version ${oldVersion} to ${newVersion}`);

    // Sequentially apply all migrations from oldVersion to newVersion
    for (let v = oldVersion; v < newVersion; v++) {
        const targetVersion = v + 1;
        console.log(`[IndexedDB] Applying migration v${v} -> v${targetVersion}`);

        try {
            switch (targetVersion) {
                case 1:
                    migrateToV1(database);
                    break;
                case 2:
                    migrateToV2(database);
                    break;
                case 3:
                    migrateToV3(database);
                    break;
                case 4:
                    migrateToV4(database);
                    break;
                case 5:
                    migrateToV5(database);
                    break;
                case 6:
                    migrateToV6(database);
                    break;
                default:
                    console.warn(`[IndexedDB] No migration defined for version ${targetVersion}`);
            }
        } catch (error) {
            console.error(`[IndexedDB] Migration v${v} -> v${targetVersion} failed:`, error);
            throw error;
        }
    }

    // Always ensure stores exist (additive safety net)
    createStores(database);

    console.log(`[IndexedDB] Migration to version ${newVersion} complete`);
}

/**
 * Create all required object stores
 * This is called after migrations as an additive safety net to ensure
 * all stores defined in the current version exist.
 *
 * @param {IDBDatabase} database - Database instance
 */
function createStores(database) {
    // Store for raw streaming history
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.STREAMS)) {
        database.createObjectStore(INDEXEDDB_STORES.STREAMS, { keyPath: 'id' });
    }

    // Store for aggregated chunks
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.CHUNKS)) {
        const chunksStore = database.createObjectStore(INDEXEDDB_STORES.CHUNKS, { keyPath: 'id' });
        chunksStore.createIndex('type', 'type', { unique: false });
        chunksStore.createIndex('startDate', 'startDate', { unique: false });
    }

    // Store for embeddings
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.EMBEDDINGS)) {
        database.createObjectStore(INDEXEDDB_STORES.EMBEDDINGS, { keyPath: 'id' });
    }

    // Store for personality results
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.PERSONALITY)) {
        database.createObjectStore(INDEXEDDB_STORES.PERSONALITY, { keyPath: 'id' });
    }

    // Store for user settings
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.SETTINGS)) {
        database.createObjectStore(INDEXEDDB_STORES.SETTINGS, { keyPath: 'key' });
    }

    // Store for chat sessions
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.CHAT_SESSIONS)) {
        const sessionsStore = database.createObjectStore(INDEXEDDB_STORES.CHAT_SESSIONS, { keyPath: 'id' });
        sessionsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
    }

    // Unified config store
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.CONFIG)) {
        database.createObjectStore(INDEXEDDB_STORES.CONFIG, { keyPath: 'key' });
    }

    // Token store for encrypted credentials
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.TOKENS)) {
        database.createObjectStore(INDEXEDDB_STORES.TOKENS, { keyPath: 'key' });
    }

    // Migration state and rollback backup
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.MIGRATION)) {
        database.createObjectStore(INDEXEDDB_STORES.MIGRATION, { keyPath: 'id' });
    }

    // Event log store for event replay
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.EVENT_LOG)) {
        const eventLogStore = database.createObjectStore(INDEXEDDB_STORES.EVENT_LOG, { keyPath: 'id' });
        eventLogStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: true });
        eventLogStore.createIndex('type', 'type', { unique: false });
        eventLogStore.createIndex('timestamp', 'timestamp', { unique: false });
    }

    // Event checkpoint store for rapid recovery
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.EVENT_CHECKPOINT)) {
        const checkpointStore = database.createObjectStore(INDEXEDDB_STORES.EVENT_CHECKPOINT, { keyPath: 'id' });
        checkpointStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: true });
    }

    // Demo streams store for demo mode data
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.DEMO_STREAMS)) {
        const demoStreamsStore = database.createObjectStore(INDEXEDDB_STORES.DEMO_STREAMS, { keyPath: 'id' });
        demoStreamsStore.createIndex('timestamp', 'timestamp', { unique: false });
        demoStreamsStore.createIndex('type', 'type', { unique: false });
    }

    // Demo patterns store for demo mode analysis
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.DEMO_PATTERNS)) {
        const demoPatternsStore = database.createObjectStore(INDEXEDDB_STORES.DEMO_PATTERNS, { keyPath: 'id' });
        demoPatternsStore.createIndex('timestamp', 'timestamp', { unique: false });
    }

    // Demo personality store for demo mode personality data
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.DEMO_PERSONALITY)) {
        database.createObjectStore(INDEXEDDB_STORES.DEMO_PERSONALITY, { keyPath: 'id' });
    }

    // Transaction journal store for 2PC crash recovery
    // HNW Network: Provides durable transaction intent logging for multi-backend atomicity
    if (!database.objectStoreNames.contains('TRANSACTION_JOURNAL')) {
        const journalStore = database.createObjectStore('TRANSACTION_JOURNAL', { keyPath: 'id' });
        journalStore.createIndex('journalTime', 'journalTime', { unique: false });
    }

    // Compensation log store for rollback failure recovery
    // HNW Network: Persists failed rollback operations for manual recovery
    if (!database.objectStoreNames.contains('TRANSACTION_COMPENSATION')) {
        const compensationStore = database.createObjectStore('TRANSACTION_COMPENSATION', { keyPath: 'id' });
        compensationStore.createIndex('timestamp', 'timestamp', { unique: false });
        compensationStore.createIndex('resolved', 'resolved', { unique: false });
    }
}
