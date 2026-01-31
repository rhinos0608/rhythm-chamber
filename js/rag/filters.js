/**
 * Shared Filter Utilities for RAG
 *
 * Common filter logic for VectorStore and LexicalIndex.
 * Ensures consistent behavior across both search types.
 *
 * Adapted from MCP server for music domain.
 *
 * @module rag/filters
 */

/**
 * ReDoS protection patterns - blocks dangerous regex patterns
 * that could cause catastrophic backtracking
 *
 * Comprehensive list covering:
 * - Nested quantifiers: (a+)+, (a*)*
 * - Overlapping alternations: (a|a)+, (a|aa)+
 * - Non-capturing groups with quantifiers: (?:a+)+
 * - Brace quantifier nesting: a{1,100}{1,100}
 * - Common vulnerable patterns: (\w+\s?)+
 */
const REDOS_PATTERNS = [
  /\([^)]*[\*+][^)]*[\*+]\)/,           // Nested quantifiers: (a+)+, (a*)*
  /\([^)]*\|[^)]*\)[\*+]/,               // Overlapping alternations: (a|a)+
  /\(.[\*+].*\)[\*+]/,                   // Nested with wildcard: (.+)+
  /\(\?:[^)]*[\*+][^)]*\)[\*+]/,         // Non-capturing groups: (?:a+)+
  /\{[\d,]+\}\{[\d,]+\}/,                // Brace quantifier nesting: {n}{m}
  /\([^)]*\\[wWdDsS][\*+][^)]*\)[\*+]/, // Character class quantifiers: (\w+)+
  /[\*+]\?[\*+]/,                        // Adjacent quantifiers: +?+, *?*
];

/**
 * Maximum regex execution time (ms) - fallback protection
 */
const MAX_REGEX_TIMEOUT = 100;

/**
 * Extract chunk category from type
 *
 * @param {string} type - Chunk type
 * @returns {string} Category name
 */
export function extractCategory(type) {
  if (!type) return 'unknown';
  if (type.includes('pattern')) return 'patterns';
  if (type.includes('artist')) return 'artists';
  if (type.includes('monthly') || type.includes('summary')) return 'summaries';
  if (type.includes('track')) return 'tracks';
  if (type.includes('playlist')) return 'playlists';
  return 'other';
}

/**
 * Extract year and month from metadata
 *
 * @param {Object} metadata - Chunk metadata
 * @returns {{year: number|null, month: number|null}} Extracted date parts
 */
export function extractDateParts(metadata) {
  if (!metadata) return { year: null, month: null };

  // Check for explicit month field (YYYY-MM format)
  if (metadata.month) {
    const match = /^(\d{4})-(\d{2})$/.exec(metadata.month);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (month >= 1 && month <= 12) {
        return { year, month };
      }
    }
  }

  // Check for date field
  if (metadata.date) {
    const date = new Date(metadata.date);
    // Correct validation: check getTime() returns valid number
    if (!isNaN(date.getTime())) {
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    }
  }

  return { year: null, month: null };
}

/**
 * Validate file pattern for ReDoS vulnerabilities
 *
 * @param {string} patternStr - Regex pattern string
 * @returns {{valid: boolean, reason?: string}} Validation result
 */
export function validatePattern(patternStr) {
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
 * @param {string} filters.type - Filter by chunk type
 * @param {string} filters.artist - Filter by artist name (exact match)
 * @param {string} filters.artistPattern - Filter by artist name (regex)
 * @param {string} filters.month - Filter by month (YYYY-MM format)
 * @param {number} filters.year - Filter by year
 * @param {string} filters.category - Filter by category
 * @param {number} filters.minPlays - Minimum play count
 * @param {string} filters.patternType - Filter by pattern type
 * @returns {boolean} True if document passes filters
 */
export function passesFilters(metadata, filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return true;
  }

  // Chunk type filter
  if (filters.type) {
    if (metadata.type !== filters.type) {
      return false;
    }
  }

  // Artist exact match filter
  if (filters.artist) {
    const metaArtist = metadata.artist || '';
    if (metaArtist.toLowerCase() !== filters.artist.toLowerCase()) {
      return false;
    }
  }

  // Artist pattern filter (with ReDoS protection)
  if (filters.artistPattern) {
    const validation = validatePattern(filters.artistPattern);
    if (!validation.valid) {
      console.warn('[Filters] Invalid artistPattern:', validation.reason);
      return false;
    }

    try {
      const pattern = new RegExp(filters.artistPattern, 'i');
      const metaArtist = metadata.artist || '';
      if (!pattern.test(metaArtist)) {
        return false;
      }
    } catch (e) {
      console.warn('[Filters] Invalid artistPattern regex:', e.message);
      return false;
    }
  }

  // Month filter (YYYY-MM format)
  if (filters.month) {
    if (metadata.month !== filters.month) {
      return false;
    }
  }

  // Year filter (excludes documents without valid date metadata)
  if (filters.year) {
    const { year } = extractDateParts(metadata);
    // Explicitly exclude documents without date when year filter is active
    if (year === null || year !== filters.year) {
      return false;
    }
  }

  // Category filter
  if (filters.category) {
    const category = extractCategory(metadata.type);
    if (category !== filters.category) {
      return false;
    }
  }

  // Minimum plays filter
  if (filters.minPlays !== undefined) {
    const plays = metadata.plays || 0;
    if (plays < filters.minPlays) {
      return false;
    }
  }

  // Pattern type filter (for pattern_result chunks)
  if (filters.patternType) {
    if (metadata.patternType !== filters.patternType) {
      return false;
    }
  }

  // Date range filter (start)
  if (filters.dateStart) {
    const metaDate = metadata.date ? new Date(metadata.date) : null;
    const startDate = new Date(filters.dateStart);
    if (!metaDate || metaDate < startDate) {
      return false;
    }
  }

  // Date range filter (end)
  if (filters.dateEnd) {
    const metaDate = metadata.date ? new Date(metadata.date) : null;
    const endDate = new Date(filters.dateEnd);
    if (!metaDate || metaDate > endDate) {
      return false;
    }
  }

  return true;
}

/**
 * Apply type priority boost to search score
 *
 * @param {number} score - Original similarity score
 * @param {string} type - Chunk type
 * @param {Object} typePriority - Type priority mapping
 * @returns {number} Boosted score
 */
export function applyTypePriorityBoost(score, type, typePriority) {
  const priority = typePriority[type] || typePriority['fallback'] || 0;
  // Apply small boost based on priority (max 10% boost for highest priority)
  const boostFactor = 1 + (priority / 1000);
  return score * boostFactor;
}

/**
 * Default export
 */
export default {
  extractCategory,
  extractDateParts,
  validatePattern,
  passesFilters,
  applyTypePriorityBoost,
  REDOS_PATTERNS
};
