/**
 * SecureTokenStore - Single Authority Token Management
 * 
 * HNW Hierarchy: ONLY authority for token access.
 * All token operations MUST go through this module.
 * Direct localStorage/IndexedDB access for tokens is forbidden.
 * 
 * Features:
 * - Mandatory device binding verification on every access
 * - Automatic token invalidation on binding mismatch
 * - Audit logging of all token operations
 * - Impossible to bypass binding verification
 * 
 * @module security/secure-token-store
 */

'use strict';

import { IndexedDBCore } from '../storage/indexeddb.js';

// ==========================================
// Constants
// ==========================================

const TOKEN_STORE_PREFIX = 'secure_token_';
const BINDING_KEY = 'rhythm_chamber_secure_binding';
const AUDIT_KEY = 'rhythm_chamber_token_audit';
const SALT_KEY = 'rhythm_chamber_token_salt';
const DEVICE_ID_KEY = 'rhythm_chamber_device_id';
const MAX_AUDIT_ENTRIES = 100;

// ==========================================
// Private State
// ==========================================

// Symbol to prevent external access
const _internal = Symbol('SecureTokenStore.internal');
let _initialized = false;
let _deviceFingerprint = null;
let _bindingVerified = false;

// ==========================================
// Secure Context Enforcement
// ==========================================

/**
 * Ensure we're running in a Secure Context with crypto.subtle available.
 * Fails fast if requirements are not met.
 * @throws {Error} If not in a Secure Context or crypto.subtle unavailable
 */
function requireSecureContext() {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
        throw new Error(
            '[SecureTokenStore] Secure Context required. ' +
            'Please access the app via HTTPS or localhost.'
        );
    }
    if (!crypto?.subtle) {
        throw new Error(
            '[SecureTokenStore] crypto.subtle unavailable. ' +
            'Please access the app via HTTPS or localhost.'
        );
    }
}

// Enforce secure context at module load, but degrade to fallback instead of crashing
let _secureContextAvailable = true;
let _fallbackReason = null;  // Store the reason for fallback (for UI warnings)
let _hasWarnedAboutFallback = false;  // Track if we've already warned about fallback

try {
    requireSecureContext();
} catch (error) {
    _secureContextAvailable = false;
    _fallbackReason = error.message;
    console.warn('[SecureTokenStore] Secure context unavailable, running in fallback mode:', error.message);

    // Dispatch event for UI to show warning (best effort - may fire before listeners ready)
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('secure-context:unavailable', {
            detail: { reason: error.message }
        }));
    }
}

// ==========================================
// Device Fingerprinting (Stable UUID-based)
// ==========================================

/**
 * Generate a stable device fingerprint using a stored UUID.
 * Uses a UUID stored in localStorage for stability - browser characteristics
 * like screen size and userAgent are mutable and cause false binding mismatches.
 * @returns {Promise<string>} SHA-256 hash of the stable device UUID
 */
async function generateDeviceFingerprint() {
    if (!_secureContextAvailable) {
        console.warn('[SecureTokenStore] Cannot generate fingerprint: insecure context');
        return null;
    }

    // Get or create stable device ID
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
        console.log('[SecureTokenStore] Generated new device ID');
    }

    // Hash the device ID for the fingerprint
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(deviceId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create session salt for additional binding
 * @returns {string}
 */
function getSessionSalt() {
    if (!_secureContextAvailable) {
        return null;
    }

    let salt = sessionStorage.getItem(SALT_KEY);
    if (!salt) {
        salt = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36);
        sessionStorage.setItem(SALT_KEY, salt);
    }
    return salt;
}

// ==========================================
// Binding Verification (MANDATORY)
// ==========================================

/**
 * Create device binding on first token storage
 * @param {string} fingerprint - Device fingerprint
 * @returns {Promise<boolean>}
 */
async function createBinding(fingerprint) {
    const binding = {
        fingerprint,
        createdAt: Date.now(),
        salt: getSessionSalt()
    };

    try {
        localStorage.setItem(BINDING_KEY, JSON.stringify(binding));
        _bindingVerified = true;
        audit('binding_created', { fingerprint: fingerprint.substring(0, 8) + '...' });
        return true;
    } catch (error) {
        console.error('[SecureTokenStore] Failed to create binding:', error);
        return false;
    }
}

