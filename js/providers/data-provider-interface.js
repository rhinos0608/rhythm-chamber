/**
 * Data Provider Interface
 * 
 * Unified abstraction for accessing streaming data from different sources:
 * - UserDataProvider: Real user data from Storage
 * - DemoDataProvider: Demo persona data ("The Emo Teen")
 * - SharedDataProvider: Imported friend profiles (future)
 * 
 * HNW Considerations:
 * - Hierarchy: Single interface for all data sources
 * - Network: Decouples data consumers from storage implementation
 * - Wave: Async operations with consistent loading patterns
 * 
 * @module providers/data-provider-interface
 */

import { EventBus } from '../services/event-bus.js';

// ==========================================
// Provider Types
// ==========================================

/**
 * @typedef {'user' | 'demo' | 'shared'} DataProviderType
 */

/**
 * @typedef {Object} Stream
 * @property {string} ts - Timestamp
 * @property {string} master_metadata_track_name - Track name
 * @property {string} master_metadata_album_artist_name - Artist name
 * @property {number} ms_played - Milliseconds played
 */

/**
 * @typedef {Object} Personality
 * @property {string} type - Personality type identifier
 * @property {string} name - Display name
 * @property {string} emoji - Emoji icon
 * @property {string} tagline - Personality tagline
 * @property {string[]} insights - Array of insights
 */

/**
 * @typedef {Object} Patterns
 * @property {Object} comfortDiscovery - Comfort vs discovery ratio
 * @property {Object} timePatterns - Time-of-day patterns
 * @property {Object} socialPatterns - Weekday vs weekend patterns
 * @property {Object} ghostedArtists - Artists abandoned after heavy play
 */

// ==========================================
// Data Provider State
// ==========================================

/** @type {DataProviderType} */
let currentProviderType = 'user';

/** @type {Object|null} */
let currentProvider = null;

/** @type {Map<string, Object>} */
const providerRegistry = new Map();

// ==========================================
// Provider Interface Definition
// ==========================================

/**
 * Base interface that all data providers must implement
 */
const DataProviderContract = {
    /**
     * Get provider type
     * @returns {DataProviderType}
     */
    getType: () => { throw new Error('Must implement getType()'); },

    /**
     * Check if provider is ready to serve data
     * @returns {Promise<boolean>}
     */
    isReady: async () => { throw new Error('Must implement isReady()'); },

    /**
     * Get streaming history
     * @returns {Promise<Stream[]>}
     */
    getStreams: async () => { throw new Error('Must implement getStreams()'); },

    /**
     * Get detected patterns
     * @returns {Promise<Patterns|null>}
     */
    getPatterns: async () => { throw new Error('Must implement getPatterns()'); },

    /**
     * Get personality result
     * @returns {Promise<Personality|null>}
     */
    getPersonality: async () => { throw new Error('Must implement getPersonality()'); },

    /**
     * Get summary data
     * @returns {Promise<Object|null>}
     */
    getSummary: async () => { throw new Error('Must implement getSummary()'); },

    /**
     * Get stream count
     * @returns {Promise<number>}
     */
    getStreamCount: async () => { throw new Error('Must implement getStreamCount()'); }
};

// ==========================================
// Provider Registration & Switching
// ==========================================

/**
 * Register a data provider
 * @param {DataProviderType} type - Provider type
 * @param {Object} provider - Provider implementation
 */
function registerProvider(type, provider) {
    // Validate provider implements required methods
    const required = ['getType', 'isReady', 'getStreams', 'getPatterns', 'getPersonality'];
    const missing = required.filter(method => typeof provider[method] !== 'function');

    if (missing.length > 0) {
        throw new Error(`Provider "${type}" missing methods: ${missing.join(', ')}`);
    }

    providerRegistry.set(type, provider);
    console.log(`[DataProvider] Registered provider: ${type}`);
}

/**
 * Get a registered provider by type
 * @param {DataProviderType} type - Provider type
 * @returns {Object|null}
 */
function getProvider(type) {
    return providerRegistry.get(type) || null;
}

/**
 * Switch to a different data provider
 * @param {DataProviderType} type - Provider type to switch to
 * @returns {Promise<boolean>} Success status
 */
async function switchProvider(type) {
    const provider = providerRegistry.get(type);
    if (!provider) {
        console.error(`[DataProvider] Unknown provider type: ${type}`);
        return false;
    }

    const previousType = currentProviderType;
    currentProviderType = type;
    currentProvider = provider;

    // Emit event for UI updates
    EventBus.emit('data:provider_changed', {
        providerType: type,
        previousType
    });

    console.log(`[DataProvider] Switched to provider: ${type}`);
    return true;
}

/**
 * Get current provider
 * @returns {Object|null}
 */
function getCurrentProvider() {
    if (!currentProvider) {
        currentProvider = providerRegistry.get(currentProviderType) || null;
    }
    return currentProvider;
}

/**
 * Get current provider type
 * @returns {DataProviderType}
 */
function getCurrentType() {
    return currentProviderType;
}

// ==========================================
// Unified Data Access (Delegates to Current Provider)
// ==========================================

/**
 * Get streams from current provider
 * @returns {Promise<Stream[]>}
 */
async function getStreams() {
    const provider = getCurrentProvider();
    if (!provider) {
        console.warn('[DataProvider] No provider available');
        return [];
    }
    return provider.getStreams();
}

/**
 * Get patterns from current provider
 * @returns {Promise<Patterns|null>}
 */
async function getPatterns() {
    const provider = getCurrentProvider();
    if (!provider) return null;
    return provider.getPatterns();
}

/**
 * Get personality from current provider
 * @returns {Promise<Personality|null>}
 */
async function getPersonality() {
    const provider = getCurrentProvider();
    if (!provider) return null;
    return provider.getPersonality();
}

/**
 * Get summary from current provider
 * @returns {Promise<Object|null>}
 */
async function getSummary() {
    const provider = getCurrentProvider();
    if (!provider) return null;
    return provider.getSummary();
}

/**
 * Get stream count from current provider
 * @returns {Promise<number>}
 */
async function getStreamCount() {
    const provider = getCurrentProvider();
    if (!provider) return 0;
    return provider.getStreamCount();
}

/**
 * Check if current provider is ready
 * @returns {Promise<boolean>}
 */
async function isReady() {
    const provider = getCurrentProvider();
    if (!provider) return false;
    return provider.isReady();
}

/**
 * Check if current provider is demo mode
 * @returns {boolean}
 */
function isDemo() {
    return currentProviderType === 'demo';
}

// ==========================================
// Public API
// ==========================================

export const DataProvider = {
    // Registration
    registerProvider,
    getProvider,

    // Switching
    switchProvider,
    getCurrentProvider,
    getCurrentType,
    isDemo,

    // Data Access (delegates to current provider)
    getStreams,
    getPatterns,
    getPersonality,
    getSummary,
    getStreamCount,
    isReady,

    // Contract for implementing providers
    DataProviderContract
};

// Expose on window for debugging
if (typeof window !== 'undefined') {
    window.DataProvider = DataProvider;
}

console.log('[DataProvider] Data provider interface loaded');
