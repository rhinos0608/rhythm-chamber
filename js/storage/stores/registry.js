/**
 * Store Registry
 *
 * Central registry for IndexedDB object stores.
 * Provides store name constants and lifecycle management utilities.
 *
 * @module storage/stores/registry
 */

import { INDEXEDDB_STORES } from '../indexeddb/config.js';

// Re-export store constants for backward compatibility
export const STORES = INDEXEDDB_STORES;

/**
 * Validate that a store name is registered
 * @param {string} storeName - Store name to validate
 * @returns {boolean} True if store is registered
 */
export function isValidStore(storeName) {
    return Object.values(STORES).includes(storeName);
}

/**
 * Get all registered store names
 * @returns {string[]} Array of store names
 */
export function getAllStoreNames() {
    return Object.values(STORES);
}

/**
 * Check if a store supports transactions (most do)
 * @param {string} storeName - Store name to check
 * @returns {boolean} True if store supports transactions
 */
export function supportsTransactions(storeName) {
    // Most stores support transactions, but some are exempt
    const exemptStores = [
        STORES.MIGRATION,
        STORES.TRANSACTION_JOURNAL,
        STORES.TRANSACTION_COMPENSATION
    ];
    return !exemptStores.includes(storeName);
}

/**
 * Get store metadata (name, description, key path, etc.)
 * @param {string} storeName - Store name
 * @returns {Object|null} Store metadata or null if not found
 */
export function getStoreMetadata(storeName) {
    const metadata = {
        [STORES.STREAMS]: {
            name: STORES.STREAMS,
            description: 'Spotify streaming history',
            keyPath: 'id',
            autoIncrement: false
        },
        [STORES.CHUNKS]: {
            name: STORES.CHUNKS,
            description: 'Processed text chunks for RAG',
            keyPath: 'id',
            autoIncrement: true
        },
        [STORES.EMBEDDINGS]: {
            name: STORES.EMBEDDINGS,
            description: 'Vector embeddings for semantic search',
            keyPath: 'id',
            autoIncrement: true
        },
        [STORES.PERSONALITY]: {
            name: STORES.PERSONALITY,
            description: 'Personality analysis results',
            keyPath: 'id',
            autoIncrement: false
        },
        [STORES.SETTINGS]: {
            name: STORES.SETTINGS,
            description: 'Application settings',
            keyPath: 'key',
            autoIncrement: false
        },
        [STORES.CHAT_SESSIONS]: {
            name: STORES.CHAT_SESSIONS,
            description: 'Chat session history',
            keyPath: 'id',
            autoIncrement: false
        },
        [STORES.CONFIG]: {
            name: STORES.CONFIG,
            description: 'Configuration data',
            keyPath: 'key',
            autoIncrement: false
        },
        [STORES.TOKENS]: {
            name: STORES.TOKENS,
            description: 'OAuth tokens (encrypted)',
            keyPath: 'key',
            autoIncrement: false
        },
        [STORES.MIGRATION]: {
            name: STORES.MIGRATION,
            description: 'Migration state tracking',
            keyPath: 'id',
            autoIncrement: false
        },
        [STORES.EVENT_LOG]: {
            name: STORES.EVENT_LOG,
            description: 'Event log for cross-tab coordination',
            keyPath: 'id',
            autoIncrement: false
        },
        [STORES.EVENT_CHECKPOINT]: {
            name: STORES.EVENT_CHECKPOINT,
            description: 'Event log checkpoint for recovery',
            keyPath: 'id',
            autoIncrement: false
        },
        [STORES.DEMO_STREAMS]: {
            name: STORES.DEMO_STREAMS,
            description: 'Demo mode streaming data',
            keyPath: 'id',
            autoIncrement: true
        },
        [STORES.DEMO_PATTERNS]: {
            name: STORES.DEMO_PATTERNS,
            description: 'Demo mode pattern data',
            keyPath: 'id',
            autoIncrement: false
        },
        [STORES.DEMO_PERSONALITY]: {
            name: STORES.DEMO_PERSONALITY,
            description: 'Demo mode personality result',
            keyPath: 'id',
            autoIncrement: false
        },
        [STORES.TRANSACTION_JOURNAL]: {
            name: STORES.TRANSACTION_JOURNAL,
            description: 'Two-phase commit transaction journal',
            keyPath: 'id',
            autoIncrement: true
        },
        [STORES.TRANSACTION_COMPENSATION]: {
            name: STORES.TRANSACTION_COMPENSATION,
            description: 'Transaction compensation log',
            keyPath: 'id',
            autoIncrement: true
        }
    };

    return metadata[storeName] || null;
}
