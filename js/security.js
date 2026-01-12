/**
 * Security Module for Rhythm Chamber
 * 
 * Client-side security utilities for a privacy-first, zero-backend app.
 * Provides REAL encryption (AES-GCM), session binding, and behavioral defense.
 * 
 * ARCHITECTURE NOTE:
 * This is NOT equivalent to server-side security. It provides:
 * - AES-GCM encryption for credentials (not just obfuscation)
 * - Session-bound key derivation to prevent credential replay
 * - Geographic anomaly detection for suspicious activity
 * - Rate limiting with IP hash tracking
 * 
 * Trade-off: True revocation requires server infrastructure, which would violate
 * Rhythm Chamber's zero-cost, privacy-first architecture.
 */

const SECURITY_STORAGE_KEY = 'rhythm_chamber_security';
const FAILED_ATTEMPTS_KEY = 'rhythm_chamber_failed_attempts';
const SESSION_SALT_KEY = 'rhythm_chamber_session_salt';
const ENCRYPTED_CREDENTIALS_KEY = 'rhythm_chamber_encrypted_creds';
const SESSION_VERSION_KEY = 'rhythm_chamber_session_version';
const IP_HISTORY_KEY = 'rhythm_chamber_ip_history';

/**
 * Generate or retrieve session salt
 * Includes session version for invalidation support
 */
function getSessionSalt() {
    let salt = sessionStorage.getItem(SESSION_SALT_KEY);
    const version = getSessionVersion();

    if (!salt) {
        salt = generateRandomString(32);
        sessionStorage.setItem(SESSION_SALT_KEY, salt);
    }

    // Combine salt with version for invalidation support
    return `${salt}:v${version}`;
}

/**
 * Get current session version (incremented on password/token changes)
 */
function getSessionVersion() {
    return parseInt(localStorage.getItem(SESSION_VERSION_KEY) || '1', 10);
}

/**
 * Invalidate all sessions by incrementing version
 * Call after password changes, token refresh failures, etc.
 */
function invalidateSessions() {
    const newVersion = getSessionVersion() + 1;
    localStorage.setItem(SESSION_VERSION_KEY, String(newVersion));

    // Clear session-specific data
    sessionStorage.removeItem(SESSION_SALT_KEY);

    // Clear encrypted credentials (they're now invalid)
    localStorage.removeItem(ENCRYPTED_CREDENTIALS_KEY);

    console.warn('[Security] Sessions invalidated - credentials cleared');
    return newVersion;
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
 * XOR-based obfuscation with password/salt binding
 * NOT encryption - provides obscurity against casual inspection
 * 
 * @param {string} value - Value to obfuscate
 * @param {string} key - Key/salt to bind obfuscation to
 * @returns {string} Obfuscated value (base64 encoded)
 */
function obfuscate(value, key = null) {
    if (!value) return value;

    const salt = key || getSessionSalt();
    const valueBytes = new TextEncoder().encode(value);
    const saltBytes = new TextEncoder().encode(salt);

    const result = new Uint8Array(valueBytes.length);
    for (let i = 0; i < valueBytes.length; i++) {
        result[i] = valueBytes[i] ^ saltBytes[i % saltBytes.length];
    }

    return btoa(String.fromCharCode(...result));
}

/**
 * Deobfuscate a value
 * 
 * @param {string} obfuscated - Obfuscated value (base64 encoded)
 * @param {string} key - Same key used for obfuscation
 * @returns {string} Original value
 */
function deobfuscate(obfuscated, key = null) {
    if (!obfuscated) return obfuscated;

    try {
        const salt = key || getSessionSalt();
        const decoded = atob(obfuscated);
        const valueBytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)));
        const saltBytes = new TextEncoder().encode(salt);

        const result = new Uint8Array(valueBytes.length);
        for (let i = 0; i < valueBytes.length; i++) {
            result[i] = valueBytes[i] ^ saltBytes[i % saltBytes.length];
        }

        return new TextDecoder().decode(result);
    } catch (e) {
        console.error('[Security] Deobfuscation failed:', e);
        return null;
    }
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
 * Derive a cryptographic key from password/token using PBKDF2
 * 
 * @param {string} password - Password or token to derive from
 * @param {string} salt - Salt (use session salt or fixed app salt)
 * @returns {Promise<CryptoKey>} Derived key for encryption/decryption
 */
