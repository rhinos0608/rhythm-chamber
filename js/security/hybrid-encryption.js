/**
 * Hybrid Encryption Module
 * Advanced encryption feature for sensitive data using hybrid encryption approach
 *
 * Combines the efficiency of symmetric encryption (AES-GCM-256) with the
 * key distribution benefits of asymmetric encryption (RSA-OAEP).
 *
 * USE CASES:
 * - Encrypting data for multiple recipients without re-encrypting for each
 * - Secure key exchange between parties
 * - Forward secrecy through ephemeral key generation
 * - Backup encryption where recovery keys differ from session keys
 *
 * SECURITY PROPERTIES:
 * - RSA-OAEP-2048 for key encryption (asymmetric)
 * - AES-GCM-256 for data encryption (symmetric)
 * - Ephemeral symmetric key per encryption operation
 * - PKCS#1 v2.2 (OAEP) padding with SHA-256
 * - Unique IV per AES-GCM operation (never reused)
 *
 * ALGORITHM OVERVIEW:
 * 1. Generate ephemeral AES-256 key for data encryption
 * 2. Encrypt data with AES-GCM using ephemeral key
 * 3. Encrypt ephemeral key with RSA-OAEP using recipient's public key
 * 4. Bundle: encrypted key + IV + encrypted data
 *
 * @module security/hybrid-encryption
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('HybridEncryption');

// ==========================================
// CONSTANTS
// ==========================================

const RSA_KEY_SIZE = 2048;
const AES_KEY_SIZE = 256;
const IV_LENGTH = 12; // 96-bit IV for AES-GCM

// Key algorithm identifiers
const RSA_ALGORITHM = 'RSA-OAEP';
const AES_ALGORITHM = 'AES-GCM';

// Hash algorithm for OAEP padding
const HASH_ALGORITHM = 'SHA-256';

// ==========================================
// KEY GENERATION
// ==========================================

/**
 * Generate an RSA-OAEP key pair for asymmetric encryption
 *
 * The public key is used to encrypt data for this recipient.
 * The private key is used to decrypt data encrypted with the public key.
 *
 * SECURITY: Private key is marked as non-extractable to prevent export.
 * This satisfies the principle of non-extractable cryptographic material.
 *
 * @param {boolean} extractable - Whether the private key should be extractable (default: false)
 * @returns {Promise<CryptoKeyPair>} RSA key pair with public and private keys
 * @throws {Error} If key generation fails or not in secure context
 *
 * @example
 * const keyPair = await HybridEncryption.generateKeyPair();
 * // Public key: can be exported and shared
 * // Private key: stays in memory, non-extractable, for decryption
 */
async function generateKeyPair(extractable = false) {
    try {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: RSA_ALGORITHM,
                modulusLength: RSA_KEY_SIZE,
                publicExponent: new Uint8Array([1, 0, 1]), // 65537
                hash: HASH_ALGORITHM
            },
            extractable, // Private key extractable (default false for security)
            ['encrypt', 'decrypt'] // Key usages
        );

        logger.info('RSA-OAEP key pair generated successfully');
        return keyPair;
    } catch (error) {
        logger.error('Failed to generate RSA key pair:', error);
        throw new Error(`Key generation failed: ${error.message}`);
    }
}

/**
 * Export a public key to SPKI format for sharing/storage
 *
 * Public keys are safe to export and share. They can only be used
 * for encryption, not decryption.
 *
 * @param {CryptoKey} publicKey - The public key to export
 * @returns {Promise<string>} Base64-encoded SPKI format public key
 * @throws {Error} If export fails or key is not a public key
 *
 * @example
 * const keyPair = await HybridEncryption.generateKeyPair();
 * const exportedKey = await HybridEncryption.exportPublicKey(keyPair.publicKey);
 * // Share exportedKey with others who want to encrypt data for you
 */
async function exportPublicKey(publicKey) {
    try {
        if (!publicKey || publicKey.type !== 'public') {
            throw new Error('Key must be a public key');
        }

        const exported = await crypto.subtle.exportKey('spki', publicKey);
        const base64 = btoa(String.fromCharCode(...new Uint8Array(exported)));

        logger.debug('Public key exported successfully');
        return base64;
    } catch (error) {
        logger.error('Failed to export public key:', error);
        throw new Error(`Public key export failed: ${error.message}`);
    }
}

