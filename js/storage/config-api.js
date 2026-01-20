/**
 * Config API Module
 *
 * Unified configuration storage API for the application.
 * Provides key-value storage with IndexedDB backend and localStorage fallback.
 *
 * @module storage/config-api
 */

import { IndexedDBCore } from './indexeddb.js';
import { Security } from '../security/index.js';
import { shouldEncrypt } from '../security/storage-encryption.js';

// ==========================================
// Config API
// ==========================================

/**
 * Get a config value from unified storage
 *
 * DECRYPTION BEHAVIOR:
 * - Automatically decrypts encrypted data after retrieval
 * - Checks for encrypted flag in metadata wrapper
 * - Falls back to defaultValue on decryption failure (graceful degradation)
 * - Supports mixed encrypted/plaintext database state
 *
 * @param {string} key - The config key
 * @param {*} defaultValue - Default if not found
 * @returns {Promise<*>} The stored value or default
 */
async function getConfig(key, defaultValue = null) {
    try {
        // Try IndexedDBCore if available
        if (IndexedDBCore) {
            const result = await IndexedDBCore.get(
                IndexedDBCore.STORES.CONFIG,
                key
            );
            if (result) {
                // Check if data is encrypted
                if (result.value && result.value.encrypted === true) {
                    console.log(`[ConfigAPI] Decrypting sensitive data for key '${key}'`);

                    try {
                        // Get encryption key from KeyManager
                        const encKey = await Security.getDataEncryptionKey();

                        // Decrypt the value
                        const decrypted = await Security.StorageEncryption.decrypt(
                            result.value.value,
                            encKey
                        );

                        // Check if decryption succeeded
                        if (decrypted !== null) {
                            console.log(`[ConfigAPI] Successfully decrypted data for key '${key}'`);
                            // Parse JSON and return
                            return JSON.parse(decrypted);
                        } else {
                            // Decryption failed - return defaultValue
                            console.warn(`[ConfigAPI] Decryption returned null for key '${key}', returning default value`);
                            return defaultValue;
                        }

                    } catch (decryptError) {
                        // Fall back to defaultValue on decryption failure
                        console.warn(`[ConfigAPI] Decryption failed for '${key}', returning default value:`, decryptError);
                        return defaultValue;
                    }
                }

                // Not encrypted - return value as-is
                return result.value;
            }
        }

        // Fall back to localStorage
        const stored = localStorage.getItem(key);
        if (stored !== null) {
            try {
                return JSON.parse(stored);
            } catch {
                return stored;
            }
        }

        return defaultValue;
    } catch (err) {
        console.warn(`[ConfigAPI] Error getting config '${key}':`, err);
        return defaultValue;
    }
}

/**
 * Set a config value in unified storage
 *
 * ENCRYPTION BEHAVIOR:
 * - Automatically encrypts sensitive data before storage (API keys, chat history)
 * - Uses data classification to determine what needs encryption
 * - Wraps encrypted data in metadata object with key version
 * - Falls back to plaintext storage on encryption failure (graceful degradation)
 *
 * @param {string} key - The config key
 * @param {*} value - The value to store
 * @returns {Promise<void>}
 */
async function setConfig(key, value) {
    try {
        let valueToStore = value;

        // Check if data should be encrypted based on key name and value patterns
        if (shouldEncrypt(key, value)) {
            console.log(`[ConfigAPI] Encrypting sensitive data for key '${key}'`);

            try {
                // Get encryption key from KeyManager
                const encKey = await Security.getDataEncryptionKey();

                // Encrypt the value (convert to JSON string first)
                const valueToEncrypt = JSON.stringify(value);
                const encrypted = await Security.StorageEncryption.encrypt(valueToEncrypt, encKey);

                // Wrap encrypted data in metadata object
                valueToStore = {
                    encrypted: true,
                    keyVersion: 1,  // Key version for future rotation support
                    value: encrypted
                };

                console.log(`[ConfigAPI] Successfully encrypted data for key '${key}'`);

            } catch (encryptError) {
                // Fall back to plaintext storage on encryption failure
                console.warn(`[ConfigAPI] Encryption failed for '${key}', falling back to plaintext:`, encryptError);
                valueToStore = value; // Use original value
            }
        }

        // Try IndexedDBCore if available
        if (IndexedDBCore) {
            await IndexedDBCore.put(IndexedDBCore.STORES.CONFIG, {
                key,
                value: valueToStore,
                updatedAt: new Date().toISOString()
            });
            return;
        }

        // Fall back to localStorage (only for non-encrypted data)
        if (!valueToStore?.encrypted) {
            localStorage.setItem(key, JSON.stringify(valueToStore));
        } else {
            console.warn(`[ConfigAPI] Cannot store encrypted data in localStorage for key '${key}'`);
            throw new Error('Encrypted data requires IndexedDB');
        }

    } catch (err) {
        console.warn(`[ConfigAPI] Error setting config '${key}':`, err);
        // Try localStorage as last resort (only for non-encrypted data)
        try {
            if (!value?.encrypted) {
                localStorage.setItem(key, JSON.stringify(value));
            } else {
                console.error(`[ConfigAPI] Cannot store encrypted data in localStorage for key '${key}'`);
            }
        } catch (e) {
            console.error(`[ConfigAPI] Failed to set config '${key}':`, e);
        }
    }
}

