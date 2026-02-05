/**
 * Vector Adapter Factory
 *
 * Simplified factory that only uses sqlite-vec.
 * ChromaDB adapter has been removed from this branch.
 * Phase 1: Added MultiIndexAdapter support for separate code/docs indexes.
 */

import { SqliteVectorAdapter } from './sqlite-adapter.js';
import { MultiIndexAdapter } from './multi-index-adapter.js';

/**
 * Create a vector adapter using sqlite-vec only
 *
 * @param {Object} options - Factory options
 * @param {boolean} options.preferNative - Force native sqlite-vec (always true)
 * @param {string} options.dbPath - Path for vector database
 * @param {number} options.dimension - Embedding dimension (default: 768)
 * @param {boolean} options.useMultiIndex - Use MultiIndexAdapter for separate code/docs (default: true)
 * @returns {Promise<{adapter: SqliteVectorAdapter|MultiIndexAdapter, type: string}>}
 */
export async function createVectorAdapter(options = {}) {
  const { preferNative = true, dbPath = null, dimension = 768, useMultiIndex = true } = options;

  // Phase 1: Use MultiIndexAdapter by default for separate code/docs indexes
  // Set useMultiIndex to false to use legacy single-index adapter
  if (useMultiIndex) {
    const adapter = new MultiIndexAdapter();
    adapter.initialize(dbPath, dimension);

    console.error('[AdapterFactory] Using MultiIndexAdapter (separate code/docs indexes)');

    return { adapter, type: 'multi-index' };
  }

  // Legacy single-index adapter
  const adapter = new SqliteVectorAdapter();
  adapter.initialize(dbPath, dimension);

  console.error('[AdapterFactory] Using SqliteVectorAdapter (sqlite-vec, single index)');

  return { adapter, type: 'sqlite' };
}

export default {
  createVectorAdapter,
};