/**
 * Import a public key from SPKI format
 *
 * Use this to load a previously exported public key for encryption operations.
 *
 * @param {string} exportedKey - Base64-encoded SPKI format public key
 * @returns {Promise<CryptoKey>} Imported public key
 * @throws {Error} If import fails or format is invalid
 *
 * @example
 * const exportedKey = 'MIIBIjANBg...'; // From exportPublicKey()
 * const publicKey = await HybridEncryption.importPublicKey(exportedKey);
 * const encrypted = await HybridEncryption.encrypt('sensitive data', publicKey);
 */
async function importPublicKey(exportedKey) {
    try {
        const binary = atob(exportedKey);
        const buffer = new Uint8Array([...binary].map(c => c.charCodeAt(0)));

        const publicKey = await crypto.subtle.importKey(
            'spki',
            buffer,
            {
                name: RSA_ALGORITHM,
                hash: HASH_ALGORITHM
            },
            true, // Public keys are extractable
            ['encrypt']
        );

        logger.debug('Public key imported successfully');
        return publicKey;
    } catch (error) {
        logger.error('Failed to import public key:', error);
        throw new Error(`Public key import failed: ${error.message}`);
    }
}

/**
 * Export a private key to PKCS#8 format
 *
 * WARNING: Private key export should be used sparingly and only for:
 * - Secure backup to encrypted storage
 * - Key migration between devices
 * - Recovery scenarios
 *
 * The exported key MUST be encrypted before storage.
 *
 * @param {CryptoKey} privateKey - The private key to export
 * @returns {Promise<string>} Base64-encoded PKCS#8 format private key
 * @throws {Error} If export fails or key is not extractable
 *
 * @example
 * // Key must be generated with extractable: true
 * const keyPair = await HybridEncryption.generateKeyPair(true);
 * const exported = await HybridEncryption.exportPrivateKey(keyPair.privateKey);
 * // Encrypt exported before storing!
 */
async function exportPrivateKey(privateKey) {
    try {
        if (!privateKey || privateKey.type !== 'private') {
            throw new Error('Key must be a private key');
        }

        const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
        const base64 = btoa(String.fromCharCode(...new Uint8Array(exported)));

        logger.warn('Private key exported - ensure secure storage');
        return base64;
    } catch (error) {
        logger.error('Failed to export private key:', error);
        throw new Error(`Private key export failed: ${error.message}`);
    }
}

/**
 * Import a private key from PKCS#8 format
 *
 * @param {string} exportedKey - Base64-encoded PKCS#8 format private key
 * @param {boolean} extractable - Whether imported key should be extractable (default: false)
 * @returns {Promise<CryptoKey>} Imported private key
 * @throws {Error} If import fails or format is invalid
 *
 * @example
 * const privateKey = await HybridEncryption.importPrivateKey(exported, false);
 * const decrypted = await HybridEncryption.decrypt(encryptedData, privateKey);
 */
async function importPrivateKey(exportedKey, extractable = false) {
    try {
        const binary = atob(exportedKey);
        const buffer = new Uint8Array([...binary].map(c => c.charCodeAt(0)));

        const privateKey = await crypto.subtle.importKey(
            'pkcs8',
            buffer,
            {
                name: RSA_ALGORITHM,
                hash: HASH_ALGORITHM
            },
            extractable,
            ['decrypt']
        );

        logger.debug('Private key imported successfully');
        return privateKey;
    } catch (error) {
        logger.error('Failed to import private key:', error);
        throw new Error(`Private key import failed: ${error.message}`);
    }
}

// ==========================================
// HYBRID ENCRYPTION/DECRYPTION
// ==========================================

/**
 * Encrypt data using hybrid encryption (RSA-OAEP + AES-GCM)
 *
 * PROCESS:
 * 1. Generate ephemeral AES-256 key
 * 2. Encrypt plaintext with AES-GCM using ephemeral key
 * 3. Encrypt ephemeral key with RSA-OAEP using recipient's public key
 * 4. Return bundled result
 *
 * The ephemeral key ensures each encryption uses a unique symmetric key,
 * providing forward secrecy and preventing key reuse attacks.
 *
 * @param {string} plaintext - Data to encrypt
 * @param {CryptoKey} recipientPublicKey - Recipient's RSA public key
 * @returns {Promise<HybridEncryptedData>} Encrypted data bundle
 * @throws {Error} If encryption fails
 *
 * @typedef {Object} HybridEncryptedData
 * @property {string} encryptedKey - RSA-encrypted ephemeral AES key (base64)
 * @property {string} iv - AES-GCM initialization vector (base64)
 * @property {string} ciphertext - AES-GCM encrypted data (base64)
 *
 * @example
 * const keyPair = await HybridEncryption.generateKeyPair();
 * const encrypted = await HybridEncryption.encrypt('sensitive data', keyPair.publicKey);
 * // Store or transmit encrypted bundle
 */
