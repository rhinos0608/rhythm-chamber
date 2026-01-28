/**
 * IndexedDB Configuration
 *
 * Database name, version, and store definitions.
 *
 * @module storage/indexeddb/config
 */

// Database name
export const INDEXEDDB_NAME = 'rhythm-chamber';

// Current database version
export const INDEXEDDB_VERSION = 6;

// Object store names
export const INDEXEDDB_STORES = {
    STREAMS: 'streams',
    CHUNKS: 'chunks',
    EMBEDDINGS: 'embeddings',
    PERSONALITY: 'personality',
    SETTINGS: 'settings',
    CHAT_SESSIONS: 'chat_sessions',
    CONFIG: 'config',
    TOKENS: 'tokens',
    MIGRATION: 'migration',
    EVENT_LOG: 'event_log',
    EVENT_CHECKPOINT: 'event_checkpoint',
    DEMO_STREAMS: 'demo_streams',
    DEMO_PATTERNS: 'demo_patterns',
    DEMO_PERSONALITY: 'demo_personality',
    TRANSACTION_JOURNAL: 'TRANSACTION_JOURNAL',
    TRANSACTION_COMPENSATION: 'TRANSACTION_COMPENSATION'
};

// Connection retry configuration
export const CONNECTION_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2
};

// Write authority configuration (HNW)
export const AUTHORITY_CONFIG = {
    // Enable/disable write authority checks
    enforceWriteAuthority: true,

    // Stores exempt from authority checks (e.g., migration state)
    exemptStores: new Set(['migration']),

    // Whether to throw or just warn on authority violation
    strictMode: false
};

// Request timeout configuration
export const REQUEST_CONFIG = {
    defaultTimeoutMs: 5000
};
