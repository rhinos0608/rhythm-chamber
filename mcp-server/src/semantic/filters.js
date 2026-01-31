/**
 * Shared Filter Utilities
 *
 * Common filter logic for VectorStore and LexicalIndex.
 * Ensures consistent behavior across both search types.
 */

/**
 * ReDoS protection patterns - blocks dangerous regex patterns
 * that could cause catastrophic backtracking
 */
const REDOS_PATTERNS = [
  /\([^)]*[\*+][^)]*[\*+]\)/,  // Nested quantifiers: (a+)+, (a*)*
  /\([^)]*\|[^)]*\)[\*+]/,      // Overlapping alternations: (a|a)+
  /\(.[\*+].*\)[\*+]/,          // Nested with wildcard: (.+)+
];

/**
 * Extract HNW layer from file path
 * @param {string} filePath - File path
 * @returns {string} Layer name
 */
export function extractLayer(filePath) {
  if (!filePath) return 'unknown';
  if (filePath.includes('/controllers/')) return 'controllers';
  if (filePath.includes('/services/')) return 'services';
  if (filePath.includes('/providers/')) return 'providers';
  if (filePath.includes('/utils/')) return 'utils';
  if (filePath.includes('/storage/')) return 'storage';
  return 'unknown';
}

/**
 * Validate file pattern for ReDoS vulnerabilities
 * @param {string} patternStr - Regex pattern string
 * @returns {{valid: boolean, reason?: string}} Validation result
 */
export function validateFilePattern(patternStr) {
  // Basic length limit to prevent excessive memory use
  if (patternStr && patternStr.length > 500) {
    return { valid: false, reason: 'Pattern too long (>500 chars)' };
  }

  // Check for dangerous ReDoS patterns
  for (const redosPattern of REDOS_PATTERNS) {
    if (redosPattern.test(patternStr)) {
      return { valid: false, reason: 'Pattern contains potential ReDoS vulnerability' };
    }
  }

  return { valid: true };
}

/**
 * Check if metadata passes all filters
 *
 * @param {Object} metadata - Document metadata
 * @param {Object} filters - Filters to apply
 * @returns {boolean} True if document passes filters
 */
export function passesFilters(metadata, filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return true;
  }

  // File path filter
  if (filters.filePath) {
    const metaFile = metadata.file || metadata.filePath || '';
    if (metaFile !== filters.filePath) {
      return false;
    }
  }

  // Chunk type filter
  if (filters.chunkType) {
    if (metadata.type !== filters.chunkType) {
      return false;
    }
  }

  // Exported only filter
  if (filters.exportedOnly === true) {
    if (!metadata.exported) {
      return false;
    }
  }

  // Direct exported status filter (matches VectorStore behavior)
  if (filters.exported !== undefined) {
    if (metadata.exported !== filters.exported) {
      return false;
    }
  }

  // Layer filter (for HNW architecture)
  if (filters.layer) {
    const fileLayer = extractLayer(metadata.file || metadata.filePath || '');
    if (fileLayer !== filters.layer) {
      return false;
    }
  }

  // File pattern filter with ReDoS protection
  if (filters.filePattern) {
    const validation = validateFilePattern(filters.filePattern);
    if (!validation.valid) {
      console.warn('[Filters] Invalid filePattern:', validation.reason);
      return false;
    }

    try {
      const pattern = new RegExp(filters.filePattern);
      const metaFile = metadata.file || metadata.filePath || '';
      if (!pattern.test(metaFile)) {
        return false;
      }
    } catch (e) {
      console.warn('[Filters] Invalid filePattern regex:', e.message);
      return false;
    }
  }

  // Overlap filter - true if chunk has context overlap
  if (filters.hasOverlap === true) {
    const hasBefore = metadata.contextBefore && metadata.contextBefore.length > 0;
    const hasAfter = metadata.contextAfter && metadata.contextAfter.length > 0;
    if (!hasBefore && !hasAfter) {
      return false;
    }
  }

  // Parent chunk ID filter
  if (filters.parentChunkId) {
    if (metadata.parentChunkId !== filters.parentChunkId) {
      return false;
    }
  }

  // Minimum call frequency filter
  if (filters.minCallFrequency !== undefined) {
    const callFreq = metadata.callFrequency || 0;
    if (callFreq < filters.minCallFrequency) {
      return false;
    }
  }

  return true;
}

/**
 * Default export
 */
export default {
  extractLayer,
  validateFilePattern,
  passesFilters,
  REDOS_PATTERNS
};
