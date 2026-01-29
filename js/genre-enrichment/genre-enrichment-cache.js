/**
 * Genre Enrichment Cache Management
 *
 * Manages the dynamic genre cache for artists discovered via MusicBrainz API.
 * The cache persists to IndexedDB and provides fast lookups for API-enriched artists.
 *
 * Cache hierarchy:
 * 1. Static map (genre-enrichment-data.js) - ~500 artists, instant
 * 2. Dynamic cache (this module) - API-enriched artists, persisted
 * 3. MusicBrainz API (genre-enrichment-api.js) - Fallback for unknown artists
 */

import { Storage } from '../storage.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GenreEnrichmentCache');

/**
 * In-memory cache of API-enriched artist genres.
 * Maps artist name (string) to genre array (string[]).
 * Persisted to IndexedDB via saveCachedGenres().
 *
 * @type {Object.<string, string[]>|null}
 */
let genreCache = null;

/**
 * Load cached genres from IndexedDB.
 * Returns the in-memory cache, loading from storage if not already loaded.
 * Subsequent calls return the cached in-memory copy for performance.
 *
 * @returns {Promise<Object.<string, string[]>>} Cache object mapping artist names to genres
 */
export async function loadCachedGenres() {
    if (genreCache) return genreCache;

    try {
        const cached = await Storage.getConfig('rhythm_chamber_genre_cache');
        if (cached) {
            genreCache = cached;
            logger.debug(`Loaded cache with ${Object.keys(genreCache).length} artists`);
            return genreCache;
        }
    } catch (e) {
        logger.warn('Failed to load genre cache from storage', e);
    }

    genreCache = {};
    return genreCache;
}

/**
 * Save the current genre cache to IndexedDB.
 * Persists the in-memory cache for future sessions.
 * Call this after adding new entries via setCache().
 *
 * @returns {Promise<void>}
 */
export async function saveCachedGenres() {
    if (!genreCache) return;

    try {
        await Storage.setConfig('rhythm_chamber_genre_cache', genreCache);
        logger.debug(`Saved cache with ${Object.keys(genreCache).length} artists`);
    } catch (e) {
        logger.warn('Failed to save genre cache to storage', e);
    }
}

/**
 * Get the entire cache object.
 * Useful for statistics and inspection.
 *
 * @returns {Object.<string, string[]>} Cache object (may be null if not loaded)
 */
export function getCache() {
    return genreCache;
}

/**
 * Set the entire cache object.
 * Used to restore cache from storage or for testing.
 *
 * @param {Object.<string, string[]>} cache - Cache object to set
 */
export function setCache(cache) {
    genreCache = cache;
}

/**
 * Initialize the cache by loading from storage.
 * Call this during application startup to prepare the cache.
 *
 * @returns {Promise<Object.<string, string[]>>} Loaded cache object
 */
export async function initialize() {
    return await loadCachedGenres();
}

/**
 * Get the number of artists in the dynamic cache.
 * Useful for statistics and coverage calculations.
 *
 * @returns {number} Number of cached artists
 */
export function getCacheSize() {
    return genreCache ? Object.keys(genreCache).length : 0;
}

/**
 * Check if an artist is in the dynamic cache.
 *
 * @param {string} artistName - Artist name to check
 * @returns {boolean} True if artist is in cache
 */
export function isCached(artistName) {
    if (!genreCache || !artistName) return false;
    return artistName in genreCache;
}

/**
 * Get genres for a specific artist from the cache.
 *
 * @param {string} artistName - Artist name to look up
 * @returns {string[]|null} Array of genres or null if not cached
 */
export function getCachedGenres(artistName) {
    if (!genreCache || !artistName) return null;
    return genreCache[artistName] || null;
}

/**
 * Add genres to the cache for an artist.
 * Use this after successful API enrichment.
 *
 * @param {string} artistName - Artist name
 * @param {string[]} genres - Array of genres to cache
 * @returns {Promise<void>}
 */
export async function cacheGenres(artistName, genres) {
    if (!artistName || !genres || !genres.length) return;

    if (!genreCache) genreCache = {};
    genreCache[artistName] = genres;

    await saveCachedGenres();
}

/**
 * Clear the in-memory cache.
 * Useful for testing or memory management.
 * Does not clear persisted storage.
 */
export function clearMemoryCache() {
    genreCache = null;
}
