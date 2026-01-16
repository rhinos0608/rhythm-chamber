/**
 * Demo Data Provider
 * 
 * Data provider implementation for demo mode ("The Emo Teen" persona).
 * Uses pre-computed data from demo-data.js for instant experience.
 * 
 * @module providers/demo-data-provider
 */

import { EventBus } from '../services/event-bus.js';

// ==========================================
// Demo Data Provider Implementation
// ==========================================

/**
 * Get demo data module
 * @returns {Object|null}
 */
function getDemoData() {
    if (typeof window !== 'undefined' && window.DemoData) {
        return window.DemoData;
    }
    return null;
}

/**
 * Demo data provider - serves pre-computed demo persona
 */
export const DemoDataProvider = {
    /**
     * Get provider type
     * @returns {'demo'}
     */
    getType() {
        return 'demo';
    },

    /**
     * Demo is always ready (pre-computed data)
     * @returns {Promise<boolean>}
     */
    async isReady() {
        return getDemoData() !== null;
    },

    /**
     * Get demo streaming history
     * @returns {Promise<Array>}
     */
    async getStreams() {
        const demoData = getDemoData();
        if (!demoData) return [];

        // Generate or get cached demo streams
        const streams = typeof demoData.generateDemoStreams === 'function'
            ? demoData.generateDemoStreams()
            : demoData.streams || [];

        EventBus.emit('data:streams_loaded', {
            count: streams.length,
            source: 'demo'
        });

        return streams;
    },

    /**
     * Get pre-computed demo patterns
     * @returns {Promise<Object>}
     */
    async getPatterns() {
        const demoData = getDemoData();
        if (!demoData) return null;

        // Use pre-computed patterns if available
        return demoData.patterns || demoData.DEMO_PATTERNS || null;
    },

    /**
     * Get pre-computed demo personality
     * @returns {Promise<Object>}
     */
    async getPersonality() {
        const demoData = getDemoData();
        if (!demoData) return null;

        return demoData.personality || demoData.DEMO_PERSONALITY || null;
    },

    /**
     * Get demo summary
     * @returns {Promise<Object>}
     */
    async getSummary() {
        const demoData = getDemoData();
        if (!demoData) return null;

        const personality = demoData.personality || demoData.DEMO_PERSONALITY;
        return personality?.summary || {
            totalStreams: 8547,
            uniqueArtists: 203,
            listeningHours: 1424,
            yearsActive: 5
        };
    },

    /**
     * Get demo stream count
     * @returns {Promise<number>}
     */
    async getStreamCount() {
        const demoData = getDemoData();
        if (!demoData) return 0;

        // Pre-computed count for demo mode
        return 8547;
    }
};

// Expose on window for debugging
if (typeof window !== 'undefined') {
    window.DemoDataProvider = DemoDataProvider;
}

console.log('[DemoDataProvider] Demo data provider loaded');
