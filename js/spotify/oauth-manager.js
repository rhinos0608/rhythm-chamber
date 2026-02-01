/**
 * Spotify OAuth Manager
 * Handles PKCE OAuth flow implementation
 */

import { Crypto } from '../security/crypto.js';
import { ConfigLoader } from '../services/config-loader.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Spotify:OAuthManager');

// OAuth endpoints
const ENDPOINTS = {
    authorize: 'https://accounts.spotify.com/authorize',
    token: 'https://accounts.spotify.com/api/token',
};

// Storage keys
const STORAGE_KEYS = {
    CODE_VERIFIER: 'spotify_code_verifier',
    OAUTH_STATE: 'spotify_oauth_state',
};

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

/**
 * Generate a cryptographically random state string for CSRF protection
 * @returns {string} Random state string
 */
function generateOAuthState() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * OAuth Manager class
 */
export class OAuthManager {
    /**
     * Check if Spotify is configured
     * @returns {boolean}
     */
    static isConfigured() {
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
    static async initiateLogin() {
        if (!this.isConfigured()) {
            throw new Error(
                'Spotify is not configured. Please add your Client ID and redirectUri to config.js'
            );
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
            logger.error(
                'sessionStorage required for secure OAuth flow. Please enable cookies/storage in your browser.',
                e
            );

            // Dispatch event for UI to show error
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('spotify:auth-error', {
                        detail: {
                            reason: 'session_storage_unavailable',
                            message:
                                'Secure OAuth requires sessionStorage. Please enable cookies/storage in your browser settings.',
                        },
                    })
                );
            }

            throw new Error(
                'sessionStorage required for secure OAuth flow. ' +
                    'Please enable cookies/storage in your browser settings.'
            );
        }

        const redirectUri = ConfigLoader.get('spotify.redirectUri');
        if (!redirectUri || typeof redirectUri !== 'string') {
            throw new Error(
                'Spotify redirectUri is missing or invalid. Set spotify.redirectUri in config.js to your app callback URL.'
            );
        }

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: ConfigLoader.get('spotify.clientId'),
            scope: ConfigLoader.get('spotify.scopes', []).join(' '),
            redirect_uri: redirectUri,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
        });

        // SECURITY: Generate and store state parameter for CSRF protection
        const state = generateOAuthState();
        params.set('state', state);

        // Store state in sessionStorage for verification on callback
        // SECURITY: Must use sessionStorage, not localStorage, to prevent XSS
        try {
            sessionStorage.setItem(STORAGE_KEYS.OAUTH_STATE, state);
        } catch (e) {
            logger.error('sessionStorage required for OAuth state parameter', e);
            throw new Error(
                'sessionStorage required for secure OAuth flow. ' +
                    'Please enable cookies/storage in your browser settings.'
            );
        }

        window.location.href = `${ENDPOINTS.authorize}?${params.toString()}`;
    }

    /**
     * Handle OAuth callback - exchange code for tokens
     * @param {string} code - Authorization code from callback
     * @param {string} state - State parameter from callback for CSRF verification
     * @returns {Promise<object>} Token response data
     */
    static async handleCallback(code, state) {
        // SECURITY: Verify state parameter to prevent CSRF attacks
        // This ensures the callback is from a request we initiated
        const storedState = sessionStorage.getItem(STORAGE_KEYS.OAUTH_STATE);

        if (!storedState || storedState !== state) {
            // State mismatch - possible CSRF attack
            sessionStorage.removeItem(STORAGE_KEYS.OAUTH_STATE);
            logger.error('OAuth state mismatch - possible CSRF attack');
            throw new Error(
                'Security verification failed. The authorization flow may have been tampered with. ' +
                    'Please try connecting again.'
            );
        }

        // Clear state after successful verification (single-use)
        sessionStorage.removeItem(STORAGE_KEYS.OAUTH_STATE);

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
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: ConfigLoader.get('spotify.clientId'),
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: ConfigLoader.get('spotify.redirectUri'),
                    code_verifier: codeVerifier,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error_description || 'Failed to exchange code for token');
            }

            const data = await response.json();

            // Clear verifier after successful exchange
            sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);

            return data;
        } catch (error) {
            logger.error('Token exchange failed:', error);
            throw error;
        }
    }

    /**
     * Clear OAuth-related session data
     */
    static clearSessionData() {
        sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
        sessionStorage.removeItem(STORAGE_KEYS.OAUTH_STATE);
    }
}
