/**
 * Spotify Module Facade
 * Public API that delegates to focused services
 * Maintains backward compatibility with existing imports
 */

import { OAuthManager } from './oauth-manager.js';
import { TokenStore } from './token-store.js';
import { ApiClient } from './api-client.js';
import { RefreshService } from './refresh-service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Spotify');

/**
 * Transform Spotify API data to format for pattern detection
 * @param {object} spotifyData - Raw Spotify API data
 * @returns {object} Transformed data for analysis
 */
function transformForAnalysis(spotifyData) {
    // EDGE CASE FIX: Validate input structure before transformation
    // Missing validation could cause runtime errors when accessing nested properties
    if (!spotifyData || typeof spotifyData !== 'object') {
        logger.warn('[Spotify] transformForAnalysis received invalid input, returning empty structure');
        return {
            recentStreams: [],
            topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
            topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
            profile: { displayName: 'Music Lover', id: null },
            isLiteData: true,
            fetchedAt: new Date().toISOString(),
            _inputError: 'Invalid input structure'
        };
    }

    // Extract recently played as pseudo-streams
    const recentStreams = (spotifyData.recentlyPlayed?.items || []).map((item, index) => ({
        trackName: item.track?.name || 'Unknown',
        artistName: item.track?.artists?.[0]?.name || 'Unknown',
        albumName: item.track?.album?.name || 'Unknown',
        playedAt: item.played_at,
        msPlayed: item.track?.duration_ms || 180000, // Assume full play
        spotifyTrackUri: item.track?.uri,
        // We don't have skip/shuffle data from API
        isFromSpotifyApi: true
    }));

    // Extract top artists across time ranges
    const topArtists = {
        shortTerm: (spotifyData.topArtists?.shortTerm?.items || []).map(a => ({
            name: a.name,
            id: a.id,
            genres: a.genres || [],
            popularity: a.popularity,
            imageUrl: a.images?.[0]?.url
        })),
        mediumTerm: (spotifyData.topArtists?.mediumTerm?.items || []).map(a => ({
            name: a.name,
            id: a.id,
            genres: a.genres || [],
            popularity: a.popularity,
            imageUrl: a.images?.[0]?.url
        })),
        longTerm: (spotifyData.topArtists?.longTerm?.items || []).map(a => ({
            name: a.name,
            id: a.id,
            genres: a.genres || [],
            popularity: a.popularity,
            imageUrl: a.images?.[0]?.url
        }))
    };

    // Extract top tracks across time ranges
    const topTracks = {
        shortTerm: (spotifyData.topTracks?.shortTerm?.items || []).map(t => ({
            name: t.name,
            artist: t.artists?.[0]?.name || 'Unknown',
            album: t.album?.name,
            id: t.id,
            popularity: t.popularity
        })),
        mediumTerm: (spotifyData.topTracks?.mediumTerm?.items || []).map(t => ({
            name: t.name,
            artist: t.artists?.[0]?.name || 'Unknown',
            album: t.album?.name,
            id: t.id,
            popularity: t.popularity
        })),
        longTerm: (spotifyData.topTracks?.longTerm?.items || []).map(t => ({
            name: t.name,
            artist: t.artists?.[0]?.name || 'Unknown',
            album: t.album?.name,
            id: t.id,
            popularity: t.popularity
        }))
    };

    return {
        recentStreams,
        topArtists,
        topTracks,
        profile: {
            displayName: spotifyData.profile?.display_name || 'Music Lover',
            id: spotifyData.profile?.id
        },
        isLiteData: true, // Flag for pattern detection
        fetchedAt: new Date().toISOString()
    };
}

/**
 * Fetch all data needed for Quick Snapshot
 * @param {function} onProgress - Progress callback
 * @returns {Promise<object>} All Spotify data for analysis
 */
