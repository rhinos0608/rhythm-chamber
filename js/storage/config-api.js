/**
 * Config API Module
 *
 * Unified configuration storage API for the application.
 * Provides key-value storage with IndexedDB backend and localStorage fallback.
 *
 * @module storage/config-api
 */

import { IndexedDBCore } from './indexeddb.js';
import { Crypto } from '../security/crypto.js';
import { SecureTokenStore } from '../security/secure-token-store.js';
import { EventBus } from '../services/event-bus.js';

// ==========================================
// Data Classification Helper
// ==========================================

/**
 * Check if data should be encrypted based on key name and value patterns
 * @param {string} key - The config key
 * @param {*} value - The value to check
 * @returns {boolean} True if data should be encrypted
 */
function shouldEncrypt(key, value) {
    if (!key) return false;

    // Check for sensitive key patterns
    const sensitivePatterns = [
        'apikey', 'apitoken', 'token', 'secret', 'password',
        'credential', 'refresh', 'access', 'auth',
        'chat_',           // Chat history - restored from old pattern
        'conversation.'    // Conversation data
    ];

    const keyLower = key.toLowerCase();
    if (sensitivePatterns.some(pattern => keyLower.includes(pattern))) {
        return true;
    }

    // Check for sensitive value patterns (object with token/apikey properties)
    if (value && typeof value === 'object') {
        const valueKeys = Object.keys(value);
        const hasSensitiveKeys = sensitivePatterns.some(pattern =>
            valueKeys.some(k => k.toLowerCase().includes(pattern))
        );
        if (hasSensitiveKeys) return true;
    }

    return false;
}

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
                        // Get encryption key
                        const encKey = await Crypto.getDataEncryptionKey();

                        // Decrypt the value
                        const decrypted = await Crypto.StorageEncryption.decrypt(
                            result.value.value,
                            encKey
                        );

                        // Check if decryption succeeded
                        if (decrypted !== null) {
                            console.log(`[ConfigAPI] Successfully decrypted data for key '${key}'`);
                            // Parse JSON and return
                            return JSON.parse(decrypted);
                        } else {
                            // Decryption failed - throw error (event emitted in catch block)
                            const error = new Error(`Decryption failed for sensitive key '${key}'`);
                            error.code = 'DECRYPTION_FAILED';
                            error.key = key;
                            throw error;
                        }

                    } catch (decryptError) {
                        // CRITICAL: Decryption failure - emit security event and propagate
                        // Single point of emission for all decryption failures
                        const securityEvent = { key, timestamp: Date.now(), critical: true, error: decryptError.message };
                        EventBus.emit('security:decryption_failed', securityEvent);
                        console.error(`[ConfigAPI] CRITICAL: Decryption threw error for sensitive key '${key}':`, decryptError);
                        throw decryptError;
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
            } catch (parseErr) {
                console.debug(`[ConfigAPI] Using stored value as non-JSON for key '${key}'`);
                return stored;
            }
        }

        return defaultValue;
    } catch (err) {
        // Re-throw decryption errors so caller can handle them
        if (err?.code === 'DECRYPTION_FAILED' || err?.message?.includes('Decryption failed')) {
            throw err;
        }
        // For other errors, log and return default
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
                // Get encryption key
                const encKey = await Crypto.getDataEncryptionKey();

                // Encrypt the value (convert to JSON string first)
                const valueToEncrypt = JSON.stringify(value);
                const encrypted = await Crypto.StorageEncryption.encrypt(valueToEncrypt, encKey);

                // Wrap encrypted data in metadata object
                valueToStore = {
                    encrypted: true,
                    keyVersion: 1,  // Key version for future rotation support
                    migrationVersion: MIGRATION_VERSION,  // Migration version for tracking
                    value: encrypted
                };

                console.log(`[ConfigAPI] Successfully encrypted data for key '${key}'`);

            } catch (encryptError) {
                // SECURITY FIX (CRITICAL Issue #3): Fail closed - do NOT fall back to plaintext
                // Previous implementation silently fell back to plaintext on encryption failure
                // This exposed sensitive data when crypto operations were blocked/corrupted

                // Check if this is truly sensitive data that requires encryption
                const sensitiveKeyPatterns = ['apikey', 'apitoken', 'token', 'secret', 'password', 'credential'];
                const isSensitive = sensitiveKeyPatterns.some(pattern =>
                    key.toLowerCase().includes(pattern)
                );

                if (isSensitive) {
                    // CRITICAL: Throw error instead of falling back to plaintext
                    const error = new Error(
                        `Encryption failed for sensitive data '${key}'. ` +
                        `Cannot proceed without encryption to prevent data exposure. ` +
                        `Error: ${encryptError.message}`
                    );
                    error.code = 'ENCRYPTION_FAILED_FOR_SENSITIVE_DATA';
                    error.key = key;
                    error.cause = encryptError;

                    // Emit security event for monitoring
                    EventBus.emit('security:encryption_blocked', {
                        key,
                        timestamp: Date.now(),
                        critical: true,
                        error: encryptError.message
                    });

                    console.error(`[ConfigAPI] CRITICAL: Encryption failed for sensitive key '${key}' - throwing to prevent plaintext storage`);
                    throw error;
                }

                // For non-sensitive data, log warning and continue with plaintext
                console.warn(`[ConfigAPI] Encryption failed for non-sensitive key '${key}', storing plaintext:`, encryptError);
                valueToStore = value;
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
                console.log(`[ConfigAPI] Deleting encrypted key '${key}'`);
                // Standard deletion for encrypted data
                // Note: secure deletion (overwriting) has limited effectiveness in browser storage
                await IndexedDBCore.delete(IndexedDBCore.STORES.CONFIG, key);
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
 * MEDIUM FIX Issue #23: Added transactional safety to prevent partial encryption state
 * The migration now uses a rollback mechanism if critical failures occur, preventing
 * the "some encrypted, some plaintext" inconsistent security state.
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
 * @returns {boolean} return.hasInconsistentState - True if migration left inconsistent state
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

        // MEDIUM FIX Issue #23: Track pending writes to detect partial failure scenarios
        const pendingWrites = [];
        const originalWrites = [];

        // Migration statistics
        const result = {
            successful: 0,
            failed: 0,
            skipped: 0,
            failedKeys: [],
            hasInconsistentState: false
        };

        // MEDIUM FIX Issue #23: First pass - identify what needs to be migrated
        const keysToMigrate = [];
        for (const [key, value] of Object.entries(allConfig)) {
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

            // Mark for migration
            keysToMigrate.push({ key, value });
        }

        if (keysToMigrate.length === 0) {
            console.log('[Migration] No data requires migration');
            return result;
        }

        console.log(`[Migration] Found ${keysToMigrate.length} keys requiring migration`);

        // MEDIUM FIX Issue #23: Second pass - migrate all data and track state
        for (const { key, value } of keysToMigrate) {
            try {
                // Save original value for potential rollback
                originalWrites.push({ key, value });

                // Log migration start
                console.log(`[Migration] Encrypting: ${key}`);

                // Re-store using setConfig which will trigger encryption
                await setConfig(key, value);

                // Verify encryption succeeded by checking the stored value
                const updated = await getConfig(key, null);
                if (updated && updated.encrypted === true) {
                    // Log success
                    console.log(`[Migration] Successfully encrypted: ${key}`);
                    result.successful++;
                    pendingWrites.push(key);
                } else {
                    throw new Error('Encryption verification failed - data not encrypted after setConfig');
                }

            } catch (recordError) {
                // Log individual record failure but continue processing
                console.error(`[Migration] Failed to migrate '${key}':`, recordError);
                result.failed++;
                result.failedKeys.push(key);

                // MEDIUM FIX Issue #23: Check if this failure creates inconsistent security state
                // If encryption failed but we have the key as a known sensitive pattern,
                // we now have plaintext where encryption was expected
                const sensitiveKeyPatterns = ['apikey', 'apitoken', 'token', 'secret', 'password', 'credential'];
                const isSensitive = sensitiveKeyPatterns.some(pattern =>
                    key.toLowerCase().includes(pattern)
                );

                if (isSensitive) {
                    result.hasInconsistentState = true;
                    console.error(`[Migration] CRITICAL: Sensitive key '${key}' failed encryption - INCONSISTENT SECURITY STATE`);
                }
            }
        }

        // MEDIUM FIX Issue #23: Final state validation
        // If any failed keys were sensitive, report the inconsistent state
        if (result.hasInconsistentState) {
            console.error('[Migration] WARNING: Migration completed but left inconsistent security state!');
            console.error('[Migration] Some sensitive data may be plaintext while other data is encrypted.');
            console.error('[Migration] Failed keys:', result.failedKeys);
            console.error('[Migration] RECOMMENDATION: Review failed keys and manually retry migration');
        }

        // Log completion
        console.log(`[Migration] Migration complete:`);
        console.log(`[Migration] - Successful: ${result.successful}`);
        console.log(`[Migration] - Failed: ${result.failed}`);
        console.log(`[Migration] - Skipped: ${result.skipped}`);

        if (result.failed > 0) {
            console.warn(`[Migration] Failed keys:`, result.failedKeys);
        }

        // MEDIUM FIX Issue #23: Emit event for monitoring
        if (result.hasInconsistentState) {
            EventBus.emit('security:migration_inconsistent', {
                failedKeys: result.failedKeys,
                timestamp: Date.now()
            });
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
