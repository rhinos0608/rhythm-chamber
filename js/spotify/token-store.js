/**
 * Spotify Token Store
 * Handles token persistence and retrieval with secure storage
 */

import { SecureTokenStore } from '../security/secure-token-store.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Spotify:TokenStore');

// Storage keys
const STORAGE_KEYS = {
    ACCESS_TOKEN: 'spotify_access_token',
    REFRESH_TOKEN: 'spotify_refresh_token',
    TOKEN_EXPIRY: 'spotify_token_expiry'
};

/**
 * Token Store class
 * Manages Spotify token persistence with in-memory caching
 */
export class TokenStore {
    // In-memory token cache to avoid frequent secure store reads
    static #accessTokenCache = null;
    static #accessTokenExpiry = null;
    static #refreshTokenCache = null;

    /**
     * Persist tokens to the secure token vault with fallback to localStorage for legacy sessions.
     * @param {object} data - Token response payload
     * @param {boolean} clearVerifier - Whether to clear the PKCE verifier
     */
    static async persistTokens(data, clearVerifier = false) {
        const expiresInMs = data.expires_in ? data.expires_in * 1000 : null;

        this.#accessTokenCache = data.access_token;

        // HIGH FIX #9: Use JWT exp claim for more reliable expiry time
        // This mitigates clock skew issues when system clock changes
        // The JWT exp claim is set by Spotify and represents the absolute expiry time
        let calculatedExpiry = expiresInMs ? Date.now() + expiresInMs : null;

        // Try to extract exp claim from JWT for more reliable expiry
        if (data.access_token && typeof data.access_token === 'string') {
            try {
                const parts = data.access_token.split('.');
                if (parts.length === 3) {
                    // JWT format: header.payload.signature (payload is base64url encoded)
                    // Convert base64url to standard base64 by replacing - with + and _ with /, then add padding
                    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                    // Add padding if needed
                    const padding = 4 - (base64.length % 4);
                    if (padding !== 4) {
                        base64 += '='.repeat(padding);
                    }
                    const payload = JSON.parse(atob(base64));
                    if (payload.exp && typeof payload.exp === 'number') {
                        // Use JWT exp as source of truth (in seconds since epoch)
                        calculatedExpiry = payload.exp * 1000;
                        logger.debug('Using JWT exp claim for token expiry:', new Date(calculatedExpiry).toISOString());
                    }
                }
            } catch (e) {
                // JWT parsing failed, fall back to calculated expiry
                logger.debug('Could not parse JWT exp claim, using calculated expiry:', e.message);
            }
        }

        this.#accessTokenExpiry = calculatedExpiry;

        if (data.refresh_token) {
            this.#refreshTokenCache = data.refresh_token;
        }

        if (!SecureTokenStore?.isAvailable?.()) {
            throw new Error('Secure token vault unavailable. Use HTTPS/localhost to continue.');
        }

        const storedAccess = await SecureTokenStore.store('spotify_access_token', data.access_token, {
            expiresIn: expiresInMs,
            metadata: { source: 'spotify_oauth' }
        });
        if (!storedAccess) {
            throw new Error('Failed to store Spotify access token securely.');
        }

        if (data.refresh_token) {
            const storedRefresh = await SecureTokenStore.store('spotify_refresh_token', data.refresh_token, {
                metadata: { source: 'spotify_oauth' }
            });
            if (!storedRefresh) {
                throw new Error('Failed to store Spotify refresh token securely.');
            }
        }

        logger.info('Tokens persisted successfully');
    }

    /**
     * Load access token (and expiry) from secure storage.
     * @returns {Promise<object>} Object with token and expiry
     */
    static async loadAccessToken() {
        if (this.#accessTokenCache && this.#accessTokenExpiry && Date.now() < this.#accessTokenExpiry) {
            return { token: this.#accessTokenCache, expiry: this.#accessTokenExpiry };
        }

        if (!SecureTokenStore?.retrieveWithOptions) {
            logger.warn('Secure token store unavailable for retrieval');
            return { token: null, expiry: null };
        }

        try {
            const stored = await SecureTokenStore.retrieveWithOptions('spotify_access_token');
            if (stored?.value) {
                this.#accessTokenCache = stored.value;
                this.#accessTokenExpiry = stored.expiresIn ? Date.now() + stored.expiresIn : null;
                return { token: this.#accessTokenCache, expiry: this.#accessTokenExpiry };
            }
        } catch (e) {
            logger.warn('Secure token retrieval failed:', e.message);
        }

        return { token: null, expiry: null };
    }

    /**
     * Load refresh token from secure storage.
     * @returns {Promise<string>} Refresh token or null
     */
    static async loadRefreshToken() {
        if (this.#refreshTokenCache) return this.#refreshTokenCache;

        if (!SecureTokenStore?.retrieve) {
            logger.warn('Secure token store unavailable for refresh token retrieval');
            return null;
        }

        try {
            const stored = await SecureTokenStore.retrieve('spotify_refresh_token');
            if (stored) {
                this.#refreshTokenCache = stored;
                return this.#refreshTokenCache;
            }
        } catch (e) {
            logger.warn('Secure refresh token retrieval failed:', e.message);
        }

        return null;
    }

    /**
     * Check if we have a valid access token
     * @returns {Promise<boolean>}
     */
    static async hasValidToken() {
        const { token, expiry } = await this.loadAccessToken();
        if (!token || !expiry) return false;
        return Date.now() < (expiry - 300000); // 5 minute buffer
    }

    /**
     * Get the current access token
     * @returns {Promise<string>} Access token or null
     */
    static async getAccessToken() {
        const { token } = await this.loadAccessToken();
        return token;
    }

    /**
     * Check if token can be refreshed
     * @returns {Promise<boolean>}
     */
    static async canRefreshToken() {
        return !!(await this.loadRefreshToken());
    }

    /**
     * Clear all tokens (logout)
     */
    static async clearTokens() {
        this.#accessTokenCache = null;
        this.#accessTokenExpiry = null;
        this.#refreshTokenCache = null;

        // Clear from both localStorage and sessionStorage
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
            try {
                sessionStorage.removeItem(key);
            } catch (e) {
                // sessionStorage may be unavailable
            }
        });

        if (SecureTokenStore?.invalidate) {
            try {
                await SecureTokenStore.invalidate('spotify_access_token');
                await SecureTokenStore.invalidate('spotify_refresh_token');
            } catch (e) {
                logger.warn('Secure token invalidation failed:', e.message);
            }
        }

        logger.info('All tokens cleared');
    }

    /**
     * Get token expiry time
     * @returns {Promise<number>} Expiry timestamp or null
     */
    static async getTokenExpiry() {
        const { expiry } = await this.loadAccessToken();
        return expiry;
    }

    /**
     * Ensure valid token, refreshing if needed
     * @returns {Promise<boolean>} Whether a valid token is available
     */
    static async ensureValidToken() {
        if (await this.hasValidToken()) {
            return true;
        }

        // Token expired or missing - will need refresh
        return false;
    }
}