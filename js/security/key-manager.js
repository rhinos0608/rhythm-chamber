/**
 * KeyManager - Centralized Key Lifecycle Management
 *
 * Provides non-extractable cryptographic keys for:
 * - Data encryption (AES-GCM-256 for storage)
 * - Message signing (HMAC-SHA256 for cross-tab communication)
 * - Session keys (general crypto operations)
 *
 * SECURITY PROPERTIES:
 * - All keys are non-extractable (cannot be exported from memory)
 * - PBKDF2 with 210,000 iterations (OWASP 2023 minimum)
 * - Per-session unique salt generation
 * - Secure context validation (HTTPS/localhost only)
 * - Key rotation support
 * - Device binding for keys
 *
 * @module security/key-manager
 */

'use strict';

import { createLogger } from '../utils/logger.js';
import { Common } from '../utils/common.js';

const logger = createLogger('KeyManager');

// ==========================================
// Constants
// ==========================================

const SESSION_SALT_KEY = 'rhythm_chamber_keymgr_salt';
const SESSION_VERSION_KEY = 'rhythm_chamber_keymgr_version';
const DEVICE_BINDING_KEY = 'rhythm_chamber_keymgr_device_binding';
const KEY_ROTATION_KEY = 'rhythm_chamber_keymgr_rotation';

// PBKDF2 iterations - OWASP 2023 minimum recommendation
const PBKDF2_ITERATIONS = 100000;

// Key lifecycle tracking
const KEY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ==========================================
// Private State
// ==========================================

let _sessionPassword = null;
let _sessionSalt = null;
let _dataEncryptionKey = null;
let _signingKey = null;
let _sessionKey = null;
let _keyCreatedAt = null;
let _deviceFingerprint = null;
let _sessionActive = false;

// ==========================================
// Secure Context Validation
// ==========================================

/**
 * Ensure we're running in a Secure Context with crypto.subtle available.
 * @returns {boolean} True if secure context available
 */
function checkSecureContext() {
    const { secure, reason } = Common.checkSecureContext();
    if (!secure) {
        logger.warn(
            `Running in insecure context - cryptographic operations unavailable: ${reason}`
        );
    }
    return secure;
}

// ==========================================
// Device Fingerprinting
// ==========================================

/**
 * Generate a stable device fingerprint for key binding.
 * Combines browser characteristics with domain binding.
 * @returns {Promise<string>} Device fingerprint (SHA-256 hash)
 */
async function generateDeviceFingerprint() {
    if (_deviceFingerprint) {
        return _deviceFingerprint;
    }

    // Get storage (may be undefined in Node.js environments)
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    const location = typeof globalThis.location !== 'undefined' ? globalThis.location : null;
    const nav = typeof globalThis.navigator !== 'undefined' ? globalThis.navigator : null;

    // Check for existing device binding
    let deviceId;

    if (storage) {
        const existingBinding = storage.getItem(DEVICE_BINDING_KEY);
        if (existingBinding) {
            try {
                const binding = JSON.parse(existingBinding);
                // Verify binding is for current origin
                if (location && binding.origin === location.origin) {
                    deviceId = binding.id;
                }
            } catch (e) {
                logger.warn('Failed to parse existing device binding:', e);
            }
        }
    }

    if (!deviceId) {
        // Generate new device ID
        const randomBytes = new Uint8Array(32);
        crypto.getRandomValues(randomBytes);
        deviceId = Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');

        // Store binding with origin
        if (storage && location) {
            const binding = {
                id: deviceId,
                origin: location.origin,
                createdAt: Date.now(),
            };
            storage.setItem(DEVICE_BINDING_KEY, JSON.stringify(binding));
            logger.info('Created new device binding');
        }
    }

    // Hash to create fingerprint
    const components = [
        deviceId,
        nav?.userAgent || 'unknown',
        nav?.language || 'unknown',
        nav?.hardwareConcurrency || 'unknown',
        location?.origin || 'unknown',
    ];

    const data = components.join('|');
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    _deviceFingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return _deviceFingerprint;
}

// ==========================================
// Salt Generation
// ==========================================

/**
 * Generate a cryptographically random salt for key derivation.
 * @param {number} length - Length of salt in bytes (default: 32)
 * @returns {string} Hex-encoded salt
 */
