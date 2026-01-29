/**
 * Genre Enrichment - Spotify Audio Features Integration
 *
 * Handles audio features enrichment using Spotify Web API.
 * Fetches BPM, key, danceability, energy, and other audio characteristics.
 *
 * Features:
 * - Audio features fetching (up to 50 tracks per batch)
 * - Token management (access token, refresh token)
 * - In-memory caching for audio features
 * - Rate limiting and error handling
 *
 * @module genre-enrichment-spotify
 */

import { Storage } from '../storage.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GenreEnrichmentSpotify');

// ==========================================
// Audio Features Cache
// ==========================================

/**
 * In-memory cache for audio features.
 * Maps Spotify track IDs to audio feature data.
 * @type {Map<string, Object>}
 */
const audioFeaturesCache = new Map();

// ==========================================
// Spotify Token Management
// ==========================================

/**
 * Get Spotify access token from user settings.
 *
 * Requires user to have connected their Spotify account.
 * Token is stored in encrypted config storage.
 *
 * @async
 * @returns {Promise<string|null>} Access token or null if not available
 */
export async function getSpotifyAccessToken() {
    // Check if running in browser environment
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        // Retrieve token from storage
        const tokenData = await Storage.getConfig('spotify_access_token');

        if (!tokenData || !tokenData.access_token) {
            return null;
        }

        // Check if token is expired
        if (tokenData.expires_at && Date.now() > tokenData.expires_at) {
            // Token expired, attempt refresh
            return await refreshSpotifyToken(tokenData.refresh_token);
        }

        return tokenData.access_token;
    } catch (e) {
        logger.warn('Failed to get Spotify token:', e);
        return null;
    }
}

/**
 * Refresh expired Spotify access token.
 *
 * NOTE: Token refresh requires backend proxy to keep client_secret secure.
 * Current implementation returns null to indicate re-authentication needed.
 *
 * Future implementation:
 * - Call backend proxy with refresh_token
 * - Backend exchanges for new access_token
 * - Return new token to client
 *
 * @async
 * @param {string} refreshToken - Refresh token from Spotify OAuth
 * @returns {Promise<string|null>} New access token or null if refresh failed
 */
export async function refreshSpotifyToken(refreshToken) {
    logger.warn('Spotify token expired, re-authentication required');

    // TODO: Implement token refresh via backend proxy
    // const response = await fetch('/api/spotify/refresh', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ refresh_token: refreshToken })
    // });
    // const data = await response.json();
    // return data.access_token;

    return null;
}

// ==========================================
// Spotify API Integration
// ==========================================

/**
 * Fetch audio features for multiple tracks from Spotify Web API.
 *
 * Spotify allows up to 50 tracks per request.
 * Audio features include:
 * - tempo (BPM)
 * - key (musical key 0-11)
 * - mode (major/minor)
 * - danceability (0-100)
 * - energy (0-100)
 * - valence/positivity (0-100)
 * - acousticness (0-100)
 * - instrumentalness (0-100)
 * - liveness (0-100)
 * - speechiness (0-100)
 * - loudness (dB)
 * - duration_ms
 * - time_signature
 *
 * @async
 * @param {string[]} trackIds - Array of Spotify track IDs (max 50)
 * @param {string} accessToken - Valid Spotify access token
 * @returns {Promise<Object.<string, Object>>} Map of track ID to audio features
 * @throws {Error} If API request fails or token expired
 */
