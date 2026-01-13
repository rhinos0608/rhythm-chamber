/**
 * Spotify Controller
 * 
 * Handles Spotify OAuth flow, token management, and data fetching.
 * Extracted from app.js to separate Spotify concerns from main app flow.
 * 
 * @module controllers/spotify-controller
 */

// ==========================================
// Dependencies (injected via init)
// ==========================================

let Storage = null;
let AppState = null;
let Spotify = null;
let Patterns = null;
let Personality = null;
let ViewController = null;
let showToast = null;

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
    Storage = dependencies.Storage;
    AppState = dependencies.AppState;
    Spotify = dependencies.Spotify;
    Patterns = dependencies.Patterns;
    Personality = dependencies.Personality;
    ViewController = dependencies.ViewController;
    showToast = dependencies.showToast;

    console.log('[SpotifyController] Initialized with dependencies');
}

/**
 * Handle Spotify connect button click
 * @returns {Promise<void>}
 */
async function handleSpotifyConnect() {
    try {
        await Spotify.initiateLogin();
    } catch (error) {
        console.error('[SpotifyController] Spotify connect error:', error);
        if (showToast) {
            showToast(error.message);
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
    if (!ViewController || !Spotify) {
        console.error('[SpotifyController] Required dependencies not available');
        return;
    }

    ViewController.showProcessing();
    ViewController.updateProgress('Connecting to Spotify...');

    try {
        // Exchange code for token
        await Spotify.handleCallback(code);

        // Start background token refresh for long operations
        startBackgroundRefresh();

        // Validate session before fetching
        if (!await Spotify.ensureValidToken()) {
            if (showToast) showToast('Session expired. Reconnecting...');
            const refreshed = await Spotify.refreshToken();
            if (!refreshed) {
                throw new Error('Session expired. Please reconnect to Spotify.');
            }
        }

        // Fetch data from Spotify
        const spotifyData = await Spotify.fetchSnapshotData((message) => {
            ViewController.updateProgress(message);
        });

        // Transform for analysis
        ViewController.updateProgress('Analyzing your listening patterns...');
        await new Promise(r => setTimeout(r, 10));

        const liteData = Spotify.transformForAnalysis(spotifyData);

        // Update app state
        if (AppState) {
            AppState.update('lite', {
                liteData: liteData
            });
        }

        // Show instant insight immediately
        ViewController.updateProgress('Generating instant insight...');
        const instantInsight = Patterns.detectImmediateVibe(liteData);

        // Update UI with instant insight
        ViewController.updateProgress(`Quick snapshot ready!<br><br>${instantInsight}<br><br><small>Full analysis requires complete history for accurate personality detection</small>`);

        // Wait a moment for user to read
        await new Promise(r => setTimeout(r, 2000));

        // Detect patterns from lite data
        ViewController.updateProgress('Detecting your current vibe...');
        await new Promise(r => setTimeout(r, 10));

        const litePatterns = Patterns.detectLitePatterns(liteData);
        if (AppState) {
            AppState.update('lite', { litePatterns });
        }

        // Classify lite personality
        ViewController.updateProgress('Classifying your music personality...');
        await new Promise(r => setTimeout(r, 10));

        const personality = Personality.classifyLitePersonality(litePatterns);
        personality.summary = litePatterns.summary;

        if (AppState) {
            AppState.setPersonality(personality);
            AppState.update('lite', { isLiteMode: true });
        }

        // Show lite reveal
        ViewController.showLiteReveal();

    } catch (error) {
        console.error('[SpotifyController] Callback error:', error);
        if (ViewController) {
            ViewController.updateProgress(`Error: ${error.message}`);
            setTimeout(() => ViewController.showUpload(), 3000);
        }
    }
}

/**
 * Start background token refresh
 * Prevents token expiry during long operations
 */
function startBackgroundRefresh() {
    if (!Spotify) return;

    // Clear any existing interval
    stopBackgroundRefresh();

    // Check token every 5 minutes
    backgroundRefreshInterval = setInterval(async () => {
        try {
            const needsRefresh = await Spotify.checkTokenRefreshNeeded();
            if (needsRefresh) {
                console.log('[SpotifyController] Background token refresh needed, refreshing...');
                await Spotify.refreshToken();
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
    if (!Spotify) return false;

    try {
        const isValid = await Spotify.ensureValidToken();
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
    if (Spotify) {
        Spotify.clearTokens();
        console.log('[SpotifyController] Tokens cleared');
    }
}

/**
 * Check if Spotify is configured
 * @returns {boolean}
 */
function isConfigured() {
    if (!Spotify) return false;
    return Spotify.isConfigured();
}

/**
 * Get current Spotify session status
 * @returns {Promise<Object>} Session status object
 */
async function getSessionStatus() {
    if (!Spotify) {
        return { configured: false, valid: false, error: 'Spotify module not available' };
    }

    try {
        const configured = Spotify.isConfigured();
        const valid = configured ? await Spotify.ensureValidToken() : false;

        return {
            configured,
            valid,
            hasToken: !!Spotify.getAccessToken()
        };
    } catch (error) {
        return {
            configured: Spotify.isConfigured(),
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
    if (!Spotify) {
        throw new Error('Spotify module not available');
    }

    // Validate session first
    if (!await validateSession()) {
        throw new Error('Invalid or expired Spotify session');
    }

    // Start background refresh for long operations
    startBackgroundRefresh();

    try {
        const data = await Spotify.fetchSnapshotData(progressCallback);
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
    if (!Spotify) {
        throw new Error('Spotify module not available');
    }
    return Spotify.transformForAnalysis(spotifyData);
}

// ==========================================
// Public API
// ==========================================

const SpotifyController = {
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

// Make available globally
if (typeof window !== 'undefined') {
    window.SpotifyController = SpotifyController;
}

console.log('[SpotifyController] Controller loaded');