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
import * as KeyManager from './key-manager.js';
import * as StorageEncryption from './storage-encryption.js';
import * as MessageSecurity from './message-security.js';
import { SecurityCoordinator } from './security-coordinator.js';
import './recovery-handlers.js'; // Side-effect import - sets up window.RecoveryHandlers

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

function redactForLogging(obj, sensitiveKeys = ['apiKey', 'token', 'secret']) {
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

// ==========================================
// Prototype Pollution Prevention
// ==========================================

/**
 * Dangerous keys that can be used for prototype pollution attacks
 */
const PROTOTYPE_POLLUTION_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Sanitize object to prevent prototype pollution via JSON parsing
 * Removes __proto__, constructor, and prototype keys recursively
 * 
 * Use this when parsing user-provided JSON (e.g., uploaded ZIP/JSON files)
 * 
 * @param {any} obj - Object to sanitize
 * @returns {any} Sanitized object
 */
function sanitizeObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    // Handle objects
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (PROTOTYPE_POLLUTION_KEYS.includes(key)) {
            console.warn(`[Security] Blocked prototype pollution attempt: ${key}`);
            continue;
        }
        sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
}

/**
 * Safe JSON parse with prototype pollution protection
 * Use instead of JSON.parse for untrusted input
 * 
 * @param {string} jsonString - JSON string to parse
 * @returns {any} Parsed and sanitized object
 */
function safeJsonParse(jsonString) {
    const parsed = JSON.parse(jsonString);
    return sanitizeObject(parsed);
}

/**
 * Enable prototype pollution protection
 * Freezes Object.prototype and Array.prototype to prevent modification
 * 
 * IMPORTANT: Call this LAST in initialization, after all modules load
 * This prevents legitimate library patches if called too early
 * 
 * @returns {boolean} True if protection was applied
 */
let prototypeFreezeEnabled = false;

function enablePrototypePollutionProtection() {
    if (prototypeFreezeEnabled) {
        console.log('[Security] Prototype pollution protection already enabled');
        return true;
    }

    try {
        // Freeze core prototypes to prevent modification
        Object.freeze(Object.prototype);
        Object.freeze(Array.prototype);
        Object.freeze(Function.prototype);

        // Prevent __proto__ modification (additional layer)
        // Note: Object.prototype is frozen, but this is belt-and-suspenders
        try {
            Object.defineProperty(Object.prototype, '__proto__', {
                configurable: false,
                enumerable: false,
                writable: false,
                value: Object.getPrototypeOf({})
            });
        } catch (e) {
            // May fail if already frozen, which is fine
        }

        prototypeFreezeEnabled = true;
        console.log('[Security] Prototype pollution protection enabled (Object/Array/Function prototypes frozen)');
        return true;
    } catch (e) {
        console.error('[Security] Failed to enable prototype pollution protection:', e);
        return false;
    }
}

/**
 * Check if prototype pollution protection is enabled
 */
function isPrototypeFreezeEnabled() {
    return prototypeFreezeEnabled;
}

