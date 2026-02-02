/**
 * Vector Adapter Factory
 *
 * Creates the appropriate vector adapter based on configuration and availability.
 *
 * Strategy:
 * 1. Try SQLite adapter first (better performance, persistence)
 * 2. If SQLite fails (native module issues), fall back to Memory adapter
 * 3. Allow forcing memory mode via environment variable
 *
 * Usage:
 *   const { adapter, type } = await createVectorAdapter({
 *     preferNative: true,
 *     dbPath: '/path/to/vectors.db',
 *     dimension: 768
 *   });
 */

import { SqliteVectorAdapter } from './sqlite-adapter.js';
import { MemoryVectorAdapter } from './memory-vector-adapter.js';
import { VECTOR_STORE_CONFIG } from './config.js';

/**
 * Create a vector adapter with automatic fallback
 *
 * @param {Object} options - Factory options
 * @param {boolean} options.preferNative - Try SQLite first (default: true)
 * @param {string} options.dbPath - Path for SQLite database
 * @param {number} options.dimension - Embedding dimension
 * @returns {Promise<{adapter: SqliteVectorAdapter|MemoryVectorAdapter, type: string}>}
 */
export async function createVectorAdapter(options = {}) {
  const { preferNative = true, dbPath, dimension = 768 } = options;

  // Check if memory mode is forced via environment variable
  if (VECTOR_STORE_CONFIG.forceMemory) {
    console.warn('[AdapterFactory] RC_FORCE_MEMORY_STORE=true, using MemoryVectorAdapter');
    const adapter = new MemoryVectorAdapter();
    adapter.initialize(dbPath, dimension);
    return { adapter, type: 'memory' };
  }

  // Try SQLite first if preferred
  if (preferNative && VECTOR_STORE_CONFIG.preferNative) {
    try {
      const adapter = new SqliteVectorAdapter();
      adapter.initialize(dbPath, dimension);

      // Verify it's working by checking stats
      const stats = adapter.getStats();
      if (stats.initialized) {
        console.log('[AdapterFactory] Using SqliteVectorAdapter');
        return { adapter, type: 'sqlite' };
      }

      // Shouldn't reach here, but handle gracefully
      throw new Error('SQLite adapter failed to initialize properly');
    } catch (error) {
      console.warn('[AdapterFactory] SQLite failed, falling back to MemoryVectorAdapter:', error.message);

      // Clean up failed SQLite adapter if possible
      // (SqliteVectorAdapter doesn't have a partial cleanup method,
      // but close() handles null/undefined gracefully)
    }
  }

  // Fall back to memory adapter
  const adapter = new MemoryVectorAdapter();
  adapter.initialize(dbPath, dimension);

  console.warn('[AdapterFactory] Using MemoryVectorAdapter (pure JavaScript, no persistence)');
  console.warn('[AdapterFactory] To force this mode: RC_FORCE_MEMORY_STORE=true');
  console.warn('[AdapterFactory] To retry SQLite: RC_PREFER_NATIVE_SQLITE=true');

  return { adapter, type: 'memory' };
}

/**
 * Create a vector adapter synchronously (for simple cases)
 * Note: This doesn't handle async SQLite initialization errors as gracefully
 *
 * @param {Object} options - Factory options
 * @returns {{adapter: SqliteVectorAdapter|MemoryVectorAdapter, type: string}}
 */
export function createVectorAdapterSync(options = {}) {
  const { preferNative = true, dbPath, dimension = 768 } = options;

  // Check if memory mode is forced via environment variable
  if (VECTOR_STORE_CONFIG.forceMemory) {
    console.warn('[AdapterFactory] RC_FORCE_MEMORY_STORE=true, using MemoryVectorAdapter');
    const adapter = new MemoryVectorAdapter();
    adapter.initialize(dbPath, dimension);
    return { adapter, type: 'memory' };
  }

  // Try SQLite first if preferred
  if (preferNative && VECTOR_STORE_CONFIG.preferNative) {
    try {
      const adapter = new SqliteVectorAdapter();
      adapter.initialize(dbPath, dimension);

      console.log('[AdapterFactory] Using SqliteVectorAdapter');
      return { adapter, type: 'sqlite' };
    } catch (error) {
      console.warn('[AdapterFactory] SQLite failed, falling back to MemoryVectorAdapter:', error.message);
    }
  }

  // Fall back to memory adapter
  const adapter = new MemoryVectorAdapter();
  adapter.initialize(dbPath, dimension);

  console.warn('[AdapterFactory] Using MemoryVectorAdapter (pure JavaScript, no persistence)');

  return { adapter, type: 'memory' };
}

/**
 * Check if SQLite is available without creating an adapter
 * Useful for health checks and diagnostics
 *
 * @returns {{available: boolean, error: string|null}}
 */
export function checkSqliteAvailability() {
  try {
    // Try to import better-sqlite3
    const Database = require('better-sqlite3');

    // Try a quick test (this will fail if there's a version mismatch)
    const testDb = new Database(':memory:');
    testDb.close();

    return { available: true, error: null };
  } catch (error) {
    return {
      available: false,
      error: error.message,
    };
  }
}

/**
 * Get adapter diagnostics for troubleshooting
 *
 * @returns {Object} Diagnostic information
 */
export function getAdapterDiagnostics() {
  const sqliteCheck = checkSqliteAvailability();

  return {
    sqlite: {
      available: sqliteCheck.available,
      error: sqliteCheck.error,
    },
    config: {
      preferNative: VECTOR_STORE_CONFIG.preferNative,
      forceMemory: VECTOR_STORE_CONFIG.forceMemory,
    },
    environment: {
      RC_PREFER_NATIVE_SQLITE: process.env.RC_PREFER_NATIVE_SQLITE,
      RC_FORCE_MEMORY_STORE: process.env.RC_FORCE_MEMORY_STORE,
    },
  };
}

export default {
  createVectorAdapter,
  createVectorAdapterSync,
  checkSqliteAvailability,
  getAdapterDiagnostics,
};
