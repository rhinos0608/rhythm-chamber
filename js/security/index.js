/**
 * Security Module Facade
 * Aggregates all security modules into unified API
 * 
 * Maintains backward compatibility with window.Security API
 * while providing modular architecture
 */

// Import all modules
import * as Encryption from './encryption.js';
import * as TokenBinding from './token-binding.js';
import * as Anomaly from './anomaly.js';

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

/**
 * Legacy obfuscation functions (for non-critical data)
 * These are simple XOR-based obfuscation, NOT encryption
 */
function obfuscate(value, key = null) {
    if (!value) return value;

    const salt = key || Encryption.getSessionSalt();
    const valueBytes = new TextEncoder().encode(value);
    const saltBytes = new TextEncoder().encode(salt);

    const result = new Uint8Array(valueBytes.length);
    for (let i = 0; i < valueBytes.length; i++) {
        result[i] = valueBytes[i] ^ saltBytes[i % saltBytes.length];
    }

    return btoa(String.fromCharCode(...result));
}

function deobfuscate(obfuscated, key = null) {
    if (!obfuscated) return obfuscated;

    try {
        const salt = key || Encryption.getSessionSalt();
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
 * Utility functions that need to be exposed
 */
function isDevToolsLikelyOpen() {
    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;

    if (window.innerWidth < 600) return false;

    return widthDiff || heightDiff;
}

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
            sessionId = Encryption.generateRandomString(32);
            localStorage.setItem('rhythm_chamber_session_id', sessionId);
        }
        identifier = sessionId;
    }

    const hash = await Encryption.hashData(identifier);
    return hash.slice(0, 8);
}

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

// Aggregate all modules into unified API
const Security = {
    // Obfuscation (legacy, for non-critical data)
    obfuscate,
    deobfuscate,

    // REAL Encryption (AES-GCM, for credentials)
    hashData: Encryption.hashData,
    deriveKey: Encryption.deriveKey,
    encryptData: Encryption.encryptData,
    decryptData: Encryption.decryptData,
    getSessionKey: Encryption.getSessionKey,
    storeEncryptedCredentials: Encryption.storeEncryptedCredentials,
    getEncryptedCredentials: Encryption.getEncryptedCredentials,
    clearEncryptedCredentials: Encryption.clearEncryptedCredentials,

    // Session management
    invalidateSessions: Encryption.invalidateSessions,
    clearSessionData: Encryption.clearSessionData,
    getSessionVersion: Encryption.getSessionVersion,

    // Rate limiting
    isRateLimited: Anomaly.isRateLimited,

    // Anomaly detection
    recordFailedAttempt: Anomaly.recordFailedAttempt,
    checkSuspiciousActivity: Anomaly.checkSuspiciousActivity,
    clearSecurityLockout: Anomaly.clearSecurityLockout,
    countRecentGeoChanges: Anomaly.countRecentGeoChanges,
    calculateAdaptiveThreshold: Anomaly.calculateAdaptiveThreshold,

    // XSS Token Protection (NEW)
    checkSecureContext: TokenBinding.checkSecureContext,
    generateDeviceFingerprint: TokenBinding.generateDeviceFingerprint,
    createTokenBinding: TokenBinding.createTokenBinding,
    verifyTokenBinding: TokenBinding.verifyTokenBinding,
    clearTokenBinding: TokenBinding.clearTokenBinding,
    calculateProcessingTokenExpiry: TokenBinding.calculateProcessingTokenExpiry,
    checkTokenRefreshNeeded: TokenBinding.checkTokenRefreshNeeded,

    // Unified Error System (NEW)
    ErrorContext,

    // Utility
    generateRandomString: Encryption.generateRandomString,
    isDevToolsLikelyOpen,
    redactForLogging,
    getUserNamespace,
    isSessionValid,
    getSessionSalt: Encryption.getSessionSalt
};

// Export for ES6 modules
export {
    Security,
    ErrorContext,

    // Individual modules for direct import if needed
    Encryption,
    TokenBinding,
    Anomaly
};

// Also attach to window for backward compatibility
if (typeof window !== 'undefined') {
    window.Security = Security;
    console.log('[Security] Client-side security module loaded (AES-GCM + XSS Token Protection enabled)');
}