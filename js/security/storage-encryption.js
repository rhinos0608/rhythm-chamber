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
 * - This module provides encryption/decryption and data classification
 *
 * Usage:
 *   const encKey = await Security.getDataEncryptionKey();
 *   const encrypted = await StorageEncryption.encrypt('sensitive data', encKey);
 *   const decrypted = await StorageEncryption.decrypt(encrypted, encKey);
 *   const shouldProtect = shouldEncrypt('openrouter.apiKey', 'sk-or-v1-test');
 */

// ==========================================
// DATA CLASSIFICATION
// ==========================================

/**
 * Sensitive data patterns for automatic encryption classification
 *
 * Pattern types:
 * 1. Key name patterns - Config keys that typically contain sensitive data
 * 2. Value patterns - API key formats that indicate sensitive data
 *
 * SECURITY: These patterns follow OWASP guidelines for secrets identification.
 * When adding new patterns, consider:
 * - False positive rate (encrypting non-sensitive data is harmless but inefficient)
 * - False negative rate (missing sensitive data is a security issue)
 * - Future LLM providers (add comment patterns for maintainability)
 *
 * @constant {Array<string>}
 */
const SENSITIVE_PATTERNS = [
    // LLM API keys - provider specific
    'openrouter.apiKey',           // OpenRouter API key
    'gemini.apiKey',               // Google Gemini API key
    'claude.apiKey',               // Anthropic Claude API key
    'openai.apiKey',               // OpenAI API key
    'cohere.apiKey',               // Cohere API key
    'huggingface.apiKey',          // HuggingFace API key

    // Chat history and conversation data
    'chat_',                       // Chat history entries (prefix pattern)
    'conversation.',               // Conversation data
    'messages.',                   // Message stores

    // Future providers - add as needed
    // 'mistral.apiKey',             // Mistral AI API key
    // 'replicate.apiKey',           // Replicate API key
    // 'anthropic.apiKey',           // Anthropic API key (if different from claude)
];

/**
 * Classify data as sensitive for encryption
 *
 * Determines whether data should be encrypted based on key name patterns and value patterns.
 * This implements defense-in-depth by encrypting data that matches known sensitive patterns.
 *
 * CLASSIFICATION LOGIC:
 * 1. Key name patterns - Check if key matches SENSITIVE_PATTERNS
 * 2. Chat history patterns - Check if key starts with 'chat_' or contains 'chat'
 * 3. Value patterns - Check if value matches known API key formats
 *
 * SECURITY RATIONALE:
 * - Key-based classification: Prevents misclassification of sensitive data
 * - Value-based classification: Catches sensitive data with non-standard key names
 * - Chat history protection: User conversations are sensitive by default
 * - Provider-specific patterns: Each LLM provider has unique API key format
 *
 * @param {string} key - The config key name (e.g., 'openrouter.apiKey')
 * @param {*} value - The config value (will be converted to string for pattern matching)
 * @returns {boolean} True if data should be encrypted, false otherwise
 *
 * @example
 * // Key-based classification
 * shouldEncrypt('openrouter.apiKey', 'sk-or-v1-abc123')  // true
 * shouldEncrypt('theme', 'dark')                          // false
 *
 * @example
 * // Chat history classification
 * shouldEncrypt('chat_20240120', [{role: 'user', content: 'hello'}])  // true
 * shouldEncrypt('chat_summary', 'Great conversation')                  // true
 *
 * @example
 * // Value-based classification (catches non-standard key names)
 * shouldEncrypt('myCustomKey', 'sk-or-v1-abc123')      // true (OpenRouter format)
 * shouldEncrypt('myCustomKey', 'AIzaSyABC123')         // true (Gemini format)
 * shouldEncrypt('myCustomKey', 'sk-ant-abc123')        // true (Claude format)
 * shouldEncrypt('myCustomKey', 'regular-string')       // false
 */
