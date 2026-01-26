/**
 * Spotify API Client
 * Handles Spotify Web API calls with rate limiting and retry logic
 */

import { ConfigLoader } from '../services/config-loader.js';
import { createLogger } from '../utils/logger.js';
import { TokenStore } from './token-store.js';
import { RefreshService } from './refresh-service.js';

const logger = createLogger('Spotify:ApiClient');

// API endpoints
const ENDPOINTS = {
    recentlyPlayed: 'https://api.spotify.com/v1/me/player/recently-played',
    topArtists: 'https://api.spotify.com/v1/me/top/artists',
    topTracks: 'https://api.spotify.com/v1/me/top/tracks',
    me: 'https://api.spotify.com/v1/me'
};

/**
 * API Client class
 * Handles authenticated requests to Spotify Web API
 */
export class ApiClient {
    /**
     * Make an authenticated API request
     * HNW Fix: Now auto-refreshes token on 401 before failing
     * @param {string} url - API endpoint
     * @param {object} options - Fetch options
     * @returns {Promise<object>} API response
     */
    static async apiRequest(url, options = {}) {
        // Ensure we have a valid token first
        if (!await TokenStore.hasValidToken()) {
            // Try to refresh if possible
            if (await TokenStore.canRefreshToken()) {
                const refreshed = await RefreshService.refreshToken();
                if (!refreshed) {
                    throw new Error('No valid access token. Please connect to Spotify again.');
                }
            } else {
                throw new Error('No valid access token. Please connect to Spotify again.');
            }
        }

        const token = await TokenStore.getAccessToken();

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                ...options.headers
            }
        });

        if (response.status === 401) {
            // Token may have just expired - try one refresh
            logger.debug('Got 401, attempting token refresh...');
            const refreshed = await RefreshService.refreshToken();

            if (refreshed) {
                // Retry with new token
                const newToken = await TokenStore.getAccessToken();
                const retryResponse = await fetch(url, {
                    ...options,
                    headers: {
                        'Authorization': `Bearer ${newToken}`,
                        ...options.headers
                    }
                });

                if (retryResponse.ok) {
                    return retryResponse.json();
                }
            }

            // Refresh failed or retry failed - clear tokens and fail
            await TokenStore.clearTokens();
            throw new Error('Session expired. Please reconnect to Spotify.');
        }

        if (response.status === 429) {
            // Rate limit exceeded - parse Retry-After header
            const retryAfter = response.headers.get('Retry-After');
            let waitSeconds = 60; // Default to 60 seconds

            if (retryAfter) {
                const parsed = parseInt(retryAfter, 10);
                if (!isNaN(parsed)) {
                    waitSeconds = parsed;
                }
            }

            logger.warn(`Rate limited (429). Waiting ${waitSeconds} seconds before retry...`);

            // Wait for the specified duration
            await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));

            // Retry the request after backoff
            logger.debug('Retrying request after rate limit backoff...');
            const token = await TokenStore.getAccessToken(); // Get current token again
            const retryResponse = await fetch(url, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...options.headers
                }
            });

            if (!retryResponse.ok) {
                const error = await retryResponse.json().catch(() => ({}));
                throw new Error(error.error?.message || `API request failed after retry: ${retryResponse.status}`);
            }

            return retryResponse.json();
        }

        if (!response.ok) {
            const error = await response.json().catch((err) => {
                console.warn('[Spotify] Failed to parse error response:', err);
                return {};
            });
            throw new Error(error.error?.message || `API request failed: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Get user's recently played tracks
     * @param {number} limit - Max tracks to fetch (1-50)
     * @returns {Promise<object>} Recently played data
     */
    static async getRecentlyPlayed(limit = 50) {
        const url = `${ENDPOINTS.recentlyPlayed}?limit=${Math.min(limit, 50)}`;
        return this.apiRequest(url);
    }

    /**
     * Get user's top artists
     * @param {string} timeRange - short_term, medium_term, or long_term
     * @param {number} limit - Max artists to fetch (1-50)
     * @returns {Promise<object>} Top artists data
     */
    static async getTopArtists(timeRange = 'medium_term', limit = 50) {
        const url = `${ENDPOINTS.topArtists}?time_range=${timeRange}&limit=${Math.min(limit, 50)}`;
        return this.apiRequest(url);
    }

    /**
     * Get user's top tracks
     * @param {string} timeRange - short_term, medium_term, or long_term
     * @param {number} limit - Max tracks to fetch (1-50)
     * @returns {Promise<object>} Top tracks data
     */
    static async getTopTracks(timeRange = 'medium_term', limit = 50) {
        const url = `${ENDPOINTS.topTracks}?time_range=${timeRange}&limit=${Math.min(limit, 50)}`;
        return this.apiRequest(url);
    }

    /**
     * Get current user's profile
     * @returns {Promise<object>} User profile data
     */
    static async getCurrentProfile() {
        return this.apiRequest(ENDPOINTS.me);
    }

    /**
     * Check if API client has valid configuration
     * @returns {Promise<boolean>}
     */
    static async isReady() {
        return await TokenStore.hasValidToken() || await TokenStore.canRefreshToken();
    }
}