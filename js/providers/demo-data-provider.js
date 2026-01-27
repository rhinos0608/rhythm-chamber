/**
 * Demo Data Provider
 *
 * Data provider implementation for demo mode ("The Emo Teen" persona).
 * Uses pre-computed data from demo-data.js for instant experience.
 *
 * @module providers/demo-data-provider
 */

import { ProviderBase } from './provider-base.js';
import { DemoData } from '../demo-data.js';

// ==========================================
// Demo Data Provider Implementation
// ==========================================

/**
 * Get demo data module
 * @returns {Object|null}
 */
function getDemoData() {
    return DemoData || null;
}

/**
 * Demo data provider - serves pre-computed demo persona
 * Extends ProviderBase for shared functionality
 */
export class DemoDataProvider extends ProviderBase {
    constructor() {
        super('demo');
    }

    /**
     * Demo is always ready (pre-computed data)
     * @returns {Promise<boolean>}
     */
    async isReady() {
        const demoData = getDemoData();
        return this.validateReadiness(demoData);
    }

    /**
     * Get demo streaming history
     * @returns {Promise<Array>}
     */
    async getStreams() {
        const demoData = getDemoData();
        if (!this.validateReadiness(demoData)) {
            this.logWarning('Demo data not available');
            return [];
        }

        // Generate or get cached demo streams
        const streams = typeof demoData.generateDemoStreams === 'function'
            ? demoData.generateDemoStreams()
            : demoData.streams || [];

        const normalizedStreams = this.normalizeStreams(streams);

        this.emitDataLoaded('streams', {
            count: normalizedStreams.length,
            source: this.getType()
        });

        return normalizedStreams;
    }

    /**
     * Get pre-computed demo patterns
     * @returns {Promise<Object>}
     */
    async getPatterns() {
        const demoData = getDemoData();
        if (!this.validateReadiness(demoData)) {
            this.logWarning('Demo data not available');
            return null;
        }

        // Use pre-computed patterns if available
        const patterns = demoData.patterns || demoData.DEMO_PATTERNS || null;
        return this.normalizePatterns(patterns);
    }

    /**
     * Get pre-computed demo personality
     * @returns {Promise<Object>}
     */
    async getPersonality() {
        const demoData = getDemoData();
        if (!this.validateReadiness(demoData)) {
            this.logWarning('Demo data not available');
            return null;
        }

        const personality = demoData.personality || demoData.DEMO_PERSONALITY || null;
        return this.normalizePersonality(personality);
    }

    /**
     * Get demo summary
     * @returns {Promise<Object>}
     */
    async getSummary() {
        const demoData = getDemoData();
        if (!this.validateReadiness(demoData)) {
            this.logWarning('Demo data not available');
            return this.getDefaultSummary();
        }

        const personality = demoData.personality || demoData.DEMO_PERSONALITY;
        const summary = personality?.summary || {
            totalStreams: 8547,
            uniqueArtists: 203,
            listeningHours: 1424,
            yearsActive: 5
        };

        return this.normalizeSummary(summary);
    }

    /**
     * Get demo stream count
     * @returns {Promise<number>}
     */
    async getStreamCount() {
        const demoData = getDemoData();
        if (!this.validateReadiness(demoData)) {
            this.logWarning('Demo data not available');
            return 0;
        }

        // Pre-computed count for demo mode
        return this.validateStreamCount(8547);
    }
}


console.log('[DemoDataProvider] Demo data provider loaded');