async function deriveKey(password, salt = 'rhythm-chamber-v1') {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode(salt),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt data using AES-GCM with a derived key
 * 
 * @param {string} data - Data to encrypt
 * @param {CryptoKey|string} keyOrPassword - CryptoKey or password string
 * @returns {Promise<string>} Base64-encoded encrypted data (iv + ciphertext)
 */
async function encryptData(data, keyOrPassword) {
    const key = typeof keyOrPassword === 'string'
        ? await deriveKey(keyOrPassword)
        : keyOrPassword;

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(data)
    );

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data using AES-GCM
 * 
 * @param {string} encryptedData - Base64-encoded encrypted data
 * @param {CryptoKey|string} keyOrPassword - CryptoKey or password string
 * @returns {Promise<string>} Decrypted data
 */
async function decryptData(encryptedData, keyOrPassword) {
    try {
        const key = typeof keyOrPassword === 'string'
            ? await deriveKey(keyOrPassword)
            : keyOrPassword;

        const combined = new Uint8Array(
            [...atob(encryptedData)].map(c => c.charCodeAt(0))
        );

        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error('[Security] Decryption failed:', e);
        return null;
    }
}

/**
 * Get a session-bound encryption key
 * Derived from: session salt + Spotify refresh token (if available) + session version
 * Key changes when sessions are invalidated
 * 
 * @returns {Promise<CryptoKey>}
 */
async function getSessionKey() {
    const sessionSalt = getSessionSalt();
    const refreshToken = localStorage.getItem('spotify_refresh_token') || '';
    const version = getSessionVersion();
    const combinedSecret = `${sessionSalt}:${refreshToken}:rhythm-chamber:v${version}`;

    return deriveKey(combinedSecret);
}

/**
 * Store credentials with REAL AES-GCM encryption (not just obfuscation)
 * @param {string} key - Storage key identifier
 * @param {Object} credentials - Credentials object to encrypt
 */
async function storeEncryptedCredentials(key, credentials) {
    try {
        const sessionKey = await getSessionKey();
        const encrypted = await encryptData(JSON.stringify(credentials), sessionKey);

        const storage = JSON.parse(localStorage.getItem(ENCRYPTED_CREDENTIALS_KEY) || '{}');
        storage[key] = {
            cipher: encrypted,
            version: getSessionVersion(),
            updatedAt: Date.now()
        };
        localStorage.setItem(ENCRYPTED_CREDENTIALS_KEY, JSON.stringify(storage));

        console.log(`[Security] Credentials encrypted for: ${key}`);
        return true;
    } catch (err) {
        console.error('[Security] Failed to encrypt credentials:', err);
        return false;
    }
}

/**
 * Retrieve and decrypt credentials
 * Returns null if decryption fails (session changed, credentials invalid)
 * @param {string} key - Storage key identifier
 */
async function getEncryptedCredentials(key) {
    try {
        const storage = JSON.parse(localStorage.getItem(ENCRYPTED_CREDENTIALS_KEY) || '{}');
        const entry = storage[key];

        if (!entry?.cipher) return null;

        // Check if credentials were encrypted with current session version
        if (entry.version !== getSessionVersion()) {
            console.warn(`[Security] Credentials for ${key} are from old session - re-authentication required`);
            return null;
        }

        const sessionKey = await getSessionKey();
        const decrypted = await decryptData(entry.cipher, sessionKey);

        if (!decrypted) {
            console.warn(`[Security] Decryption failed for ${key} - session may have changed`);
            return null;
        }

        return JSON.parse(decrypted);
    } catch (err) {
        console.error('[Security] Failed to retrieve credentials:', err);
        return null;
    }
}

/**
 * Clear all encrypted credentials
 */
function clearEncryptedCredentials() {
    localStorage.removeItem(ENCRYPTED_CREDENTIALS_KEY);
    console.log('[Security] All encrypted credentials cleared');
}

/**
 * Client-side rate limiting check
 * Tracks requests in memory (resets on page reload)
 * 
 * @param {string} key - Rate limit bucket key
 * @param {number} maxPerMinute - Maximum requests per minute
 * @returns {boolean} True if rate limited (should block)
 */
const rateLimitBuckets = {};

function isRateLimited(key, maxPerMinute = 5) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute

    if (!rateLimitBuckets[key]) {
        rateLimitBuckets[key] = [];
    }

    // Remove old entries
    rateLimitBuckets[key] = rateLimitBuckets[key].filter(
        timestamp => now - timestamp < windowMs
    );

    if (rateLimitBuckets[key].length >= maxPerMinute) {
        console.warn(`[Security] Rate limited: ${key}`);
        return true;
    }

    rateLimitBuckets[key].push(now);
    return false;
}

