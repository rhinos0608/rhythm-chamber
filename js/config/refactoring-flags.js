/**
 * Refactoring Feature Flags
 *
 * Toggle between old and new implementations during development.
 * Once new implementations are verified, these flags and legacy code will be removed.
 *
 * @module config/refactoring-flags
 */

/**
 * Feature flags for God object refactoring
 * @type {Object}
 */
export const REFACTORING_FLAGS = {
  /** Use new transaction module decomposition (4 files) vs legacy transaction.js */
  USE_NEW_TRANSACTION: true,

  /** Use new crypto-hashing.js module vs legacy inline hashing in validation.js */
  USE_NEW_CRYPTO_HASHING: true,

  /** Use new auto-repair.js service vs legacy inline implementation in storage.js */
  USE_NEW_AUTO_REPAIR: true
};