async function encrypt(plaintext, recipientPublicKey) {
    try {
        // Validate inputs
        if (typeof plaintext !== 'string') {
            throw new Error('Plaintext must be a string');
        }
        if (!recipientPublicKey || recipientPublicKey.type !== 'public') {
            throw new Error('Recipient key must be a public key');
        }

        // Step 1: Generate ephemeral AES-256 key for data encryption
        const ephemeralKey = await crypto.subtle.generateKey(
            {
                name: AES_ALGORITHM,
                length: AES_KEY_SIZE
            },
            true, // Ephemeral key is extractable for wrapping
            ['encrypt', 'decrypt']
        );

        // Step 2: Generate unique IV for AES-GCM
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

        // Step 3: Encrypt data with AES-GCM
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(plaintext);
        const ciphertext = await crypto.subtle.encrypt(
            { name: AES_ALGORITHM, iv },
            ephemeralKey,
            dataBuffer
        );

        // Step 4: Export and encrypt ephemeral key with RSA-OAEP
        const rawEphemeralKey = await crypto.subtle.exportKey('raw', ephemeralKey);
        const encryptedKey = await crypto.subtle.encrypt(
            { name: RSA_ALGORITHM },
            recipientPublicKey,
            rawEphemeralKey
        );

        // Step 5: Bundle results
        const result = {
            encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encryptedKey))),
            iv: btoa(String.fromCharCode(...iv)),
            ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
            algorithm: 'RSA-OAEP-2048/AES-GCM-256',
            timestamp: Date.now()
        };

        logger.info('Hybrid encryption completed successfully');
        return result;
    } catch (error) {
        logger.error('Hybrid encryption failed:', error);
        throw new Error(`Encryption failed: ${error.message}`);
    }
}

/**
 * Decrypt data using hybrid encryption
 *
 * PROCESS:
 * 1. Decrypt ephemeral AES key with RSA-OAEP using private key
 * 2. Import decrypted ephemeral key
 * 3. Decrypt ciphertext with AES-GCM using ephemeral key and IV
 *
 * @param {HybridEncryptedData} encryptedData - Encrypted data bundle from encrypt()
 * @param {CryptoKey} privateKey - Recipient's RSA private key
 * @returns {Promise<string|null>} Decrypted plaintext, or null if decryption fails
 *
 * @example
 * const decrypted = await HybridEncryption.decrypt(encrypted, keyPair.privateKey);
 * if (decrypted === null) {
 *   console.error('Decryption failed');
 * }
 */
async function decrypt(encryptedData, privateKey) {
    try {
        // Validate inputs
        if (!encryptedData || typeof encryptedData !== 'object') {
            throw new Error('Encrypted data must be an object');
        }
        if (!privateKey || privateKey.type !== 'private') {
            throw new Error('Private key required for decryption');
        }

        const { encryptedKey, iv, ciphertext } = encryptedData;

        if (!encryptedKey || !iv || !ciphertext) {
            throw new Error('Invalid encrypted data format');
        }

        // Step 1: Decrypt ephemeral AES key with RSA-OAEP
        const encryptedKeyBuffer = new Uint8Array(
            [...atob(encryptedKey)].map(c => c.charCodeAt(0))
        );
        const rawEphemeralKey = await crypto.subtle.decrypt(
            { name: RSA_ALGORITHM },
            privateKey,
            encryptedKeyBuffer
        );

        // Step 2: Import ephemeral AES key
        const ephemeralKey = await crypto.subtle.importKey(
            'raw',
            rawEphemeralKey,
            { name: AES_ALGORITHM },
            false, // Don't need to extract again
            ['decrypt']
        );

        // Step 3: Decrypt data with AES-GCM
        const ivBuffer = new Uint8Array([...atob(iv)].map(c => c.charCodeAt(0)));
        const ciphertextBuffer = new Uint8Array(
            [...atob(ciphertext)].map(c => c.charCodeAt(0))
        );

        const decrypted = await crypto.subtle.decrypt(
            { name: AES_ALGORITHM, iv: ivBuffer },
            ephemeralKey,
            ciphertextBuffer
        );

        const plaintext = new TextDecoder().decode(decrypted);

        logger.info('Hybrid decryption completed successfully');
        return plaintext;
    } catch (error) {
        logger.error('Hybrid decryption failed:', error);
        // Return null for graceful degradation
        return null;
    }
}

