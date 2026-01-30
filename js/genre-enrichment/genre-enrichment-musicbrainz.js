/**
 * Genre Enrichment - MusicBrainz API Integration
 *
 * Handles lazy genre enrichment for unknown artists using MusicBrainz API.
 * Includes rate limiting, queue management, and batch processing.
 *
 * Features:
 * - Artist queue management for API enrichment
 * - Rate-limited API requests (1.1s between requests)
 * - Genre extraction from MusicBrainz release groups
 * - Premium-gated access control
 *
 * @module genre-enrichment-musicbrainz
 */

import { createLogger } from '../utils/logger.js';
import { getGenre } from './genre-detection.js';
import { getCache, cacheGenres } from './genre-enrichment-cache.js';
import { checkEnrichmentAccess, showEnrichmentUpgradeModal } from './genre-enrichment-premium.js';
import { LIMITS } from '../constants/limits.js';

const logger = createLogger('GenreEnrichmentMusicBrainz');

// ==========================================
// Queue State Management
// ==========================================

/**
 * Queue of artists waiting for MusicBrainz enrichment.
 * @type {string[]}
 */
const API_QUEUE = [];

/**
 * Flag indicating queue is currently being processed.
 * @type {boolean}
 */
let apiProcessing = false;

// ==========================================
// API Configuration
// ==========================================

/**
 * Rate limit: 1.1 seconds between requests.
 * MusicBrainz allows 1 request per second.
 */
const API_RATE_LIMIT_MS = 1100;

// ==========================================
// Queue Management
// ==========================================

/**
 * Queue an artist for API enrichment (PREMIUM FEATURE).
 *
 * Only enqueues artists that are:
 * - Not in the static genre map
 * - Not already cached
 * - Not already in queue
 *
 * Premium gate checked before queuing.
 *
 * @async
 * @param {string} artistName - Artist name to enrich via MusicBrainz API
 * @returns {Promise<boolean>} True if queued successfully, false if:
 *   - Premium access required
 *   - Already queued
 *   - Already known (in cache or static map)
 */
export async function queueForEnrichment(artistName) {
    // Validate input
    if (!artistName) return false;

    // Check if already known (static map)
    if (getGenre(artistName)) return false;

    // Check if already cached
    const cache = getCache();
    if (cache?.[artistName]) return false;

    // Check if already queued
    if (API_QUEUE.includes(artistName)) return false;

    // PREMIUM GATE: Check metadata enrichment access
    const hasAccess = await checkEnrichmentAccess();
    if (!hasAccess) {
        await showEnrichmentUpgradeModal();
        return false;
    }

    // Add to queue and trigger processing
    API_QUEUE.push(artistName);
    processApiQueue(); // Don't await - let it process in background

    return true;
}

/**
 * Process the API queue with rate limiting.
 *
 * Fetches genres from MusicBrainz for queued artists.
 * Guards against infinite loops with iteration limit.
 * Respects rate limits between API calls.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function processApiQueue() {
    // Prevent concurrent processing
    if (apiProcessing || API_QUEUE.length === 0) {
        return;
    }

    apiProcessing = true;
    let iterations = 0;

    try {
        while (API_QUEUE.length > 0 && iterations < LIMITS.MAX_ITERATIONS) {
            iterations++;
            const artistName = API_QUEUE.shift();

            try {
                const genres = await fetchGenreFromMusicBrainz(artistName);

                // Cache results if genres found
                if (genres && genres.length > 0) {
                    await cacheGenres(artistName, genres);
                    logger.info(`Enriched "${artistName}" with genres: ${genres.join(', ')}`);
                }
            } catch (e) {
                logger.warn(`Failed to fetch genre for "${artistName}"`, e);
            }

            // Rate limit: wait before next request
            if (API_QUEUE.length > 0) {
                await new Promise(resolve => setTimeout(resolve, API_RATE_LIMIT_MS));
            }
        }

        // Log warning if max iterations reached
        if (iterations >= LIMITS.MAX_ITERATIONS && API_QUEUE.length > 0) {
            logger.warn(`Queue processing stopped at max iterations (${LIMITS.MAX_ITERATIONS}), ${API_QUEUE.length} artists remaining`);
        }
    } finally {
        apiProcessing = false;
    }
}

// ==========================================
// MusicBrainz API Integration
// ==========================================

/**
 * Fetch genre from MusicBrainz API for an artist.
 *
 * Process:
 * 1. Search for artist by name
 * 2. Get artist's MusicBrainz ID (MBID)
 * 3. Fetch release groups with genre tags
 * 4. Aggregate genres by count
 * 5. Return top 3 genres
 *
 * @async
 * @param {string} artistName - Artist name to look up
 * @returns {Promise<string[]|null>} Array of up to 3 genres, or null if not found
 * @throws {Error} If API request fails
 */
export async function fetchGenreFromMusicBrainz(artistName) {
    const encodedName = encodeURIComponent(artistName);

    // Step 1: Search for artist
    const searchUrl = `https://musicbrainz.org/ws/2/artist/?query=${encodedName}&fmt=json&limit=1`;

    const searchResponse = await fetch(searchUrl, {
        headers: {
            'User-Agent': 'RhythmChamber/1.0 (https://rhythmchamber.com)'
        }
    });

    if (!searchResponse.ok) {
        throw new Error(`MusicBrainz search failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();

    if (!searchData.artists || searchData.artists.length === 0) {
        return null;
    }

    const artist = searchData.artists[0];
    const mbid = artist.id;

    // Step 2: Rate limit before second request
    await new Promise(resolve => setTimeout(resolve, API_RATE_LIMIT_MS));

    // Step 3: Get release groups with genres
    const rgUrl = `https://musicbrainz.org/ws/2/release-group?artist=${mbid}&inc=genres&fmt=json&limit=5`;

    const rgResponse = await fetch(rgUrl, {
        headers: {
            'User-Agent': 'RhythmChamber/1.0 (https://rhythmchamber.com)'
        }
    });

    if (!rgResponse.ok) {
        throw new Error(`MusicBrainz release-group failed: ${rgResponse.status}`);
    }

    const rgData = await rgResponse.json();

    // Step 4: Aggregate genres from release groups
    const genreCounts = {};
    for (const rg of (rgData['release-groups'] || [])) {
        for (const genre of (rg.genres || [])) {
            genreCounts[genre.name] = (genreCounts[genre.name] || 0) + genre.count;
        }
    }

    // Step 5: Return top 3 genres by count
    const sortedGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

    return sortedGenres.length > 0 ? sortedGenres : null;
}

// ==========================================
// State Access Functions
// ==========================================

/**
 * Get the number of artists in the MusicBrainz enrichment queue.
 *
 * @returns {number} Queue length
 */
export function getQueueSize() {
    return API_QUEUE.length;
}

/**
 * Check if the MusicBrainz API queue is currently being processed.
 *
 * @returns {boolean} True if queue is being processed
 */
export function isProcessing() {
    return apiProcessing;
}

/**
 * Get the current queue state (for debugging).
 *
 * @returns {Object} Queue state object
 */
export function getQueueState() {
    return {
        queueLength: API_QUEUE.length,
        isProcessing: apiProcessing,
        queuedArtists: [...API_QUEUE] // Return copy
    };
}
