/**
 * Hybrid Encryption Module for Rhythm Chamber
 *
 * Provides RSA-OAEP-2048 + AES-GCM-256 hybrid encryption:
 * - RSA-OAEP for encrypting symmetric keys
 * - AES-GCM for encrypting actual data
 * - Support for single and multiple recipients
 *
 * THREAT MODEL:
 * - Enables secure key exchange for end-to-end encryption
 * - RSA-2048 provides secure key transport
 * - AES-256 provides efficient bulk data encryption
 *
 * @module security/hybrid-encryption
 */

'use strict';

// ==========================================
// Constants
// ==========================================

const RSA_ALGORITHM = 'RSA-OAEP';
const AES_ALGORITHM = 'AES-GCM';
const RSA_MODULUS_LENGTH = 2048;
const RSA_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]); // 65537
const AES_KEY_LENGTH = 256;
const AES_IV_LENGTH = 12; // 96-bit IV for AES-GCM
const HYBRID_ALGORITHM_NAME = 'RSA-OAEP-2048/AES-GCM-256';

const HASH_ALGORITHM = 'SHA-256';

// ==========================================
// Key Generation
// ==========================================

/**
 * Generate an RSA-OAEP key pair
 * @param {boolean} extractable - Whether the private key should be extractable
 * @returns {Promise<CryptoKeyPair>} RSA-OAEP key pair
 */
async function generateKeyPair(extractable = false) {
    if (!crypto?.subtle) {
        throw new Error('[HybridEncryption] Web Crypto API not available');
    }

    return crypto.subtle.generateKey(
        {
            name: RSA_ALGORITHM,
            modulusLength: RSA_MODULUS_LENGTH,
            publicExponent: RSA_PUBLIC_EXPONENT,
            hash: HASH_ALGORITHM
        },
        extractable,
        ['encrypt', 'decrypt']
    );
}

// ==========================================
// Key Export/Import
// ==========================================

/**
 * Export a public key to base64 format (SPKI)
 * @param {CryptoKey} publicKey - Public key to export
 * @returns {Promise<string>} Base64-encoded public key
 */
async function exportPublicKey(publicKey) {
    if (!publicKey || publicKey.type !== 'public') {
        throw new Error('[HybridEncryption] Key must be a public key');
    }

    const exported = await crypto.subtle.exportKey('spki', publicKey);
    const bytes = new Uint8Array(exported);
    return btoa(String.fromCharCode(...bytes));
}

/**
 * Import a public key from base64 format (SPKI)
 * @param {string} base64Key - Base64-encoded public key
 * @returns {Promise<CryptoKey>} Imported public key
 */
async function importPublicKey(base64Key) {
    if (typeof base64Key !== 'string' || !base64Key) {
        throw new Error('[HybridEncryption] Invalid public key format');
    }

    const binaryString = atob(base64Key);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return crypto.subtle.importKey(
        'spki',
        bytes,
        { name: RSA_ALGORITHM, hash: HASH_ALGORITHM },
        true,
        ['encrypt']
    );
}

/**
 * Export a private key to base64 format (PKCS8)
 * @param {CryptoKey} privateKey - Private key to export
 * @returns {Promise<string>} Base64-encoded private key
 */
async function exportPrivateKey(privateKey) {
    if (!privateKey || privateKey.type !== 'private') {
        throw new Error('[HybridEncryption] Key must be a private key');
    }

    if (!privateKey.extractable) {
        throw new Error('[HybridEncryption] Private key is not extractable');
    }

    const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
    const bytes = new Uint8Array(exported);
    return btoa(String.fromCharCode(...bytes));
}

/**
 * Import a private key from base64 format (PKCS8)
 * @param {string} base64Key - Base64-encoded private key
 * @param {boolean} extractable - Whether the imported key should be extractable
 * @returns {Promise<CryptoKey>} Imported private key
 */