/**
 * Verify device binding - MANDATORY before any token operation
 * This function CANNOT be bypassed.
 * @returns {Promise<{ valid: boolean, reason?: string }>}
 */
async function verifyBinding() {
    if (!_secureContextAvailable) {
        return { valid: false, reason: 'insecure_context' };
    }

    // Always regenerate fingerprint for comparison
    const currentFingerprint = await generateDeviceFingerprint();
    _deviceFingerprint = currentFingerprint;

    // Get stored binding
    const bindingJson = localStorage.getItem(BINDING_KEY);

    if (!bindingJson) {
        // No binding exists yet - will be created on first store
        return { valid: true, reason: 'no_binding_yet' };
    }

    try {
        const binding = JSON.parse(bindingJson);

        if (binding.fingerprint !== currentFingerprint) {
            // BINDING MISMATCH - This is a security violation
            audit('binding_mismatch', {
                expected: binding.fingerprint.substring(0, 8) + '...',
                actual: currentFingerprint.substring(0, 8) + '...'
            });

            // Invalidate ALL tokens
            await invalidateAllTokens('binding_mismatch');

            return { valid: false, reason: 'fingerprint_mismatch' };
        }

        _bindingVerified = true;
        return { valid: true };
    } catch (error) {
        console.error('[SecureTokenStore] Binding verification error:', error);
        return { valid: false, reason: 'binding_corrupted' };
    }
}

/**
 * Verify device binding (READ-ONLY mode for diagnostics)
 * Same checks as verifyBinding() but does NOT invalidate tokens on mismatch.
 * Use this for status checks and diagnostics that should not mutate state.
 * @returns {Promise<{ valid: boolean, reason?: string }>}
 */
async function verifyBindingReadOnly() {
    if (!_secureContextAvailable) {
        return { valid: false, reason: 'insecure_context' };
    }

    // Always regenerate fingerprint for comparison
    const currentFingerprint = await generateDeviceFingerprint();
    _deviceFingerprint = currentFingerprint;

    // Get stored binding
    const bindingJson = localStorage.getItem(BINDING_KEY);

    if (!bindingJson) {
        // No binding exists yet
        return { valid: true, reason: 'no_binding_yet' };
    }

    try {
        const binding = JSON.parse(bindingJson);

        if (binding.fingerprint !== currentFingerprint) {
            // Return mismatch status WITHOUT invalidating tokens
            return { valid: false, reason: 'fingerprint_mismatch' };
        }

        return { valid: true };
    } catch (error) {
        console.error('[SecureTokenStore] Binding verification error:', error);
        return { valid: false, reason: 'binding_corrupted' };
    }
}

// ==========================================
// Token Operations (All require binding verification)
// ==========================================

/**
 * Store a token with mandatory binding
 * @param {string} tokenKey - Token identifier
 * @param {string} value - Token value
 * @param {Object} options - Storage options
 * @returns {Promise<boolean>}
 */
async function store(tokenKey, value, options = {}) {
    if (!_secureContextAvailable) {
        console.warn('[SecureTokenStore] Store blocked: insecure context');
        return false;
    }

    // MANDATORY: Verify binding first
    const bindingResult = await verifyBinding();

    if (!bindingResult.valid && bindingResult.reason !== 'no_binding_yet') {
        console.error('[SecureTokenStore] Cannot store: binding invalid -', bindingResult.reason);
        return false;
    }

    // Create binding if it doesn't exist
    if (bindingResult.reason === 'no_binding_yet') {
        const fingerprint = await generateDeviceFingerprint();
        const created = await createBinding(fingerprint);
        if (!created) {
            return false;
        }
    }

    const storageKey = TOKEN_STORE_PREFIX + tokenKey;
    const tokenData = {
        value,
        storedAt: Date.now(),
        expiresAt: options.expiresIn ? Date.now() + options.expiresIn : null,
        metadata: options.metadata || {}
    };

    try {
        // Store in IndexedDB if available, fall back to localStorage
        if (IndexedDBCore) {
            await IndexedDBCore.put(
                IndexedDBCore.STORES.TOKENS,
                { key: storageKey, ...tokenData }
            );
        } else {
            localStorage.setItem(storageKey, JSON.stringify(tokenData));
        }

        audit('token_stored', { tokenKey, hasExpiry: !!options.expiresIn });
        return true;
    } catch (error) {
        console.error('[SecureTokenStore] Store failed:', error);
        audit('token_store_failed', { tokenKey, error: error.message });
        return false;
    }
}