async function fetchSnapshotData(onProgress = () => {}) {
    const data = {
        recentlyPlayed: null,
        topArtists: {
            shortTerm: null,
            mediumTerm: null,
            longTerm: null
        },
        topTracks: {
            shortTerm: null,
            mediumTerm: null,
            longTerm: null
        },
        profile: null
    };

    try {
        onProgress('Fetching your profile...');
        data.profile = await ApiClient.getCurrentProfile();

        onProgress('Fetching recently played tracks...');
        data.recentlyPlayed = await ApiClient.getRecentlyPlayed(50);

        onProgress('Analyzing your current favorites...');
        data.topArtists.shortTerm = await ApiClient.getTopArtists('short_term', 50);
        data.topTracks.shortTerm = await ApiClient.getTopTracks('short_term', 50);

        onProgress('Analyzing your 6-month trends...');
        data.topArtists.mediumTerm = await ApiClient.getTopArtists('medium_term', 50);
        data.topTracks.mediumTerm = await ApiClient.getTopTracks('medium_term', 50);

        onProgress('Analyzing your all-time favorites...');
        data.topArtists.longTerm = await ApiClient.getTopArtists('long_term', 50);
        data.topTracks.longTerm = await ApiClient.getTopTracks('long_term', 50);

        return data;
    } catch (error) {
        logger.error('Error fetching Spotify data:', error);
        throw error;
    }
}

/**
 * Handle OAuth callback - exchange code for tokens
 * @param {string} code - Authorization code from callback
 * @param {string} state - State parameter from callback for CSRF verification
 * @returns {Promise<boolean>} Success status
 */
async function handleCallback(code, state) {
    try {
        const tokenData = await OAuthManager.handleCallback(code, state);
        await TokenStore.persistTokens(tokenData, true);
        return true;
    } catch (error) {
        logger.error('Token exchange failed:', error);
        throw error;
    }
}

/**
 * Refresh access token using refresh token
 * @returns {Promise<boolean>} Success status
 */
async function refreshToken() {
    return RefreshService.refreshToken();
}

/**
 * Clear all Spotify tokens (logout)
 */
async function clearTokens() {
    await TokenStore.clearTokens();
    OAuthManager.clearSessionData();
}

/**
 * Check if we have a valid access token
 * @returns {Promise<boolean>}
 */
async function hasValidToken() {
    return TokenStore.hasValidToken();
}

/**
 * Get the current access token
 * @returns {Promise<string>} Access token or null
 */
async function getAccessToken() {
    return TokenStore.getAccessToken();
}

/**
 * Check if token can be refreshed
 * @returns {Promise<boolean>}
 */
async function canRefreshToken() {
    return TokenStore.canRefreshToken() && OAuthManager.isConfigured();
}

/**
 * Ensure valid token, refreshing if needed
 * @returns {Promise<boolean>} Whether a valid token is available
 */
async function ensureValidToken() {
    return RefreshService.ensureValidToken();
}

// ==========================================
// Public API - Maintains backward compatibility
// ==========================================

export const Spotify = {
    // Configuration
    isConfigured: OAuthManager.isConfigured,

    // OAuth
    initiateLogin: OAuthManager.initiateLogin,
    handleCallback,
    hasValidToken,
    getAccessToken,
    clearTokens,
    refreshToken,
    ensureValidToken,

    // API
    getRecentlyPlayed: ApiClient.getRecentlyPlayed,
    getTopArtists: ApiClient.getTopArtists,
    getTopTracks: ApiClient.getTopTracks,
    getCurrentProfile: ApiClient.getCurrentProfile,

    // Quick Snapshot
    fetchSnapshotData,
    transformForAnalysis,

    // Background Refresh
    startBackgroundRefresh: RefreshService.startBackgroundRefresh,
    stopBackgroundRefresh: RefreshService.stopBackgroundRefresh,
    isBackgroundRefreshActive: RefreshService.isBackgroundRefreshActive,
    checkTokenRefreshNeeded: RefreshService.checkTokenRefreshNeeded
};

logger.debug('Spotify module facade loaded');