async function importPrivateKey(base64Key, extractable = false) {
    if (typeof base64Key !== 'string' || !base64Key) {
        throw new Error('[HybridEncryption] Invalid private key format');
    }

    const binaryString = atob(base64Key);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return crypto.subtle.importKey(
        'pkcs8',
        bytes,
        { name: RSA_ALGORITHM, hash: HASH_ALGORITHM },
        extractable,
        ['decrypt']
    );
}

// ==========================================
// Encryption
// ==========================================

/**
 * Generate a random AES-GCM key
 * @returns {Promise<CryptoKey>} AES-GCM key
 */
async function generateAESKey() {
    return crypto.subtle.generateKey(
        {
            name: AES_ALGORITHM,
            length: AES_KEY_LENGTH
        },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt data using hybrid encryption (RSA-OAEP + AES-GCM)
 * @param {string} plaintext - Data to encrypt
 * @param {CryptoKey} recipientPublicKey - Recipient's RSA public key
 * @returns {Promise<Object>} Encrypted data package
 */
async function encrypt(plaintext, recipientPublicKey) {
    if (typeof plaintext !== 'string') {
        throw new Error('[HybridEncryption] Plaintext must be a string');
    }

    if (!recipientPublicKey || recipientPublicKey.type !== 'public') {
        throw new Error('[HybridEncryption] Recipient key must be a public key');
    }

    // Generate a random AES key for data encryption
    const aesKey = await generateAESKey();

    // Generate IV for AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));

    // Encrypt the data with AES-GCM
    const encoder = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: AES_ALGORITHM, iv },
        aesKey,
        encoder.encode(plaintext)
    );

    // Export and encrypt the AES key with RSA-OAEP
    const aesKeyBytes = await crypto.subtle.exportKey('raw', aesKey);
    const encryptedKey = await crypto.subtle.encrypt(
        { name: RSA_ALGORITHM },
        recipientPublicKey,
        aesKeyBytes
    );

    return {
        algorithm: HYBRID_ALGORITHM_NAME,
        encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encryptedKey))),
        iv: btoa(String.fromCharCode(...iv)),
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    };
}

// ==========================================
// Decryption
// ==========================================

/**
 * Decrypt data using hybrid encryption (RSA-OAEP + AES-GCM)
 * @param {Object} encryptedPackage - Encrypted data package
 * @param {CryptoKey} recipientPrivateKey - Recipient's RSA private key
 * @returns {Promise<string|null>} Decrypted plaintext or null on failure
 */
async function decrypt(encryptedPackage, recipientPrivateKey) {
    try {
        if (!encryptedPackage || !recipientPrivateKey) {
            return null;
        }

        const { encryptedKey, iv, ciphertext } = encryptedPackage;

        if (!encryptedKey || !iv || !ciphertext) {
            return null;
        }

        // Decrypt the AES key using RSA-OAEP
        const encryptedKeyBytes = new Uint8Array(
            [...atob(encryptedKey)].map(c => c.charCodeAt(0))
        );
        const aesKeyBytes = await crypto.subtle.decrypt(
            { name: RSA_ALGORITHM },
            recipientPrivateKey,
            encryptedKeyBytes
        );

        // Import the AES key
        const aesKey = await crypto.subtle.importKey(
            'raw',
            aesKeyBytes,
            { name: AES_ALGORITHM },
            false,
            ['decrypt']
        );

        // Decrypt the ciphertext using AES-GCM
        const ivBytes = new Uint8Array(
            [...atob(iv)].map(c => c.charCodeAt(0))
        );
        const ciphertextBytes = new Uint8Array(
            [...atob(ciphertext)].map(c => c.charCodeAt(0))
        );

        const decrypted = await crypto.subtle.decrypt(
            { name: AES_ALGORITHM, iv: ivBytes },
            aesKey,
            ciphertextBytes
        );

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error('[HybridEncryption] Decryption failed:', e);
        return null;
    }
}

// ==========================================
// Multiple Recipients
// ==========================================

/**
 * Encrypt data for multiple recipients
 * @param {string} plaintext - Data to encrypt
 * @param {Object<string, CryptoKey>} recipientKeys - Map of recipient IDs to public keys
 * @returns {Promise<Object>} Encrypted data package for multiple recipients
 */
