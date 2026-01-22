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
import { shouldEncrypt, secureDelete } from '../security/storage-encryption.js';
import { SecureTokenStore } from '../security/secure-token-store.js';
import { EventBus } from '../services/event-bus.js';

// ==========================================
// Migration Constants
// ==========================================

/**
 * Migration version for encrypted storage tracking
 *
 * This version number is embedded in encrypted data metadata and used for:
 * - Future migration detection: Different versions may need different handling
 * - Key rotation planning: Knowing which key version was used for encryption
 * - Data migration patterns: Understanding how data was encrypted over time
 *
 * INCREMENT THIS VALUE WHEN:
 * - Changing encryption metadata structure
 * - Implementing new key rotation strategy
 * - Modifying encryption algorithm or parameters
 *
 * @constant {number}
 */
const MIGRATION_VERSION = 1;

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
                            // Decryption failed - emit security event and return null (not defaultValue)
                            const securityEvent = { key, timestamp: Date.now(), critical: true };
                            EventBus.emit('security:decryption_failed', securityEvent);
                            console.error(`[ConfigAPI] CRITICAL: Decryption failed for sensitive key '${key}'`);
                            return null;
                        }

                    } catch (decryptError) {
                        // CRITICAL: Decryption failure - emit security event
                        const securityEvent = { key, timestamp: Date.now(), critical: true, error: decryptError.message };
                        EventBus.emit('security:decryption_failed', securityEvent);
                        console.error(`[ConfigAPI] CRITICAL: Decryption threw error for sensitive key '${key}':`, decryptError);
                        return null;
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
                    migrationVersion: MIGRATION_VERSION,  // Migration version for tracking
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
 *
 * SECURE DELETION BEHAVIOR:
 * - Automatically uses secure deletion for encrypted data (overwrites with random data)
 * - Checks if record is encrypted before deletion
 * - Falls back to standard deletion for plaintext data
 * - Falls back to standard deletion if secure deletion fails
 *
 * @param {string} key - The config key to remove
 * @returns {Promise<void>}
 */
async function removeConfig(key) {
    try {
        // Try IndexedDBCore if available
        if (IndexedDBCore) {
            // Fetch record to check encryption status before deletion
            const record = await IndexedDBCore.get(IndexedDBCore.STORES.CONFIG, key);

            // Check if record exists and is encrypted
            if (record && record.value?.encrypted === true) {
                console.log(`[ConfigAPI] Using secure deletion for encrypted key '${key}'`);

                try {
                    // Use secure deletion for encrypted data (overwrites with random data)
                    await secureDelete(IndexedDBCore.STORES.CONFIG, key);
                } catch (secureDeleteError) {
                    // Fall back to standard deletion if secure deletion fails
                    console.warn(`[ConfigAPI] Secure deletion failed for '${key}', falling back to standard delete:`, secureDeleteError);
                    await IndexedDBCore.delete(IndexedDBCore.STORES.CONFIG, key);
                }
            } else {
                // Not encrypted - use standard deletion
                console.log(`[ConfigAPI] Using standard deletion for key '${key}'`);
                await IndexedDBCore.delete(IndexedDBCore.STORES.CONFIG, key);
            }
        }

        // Also clean from localStorage (existing behavior)
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

/**
 * Migrate existing plaintext sensitive data to encrypted storage
 *
 * ONE-TIME MIGRATION: This function converts existing plaintext API keys,
 * chat history, and other sensitive data to encrypted storage. It iterates
 * through all existing config and encrypts data that matches sensitive patterns.
 *
 * MIGRATION BEHAVIOR:
 * - Only processes plaintext data (value.encrypted !== true)
 * - Uses shouldEncrypt() to identify sensitive data
 * - Re-stores data using setConfig() which triggers encryption
 * - Safe to run multiple times (idempotent) - skips already-encrypted data
 * - Continues processing on individual record failures
 * - Logs all migration activity for manual verification
 *
 * USE CASES:
 * - Initial setup: Encrypt existing plaintext API keys after enabling encryption
 * - Post-upgrade: Migrate data after adding new sensitive patterns
 * - Manual migration: User-initiated encryption of existing data
 *
 * RECOMMENDATIONS:
 * - Backup database before running migration
 * - Verify migration success by checking console logs
 * - Run during app initialization or via admin interface
 * - Test migration on development environment first
 *
 * @returns {Promise<Object>} Migration result with success/failure counts
 * @returns {number} return.successful - Number of records successfully migrated
 * @returns {number} return.failed - Number of records that failed to migrate
 * @returns {number} return.skipped - Number of records skipped (already encrypted or not sensitive)
 * @returns {Array<string>} return.failedKeys - Keys that failed migration
 *
 * @example
 * // Run migration during app initialization
 * const result = await ConfigAPI.migrateToEncryptedStorage();
 * console.log(`Migrated ${result.successful} records, ${result.failed} failed, ${result.skipped} skipped`);
 * if (result.failed > 0) {
 *   console.warn('Failed keys:', result.failedKeys);
 * }
 *
 * @example
 * // Manual migration via developer console
 * await ConfigAPI.migrateToEncryptedStorage();
 * // Check console output for migration progress
 * // Verify: await ConfigAPI.getAllConfig() should show encrypted: true for sensitive keys
 */
async function migrateToEncryptedStorage() {
    try {
        console.log('[Migration] Starting encrypted storage migration...');

        // Get all existing config
        const allConfig = await getAllConfig();

        // Migration statistics
        const result = {
            successful: 0,
            failed: 0,
            skipped: 0,
            failedKeys: []
        };

        // Process each config entry
        for (const [key, value] of Object.entries(allConfig)) {
            try {
                // Check if data should be encrypted
                if (!shouldEncrypt(key, value)) {
                    result.skipped++;
                    continue;
                }

                // Check if already encrypted
                if (value && value.encrypted === true) {
                    console.log(`[Migration] Skipping '${key}' - already encrypted`);
                    result.skipped++;
                    continue;
                }

                // Log migration start
                console.log(`[Migration] Encrypting: ${key}`);

                // Re-store using setConfig which will trigger encryption
                await setConfig(key, value);

                // Log success
                console.log(`[Migration] Successfully encrypted: ${key}`);
                result.successful++;

            } catch (recordError) {
                // Log individual record failure but continue processing
                console.error(`[Migration] Failed to migrate '${key}':`, recordError);
                result.failed++;
                result.failedKeys.push(key);
            }
        }

        // Log completion
        console.log(`[Migration] Migration complete:`);
        console.log(`[Migration] - Successful: ${result.successful}`);
        console.log(`[Migration] - Failed: ${result.failed}`);
        console.log(`[Migration] - Skipped: ${result.skipped}`);

        if (result.failed > 0) {
            console.warn(`[Migration] Failed keys:`, result.failedKeys);
        }

        return result;

    } catch (error) {
        console.error('[Migration] Migration failed:', error);
        return {
            successful: 0,
            failed: 0,
            skipped: 0,
            failedKeys: [],
            error: error.message
        };
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
        if (SecureTokenStore?.isAvailable?.()) {
            return await SecureTokenStore.retrieve(key);
        }
        if (SecureTokenStore) {
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
        if (SecureTokenStore?.isAvailable?.()) {
            const stored = await SecureTokenStore.store(key, value, {
                metadata: { source: 'config_api' }
            });
            if (!stored) {
                throw new Error('SecureTokenStore refused token write');
            }
            return;
        }
        if (SecureTokenStore) {
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
        if (SecureTokenStore?.isAvailable?.()) {
            await SecureTokenStore.invalidate(key);
        }
        if (!SecureTokenStore && IndexedDBCore) {
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
        if (SecureTokenStore?.isAvailable?.()) {
            await SecureTokenStore.invalidateAllTokens('config_api_clear');
        }

        if (!SecureTokenStore && IndexedDBCore) {
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
    migrateToEncryptedStorage,

    // Token operations
    getToken,
    setToken,
    removeToken,
    clearAllTokens
};


console.log('[ConfigAPI] Unified config API loaded');
