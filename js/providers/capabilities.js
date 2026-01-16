/**
 * Data Capabilities Service
 * 
 * Provides capability-based access control instead of boolean isDemoMode flags.
 * Enables explicit permission checking and makes access boundaries clear.
 * 
 * HNW Hierarchy: Establishes clear authority boundaries for data access.
 * Instead of scattered "if (isDemoMode)" checks, code uses explicit capabilities.
 * 
 * @module providers/capabilities
 */

import { AppState } from '../state/app-state.js';

// ==========================================
// Capability Definitions
// ==========================================

/**
 * Available capability types
 */
const CAPABILITIES = {
    READ_USER_DATA: 'read_user_data',
    WRITE_USER_DATA: 'write_user_data',
    READ_DEMO_DATA: 'read_demo_data',
    EXPORT_DATA: 'export_data',
    DELETE_DATA: 'delete_data',
    SHARE_DATA: 'share_data',
    MODIFY_SETTINGS: 'modify_settings',
    ACCESS_LLM: 'access_llm'
};

/**
 * Capabilities available in demo mode
 */
const DEMO_CAPABILITIES = [
    CAPABILITIES.READ_DEMO_DATA,
    CAPABILITIES.ACCESS_LLM,
    CAPABILITIES.EXPORT_DATA  // Allow exporting demo cards
];

/**
 * Capabilities available for real user data
 */
const USER_CAPABILITIES = [
    CAPABILITIES.READ_USER_DATA,
    CAPABILITIES.WRITE_USER_DATA,
    CAPABILITIES.EXPORT_DATA,
    CAPABILITIES.DELETE_DATA,
    CAPABILITIES.SHARE_DATA,
    CAPABILITIES.MODIFY_SETTINGS,
    CAPABILITIES.ACCESS_LLM
];

// ==========================================
// Core Functions
// ==========================================

/**
 * Check if a specific capability is currently available
 * @param {string} capability - Capability to check (from CAPABILITIES)
 * @returns {boolean}
 */
function hasCapability(capability) {
    const activeCapabilities = getActiveCapabilities();
    return activeCapabilities.includes(capability);
}

/**
 * Get all currently active capabilities based on app mode
 * @returns {string[]}
 */
function getActiveCapabilities() {
    const activeData = AppState.getActiveData();
    const isDemoMode = activeData?.isDemoMode || false;

    return isDemoMode ? [...DEMO_CAPABILITIES] : [...USER_CAPABILITIES];
}

/**
 * Check if currently in demo mode (convenience method)
 * @returns {boolean}
 */
function isDemo() {
    const activeData = AppState.getActiveData();
    return activeData?.isDemoMode || false;
}

/**
 * Check if user data operations are allowed
 * @returns {boolean}
 */
function canWriteUserData() {
    return hasCapability(CAPABILITIES.WRITE_USER_DATA);
}

/**
 * Check if data deletion is allowed
 * @returns {boolean}
 */
function canDeleteData() {
    return hasCapability(CAPABILITIES.DELETE_DATA);
}

/**
 * Check if sharing is allowed
 * @returns {boolean}
 */
function canShareData() {
    return hasCapability(CAPABILITIES.SHARE_DATA);
}

/**
 * Assert a capability is available, throwing if not
 * @param {string} capability - Capability to assert
 * @param {string} [context] - Context for error message
 * @throws {Error} If capability is not available
 */
function assertCapability(capability, context = '') {
    if (!hasCapability(capability)) {
        const mode = isDemo() ? 'demo' : 'user';
        const message = context
            ? `${context}: Capability '${capability}' not available in ${mode} mode`
            : `Capability '${capability}' not available in ${mode} mode`;
        throw new Error(message);
    }
}

/**
 * Get a summary of current state for debugging
 * @returns {Object}
 */
function getStatus() {
    return {
        isDemo: isDemo(),
        activeCapabilities: getActiveCapabilities(),
        availableCapabilities: Object.values(CAPABILITIES)
    };
}

// ==========================================
// Public API
// ==========================================

export const DataCapabilities = {
    // Core checks
    hasCapability,
    getActiveCapabilities,
    isDemo,

    // Convenience methods
    canWriteUserData,
    canDeleteData,
    canShareData,

    // Assertions
    assertCapability,

    // Diagnostics
    getStatus,

    // Constants
    CAPABILITIES,
    DEMO_CAPABILITIES,
    USER_CAPABILITIES
};

// Also export CAPABILITIES directly for easy access
export { CAPABILITIES };

console.log('[DataCapabilities] Capability-based access control loaded');
