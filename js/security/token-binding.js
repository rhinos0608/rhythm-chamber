/**
 * Token Binding - Device-bound token security
 *
 * Binds access tokens to device fingerprints to mitigate token theft.
 * Uses Web Crypto API for secure fingerprint generation.
 *
 * @module security/token-binding
 */

'use strict';

// ==========================================
// Constants
// ==========================================

const SESSION_SALT_KEY = 'rhythm_chamber_session_salt';
const DEVICE_ID_KEY = 'rhythm_chamber_device_id';
const TOKEN_BINDING_PREFIX = 'rhythm_chamber_token_binding_';

// ==========================================
// Private State
// ==========================================

let _lastFailure = null;
let _secureContextAvailable = null;  // null = not yet checked, checked at runtime
let _fallbackReason = null;

// ==========================================
// Secure Context Detection
// ==========================================

function checkSecureContext() {
    // In test environments, window.isSecureContext might be undefined
    // Only check if window exists and isSecureContext is explicitly false
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
        return {
            secure: false,
            reason: 'Insecure context: App must be accessed via HTTPS or localhost'
        };
    }

    if (!crypto?.subtle) {
        return {
            secure: false,
            reason: 'Web Crypto API unavailable: Please use a modern browser with crypto.subtle support'
        };
    }

    if (typeof crypto?.getRandomValues !== 'function') {
        return {
            secure: false,
            reason: 'CSPRNG unavailable: crypto.getRandomValues is required for secure operations'
        };
    }

    return { secure: true };
}

/**
 * Check and cache secure context availability
 * @returns {{secure: boolean, reason?: string}}
*/
function ensureSecureContextChecked() {
    if (_secureContextAvailable === null) {
        const contextCheck = checkSecureContext();
        _secureContextAvailable = contextCheck.secure;
        if (!contextCheck.secure) {
            _fallbackReason = contextCheck.reason;
            console.warn('[TokenBinding] Secure context unavailable:', contextCheck.reason);
        }
    }
    return {
        secure: _secureContextAvailable,
        reason: _fallbackReason
    };
}

// ==========================================
// Session Salt Management
// ==========================================

/**
 * Get or create session salt for additional entropy
 * @returns {string|null} Cryptographically random salt, or null if unavailable
 */
function getSessionSalt() {
    const context = ensureSecureContextChecked();
    if (!context.secure) {
        return null;
    }

    let salt = sessionStorage.getItem(SESSION_SALT_KEY);
    if (!salt) {
        if (typeof crypto?.getRandomValues !== 'function') {
            return null;
        }

        // Use crypto.randomUUID if available, otherwise fallback to getRandomValues
        if (crypto.randomUUID) {
            salt = crypto.randomUUID();
        } else {
            const randomBytes = new Uint8Array(16);
            crypto.getRandomValues(randomBytes);
            salt = Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');
        }
        sessionStorage.setItem(SESSION_SALT_KEY, salt);
    }
    return salt;
}

// ==========================================
// Device Fingerprinting
// ==========================================

/**
 * Generate a stable device fingerprint using a stored UUID.
 * @returns {Promise<string|null>} SHA-256 hash of the stable device UUID (truncated to 16 chars), or null if unavailable
 */
async function generateDeviceFingerprint() {
    const context = ensureSecureContextChecked();
    if (!context.secure) {
        _lastFailure = {
            code: 'INSECURE_CONTEXT',
            userMessage: context.reason || 'Secure context required. Please access via HTTPS or localhost.',
            technicalDetails: 'crypto.subtle is unavailable'
        };
        return null;
    }

    try {
        // Ensure session salt exists
        getSessionSalt();

        // Get or create stable device ID
        let deviceId = localStorage.getItem(DEVICE_ID_KEY);
        if (!deviceId) {
            // Use crypto.randomUUID if available, otherwise use getRandomValues
            if (crypto.randomUUID) {
                deviceId = crypto.randomUUID();
            } else {
                const randomBytes = new Uint8Array(16);
                crypto.getRandomValues(randomBytes);
                deviceId = Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');
            }
            localStorage.setItem(DEVICE_ID_KEY, deviceId);
        }

        // Hash the device ID for the fingerprint
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(deviceId);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));

        // Return as hex string, truncated to 16 characters for compatibility
        const fingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return fingerprint.substring(0, 16);
    } catch (error) {
        _lastFailure = {
            code: 'FINGERPRINT_FAILED',
            userMessage: 'Failed to generate device fingerprint. Please use a modern browser.',
            technicalDetails: error.message
        };
        return null;
    }
}