export async function fetchAudioFeaturesFromSpotify(trackIds, accessToken) {
    if (!trackIds.length) {
        return {};
    }

    // Spotify API allows up to 50 tracks per request
    const idsParam = trackIds.join(',');
    const url = `https://api.spotify.com/v1/audio-features?ids=${idsParam}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // Handle specific error cases
            if (response.status === 401) {
                throw new Error('SPOTIFY_TOKEN_EXPIRED');
            }
            if (response.status === 429) {
                throw new Error('SPOTIFY_RATE_LIMITED');
            }
            throw new Error(`Spotify API error: ${response.status}`);
        }

        const data = await response.json();
        const featuresMap = {};

        // Process audio features for each track
        for (const track of (data.audio_features || [])) {
            if (track && track.id) {
                const features = {
                    tempo: Math.round(track.tempo), // BPM
                    key: spotifyKeyToName(track.key), // Convert 0-11 to note names
                    mode: track.mode === 1 ? 'major' : 'minor',
                    danceability: Math.round(track.danceability * 100),
                    energy: Math.round(track.energy * 100),
                    valence: Math.round(track.valence * 100), // Positivity
                    acousticness: Math.round(track.acousticness * 100),
                    instrumentalness: Math.round(track.instrumentalness * 100),
                    liveness: Math.round(track.liveness * 100),
                    speechiness: Math.round(track.speechiness * 100),
                    loudness: Math.round(track.loudness * 10) / 10, // dB
                    durationMs: track.duration_ms,
                    timeSignature: track.time_signature
                };

                featuresMap[track.id] = features;

                // Cache the result
                audioFeaturesCache.set(track.id, features);
            }
        }

        return featuresMap;

    } catch (e) {
        logger.warn('Failed to fetch audio features:', e);
        throw e;
    }
}

// ==========================================
// Utility Functions
// ==========================================

/**
 * Extract Spotify track ID from stream data.
 *
 * Checks various fields that might contain Spotify URI or ID:
 * - spotify_track_uri
 * - trackUri
 * - uri
 * - spotify_track_id
 * - trackId
 * - id
 *
 * @param {Object} stream - Stream object from Spotify export
 * @returns {string|null} Spotify track ID or null if not found
 */
export function extractSpotifyTrackId(stream) {
    // Try URI fields first
    const uri = stream.spotify_track_uri || stream.trackUri || stream.uri;
    if (uri && typeof uri === 'string') {
        // Extract ID from URI like "spotify:track:4iV5W9uYEdYUVa79Axb7Rh"
        const match = uri.match(/spotify:track:([a-zA-Z0-9]+)/);
        if (match) {
            return match[1];
        }
    }

    // Try direct ID fields
    const id = stream.spotify_track_id || stream.trackId || stream.id;
    if (id && typeof id === 'string') {
        return id;
    }

    return null;
}

/**
 * Convert Spotify key number (0-11) to musical note name.
 *
 * Spotify uses pitch class notation:
 * 0 = C, 1 = C#/Db, 2 = D, 3 = D#/Eb, 4 = E, 5 = F,
 * 6 = F#/Gb, 7 = G, 8 = G#/Ab, 9 = A, 10 = A#/Bb, 11 = B
 *
 * @param {number} key - Spotify key number (0-11)
 * @returns {string} Key name (e.g., "C", "F#", "B")
 */
export function spotifyKeyToName(key) {
    const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return keyNames[key] || 'Unknown';
}

// ==========================================
// Cache Management
// ==========================================

/**
 * Get audio features from cache for a track.
 *
 * @param {string} trackId - Spotify track ID
 * @returns {Object|null} Audio features or null if not cached
 */
export function getCachedAudioFeatures(trackId) {
    return audioFeaturesCache.get(trackId) || null;
}

/**
 * Cache audio features for a track.
 *
 * @param {string} trackId - Spotify track ID
 * @param {Object} features - Audio features to cache
 */
export function setCachedAudioFeatures(trackId, features) {
    audioFeaturesCache.set(trackId, features);
}

/**
 * Get the number of tracks in the audio features cache.
 *
 * @returns {number} Cache size
 */
export function getAudioFeaturesCacheSize() {
    return audioFeaturesCache.size;
}

/**
 * Clear the audio features cache.
 *
 * Useful for testing or memory management.
 */
export function clearAudioFeaturesCache() {
    audioFeaturesCache.clear();
}