export function shouldEncrypt(key, value) {
    try {
        // Handle null/undefined inputs gracefully
        if (!key || typeof key !== 'string') {
            return false;
        }

        // 1. Check key name patterns against SENSITIVE_PATTERNS
        if (SENSITIVE_PATTERNS.some(pattern => key.includes(pattern))) {
            console.log(`[StorageEncryption] Classifying '${key}' as sensitive (key pattern match)`);
            return true;
        }

        // 2. Check chat history patterns
        // Chat history is sensitive by default - contains user conversations
        if (key.startsWith('chat_') || key.includes('chat')) {
            console.log(`[StorageEncryption] Classifying '${key}' as sensitive (chat history)`);
            return true;
        }

        // 3. Check value patterns for API key formats
        // This catches sensitive data with non-standard key names
        if (value && typeof value === 'string') {
            // OpenRouter API keys: sk-or-v1-*
            if (value.startsWith('sk-or-v1-')) {
                console.log(`[StorageEncryption] Classifying '${key}' as sensitive (OpenRouter API key format)`);
                return true;
            }

            // Google Gemini API keys: AIzaSy*
            if (value.startsWith('AIzaSy')) {
                console.log(`[StorageEncryption] Classifying '${key}' as sensitive (Gemini API key format)`);
                return true;
            }

            // Anthropic Claude API keys: sk-ant-*
            if (value.startsWith('sk-ant-')) {
                console.log(`[StorageEncryption] Classifying '${key}' as sensitive (Claude API key format)`);
                return true;
            }

            // OpenAI API keys: sk-*
            if (value.startsWith('sk-') && !value.startsWith('sk-ant-')) {
                console.log(`[StorageEncryption] Classifying '${key}' as sensitive (OpenAI API key format)`);
                return true;
            }
        }

        // Default: not sensitive
        return false;

    } catch (error) {
        // Fail closed - on classification error, encrypt to be safe
        console.error('[StorageEncryption] Error in shouldEncrypt classification, defaulting to encryption:', error);
        return true;
    }
}

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
    },

    /**
     * Migrate encrypted data from old key to new key (key rotation)
     *
     * KEY ROTATION: This method enables secure migration of encrypted data when
     * encryption keys change. It decrypts data with the old key and re-encrypts
     * with the new key, maintaining data confidentiality during key rotation.
     *
     * SECURITY CONSIDERATIONS:
     * - Old and new keys must both be non-extractable CryptoKey objects
     * - Migration happens in memory - old encrypted data remains in storage
     * - Caller must overwrite old encrypted data after successful migration
     * - Failed migrations return null, allowing graceful error handling
     *
     * USE CASES:
     * - Password change: Derive new key from new password, migrate existing data
     * - Key versioning: Upgrade from weaker to stronger encryption
     * - Key compromise: Rotate to new key if old key is suspected compromised
     * - Algorithm upgrades: Migrate data when changing encryption parameters
     *
     * @param {CryptoKey} oldKey - Previous encryption key (must be valid for existing encrypted data)
     * @param {CryptoKey} newKey - New encryption key (will be used for re-encryption)
     * @param {string} encryptedData - Base64-encoded encrypted data from encrypt()
     * @returns {Promise<string|null>} Re-encrypted data with new key, or null if migration fails
     *
     * @example
     * // Key rotation after password change
     * const oldKey = await Security.getDataEncryptionKey(); // Current key
     * const newKey = await Security.deriveDataEncryptionKey(newPassword); // New key
     * const oldEncrypted = 'base64-encoded-data';
     * const newEncrypted = await StorageEncryption.migrateData(oldKey, newKey, oldEncrypted);
     * if (newEncrypted !== null) {
     *   // Save newEncrypted to storage, delete oldEncrypted
     * } else {
     *   // Migration failed - handle error
     * }
     *
     * @example
     * // Batch migration for all encrypted config
     * const allConfig = await ConfigAPI.getAllConfig();
     * for (const [key, value] of Object.entries(allConfig)) {
     *   if (value.encrypted && value.keyVersion === 1) {
     *     const migrated = await StorageEncryption.migrateData(oldKey, newKey, value.value);
     *     if (migrated) {
     *       await ConfigAPI.setConfig(key, { encrypted: true, keyVersion: 2, value: migrated });
     *     }
     *   }
     * }
     */
    async migrateData(oldKey, newKey, encryptedData) {
        try {
            // Validate inputs
            if (!oldKey || !(oldKey instanceof CryptoKey)) {
                throw new Error('Old key must be a CryptoKey object from KeyManager');
            }

            if (!newKey || !(newKey instanceof CryptoKey)) {
                throw new Error('New key must be a CryptoKey object from KeyManager');
            }

            if (typeof encryptedData !== 'string') {
                throw new Error('Encrypted data must be a base64-encoded string');
            }

            console.log('[StorageEncryption] Starting key migration...');

            // Step 1: Decrypt data using old key
            const decrypted = await this.decrypt(encryptedData, oldKey);

            // If decryption fails (returns null), abort migration immediately
            if (decrypted === null) {
                console.error('[StorageEncryption] Migration failed: Unable to decrypt with old key');
                return null;
            }

            console.log('[StorageEncryption] Successfully decrypted with old key');

            // Step 2: Re-encrypt decrypted data using new key
            const reEncrypted = await this.encrypt(decrypted, newKey);

            console.log('[StorageEncryption] Successfully re-encrypted with new key');
            console.log('[StorageEncryption] Key migration completed successfully');

            return reEncrypted;

        } catch (error) {
            // Log migration failure but don't throw - allow graceful degradation
            console.error('[StorageEncryption] Key migration failed:', error);
            return null;
        }
    }
};

