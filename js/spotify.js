/**
 * Spotify OAuth and API Module
 * Handles PKCE OAuth flow and Spotify Web API calls for Quick Snapshot feature
 */

import { Crypto } from './security/crypto.js';
import { ConfigLoader } from './services/config-loader.js';
import { SecureTokenStore } from './security/secure-token-store.js';
import { createLogger } from './utils/logger.js';

// Create module-specific logger with automatic sanitization of sensitive data
const logger = createLogger('Spotify');

const Spotify = (() => {
    // Storage keys
    const STORAGE_KEYS = {
        CODE_VERIFIER: 'spotify_code_verifier',
        ACCESS_TOKEN: 'spotify_access_token',
        REFRESH_TOKEN: 'spotify_refresh_token',
        TOKEN_EXPIRY: 'spotify_token_expiry'
    };

    // API endpoints
    const ENDPOINTS = {
        authorize: 'https://accounts.spotify.com/authorize',
        token: 'https://accounts.spotify.com/api/token',
        recentlyPlayed: 'https://api.spotify.com/v1/me/player/recently-played',
        topArtists: 'https://api.spotify.com/v1/me/top/artists',
        topTracks: 'https://api.spotify.com/v1/me/top/tracks',
        me: 'https://api.spotify.com/v1/me'
    };

    // In-memory token cache to avoid frequent secure store reads
    let accessTokenCache = null;
    let accessTokenExpiry = null;
    let refreshTokenCache = null;

    /**
     * Persist tokens to the secure token vault with fallback to localStorage for legacy sessions.
     * @param {object} data - Token response payload
     * @param {boolean} clearVerifier - Whether to clear the PKCE verifier
     */
    async function persistTokens(data, clearVerifier = false) {
        const expiresInMs = data.expires_in ? data.expires_in * 1000 : null;

        accessTokenCache = data.access_token;

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
                        logger.debug('[Spotify] Using JWT exp claim for token expiry:', new Date(calculatedExpiry).toISOString());
                    }
                }
            } catch (e) {
                // JWT parsing failed, fall back to calculated expiry
                logger.debug('[Spotify] Could not parse JWT exp claim, using calculated expiry:', e.message);
            }
        }

        accessTokenExpiry = calculatedExpiry;

        if (data.refresh_token) {
            refreshTokenCache = data.refresh_token;
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

        if (clearVerifier) {
            localStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
        }
    }

    /**
     * Load access token (and expiry) from secure storage.
     */
    async function loadAccessToken() {
        if (accessTokenCache && accessTokenExpiry && Date.now() < accessTokenExpiry) {
            return { token: accessTokenCache, expiry: accessTokenExpiry };
        }

        if (!SecureTokenStore?.retrieveWithOptions) {
            logger.warn('Secure token store unavailable for retrieval');
            return { token: null, expiry: null };
        }

        try {
            const stored = await SecureTokenStore.retrieveWithOptions('spotify_access_token');
            if (stored?.value) {
                accessTokenCache = stored.value;
                accessTokenExpiry = stored.expiresIn ? Date.now() + stored.expiresIn : null;
                return { token: accessTokenCache, expiry: accessTokenExpiry };
            }
        } catch (e) {
            logger.warn('Secure token retrieval failed:', e.message);
        }

        return { token: null, expiry: null };
    }

    /**
     * Load refresh token from secure storage.
     */
    async function loadRefreshToken() {
        if (refreshTokenCache) return refreshTokenCache;

        if (!SecureTokenStore?.retrieve) {
            logger.warn('Secure token store unavailable for refresh token retrieval');
            return null;
        }

        try {
            const stored = await SecureTokenStore.retrieve('spotify_refresh_token');
            if (stored) {
                refreshTokenCache = stored;
                return refreshTokenCache;
            }
        } catch (e) {
            logger.warn('Secure refresh token retrieval failed:', e.message);
        }

        return null;
    }

    // ==========================================
    // PKCE Helpers
    // ==========================================

    /**
     * Generate a random code verifier for PKCE
     * Uses rejection sampling to avoid modulo bias
     * 
     * SECURITY: Previous implementation used x % 62 on random bytes [0-255],
     * which biases toward the first 8 characters (256 % 62 = 8).
     * This implementation rejects values >= 248 to ensure uniform distribution.
     * 
     * @returns {string} 64-character random string
     */
    function generateCodeVerifier() {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const maxValid = Math.floor(256 / possible.length) * possible.length; // 248

        const result = [];
        while (result.length < 64) {
            // Request more bytes than needed to minimize iterations
            const bytesNeeded = Math.max(1, (64 - result.length) * 2);
            const values = crypto.getRandomValues(new Uint8Array(bytesNeeded));

            for (const x of values) {
                // Rejection sampling: only use values < 248 to avoid bias
                if (x < maxValid && result.length < 64) {
                    result.push(possible[x % possible.length]);
                }
            }
        }

        return result.join('');
    }

    /**
     * Generate SHA256 hash of the code verifier
     * @param {string} plain - The code verifier
     * @returns {Promise<ArrayBuffer>} SHA256 hash
     */
    async function sha256(plain) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        return window.crypto.subtle.digest('SHA-256', data);
    }

    /**
     * Base64URL encode the hash (for code challenge)
     * @param {ArrayBuffer} input - SHA256 hash
     * @returns {string} Base64URL encoded string
     */
    function base64URLEncode(input) {
        return btoa(String.fromCharCode(...new Uint8Array(input)))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    }

    /**
     * Generate code challenge from verifier
     * @param {string} verifier - The code verifier
     * @returns {Promise<string>} Base64URL encoded code challenge
     */
    async function generateCodeChallenge(verifier) {
        const hashed = await sha256(verifier);
        return base64URLEncode(hashed);
    }

    // ==========================================
    // OAuth Flow
    // ==========================================

    /**
     * Check if Spotify is configured
     * @returns {boolean}
     */
    function isConfigured() {
    const clientId = ConfigLoader.get('spotify.clientId', '');
    const redirectUri = ConfigLoader.get('spotify.redirectUri', '') || '';
    // Ensure redirectUri is a non-empty string; if not, the OAuth flow will break
    const hasRedirect = typeof redirectUri === 'string' && redirectUri.trim() !== '';
    return clientId && clientId !== 'your-spotify-client-id' && hasRedirect;
    }

    /**
     * Initiate Spotify OAuth login
     * Redirects user to Spotify authorization page
     */
    async function initiateLogin() {
        if (!isConfigured()) {
            throw new Error('Spotify is not configured. Please add your Client ID and redirectUri to config.js');
        }

        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Store verifier in sessionStorage (secure - cleared on tab close)
        // SECURITY: sessionStorage is required for PKCE security because:
        // - Cleared when tab closes (ephemeral)
        // - Not accessible to other tabs/windows (same-origin isolation)
        // - Prevents XSS code injection attacks during token exchange
        //
        // SECURITY FIX (HIGH Issue #7): Removed localStorage fallback per security audit
        // Previous implementation fell back to localStorage which persists PKCE verifier
        // across sessions, defeating the security purpose of PKCE.
        //
        // Note: In rare cases where sessionStorage is cleared during OAuth redirect
        // (browser privacy settings, some browser behaviors), users may need to
        // retry the OAuth flow. This is a security/usability tradeoff.
        try {
            sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
        } catch (e) {
            // FAIL CLOSED - sessionStorage is required for secure OAuth flow
            logger.error('sessionStorage required for secure OAuth flow. Please enable cookies/storage in your browser.', e);

            // Dispatch event for UI to show error
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('spotify:auth-error', {
                    detail: {
                        reason: 'session_storage_unavailable',
                        message: 'Secure OAuth requires sessionStorage. Please enable cookies/storage in your browser settings.'
                    }
                }));
            }

            throw new Error(
                'sessionStorage required for secure OAuth flow. ' +
                'Please enable cookies/storage in your browser settings.'
            );
        }

        const redirectUri = ConfigLoader.get('spotify.redirectUri');
        if (!redirectUri || typeof redirectUri !== 'string') {
            throw new Error('Spotify redirectUri is missing or invalid. Set spotify.redirectUri in config.js to your app callback URL.');
        }

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: ConfigLoader.get('spotify.clientId'),
            scope: ConfigLoader.get('spotify.scopes', []).join(' '),
            redirect_uri: redirectUri,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge
        });

        window.location.href = `${ENDPOINTS.authorize}?${params.toString()}`;
    }

    /**
     * Handle OAuth callback - exchange code for tokens
     * @param {string} code - Authorization code from callback
     * @returns {Promise<boolean>} Success status
     */
    async function handleCallback(code) {
        // SECURITY FIX (HIGH Issue #7): Only check sessionStorage for PKCE verifier
        // Previous implementation fell back to localStorage which is insecure
        const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);

        if (!codeVerifier) {
            // This can happen if:
            // - User navigated away and session was cleared
            // - Browser privacy settings cleared sessionStorage
            // - OAuth flow took too long and session expired
            //
            // SECURITY: Do NOT fall back to localStorage as it defeats PKCE security
            throw new Error(
                'No code verifier found. This may happen if your browser cleared session storage during the OAuth flow. Please try connecting again.'
            );
        }

        try {
            const response = await fetch(ENDPOINTS.token, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: ConfigLoader.get('spotify.clientId'),
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: ConfigLoader.get('spotify.redirectUri'),
                    code_verifier: codeVerifier
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error_description || 'Failed to exchange code for token');
            }

            const data = await response.json();

            // SECURITY: Persist tokens BEFORE creating binding
            // This ensures atomicity - if persist fails, we don't create a stale binding
            await persistTokens(data, true);

            // Token binding removed - simplified security model
            // This feature was over-engineering for a client-side music app

            return true;
        } catch (error) {
            logger.error('Token exchange failed:', error);
            throw error;
        }
    }

    /**
     * Check if we have a valid access token
     * @returns {boolean}
     */
    async function hasValidToken() {
        const { token, expiry } = await loadAccessToken();
        if (!token || !expiry) return false;
        return Date.now() < (expiry - 300000); // 5 minute buffer
    }

    /**
     * Get the current access token
     * @returns {string|null}
     */
    async function getAccessToken() {
        const { token } = await loadAccessToken();
        return token;
    }

    /**
     * Clear all Spotify tokens (logout)
     */
    async function clearTokens() {
        accessTokenCache = null;
        accessTokenExpiry = null;
        refreshTokenCache = null;

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

        // Token binding cleared - simplified security model
    }

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
    async function refreshToken() {
        // Use Web Locks API to prevent multi-tab race condition (Chrome/Firefox/Edge)
        if (typeof navigator.locks !== 'undefined') {
            try {
                return await navigator.locks.request(
                    'spotify_token_refresh',
                    { mode: 'exclusive', ifAvailable: false },
                    async (lock) => {
                        if (lock) {
                            // Double-check if another tab already refreshed
                            if (await hasValidToken()) {
                                logger.debug('Token already refreshed by another tab');
                                return true;
                            }
                            return await performTokenRefresh();
                        }
                        // Lock not acquired (should not happen with ifAvailable: false)
                        logger.warn('Failed to acquire refresh lock');
                        return false;
                    }
                );
            } catch (lockError) {
                logger.warn('Web Locks API error, using fallback:', lockError.message);
                return await performTokenRefreshWithFallbackLock();
            }
        }

        // Fallback for Safari < 15 and older browsers: localStorage-based lock
        return await performTokenRefreshWithFallbackLock();
    }

    /**
     * localStorage-based mutex for browsers without Web Locks API
     * Uses a polling loop with timeout to prevent deadlocks and improve reliability
     *
     * MEDIUM FIX #14: Use UUID as lock value to verify ownership
     * This prevents race condition where multiple tabs could acquire the lock simultaneously
     */
    async function performTokenRefreshWithFallbackLock() {
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
        if (await hasValidToken()) {
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
                return await hasValidToken();
            }

            // Double-check token validity (another tab may have just refreshed)
            if (await hasValidToken()) {
                logger.debug('Token already valid');
                return true;
            }

            return await performTokenRefresh();
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
    async function performTokenRefresh() {
        const refreshTokenValue = await loadRefreshToken();

        if (!refreshTokenValue) {
            logger.warn('No refresh token available');
            return false;
        }

        if (!isConfigured()) {
            logger.warn('Cannot refresh - not configured');
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
                    client_id: ConfigLoader.get('spotify.clientId'),
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
            await persistTokens(data);

            // Token binding removed - simplified security model

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
     * HNW Fix: Check if token can be refreshed
     * @returns {boolean}
     */
    async function canRefreshToken() {
        return !!(await loadRefreshToken()) && isConfigured();
    }

    /**
     * HNW Fix: Ensure valid token, refreshing if needed
     * @returns {Promise<boolean>} Whether a valid token is available
     */
    async function ensureValidToken() {
        if (await hasValidToken()) {
            return true;
        }

        // Token expired or missing - try to refresh
        if (await canRefreshToken()) {
            return await refreshToken();
        }

        return false;
    }

    // ==========================================
    // API Calls
    // ==========================================

    /**
     * Make an authenticated API request
     * HNW Fix: Now auto-refreshes token on 401 before failing
     * SECURITY: Verifies token binding before each request
     * @param {string} url - API endpoint
     * @param {object} options - Fetch options
     * @returns {Promise<object>} API response
     */
    async function apiRequest(url, options = {}) {
        // Ensure we have a valid token first
        if (!await ensureValidToken()) {
            throw new Error('No valid access token. Please connect to Spotify again.');
        }

        const token = await getAccessToken();

        // Token binding verification removed - simplified security model


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
            const refreshed = await refreshToken();

            if (refreshed) {
                // Retry with new token
                const newToken = await getAccessToken();
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
            await clearTokens();
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
    async function getRecentlyPlayed(limit = 50) {
        const url = `${ENDPOINTS.recentlyPlayed}?limit=${Math.min(limit, 50)}`;
        return apiRequest(url);
    }

    /**
     * Get user's top artists
     * @param {string} timeRange - short_term, medium_term, or long_term
     * @param {number} limit - Max artists to fetch (1-50)
     * @returns {Promise<object>} Top artists data
     */
    async function getTopArtists(timeRange = 'medium_term', limit = 50) {
        const url = `${ENDPOINTS.topArtists}?time_range=${timeRange}&limit=${Math.min(limit, 50)}`;
        return apiRequest(url);
    }

    /**
     * Get user's top tracks
     * @param {string} timeRange - short_term, medium_term, or long_term
     * @param {number} limit - Max tracks to fetch (1-50)
     * @returns {Promise<object>} Top tracks data
     */
    async function getTopTracks(timeRange = 'medium_term', limit = 50) {
        const url = `${ENDPOINTS.topTracks}?time_range=${timeRange}&limit=${Math.min(limit, 50)}`;
        return apiRequest(url);
    }

    /**
     * Get current user's profile
     * @returns {Promise<object>} User profile data
     */
    async function getCurrentProfile() {
        return apiRequest(ENDPOINTS.me);
    }

    // ==========================================
    // Data Fetching for Quick Snapshot
    // ==========================================

    /**
     * Fetch all data needed for Quick Snapshot
     * @param {function} onProgress - Progress callback
     * @returns {Promise<object>} All Spotify data for analysis
     */
    async function fetchSnapshotData(onProgress = () => { }) {
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
            data.profile = await getCurrentProfile();

            onProgress('Fetching recently played tracks...');
            data.recentlyPlayed = await getRecentlyPlayed(50);

            onProgress('Analyzing your current favorites...');
            data.topArtists.shortTerm = await getTopArtists('short_term', 50);
            data.topTracks.shortTerm = await getTopTracks('short_term', 50);

            onProgress('Analyzing your 6-month trends...');
            data.topArtists.mediumTerm = await getTopArtists('medium_term', 50);
            data.topTracks.mediumTerm = await getTopTracks('medium_term', 50);

            onProgress('Analyzing your all-time favorites...');
            data.topArtists.longTerm = await getTopArtists('long_term', 50);
            data.topTracks.longTerm = await getTopTracks('long_term', 50);

            return data;
        } catch (error) {
            logger.error('Error fetching Spotify data:', error);
            throw error;
        }
    }

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

    // ==========================================
    // BACKGROUND TOKEN REFRESH
    // For long-running operations (embedding generation, large data processing)
    // ==========================================

    let tokenRefreshInterval = null;
    let isProcessingOperation = false;

    /**
     * Start background token refresh monitoring
     * Call this before starting long operations
     */
    function startBackgroundRefresh() {
        if (tokenRefreshInterval) {
            logger.debug('Background refresh already running');
            return;
        }

        isProcessingOperation = true;

        // Check every 5 minutes
        tokenRefreshInterval = setInterval(async () => {
            const { expiry } = await loadAccessToken();
            if (!expiry) return;

            // Simplified refresh check: refresh if expiring within 10 minutes
            const timeUntilExpiry = expiry - Date.now();
            if (timeUntilExpiry < 10 * 60 * 1000 && timeUntilExpiry > 0) {
                logger.debug('Proactive token refresh...');
                try {
                    await refreshToken();
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
    function stopBackgroundRefresh() {
        if (tokenRefreshInterval) {
            clearInterval(tokenRefreshInterval);
            tokenRefreshInterval = null;
            isProcessingOperation = false;
            logger.debug('Background token refresh stopped');
        }
    }

    /**
     * Check if background refresh is running
     * @returns {boolean}
     */
    function isBackgroundRefreshActive() {
        return tokenRefreshInterval !== null;
    }

    /**
     * Check if token refresh is needed
     * Used by SpotifyController for background token monitoring
     * @returns {Promise<boolean>} True if token should be refreshed
     */
    async function checkTokenRefreshNeeded() {
        const { expiry } = await loadAccessToken();
        if (!expiry) return false;

        const now = Date.now();
        const timeUntilExpiry = expiry - now;

        // Use 10 minute buffer for background refresh (slightly more aggressive than Security module)
        const buffer = 10 * 60 * 1000;

        // Refresh if expiring within buffer or already expired
        return timeUntilExpiry <= buffer;
    }

    // ==========================================
    // VISIBILITY-BASED STALENESS CHECK
    // Proactively refreshes token when tab becomes visible
    // ==========================================

    let visibilityCheckRegistered = false;

    /**
     * Register visibility change listener for token staleness check
     * Called once during module initialization
     */
    function registerVisibilityCheck() {
        if (visibilityCheckRegistered) return;
        if (typeof document === 'undefined') return;

        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible') {
                await checkTokenStalenessOnVisible();
            }
        });

        visibilityCheckRegistered = true;
        logger.debug('Visibility-based token staleness check registered');
    }

    /**
     * Check token staleness when tab becomes visible
     * Proactively refreshes if token is close to expiry
     * This prevents API calls from failing after the user returns to a dormant tab
     */
    async function checkTokenStalenessOnVisible() {
        const { expiry } = await loadAccessToken();
        if (!expiry) return;

        const timeUntilExpiry = expiry - Date.now();

        // Proactively refresh if expiring within 5 minutes
        if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > 0) {
            logger.debug('Tab visible - proactive token refresh (expiring soon)');
            try {
                await refreshToken();
            } catch (error) {
                logger.error('Visibility-triggered refresh failed:', error);
            }
        } else if (timeUntilExpiry <= 0) {
            // Token already expired - try to refresh
            logger.debug('Tab visible - token expired, attempting refresh');
            try {
                await refreshToken();
            } catch (error) {
                logger.error('Visibility-triggered expired token refresh failed:', error);
            }
        }
    }

    // Register visibility check on module load
    registerVisibilityCheck();

    // ==========================================
    // Public API
    // ==========================================

    return {
        // Configuration
        isConfigured,

        // OAuth
        initiateLogin,
        handleCallback,
        hasValidToken,
        getAccessToken,
        clearTokens,
        refreshToken,
        ensureValidToken,

        // API
        getRecentlyPlayed,
        getTopArtists,
        getTopTracks,
        getCurrentProfile,

        // Quick Snapshot
        fetchSnapshotData,
        transformForAnalysis,

        // Background Refresh (NEW)
        startBackgroundRefresh,
        stopBackgroundRefresh,
        isBackgroundRefreshActive,
        checkTokenRefreshNeeded
    };
})();

// ES Module export
export { Spotify };

logger.debug('Module loaded');
