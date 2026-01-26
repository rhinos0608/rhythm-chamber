/**
 * Provider Base Class
 *
 * Base class for all data providers with shared validation and normalization methods.
 * Eliminates code duplication across provider implementations.
 *
 * @module providers/provider-base
 */

import { EventBus } from '../services/event-bus.js';
import { Validation } from '../utils/validation.js';

/**
 * Base class for data providers
 */
export class ProviderBase {
    /**
     * Constructor
     * @param {string} providerType - Type of provider ('user', 'demo', 'shared')
     */
    constructor(providerType) {
        this.providerType = providerType;
        this.eventBus = EventBus;
    }

    /**
     * Get provider type
     * @returns {string}
     */
    getType() {
        return this.providerType;
    }

    /**
     * Validate provider readiness
     * @param {*} data - Data to validate for readiness
     * @returns {boolean}
     */
    validateReadiness(data) {
        return data !== null && data !== undefined;
    }

    /**
     * Normalize streams data
     * @param {Array} streams - Raw streams data
     * @returns {Array} Normalized streams
     */
    normalizeStreams(streams) {
        if (!Array.isArray(streams)) {
            return [];
        }

        // Filter out invalid stream entries
        return streams.filter(stream => {
            if (!stream || typeof stream !== 'object') {
                return false;
            }

            // Validate required fields
            const hasRequiredFields = stream.ts &&
                stream.master_metadata_track_name &&
                stream.master_metadata_album_artist_name;

            if (!hasRequiredFields) {
                console.warn('[ProviderBase] Skipping invalid stream entry:', stream);
                return false;
            }

            return true;
        });
    }

    /**
     * Normalize patterns data
     * @param {Object} patterns - Raw patterns data
     * @returns {Object|null} Normalized patterns
     */
    normalizePatterns(patterns) {
        if (!patterns || typeof patterns !== 'object') {
            return null;
        }

        // Ensure all expected pattern sections exist
        const normalized = {
            comfortDiscovery: patterns.comfortDiscovery || null,
            timePatterns: patterns.timePatterns || null,
            socialPatterns: patterns.socialPatterns || null,
            ghostedArtists: patterns.ghostedArtists || null
        };

        // Remove null sections
        Object.keys(normalized).forEach(key => {
            if (normalized[key] === null) {
                delete normalized[key];
            }
        });

        return Object.keys(normalized).length > 0 ? normalized : null;
    }

    /**
     * Normalize personality data
     * @param {Object} personality - Raw personality data
     * @returns {Object|null} Normalized personality
     */
    normalizePersonality(personality) {
        if (!personality || typeof personality !== 'object') {
            return null;
        }

        // Validate required personality fields
        const requiredFields = ['type', 'name', 'emoji', 'tagline'];
        const hasRequiredFields = requiredFields.every(field =>
            personality[field] && typeof personality[field] === 'string'
        );

        if (!hasRequiredFields) {
            console.warn('[ProviderBase] Invalid personality data:', personality);
            return null;
        }

        return {
            type: personality.type,
            name: personality.name,
            emoji: personality.emoji,
            tagline: personality.tagline,
            insights: Array.isArray(personality.insights) ? personality.insights : []
        };
    }

    /**
     * Normalize summary data
     * @param {Object} summary - Raw summary data
     * @returns {Object} Normalized summary
     */
    normalizeSummary(summary) {
        if (!summary || typeof summary !== 'object') {
            return this.getDefaultSummary();
        }

        // Ensure numeric fields are numbers
        const normalized = {
            totalStreams: Validation.ensureNumber(summary.totalStreams, 0),
            uniqueArtists: Validation.ensureNumber(summary.uniqueArtists, 0),
            listeningHours: Validation.ensureNumber(summary.listeningHours, 0),
            yearsActive: Validation.ensureNumber(summary.yearsActive, 0)
        };

        return normalized;
    }

    /**
     * Get default summary values
     * @returns {Object}
     */
    getDefaultSummary() {
        return {
            totalStreams: 0,
            uniqueArtists: 0,
            listeningHours: 0,
            yearsActive: 0
        };
    }

    /**
     * Emit data loaded event
     * @param {string} dataType - Type of data loaded ('streams', 'patterns', etc.)
     * @param {Object} metadata - Event metadata
     */
    emitDataLoaded(dataType, metadata = {}) {
        const eventName = `data:${dataType}_loaded`;
        this.eventBus.emit(eventName, {
            source: this.providerType,
            ...metadata
        });
    }

    /**
     * Validate stream count
     * @param {*} count - Value to validate as stream count
     * @returns {number} Validated count
     */
    validateStreamCount(count) {
        const validatedCount = Validation.ensureNumber(count, 0);
        return Math.max(0, validatedCount);
    }

    /**
     * Check if data exists and is valid
     * @param {*} data - Data to check
     * @returns {boolean}
     */
    hasValidData(data) {
        if (Array.isArray(data)) {
            return data.length > 0;
        }
        return data !== null && data !== undefined;
    }

    /**
     * Get validation error message
     * @param {string} field - Field name
     * @param {*} value - Invalid value
     * @returns {string}
     */
    getValidationError(field, value) {
        return `[${this.providerType}] Invalid ${field}: ${JSON.stringify(value)}`;
    }

    /**
     * Log provider operation
     * @param {string} operation - Operation name
     * @param {Object} details - Operation details
     */
    logOperation(operation, details = {}) {
        console.log(`[${this.providerType}] ${operation}`, details);
    }

    /**
     * Log provider warning
     * @param {string} message - Warning message
     * @param {*} context - Additional context
     */
    logWarning(message, context = null) {
        console.warn(`[${this.providerType}] ${message}`, context);
    }

    /**
     * Log provider error
     * @param {string} message - Error message
     * @param {Error} error - Error object
     */
    logError(message, error = null) {
        console.error(`[${this.providerType}] ${message}`, error);
    }
}