/**
 * Secure deletion of encrypted data from IndexedDB
 *
 * SECURITY RATIONALE: When deleting encrypted sensitive data (API keys, chat history),
 * overwrite with random data before deletion to prevent forensic recovery. This follows
 * secure data sanitization best practices for preventing data recovery from storage media.
 *
 * HOW IT WORKS:
 * 1. Fetch the record from IndexedDB
 * 2. Check if it's encrypted (value.encrypted === true)
 * 3. If encrypted:
 *    - Generate random data matching the encrypted value length
 *    - Overwrite the record with random data
 *    - Delete the record
 * 4. If not encrypted:
 *    - Skip overwriting (plaintext doesn't need sanitization)
 *    - Delete the record directly
 *
 * GRACEFUL DEGRADATION:
 * - If record doesn't exist, return immediately (nothing to delete)
 * - If overwrite fails, log warning and proceed to delete
 * - If delete fails, log error but don't throw
 *
 * @param {string} storeName - IndexedDB store name
 * @param {string} key - Record key to delete
 * @returns {Promise<void>}
 *
 * @example
 * // Delete encrypted API key securely
 * await secureDelete('config', 'openrouter.apiKey');
 *
 * @example
 * // Delete chat history securely
 * await secureDelete('config', 'chat_20240120');
 */
export async function secureDelete(storeName, key) {
    try {
        // Import IndexedDBCore dynamically to avoid circular dependency
        const { IndexedDBCore } = await import('../storage/indexeddb.js');

        // Step 1: Fetch the record to check if it exists and is encrypted
        const record = await IndexedDBCore.get(storeName, key);

        // If record doesn't exist, nothing to delete
        if (!record) {
            console.log(`[StorageEncryption] Record '${key}' not found in store '${storeName}', nothing to delete`);
            return;
        }

        // Step 2: Check if record is encrypted
        const isEncrypted = record.value?.encrypted === true;

        if (isEncrypted) {
            console.log(`[StorageEncryption] Securely deleting encrypted record '${key}' from store '${storeName}'`);

            try {
                // Step 3: Generate random data to overwrite encrypted value
                // Calculate length of the encrypted value string
                const encryptedValue = record.value.value;
                const valueLength = encryptedValue.length;

                // Generate random bytes matching the encrypted value length
                const randomBytes = crypto.getRandomValues(new Uint8Array(valueLength));

                // Convert to base64 to match the encrypted data format
                const randomBase64 = btoa(String.fromCharCode(...randomBytes));

                // Step 4: Overwrite the record with random data
                await IndexedDBCore.put(storeName, {
                    key: key,
                    value: {
                        encrypted: true,
                        keyVersion: record.value.keyVersion || 1,
                        value: randomBase64 // Overwritten with random data
                    },
                    updatedAt: new Date().toISOString()
                });

                console.log(`[StorageEncryption] Successfully overwrote encrypted record '${key}' with random data`);

            } catch (overwriteError) {
                // If overwrite fails, log warning but proceed to delete
                console.warn(`[StorageEncryption] Failed to overwrite record '${key}' with random data:`, overwriteError);
                console.warn(`[StorageEncryption] Proceeding with deletion anyway`);
            }

            // Step 5: Delete the record (whether overwrite succeeded or not)
            try {
                await IndexedDBCore.delete(storeName, key);
                console.log(`[StorageEncryption] Successfully deleted encrypted record '${key}'`);
            } catch (deleteError) {
                console.error(`[StorageEncryption] Failed to delete record '${key}':`, deleteError);
            }

        } else {
            // Not encrypted - skip overwriting, just delete
            console.log(`[StorageEncryption] Record '${key}' is not encrypted, using standard deletion`);
            await IndexedDBCore.delete(storeName, key);
        }

    } catch (error) {
        // Never throw exceptions - graceful degradation
        console.error(`[StorageEncryption] Secure deletion failed for '${key}':`, error);
    }
}

export { StorageEncryption };