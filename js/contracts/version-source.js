/**
 * Version Source Contract
 *
 * Contract interface for accessing version data (streams, patterns, personality).
 * Breaks circular dependency between service and controller layers.
 *
 * HNW Pattern: Interface Extraction
 * - Both service (data-version) and controller (demo-controller) depend on this interface
 * - Eliminates circular dependency: service no longer imports controller
 * - DemoController implements this contract
 *
 * @module contracts/version-source
 */

'use strict';

/**
 * Version Source Interface
 * Contract for objects that can provide version data
 * @interface VersionSource
 */

/**
 * Get active data (demo or real) transparently
 * @function getActiveData
 * @memberof VersionSource
 * @returns {{ streams: Array, patterns: Object, personality: Object, isDemoMode: boolean }}
 */

/**
 * Check if currently in demo mode
 * @function isDemoMode
 * @memberof VersionSource
 * @returns {boolean}
 */

// ==========================================
// Contract Implementation Registry
// ==========================================

/**
 * Registry for version source implementations
 * Allows loose coupling between data consumers and providers
 */
let _versionSource = null;

/**
 * Register a version source implementation
 * Called by DemoController during initialization
 * @param {VersionSource} source - Implementation of version source contract
 */
export function registerVersionSource(source) {
    if (!source || typeof source.getActiveData !== 'function') {
        console.error('[VersionSource] Invalid version source implementation');
        return;
    }
    _versionSource = source;
    console.log('[VersionSource] Registered version source implementation');
}

/**
 * Get the registered version source
 * @returns {VersionSource|null} Registered implementation or null
 */
export function getVersionSource() {
    return _versionSource;
}

/**
 * Get active data from registered version source
 * Convenience function for consumers
 * @returns {{ streams: Array, patterns: Object, personality: Object, isDemoMode: boolean }}
 * @throws {Error} If no version source registered
 */
export function getActiveData() {
    if (!_versionSource) {
        throw new Error('[VersionSource] No version source registered. Call registerVersionSource() first.');
    }
    return _versionSource.getActiveData();
}

/**
 * Check if demo mode is active
 * Convenience function for consumers
 * @returns {boolean}
 * @throws {Error} If no version source registered
 */
export function isDemoMode() {
    if (!_versionSource) {
        throw new Error('[VersionSource] No version source registered. Call registerVersionSource() first.');
    }
    if (typeof _versionSource.isDemoMode === 'function') {
        return _versionSource.isDemoMode();
    }
    return false;
}

/**
 * Clear the registered version source
 * Used for cleanup or testing
 */
export function clearVersionSource() {
    _versionSource = null;
    console.log('[VersionSource] Cleared version source');
}

console.log('[VersionSource] Contract interface loaded');