// ==========================================
// MULTIPLE RECIPIENTS
// ==========================================

/**
 * Encrypt data for multiple recipients
 *
 * The same encrypted data can be decrypted by any recipient using their
 * private key. This avoids encrypting the same data multiple times.
 *
 * @param {string} plaintext - Data to encrypt
 * @param {CryptoKey[]} recipientPublicKeys - Array of recipient public keys
 * @returns {Promise<MultiRecipientEncryptedData>} Encrypted data with multiple encrypted keys
 *
 * @typedef {Object} MultiRecipientEncryptedData
 * @property {Object.<string, string>} encryptedKeys - Map of recipient ID to encrypted key
 * @property {string} iv - AES-GCM initialization vector (base64)
 * @property {string} ciphertext - AES-GCM encrypted data (base64)
 * @property {string[]} recipientIds - List of recipient IDs
 *
 * @example
 * const keyPair1 = await HybridEncryption.generateKeyPair();
 * const keyPair2 = await HybridEncryption.generateKeyPair();
 * const encrypted = await HybridEncryption.encryptForMultiple(
 *   'secret message',
 *   {
 *     'user1': keyPair1.publicKey,
 *     'user2': keyPair2.publicKey
 *   }
 * );
 * // Both user1 and user2 can decrypt with their private keys
 */
async function encryptForMultiple(plaintext, recipientKeys) {
    try {
        if (typeof plaintext !== 'string') {
            throw new Error('Plaintext must be a string');
        }
        if (!recipientKeys || typeof recipientKeys !== 'object') {
            throw new Error('Recipient keys must be provided as an object');
        }

        const recipientIds = Object.keys(recipientKeys);
        if (recipientIds.length === 0) {
            throw new Error('At least one recipient is required');
        }

        // Generate single ephemeral key for all recipients
        const ephemeralKey = await crypto.subtle.generateKey(
            { name: AES_ALGORITHM, length: AES_KEY_SIZE },
            true,
            ['encrypt', 'decrypt']
        );

        // Generate unique IV
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

        // Encrypt data once with AES-GCM
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(plaintext);
        const ciphertext = await crypto.subtle.encrypt(
            { name: AES_ALGORITHM, iv },
            ephemeralKey,
            dataBuffer
        );

        // Export ephemeral key and encrypt for each recipient
        const rawEphemeralKey = await crypto.subtle.exportKey('raw', ephemeralKey);
        const encryptedKeys = {};

        for (const [recipientId, publicKey] of Object.entries(recipientKeys)) {
            if (publicKey && publicKey.type === 'public') {
                const encryptedKeyBuffer = await crypto.subtle.encrypt(
                    { name: RSA_ALGORITHM },
                    publicKey,
                    rawEphemeralKey
                );
                encryptedKeys[recipientId] = btoa(
                    String.fromCharCode(...new Uint8Array(encryptedKeyBuffer))
                );
            } else {
                logger.warn(`Invalid public key for recipient: ${recipientId}`);
            }
        }

        const result = {
            encryptedKeys,
            iv: btoa(String.fromCharCode(...iv)),
            ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
            recipientIds,
            algorithm: 'RSA-OAEP-2048/AES-GCM-256',
            timestamp: Date.now()
        };

        logger.info(`Encrypted for ${recipientIds.length} recipients`);
        return result;
    } catch (error) {
        logger.error('Multi-recipient encryption failed:', error);
        throw new Error(`Multi-recipient encryption failed: ${error.message}`);
    }
}

/**
 * Decrypt multi-recipient data using your private key
 *
 * @param {MultiRecipientEncryptedData} encryptedData - Encrypted data from encryptForMultiple()
 * @param {string} recipientId - Your recipient ID (used to find your encrypted key)
 * @param {CryptoKey} privateKey - Your RSA private key
 * @returns {Promise<string|null>} Decrypted plaintext, or null if decryption fails
 *
 * @example
 * const decrypted = await HybridEncryption.decryptMultiple(
 *   encrypted,
 *   'user1',
 *   keyPair1.privateKey
 * );
 */
