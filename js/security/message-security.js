/**
 * Message Security Module for Rhythm Chamber
 *
 * Provides message signing and verification for secure communication:
 * - HMAC-SHA256 message signing
 * - Message verification with tamper detection
 * - Timestamp validation for replay prevention
 * - Secure transmission helpers
 *
 * THREAT MODEL:
 * - Protects against message tampering in transit
 * - Detects replay attacks through timestamp validation
 * - Ensures message integrity between components
 *
 * @module security/message-security
 */

'use strict';

// ==========================================
// Constants
// ==========================================

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
const MIN_TIMESTAMP_MS = -5 * 60 * 1000; // Allow 5 minutes clock skew
const SIGNATURE_HEADER = 'rhythm-signature-v1:';
const NONCE_STORE_KEY = 'rhythm_chamber_message_nonces';
const MAX_NONCES = 1000;

// ==========================================
// Secure Context
// ==========================================

/**
 * Check if running in a secure context with crypto.subtle available
 * @returns {boolean} True if secure context available
 */
function isSecureContextAvailable() {
    return typeof window !== 'undefined' &&
           window.isSecureContext &&
           crypto?.subtle;
}

// ==========================================
// Nonce Storage for Replay Prevention
// ==========================================

/**
 * Get stored nonces for replay detection
 * @returns {Set<string>} Set of used nonces
 */
function getNonceStore() {
    try {
        const stored = localStorage.getItem(NONCE_STORE_KEY);
        if (!stored) return new Set();

        const nonces = JSON.parse(stored);
        // Clean old nonces (keep only recent ones)
        const now = Date.now();
        const filtered = nonces.filter(n => (now - n.timestamp) < TIMESTAMP_TOLERANCE_MS * 2);

        // Update storage if we cleaned any
        if (filtered.length !== nonces.length) {
            localStorage.setItem(NONCE_STORE_KEY, JSON.stringify(filtered));
        }

        return new Set(filtered.map(n => n.value));
    } catch (e) {
        console.warn('[MessageSecurity] Failed to read nonce store:', e);
        return new Set();
    }
}

/**
 * Store a nonce to prevent replay attacks
 * @param {string} nonce - Nonce value to store
 * @returns {boolean} True if stored successfully
 */
function storeNonce(nonce) {
    try {
        const stored = localStorage.getItem(NONCE_STORE_KEY);
        const nonces = stored ? JSON.parse(stored) : [];

        // Add new nonce
        nonces.push({ value: nonce, timestamp: Date.now() });

        // Trim to max size
        if (nonces.length > MAX_NONCES) {
            nonces.splice(0, nonces.length - MAX_NONCES);
        }

        localStorage.setItem(NONCE_STORE_KEY, JSON.stringify(nonces));
        return true;
    } catch (e) {
        console.warn('[MessageSecurity] Failed to store nonce:', e);
        return false;
    }
}

/**
 * Check if a nonce has been used before
 * @param {string} nonce - Nonce to check
 * @returns {boolean} True if nonce was already used
 */
function isNonceUsed(nonce) {
    const nonces = getNonceStore();
    return nonces.has(nonce);
}

/**
 * Clear old nonces from storage
 * @returns {number} Number of nonces cleared
 */
function clearOldNonces() {
    try {
        const stored = localStorage.getItem(NONCE_STORE_KEY);
        if (!stored) return 0;

        const nonces = JSON.parse(stored);
        const now = Date.now();
        const beforeCount = nonces.length;

        // Remove nonces older than 2x tolerance
        const filtered = nonces.filter(n => (now - n.timestamp) < TIMESTAMP_TOLERANCE_MS * 2);

        localStorage.setItem(NONCE_STORE_KEY, JSON.stringify(filtered));

        return beforeCount - filtered.length;
    } catch (e) {
        console.warn('[MessageSecurity] Failed to clear nonces:', e);
        return 0;
    }
}

/**
 * Clear all nonces (use after session invalidation)
 */
function clearAllNonces() {
    localStorage.removeItem(NONCE_STORE_KEY);
    console.log('[MessageSecurity] All nonces cleared');
}

// ==========================================
// Key Derivation for HMAC
// ==========================================

/**
 * Import a key for HMAC signing
 * @param {string} secret - Secret string
 * @returns {Promise<CryptoKey>} HMAC key
 */
