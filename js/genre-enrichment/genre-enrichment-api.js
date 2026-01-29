/**
 * Genre Enrichment API - Orchestrator
 *
 * High-level enrichment orchestration for streaming history.
 * Coordinates MusicBrainz API integration and Spotify audio features.
 *
 * This module serves as the main entry point for enrichment operations,
 * delegating to specialized modules for:
 * - Premium feature access control (genre-enrichment-premium.js)
 * - MusicBrainz API enrichment (genre-enrichment-musicbrainz.js)
 * - Spotify audio features (genre-enrichment-spotify.js)
 *
 * @module genre-enrichment-api
 */

import { createLogger } from '../utils/logger.js';
import { getGenre } from './genre-detection.js';
import { checkEnrichmentAccess, showEnrichmentUpgradeModal } from './genre-enrichment-premium.js';
import { queueForEnrichment } from './genre-enrichment-musicbrainz.js';
import {
    getSpotifyAccessToken,
    fetchAudioFeaturesFromSpotify,
    extractSpotifyTrackId,
    getCachedAudioFeatures,
    setCachedAudioFeatures,
    getAudioFeaturesCacheSize as getSpotifyCacheSize
} from './genre-enrichment-spotify.js';
import { getCacheSize } from './genre-enrichment-cache.js';

const logger = createLogger('GenreEnrichmentAPI');

// ==========================================
// High-Level Enrichment Functions
// ==========================================

/**
 * Enrich streams with genre data.
 *
 * Adds _genres field to each stream where possible.
 * Optionally includes premium features (full API enrichment, audio features).
 *
 * Enrichment sources (in order):
 * 1. Static artist-genre map (instant, always available)
 * 2. Dynamic cache (from previous API enrichments)
 * 3. MusicBrainz API (premium, queued for lazy processing)
 *
 * @async
 * @param {Array} streams - Streaming history array
 * @param {Object} options - Enrichment options
 * @param {boolean} [options.full=false] - Enable full API enrichment (premium)
 * @param {boolean} [options.includeAudioFeatures=false] - Include BPM, key, danceability (premium)
 * @returns {Promise<Object>} Enrichment statistics:
 *   - enriched {number}: Number of streams enriched
 *   - total {number}: Total streams processed
 *   - coverage {number}: Percentage of streams enriched (0-100)
 *   - premiumRequired {boolean}: True if premium access needed
 *   - premiumFeatures {string[]}: List of premium features used
 */
export async function enrichStreams(streams, options = {}) {
    const { full = false, includeAudioFeatures = false } = options;
    let enriched = 0;
    const premiumFeatures = [];

    // Check premium access if full enrichment requested
    if (full || includeAudioFeatures) {
        const hasAccess = await checkEnrichmentAccess();
        if (!hasAccess) {
            await showEnrichmentUpgradeModal();
            return {
                enriched: 0,
                total: streams.length,
                coverage: 0,
                premiumRequired: true,
                premiumFeatures: [
                    'Full metadata enrichment',
                    'Audio features (BPM, key, danceability)'
                ]
            };
        }
        premiumFeatures.push('Full metadata enrichment');
    }

    if (includeAudioFeatures) {
        premiumFeatures.push('Audio features (BPM, key, danceability)');
    }

    // Basic genre enrichment (always available from static map)
    for (const stream of streams) {
        // Skip if already enriched
        if (stream._genres) {
            enriched++;
            continue;
        }

        const artistName = stream.master_metadata_album_artist_name || stream.artistName;
        const genres = getGenre(artistName);

        if (genres) {
            stream._genres = genres;
            enriched++;
        }

        // Premium: Queue for API enrichment if not in static map
        if (full && !genres && artistName) {
            await queueForEnrichment(artistName);
        }
    }

    // Premium: Add audio features if requested and Spotify available
    if (includeAudioFeatures) {
        const audioFeaturesResult = await enrichAudioFeatures(streams);
        enriched += audioFeaturesResult.enriched;
    }

    return {
        enriched,
        total: streams.length,
        coverage: Math.round((enriched / streams.length) * 100),
        premiumFeatures: premiumFeatures.length > 0 ? premiumFeatures : undefined
    };
}

/**
 * Enrich streams with Spotify audio features (PREMIUM FEATURE).
 *
 * Fetches BPM, key, danceability, energy, and other audio characteristics.
 * Uses in-memory cache to avoid redundant API calls.
 *
 * Process:
 * 1. Check premium access
 * 2. Get Spotify access token
 * 3. Extract track IDs from streams
 * 4. Check cache for existing features
 * 5. Batch fetch uncached tracks (max 50 per request)
 * 6. Apply features to streams
 *
 * @async
 * @param {Array} streams - Streaming history array
 * @returns {Promise<Object>} Enrichment statistics:
 *   - enriched {number}: Number of streams newly enriched
 *   - cached {number}: Number of streams using cached features
 *   - errors {number}: Number of errors encountered
 *   - premiumRequired {boolean}: True if premium access needed
 *   - noToken {boolean}: True if no Spotify token available
 */