/**
 * Retrieve a token with mandatory binding verification
 * Returns null if binding fails (token invalidated)
 * @param {string} tokenKey - Token identifier
 * @returns {Promise<string|null>}
 */
async function retrieve(tokenKey) {
    if (!_secureContextAvailable) {
        console.warn('[SecureTokenStore] Retrieve blocked: insecure context');
        return null;
    }

    // MANDATORY: Verify binding first - NO BYPASS POSSIBLE
    const bindingResult = await verifyBinding();

    if (!bindingResult.valid) {
        console.error('[SecureTokenStore] Cannot retrieve: binding invalid -', bindingResult.reason);
        audit('token_retrieve_blocked', { tokenKey, reason: bindingResult.reason });
        return null;
    }

    const storageKey = TOKEN_STORE_PREFIX + tokenKey;

    try {
        let tokenData = null;

        // Try IndexedDB first
        if (IndexedDBCore) {
            const record = await IndexedDBCore.get(
                IndexedDBCore.STORES.TOKENS,
                storageKey
            );
            tokenData = record;
        } else {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                tokenData = JSON.parse(stored);
            }
        }

        if (!tokenData) {
            return null;
        }

        // Check expiry
        if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) {
            audit('token_expired', { tokenKey });
            await invalidate(tokenKey);
            return null;
        }

        audit('token_retrieved', { tokenKey });
        return tokenData.value;
    } catch (error) {
        console.error('[SecureTokenStore] Retrieve failed:', error);
        audit('token_retrieve_failed', { tokenKey, error: error.message });
        return null;
    }
}

/**
 * Retrieve a token with full options (including expiry and metadata)
 * Used by transaction rollback to preserve original token options
 * @param {string} tokenKey - Token identifier
 * @returns {Promise<{value: string, expiresIn?: number, metadata?: object}|null>}
 */
async function retrieveWithOptions(tokenKey) {
    if (!_secureContextAvailable) {
        console.warn('[SecureTokenStore] retrieveWithOptions blocked: insecure context');
        return null;
    }

    const bindingResult = await verifyBinding();

    if (!bindingResult.valid) {
        console.error('[SecureTokenStore] Cannot retrieveWithOptions: binding invalid -', bindingResult.reason);
        audit('token_retrieve_blocked', { tokenKey, reason: bindingResult.reason });
        return null;
    }

    const storageKey = TOKEN_STORE_PREFIX + tokenKey;

    try {
        let tokenData = null;

        if (IndexedDBCore) {
            const record = await IndexedDBCore.get(
                IndexedDBCore.STORES.TOKENS,
                storageKey
            );
            tokenData = record;
        } else {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                tokenData = JSON.parse(stored);
            }
        }

        if (!tokenData) {
            return null;
        }

        // Check expiry
        if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) {
            audit('token_expired', { tokenKey });
            await invalidate(tokenKey);
            return null;
        }

        audit('token_retrieved_with_options', { tokenKey });

        // Return full token data with options for transaction rollback
        return {
            value: tokenData.value,
            expiresIn: tokenData.expiresAt ? tokenData.expiresAt - Date.now() : undefined,
            metadata: tokenData.metadata || {}
        };
    } catch (error) {
        console.error('[SecureTokenStore] retrieveWithOptions failed:', error);
        audit('token_retrieve_failed', { tokenKey, error: error.message });
        return null;
    }
}

/**
 * Invalidate a specific token
 * @param {string} tokenKey - Token identifier
 * @returns {Promise<boolean>}
 */
async function invalidate(tokenKey) {
    if (!_secureContextAvailable) {
        console.warn('[SecureTokenStore] Invalidate blocked: insecure context');
        return false;
    }

    // MANDATORY: Verify binding first (consistent with store/retrieve)
    const bindingResult = await verifyBinding();

    if (!bindingResult.valid && bindingResult.reason !== 'no_binding_yet') {
        console.error('[SecureTokenStore] Cannot invalidate: binding invalid -', bindingResult.reason);
        audit('token_invalidate_blocked', { tokenKey, reason: bindingResult.reason });
        return false;
    }

    const storageKey = TOKEN_STORE_PREFIX + tokenKey;

    try {
        if (IndexedDBCore) {
            await IndexedDBCore.delete(
                IndexedDBCore.STORES.TOKENS,
                storageKey
            );
        }
        localStorage.removeItem(storageKey);

        audit('token_invalidated', { tokenKey });
        return true;
    } catch (error) {
        console.error('[SecureTokenStore] Invalidate failed:', error);
        return false;
    }
}

