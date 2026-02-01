/**
 * Pattern Detection Module - Facade
 * Provides backward-compatible API for pattern detection by orchestrating all pattern modules.
 * @module patterns/index
 */

// Import all pattern modules
import * as Extractors from './pattern-extractors.js';
import * as Validators from './pattern-validators.js';
import * as Transformers from './pattern-transformers.js';
import * as Matching from './pattern-matching.js';
import * as Cache from './pattern-cache.js';

/**
 * Run all pattern detection and return summary
 * Orchestrates all pattern detector modules
 *
 * @param {Array} streams - Array of stream objects
 * @param {Array} chunks - Array of time-based chunks
 * @throws {Error} if streams array is empty (generatePatternSummary requires data)
 * @returns {Object} All detected patterns with summary and evidence
 */
export function detectAllPatterns(streams, chunks) {
    // Add validation at start of detectAllPatterns():
    if (!streams || streams.length === 0) {
        console.warn('[Patterns] No streams data, returning empty patterns');
        return {
            comfortDiscovery: { ratio: 0, hasComfortDiscovery: false },
            timePatterns: { hasTimePatterns: false },
            socialPatterns: { hasSocialPatterns: false },
            emotionalJourney: { hasJourney: false },
            artistLoyalty: { hasLoyalty: false },
            genreEvolution: { hasEvolution: false },
            eras: { hasEras: false },
            evidence: [],
            summary: 'No data available for pattern detection',
        };
    }

    const patterns = {
        comfortDiscovery: Extractors.detectComfortDiscoveryRatio(streams),
        eras: Extractors.detectEras(streams, chunks),
        timePatterns: Validators.detectTimePatterns(streams),
        socialPatterns: Validators.detectSocialPatterns(streams),
        ghostedArtists: Extractors.detectGhostedArtists(streams),
        discoveryExplosions: Extractors.detectDiscoveryExplosions(streams, chunks),
        moodSearching: Validators.detectMoodSearching(streams),
        trueFavorites: Validators.detectTrueFavorites(streams),
    };

    // Collect evidence descriptions
    const evidence = [];

    if (patterns.comfortDiscovery.description) {
        evidence.push(patterns.comfortDiscovery.description);
    }
    if (patterns.eras.description && patterns.eras.hasEras) {
        evidence.push(patterns.eras.description);
    }
    if (patterns.timePatterns.isMoodEngineer) {
        evidence.push(patterns.timePatterns.description);
    }
    if (patterns.socialPatterns.isSocialChameleon) {
        evidence.push(patterns.socialPatterns.description);
    }
    if (patterns.ghostedArtists.description) {
        evidence.push(patterns.ghostedArtists.description);
    }
    if (patterns.discoveryExplosions.description) {
        evidence.push(patterns.discoveryExplosions.description);
    }
    if (patterns.moodSearching.description) {
        evidence.push(patterns.moodSearching.description);
    }
    if (patterns.trueFavorites.description) {
        evidence.push(patterns.trueFavorites.description);
    }

    return {
        ...patterns,
        evidence,
        summary: Transformers.generatePatternSummary(streams, patterns),
    };
}

// Inject sync detector into cache module for async fallback
Cache.setSyncDetector(detectAllPatterns);

/**
 * Re-export all public APIs for backward compatibility
 * Combines exports from all modules into single Patterns object
 */
export const Patterns = {
    // Extractors
    detectComfortDiscoveryRatio: Extractors.detectComfortDiscoveryRatio,
    detectEras: Extractors.detectEras,
    detectGhostedArtists: Extractors.detectGhostedArtists,
    detectDiscoveryExplosions: Extractors.detectDiscoveryExplosions,

    // Validators
    detectTimePatterns: Validators.detectTimePatterns,
    detectSocialPatterns: Validators.detectSocialPatterns,
    detectMoodSearching: Validators.detectMoodSearching,
    detectTrueFavorites: Validators.detectTrueFavorites,

    // Transformers
    generateLiteSummary: Transformers.generateLiteSummary,
    generateDataInsights: Transformers.generateDataInsights,
    generatePatternSummary: Transformers.generatePatternSummary,

    // Matching
    detectLitePatterns: Matching.detectLitePatterns,
    detectImmediateVibe: Matching.detectImmediateVibe,

    // Cache & Async
    detectAllPatterns,
    detectAllPatternsAsync: Cache.detectAllPatternsAsync,
    cleanupPatternWorker: Cache.cleanupPatternWorker,
};
