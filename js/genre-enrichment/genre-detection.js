/**
 * Genre Detection and Lookup
 *
 * Provides genre detection and lookup functionality using the static map
 * and dynamic cache. This is the primary interface for genre enrichment.
 *
 * Lookup strategy:
 * 1. Static map (instant) - Covers ~500 top artists
 * 2. Dynamic cache (instant) - API-enriched artists
 * 3. Return null (triggers lazy API enrichment if needed)
 */

import { ARTIST_GENRE_MAP, getAllKnownGenres, getStaticMapSize } from './genre-enrichment-data.js';
import { getCachedGenres } from './genre-enrichment-cache.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GenreDetection');

/**
 * Get genres for an artist using static map and cache.
 * Returns immediately with available genres or null if unknown.
 * Does NOT trigger API enrichment (use genre-enrichment-api.js for that).
 *
 * Lookup order:
 * 1. Static artist-genre map (500+ top artists)
 * 2. Dynamic cache (API-enriched artists)
 * 3. Return null (unknown artist)
 *
 * @param {string} artistName - Name of the artist to look up
 * @returns {string[]|null} Array of genres or null if unknown
 */
export function getGenre(artistName) {
    if (!artistName) return null;

    // Normalize name for lookup
    const normalizedName = artistName.trim();

    // 1. Check static map first (covers ~80% of typical history)
    if (ARTIST_GENRE_MAP[normalizedName]) {
        return ARTIST_GENRE_MAP[normalizedName];
    }

    // 2. Check dynamic cache (from API enrichment)
    const cached = getCachedGenres(normalizedName);
    if (cached) {
        return cached;
    }

    // 3. Unknown artist
    return null;
}

/**
 * Get genres for multiple artists at once.
 * Efficient batch lookup using the same strategy as getGenre().
 *
 * @param {string[]} artistNames - Array of artist names to look up
 * @returns {Object.<string, string[]>} Map of artist name to genre array (only includes found artists)
 */
export function getGenres(artistNames) {
    const result = {};

    for (const name of artistNames) {
        const genres = getGenre(name);
        if (genres) {
            result[name] = genres;
        }
    }

    return result;
}

/**
 * Get top genres from a collection of streams.
 * Analyzes all streams, counts genre occurrences, and returns ranked results.
 *
 * Genre sources (checked in order):
 * 1. Stream._demo_genres (embedded demo data)
 * 2. Stream.artistName → genre lookup
 * 3. Stream.master_metadata_album_artist_name → genre lookup
 *
 * @param {Array} streams - Streaming history array
 * @param {number} limit - Maximum number of genres to return (default: 10)
 * @returns {Array.<{genre: string, count: number, percentage: number}>} Sorted array of genre statistics
 */
export function getTopGenres(streams, limit = 10) {
    const genreCounts = {};
    let totalWithGenres = 0;

    for (const stream of streams) {
        const artistName = stream.master_metadata_album_artist_name ||
            stream.artistName ||
            stream._demo_genres?.[0];

        // Check for demo data embedded genres first
        let genres = stream._demo_genres;

        // Otherwise look up artist
        if (!genres) {
            genres = getGenre(artistName);
        }

        if (genres && genres.length > 0) {
            totalWithGenres++;
            for (const genre of genres) {
                genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            }
        }
    }

    const sortedGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([genre, count]) => ({
            genre,
            count,
            percentage: totalWithGenres > 0 ? Math.round((count / totalWithGenres) * 100) : 0
        }));

    return sortedGenres;
}

/**
 * Check if an artist is in the static map.
 * Useful for UI indicators showing "instant" vs "API" lookup.
 *
 * @param {string} artistName - Artist name to check
 * @returns {boolean} True if artist is in static map
 */
export function isKnownArtist(artistName) {
    if (!artistName) return false;
    return artistName in ARTIST_GENRE_MAP;
}

/**
 * Get all unique genres from the static map.
 * Re-exported from genre-enrichment-data.js for convenience.
 *
 * @returns {string[]} Sorted array of unique genre names
 */
export { getAllKnownGenres };

/**
 * Get the number of artists in the static map.
 * Re-exported from genre-enrichment-data.js for convenience.
 *
 * @returns {number} Number of artists in static map
 */
export { getStaticMapSize };