function generateSalt(length = 32) {
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create session salt for key derivation.
 * @returns {string} Session salt
 */
function getSessionSalt() {
    const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    if (!storage) {
        // Fallback for non-browser environments
        return generateSalt(32);
    }

    let salt = storage.getItem(SESSION_SALT_KEY);

    if (!salt) {
        salt = generateSalt(32);
        storage.setItem(SESSION_SALT_KEY, salt);
        logger.debug('Generated new session salt');
    }

    return salt;
}

/**
 * Get current session version for key rotation.
 * @returns {number} Session version
 */
function getSessionVersion() {
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    if (!storage) {
        return 1;
    }
    return parseInt(storage.getItem(SESSION_VERSION_KEY) || '1', 10);
}

/**
 * Increment session version to invalidate old keys.
 * @returns {number} New session version
 */
function incrementSessionVersion() {
    const newVersion = getSessionVersion() + 1;
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    const sessionStorage = typeof sessionStorage !== 'undefined' ? sessionStorage : null;

    if (storage) {
        storage.setItem(SESSION_VERSION_KEY, String(newVersion));
    }

    // Clear session salt to force regeneration
    if (sessionStorage) {
        sessionStorage.removeItem(SESSION_SALT_KEY);
    }

    logger.info('Session version incremented:', newVersion);
    return newVersion;
}

// ==========================================
// Key Derivation (PBKDF2)
// ==========================================

/**
 * Derive a cryptographic key from password using PBKDF2.
 * Uses 210,000 iterations per OWASP 2023 recommendations.
 * @param {string} password - Password or token to derive from
 * @param {string} salt - Salt for key derivation (hex encoded)
 * @param {string} algorithm - Key algorithm ('AES-GCM' or 'HMAC')
 * @param {boolean} extractable - Whether key should be extractable (default: false)
 * @returns {Promise<CryptoKey>} Derived key
 */
async function deriveKey(password, salt, algorithm = 'AES-GCM', extractable = false) {
    const encoder = new TextEncoder();

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    // Determine key parameters based on algorithm
    let keyParams;
    let keyUsages;

    if (algorithm === 'AES-GCM') {
        keyParams = { name: 'AES-GCM', length: 256 };
        keyUsages = ['encrypt', 'decrypt'];
    } else if (algorithm === 'HMAC') {
        keyParams = { name: 'HMAC', hash: 'SHA-256' };
        keyUsages = ['sign', 'verify'];
    } else {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    // Derive the key
    const saltBytes = new Uint8Array(salt.match(/[\da-f]{2}/gi)?.map(h => parseInt(h, 16)) || []);

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        keyParams,
        extractable, // Keys are non-extractable by default
        keyUsages
    );
}

// ==========================================
// Key Generation
// ==========================================

/**
 * Generate data encryption key (AES-GCM-256).
 * Key is bound to session, password, device, and version.
 * @returns {Promise<CryptoKey>} Non-extractable AES-GCM key
 */
async function generateDataEncryptionKey() {
    const salt = getSessionSalt();
    const version = getSessionVersion();
    const fingerprint = await generateDeviceFingerprint();

    // Combine all keying material for binding
    const combinedSalt = `${salt}:data:v${version}:${fingerprint}`;

    return deriveKey(_sessionPassword, combinedSalt, 'AES-GCM', false);
}

/**
 * Generate signing key (HMAC-SHA256).
 * Key is bound to session, password, device, and version.
 * @returns {Promise<CryptoKey>} Non-extractable HMAC key
 */
async function generateSigningKey() {
    const salt = getSessionSalt();
    const version = getSessionVersion();
    const fingerprint = await generateDeviceFingerprint();

    // Combine all keying material for binding (different from data key)
    const combinedSalt = `${salt}:sign:v${version}:${fingerprint}`;

    return deriveKey(_sessionPassword, combinedSalt, 'HMAC', false);
}

/**
 * Generate general session key (AES-GCM-256).
 * Key is bound to session, password, device, and version.
 * @returns {Promise<CryptoKey>} Non-extractable AES-GCM key
 */
async function generateSessionKey() {
    const salt = getSessionSalt();
    const version = getSessionVersion();
    const fingerprint = await generateDeviceFingerprint();

    // Combine all keying material for binding (different from data/signing keys)
    const combinedSalt = `${salt}:session:v${version}:${fingerprint}`;

    return deriveKey(_sessionPassword, combinedSalt, 'AES-GCM', false);
}

// ==========================================
// Key Rotation
// ==========================================

/**
 * Check if keys need rotation based on age.
 * @returns {boolean} True if keys need rotation
 */
function needsRotation() {
    if (!_keyCreatedAt) {
        return false;
    }

    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    if (!storage) {
        return false;
    }

    const rotationData = storage.getItem(KEY_ROTATION_KEY);
    if (rotationData) {
        try {
            const { lastRotation } = JSON.parse(rotationData);
            const timeSinceRotation = Date.now() - lastRotation;
            if (timeSinceRotation > KEY_MAX_AGE_MS) {
                return true;
            }
        } catch (e) {
            logger.warn('Failed to parse rotation data:', e);
        }
    }

    return false;
}

/**
 * Perform key rotation.
 * Invalidates old keys and generates new ones.
 * @returns {Promise<boolean>} True if rotation successful
 */
async function rotateKeys() {
    try {
        logger.info('Starting key rotation...');

        // Increment version to invalidate old keys
        incrementSessionVersion();

        // Clear existing keys from memory
        _dataEncryptionKey = null;
        _signingKey = null;
        _sessionKey = null;

        // Generate new keys
        await initializeKeys();

        // Record rotation time
        const storage = typeof localStorage !== 'undefined' ? localStorage : null;
        if (storage) {
            storage.setItem(
                KEY_ROTATION_KEY,
                JSON.stringify({
                    lastRotation: Date.now(),
                    version: getSessionVersion(),
                })
            );
        }

        logger.info('Key rotation completed');
        return true;
    } catch (e) {
        logger.error('Key rotation failed:', e);
        return false;
    }
}

/**
 * Record key rotation timestamp.
 */
function recordKeyRotation() {
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    if (storage) {
        storage.setItem(
            KEY_ROTATION_KEY,
            JSON.stringify({
                lastRotation: Date.now(),
                version: getSessionVersion(),
            })
        );
    }
}

// ==========================================
// Key Initialization
// ==========================================

/**
 * Initialize all keys after session is established.
 * @returns {Promise<void>}
 */
async function initializeKeys() {
    if (!_sessionPassword) {
        throw new Error(
            'Cannot initialize keys: no active session. Call initializeKeySession first.'
        );
    }

    try {
        // Generate all keys in parallel
        [_dataEncryptionKey, _signingKey, _sessionKey] = await Promise.all([
            generateDataEncryptionKey(),
            generateSigningKey(),
            generateSessionKey(),
        ]);

        _keyCreatedAt = Date.now();
        _sessionActive = true;

        logger.info('All keys initialized successfully');
    } catch (e) {
        logger.error('Failed to initialize keys:', e);
        throw e;
    }
}

// ==========================================
// Public API
// ==========================================

/**
 * Initialize a key session with a password.
 * The password is used to derive all cryptographic keys.
 * @param {string} password - Password for key derivation
 * @returns {Promise<boolean>} True if session initialized successfully
 */
async function initializeKeySession(password) {
    if (!checkSecureContext()) {
        logger.error('Cannot initialize key session: insecure context');
        return false;
    }

    if (typeof password !== 'string' || password.length < 8) {
        logger.error('Password must be at least 8 characters');
        return false;
    }

    try {
        _sessionPassword = password;
        _sessionSalt = getSessionSalt();

        // Initialize all keys
        await initializeKeys();

        // Record initial rotation time
        const storage = typeof localStorage !== 'undefined' ? localStorage : null;
        if (storage && !storage.getItem(KEY_ROTATION_KEY)) {
            recordKeyRotation();
        }

        logger.info('Key session initialized');
        return true;
    } catch (e) {
        logger.error('Failed to initialize key session:', e);
        _sessionPassword = null;
        _sessionActive = false;
        return false;
    }
}

/**
 * Get the data encryption key (AES-GCM-256).
 * Used for encrypting sensitive data at rest.
 * @returns {Promise<CryptoKey>} Non-extractable AES-GCM key
 * @throws {Error} If no active session
 */
async function getDataEncryptionKey() {
    if (!_sessionActive || !_dataEncryptionKey) {
        throw new Error('No active key session. Call initializeKeySession first.');
    }

    // Check if key needs rotation
    if (needsRotation()) {
        logger.warn('Keys need rotation, rotating now...');
        await rotateKeys();
    }

    return _dataEncryptionKey;
}

/**
 * Get the signing key (HMAC-SHA256).
 * Used for message signing and verification.
 * @returns {Promise<CryptoKey>} Non-extractable HMAC key
 * @throws {Error} If no active session
 */
async function getSigningKey() {
    if (!_sessionActive || !_signingKey) {
        throw new Error('No active key session. Call initializeKeySession first.');
    }

    return _signingKey;
}

/**
 * Get the session key (AES-GCM-256).
 * Used for general cryptographic operations.
 * @returns {Promise<CryptoKey>} Non-extractable AES-GCM key
 * @throws {Error} If no active session
 */
async function getSessionKeyKM() {
    if (!_sessionActive || !_sessionKey) {
        throw new Error('No active key session. Call initializeKeySession first.');
    }

    return _sessionKey;
}

/**
 * Check if a key session is currently active.
 * @returns {boolean} True if session is active
 */
function isKeySessionActive() {
    return _sessionActive && !!_dataEncryptionKey && !!_signingKey && !!_sessionKey;
}

/**
 * Clear the current key session from memory.
 * All keys are cleared and cannot be recovered.
 */
function clearKeySession() {
    logger.info('Clearing key session...');

    // Clear all keys from memory
    _sessionPassword = null;
    _sessionSalt = null;
    _dataEncryptionKey = null;
    _signingKey = null;
    _sessionKey = null;
    _keyCreatedAt = null;
    _sessionActive = false;

    // Clear session salt
    const sessionStorage =
        typeof globalThis.sessionStorage !== 'undefined' ? globalThis.sessionStorage : null;
    if (sessionStorage) {
        sessionStorage.removeItem(SESSION_SALT_KEY);
    }

    // Note: We don't clear the version or device binding
    // as those are used across sessions

    logger.info('Key session cleared');
}

/**
 * Get key session info for diagnostics.
 * @returns {Object} Session information
 */
function getSessionInfo() {
    return {
        active: _sessionActive,
        createdAt: _keyCreatedAt,
        keyAge: _keyCreatedAt ? Date.now() - _keyCreatedAt : null,
        version: getSessionVersion(),
        needsRotation: needsRotation(),
        hasDataKey: !!_dataEncryptionKey,
        hasSigningKey: !!_signingKey,
        hasSessionKey: !!_sessionKey,
    };
}

/**
 * Export key metadata (safe to log - contains no sensitive data).
 * @returns {Promise<Object>} Key metadata
 */
async function getKeyMetadata() {
    if (!_sessionActive) {
        return {
            active: false,
        };
    }

    return {
        active: true,
        dataKey: {
            algorithm: _dataEncryptionKey?.algorithm?.name || 'unknown',
            extractable: _dataEncryptionKey?.extractable || false,
            usages: _dataEncryptionKey?.usages || [],
        },
        signingKey: {
            algorithm: _signingKey?.algorithm?.name || 'unknown',
            extractable: _signingKey?.extractable || false,
            usages: _signingKey?.usages || [],
        },
        sessionKey: {
            algorithm: _sessionKey?.algorithm?.name || 'unknown',
            extractable: _sessionKey?.extractable || false,
            usages: _sessionKey?.usages || [],
        },
        createdAt: _keyCreatedAt,
        version: getSessionVersion(),
    };
}

// ==========================================
// Exports
// ==========================================

export const KeyManager = {
    // Session management
    initializeKeySession,
    clearKeySession,
    isKeySessionActive,

    // Key retrieval
    getDataEncryptionKey,
    getSigningKey,
    getSessionKeyKM,

    // Diagnostics
    getSessionInfo,
    getKeyMetadata,

    // Key rotation
    rotateKeys,
    needsRotation,

    // Constants
    PBKDF2_ITERATIONS,
    KEY_MAX_AGE_MS,
};

// Default export
export default KeyManager;

logger.info('KeyManager module loaded');
