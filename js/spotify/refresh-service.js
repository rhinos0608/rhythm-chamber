/**
 * Spotify Refresh Service
 * Handles background token refresh logic with multi-tab synchronization
 */

import { ConfigLoader } from '../services/config-loader.js';
import { createLogger } from '../utils/logger.js';
import { TokenStore } from './token-store.js';
import { Crypto } from '../security/crypto.js';

const logger = createLogger('Spotify:RefreshService');

// Token endpoints
const ENDPOINTS = {
    token: 'https://accounts.spotify.com/api/token'
};

/**
 * Refresh Service class
 * Manages token refresh with multi-tab synchronization
 */
export class RefreshService {
    static #tokenRefreshInterval = null;
    static #isProcessingOperation = false;

    /**
     * HNW Fix: Refresh access token using refresh token
     * Prevents cliff-edge session expiry
     *
     * SECURITY: Uses navigator.locks to prevent multi-tab race condition
     * If multiple tabs detect an expired token simultaneously, only one will refresh
     * This prevents Spotify's Refresh Token Rotation from invalidating all tokens
     *
     * @returns {Promise<boolean>} Success status
     */
    static async refreshToken() {
        // Use Web Locks API to prevent multi-tab race condition (Chrome/Firefox/Edge)
        if (typeof navigator.locks !== 'undefined') {
            try {
                return await navigator.locks.request(
                    'spotify_token_refresh',
                    { mode: 'exclusive', ifAvailable: false },
                    async (lock) => {
                        if (lock) {
                            // Double-check if another tab already refreshed
                            if (await TokenStore.hasValidToken()) {
                                logger.debug('Token already refreshed by another tab');
                                return true;
                            }
                            return await this.#performTokenRefresh();
                        }
                        // Lock not acquired (should not happen with ifAvailable: false)
                        logger.warn('Failed to acquire refresh lock');
                        return false;
                    }
                );
            } catch (lockError) {
                logger.warn('Web Locks API error, using fallback:', lockError.message);
                return await this.#performTokenRefreshWithFallbackLock();
            }
        }

        // Fallback for Safari < 15 and older browsers: localStorage-based lock
        return await this.#performTokenRefreshWithFallbackLock();
    }

    /**
     * localStorage-based mutex for browsers without Web Locks API
     * Uses a polling loop with timeout to prevent deadlocks and improve reliability
     *
     * MEDIUM FIX #14: Use UUID as lock value to verify ownership
     * This prevents race condition where multiple tabs could acquire the lock simultaneously
     */
    static async #performTokenRefreshWithFallbackLock() {
        const LOCK_KEY = 'spotify_refresh_lock';
        const LOCK_TIMEOUT_MS = 10000; // 10 second timeout
        const POLL_INTERVAL_MS = 100; // Check every 100ms
        const MAX_WAIT_TIME_MS = 5000; // Maximum wait time for another tab

        // Generate a unique identifier for this lock attempt
        // Using crypto.getRandomValues for better uniqueness than Math.random()
        const lockId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        const startTime = Date.now();

        // Polling loop to wait for lock release
        while (Date.now() - startTime < MAX_WAIT_TIME_MS) {
            const existingLock = localStorage.getItem(LOCK_KEY);

            if (!existingLock) {
                // No lock exists, try to acquire
                break;
            }

            // Parse existing lock: format is "timestamp:uuid"
            const [lockTimeStr, existingLockId] = existingLock.split(':');
            const lockTime = parseInt(lockTimeStr, 10);
            const now = Date.now();

            // Check if lock is stale (older than timeout)
            if (now - lockTime >= LOCK_TIMEOUT_MS) {
                logger.warn('Stale lock detected, clearing...');
                localStorage.removeItem(LOCK_KEY);
                break;
            }

            // Lock is active, wait and poll again
            logger.debug('Waiting for another tab to complete refresh...');
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        // Check if another tab succeeded while we were waiting
        if (await TokenStore.hasValidToken()) {
            logger.debug('Token refreshed by another tab');
            return true;
        }

        // Try to acquire lock with our unique ID
        const now = Date.now();
        localStorage.setItem(LOCK_KEY, `${now}:${lockId}`);

        try {
            // Verify we still own the lock (another tab may have stolen it)
            const currentLock = localStorage.getItem(LOCK_KEY);
            if (!currentLock || !currentLock.endsWith(lockId)) {
                logger.debug('Lock stolen by another tab, deferring refresh');
                // Wait a bit and check if token is now valid
                await new Promise(resolve => setTimeout(resolve, 500));
                return await TokenStore.hasValidToken();
            }

            // Double-check token validity (another tab may have just refreshed)
            if (await TokenStore.hasValidToken()) {
                logger.debug('Token already valid');
                return true;
            }

            return await this.#performTokenRefresh();
        } finally {
            // Only release lock if we still own it
            const currentLock = localStorage.getItem(LOCK_KEY);
            if (currentLock && currentLock.endsWith(lockId)) {
                localStorage.removeItem(LOCK_KEY);
            }
        }
    }

    /**
     * Actual token refresh implementation (extracted for mutex wrappers)
     */
    static async #performTokenRefresh() {
        const refreshTokenValue = await TokenStore.loadRefreshToken();

