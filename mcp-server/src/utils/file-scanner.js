/**
 * Efficient file system scanner for JavaScript modules
 * Implements caching to prevent O(n²) performance on repeated scans
 */

import { readdir, stat } from 'fs/promises';
import { join, relative, extname } from 'path';

export class FileScanner {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.cache = new Map(); // Cache for scan results
    this.maxCacheSize = 100; // CRITICAL FIX #7: Prevent unbounded cache growth
  }

  /**
   * Find all JavaScript and TypeScript files in the project
   * Results are cached based on options to prevent repeated scans
   */
  async findJsFiles(options = {}) {
    const { includeTests = false, includeNodeModules = false, includeDist = false } = options;

    // Generate cache key from options
    const cacheKey = JSON.stringify(options);

    // Return cached result if available
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const jsFiles = [];
    await this.scanDirectory(this.projectRoot, jsFiles, {
      includeTests,
      includeNodeModules,
      includeDist,
    });

    // Cache the result with LRU eviction
    // CRITICAL FIX #7: Prevent unbounded cache growth
    if (this.cache.size >= this.maxCacheSize) {
      // Remove first entry (simple FIFO eviction)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, jsFiles);

    return jsFiles;
  }

  /**
   * Clear the scan cache
   * Call this when the file system structure changes
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Recursively scan directory for JS and TS files
   */
  async scanDirectory(dir, fileList, options) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip excluded directories
        if (entry.isDirectory()) {
          if (!options.includeNodeModules && entry.name === 'node_modules') continue;
          if (!options.includeDist && entry.name === 'dist') continue;
          if (!options.includeTests && entry.name === 'tests') continue;
          if (entry.name.startsWith('.')) continue;

          await this.scanDirectory(fullPath, fileList, options);
        } else if (entry.isFile()) {
          // Include .js, .jsx, .ts, .tsx, .mjs files
          const ext = extname(entry.name);
          const validExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];

          if (validExtensions.includes(ext)) {
            fileList.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  /**
   * Get relative path from project root
   */
  getRelativePath(absolutePath) {
    return relative(this.projectRoot, absolutePath);
  }

  /**
   * Get file layer based on path
   */
  getFileLayer(filePath) {
    const relPath = this.getRelativePath(filePath);

    if (relPath.startsWith('js/controllers/')) return 'controllers';
    if (relPath.startsWith('js/services/')) return 'services';
    if (relPath.startsWith('js/providers/')) return 'providers';
    if (relPath.startsWith('js/storage/')) return 'storage';
    if (relPath.startsWith('js/security/')) return 'security';
    if (relPath.startsWith('js/utils/')) return 'utils';
    if (relPath.startsWith('js/workers/')) return 'workers';
    if (relPath.startsWith('js/artifacts/')) return 'artifacts';

    return 'other';
  }
}