async function encryptForMultiple(plaintext, recipientKeys) {
    if (typeof plaintext !== 'string') {
        throw new Error('[HybridEncryption] Plaintext must be a string');
    }

    if (!recipientKeys || Object.keys(recipientKeys).length === 0) {
        throw new Error('[HybridEncryption] At least one recipient is required');
    }

    // Generate a single AES key for all recipients
    const aesKey = await generateAESKey();

    // Generate IV for AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));

    // Encrypt the data with AES-GCM
    const encoder = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: AES_ALGORITHM, iv },
        aesKey,
        encoder.encode(plaintext)
    );

    // Export the AES key
    const aesKeyBytes = await crypto.subtle.exportKey('raw', aesKey);

    // Encrypt the AES key for each recipient
    const encryptedKeys = {};
    for (const [recipientId, publicKey] of Object.entries(recipientKeys)) {
        if (publicKey?.type === 'public') {
            const encryptedKey = await crypto.subtle.encrypt(
                { name: RSA_ALGORITHM },
                publicKey,
                aesKeyBytes
            );
            encryptedKeys[recipientId] = btoa(String.fromCharCode(...new Uint8Array(encryptedKey)));
        }
    }

    return {
        algorithm: HYBRID_ALGORITHM_NAME,
        encryptedKeys,
        iv: btoa(String.fromCharCode(...iv)),
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        recipientIds: Object.keys(encryptedKeys)
    };
}

/**
 * Decrypt multi-recipient data
 * @param {Object} encryptedPackage - Encrypted data package
 * @param {string} recipientId - Recipient's ID
 * @param {CryptoKey} recipientPrivateKey - Recipient's RSA private key
 * @returns {Promise<string|null>} Decrypted plaintext or null on failure
 */
async function decryptMultiple(encryptedPackage, recipientId, recipientPrivateKey) {
    try {
        if (!encryptedPackage || !recipientId || !recipientPrivateKey) {
            return null;
        }

        const { encryptedKeys, iv, ciphertext } = encryptedPackage;

        if (!encryptedKeys || !iv || !ciphertext) {
            return null;
        }

        const encryptedKey = encryptedKeys[recipientId];
        if (!encryptedKey) {
            return null;
        }

        // Decrypt the AES key using RSA-OAEP
        const encryptedKeyBytes = new Uint8Array(
            [...atob(encryptedKey)].map(c => c.charCodeAt(0))
        );
        const aesKeyBytes = await crypto.subtle.decrypt(
            { name: RSA_ALGORITHM },
            recipientPrivateKey,
            encryptedKeyBytes
        );

        // Import the AES key
        const aesKey = await crypto.subtle.importKey(
            'raw',
            aesKeyBytes,
            { name: AES_ALGORITHM },
            false,
            ['decrypt']
        );

        // Decrypt the ciphertext using AES-GCM
        const ivBytes = new Uint8Array(
            [...atob(iv)].map(c => c.charCodeAt(0))
        );
        const ciphertextBytes = new Uint8Array(
            [...atob(ciphertext)].map(c => c.charCodeAt(0))
        );

        const decrypted = await crypto.subtle.decrypt(
            { name: AES_ALGORITHM, iv: ivBytes },
            aesKey,
            ciphertextBytes
        );

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error('[HybridEncryption] Multi-recipient decryption failed:', e);
        return null;
    }
}

// ==========================================
// Public API
// ==========================================

export const HybridEncryption = {
    // Key generation
    generateKeyPair,

    // Key export/import
    exportPublicKey,
    importPublicKey,
    exportPrivateKey,
    importPrivateKey,

    // Single recipient encryption
    encrypt,
    decrypt,

    // Multiple recipients
    encryptForMultiple,
    decryptMultiple,

    // Constants
    RSA_ALGORITHM,
    AES_ALGORITHM,
    HYBRID_ALGORITHM_NAME
};

// ES Module export
export default HybridEncryption;

console.log('[HybridEncryption] Hybrid encryption module loaded');