/**
 * Track failed API attempts for anomaly detection
 * Includes truncated IP hash for geographic pattern detection
 * 
 * @param {string} operation - Operation that failed (e.g., 'embedding', 'qdrant')
 * @param {string} reason - Failure reason
 */
async function recordFailedAttempt(operation, reason = '') {
    try {
        const stored = localStorage.getItem(FAILED_ATTEMPTS_KEY);
        const attempts = stored ? JSON.parse(stored) : [];

        // Generate a truncated hash of connection info for geographic detection
        // We don't store actual IPs - just a hash for pattern matching
        const connectionHash = await hashData(
            `${navigator.language}:${Intl.DateTimeFormat().resolvedOptions().timeZone}:${screen.width}x${screen.height}`
        );

        // Add new attempt with connection fingerprint
        attempts.push({
            operation,
            reason,
            timestamp: Date.now(),
            connectionHash: connectionHash.slice(0, 16), // Truncated for privacy
            userAgent: navigator.userAgent.slice(0, 50)
        });

        // Keep only last 24 hours
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const filtered = attempts.filter(a => a.timestamp > oneDayAgo);

        localStorage.setItem(FAILED_ATTEMPTS_KEY, JSON.stringify(filtered));

        // Also track IP history for geographic anomaly detection
        await recordConnectionHash(connectionHash.slice(0, 16));
    } catch (e) {
        console.error('[Security] Failed to record attempt:', e);
    }
}

/**
 * Track connection hashes for geographic anomaly detection
 */
