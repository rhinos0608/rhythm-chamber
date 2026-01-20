/**
 * User Data Provider
 *
 * Data provider implementation for real user data stored in IndexedDB.
 * Delegates to Storage facade for actual data access.
 *
 * @module providers/user-data-provider
 */

import { EventBus } from '../services/event-bus.js';
import { Storage } from '../storage.js';

// ==========================================
// User Data Provider Implementation
// ==========================================

/**
 * Get Storage facade (handles both ES modules and globals)
 * @returns {Object|null}
 */
function getStorage() {
    return Storage;
}

/**
 * User data provider - serves real user streaming data
 */
export const UserDataProvider = {
    /**
     * Get provider type
     * @returns {'user'}
     */
    getType() {
        return 'user';
    },

    /**
     * Check if provider has data available
     * @returns {Promise<boolean>}
     */
    async isReady() {
        const storage = getStorage();
        if (!storage) return false;

        const streams = await storage.getStreams();
        return streams !== null && streams.length > 0;
    },

    /**
     * Get streaming history from storage
     * @returns {Promise<Array>}
     */
    async getStreams() {
        const storage = getStorage();
        if (!storage) return [];

        const streams = await storage.getStreams();

        // Emit event for tracking
        if (streams && streams.length > 0) {
            EventBus.emit('data:streams_loaded', {
                count: streams.length,
                source: 'user'
            });
        }

        return streams || [];
    },

    /**
     * Get stored patterns
     * Note: Patterns are typically computed on-demand, but may be cached
     * @returns {Promise<Object|null>}
     */
    async getPatterns() {
        const storage = getStorage();
        if (!storage) return null;

        // Check if we have cached patterns in personality result
        const personality = await storage.getPersonality();
        return personality?.patterns || null;
    },

    /**
     * Get personality result
     * @returns {Promise<Object|null>}
     */
    async getPersonality() {
        const storage = getStorage();
        if (!storage) return null;
        return storage.getPersonality();
    },

    /**
     * Get data summary
     * @returns {Promise<Object|null>}
     */
    async getSummary() {
        const storage = getStorage();
        if (!storage) return null;

        const personality = await storage.getPersonality();
        return personality?.summary || null;
    },

    /**
     * Get stream count
     * @returns {Promise<number>}
     */
    async getStreamCount() {
        const storage = getStorage();
        if (!storage) return 0;

        const streams = await storage.getStreams();
        return streams?.length || 0;
    }
};


console.log('[UserDataProvider] User data provider loaded');
