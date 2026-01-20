/**
 * StorageEncryption Module
 * AES-GCM-256 encryption/decryption operations for sensitive data storage
 *
 * Provides core cryptographic operations for encrypting data at rest using:
 * - AES-GCM-256 algorithm (authenticated encryption)
 * - Unique 96-bit IV per encryption operation
 * - Non-extractable keys from KeyManager
 * - IV stored alongside ciphertext for decryption
 *
 * SECURITY REQUIREMENTS:
 * - Each encryption MUST use a unique IV (never reused)
 * - Keys MUST be non-extractable CryptoKey objects from KeyManager
 * - IV is public information but MUST be unique per operation
 * - This module provides ONLY encryption/decryption (no classification, rotation, deletion)
 *
 * Usage:
 *   const encKey = await Security.getDataEncryptionKey();
 *   const encrypted = await StorageEncryption.encrypt('sensitive data', encKey);
 *   const decrypted = await StorageEncryption.decrypt(encrypted, encKey);
 */

const StorageEncryption = {
    /**
     * Encrypt data using AES-GCM-256 with unique IV
     *
     * ALGORITHM: AES-GCM-256 (Galois/Counter Mode)
     * - Authenticated encryption providing confidentiality and integrity
     * - 96-bit IV (12 bytes) per NIST SP 800-38D recommendation
     * - IV generated using cryptographically secure random number generator
     * - IV prepended to ciphertext for storage
     *
     * SECURITY: Each encryption operation generates a unique IV.
     * Never reuse IVs with the same key - this causes catastrophic security failures.
     *
     * @param {string} data - Plaintext data to encrypt
     * @param {CryptoKey} key - Non-extractable AES-GCM-256 key from KeyManager.getDataEncryptionKey()
     * @returns {Promise<string>} Base64-encoded string containing (IV + ciphertext)
     * @throws {Error} If encryption fails (invalid key, unsupported algorithm, etc.)
     *
     * @example
     * const encKey = await Security.getDataEncryptionKey();
     * const encrypted = await StorageEncryption.encrypt('my secret data', encKey);
     * // encrypted format: base64(12-byte-IV + ciphertext)
     */
    async encrypt(data, key) {
        try {
            // Validate inputs
            if (typeof data !== 'string') {
                throw new Error('Data to encrypt must be a string');
            }

            if (!key || !(key instanceof CryptoKey)) {
                throw new Error('Key must be a CryptoKey object from KeyManager');
            }

            // Convert string to bytes
            const encoder = new TextEncoder();
            const dataBytes = encoder.encode(data);

            // Generate unique 96-bit IV for this encryption operation
            // SECURITY: MUST be unique per encryption - never reuse IVs
            const iv = crypto.getRandomValues(new Uint8Array(12));

            // Encrypt using AES-GCM-256
            const ciphertext = await crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                dataBytes
            );

            // Combine IV + ciphertext for storage
            // Format: [12 bytes IV][variable length ciphertext]
            const combined = new Uint8Array(iv.length + ciphertext.byteLength);
            combined.set(iv, 0); // IV at start
            combined.set(new Uint8Array(ciphertext), iv.length); // Ciphertext after IV

            // Return as base64-encoded string for easy storage
            const base64Encoded = btoa(String.fromCharCode(...combined));

            console.log('[StorageEncryption] Data encrypted successfully');
            return base64Encoded;

        } catch (error) {
            console.error('[StorageEncryption] Encryption failed:', error);
            throw new Error(`Failed to encrypt data: ${error.message}`);
        }
    },

    /**
     * Decrypt AES-GCM-256 encrypted data
     *
     * ALGORITHM: AES-GCM-256
     * - Extracts IV from first 12 bytes of encrypted data
     * - Decrypts remaining bytes using extracted IV
     * - Returns decrypted string or null on failure
     *
     * SECURITY: IV is public information (not a secret) but MUST be unique.
     * This method extracts the IV that was prepended during encryption.
     *
     * @param {string} encryptedData - Base64-encoded encrypted data (IV + ciphertext from encrypt())
     * @param {CryptoKey} key - Non-extractable AES-GCM-256 key from KeyManager.getDataEncryptionKey()
     * @returns {Promise<string|null>} Decrypted plaintext string, or null if decryption fails
     *
     * @example
     * const encKey = await Security.getDataEncryptionKey();
     * const decrypted = await StorageEncryption.decrypt(encrypted, encKey);
     * if (decrypted === null) {
     *   console.error('Decryption failed - wrong key or corrupted data');
     * }
     */
    async decrypt(encryptedData, key) {
        try {
            // Validate inputs
            if (typeof encryptedData !== 'string') {
                throw new Error('Encrypted data must be a base64-encoded string');
            }

            if (!key || !(key instanceof CryptoKey)) {
                throw new Error('Key must be a CryptoKey object from KeyManager');
            }

            // Decode base64 to bytes
            const combined = new Uint8Array(
                [...atob(encryptedData)].map(c => c.charCodeAt(0))
            );

            // Extract IV (first 12 bytes) and ciphertext (remaining bytes)
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);

            // Validate extracted data
            if (iv.length !== 12) {
                throw new Error('Invalid encrypted data format: IV must be 12 bytes');
            }

            if (ciphertext.length === 0) {
                throw new Error('Invalid encrypted data format: no ciphertext found');
            }

            // Decrypt using AES-GCM-256
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                ciphertext
            );

            // Convert decrypted bytes back to string
            const decoder = new TextDecoder();
            const decryptedText = decoder.decode(decrypted);

            console.log('[StorageEncryption] Data decrypted successfully');
            return decryptedText;

        } catch (error) {
            // Graceful degradation - return null instead of throwing
            // This allows calling code to handle decryption failures gracefully
            console.error('[StorageEncryption] Decryption failed:', error);
            return null;
        }
    },

    /**
     * Encrypt data with metadata wrapper for storage
     *
     * Convenience method that wraps encrypted data with metadata for storage.
     * Includes key version for future key rotation support.
     *
     * @param {string} data - Plaintext data to encrypt
     * @param {CryptoKey} key - Non-extractable AES-GCM-256 key from KeyManager.getDataEncryptionKey()
     * @param {number} keyVersion - Key version identifier (default: 1)
     * @returns {Promise<object>} Object containing encrypted data with metadata
     *
     * @example
     * const encKey = await Security.getDataEncryptionKey();
     * const wrapped = await StorageEncryption.encryptWithMetadata('api-key-123', encKey, 1);
     * // Returns: { encrypted: true, keyVersion: 1, value: 'base64-encoded-data' }
     */
    async encryptWithMetadata(data, key, keyVersion = 1) {
        const encryptedValue = await this.encrypt(data, key);

        return {
            encrypted: true,
            keyVersion: keyVersion,
            value: encryptedValue,
            createdAt: Date.now()
        };
    },

    /**
     * Decrypt data from metadata wrapper
     *
     * Convenience method that extracts encrypted data from metadata wrapper.
     * Handles both wrapped (object) and unwrapped (string) formats.
     *
     * @param {object|string} wrappedData - Metadata wrapper or raw encrypted string
     * @param {CryptoKey} key - Non-extractable AES-GCM-256 key from KeyManager.getDataEncryptionKey()
     * @returns {Promise<string|null>} Decrypted plaintext string, or null if decryption fails
     *
     * @example
     * const encKey = await Security.getDataEncryptionKey();
     * const decrypted = await StorageEncryption.decryptFromMetadata(wrappedData, encKey);
     */
    async decryptFromMetadata(wrappedData, key) {
        // Handle both wrapped (object) and unwrapped (string) formats
        const encryptedValue = wrappedData?.value || wrappedData;

        if (!encryptedValue || typeof encryptedValue !== 'string') {
            console.error('[StorageEncryption] Invalid wrapped data format');
            return null;
        }

        return await this.decrypt(encryptedValue, key);
    }
};

export { StorageEncryption };