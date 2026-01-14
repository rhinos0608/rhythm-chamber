/**
 * Spotify Controller
 * 
 * Handles Spotify OAuth flow, token management, and data fetching.
 * Extracted from app.js to separate Spotify concerns from main app flow.
 * 
 * @module controllers/spotify-controller
 */

'use strict';

// ==========================================
// Dependencies (injected via init)
// ==========================================

let _Storage = null;
let _AppState = null;
let _Spotify = null;
let _Patterns = null;
let _Personality = null;
let _ViewController = null;
let _showToast = null;

// ==========================================
// State Management
// ==========================================

let backgroundRefreshInterval = null;

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize SpotifyController with dependencies
 * @param {Object} dependencies - Required dependencies
 */
function init(dependencies) {
    _Storage = dependencies.Storage;
    _AppState = dependencies.AppState;
    _Spotify = dependencies.Spotify;
    _Patterns = dependencies.Patterns;
    _Personality = dependencies.Personality;
    _ViewController = dependencies.ViewController;
    _showToast = dependencies.showToast;

    console.log('[SpotifyController] Initialized with dependencies');
}

/**
 * Handle Spotify connect button click
 * @returns {Promise<void>}
 */
async function handleSpotifyConnect() {
    try {
        await _Spotify.initiateLogin();
    } catch (error) {
        console.error('[SpotifyController] Spotify connect error:', error);
        if (_showToast) {
            _showToast(error.message);
        } else {
            alert(error.message);
        }
    }
}

/**
 * Handle Spotify OAuth callback
 * @param {string} code - OAuth authorization code
 * @returns {Promise<void>}
 */
async function handleSpotifyCallback(code) {
    if (!_ViewController || !_Spotify) {
        console.error('[SpotifyController] Required dependencies not available');
        return;
    }

    _ViewController.showProcessing();
    _ViewController.updateProgress('Connecting to _Spotify...');

    try {
        // Exchange code for token
        await _Spotify.handleCallback(code);

        // Start background token refresh for long operations
        startBackgroundRefresh();

        // Validate session before fetching
        if (!await _Spotify.ensureValidToken()) {
            if (_showToast) _showToast('Session expired. Reconnecting...');
            const refreshed = await _Spotify.refreshToken();
            if (!refreshed) {
                throw new Error('Session expired. Please reconnect to _Spotify.');
            }
        }

        // Fetch data from Spotify
        const spotifyData = await _Spotify.fetchSnapshotData((message) => {
            _ViewController.updateProgress(message);
        });

        // Transform for analysis
        _ViewController.updateProgress('Analyzing your listening patterns...');
        await new Promise(r => setTimeout(r, 10));

        const liteData = _Spotify.transformForAnalysis(spotifyData);

        // Update app state
        if (_AppState) {
            _AppState.update('lite', {
                liteData: liteData
            });
        }

        // Show instant insight immediately
        _ViewController.updateProgress('Generating instant insight...');
        const instantInsight = _Patterns.detectImmediateVibe(liteData);

        // Update UI with instant insight
        _ViewController.updateProgress(`Quick snapshot ready!<br><br>${instantInsight}<br><br><small>Full analysis requires complete history for accurate personality detection</small>`);

        // Wait a moment for user to read
        await new Promise(r => setTimeout(r, 2000));

        // Detect patterns from lite data
        _ViewController.updateProgress('Detecting your current vibe...');
        await new Promise(r => setTimeout(r, 10));

        const litePatterns = _Patterns.detectLitePatterns(liteData);
        if (_AppState) {
            _AppState.update('lite', { litePatterns });
        }

        // Classify lite personality
        _ViewController.updateProgress('Classifying your music personality...');
        await new Promise(r => setTimeout(r, 10));

        const personality = _Personality.classifyLitePersonality(litePatterns);
        personality.summary = lite_Patterns.summary;

        if (_AppState) {
            _AppState.setPersonality(personality);
            _AppState.update('lite', { isLiteMode: true });
        }

        // Show lite reveal
        _ViewController.showLiteReveal();

    } catch (error) {
        console.error('[SpotifyController] Callback error:', error);
        if (_ViewController) {
            _ViewController.updateProgress(`Error: ${error.message}`);
            setTimeout(() => _ViewController.showUpload(), 3000);
        }
    }
}

