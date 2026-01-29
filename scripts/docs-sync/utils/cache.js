/**
 * Cache utility for AST results
 * Stores AST analysis results to avoid redundant parsing
 */

export class ASTCache {
  constructor() {
    this.cache = new Map(); // filepath -> { ast, metrics, timestamp }
    this.dependencyGraph = new Map(); // filepath -> [dependencies]
  }

  /**
   * Get cached result for a file
   * @param {string} filepath - Absolute path to file
   * @returns {object|null} Cached result or null if not found
   */
  get(filepath) {
    return this.cache.get(filepath) || null;
  }

  /**
   * Set cache result for a file
   * @param {string} filepath - Absolute path to file
   * @param {object} result - Result to cache (ast, metrics, etc.)
   */
  set(filepath, result) {
    this.cache.set(filepath, {
      ...result,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if file is cached
   * @param {string} filepath - Absolute path to file
   * @returns {boolean}
   */
  has(filepath) {
    return this.cache.has(filepath);
  }

  /**
   * Invalidate cache for a specific file
   * @param {string} filepath - Absolute path to file
   */
  invalidate(filepath) {
    this.cache.delete(filepath);
    this.dependencyGraph.delete(filepath);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.dependencyGraph.clear();
  }

  /**
   * Get all cached filepaths
   * @returns {string[]}
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   * @returns {object}
   */
  getStats() {
    return {
      size: this.cache.size,
      totalKeys: this.cache.size,
    };
  }

  /**
   * Store dependency information
   * @param {string} filepath - Source file
   * @param {string[]} dependencies - List of imported file paths
   */
  setDependencies(filepath, dependencies) {
    this.dependencyGraph.set(filepath, dependencies);
  }

  /**
   * Get dependencies for a file
   * @param {string} filepath - Source file
   * @returns {string[]}
   */
  getDependencies(filepath) {
    return this.dependencyGraph.get(filepath) || [];
  }

  /**
   * Get complete dependency graph
   * @returns {Map<string, string[]>}
   */
  getDependencyGraph() {
    return this.dependencyGraph;
  }

  /**
   * Filter cache to only include specified keys
   * Useful for incremental updates in watch mode
   * @param {string[]} keys - Keys to keep
   */
  filter(keys) {
    const keySet = new Set(keys);
    for (const key of this.cache.keys()) {
      if (!keySet.has(key)) {
        this.cache.delete(key);
        this.dependencyGraph.delete(key);
      }
    }
  }
}

export default ASTCache;
