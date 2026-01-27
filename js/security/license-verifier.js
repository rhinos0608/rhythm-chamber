/**
 * Cryptographic License Verifier for Rhythm Chamber
 *
 * Provides secure JWT-based license verification using Web Crypto API with
 * ECDSA (Elliptic Curve Digital Signature Algorithm) asymmetric cryptography.
 *
 * Security Architecture:
 * - Private key: NEVER exposed to client, kept secure on license server
 * - Public key: Embedded in client code, used only for signature verification
 * - Licenses: Signed by server using ECDSA-P256 (secp256r1 curve)
 * - Offline mode: Verifies signatures using public key (no secrets in client)
 *
 * The use of asymmetric cryptography eliminates the vulnerability where
 * a secret key could be extracted from client code to forge licenses.
 * Even with full access to client code, an attacker cannot forge valid
 * license signatures without the private key.
 *
 * @module security/license-verifier
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('LicenseVerifier');

// ==========================================
// Configuration Constants
// ==========================================

const LICENSE_CACHE_KEY = 'rhythm_chamber_license_cache';
const LICENSE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const LICENSE_STORAGE_KEY = 'rhythm_chamber_license';

// Server configuration
const LICENSE_SERVER_URL = '/api/license/verify';
const LICENSE_VERIFY_TIMEOUT = 10000; // 10 seconds

// ==========================================
// ECDSA Public Key for Signature Verification
// ==========================================
//
// SECURITY NOTE: This is the PUBLIC KEY only. It cannot be used to sign licenses,
// only to verify signatures. The private key is kept secure on the license server.
//
// The public key is in SPKI (SubjectPublicKeyInfo) format encoded as base64URL.
// This is generated using ECDSA with the P-256 curve (secp256r1).
//
// To generate a new key pair (server-side only):
// ```javascript
// const keyPair = await crypto.subtle.generateKey(
//     { name: 'ECDSA', namedCurve: 'P-256' },
//     true,
//     ['sign', 'verify']
// );
// const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
// const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(publicKeySpki)))
//     .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
// // Keep privateKey secure on server, embed publicKeyB64 in client code
// ```
//
// Current public key for Rhythm Chamber production licenses:
const PUBLIC_KEY_SPKI = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' +
    '0qC6PgZMlZoAPsKP7dZBE8c7ey-OGBsyUkuhUUofAJG0imK28WHuY3BMQ' +
    'cVbXUFH74PUzIdyx6wlez4YQ9MFAQ';

// Device fingerprint for license binding
let _deviceFingerprint = null;

// Cached imported public key (to avoid re-importing)
let _importedPublicKey = null;

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
// ECDSA Signature Verification
// ==========================================

/**
 * Import the ECDSA public key for signature verification
 * The public key is cached to avoid repeated imports
 * @returns {Promise<CryptoKey>} Imported public key
 */
async function importPublicKey() {
    if (_importedPublicKey) {
        return _importedPublicKey;
    }

    try {
        // Decode base64URL public key to raw bytes
        const base64UrlToBase64 = (str) => {
            return str.replace(/-/g, '+').replace(/_/g, '/');
        };
        const base64PublicKey = base64UrlToBase64(PUBLIC_KEY_SPKI);
        const publicKeyBytes = Uint8Array.from(atob(base64PublicKey), c => c.charCodeAt(0));

        // Import the public key in SPKI format
        _importedPublicKey = await crypto.subtle.importKey(
            'spki',
            publicKeyBytes,
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            false, // Not extractable (security)
            ['verify']
        );

        logger.info('ECDSA public key imported successfully');
        return _importedPublicKey;
    } catch (e) {
        logger.error('Failed to import ECDSA public key:', e);
        throw new Error('PUBLIC_KEY_IMPORT_FAILED');
    }
}

/**
 * Verify ECDSA signature on JWT token
 * @param {string} data - The data that was signed (header.payload)
 * @param {string} signature - Base64URL encoded signature
 * @returns {Promise<boolean>} True if signature is valid
 */
