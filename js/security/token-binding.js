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
const TOKEN_BINDING_GUIDANCE = 'Open the app via HTTPS or http://localhost to enable secure token binding. File:// and embedded contexts cannot connect Spotify securely.';

let lastFailure = null;

function setTokenBindingFailure(reason, userMessage, details = {}) {
    lastFailure = {
        reason,
        userMessage,
        timestamp: Date.now(),
        ...details
    };
}

function getTokenBindingFailure() {
    return lastFailure;
}

function clearTokenBindingFailure() {
    lastFailure = null;
}

function isCryptoSupported() {
    if (typeof crypto === 'undefined' || !crypto?.getRandomValues || !crypto?.subtle) {
        return {
            ok: false,
            reason: 'crypto_unavailable',
            message: `Web Crypto is unavailable in this browser context. ${TOKEN_BINDING_GUIDANCE}`
        };
    }
    return { ok: true };
}

function ensureSessionSalt() {
    try {
        let salt = sessionStorage.getItem(SESSION_SALT_KEY);
        if (!salt) {
            if (crypto?.getRandomValues) {
                salt = generateRandomString(32);
            } else {
                salt = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
            }
            sessionStorage.setItem(SESSION_SALT_KEY, salt);
        }
        return salt;
    } catch (error) {
        console.warn('[Security] Unable to set session salt:', error?.message || error);
        return 'no-session';
    }
}

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
        ensureSessionSalt() || 'no-session'
    ];

    const fingerprint = await hashData(components.join('|'));
    return fingerprint.slice(0, 16); // Truncated for efficiency
}

/**
 * Allowed protocols for token binding operations
 * Note: file:// is allowed with a warning since crypto.subtle may not work
 */
const ALLOWED_PROTOCOLS = ['https:', 'http:', 'app:', 'capacitor:'];

/**
 * Allowed hostnames for HTTP (non-HTTPS) connections
 * These are considered safe for local development
 */
const ALLOWED_LOCAL_HOSTNAMES = ['localhost', '127.0.0.1'];

/**
 * Check if running in a secure context with comprehensive origin validation
 * Blocks sensitive operations in insecure environments (HTTP, embedded frames, etc.)
 * 
 * Enhanced validation per user feedback:
 * - HTTPS: Always allowed
 * - HTTP localhost/127.0.0.1: Allowed (local development)
 * - app://capacitor://: Allowed (native wrappers)
 * - file://: Allowed with warning (offline use, but crypto.subtle may fail)
 * - Iframes: Cross-origin blocked
 * - data://blob://: Blocked (XSS vectors)
 * 
 * @returns {{secure: boolean, reason?: string, warning?: string}}
 */
function checkSecureContext() {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const origin = window.location.origin;
    const isLocalHost = ALLOWED_LOCAL_HOSTNAMES.includes(hostname);
    const isHttps = protocol === 'https:';
    const isFile = protocol === 'file:';
    const isNativeWrapper = protocol === 'app:' || protocol === 'capacitor:';
    const isHttp = protocol === 'http:';

    // Check for HTTPS or valid local development
    if (!isHttps && !isLocalHost && !isFile && !isNativeWrapper) {
        // Insecure remote HTTP connection
        return {
            secure: false,
            reason: `Insecure connection: ${origin}. Token binding requires HTTPS or localhost.`,
            guidance: TOKEN_BINDING_GUIDANCE
        };
    }

    // Modern secure context check (browser-level)
    if (typeof window.isSecureContext !== 'undefined' && !window.isSecureContext) {
        // Browser says we're not in a secure context
        // This can happen on HTTP even to localhost in some browsers
        if (!isLocalHost && !isFile) {
            return {
                secure: false,
                reason: 'Not running in a secure context (HTTPS required for sensitive operations)',
                guidance: TOKEN_BINDING_GUIDANCE
            };
        }
        // Allow localhost even if isSecureContext is false (dev servers)
    }

    // Check for suspicious iframe embedding (clickjacking/XSS vector)
    if (window.top !== window.self) {
        try {
            // If we can't access parent, it's cross-origin - highly suspicious
            const parentUrl = window.parent.location.href;
            // If we get here, same-origin iframe - less suspicious but still log
            console.warn('[Security] Running in same-origin iframe');
        } catch (e) {
            return {
                secure: false,
                reason: 'Running in cross-origin iframe - possible clickjacking attack',
                guidance: TOKEN_BINDING_GUIDANCE
            };
        }
    }

    // Check for data: or blob: protocols (common XSS vectors)
    if (protocol === 'data:' || protocol === 'blob:') {
        return {
            secure: false,
            reason: 'Running in potentially malicious context (data: or blob: protocol)',
            guidance: TOKEN_BINDING_GUIDANCE
        };
    }

    // Handle file:// protocol - allow with warning
    // Users may run the app directly from their hard drive for offline use
    // crypto.subtle may not work in this context
    if (isFile) {
        console.warn('[Security] Running from file:// - crypto.subtle may be unavailable');
        return {
            secure: true,
            warning: 'Running from local file. Some security features may be limited.'
        };
    }

    // Handle HTTP localhost - secure for development
    if (isHttp && isLocalHost) {
        console.log('[Security] Running on localhost HTTP - allowed for development');
        return { secure: true };
    }

    // Handle native app wrappers (Electron, Capacitor)
    if (isNativeWrapper) {
        console.log(`[Security] Running in native wrapper (${protocol})`);
        return { secure: true };
    }

    // HTTPS - fully secure
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

    clearTokenBindingFailure();

    // Verify secure context first
    const securityCheck = checkSecureContext();
    if (!securityCheck.secure) {
        const message = securityCheck.reason
            ? `${securityCheck.reason} ${TOKEN_BINDING_GUIDANCE}`
            : TOKEN_BINDING_GUIDANCE;
        setTokenBindingFailure('insecure_context', message, { reason: securityCheck.reason });
        console.error('[Security] Cannot create token binding:', message);
        return false;
    }

    const cryptoCheck = isCryptoSupported();
    if (!cryptoCheck.ok) {
        setTokenBindingFailure(cryptoCheck.reason, cryptoCheck.message);
        console.error('[Security] Cannot create token binding:', cryptoCheck.message);
        return false;
    }

    let fingerprint;
    try {
        fingerprint = await generateDeviceFingerprint();
    } catch (error) {
        const message = `Token binding failed. ${TOKEN_BINDING_GUIDANCE}`;
        setTokenBindingFailure('fingerprint_failed', message, { error: error?.message || String(error) });
        console.error('[Security] Cannot create token binding:', message);
        return false;
    }

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

    const cryptoCheck = isCryptoSupported();
    if (!cryptoCheck.ok) {
        setTokenBindingFailure(cryptoCheck.reason, cryptoCheck.message);
        throw new Error(cryptoCheck.message);
    }

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
    getTokenBindingFailure,
    clearTokenBindingFailure,

    // Token expiry management
    calculateProcessingTokenExpiry,
    checkTokenRefreshNeeded,

    // Navigation cleanup
    setupNavigationCleanup
};