async function importHMACKey(secret) {
    if (!isSecureContextAvailable()) {
        throw new Error('[MessageSecurity] Secure context required for HMAC operations');
    }

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HKDF' },
        false,
        ['deriveBits', 'deriveKey']
    );

    // Derive a proper HMAC key from the secret
    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: encoder.encode('rhythm-chamber-hmac-salt'),
            info: encoder.encode('message-signing')
        },
        keyMaterial,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign', 'verify']
    );
}

/**
 * Import a raw key for HMAC (alternative method)
 * @param {string} secret - Secret string
 * @returns {Promise<CryptoKey>} HMAC key
 */
async function importRawHMACKey(secret) {
    if (!isSecureContextAvailable()) {
        throw new Error('[MessageSecurity] Secure context required for HMAC operations');
    }

    const encoder = new TextEncoder();
    return crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

// ==========================================
// Message Signing
// ==========================================

/**
 * Sign a message using HMAC-SHA256
 * @param {string} message - Message to sign
 * @param {string} secret - Secret key for signing
 * @returns {Promise<string>} Base64-encoded signature
 */
async function sign(message, secret) {
    if (!isSecureContextAvailable()) {
        throw new Error('[MessageSecurity] Secure context required for signing');
    }

    if (!message || typeof message !== 'string') {
        throw new Error('[MessageSecurity] Message must be a non-empty string');
    }

    if (!secret || typeof secret !== 'string') {
        throw new Error('[MessageSecurity] Secret must be a non-empty string');
    }

    try {
        const key = await importRawHMACKey(secret);
        const encoder = new TextEncoder();
        const data = encoder.encode(message);

        const signature = await crypto.subtle.sign('HMAC', key, data);

        // Convert to base64
        const signatureBytes = new Uint8Array(signature);
        return btoa(String.fromCharCode(...signatureBytes));
    } catch (e) {
        console.error('[MessageSecurity] Signing failed:', e);
        throw new Error(`[MessageSecurity] Failed to sign message: ${e.message}`);
    }
}

/**
 * Sign a message with timestamp and nonce
 * @param {string} message - Message to sign
 * @param {string} secret - Secret key for signing
 * @param {Object} options - Signing options
 * @returns {Promise<Object>} Signed message object
 */
async function signWithTimestamp(message, secret, options = {}) {
    const timestamp = options.timestamp || Date.now();
    const nonce = options.nonce || crypto.randomUUID();

    // Create the payload to sign
    const payload = JSON.stringify({
        message,
        timestamp,
        nonce
    });

    const signature = await sign(payload, secret);

    return {
        message,
        timestamp,
        nonce,
        signature: SIGNATURE_HEADER + signature
    };
}

/**
 * Verify a message signature using HMAC-SHA256
 * @param {string} message - Original message
 * @param {string} signature - Signature to verify
 * @param {string} secret - Secret key for verification
 * @returns {Promise<boolean>} True if signature is valid
 */
async function verify(message, signature, secret) {
    if (!isSecureContextAvailable()) {
        console.warn('[MessageSecurity] Cannot verify: insecure context');
        return false;
    }

    if (!message || !signature || !secret) {
        console.warn('[MessageSecurity] Missing required parameters for verification');
        return false;
    }

    try {
        // Strip header if present
        const sigToCheck = signature.startsWith(SIGNATURE_HEADER)
            ? signature.slice(SIGNATURE_HEADER.length)
            : signature;

        const expectedSignature = await sign(message, secret);

        // Constant-time comparison to prevent timing attacks
        return constantTimeCompare(sigToCheck, expectedSignature);
    } catch (e) {
        console.error('[MessageSecurity] Verification failed:', e);
        return false;
    }
}

/**
 * Verify a signed message with timestamp and nonce
 * @param {Object} signedMessage - Signed message object
 * @param {string} secret - Secret key for verification
 * @param {Object} options - Verification options
 * @returns {Promise<{ valid: boolean, reason?: string }>} Verification result
 */
async function verifySignedMessage(signedMessage, secret, options = {}) {
    const {
        skipTimestampCheck = false,
        skipNonceCheck = false,
        customTolerance = null
    } = options;

    // Validate structure
    if (!signedMessage || typeof signedMessage !== 'object') {
        return { valid: false, reason: 'invalid_structure' };
    }

    const { message, timestamp, nonce, signature } = signedMessage;

    if (!message || !signature) {
        return { valid: false, reason: 'missing_required_fields' };
    }

    // Strip header if present
    const sigToCheck = signature.startsWith(SIGNATURE_HEADER)
        ? signature.slice(SIGNATURE_HEADER.length)
        : signature;

    // Check timestamp if provided
    if (!skipTimestampCheck && timestamp != null) {
        const now = Date.now();
        const tolerance = customTolerance || TIMESTAMP_TOLERANCE_MS;
        const age = now - timestamp;

        if (age > tolerance) {
            return { valid: false, reason: 'timestamp_expired' };
        }

        if (age < MIN_TIMESTAMP_MS) {
            return { valid: false, reason: 'timestamp_future' };
        }
    }

    // Check nonce if provided
    if (!skipNonceCheck && nonce) {
        if (isNonceUsed(nonce)) {
            return { valid: false, reason: 'nonce_reused' };
        }
    }

    // Verify signature
    const payload = JSON.stringify({
        message,
        timestamp,
        nonce
    });

    try {
        const expectedSignature = await sign(payload, secret);

        if (!constantTimeCompare(sigToCheck, expectedSignature)) {
            return { valid: false, reason: 'signature_mismatch' };
        }
    } catch (e) {
        console.error('[MessageSecurity] Signature verification error:', e);
        return { valid: false, reason: 'verification_error' };
    }

    // Store nonce if check passed
    if (!skipNonceCheck && nonce) {
        storeNonce(nonce);
    }

    return { valid: true };
}

// ==========================================
// Timing Attack Prevention
// ==========================================

/**
 * Constant-time string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
function constantTimeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }

    // Use TextEncoder to get byte arrays
    const encoder = new TextEncoder();
    const bytesA = encoder.encode(a);
    const bytesB = encoder.encode(b);

    if (bytesA.length !== bytesB.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < bytesA.length; i++) {
        result |= bytesA[i] ^ bytesB[i];
    }

    return result === 0;
}

// ==========================================
// Tamper Detection
// ==========================================

/**
 * Create a tamper-evident message container
 * @param {string} message - Message content
 * @param {string} secret - Secret key
 * @returns {Promise<string>} Encoded tamper-evident message
 */
async function createTamperEvidentMessage(message, secret) {
    const signed = await signWithTimestamp(message, secret);
    return JSON.stringify(signed);
}

/**
 * Detect if a message has been tampered with
 * @param {string} encodedMessage - Encoded tamper-evident message
 * @param {string} secret - Secret key
 * @returns {Promise<{ intact: boolean, message?: string, reason?: string }>}
 */
async function detectTampering(encodedMessage, secret) {
    try {
        const signed = JSON.parse(encodedMessage);
        const result = await verifySignedMessage(signed, secret);

        if (result.valid) {
            return { intact: true, message: signed.message };
        }

        return { intact: false, reason: result.reason || 'verification_failed' };
    } catch (e) {
        console.error('[MessageSecurity] Tamper detection error:', e);
        return { intact: false, reason: 'parse_error' };
    }
}

/**
 * Check if data structure has been modified
 * @param {Object} data - Data object to check
 * @param {string} signature - Expected signature
 * @param {string} secret - Secret key
 * @returns {Promise<boolean>} True if data is intact
 */
async function verifyDataIntegrity(data, signature, secret) {
    const serialized = JSON.stringify(data);
    return verify(serialized, signature, secret);
}

// ==========================================
// Secure Transmission Helpers
// ==========================================

/**
 * Create a secure transmission package
 * @param {Object|string} payload - Data to transmit
 * @param {string} secret - Secret key
 * @returns {Promise<Object>} Secure package object
 */
async function createSecurePackage(payload, secret) {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const signed = await signWithTimestamp(message, secret);

    return {
        version: 1,
        ...signed,
        encoding: 'utf-8'
    };
}

/**
 * Open a secure transmission package
 * @param {Object} pkg - Package to open
 * @param {string} secret - Secret key
 * @param {Object} options - Verification options
 * @returns {Promise<{ valid: boolean, data?: any, reason?: string }>}
 */
async function openSecurePackage(pkg, secret, options = {}) {
    if (!pkg || typeof pkg !== 'object') {
        return { valid: false, reason: 'invalid_package' };
    }

    const result = await verifySignedMessage(pkg, secret, options);

    if (!result.valid) {
        return { valid: false, reason: result.reason };
    }

    try {
        const data = JSON.parse(pkg.message);
        return { valid: true, data };
    } catch {
        // Not JSON, return as string
        return { valid: true, data: pkg.message };
    }
}

/**
 * Sign an HTTP request for transmission
 * @param {Object} request - Request object with method, url, body
 * @param {string} secret - Secret key
 * @returns {Promise<Object>} Request with signature header
 */
async function signRequest(request, secret) {
    const { method = 'GET', url, body = '' } = request;

    // Create canonical request string
    const canonical = `${method.toUpperCase()}\n${url}\n${body}`;
    const signature = await sign(canonical, secret);

    return {
        ...request,
        headers: {
            ...request.headers,
            'X-Rhythm-Signature': SIGNATURE_HEADER + signature,
            'X-Rhythm-Timestamp': Date.now().toString()
        }
    };
}

/**
 * Verify an incoming signed request
 * @param {Object} request - Request object
 * @param {string} secret - Secret key
 * @returns {Promise<boolean>} True if request signature is valid
 */
async function verifyRequest(request, secret) {
    const { method = 'GET', url, body = '', headers = {} } = request;
    const signature = headers['X-Rhythm-Signature'] || headers['x-rhythm-signature'];

    if (!signature) {
        return false;
    }

    const canonical = `${method.toUpperCase()}\n${url}\n${body}`;
    return verify(canonical, signature, secret);
}

// ==========================================
// Timestamp Validation
// ==========================================

/**
 * Validate a timestamp is within acceptable bounds
 * @param {number} timestamp - Timestamp to validate
 * @param {Object} options - Validation options
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateTimestamp(timestamp, options = {}) {
    const {
        tolerance = TIMESTAMP_TOLERANCE_MS,
        minSkew = MIN_TIMESTAMP_MS,
        now = null
    } = options;

    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
        return { valid: false, reason: 'invalid_timestamp' };
    }

    const currentTime = now || Date.now();
    const age = currentTime - timestamp;

    if (age > tolerance) {
        return { valid: false, reason: 'timestamp_expired', age };
    }

    if (age < minSkew) {
        return { valid: false, reason: 'timestamp_future', age };
    }

    return { valid: true };
}

/**
 * Generate a fresh timestamp for signing
 * @returns {number} Current timestamp
 */
function generateTimestamp() {
    return Date.now();
}

/**
 * Generate a cryptographic nonce
 * @returns {string} UUID nonce
 */
function generateNonce() {
    if (typeof crypto?.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    // Fallback using getRandomValues
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================
// Batch Operations
// ==========================================

/**
 * Sign multiple messages efficiently
 * @param {Array<string>} messages - Messages to sign
 * @param {string} secret - Secret key
 * @returns {Promise<Array<string>>} Array of signatures
 */
async function signBatch(messages, secret) {
    if (!isSecureContextAvailable()) {
        throw new Error('[MessageSecurity] Secure context required for batch signing');
    }

    const key = await importRawHMACKey(secret);
    const encoder = new TextEncoder();

    const signatures = await Promise.all(
        messages.map(async (message) => {
            const data = encoder.encode(message);
            const sig = await crypto.subtle.sign('HMAC', key, data);
            const bytes = new Uint8Array(sig);
            return btoa(String.fromCharCode(...bytes));
        })
    );

    return signatures;
}

/**
 * Verify multiple message signatures
 * @param {Array<{ message: string, signature: string }>} items - Items to verify
 * @param {string} secret - Secret key
 * @returns {Promise<Array<boolean>>} Array of verification results
 */
async function verifyBatch(items, secret) {
    const results = await Promise.all(
        items.map(item => verify(item.message, item.signature, secret))
    );
    return results;
}

// ==========================================
// Public API
// ==========================================

export const MessageSecurity = {
    // Context check
    isSecureContextAvailable,

    // Signing
    sign,
    signWithTimestamp,
    createTamperEvidentMessage,

    // Verification
    verify,
    verifySignedMessage,
    detectTampering,
    verifyDataIntegrity,

    // Nonce management
    clearOldNonces,
    clearAllNonces,

    // Secure transmission
    createSecurePackage,
    openSecurePackage,
    signRequest,
    verifyRequest,

    // Timestamp utilities
    validateTimestamp,
    generateTimestamp,
    generateNonce,

    // Batch operations
    signBatch,
    verifyBatch,

    // Constants
    TIMESTAMP_TOLERANCE_MS,
    SIGNATURE_HEADER
};

// ES Module export
export default MessageSecurity;

console.log('[MessageSecurity] Message security module loaded');