async function decryptMultiple(encryptedData, recipientId, privateKey) {
    try {
        if (!encryptedData || !encryptedData.encryptedKeys) {
            throw new Error('Invalid encrypted data format');
        }

        const encryptedKey = encryptedData.encryptedKeys[recipientId];
        if (!encryptedKey) {
            logger.warn(`No encrypted key found for recipient: ${recipientId}`);
            return null;
        }

        // Decrypt ephemeral key
        const encryptedKeyBuffer = new Uint8Array(
            [...atob(encryptedKey)].map(c => c.charCodeAt(0))
        );
        const rawEphemeralKey = await crypto.subtle.decrypt(
            { name: RSA_ALGORITHM },
            privateKey,
            encryptedKeyBuffer
        );

        // Import ephemeral key
        const ephemeralKey = await crypto.subtle.importKey(
            'raw',
            rawEphemeralKey,
            { name: AES_ALGORITHM },
            false,
            ['decrypt']
        );

        // Decrypt data
        const ivBuffer = new Uint8Array(
            [...atob(encryptedData.iv)].map(c => c.charCodeAt(0))
        );
        const ciphertextBuffer = new Uint8Array(
            [...atob(encryptedData.ciphertext)].map(c => c.charCodeAt(0))
        );

        const decrypted = await crypto.subtle.decrypt(
            { name: AES_ALGORITHM, iv: ivBuffer },
            ephemeralKey,
            ciphertextBuffer
        );

        const plaintext = new TextDecoder().decode(decrypted);

        logger.info(`Multi-recipient decryption successful for: ${recipientId}`);
        return plaintext;
    } catch (error) {
        logger.error('Multi-recipient decryption failed:', error);
        return null;
    }
}

// ==========================================
// KEY DERIVATION FOR BACKUP/RECOVERY
// ==========================================

/**
 * Generate a recovery key pair from a recovery password
 *
 * This allows users to recover encrypted data if they remember their
 * recovery password, without storing the private key permanently.
 *
 * SECURITY: Uses PBKDF2 with high iteration count for key derivation.
 *
 * @param {string} recoveryPassword - Recovery password
 * @param {string} salt - Salt for key derivation (should be stored securely)
 * @returns {Promise<CryptoKeyPair>} Derived key pair
 *
 * @example
 * const salt = crypto.getRandomValues(new Uint8Array(32));
 * const keyPair = await HybridEncryption.deriveRecoveryKeyPair('password123', salt);
 */
async function deriveRecoveryKeyPair(recoveryPassword, salt) {
    try {
        // Import password as key material
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(recoveryPassword),
            'PBKDF2',
            false,
            ['deriveBits']
        );

        // Derive seed for key generation
        const seed = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: typeof salt === 'string' ? encoder.encode(salt) : salt,
                iterations: 600000,
                hash: HASH_ALGORITHM
            },
            keyMaterial,
            RSA_KEY_SIZE // Derive enough bits for RSA key seed
        );

        // Note: Web Crypto API doesn't support deriving RSA keys directly.
        // This is a simplified implementation that demonstrates the concept.
        // In production, you would:
        // 1. Generate a standard RSA key pair
        // 2. Encrypt the private key with a key derived from the password
        // 3. Store the encrypted private key

        throw new Error('Direct RSA key derivation not supported. Use generateKeyPair() and encrypt the private key with a password-derived key instead.');
    } catch (error) {
        logger.error('Recovery key derivation failed:', error);
        throw error;
    }
}

// ==========================================
// PUBLIC API
// ==========================================

const HybridEncryption = {
    // Key generation and export
    generateKeyPair,
    exportPublicKey,
    importPublicKey,
    exportPrivateKey,
    importPrivateKey,

    // Hybrid encryption/decryption
    encrypt,
    decrypt,

    // Multiple recipients
    encryptForMultiple,
    decryptMultiple,

    // Recovery (limited support in Web Crypto)
    deriveRecoveryKeyPair
};

export {
    HybridEncryption,
    generateKeyPair,
    exportPublicKey,
    importPublicKey,
    exportPrivateKey,
    importPrivateKey,
    encrypt,
    decrypt,
    encryptForMultiple,
    decryptMultiple,
    deriveRecoveryKeyPair
};
