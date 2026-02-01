/**
 * Genre Enrichment Module - Facade
 *
 * Provides backward-compatible public API for genre enrichment.
 * Re-exports all functions from extracted modules.
 *
 * This facade maintains 100% compatibility with the original
 * js/genre-enrichment.js API while organizing code into focused modules.
 *
 * Module structure:
 * - genre-enrichment-data.js: Static artist-genre map
 * - genre-enrichment-cache.js: Dynamic cache management
 * - genre-detection.js: Genre lookup and detection
 * - genre-enrichment-premium.js: Premium feature gating
 * - genre-enrichment-musicbrainz.js: MusicBrainz API integration
 * - genre-enrichment-spotify.js: Spotify audio features
 * - genre-enrichment-api.js: Orchestrator and high-level functions
 */

// ==========================================
// Re-export Public APIs
// ==========================================

// From genre-detection.js
export {
    getGenre,
    getGenres,
    getTopGenres,
    isKnownArtist,
    getAllKnownGenres,
    getStaticMapSize,
} from './genre-detection.js';

// From genre-enrichment-cache.js
export {
    loadCachedGenres,
    saveCachedGenres,
    initialize as initializeCache,
    getCache as getCacheObject,
    setCache as setCacheObject,
    getCacheSize,
    isCached,
    getCachedGenres,
    cacheGenres,
    clearMemoryCache,
} from './genre-enrichment-cache.js';

// From genre-enrichment-musicbrainz.js
export {
    queueForEnrichment,
    processApiQueue,
    fetchGenreFromMusicBrainz,
    getQueueSize,
    isProcessing,
    getQueueState,
} from './genre-enrichment-musicbrainz.js';

// From genre-enrichment-spotify.js
export {
    extractSpotifyTrackId,
    spotifyKeyToName,
    getSpotifyAccessToken,
    fetchAudioFeaturesFromSpotify,
    getCachedAudioFeatures,
    setCachedAudioFeatures,
    getAudioFeaturesCacheSize,
    clearAudioFeaturesCache,
} from './genre-enrichment-spotify.js';

// From genre-enrichment-api.js
export {
    enrichStreams,
    enrichAudioFeatures,
    getAudioFeaturesSummary,
    getStats,
    getStatsSync,
} from './genre-enrichment-api.js';

// From genre-enrichment-data.js
export { ARTIST_GENRE_MAP } from './genre-enrichment-data.js';

// ==========================================
// Backward Compatibility Aliases
// ==========================================

// Legacy function names (Fix 2.1 - P0-3 backward compatibility)
// These aliases maintain compatibility with code using old function names
export { isProcessing as isQueueProcessing } from './genre-enrichment-musicbrainz.js';
export { getStats as getApiStats } from './genre-enrichment-api.js';

// ==========================================
// Legacy GenreEnrichment Export Object
// ==========================================

import {
    getGenre as _getGenre,
    getGenres as _getGenres,
    getTopGenres as _getTopGenres,
    isKnownArtist as _isKnownArtist,
    getAllKnownGenres as _getAllKnownGenres,
    getStaticMapSize as _getStaticMapSize,
} from './genre-detection.js';

import { loadCachedGenres as _loadCachedGenres } from './genre-enrichment-cache.js';

import {
    queueForEnrichment as _queueForEnrichment,
    getQueueSize as _getQueueSize,
    isProcessing as _isProcessing,
} from './genre-enrichment-musicbrainz.js';

import {
    enrichStreams as _enrichStreams,
    enrichAudioFeatures as _enrichAudioFeatures,
    getAudioFeaturesSummary as _getAudioFeaturesSummary,
    getStats as _getStats,
} from './genre-enrichment-api.js';

import { getAudioFeaturesCacheSize as _getSpotifyCacheSize } from './genre-enrichment-spotify.js';

import { getStaticMapSize as _getDataSize } from './genre-enrichment-data.js';
import { getCacheSize as _getCacheSize } from './genre-enrichment-cache.js';

/**
 * Legacy GenreEnrichment export object.
 * Maintains backward compatibility with code using:
 * import { GenreEnrichment } from './genre-enrichment.js';
 *
 * @constant {Object}
 */
export const GenreEnrichment = {
    // Sync lookups (instant)
    getGenre: _getGenre,
    getGenres: _getGenres,
    getTopGenres: _getTopGenres,
    enrichStreams: _enrichStreams,
    isKnownArtist: _isKnownArtist,
    getAllKnownGenres: _getAllKnownGenres,
    getStaticMapSize: _getStaticMapSize,

    // Async operations
    loadCachedGenres: _loadCachedGenres,
    queueForEnrichment: _queueForEnrichment,

    // Audio features (premium)
    enrichAudioFeatures: _enrichAudioFeatures,
    getAudioFeaturesSummary: _getAudioFeaturesSummary,

    // Backward compatibility aliases (CRITICAL-2 fix)
    isQueueProcessing: _isProcessing,
    getApiStats: _getStats,

    // Aggregate statistics
    getStats() {
        return {
            staticMapSize: _getDataSize(),
            cachedCount: _getCacheSize(),
            queueLength: _getQueueSize(),
            isProcessing: _isProcessing(),
            audioFeaturesCacheSize: _getSpotifyCacheSize(),
        };
    },
};

// ==========================================
// Default Export (also backward compatible)
// ==========================================

export default GenreEnrichment;