async function verifyECDSA(data, signature) {
    try {
        const key = await importPublicKey();

        // Decode signature from base64URL to raw bytes
        const sigBytes = base64UrlDecodeToBytes(signature);

        // Create data bytes for verification
        const dataBytes = new TextEncoder().encode(data);

        // Verify signature using ECDSA with SHA-256 hash
        const isValid = await crypto.subtle.verify(
            {
                name: 'ECDSA',
                hash: { name: 'SHA-256' }
            },
            key,
            sigBytes,
            dataBytes
        );

        return isValid;
    } catch (e) {
        logger.error('ECDSA verification failed:', e);
        return false;
    }
}

// ==========================================
// Server-Side License Verification
// ==========================================

/**
 * Verify license token with server
 * @param {string} licenseToken - JWT license token
 * @returns {Promise<Object>} Server verification response
 */
async function verifyLicenseWithServer(licenseToken) {
    const deviceFingerprint = await generateDeviceFingerprint();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LICENSE_VERIFY_TIMEOUT);
    
    try {
        const response = await fetch(LICENSE_SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: licenseToken,
                deviceFingerprint: deviceFingerprint,
                origin: window.location.origin
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            // Server returned error status
            const errorData = await response.json().catch(() => ({}));
            return {
                valid: false,
                error: 'SERVER_ERROR',
                message: errorData.message || `Server error: ${response.status}`,
                serverError: true,
                statusCode: response.status
            };
        }
        
        const result = await response.json();
        
        return {
            valid: result.valid === true,
            tier: result.tier,
            instanceId: result.instanceId || null,
            activatedAt: result.activatedAt,
            expiresAt: result.expiresAt,
            features: result.features || [],
            offlineMode: false,
            serverVerified: true,
            error: result.valid === true ? null : (result.error || 'SERVER_REJECTED'),
            message: result.message
        };
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        // Network error - signal to fallback to offline mode
        if (error.name === 'AbortError' || error.name === 'TypeError' || error.message?.includes('fetch')) {
            return {
                valid: false,
                error: 'NETWORK_ERROR',
                message: 'Network unavailable, falling back to offline verification',
                networkError: true,
                offlineFallback: true
            };
        }
        
        return {
            valid: false,
            error: 'SERVER_VERIFICATION_FAILED',
            message: error.message || 'Server verification failed',
            serverError: true
        };
    }
}

// ==========================================
// Offline License Verification (ECDSA)
// ==========================================

/**
 * Check if previously verified license is cached for offline use
 * @returns {boolean} True if cached license exists
 */
function hasCachedLicense() {
    const cached = localStorage.getItem(LICENSE_STORAGE_KEY);
    return !!cached;
}

/**
 * Verify license in offline mode using ECDSA public key
 * This allows the app to function without server connectivity while
 * maintaining security - no secrets are stored in client code.
 *
 * @param {string} licenseToken - JWT license token
 * @returns {Promise<Object>} Verification result
 */
