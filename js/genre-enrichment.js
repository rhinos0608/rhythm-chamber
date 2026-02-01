/**
 * Genre Enrichment Module for Rhythm Chamber
 *
 * Solves the "Genre Gap" - Spotify exports lack genre data.
 * Uses a pre-bundled static map for top artists (instant) +
 * MusicBrainz API for lazy enrichment of remaining artists.
 *
 * HNW Considerations:
 * - Hierarchy: Static map is authority, API is fallback
 * - Network: Rate-limited queue prevents API abuse
 * - Wave: Progressive enrichment doesn't block UI
 *
 * REFACTORED: Code now organized into focused modules:
 * - genre-enrichment/index.js (main facade)
 * - genre-enrichment/genre-detection.js (genre lookup)
 * - genre-enrichment/genre-enrichment-cache.js (cache management)
 * - genre-enrichment/genre-enrichment-api.js (API integration)
 * - genre-enrichment/genre-enrichment-data.js (static map)
 *
 * This file provides backward compatibility by re-exporting all APIs.
 */

// Re-export everything from the new module structure
export {
    GenreEnrichment,
    getGenre,
    getGenres,
    getTopGenres,
    isKnownArtist,
    getAllKnownGenres,
    getStaticMapSize,
    loadCachedGenres,
    saveCachedGenres,
    initializeCache,
    getCacheObject,
    setCacheObject,
    getCacheSize,
    isCached,
    getCachedGenres,
    cacheGenres,
    clearMemoryCache,
    enrichStreams,
    queueForEnrichment,
    processApiQueue,
    enrichAudioFeatures,
    getAudioFeaturesSummary,
    extractSpotifyTrackId,
    spotifyKeyToName,
    getQueueSize,
    isQueueProcessing,
    getAudioFeaturesCacheSize,
    getApiStats,
    ARTIST_GENRE_MAP,
} from './genre-enrichment/index.js';

// Also provide default export for backward compatibility
export { default } from './genre-enrichment/index.js';
