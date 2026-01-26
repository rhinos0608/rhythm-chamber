/**
 * User Data Provider
 *
 * Data provider implementation for real user data stored in IndexedDB.
 * Delegates to Storage facade for actual data access.
 *
 * @module providers/user-data-provider
 */

import { ProviderBase } from './provider-base.js';
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
 * Extends ProviderBase for shared functionality
 */
export class UserDataProvider extends ProviderBase {
    constructor() {
        super('user');
    }

    /**
     * Check if provider has data available
     * @returns {Promise<boolean>}
     */
    async isReady() {
        const storage = getStorage();
        if (!storage) {
            this.logWarning('Storage not available');
            return false;
        }

        const streams = await storage.getStreams();
        return this.hasValidData(streams);
    }

    /**
     * Get streaming history from storage
     * @returns {Promise<Array>}
     */
    async getStreams() {
        const storage = getStorage();
        if (!storage) {
            this.logWarning('Storage not available');
            return [];
        }

        const streams = await storage.getStreams();
        const normalizedStreams = this.normalizeStreams(streams || []);

        // Emit event for tracking
        if (normalizedStreams.length > 0) {
            this.emitDataLoaded('streams', {
                count: normalizedStreams.length,
                source: this.getType()
            });
        }

        return normalizedStreams;
    }

    /**
     * Get stored patterns
     * Note: Patterns are typically computed on-demand, but may be cached
     * @returns {Promise<Object|null>}
     */
    async getPatterns() {
        const storage = getStorage();
        if (!storage) {
            this.logWarning('Storage not available');
            return null;
        }

        // Check if we have cached patterns in personality result
        const personality = await storage.getPersonality();
        const patterns = personality?.patterns || null;
        return this.normalizePatterns(patterns);
    }

    /**
     * Get personality result
     * @returns {Promise<Object|null>}
     */
    async getPersonality() {
        const storage = getStorage();
        if (!storage) {
            this.logWarning('Storage not available');
            return null;
        }

        const personality = await storage.getPersonality();
        return this.normalizePersonality(personality);
    }

    /**
     * Get data summary
     * @returns {Promise<Object|null>}
     */
    async getSummary() {
        const storage = getStorage();
        if (!storage) {
            this.logWarning('Storage not available');
            return this.getDefaultSummary();
        }

        const personality = await storage.getPersonality();
        const summary = personality?.summary || null;
        return this.normalizeSummary(summary);
    }

    /**
     * Get stream count
     * @returns {Promise<number>}
     */
    async getStreamCount() {
        const storage = getStorage();
        if (!storage) {
            this.logWarning('Storage not available');
            return 0;
        }

        const streams = await storage.getStreams();
        return this.validateStreamCount(streams?.length || 0);
    }
}


console.log('[UserDataProvider] User data provider loaded');