export async function enrichAudioFeatures(streams) {
    // Check premium access first
    const hasAccess = await checkEnrichmentAccess();
    if (!hasAccess) {
        await showEnrichmentUpgradeModal();
        return { enriched: 0, cached: 0, errors: 0, premiumRequired: true };
    }

    // Get Spotify access token
    const accessToken = await getSpotifyAccessToken();
    if (!accessToken) {
        logger.warn('No Spotify access token available for audio features');
        return { enriched: 0, cached: 0, errors: 0, noToken: true };
    }

    let enriched = 0;
    let cached = 0;
    let errors = 0;

    // Extract track IDs that need enrichment
    const tracksToFetch = [];
    for (const stream of streams) {
        // Skip if already enriched
        if (stream._audioFeatures) {
            cached++;
            continue;
        }

        const trackId = extractSpotifyTrackId(stream);
        if (trackId) {
            // Check cache first
            const cachedFeatures = getCachedAudioFeatures(trackId);
            if (cachedFeatures) {
                stream._audioFeatures = cachedFeatures;
                cached++;
            } else {
                tracksToFetch.push({ stream, trackId });
            }
        }
    }

    // Batch fetch from Spotify (max 50 at a time)
    const batchSize = 50;
    for (let i = 0; i < tracksToFetch.length; i += batchSize) {
        const batch = tracksToFetch.slice(i, i + batchSize);
        const trackIds = batch.map(t => t.trackId);

        try {
            const featuresMap = await fetchAudioFeaturesFromSpotify(trackIds, accessToken);

            // Apply features to streams
            for (const { stream, trackId } of batch) {
                if (featuresMap[trackId]) {
                    stream._audioFeatures = featuresMap[trackId];
                    enriched++;
                } else {
                    errors++;
                }
            }

            // Rate limiting: wait between batches if needed
            if (i + batchSize < tracksToFetch.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

        } catch (e) {
            if (e.message === 'SPOTIFY_TOKEN_EXPIRED') {
                // Token expired, stop processing
                logger.warn('Spotify token expired during audio features fetch');
                break;
            }
            errors += batch.length;
        }
    }

    logger.info(`Audio features enrichment: ${enriched} new, ${cached} cached, ${errors} errors`);

    return { enriched, cached, errors };
}

/**
 * Get audio features summary for a collection of streams.
 *
 * Aggregates BPM, energy, danceability, key, and mode statistics.
 * Only includes streams that have audio features.
 *
 * @param {Array} streams - Streaming history array
 * @returns {Object|null} Summary statistics or null if no audio features found:
 *   - count {number}: Number of streams with audio features
 *   - avgBpm {number}: Average BPM
 *   - avgEnergy {number}: Average energy (0-100)
 *   - avgDanceability {number}: Average danceability (0-100)
 *   - avgValence {number}: Average valence/positivity (0-100)
 *   - keyDistribution {Object}: Map of key to count
 *   - modeDistribution {Object}: Map of mode to count (major/minor)
 */
export function getAudioFeaturesSummary(streams) {
    const withFeatures = streams.filter(s => s._audioFeatures);
    if (withFeatures.length === 0) {
        return null;
    }

    const stats = {
        count: withFeatures.length,
        avgBpm: 0,
        avgEnergy: 0,
        avgDanceability: 0,
        avgValence: 0,
        keyDistribution: {},
        modeDistribution: { major: 0, minor: 0 }
    };

    let totalBpm = 0;
    let totalEnergy = 0;
    let totalDanceability = 0;
    let totalValence = 0;

    // Aggregate statistics
    for (const stream of withFeatures) {
        const af = stream._audioFeatures;
        totalBpm += af.tempo;
        totalEnergy += af.energy;
        totalDanceability += af.danceability;
        totalValence += af.valence;

        stats.keyDistribution[af.key] = (stats.keyDistribution[af.key] || 0) + 1;
        stats.modeDistribution[af.mode]++;
    }

    // Calculate averages
    stats.avgBpm = Math.round(totalBpm / withFeatures.length);
    stats.avgEnergy = Math.round(totalEnergy / withFeatures.length);
    stats.avgDanceability = Math.round(totalDanceability / withFeatures.length);
    stats.avgValence = Math.round(totalValence / withFeatures.length);

    return stats;
}

// ==========================================
// Statistics and State Access
// ==========================================

/**
 * Get aggregate statistics for all modules.
 *
 * Useful for monitoring and debugging enrichment state.
 *
 * @returns {Object} Statistics object:
 *   - cachedCount {number}: Number of cached genres
 *   - queueLength {number}: Number of artists in MusicBrainz queue
 *   - isProcessing {boolean}: Whether MusicBrainz queue is processing
 *   - audioFeaturesCacheSize {number}: Number of cached audio features
 */
export function getStats() {
    // Import dynamically to avoid circular dependency
    return import('./genre-enrichment-musicbrainz.js').then(({ getQueueSize, isProcessing }) => {
        return {
            cachedCount: getCacheSize(),
            queueLength: getQueueSize(),
            isProcessing: isProcessing(),
            audioFeaturesCacheSize: getSpotifyCacheSize()
        };
    });
}

/**
 * Synchronous version of getStats for backward compatibility.
 * Note: Does not include queue state to avoid async complexity.
 *
 * @returns {Object} Partial statistics object
 */
export function getStatsSync() {
    return {
        cachedCount: getCacheSize(),
        audioFeaturesCacheSize: getSpotifyCacheSize()
    };
}