// ==========================================
// Token Binding Operations
// ==========================================

/**
 * Create a token binding for the given access token.
 * Binds the token to the current device fingerprint.
 *
 * @param {string} token - The access token to bind
 * @returns {Promise<boolean>} true if binding created successfully, false otherwise
 */
async function createTokenBinding(token) {
    const context = ensureSecureContextChecked();
    if (!context.secure) {
        _lastFailure = {
            code: 'INSECURE_CONTEXT',
            userMessage: context.reason || 'Secure context required. Please access via HTTPS or localhost.',
            technicalDetails: 'crypto.subtle is unavailable'
        };
        return false;
    }

    if (!token || typeof token !== 'string') {
        _lastFailure = {
            code: 'INVALID_TOKEN',
            userMessage: 'Invalid token provided',
            technicalDetails: 'Token must be a non-empty string'
        };
        return false;
    }

    try {
        const fingerprint = await generateDeviceFingerprint();
        if (!fingerprint) {
            return false;
        }

        const binding = {
            token,
            fingerprint,
            createdAt: Date.now(),
            salt: getSessionSalt()
        };

        const bindingKey = TOKEN_BINDING_PREFIX + token;
        localStorage.setItem(bindingKey, JSON.stringify(binding));

        _lastFailure = null;
        return true;
    } catch (error) {
        _lastFailure = {
            code: 'BINDING_FAILED',
            userMessage: 'Failed to create token binding',
            technicalDetails: error.message
        };
        return false;
    }
}

/**
 * Verify that a token binding matches the current device.
 *
 * @param {string} token - The access token to verify
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
async function verifyTokenBinding(token) {
    const context = ensureSecureContextChecked();
    if (!context.secure) {
        return {
            valid: false,
            reason: 'insecure_context'
        };
    }

    try {
        const bindingKey = TOKEN_BINDING_PREFIX + token;
        const bindingJson = localStorage.getItem(bindingKey);

        if (!bindingJson) {
            return {
                valid: false,
                reason: 'no_binding'
            };
        }

        const binding = JSON.parse(bindingJson);
        const currentFingerprint = await generateDeviceFingerprint();

        if (binding.fingerprint !== currentFingerprint) {
            return {
                valid: false,
                reason: 'fingerprint_mismatch'
            };
        }

        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            reason: 'verification_failed'
        };
    }
}

/**
 * Clear a token binding.
 *
 * @param {string} token - The access token whose binding to clear
 * @returns {boolean} true if binding was cleared
 */
function clearTokenBinding(token) {
    if (!token) {
        return false;
    }

    const bindingKey = TOKEN_BINDING_PREFIX + token;
    localStorage.removeItem(bindingKey);
    return true;
}

/**
 * Get the last failure details.
 *
 * @returns {Object|null} Last failure object with code, userMessage, and technicalDetails
 */
function getTokenBindingFailure() {
    return _lastFailure;
}

// ==========================================
// Public API
// ==========================================

export const TokenBinding = {
    // Check if secure context is available
    isSecureContextAvailable: () => {
        const context = ensureSecureContextChecked();
        return context.secure;
    },
    getFallbackReason: () => {
        const context = ensureSecureContextChecked();
        return context.reason;
    },

    // Token binding operations
    createTokenBinding,
    verifyTokenBinding,
    clearTokenBinding,

    // Device fingerprinting
    generateDeviceFingerprint,

    // Diagnostics
    getTokenBindingFailure,
    checkSecureContext
};

// Also export individual functions for named imports
export {
    createTokenBinding,
    verifyTokenBinding,
    clearTokenBinding,
    generateDeviceFingerprint,
    getTokenBindingFailure,
    checkSecureContext,
    getSessionSalt
};