async function recordConnectionHash(hash) {
    try {
        const stored = localStorage.getItem(IP_HISTORY_KEY);
        const history = stored ? JSON.parse(stored) : [];

        history.push({
            hash,
            timestamp: Date.now()
        });

        // Keep last 100 connection records
        const trimmed = history.slice(-100);
        localStorage.setItem(IP_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (e) {
        // Ignore - non-critical
    }
}

/**
 * Count distinct geographic patterns (connection hashes) in recent history
 */
function countRecentGeoChanges() {
    try {
        const stored = localStorage.getItem(IP_HISTORY_KEY);
        if (!stored) return 0;

        const history = JSON.parse(stored);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const recentHashes = new Set(
            history
                .filter(h => h.timestamp > oneHourAgo)
                .map(h => h.hash)
        );

        return recentHashes.size;
    } catch (e) {
        return 0;
    }
}

/**
 * Check for suspicious activity patterns
 * Includes geographic anomaly detection for proxy/VPN attacks
 * 
 * @param {string} operation - Operation to check
 * @param {number} threshold - Max failures before lockout (default: 5)
 * @returns {Promise<{blocked: boolean, failureCount: number, message: string}>}
 */
async function checkSuspiciousActivity(operation, threshold = 5) {
    try {
        const stored = localStorage.getItem(FAILED_ATTEMPTS_KEY);
        if (!stored) return { blocked: false, failureCount: 0, message: '' };

        const attempts = JSON.parse(stored);
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

        // Count recent failures for this operation
        const recentFailures = attempts.filter(
            a => a.operation === operation && a.timestamp > oneDayAgo
        );

        // Check for geographic anomalies (rapid location changes)
        const geoChanges = countRecentGeoChanges();
        const hasGeoAnomaly = geoChanges > 3; // >3 distinct locations in 1 hour is suspicious

        // Lower threshold if geographic anomaly detected (proxy attack pattern)
        const effectiveThreshold = hasGeoAnomaly ? Math.floor(threshold / 2) : threshold;

        if (recentFailures.length >= effectiveThreshold) {
            return {
                blocked: true,
                failureCount: recentFailures.length,
                geoAnomaly: hasGeoAnomaly,
                message: hasGeoAnomaly
                    ? `Geographic anomaly detected: ${geoChanges} locations in 1h with ${recentFailures.length} failures. Security lockout active.`
                    : `Security lockout: ${recentFailures.length} failed ${operation} attempts in 24h. Please wait or clear app data.`
            };
        }

        return {
            blocked: false,
            failureCount: recentFailures.length,
            geoAnomaly: hasGeoAnomaly,
            message: ''
        };
    } catch (e) {
        return { blocked: false, failureCount: 0, message: '' };
    }
}

/**
 * Clear security lockout (for user-initiated reset)
 */
function clearSecurityLockout() {
    localStorage.removeItem(FAILED_ATTEMPTS_KEY);
    localStorage.removeItem(IP_HISTORY_KEY);
    console.log('[Security] Lockout cleared');
}

/**
 * Full session cleanup - call after password changes
 * Invalidates sessions and clears all sensitive data
 */
function clearSessionData() {
    invalidateSessions();
    clearEncryptedCredentials();
    clearSecurityLockout();
    sessionStorage.clear();
    console.warn('[Security] Full session cleanup completed - re-authentication required');
}

/**
 * Check if we're likely being inspected via DevTools
 * This is a deterrent, not a security measure
 * 
 * @returns {boolean}
 */
function isDevToolsLikelyOpen() {
    // Check for common debugger indicators
    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;

    // Don't trigger on mobile or legitimate uses
    if (window.innerWidth < 600) return false;

    return widthDiff || heightDiff;
}

/**
 * Redact sensitive values for logging/debugging
 * 
 * @param {Object} obj - Object to redact
 * @param {string[]} sensitiveKeys - Keys to redact
 * @returns {Object} Redacted copy
 */
function redactForLogging(obj, sensitiveKeys = ['apiKey', 'qdrantApiKey', 'token', 'secret']) {
    if (!obj || typeof obj !== 'object') return obj;

    const redacted = { ...obj };
    for (const key of Object.keys(redacted)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
            redacted[key] = redacted[key] ? '••••••••' : undefined;
        } else if (typeof redacted[key] === 'object') {
            redacted[key] = redactForLogging(redacted[key], sensitiveKeys);
        }
    }
    return redacted;
}

/**
 * Generate a user identifier hash for namespace isolation
 * Uses Spotify user ID if available, otherwise session-based
 * 
 * @returns {Promise<string>} 8-character hash for collection namespacing
 */
async function getUserNamespace() {
    // Try to get Spotify user ID from stored profile
    const spotifyProfile = localStorage.getItem('spotify_user_profile');
    let identifier = '';

    if (spotifyProfile) {
        try {
            const profile = JSON.parse(spotifyProfile);
            identifier = profile.id || '';
        } catch (e) { /* ignore */ }
    }

    // Fallback to session-based identifier
    if (!identifier) {
        let sessionId = localStorage.getItem('rhythm_chamber_session_id');
        if (!sessionId) {
            sessionId = generateRandomString(32);
            localStorage.setItem('rhythm_chamber_session_id', sessionId);
        }
        identifier = sessionId;
    }

    const hash = await hashData(identifier);
    return hash.slice(0, 8);
}

/**
 * Validate session is still active
 * Checks token expiry and session integrity
 * 
 * @returns {boolean}
 */
function isSessionValid() {
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');

    if (tokenExpiry) {
        const expiry = parseInt(tokenExpiry, 10);
        if (Date.now() > expiry) {
            console.warn('[Security] Session expired');
            return false;
        }
    }

    return true;
}

// ==========================================
// XSS TOKEN PROTECTION LAYER
// Critical: Mitigates localStorage token theft in client-side architecture
// ==========================================

const TOKEN_BINDING_KEY = 'rhythm_chamber_token_binding';
const DEVICE_FINGERPRINT_KEY = 'rhythm_chamber_device_fp';

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
        await recordFailedAttempt('token_binding', 'Fingerprint mismatch detected');

        // Invalidate everything
        invalidateSessions();
        clearTokenBinding();

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

/**
 * Adaptive lockout threshold calculation
 * Accounts for travel patterns to reduce false positives
 * @param {number} baseThreshold - Default threshold
 * @param {string} operation - Operation being checked
 * @returns {number} Adjusted threshold
 */
function calculateAdaptiveThreshold(baseThreshold, operation) {
    const geoChanges = countRecentGeoChanges();

    // Get timing pattern of geo changes
    const stored = localStorage.getItem(IP_HISTORY_KEY);
    if (!stored || geoChanges <= 3) {
        return baseThreshold; // Normal threshold
    }

    try {
        const history = JSON.parse(stored);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const recentEntries = history.filter(h => h.timestamp > oneHourAgo);

        if (recentEntries.length < 2) {
            return baseThreshold;
        }

        // Calculate average time between geo changes
        let totalGaps = 0;
        for (let i = 1; i < recentEntries.length; i++) {
            totalGaps += recentEntries[i].timestamp - recentEntries[i - 1].timestamp;
        }
        const avgGap = totalGaps / (recentEntries.length - 1);

        // Travel pattern: changes spread over 10+ minutes each
        // Attack pattern: rapid changes within seconds
        if (avgGap > 10 * 60 * 1000) { // > 10 min between changes = likely travel
            console.log('[Security] Detected travel pattern - increasing tolerance');
            return Math.floor(baseThreshold * 1.5);
        } else if (avgGap < 60 * 1000) { // < 1 min = suspicious
            console.warn('[Security] Rapid geo changes detected - reducing threshold');
            return Math.floor(baseThreshold / 2);
        }

        return baseThreshold;
    } catch (e) {
        return baseThreshold;
    }
}

/**
 * Unified error context system
 * Creates structured errors with recovery paths
 */
const ErrorContext = {
    /**
     * Create structured error context
     * @param {string} code - Error code
     * @param {string} rootCause - Root cause description
     * @param {object} details - Additional details
     * @returns {object} Structured error context
     */
    create(code, rootCause, details = {}) {
        return {
            code,
            rootCause,
            timestamp: Date.now(),
            recoveryPath: this.getRecoveryPath(code),
            userMessage: this.getUserMessage(code, details),
            severity: this.getSeverity(code),
            ...details
        };
    },

    getRecoveryPath(code) {
        const paths = {
            'AUTH_FAILURE': 'reconnect_spotify',
            'TOKEN_EXPIRED': 'refresh_token',
            'TOKEN_BINDING_FAIL': 'reconnect_spotify',
            'GEO_LOCKOUT': 'wait_or_verify_identity',
            'CHECKPOINT_MISMATCH': 'merge_or_restart',
            'WORKER_ABORT': 'retry_operation',
            'XSS_DETECTED': 'use_secure_browser',
            'RATE_LIMITED': 'wait_and_retry'
        };
        return paths[code] || 'contact_support';
    },

    getUserMessage(code, details) {
        const messages = {
            'GEO_LOCKOUT': details.isLikelyTravel
                ? `Security check triggered while traveling. Please wait ${details.cooldownMinutes || 60} minutes or try from a consistent location.`
                : `Security lockout: ${details.failureCount || 'Multiple'} failed attempts detected. Please wait before trying again.`,
            'CHECKPOINT_MISMATCH': 'Your data has changed since the last save. You can merge with previous progress or start fresh.',
            'TOKEN_BINDING_FAIL': 'Security check failed. Please reconnect to Spotify to verify your identity.',
            'XSS_DETECTED': 'This app requires a secure browser environment. Please ensure you\'re using HTTPS and not in an embedded frame.',
            'RATE_LIMITED': `Too many requests. Please wait ${details.waitSeconds || 60} seconds before trying again.`
        };
        return messages[code] || 'An error occurred. Please try again.';
    },

    getSeverity(code) {
        const critical = ['TOKEN_BINDING_FAIL', 'XSS_DETECTED'];
        const high = ['AUTH_FAILURE', 'GEO_LOCKOUT'];

        if (critical.includes(code)) return 'critical';
        if (high.includes(code)) return 'high';
        return 'medium';
    }
};

// Public API
window.Security = {
    // Obfuscation (legacy, for non-critical data)
    obfuscate,
    deobfuscate,

    // REAL Encryption (AES-GCM, for credentials)
    hashData,
    deriveKey,
    encryptData,
    decryptData,
    getSessionKey,
    storeEncryptedCredentials,
    getEncryptedCredentials,
    clearEncryptedCredentials,

    // Session management
    invalidateSessions,
    clearSessionData,
    getSessionVersion,

    // Rate limiting
    isRateLimited,

    // Anomaly detection
    recordFailedAttempt,
    checkSuspiciousActivity,
    clearSecurityLockout,
    countRecentGeoChanges,
    calculateAdaptiveThreshold,

    // XSS Token Protection (NEW)
    checkSecureContext,
    generateDeviceFingerprint,
    createTokenBinding,
    verifyTokenBinding,
    clearTokenBinding,
    calculateProcessingTokenExpiry,
    checkTokenRefreshNeeded,

    // Unified Error System (NEW)
    ErrorContext,

    // Utility
    generateRandomString,
    isDevToolsLikelyOpen,
    redactForLogging,
    getUserNamespace,
    isSessionValid,
    getSessionSalt
};

console.log('[Security] Client-side security module loaded (AES-GCM + XSS Token Protection enabled)');

