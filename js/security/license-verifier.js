/**
 * Cryptographic License Verifier for Rhythm Chamber
 *
 * Provides secure JWT-based license verification using Web Crypto API.
 * Prevents client-side bypass through signature verification.
 *
 * @module security/license-verifier
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('LicenseVerifier');

// ==========================================
// Constants
// ==========================================

const LICENSE_CACHE_KEY = 'rhythm_chamber_license_cache';
const LICENSE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const LICENSE_STORAGE_KEY = 'rhythm_chamber_license';

// Device fingerprint for license binding
let _deviceFingerprint = null;

// ==========================================
// Device Fingerprinting
// ==========================================

/**
 * Generate stable device fingerprint
 * Combines browser characteristics with domain binding
 * @returns {Promise<string>} Device fingerprint
 */
async function generateDeviceFingerprint() {
    if (_deviceFingerprint) {
        return _deviceFingerprint;
    }

    // Collect stable device characteristics
    const components = [
        navigator.userAgent,
        navigator.language,
        navigator.hardwareConcurrency || 'unknown',
        navigator.deviceMemory || 'unknown',
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        window.location.origin  // Domain binding
    ];

    const data = components.join('|');
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);

    // Hash to create fingerprint
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    _deviceFingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return _deviceFingerprint;
}

// ==========================================
// JWT Utilities
// ==========================================

/**
 * Base64URL decode a string to raw bytes
 * @param {string} str - Base64URL encoded string
 * @returns {Uint8Array} Decoded bytes
 */
