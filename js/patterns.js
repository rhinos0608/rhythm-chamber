/**
 * Pattern Detection Module - Backward Compatibility Shim
 *
 * This file maintains backward compatibility by re-exporting all APIs
 * from the new modular structure in js/patterns/
 *
 * DEPRECATED: Import directly from js/patterns/index.js for new code
 *   import { Patterns } from './patterns/index.js';
 *
 * Legacy import (still works):
 *   import { Patterns } from './patterns.js';
 *
 * Migration Guide:
 * - No changes needed - this shim maintains 100% backward compatibility
 * - All existing imports will continue to work
 * - New code should import from js/patterns/index.js
 *
 * Module: js/patterns.js (compatibility shim)
 * Refactored: 2025-01-29 (Stream 4: Patterns Refactoring)
 */

// Import from new modular structure
export { Patterns, detectAllPatterns } from './patterns/index.js';

// Log module load (same as original)
console.log('[Patterns] Module loaded with async worker support');