// Aggregate all modules into unified API
const Security = {
    // Fallback detection flags (real module = not in fallback)
    _isFallback: false,
    isFallbackMode: () => false,

    /**
     * Initialize all security modules via SecurityCoordinator
     * This is the single authority for security initialization
     * 
     * @param {Object} options - Initialization options
     * @param {string} [options.password] - Password for KeyManager session
     * @param {boolean} [options.enablePrototypePollution=false] - Enable prototype pollution protection immediately
     * @returns {Promise<Object>} Initialization report
     */
    async init(options = {}) {
        return SecurityCoordinator.init(options);
    },

    /**
     * Check if security is ready
     * @returns {boolean} True if security is fully initialized
     */
    isReady() {
        return SecurityCoordinator.isReady();
    },

    /**
     * Check if security is available (ready or degraded)
     * @returns {boolean} True if security is available
     */
    isAvailable() {
        return SecurityCoordinator.isAvailable();
    },

    /**
     * Check if encryption is available
     * @returns {boolean} True if encryption operations are available
     */
    canEncrypt() {
        return SecurityCoordinator.canEncrypt();
    },

    /**
     * Get detailed initialization report
     * @returns {Object} Initialization report
     */
    getInitializationReport() {
        return SecurityCoordinator.getInitializationReport();
    },

    /**
     * Wait for security to be ready
     * @param {number} [timeoutMs=30000] - Timeout in milliseconds
     * @returns {Promise<Object>} Resolves when ready
     */
    async waitForReady(timeoutMs = 30000) {
        return SecurityCoordinator.waitForReady(timeoutMs);
    },

    /**
     * Register callback for when security is ready
     * @param {Function} callback - Callback receiving initialization report
     * @returns {Function} Unsubscribe function
     */
    onReady(callback) {
        return SecurityCoordinator.onReady(callback);
    },

    // SecurityCoordinator reference for direct access
    Coordinator: SecurityCoordinator,

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
    setTravelOverride: Anomaly.setTravelOverride,
    clearTravelOverride: Anomaly.clearTravelOverride,
    getTravelOverrideStatus: Anomaly.getTravelOverrideStatus,

    // XSS Token Protection (NEW)
    checkSecureContext: TokenBinding.checkSecureContext,
    generateDeviceFingerprint: TokenBinding.generateDeviceFingerprint,
    createTokenBinding: TokenBinding.createTokenBinding,
    verifyTokenBinding: TokenBinding.verifyTokenBinding,
    clearTokenBinding: TokenBinding.clearTokenBinding,
    getTokenBindingFailure: TokenBinding.getTokenBindingFailure,
    clearTokenBindingFailure: TokenBinding.clearTokenBindingFailure,
    calculateProcessingTokenExpiry: TokenBinding.calculateProcessingTokenExpiry,
    checkTokenRefreshNeeded: TokenBinding.checkTokenRefreshNeeded,

    // Unified Error System (NEW)
    ErrorContext,

    // Recovery Handlers (NEW) - execute recovery paths
    executeRecovery: (path, details) => window.RecoveryHandlers?.execute(path, details),
    hasRecoveryHandler: (path) => window.RecoveryHandlers?.hasHandler(path),

    // Utility
    generateRandomString: Encryption.generateRandomString,
    redactForLogging,
    getUserNamespace,
    isSessionValid,
    getSessionSalt: Encryption.getSessionSalt,

    // Prototype Pollution Prevention (NEW)
    sanitizeObject,
    safeJsonParse,
    enablePrototypePollutionProtection,
    isPrototypeFreezeEnabled,

    /**
     * KeyManager Exports
     *
     * KeyManager provides three types of non-extractable keys:
     * - Session key (via getSessionKeyKM): For general crypto operations
     * - Data encryption key (via getDataEncryptionKey): For storage encryption (API keys, chat history)
     * - Signing key (via getSigningKey): For HMAC message signing (cross-tab communication)
     *
     * IMPORTANT: Two getSessionKey implementations exist:
     * 1. Security.getSessionKey → Encryption.getSessionKey (legacy, used by rag.js)
     * 2. Security.getSessionKeyKM → KeyManager.getSessionKey (new, non-extractable)
     *
     * Migration Path:
     * - Use getSessionKeyKM for new code requiring KeyManager's non-extractable session key
     * - Existing callers (rag.js) continue using getSessionKey for backward compatibility
     * - Future: Deprecate Encryption.getSessionKey after all callers migrated to KeyManager
     *
     * Known callers of getSessionKey methods:
     * - js/rag.js: Uses Security.getSessionKey (legacy) for RAG checkpoint encryption/decryption
     *
     * Migration status: All existing callers use legacy implementation.
     * New code should use getSessionKeyKM for non-extractable keys.
     *
     * StorageEncryption Integration:
     * StorageEncryption module uses KeyManager.getDataEncryptionKey() for encrypting sensitive data.
     * Pattern: Security.StorageEncryption.encrypt(data, await Security.getDataEncryptionKey())
     *
     * MessageSecurity Integration:
     * MessageSecurity module uses KeyManager.getSigningKey() for HMAC message signing.
     * Pattern: Security.MessageSecurity.signMessage(message, await Security.getSigningKey())
     */
    // Key Management (NEW - Phase 9)
    KeyManager,
    initializeKeySession: KeyManager.initializeSession,
    clearKeySession: KeyManager.clearSession,
    isSecureContextKeyManager: KeyManager.isSecureContext,
    isKeySessionActive: KeyManager.isSessionActive,
    getDataEncryptionKey: KeyManager.getDataEncryptionKey,
    getSigningKey: KeyManager.getSigningKey,
    getSessionKeyKM: KeyManager.getSessionKey,

    /**
     * StorageEncryption Module (NEW - Phase 13)
     *
     * Provides AES-GCM-256 encryption/decryption operations for sensitive data storage.
     * Integrates with KeyManager's non-extractable data encryption key.
     *
     * Methods:
     * - encrypt(data, key): Encrypt data with AES-GCM-256 using unique IV per operation
     * - decrypt(encryptedData, key): Decrypt AES-GCM-256 data (extracts IV from ciphertext)
     * - encryptWithMetadata(data, key, keyVersion): Encrypt with metadata wrapper for storage
     * - decryptFromMetadata(wrappedData, key): Decrypt from metadata wrapper
     *
     * Usage Pattern:
     * const encKey = await Security.getDataEncryptionKey();
     * const encrypted = await Security.StorageEncryption.encrypt('sensitive data', encKey);
     * const decrypted = await Security.StorageEncryption.decrypt(encrypted, encKey);
     *
     * Security Features:
     * - AES-GCM-256 authenticated encryption
     * - Unique 96-bit IV per encryption operation (never reused)
     * - IV stored alongside ciphertext for decryption
     * - Non-extractable keys from KeyManager
     * - Graceful error handling (decrypt returns null on failure)
     *
     * Integration with ConfigAPI (Phase 13-02):
     * ConfigAPI will use StorageEncryption to encrypt API keys and chat history before storage.
     */
    StorageEncryption,

    /**
     * MessageSecurity Module (NEW - Phase 14)
     *
     * Provides HMAC-SHA256 message signing and verification for cross-tab communication.
     * Integrates with KeyManager's non-extractable signing key.
     *
     * Methods:
     * - signMessage(message, signingKey): Sign message using HMAC-SHA256
     * - verifyMessage(message, signature, signingKey): Verify HMAC-SHA256 signature
     * - validateTimestamp(message, maxAgeSeconds): Validate message freshness (default: 5s)
     * - sanitizeMessage(message): Remove sensitive fields (apiKey, token, secret, password)
     * - isNonceUsed(nonce): Check if nonce has been used before
     * - markNonceUsed(nonce): Mark nonce as used to prevent replay attacks
     *
     * Usage Pattern:
     * const signingKey = await Security.getSigningKey();
     * const message = { type: 'update', data: { user: 'alice' }, timestamp: Date.now() };
     * const signature = await Security.MessageSecurity.signMessage(message, signingKey);
     * const isValid = await Security.MessageSecurity.verifyMessage(message, signature, signingKey);
     * const isFresh = Security.MessageSecurity.validateTimestamp(message);
     * const sanitized = Security.MessageSecurity.sanitizeMessage(message);
     *
     * Security Features:
     * - HMAC-SHA256 message authentication codes
     * - Non-extractable signing keys from KeyManager
     * - Message canonicalization for deterministic signatures
     * - Timestamp validation to prevent replay attacks
     * - Sensitive data sanitization before broadcasting
     * - Nonce tracking with 1000-entry cache (FIFO eviction)
     * - Graceful error handling (verify returns false on failure)
     *
     * Integration with Tab Coordination (Phase 14-02):
     * Tab coordination will use MessageSecurity to secure BroadcastChannel communications.
     */
    MessageSecurity
};

// Export for ES6 modules
export {
    Security,
    ErrorContext,
    SecurityCoordinator,

    // Individual modules for direct import if needed
    Encryption,
    TokenBinding,
    Anomaly,
    KeyManager,
    StorageEncryption,
    MessageSecurity
};

console.log('[Security] Client-side security module loaded (SecurityCoordinator + AES-GCM + XSS Token Protection + Recovery Handlers enabled)');