/**
 * Remove a config value from unified storage
 * @param {string} key - The config key to remove
 * @returns {Promise<void>}
 */
async function removeConfig(key) {
    try {
        // Try IndexedDBCore if available
        if (IndexedDBCore) {
            await IndexedDBCore.delete(IndexedDBCore.STORES.CONFIG, key);
        }

        // Also clean from localStorage
        localStorage.removeItem(key);
    } catch (err) {
        console.warn(`[ConfigAPI] Error removing config '${key}':`, err);
        localStorage.removeItem(key);
    }
}

/**
 * Get all config values
 * @returns {Promise<Object>} All config as key-value pairs
 */
async function getAllConfig() {
    try {
        if (IndexedDBCore) {
            const records = await IndexedDBCore.getAll(
                IndexedDBCore.STORES.CONFIG
            );
            const config = {};
            for (const record of records) {
                config[record.key] = record.value;
            }
            return config;
        }
        return {};
    } catch (err) {
        console.warn('[ConfigAPI] Error getting all config:', err);
        return {};
    }
}

// ==========================================
// Token API (Secure Storage)
// ==========================================

/**
 * Get a token from secure token storage
 * @param {string} key - Token key (e.g., 'spotify_access_token')
 * @returns {Promise<*>} The token value or null
 */
async function getToken(key) {
    try {
        if (window.SecureTokenStore?.isAvailable?.()) {
            return await window.SecureTokenStore.retrieve(key);
        }
        if (window.SecureTokenStore) {
            console.warn(`[ConfigAPI] SecureTokenStore unavailable; token access blocked for '${key}'.`);
            return null;
        }

        if (IndexedDBCore) {
            const result = await IndexedDBCore.get(
                IndexedDBCore.STORES.TOKENS,
                key
            );
            return result ? result.value : null;
        }

        // Legacy fallback for environments without SecureTokenStore
        return localStorage.getItem(key);
    } catch (err) {
        console.warn(`[ConfigAPI] Error getting token '${key}':`, err);
        return null;
    }
}

/**
 * Set a token in secure token storage
 * @param {string} key - Token key
 * @param {*} value - Token value
 * @returns {Promise<void>}
 */
async function setToken(key, value) {
    try {
        if (window.SecureTokenStore?.isAvailable?.()) {
            const stored = await window.SecureTokenStore.store(key, value, {
                metadata: { source: 'config_api' }
            });
            if (!stored) {
                throw new Error('SecureTokenStore refused token write');
            }
            return;
        }
        if (window.SecureTokenStore) {
            console.warn(`[ConfigAPI] SecureTokenStore unavailable; token write blocked for '${key}'.`);
            return;
        }

        if (IndexedDBCore) {
            await IndexedDBCore.put(IndexedDBCore.STORES.TOKENS, {
                key,
                value,
                updatedAt: new Date().toISOString()
            });
            return;
        }

        // Legacy fallback for environments without SecureTokenStore
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (err) {
        console.warn(`[ConfigAPI] Error setting token '${key}':`, err);
    }
}

/**
 * Remove a token from storage
 * @param {string} key - Token key
 * @returns {Promise<void>}
 */
async function removeToken(key) {
    try {
        if (window.SecureTokenStore?.isAvailable?.()) {
            await window.SecureTokenStore.invalidate(key);
        }
        if (!window.SecureTokenStore && IndexedDBCore) {
            await IndexedDBCore.delete(IndexedDBCore.STORES.TOKENS, key);
        }
        localStorage.removeItem(key);
    } catch (err) {
        console.warn(`[ConfigAPI] Error removing token '${key}':`, err);
        localStorage.removeItem(key);
    }
}

/**
 * Clear all tokens
 * @returns {Promise<void>}
 */
async function clearAllTokens() {
    try {
        if (window.SecureTokenStore?.isAvailable?.()) {
            await window.SecureTokenStore.invalidateAllTokens('config_api_clear');
        }

        if (!window.SecureTokenStore && IndexedDBCore) {
            await IndexedDBCore.clear(IndexedDBCore.STORES.TOKENS);
        }

        // Clear known token keys from localStorage (legacy cleanup)
        ['spotify_access_token', 'spotify_token_expiry', 'spotify_refresh_token'].forEach(key => {
            localStorage.removeItem(key);
        });
    } catch (err) {
        console.warn('[ConfigAPI] Error clearing tokens:', err);
    }
}

// ==========================================
// Public API
// ==========================================

export const ConfigAPI = {
    // Config operations
    getConfig,
    setConfig,
    removeConfig,
    getAllConfig,

    // Token operations
    getToken,
    setToken,
    removeToken,
    clearAllTokens
};


console.log('[ConfigAPI] Unified config API loaded');
