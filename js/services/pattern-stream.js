/**
 * Pattern Stream Service
 * 
 * Enables progressive pattern display for better user experience.
 * Instead of waiting for all patterns to complete, patterns appear one-by-one
 * with animations as they are detected.
 * 
 * HNW Considerations:
 * - Wave: Pattern-by-pattern propagation creates smooth temporal flow
 * - Network: EventBus integration for decoupled UI updates
 * - Hierarchy: Clear sequence of pattern detection stages
 * 
 * @module services/pattern-stream
 */

import { EventBus } from './event-bus.js';

// ==========================================
// Pattern Stream State
// ==========================================

/** @type {Map<string, Object>} */
const detectedPatterns = new Map();

/** @type {boolean} */
let isStreaming = false;

/** @type {AbortController|null} */
let currentAbortController = null;

// ==========================================
// Pattern Detection Order
// ==========================================

/**
 * Ordered list of pattern names for sequential detection
 * Higher priority patterns appear first
 */
const PATTERN_ORDER = [
    'comfortDiscovery',     // Foundation pattern - comfort vs novelty
    'listeningEras',        // Era identification
    'timeOfDay',            // Time-based preferences
    'weekdayWeekend',       // Social context patterns
    'emotionalJourney',     // Mood/energy patterns
    'ghostedArtists',       // Abandoned favorites
    'artistLoyalty',        // Long-term artist relationships
    'genreEvolution',       // Genre diversity over time
    'seasonalPatterns',     // Seasonal listening changes
    'bingeSessions'         // Intensive listening sessions
];

// ==========================================
// Core Functions
// ==========================================

/**
 * Start streaming pattern detection
 * Emits patterns one-by-one as they are detected
 * 
 * @param {Array} streams - User streaming history
 * @param {Object} [options] - Detection options
 * @param {number} [options.delay=500] - Delay between pattern emissions (ms)
 * @param {Function} [options.onPattern] - Callback for each pattern (alternative to EventBus)
 * @param {Function} [options.onComplete] - Callback when all complete
 * @returns {Promise<Object>} All detected patterns
 */
async function startStream(streams, options = {}) {
    const { delay = 500, onPattern, onComplete } = options;

    if (isStreaming) {
        console.warn('[PatternStream] Already streaming, aborting previous');
        abort();
    }

    isStreaming = true;
    currentAbortController = new AbortController();
    detectedPatterns.clear();

    const startTime = Date.now();

    try {
        // Get Patterns module
        const Patterns = getPatterns();
        if (!Patterns) {
            throw new Error('Patterns module not available');
        }

        // Stream each pattern type
        for (const patternName of PATTERN_ORDER) {
            // Check for abort
            if (currentAbortController?.signal.aborted) {
                console.log('[PatternStream] Aborted');
                break;
            }

            try {
                // Detect specific pattern
                const result = await detectSinglePattern(Patterns, patternName, streams);

                if (result !== null) {
                    detectedPatterns.set(patternName, result);

                    // Emit via EventBus
                    EventBus.emit('pattern:detected', {
                        patternName,
                        result,
                        index: detectedPatterns.size,
                        total: PATTERN_ORDER.length
                    });

                    // Direct callback if provided
                    if (onPattern) {
                        onPattern(patternName, result);
                    }

                    // Delay for visual effect
                    if (delay > 0) {
                        await sleep(delay);
                    }
                }
            } catch (patternError) {
                console.warn(`[PatternStream] Failed to detect ${patternName}:`, patternError.message);
            }
        }

        const allPatterns = Object.fromEntries(detectedPatterns);
        const duration = Date.now() - startTime;
        const aborted = currentAbortController?.signal.aborted === true;

        if (aborted) {
            EventBus.emit('pattern:aborted', {
                patterns: allPatterns,
                duration,
                aborted: true
            });
            console.log(`[PatternStream] Aborted after ${detectedPatterns.size} patterns in ${duration}ms`);
            return allPatterns;
        }

        // Emit completion
        EventBus.emit('pattern:all_complete', {
            patterns: allPatterns,
            duration,
            aborted: false
        });

        if (onComplete) {
            onComplete(allPatterns);
        }

        console.log(`[PatternStream] Completed ${detectedPatterns.size} patterns in ${duration}ms`);
        return allPatterns;

    } finally {
        isStreaming = false;
        currentAbortController = null;
    }
}

/**
 * Detect a single pattern type
 * Maps pattern names to detection functions
 * 
 * @param {Object} Patterns - Patterns module
 * @param {string} patternName - Pattern to detect
 * @param {Array} streams - Streaming data
 * @returns {Promise<Object|null>}
 */
async function detectSinglePattern(Patterns, patternName, streams) {
    // Map pattern names to Patterns module methods
    const detectors = {
        comfortDiscovery: () => Patterns.detectComfortVsDiscovery?.(streams),
        listeningEras: () => Patterns.detectListeningEras?.(streams),
        timeOfDay: () => Patterns.detectTimeOfDayPatterns?.(streams),
        weekdayWeekend: () => Patterns.detectWeekdayWeekendPatterns?.(streams),
        emotionalJourney: () => Patterns.detectEmotionalJourney?.(streams),
        ghostedArtists: () => Patterns.detectGhostedArtists?.(streams),
        artistLoyalty: () => Patterns.detectArtistLoyalty?.(streams),
        genreEvolution: () => Patterns.detectGenreEvolution?.(streams),
        seasonalPatterns: () => Patterns.detectSeasonalPatterns?.(streams),
        bingeSessions: () => Patterns.detectBingeSessions?.(streams)
    };

    const detector = detectors[patternName];
    if (!detector) {
        console.warn(`[PatternStream] No detector for pattern: ${patternName}`);
        return null;
    }

    const result = await Promise.resolve(detector());
    return result || null;
}

/**
 * Abort current streaming session
 */
function abort() {
    if (currentAbortController) {
        currentAbortController.abort();
    }
    isStreaming = false;
}

/**
 * Check if currently streaming
 * @returns {boolean}
 */
function isActive() {
    return isStreaming;
}

/**
 * Get currently detected patterns
 * @returns {Object}
 */
function getDetected() {
    return Object.fromEntries(detectedPatterns);
}

/**
 * Get pattern detection progress
 * @returns {{ detected: number, total: number, percentage: number }}
 */
function getProgress() {
    const detected = detectedPatterns.size;
    const total = PATTERN_ORDER.length;
    return {
        detected,
        total,
        percentage: Math.round((detected / total) * 100)
    };
}

// ==========================================
// Helpers
// ==========================================

/**
 * Get Patterns module
 * @returns {Object|null}
 */
function getPatterns() {
    if (typeof window !== 'undefined' && window.Patterns) {
        return window.Patterns;
    }
    return null;
}

/**
 * Sleep utility
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// Public API
// ==========================================

export const PatternStream = {
    // Core operations
    startStream,
    abort,

    // State
    isActive,
    getDetected,
    getProgress,

    // Constants
    PATTERN_ORDER
};


console.log('[PatternStream] Pattern streaming service loaded');