        if (!refreshTokenValue) {
            logger.warn('No refresh token available');
            return false;
        }

        const clientId = ConfigLoader.get('spotify.clientId');
        if (!clientId) {
            logger.warn('Cannot refresh - client ID not configured');
            return false;
        }

        try {
            logger.debug('Attempting token refresh...');

            const response = await fetch(ENDPOINTS.token, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: clientId,
                    grant_type: 'refresh_token',
                    refresh_token: refreshTokenValue
                })
            });

            if (!response.ok) {
                logger.error('Token refresh failed:', response.status);

                // SECURITY: Invalidate all sessions when refresh fails
                // This prevents stale sessions from persisting after auth issues
                if (Crypto.invalidateSessions) {
                    logger.warn('Invalidating sessions due to refresh failure');
                    Crypto.invalidateSessions();
                }

                return false;
            }

            const data = await response.json();

            // SECURITY: Persist tokens BEFORE creating binding
            // This ensures atomicity - if persist fails, we don't create a stale binding
            // If binding fails, we haven't yet persisted the new token
            await TokenStore.persistTokens(data);

            logger.info('Token refreshed successfully');
            return true;
        } catch (error) {
            logger.error('Token refresh error:', error);

            // SECURITY: Invalidate sessions on network/auth errors
            if (Crypto.invalidateSessions) {
                Crypto.invalidateSessions();
            }

            return false;
        }
    }

    /**
     * HNW Fix: Ensure valid token, refreshing if needed
     * @returns {Promise<boolean>} Whether a valid token is available
     */
    static async ensureValidToken() {
        if (await TokenStore.hasValidToken()) {
            return true;
        }

        // Token expired or missing - try to refresh
        if (await TokenStore.canRefreshToken()) {
            return await this.refreshToken();
        }

        return false;
    }

    /**
     * Start background token refresh monitoring
     * Call this before starting long operations
     */
    static startBackgroundRefresh() {
        if (this.#tokenRefreshInterval) {
            logger.debug('Background refresh already running');
            return;
        }

        this.#isProcessingOperation = true;

        // Check every 5 minutes
        this.#tokenRefreshInterval = setInterval(async () => {
            const expiry = await TokenStore.getTokenExpiry();
            if (!expiry) return;

            // Simplified refresh check: refresh if expiring within 10 minutes
            const timeUntilExpiry = expiry - Date.now();
            if (timeUntilExpiry < 10 * 60 * 1000 && timeUntilExpiry > 0) {
                logger.debug('Proactive token refresh...');
                try {
                    await this.refreshToken();
                } catch (error) {
                    logger.error('Background refresh failed:', error);
                }
            }
        }, 5 * 60 * 1000); // 5 minutes

        logger.debug('Background token refresh started');
    }

    /**
     * Stop background token refresh
     * Call this when long operations complete
     */
    static stopBackgroundRefresh() {
        if (this.#tokenRefreshInterval) {
            clearInterval(this.#tokenRefreshInterval);
            this.#tokenRefreshInterval = null;
            this.#isProcessingOperation = false;
            logger.debug('Background token refresh stopped');
        }
    }

    /**
     * Check if background refresh is running
     * @returns {boolean}
     */
    static isBackgroundRefreshActive() {
        return this.#tokenRefreshInterval !== null;
    }

    /**
     * Check if token refresh is needed
     * Used by SpotifyController for background token monitoring
     * @returns {Promise<boolean>} True if token should be refreshed
     */
    static async checkTokenRefreshNeeded() {
        const expiry = await TokenStore.getTokenExpiry();
        if (!expiry) return false;

        const now = Date.now();
        const timeUntilExpiry = expiry - now;

        // Use 10 minute buffer for background refresh (slightly more aggressive than Security module)
        const buffer = 10 * 60 * 1000;

        // Refresh if expiring within buffer or already expired
        return timeUntilExpiry <= buffer;
    }

    /**
     * Register visibility change listener for token staleness check
     * Called once during module initialization
     */
    static registerVisibilityCheck() {
        if (typeof document === 'undefined') return;

        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible') {
                await this.checkTokenStalenessOnVisible();
            }
        });

        logger.debug('Visibility-based token staleness check registered');
    }

    /**
     * Check token staleness when tab becomes visible
     * Proactively refreshes if token is close to expiry
     * This prevents API calls from failing after the user returns to a dormant tab
     */
    static async checkTokenStalenessOnVisible() {
        const expiry = await TokenStore.getTokenExpiry();
        if (!expiry) return;

        const timeUntilExpiry = expiry - Date.now();

        // Proactively refresh if expiring within 5 minutes
        if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > 0) {
            logger.debug('Tab visible - proactive token refresh (expiring soon)');
            try {
                await this.refreshToken();
            } catch (error) {
                logger.error('Visibility-triggered refresh failed:', error);
            }
        } else if (timeUntilExpiry <= 0) {
            // Token already expired - try to refresh
            logger.debug('Tab visible - token expired, attempting refresh');
            try {
                await this.refreshToken();
            } catch (error) {
                logger.error('Visibility-triggered expired token refresh failed:', error);
            }
        }
    }
}

// Register visibility check on module load
RefreshService.registerVisibilityCheck();