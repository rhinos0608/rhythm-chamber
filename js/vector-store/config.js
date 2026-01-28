/**
 * Vector Store Configuration
 *
 * Centralized constants and configuration for LocalVectorStore
 *
 * @module vector-store/config
 */

// ==========================================
// Constants
// ==========================================

export const DB_NAME = 'rhythm_chamber_vectors';
export const DB_VERSION = 1;
export const STORE_NAME = 'vectors';
export const SETTINGS_KEY = 'vector_store_settings';

// Retry configuration
export const RETRY_TIMEOUT = 60000; // 1 minute
export const MAX_RETRIES = 3;
export const RETRY_COOLDOWN_MS = 5000; // 5 seconds between retry attempts
export const MAX_RETRIES_PER_UPSERT = 10;

// Worker configuration
export const WORKER_TIMEOUT_MS = 30000; // 30 seconds
export const SMALL_VECTOR_THRESHOLD = 500; // Use sync search below this count
export const WORKER_INIT_TIMEOUT_MS = 5000; // 5 seconds

// Vector dimensions
export const DEFAULT_VECTOR_DIMENSIONS = 384; // all-MiniLM-L6-v2

// Shared memory
export const SHARED_MEMORY_AVAILABLE = (() => {
    try {
        if (typeof SharedArrayBuffer === 'undefined') return false;
        const test = new SharedArrayBuffer(8);
        return test.byteLength === 8;
    } catch (e) {
        return false;
    }
})();
