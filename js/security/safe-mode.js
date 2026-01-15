/**
 * Security Safe Mode Manager
 * 
 * Tracks which security modules are available and provides
 * graceful degradation for features that depend on them.
 * 
 * HNW Diagnosis: Over-centralized authority. Security should be modular
 * and degradable, not monolithic. Each module failure is logged but
 * doesn't block other modules from working.
 * 
 * @module security/safe-mode
 */

// ==========================================
// Security Capability Tracking
// ==========================================

/**
 * Tracks availability status of each security module
 * @type {Object.<string, {available: boolean, error: string|null}>}
 */
const SecurityCapabilities = {
    encryption: { available: false, error: null },
    tokenBinding: { available: false, error: null },
    anomaly: { available: false, error: null },
    prototypePollution: { available: false, error: null }
};

/**
 * Flag to track if we've already logged the one-time error summary
 */
let hasLoggedErrorSummary = false;

// ==========================================
// Module Initialization
// ==========================================

/**
 * Initialize a single security module with error capture
 * Failures are logged as warnings but don't block other modules
 * 
 * @param {string} name - Module name (must be key in SecurityCapabilities)
 * @param {Function} initFn - Async or sync function that initializes the module
 * @returns {Promise<boolean>} True if initialization succeeded
 */
async function initModule(name, initFn) {
    if (!SecurityCapabilities.hasOwnProperty(name)) {
        console.error(`[SafeMode] Unknown security module: ${name}`);
        return false;
    }

    try {
        await initFn();
        SecurityCapabilities[name] = { available: true, error: null };
        console.log(`[SafeMode] ✓ ${name} initialized`);
        return true;
    } catch (error) {
        const errorMessage = error.message || String(error);
        console.warn(`[SafeMode] ⚠ ${name} init failed: ${errorMessage}`);
        SecurityCapabilities[name] = { available: false, error: errorMessage };
        return false;
    }
}

// ==========================================
// Capability Queries
// ==========================================

/**
 * Check if a specific security capability is available
 * @param {string} name - Capability name
 * @returns {boolean}
 */
function isCapabilityAvailable(name) {
    return SecurityCapabilities[name]?.available ?? false;
}

/**
 * Get list of all available capabilities
 * @returns {string[]} Array of available capability names
 */
function getAvailableCapabilities() {
    return Object.entries(SecurityCapabilities)
        .filter(([_, state]) => state.available)
        .map(([name]) => name);
}

/**
 * Get list of all failed capabilities
 * @returns {Array<{name: string, error: string}>}
 */
function getFailedCapabilities() {
    return Object.entries(SecurityCapabilities)
        .filter(([_, state]) => !state.available && state.error)
        .map(([name, state]) => ({ name, error: state.error }));
}

/**
 * Get comprehensive safe mode status summary
 * @returns {{
 *   isPartialMode: boolean,
 *   isFullMode: boolean,
 *   isSafeMode: boolean,
 *   available: number,
 *   total: number,
 *   capabilities: Object,
 *   failedModules: Array
 * }}
 */
function getSafeModeStatus() {
    const total = Object.keys(SecurityCapabilities).length;
    const available = getAvailableCapabilities().length;
    const failedModules = getFailedCapabilities();

    return {
        isPartialMode: available > 0 && available < total,
        isFullMode: available === total,
        isSafeMode: available === 0,
        available,
        total,
        capabilities: { ...SecurityCapabilities },
        failedModules
    };
}

// ==========================================
// Error Reporting
// ==========================================

/**
 * Log a one-time error summary for failed modules
 * Called after all modules have been initialized
 * 
 * Per user request: Log warnings and throw error once, no persistent banners
 */
function logErrorSummaryOnce() {
    if (hasLoggedErrorSummary) return;
    hasLoggedErrorSummary = true;

    const status = getSafeModeStatus();

    if (status.isFullMode) {
        console.log('[SafeMode] All security modules initialized successfully');
        return;
    }

    if (status.failedModules.length > 0) {
        console.error(
            `[SafeMode] Security modules failed to initialize: ${status.failedModules.map(m => m.name).join(', ')}\n` +
            `Features dependent on these modules may be unavailable.\n` +
            status.failedModules.map(m => `  - ${m.name}: ${m.error}`).join('\n')
        );
    }
}

/**
 * Throw an error if critical security modules are unavailable
 * Called when a feature requires a specific capability
 * 
 * @param {string} capability - Required capability name
 * @param {string} feature - Feature that requires the capability
 * @throws {Error} If capability is not available
 */
function requireCapability(capability, feature) {
    if (!isCapabilityAvailable(capability)) {
        const error = SecurityCapabilities[capability]?.error || 'Module not initialized';
        throw new Error(
            `[SafeMode] ${feature} requires '${capability}' which is unavailable: ${error}`
        );
    }
}

// ==========================================
// Convenience Feature Guards
// ==========================================

/**
 * Check if encryption is available
 * @returns {boolean}
 */
function canEncrypt() {
    return isCapabilityAvailable('encryption');
}

/**
 * Check if token binding is available
 * @returns {boolean}
 */
function canBindTokens() {
    return isCapabilityAvailable('tokenBinding');
}

/**
 * Check if anomaly detection is available
 * @returns {boolean}
 */
function canDetectAnomalies() {
    return isCapabilityAvailable('anomaly');
}

/**
 * Check if prototype pollution protection is enabled
 * @returns {boolean}
 */
function hasPrototypePollutionProtection() {
    return isCapabilityAvailable('prototypePollution');
}

// ==========================================
// Public API
// ==========================================

export const SafeMode = {
    // Initialization
    initModule,
    logErrorSummaryOnce,

    // Queries
    isCapabilityAvailable,
    getAvailableCapabilities,
    getFailedCapabilities,
    getSafeModeStatus,

    // Guards
    requireCapability,
    canEncrypt,
    canBindTokens,
    canDetectAnomalies,
    hasPrototypePollutionProtection
};

// Also export individual functions for convenience
export {
    initModule,
    isCapabilityAvailable,
    getAvailableCapabilities,
    getSafeModeStatus,
    requireCapability,
    canEncrypt,
    canBindTokens,
    canDetectAnomalies,
    hasPrototypePollutionProtection,
    logErrorSummaryOnce
};

console.log('[SafeMode] Security safe mode manager loaded');
