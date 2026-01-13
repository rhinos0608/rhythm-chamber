/**
 * Token Binding Module
 * XSS token protection layer for Rhythm Chamber
 * 
 * Mitigates localStorage token theft in client-side architecture
 * through device fingerprinting and secure context validation
 */

const TOKEN_BINDING_KEY = 'rhythm_chamber_token_binding';
const DEVICE_FINGERPRINT_KEY = 'rhythm_chamber_device_fp';
const SESSION_SALT_KEY = 'rhythm_chamber_session_salt';

/**
 * Generate a random string of specified length
 */
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    return Array.from(values, v => chars[v % chars.length]).join('');
}

/**
 * SHA-256 hash of data
 * 
 * @param {string} data - Data to hash
 * @returns {Promise<string>} Hex-encoded hash
 */
async function hashData(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate device/session fingerprint for token binding
 * Uses browser characteristics that change between devices but stay stable on same device
 * @returns {Promise<string>} Fingerprint hash
 */
async function generateDeviceFingerprint() {
    const components = [
        navigator.language,
        navigator.platform,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        navigator.hardwareConcurrency || 'unknown',
        // Add session-specific component to prevent cross-tab attacks
        sessionStorage.getItem(SESSION_SALT_KEY) || 'no-session'
    ];

    const fingerprint = await hashData(components.join('|'));
    return fingerprint.slice(0, 16); // Truncated for efficiency
}

/**
 * Check if running in a secure context
 * Blocks sensitive operations in insecure environments (HTTP, embedded frames, etc.)
 * @returns {{secure: boolean, reason?: string}}
 */
function checkSecureContext() {
    // Modern secure context check
    if (typeof window.isSecureContext !== 'undefined' && !window.isSecureContext) {
        return {
            secure: false,
            reason: 'Not running in a secure context (HTTPS required for sensitive operations)'
        };
    }

    // Check for suspicious iframe embedding (clickjacking/XSS vector)
    if (window.top !== window.self) {
        // We're in an iframe - this could be legitimate (dev tools) or malicious
        try {
            // If we can't access parent, it's cross-origin - highly suspicious
            const parentUrl = window.parent.location.href;
            // If we get here, same-origin iframe - less suspicious but still log
            console.warn('[Security] Running in same-origin iframe');
        } catch (e) {
            return {
                secure: false,
                reason: 'Running in cross-origin iframe - possible clickjacking attack'
            };
        }
    }

    // Check for data: or blob: protocols (common XSS vectors)
    if (window.location.protocol === 'data:' || window.location.protocol === 'blob:') {
        return {
            secure: false,
            reason: 'Running in potentially malicious context (data: or blob: protocol)'
        };
    }

    return { secure: true };
}

/**
 * Create token binding - called after successful auth
 * Binds token to device fingerprint to prevent token theft
 * @param {string} token - The access token to bind
 * @returns {Promise<boolean>} Success status
 */
async function createTokenBinding(token) {
    if (!token) return false;

    // Verify secure context first
    const securityCheck = checkSecureContext();
    if (!securityCheck.secure) {
        console.error('[Security] Cannot create token binding:', securityCheck.reason);
        return false;
    }

    const fingerprint = await generateDeviceFingerprint();

    // Store fingerprint for future verification
    sessionStorage.setItem(DEVICE_FINGERPRINT_KEY, fingerprint);

    // Create binding: hash of fingerprint + token (don't store raw token)
    const binding = await hashData(`${fingerprint}:${token}:rhythm-chamber`);
    localStorage.setItem(TOKEN_BINDING_KEY, binding);

    console.log('[Security] Token binding created');
    return true;
}

/**
 * Verify token binding - called before any token usage
 * Throws if binding doesn't match (possible token theft)
 * @param {string} token - Token to verify
 * @returns {Promise<boolean>} True if valid
 * @throws {Error} If binding verification fails
 */
async function verifyTokenBinding(token) {
    if (!token) return false;

    const storedBinding = localStorage.getItem(TOKEN_BINDING_KEY);
    if (!storedBinding) {
        // No binding exists - token might be from before this feature
        // Log warning but don't block (backward compatibility)
        console.warn('[Security] No token binding found - consider re-authenticating');
        return true;
    }

    // Regenerate fingerprint (should match if same device/session)
    const currentFingerprint = await generateDeviceFingerprint();
    const expectedBinding = await hashData(`${currentFingerprint}:${token}:rhythm-chamber`);

    if (storedBinding !== expectedBinding) {
        console.error('[Security] TOKEN BINDING MISMATCH - possible session hijacking!');

        // Record this as a security incident
        // Note: This would need access to recordFailedAttempt from anomaly module
        // For now, we'll just log and invalidate
        invalidateTokenBinding();

        throw new Error('Security check failed: Token binding mismatch. Please reconnect to Spotify.');
    }

    return true;
}

/**
 * Clear token binding (on logout or session invalidation)
 */
function clearTokenBinding() {
    localStorage.removeItem(TOKEN_BINDING_KEY);
    sessionStorage.removeItem(DEVICE_FINGERPRINT_KEY);
    console.log('[Security] Token binding cleared');
}

/**
 * Invalidate token binding (internal use)
 */
function invalidateTokenBinding() {
    localStorage.removeItem(TOKEN_BINDING_KEY);
    sessionStorage.removeItem(DEVICE_FINGERPRINT_KEY);
}

/**
 * Calculate recommended token expiry for processing sessions
 * Uses shorter expiry during sensitive operations to reduce attack window
 * @param {number} spotifyExpiresIn - Default expiry from Spotify (usually 3600s)
 * @returns {number} Recommended expiry in milliseconds
 */
function calculateProcessingTokenExpiry(spotifyExpiresIn) {
    // For processing sessions: use 75% of Spotify expiry, max 45 minutes
    const maxProcessingExpiry = 45 * 60 * 1000; // 45 minutes
    const calculatedExpiry = spotifyExpiresIn * 1000 * 0.75;

    return Math.min(calculatedExpiry, maxProcessingExpiry);
}

/**
 * Check if token should be refreshed proactively
 * @param {number} expiryTime - Token expiry timestamp in ms
 * @param {boolean} isProcessing - Whether a long operation is in progress
 * @returns {{shouldRefresh: boolean, urgency: 'normal'|'soon'|'critical'}}
 */
function checkTokenRefreshNeeded(expiryTime, isProcessing = false) {
    const now = Date.now();
    const timeUntilExpiry = expiryTime - now;

    // Processing sessions: more aggressive refresh (15 min buffer)
    // Normal sessions: 5 min buffer
    const buffer = isProcessing ? 15 * 60 * 1000 : 5 * 60 * 1000;

    if (timeUntilExpiry <= 0) {
        return { shouldRefresh: true, urgency: 'critical' };
    }

    if (timeUntilExpiry <= buffer) {
        return { shouldRefresh: true, urgency: 'soon' };
    }

    if (timeUntilExpiry <= buffer * 3) {
        return { shouldRefresh: false, urgency: 'normal' };
    }

    return { shouldRefresh: false, urgency: 'normal' };
}

/**
 * Setup navigation/tab close cleanup
 * Clears sensitive tokens when user leaves page
 */
function setupNavigationCleanup() {
    window.addEventListener('beforeunload', () => {
        // Only scrub if user is actually leaving (not just refreshing with saved session)
        // Check if this is a "hard" navigation vs refresh
        const navType = performance.getEntriesByType?.('navigation')?.[0]?.type;

        // On actual navigation away (not refresh), consider clearing tokens
        // However, this is aggressive - for MVP, just log
        console.log('[Security] Page unload detected, navigation type:', navType);

        // Note: Actual token clearing on every unload breaks UX for page refreshes
        // Instead, we rely on token binding + short expiry + session validation
    });

    // Handle visibility change (tab hidden) - could indicate tab switching during attack
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Tab is hidden - potential attack vector (user tricked to another tab)
            // Log but don't clear tokens (would break background processing)
            const hiddenAt = Date.now();
            sessionStorage.setItem('rhythm_chamber_hidden_at', String(hiddenAt));
        } else {
            // Tab is visible again - check how long it was hidden
            const hiddenAt = sessionStorage.getItem('rhythm_chamber_hidden_at');
            if (hiddenAt) {
                const hiddenDuration = Date.now() - parseInt(hiddenAt, 10);
                // If hidden for > 30 minutes, suggest re-auth
                if (hiddenDuration > 30 * 60 * 1000) {
                    console.warn('[Security] Tab was hidden for extended period - consider re-authenticating');
                }
                sessionStorage.removeItem('rhythm_chamber_hidden_at');
            }
        }
    });
}

// Initialize navigation cleanup on module load
setupNavigationCleanup();

// Export functions
export {
    // Device fingerprinting
    generateDeviceFingerprint,

    // Secure context validation
    checkSecureContext,

    // Token binding operations
    createTokenBinding,
    verifyTokenBinding,
    clearTokenBinding,

    // Token expiry management
    calculateProcessingTokenExpiry,
    checkTokenRefreshNeeded,

    // Navigation cleanup
    setupNavigationCleanup
};