/**
 * Start background token refresh
 * Prevents token expiry during long operations
 */
function startBackgroundRefresh() {
    if (!_Spotify) return;

    // Clear any existing interval
    stopBackgroundRefresh();

    // Check token every 5 minutes
    backgroundRefreshInterval = setInterval(async () => {
        try {
            const needsRefresh = await _Spotify.checkTokenRefreshNeeded();
            if (needsRefresh) {
                console.log('[SpotifyController] Background token refresh needed, refreshing...');
                await _Spotify.refreshToken();
            }
        } catch (error) {
            console.warn('[SpotifyController] Background refresh failed:', error);
        }
    }, 5 * 60 * 1000); // 5 minutes

    console.log('[SpotifyController] Background token refresh started');
}

/**
 * Stop background token refresh
 */
function stopBackgroundRefresh() {
    if (backgroundRefreshInterval) {
        clearInterval(backgroundRefreshInterval);
        backgroundRefreshInterval = null;
        console.log('[SpotifyController] Background token refresh stopped');
    }
}

/**
 * Validate Spotify session
 * @returns {Promise<boolean>} True if session is valid
 */
async function validateSession() {
    if (!_Spotify) return false;

    try {
        const isValid = await _Spotify.ensureValidToken();
        if (!isValid) {
            console.log('[SpotifyController] Session validation failed - token invalid');
        }
        return isValid;
    } catch (error) {
        console.error('[SpotifyController] Session validation error:', error);
        return false;
    }
}

/**
 * Clear Spotify tokens (for reset operations)
 */
function clearTokens() {
    if (_Spotify) {
        _Spotify.clearTokens();
        console.log('[SpotifyController] Tokens cleared');
    }
}

/**
 * Check if Spotify is configured
 * @returns {boolean}
 */
function isConfigured() {
    if (!_Spotify) return false;
    return _Spotify.isConfigured();
}

/**
 * Get current Spotify session status
 * @returns {Promise<Object>} Session status object
 */
async function getSessionStatus() {
    if (!_Spotify) {
        return { configured: false, valid: false, error: 'Spotify module not available' };
    }

    try {
        const configured = _Spotify.isConfigured();
        const valid = configured ? await _Spotify.ensureValidToken() : false;

        return {
            configured,
            valid,
            hasToken: !!_Spotify.getAccessToken()
        };
    } catch (error) {
        return {
            configured: _Spotify.isConfigured(),
            valid: false,
            error: error.message
        };
    }
}

/**
 * Fetch fresh snapshot data
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object>} Spotify data
 */
async function fetchSnapshotData(progressCallback) {
    if (!_Spotify) {
        throw new Error('Spotify module not available');
    }

    // Validate session first
    if (!await validateSession()) {
        throw new Error('Invalid or expired Spotify session');
    }

    // Start background refresh for long operations
    startBackgroundRefresh();

    try {
        const data = await _Spotify.fetchSnapshotData(progressCallback);
        return data;
    } finally {
        // Note: We keep background refresh running in case the caller needs more operations
        // Caller should call stopBackgroundRefresh() when done
    }
}

/**
 * Transform Spotify data for analysis
 * @param {Object} spotifyData - Raw Spotify data
 * @returns {Object} Transformed data
 */
function transformForAnalysis(spotifyData) {
    if (!_Spotify) {
        throw new Error('Spotify module not available');
    }
    return _Spotify.transformForAnalysis(spotifyData);
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const SpotifyController = {
    init,
    handleSpotifyConnect,
    handleSpotifyCallback,
    startBackgroundRefresh,
    stopBackgroundRefresh,
    validateSession,
    clearTokens,
    isConfigured,
    getSessionStatus,
    fetchSnapshotData,
    transformForAnalysis
};

// Make available globally for backwards compatibility
if (typeof window !== 'undefined') {
    window.SpotifyController = SpotifyController;
}

console.log('[SpotifyController] Controller loaded');