function base64UrlDecodeToBytes(str) {
    // Convert Base64URL to Base64
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

    // Pad with '=' if needed
    while (base64.length % 4) {
        base64 += '=';
    }

    // Decode to bytes
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/**
 * Base64URL decode a string
 * @param {string} str - Base64URL encoded string
 * @returns {string} Decoded string
 */
function base64UrlDecode(str) {
    const bytes = base64UrlDecodeToBytes(str);
    return new TextDecoder().decode(bytes);
}

/**
 * Base64URL encode a string
 * @param {string} str - String to encode
 * @returns {string} Base64URL encoded string
 */
function base64UrlEncode(str) {
    const bytes = new TextEncoder().encode(str);
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Parse JWT token into components
 * @param {string} token - JWT token (header.payload.signature)
 * @returns {Object|null} Parsed components or null if invalid
 */
function parseJWT(token) {
    if (typeof token !== 'string') {
        return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
        logger.warn('Invalid JWT format: expected 3 parts, got', parts.length);
        return null;
    }

    try {
        const header = JSON.parse(base64UrlDecode(parts[0]));
        const payload = JSON.parse(base64UrlDecode(parts[1]));

        return {
            header,
            payload,
            signature: parts[2],
            raw: token
        };
    } catch (e) {
        logger.error('Failed to parse JWT:', e);
        return null;
    }
}

// ==========================================
// Signature Verification
// ==========================================

/**
 * Import HMAC key for verification
 * @param {string} secret - Secret key as hex string
 * @returns {Promise<CryptoKey>} Imported key
 */
async function importHMACKey(secret) {
    const secretBytes = new Uint8Array(
        secret.match(/[\da-f]{2}/gi)?.map(h => parseInt(h, 16)) || []
    );

    return crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );
}

/**
 * Verify HMAC-SHA256 signature
 * @param {string} data - Data that was signed
 * @param {string} signature - Base64URL signature
 * @param {string} secretHex - Secret key as hex
 * @returns {Promise<boolean>} True if signature valid
 */
async function verifyHMAC(data, signature, secretHex) {
    try {
        const key = await importHMACKey(secretHex);

        // Decode signature - base64UrlDecodeToBytes returns raw bytes
        const sigBytes = base64UrlDecodeToBytes(signature);

        // Create data to verify (header.payload)
        const dataBytes = new TextEncoder().encode(data);

        return await crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
    } catch (e) {
        logger.error('HMAC verification failed:', e);
        return false;
    }
}

/**
 * Derive verification secret from environment
 * Uses domain binding to prevent cross-origin use
 * @returns {Promise<string>} Derived secret as hex
 */
async function deriveVerificationSecret() {
    // Obfuscated base secret (XOR encoded for basic protection)
    const OBF_SECRET_1 = [0x52, 0x43, 0x6c, 0x69, 0x63, 0x6e, 0x73, 0x65, 0x5f, 0x4b, 0x65, 0x79, 0x5f];
    const OBF_SECRET_2 = [0x3f, 0x7c, 0x5f, 0x18, 0x0a, 0x03, 0x2c, 0x5e, 0x3f, 0x3c, 0x58, 0x0f, 0x3f];

    // XOR decode
    const baseSecret = new Uint8Array(OBF_SECRET_1.length);
    for (let i = 0; i < OBF_SECRET_1.length; i++) {
        baseSecret[i] = OBF_SECRET_1[i] ^ OBF_SECRET_2[i];
    }

    // Add domain binding
    const origin = new TextEncoder().encode(window.location.origin);
    const combined = new Uint8Array(baseSecret.length + origin.length);
    combined.set(baseSecret);
    combined.set(origin, baseSecret.length);

    // Hash to create final secret
    const hash = await crypto.subtle.digest('SHA-256', combined);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================
// License Verification
// ==========================================

/**
 * Verify license token signature and validity
 * @param {string} licenseToken - JWT license token
 * @returns {Promise<Object>} Verification result
 */
async function verifyLicense(licenseToken) {
    // Parse JWT
    const jwt = parseJWT(licenseToken);
    if (!jwt) {
        return {
            valid: false,
            error: 'INVALID_FORMAT',
            message: 'License token must be in JWT format (header.payload.signature)'
        };
    }

    // Verify header
    if (jwt.header.alg !== 'HS256') {
        return {
            valid: false,
            error: 'UNSUPPORTED_ALGORITHM',
            message: `Unsupported algorithm: ${jwt.header.alg}. Expected HS256.`
        };
    }
    if (jwt.header.typ !== 'JWT') {
        return {
            valid: false,
            error: 'INVALID_TYPE',
            message: `Invalid type: ${jwt.header.typ}. Expected JWT.`
        };
    }

    // Verify signature
    const secret = await deriveVerificationSecret();
    const signedData = licenseToken.split('.').slice(0, 2).join('.');

    const signatureValid = await verifyHMAC(signedData, jwt.signature, secret);
    if (!signatureValid) {
        return {
            valid: false,
            error: 'INVALID_SIGNATURE',
            message: 'License signature verification failed. Token may have been tampered with.'
        };
    }

    // Verify payload structure
    const payload = jwt.payload;
    if (!payload.tier || !['sovereign', 'chamber', 'curator'].includes(payload.tier)) {
        return {
            valid: false,
            error: 'INVALID_TIER',
            message: `Invalid tier: ${payload.tier}`
        };
    }

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
        return {
            valid: false,
            error: 'EXPIRED',
            message: `License expired at ${new Date(payload.exp * 1000).toISOString()}`
        };
    }

    // Verify not before
    if (payload.nbf && payload.nbf > now) {
        return {
            valid: false,
            error: 'NOT_YET_VALID',
            message: `License not valid until ${new Date(payload.nbf * 1000).toISOString()}`
        };
    }

    // Verify device binding if present
    if (payload.deviceBinding) {
        const deviceFingerprint = await generateDeviceFingerprint();
        if (payload.deviceBinding !== deviceFingerprint) {
            return {
                valid: false,
                error: 'DEVICE_MISMATCH',
                message: 'License is bound to a different device'
            };
        }
    }

    // License is valid
    return {
        valid: true,
        tier: payload.tier,
        instanceId: payload.instanceId || null,
        activatedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        features: payload.features || []
    };
}

// ==========================================
// License Storage with Integrity
// ==========================================

/**
 * Store license with integrity checksum
 * @param {string} licenseToken - Raw JWT token
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<boolean>} Success status
 */
async function storeLicense(licenseToken, metadata = {}) {
    try {
        // Verify before storing
        const verification = await verifyLicense(licenseToken);
        if (!verification.valid) {
            logger.error('Cannot store invalid license:', verification.error);
            return false;
        }

        // Create integrity checksum
        const checksumInput = `${licenseToken}:${verification.tier}:${await generateDeviceFingerprint()}`;
        const checksumBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(checksumInput));
        const checksum = Array.from(new Uint8Array(checksumBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

        // Store with integrity protection
        const licenseData = {
            token: licenseToken,  // Store signed token, not just data
            checksum,
            tier: verification.tier,
            storedAt: Date.now(),
            metadata
        };

        localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(licenseData));

        // Update cache
        updateCache(verification);

        logger.info('License stored with integrity protection:', verification.tier);
        return true;

    } catch (e) {
        logger.error('Failed to store license:', e);
        return false;
    }
}

/**
 * Load and verify stored license
 * @returns {Promise<Object|null>} Verified license data or null
 */
async function loadLicense() {
    try {
        const stored = localStorage.getItem(LICENSE_STORAGE_KEY);
        if (!stored) {
            return null;
        }

        const licenseData = JSON.parse(stored);

        // Verify integrity
        const checksumInput = `${licenseData.token}:${licenseData.tier}:${await generateDeviceFingerprint()}`;
        const checksumBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(checksumInput));
        const expectedChecksum = Array.from(new Uint8Array(checksumBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

        if (licenseData.checksum !== expectedChecksum) {
            logger.error('License integrity check failed - data may be corrupted or tampered');
            localStorage.removeItem(LICENSE_STORAGE_KEY);
            return null;
        }

        // Verify signature (prevents localStorage tampering)
        const verification = await verifyLicense(licenseData.token);
        if (!verification.valid) {
            logger.warn('Stored license verification failed:', verification.error);
            // Don't delete - let server revalidate
            return { ...verification, fromCache: true };
        }

        return {
            ...verification,
            storedAt: licenseData.storedAt,
            metadata: licenseData.metadata
        };

    } catch (e) {
        logger.error('Failed to load license:', e);
        return null;
    }
}

/**
 * Remove stored license
 */
function clearLicense() {
    localStorage.removeItem(LICENSE_STORAGE_KEY);
    localStorage.removeItem(LICENSE_CACHE_KEY);
    logger.info('License cleared');
}

// ==========================================
// Caching
// ==========================================

/**
 * Update verification cache
 * @param {Object} verification - Verification result
 */
function updateCache(verification) {
    const cache = {
        valid: verification.valid,
        tier: verification.tier,
        expiresAt: verification.expiresAt,
        cachedAt: Date.now()
    };
    localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify(cache));
}

/**
 * Get cached verification if still valid
 * @returns {Object|null} Cached verification or null
 */
function getCachedVerification() {
    try {
        const cached = localStorage.getItem(LICENSE_CACHE_KEY);
        if (!cached) {
            return null;
        }

        const cache = JSON.parse(cached);
        const age = Date.now() - cache.cachedAt;

        if (age > LICENSE_CACHE_DURATION) {
            localStorage.removeItem(LICENSE_CACHE_KEY);
            return null;
        }

        return cache;
    } catch (e) {
        return null;
    }
}

// ==========================================
// Status Checks
// ==========================================

/**
 * Check if user has premium tier
 * @returns {Promise<boolean>} True if premium
 */
async function isPremium() {
    const license = await loadLicense();
    if (!license || !license.valid) {
        return false;
    }

    return ['chamber', 'curator'].includes(license.tier);
}

/**
 * Get current tier
 * @returns {Promise<string>} Current tier name
 */
async function getCurrentTier() {
    const license = await loadLicense();
    if (!license || !license.valid) {
        return 'sovereign';
    }

    return license.tier;
}

/**
 * Check feature access
 * @param {string} feature - Feature name
 * @returns {Promise<boolean>} True if feature is available
 */
async function hasFeatureAccess(feature) {
    const license = await loadLicense();

    // Sovereign tier has basic features
    if (!license || !license.valid) {
        const sovereignFeatures = ['basic_analysis', 'chat', 'one_playlist'];
        return sovereignFeatures.includes(feature);
    }

    // Check if feature is in tier's feature list
    if (license.features && license.features.length > 0) {
        return license.features.includes(feature);
    }

    // Default tier-based access
    if (license.tier === 'chamber' || license.tier === 'curator') {
        return true; // All features for premium
    }

    return false;
}

// ==========================================
// Exports
// ==========================================

export const LicenseVerifier = {
    // Verification
    verifyLicense,
    loadLicense,
    storeLicense,
    clearLicense,

    // Status
    isPremium,
    getCurrentTier,
    hasFeatureAccess,

    // Utilities
    parseJWT,
    generateDeviceFingerprint,

    // Constants
    LICENSE_STORAGE_KEY,
    LICENSE_CACHE_KEY,
    LICENSE_CACHE_DURATION
};

export default LicenseVerifier;

logger.info('Cryptographic license verifier loaded');