async function verifyLicenseOffline(licenseToken) {
    // Parse JWT
    const jwt = parseJWT(licenseToken);
    if (!jwt) {
        return {
            valid: false,
            error: 'INVALID_FORMAT',
            message: 'License token must be in JWT format (header.payload.signature)',
            offlineMode: true
        };
    }

    // Verify header - must use ES256 (ECDSA with P-256)
    if (jwt.header.alg !== 'ES256') {
        return {
            valid: false,
            error: 'UNSUPPORTED_ALGORITHM',
            message: `Unsupported algorithm: ${jwt.header.alg}. Expected ES256.`,
            offlineMode: true
        };
    }

    // Verify header type
    if (jwt.header.typ !== 'JWT') {
        return {
            valid: false,
            error: 'INVALID_TYPE',
            message: `Invalid token type: ${jwt.header.typ}. Expected JWT.`,
            offlineMode: true
        };
    }

    // Verify signature using ECDSA public key
    const signedData = licenseToken.split('.').slice(0, 2).join('.');
    const signatureValid = await verifyECDSA(signedData, jwt.signature);

    if (!signatureValid) {
        return {
            valid: false,
            error: 'INVALID_SIGNATURE',
            message: 'License signature verification failed. Token may have been tampered with or forged.',
            offlineMode: true
        };
    }

    // Verify payload structure
    const payload = jwt.payload;
    if (!payload.tier || !['sovereign', 'chamber', 'curator'].includes(payload.tier)) {
        return {
            valid: false,
            error: 'INVALID_TIER',
            message: `Invalid tier: ${payload.tier}`,
            offlineMode: true
        };
    }

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
        return {
            valid: false,
            error: 'EXPIRED',
            message: `License expired at ${new Date(payload.exp * 1000).toISOString()}`,
            offlineMode: true
        };
    }
    
    // Verify not before
    if (payload.nbf && payload.nbf > now) {
        return {
            valid: false,
            error: 'NOT_YET_VALID',
            message: `License not valid until ${new Date(payload.nbf * 1000).toISOString()}`,
            offlineMode: true
        };
    }
    
    // Verify device binding if present
    if (payload.deviceBinding) {
        const deviceFingerprint = await generateDeviceFingerprint();
        if (payload.deviceBinding !== deviceFingerprint) {
            return {
                valid: false,
                error: 'DEVICE_MISMATCH',
                message: 'License is bound to a different device',
                offlineMode: true
            };
        }
    }
    
    // License is valid in offline mode
    return {
        valid: true,
        tier: payload.tier,
        instanceId: payload.instanceId || null,
        activatedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        features: payload.features || [],
        offlineMode: true,
        serverVerified: false
    };
}

// ==========================================
// License Verification
// ==========================================

/**
 * Verify license token signature and validity
 * First attempts server-side validation, falls back to offline mode
 * @param {string} licenseToken - JWT license token
 * @returns {Promise<Object>} Verification result
 */
async function verifyLicense(licenseToken) {
    // First attempt: Server-side verification
    const serverResult = await verifyLicenseWithServer(licenseToken);
    
    if (serverResult.valid) {
        logger.info('License verified via server');
        return serverResult;
    }
    
    // If server returned a definitive invalid (not network error), don't fallback
    if (serverResult.serverError && !serverResult.offlineFallback) {
        logger.warn('Server rejected license:', serverResult.message);
        return {
            valid: false,
            error: serverResult.error,
            message: serverResult.message,
            offlineMode: false,
            serverVerified: false
        };
    }
    
    // Network error or server unavailable - fallback to offline verification
    if (serverResult.offlineFallback || serverResult.networkError) {
        logger.info('Falling back to offline license verification');
        return verifyLicenseOffline(licenseToken);
    }

    // If we have a cached license, try offline verification
    // (allows for grace period when server is having issues)
    if (hasCachedLicense()) {
        logger.info('Server unavailable, using offline verification');
        return verifyLicenseOffline(licenseToken);
    }
    
    return {
        valid: false,
        error: serverResult.error || 'VERIFICATION_FAILED',
        message: serverResult.message || 'License verification failed',
        offlineMode: false,
        serverVerified: false
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
            offlineMode: verification.offlineMode || false,
            serverVerified: verification.serverVerified || false,
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
        offlineMode: verification.offlineMode || false,
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
    verifyLicenseWithServer,
    verifyLicenseOffline,
    loadLicense,
    storeLicense,
    clearLicense,

    // Cache management (replaces offline key management)
    hasCachedLicense,

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
    LICENSE_CACHE_DURATION,
    LICENSE_SERVER_URL
};

export default LicenseVerifier;

logger.info('Cryptographic license verifier loaded (ECDSA with server+offline mode)');
