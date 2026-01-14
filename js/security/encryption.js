/**
 * Encryption Module
 * Cryptographic operations for Rhythm Chamber security
 * 
 * Provides AES-GCM encryption, PBKDF2 key derivation, and credential storage
 */

const SECURITY_STORAGE_KEY = 'rhythm_chamber_security';
const ENCRYPTED_CREDENTIALS_KEY = 'rhythm_chamber_encrypted_creds';
const SESSION_SALT_KEY = 'rhythm_chamber_session_salt';
const SESSION_VERSION_KEY = 'rhythm_chamber_session_version';

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
 * SECURITY: Uses 600,000 iterations per OWASP 2024 recommendations
 * for PBKDF2-SHA256. This provides strong resistance to GPU attacks.
 * Key derivation takes ~200-400ms on modern hardware.
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
            iterations: 600000, // OWASP 2024 recommendation
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
 * Full session cleanup - call after password changes
 * Invalidates sessions and clears all sensitive data
 */
function clearSessionData() {
    invalidateSessions();
    clearEncryptedCredentials();
    sessionStorage.clear();
    console.warn('[Security] Full session cleanup completed - re-authentication required');
}

// Export functions
export {
    // Key derivation and hashing
    deriveKey,
    hashData,

    // Encryption/decryption
    encryptData,
    decryptData,
    getSessionKey,

    // Credential storage
    storeEncryptedCredentials,
    getEncryptedCredentials,
    clearEncryptedCredentials,

    // Session management
    getSessionSalt,
    getSessionVersion,
    invalidateSessions,
    clearSessionData,

    // Utilities
    generateRandomString
};