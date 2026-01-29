/**
 * Tab Coordinator - Shared State Module
 *
 * Centralizes shared state to prevent circular dependencies.
 * Modules that need access to shared state should import from here
 * instead of from the parent index.js facade.
 *
 * @module tab-coordination/modules/shared-state
 */

import { Crypto } from '../../../security/crypto.js';

// ==========================================
// Shared State Variables
// ==========================================

/**
 * Debug mode flag for tab coordination
 * @type {boolean}
 */
export let debugMode = false;

/**
 * Set debug mode state
 * @param {boolean} value - New debug mode value
 */
export function setDebugMode(value) {
    debugMode = value;
}

/**
 * Check if secure context (key session) is active
 * Uses Crypto module to determine if running in secure context
 * @returns {boolean} True if secure context is available
 */
export function isKeySessionActive() {
    return Crypto.isSecureContext();
}

// ==========================================
// State Management
// ==========================================

/**
 * Get current shared state (for testing/debugging)
 * @returns {Object} Current state snapshot
 */
export function getSharedState() {
    return {
        debugMode,
        isSecureContext: isKeySessionActive()
    };
}

/**
 * Reset shared state (for testing)
 */
export function resetSharedState() {
    debugMode = false;
}
