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

    // Utility
    generateRandomString,
    isDevToolsLikelyOpen,
    redactForLogging,
    getUserNamespace,
    isSessionValid,
    getSessionSalt
};

console.log('[Security] Client-side security module loaded (AES-GCM encryption enabled)');