/**
 * Invalidate ALL tokens (security breach response)
 * @param {string} reason - Reason for invalidation
 * @returns {Promise<void>}
 */
async function invalidateAllTokens(reason) {
    if (!_secureContextAvailable) {
        console.warn('[SecureTokenStore] Invalidate all blocked: insecure context');
        return;
    }
    console.warn('[SecureTokenStore] Invalidating ALL tokens - Reason:', reason);

    let totalCleared = 0;

    try {
        // Clear IndexedDB tokens and count them
        if (IndexedDBCore) {
            try {
                // Try to get count before clearing if API available
                if (IndexedDBCore.keys) {
                    const idbKeys = await IndexedDBCore.keys(IndexedDBCore.STORES.TOKENS);
                    totalCleared += idbKeys ? idbKeys.length : 0;
                }
                await IndexedDBCore.clear(IndexedDBCore.STORES.TOKENS, { bypassAuthority: true });
            } catch (idbError) {
                console.warn('[SecureTokenStore] IndexedDB clear error:', idbError);
            }
        }

        // Clear localStorage tokens
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(TOKEN_STORE_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        totalCleared += keysToRemove.length;

        // Clear binding
        localStorage.removeItem(BINDING_KEY);
        _bindingVerified = false;

        audit('all_tokens_invalidated', { reason, count: totalCleared });
    } catch (error) {
        console.error('[SecureTokenStore] Invalidate all failed:', error);
    }
}

// ==========================================
// Audit Logging
// ==========================================

/**
 * Log a token operation for auditing
 * @param {string} operation - Operation name
 * @param {Object} details - Operation details
 */
function audit(operation, details = {}) {
    try {
        const auditLog = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');

        auditLog.push({
            operation,
            details,
            timestamp: Date.now()
        });

        // Keep only last N entries
        while (auditLog.length > MAX_AUDIT_ENTRIES) {
            auditLog.shift();
        }

        localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog));
    } catch (error) {
        console.warn('[SecureTokenStore] Audit log error:', error);
    }
}

/**
 * Get audit log
 * @returns {Array}
 */
function getAuditLog() {
    try {
        return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    } catch {
        return [];
    }
}

/**
 * Clear audit log
 */
function clearAuditLog() {
    localStorage.removeItem(AUDIT_KEY);
}

// ==========================================
// Status & Diagnostics
// ==========================================

/**
 * Get store status (uses read-only binding check to avoid side effects)
 * @returns {Promise<Object>}
 */
async function getStatus() {
    // Use read-only verification to avoid side effects during diagnostics
    const bindingResult = await verifyBindingReadOnly();

    return {
        initialized: _initialized,
        bindingValid: bindingResult.valid,
        bindingReason: bindingResult.reason,
        fingerprint: _deviceFingerprint ? _deviceFingerprint.substring(0, 8) + '...' : null,
        auditLogSize: getAuditLog().length
    };
}

/**
 * Initialize the store
 * @returns {Promise<boolean>}
 */
async function init() {
    if (_initialized) return true;

    _deviceFingerprint = await generateDeviceFingerprint();
    _initialized = true;

    console.log('[SecureTokenStore] Initialized');
    return true;
}

// ==========================================
// Public API
// ==========================================

export const SecureTokenStore = {
    isAvailable: () => _secureContextAvailable,
    getFallbackReason: () => _fallbackReason,
    markFallbackWarned: () => { _hasWarnedAboutFallback = true; },
    hasWarnedFallback: () => _hasWarnedAboutFallback,
    // Initialization
    init,

    // Token operations (all require binding)
    store,
    retrieve,
    retrieveWithOptions,
    invalidate,
    invalidateAllTokens,

    // Binding
    verifyBinding,

    // Audit
    getAuditLog,
    clearAuditLog,

    // Status
    getStatus
};


console.log('[SecureTokenStore] Module loaded (binding-enforced token storage)');
