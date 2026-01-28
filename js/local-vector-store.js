/**
 * Local Vector Store for Rhythm Chamber
 *
 * BACKWARD COMPATIBILITY MODULE
 *
 * This file re-exports the refactored vector-store module
 * to maintain backward compatibility with existing imports.
 *
 * All functionality has been moved to js/vector-store/ directory:
 * - js/vector-store/config.js - Configuration constants
 * - js/vector-store/shared-memory.js - SharedArrayBuffer support
 * - js/vector-store/math.js - Cosine similarity calculations
 * - js/vector-store/cache.js - LRU cache wrapper
 * - js/vector-store/persistence.js - IndexedDB operations
 * - js/vector-store/worker.js - Web Worker lifecycle
 * - js/vector-store/retry-queue.js - Failed persist retry logic
 * - js/vector-store/search.js - Synchronous search
 * - js/vector-store/search-async.js - Async search wrapper
 * - js/vector-store/index.js - Main public API
 *
 * @module local-vector-store
 */

// Re-export everything from the new module structure
export {
    LocalVectorStore,
    isSharedArrayBufferAvailable
} from './vector-store/index.js';

// Log for debugging
console.log('[LocalVectorStore] Legacy module loaded. Import from js/vector-store/index.js for new code.');
