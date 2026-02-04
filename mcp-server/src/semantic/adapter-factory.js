/**
 * Vector Adapter Factory
 *
 * Simplified factory that only uses sqlite-vec.
 * ChromaDB adapter has been removed from this branch.
 */

import { SqliteVectorAdapter } from './sqlite-adapter.js';

/**
 * Create a vector adapter using sqlite-vec only
 *
 * @param {Object} options - Factory options
 * @param {boolean} options.preferNative - Force native sqlite-vec (always true)
 * @param {string} options.dbPath - Path for vector database
 * @param {number} options.dimension - Embedding dimension (default: 768)
 * @returns {Promise<{adapter: SqliteVectorAdapter, type: string}>}
 */
export async function createVectorAdapter(options = {}) {
  const { preferNative = true, dbPath = null, dimension = 768 } = options;

  // Only support sqlite-vec in this branch
  const adapter = new SqliteVectorAdapter();
  adapter.initialize(dbPath, dimension);

  console.log('[AdapterFactory] Using SqliteVectorAdapter (sqlite-vec)');

  return { adapter, type: 'sqlite' };
}

export default {
  createVectorAdapter,
};
