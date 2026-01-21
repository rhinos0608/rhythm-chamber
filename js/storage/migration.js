/**
 * Storage Migration Module
 *
 * Handles migration of data from localStorage to IndexedDB.
 * Provides atomic migration with backup and rollback capabilities.
 *
 * @module storage/migration
 */

import { IndexedDBCore } from './indexeddb.js';
import { ConfigAPI } from './config-api.js';
import { SecureTokenStore } from '../security/secure-token-store.js';

// ==========================================
// Migration Configuration
// ==========================================

const MIGRATION_MODULE_VERSION = 1;

// Keys to migrate from localStorage to IndexedDB CONFIG store
const MIGRATION_CONFIG_KEYS = [
    'rhythm_chamber_settings',
    'rhythm_chamber_rag',
    'rhythm_chamber_rag_checkpoint',
    'rhythm_chamber_rag_checkpoint_cipher',
    'rhythm_chamber_current_session',
    'rhythm_chamber_sidebar_collapsed',
    'rhythm_chamber_persistence_consent'
];

// Token keys to migrate to TOKENS store
const MIGRATION_TOKEN_KEYS = [
    'spotify_access_token',
    'spotify_token_expiry',
    'spotify_refresh_token'
];

// Keys that must stay in localStorage (require sync access)
const MIGRATION_EXEMPT_KEYS = [
    'rhythm_chamber_emergency_backup'
];

// ==========================================
// Legacy Token Helpers
// ==========================================

async function getLegacyTokenValue(key) {
    const localValue = localStorage.getItem(key);
    if (localValue !== null) {
        return localValue;
    }

    if (IndexedDBCore) {
        try {
            const record = await IndexedDBCore.get(
                IndexedDBCore.STORES.TOKENS,
                key
            );
            return record ? record.value : null;
        } catch (err) {
            console.warn(`[Migration] Error reading legacy token '${key}':`, err);
        }
    }

    return null;
}

async function removeLegacyTokenKey(key) {
    localStorage.removeItem(key);
    if (IndexedDBCore) {
        try {
            await IndexedDBCore.delete(IndexedDBCore.STORES.TOKENS, key);
        } catch (err) {
            console.warn(`[Migration] Error removing legacy token '${key}':`, err);
        }
    }
}

async function hasLegacyTokens() {
    for (const key of MIGRATION_TOKEN_KEYS) {
        const localValue = localStorage.getItem(key);
        if (localValue !== null) {
            return true;
        }
    }

    if (IndexedDBCore) {
        for (const key of MIGRATION_TOKEN_KEYS) {
            try {
                const record = await IndexedDBCore.get(
                    IndexedDBCore.STORES.TOKENS,
                    key
                );
                if (record?.value != null) {
                    return true;
                }
            } catch (err) {
                console.warn(`[Migration] Error checking legacy token '${key}':`, err);
            }
        }
    }

    return false;
}

function parseExpiryMs(value) {
    if (value === null || value === undefined) return null;
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return null;
    return parsed;
}

// ==========================================
// Migration State
// ==========================================

/**
 * Get the current migration state
 * @returns {Promise<Object|null>} Migration state or null if never migrated
 */
async function getMigrationState() {
    try {
        if (!IndexedDBCore) {
            return null;
        }

        return await IndexedDBCore.get(
            IndexedDBCore.STORES.MIGRATION,
            'migration_state'
        );
    } catch (err) {
        console.warn('[Migration] Error getting migration state:', err);
        return null;
    }
}

/**
 * Check if migration is needed
 * @returns {Promise<boolean>}
 */
async function isMigrationNeeded() {
    const state = await getMigrationState();
    if (!state || state.version < MIGRATION_MODULE_VERSION) {
        return true;
    }

    return await hasLegacyTokens();
}

/**
 * Get checkpoint state for resumable migration
 * @returns {Promise<Object|null>}
 */
async function getCheckpoint() {
    try {
        if (!IndexedDBCore) {
            return null;
        }
        return await IndexedDBCore.get(
            IndexedDBCore.STORES.MIGRATION,
            'migration_checkpoint'
        );
    } catch (err) {
        console.warn('[Migration] Error getting checkpoint:', err);
        return null;
    }
}

/**
 * Save checkpoint for resumable migration
 * 
 * WRITE-AHEAD MODE: When intent is specified, this is a write-ahead checkpoint
 * that records the INTENT to perform an operation. After the operation succeeds,
 * call saveCheckpoint again with status='complete' to mark it done.
 * 
 * On resume:
 * - 'pending': Re-execute the operation (may have failed before completing)
 * - 'complete': Skip this key (already done)
 * - 'failed': Skip (already failed, don't retry)
 * 
 * @param {Object} checkpoint - Checkpoint data
 * @param {string} [checkpoint.intent] - Operation intent: 'config' | 'token'
 * @param {string} [checkpoint.key] - Key being processed
 * @param {string} [checkpoint.status] - Status: 'pending' | 'complete' | 'failed'
 * @returns {Promise<void>}
 */
async function saveCheckpoint(checkpoint) {
    if (!IndexedDBCore) {
        return;
    }
    try {
        await IndexedDBCore.put(IndexedDBCore.STORES.MIGRATION, {
            id: 'migration_checkpoint',
            ...checkpoint,
            timestamp: Date.now()
        });
    } catch (err) {
        console.warn('[Migration] Error saving checkpoint:', err);
    }
}

/**
 * Save write-ahead intent checkpoint before processing a key
 * @param {string} intent - 'config' | 'token'
 * @param {string} key - Key to process
 * @param {number} index - Current index
 * @param {number} keysProcessed - Keys processed so far
 * @param {number} totalKeys - Total keys
 * @returns {Promise<void>}
 */
async function saveWriteAheadCheckpoint(intent, key, index, keysProcessed, totalKeys) {
    await saveCheckpoint({
        intent,
        key,
        index,
        lastProcessedIndex: index - 1,
        keysProcessed,
        totalKeys,
        status: 'pending',
        phase: intent
    });
}

/**
 * Mark write-ahead checkpoint as complete
 * @param {string} intent - 'config' | 'token'
 * @param {string} key - Key that was processed
 * @param {number} index - Current index
 * @param {number} keysProcessed - Keys processed so far
 * @param {number} totalKeys - Total keys
 * @returns {Promise<void>}
 */
async function markCheckpointComplete(intent, key, index, keysProcessed, totalKeys) {
    await saveCheckpoint({
        intent,
        key,
        index,
        lastProcessedIndex: index,
        keysProcessed,
        totalKeys,
        status: 'complete',
        phase: intent
    });
}

/**
 * Mark write-ahead checkpoint as failed
 * @param {string} intent - 'config' | 'token'
 * @param {string} key - Key that failed
 * @param {number} index - Current index
 * @param {string} error - Error message
 * @param {number} keysProcessed - Keys processed so far
 * @param {number} totalKeys - Total keys
 * @param {number} [lastProcessedIndex] - Last successfully processed index
 * @returns {Promise<void>}
 */
async function markCheckpointFailed(intent, key, index, error, keysProcessed, totalKeys, lastProcessedIndex) {
    await saveCheckpoint({
        intent,
        key,
        index,
        lastProcessedIndex: lastProcessedIndex !== undefined ? lastProcessedIndex : index - 1,
        keysProcessed,
        totalKeys,
        status: 'failed',
        error,
        phase: intent
    });
}

/**
 * Clear checkpoint after successful migration
 * @returns {Promise<void>}
 */
async function clearCheckpoint() {
    if (!IndexedDBCore) {
        return;
    }
    try {
        await IndexedDBCore.delete(
            IndexedDBCore.STORES.MIGRATION,
            'migration_checkpoint'
        );
    } catch (err) {
        // Ignore - checkpoint may not exist
    }
}

// ==========================================
// Backup and Rollback
// ==========================================

/**
 * Backup all localStorage to MIGRATION store before migration
 * @returns {Promise<void>}
 */
async function backupLocalStorage() {
    const backup = {};

    // Capture all keys to migrate
    const allKeys = [...MIGRATION_CONFIG_KEYS, ...MIGRATION_TOKEN_KEYS];
    for (const key of allKeys) {
        const value = localStorage.getItem(key);
        if (value !== null) {
            backup[key] = value;
        }
    }

    if (Object.keys(backup).length === 0) {
        console.log('[Migration] No localStorage data to backup');
        return;
    }

    if (!IndexedDBCore) {
        throw new Error('IndexedDBCore not available');
    }

    await IndexedDBCore.put(IndexedDBCore.STORES.MIGRATION, {
        id: 'pre_migration_backup',
        backup,
        timestamp: Date.now(),
        version: MIGRATION_MODULE_VERSION
    });

    console.log(`[Migration] Backed up ${Object.keys(backup).length} localStorage keys`);
}

/**
 * Rollback migration - restore localStorage from backup
 * @returns {Promise<boolean>} True if rollback succeeded
 */
async function rollbackMigration() {
    try {
        if (!IndexedDBCore) {
            console.warn('[Migration] IndexedDBCore not available for rollback');
            return false;
        }

        const backup = await IndexedDBCore.get(
            IndexedDBCore.STORES.MIGRATION,
            'pre_migration_backup'
        );

        if (!backup || !backup.backup) {
            console.warn('[Migration] No backup found for rollback');
            return false;
        }

        // Restore localStorage
        for (const [key, value] of Object.entries(backup.backup)) {
            localStorage.setItem(key, value);
        }

        // Clear migration state (allows re-migration)
        await IndexedDBCore.delete(
            IndexedDBCore.STORES.MIGRATION,
            'migration_state'
        );

        console.log('[Migration] Migration rolled back successfully');
        return true;
    } catch (err) {
        console.error('[Migration] Rollback failed:', err);
        return false;
    }
}

// ==========================================
// Main Migration
// ==========================================

/**
 * Migrate data from localStorage to IndexedDB
 * Idempotent - safe to call multiple times
 * Supports checkpointing for crash recovery
 * 
 * @param {function(number, number, string): void} [onProgress] - Progress callback (current, total, message)
 * @returns {Promise<{migrated: boolean, keysProcessed: number}>}
 */
async function migrateFromLocalStorage(onProgress = null) {
    // Check if already migrated
    const state = await getMigrationState();
    const needsVersionMigration = !state || state.version < MIGRATION_MODULE_VERSION;
    const legacyTokensPresent = await hasLegacyTokens();

    if (!needsVersionMigration && !legacyTokensPresent) {
        console.log('[Migration] Migration already complete (v' + state.version + ')');
        return { migrated: false, keysProcessed: 0 };
    }

    console.log('[Migration] Starting localStorage → IndexedDB migration...');

    // Ensure dependencies are available
    if (!IndexedDBCore || !ConfigAPI) {
        console.warn('[Migration] Required modules not loaded, deferring migration');
        return { migrated: false, keysProcessed: 0, deferred: true };
    }

    // Check for existing checkpoint (resume support)
    const checkpoint = await getCheckpoint();
    let startIndex = 0;

    if (checkpoint && needsVersionMigration) {
        startIndex = checkpoint.lastProcessedIndex + 1;
        console.log(`[Migration] Resuming from checkpoint at index ${startIndex}`);
    } else {
        if (!needsVersionMigration && checkpoint) {
            await clearCheckpoint();
        }
        // Step 1: Backup everything first (atomic safety)
        if (needsVersionMigration) {
            await backupLocalStorage();
        }
        startIndex = needsVersionMigration ? 0 : MIGRATION_CONFIG_KEYS.length;
    }

    const allConfigKeys = [...MIGRATION_CONFIG_KEYS];
    const allTokenKeys = [...MIGRATION_TOKEN_KEYS];
    const totalKeys = allConfigKeys.length + allTokenKeys.length;
    let keysProcessed = (checkpoint && needsVersionMigration) ? checkpoint.keysProcessed : 0;
    const CHECKPOINT_INTERVAL = 100; // Save checkpoint every 100 records (for larger migrations)

    // HNW Reliability: Calculate 50% checkpoint for small migrations
    const halfwayPoint = Math.floor(allConfigKeys.length / 2);
    let checkpointedHalfway = checkpoint?.checkpointedHalfway || false;

    // Step 2: Migrate config keys with write-ahead checkpointing
    for (let i = Math.max(0, startIndex); i < allConfigKeys.length; i++) {
        const key = allConfigKeys[i];
        const value = localStorage.getItem(key);

        if (value !== null) {
            try {
                // WRITE-AHEAD: Save intent before operation
                await saveWriteAheadCheckpoint('config', key, i, keysProcessed, totalKeys);
                
                let parsedValue;
                try {
                    parsedValue = JSON.parse(value);
                } catch {
                    parsedValue = value;
                }
                await ConfigAPI.setConfig(key, parsedValue);
                keysProcessed++;
                
                // Mark complete after successful operation
                await markCheckpointComplete('config', key, i, keysProcessed, totalKeys);
            } catch (err) {
                console.warn(`[Migration] Failed to migrate key '${key}':`, err);
                // Mark as failed so we skip on resume
                await markCheckpointFailed('config', key, i, err.message || String(err), keysProcessed, totalKeys, i - 1);
            }
        }

        // Report progress
        if (onProgress) {
            onProgress(i + 1, totalKeys, `Migrating ${key}...`);
        }

        // Legacy checkpoint logic for large migrations (keep for compatibility)
        const currentIndex = i + 1;
        const isSmallMigration = totalKeys < CHECKPOINT_INTERVAL;
        const shouldCheckpointHalfway = isSmallMigration &&
            currentIndex === halfwayPoint &&
            !checkpointedHalfway &&
            halfwayPoint > 0;
        const shouldCheckpointInterval = (currentIndex % CHECKPOINT_INTERVAL === 0);

        if (shouldCheckpointHalfway || shouldCheckpointInterval) {
            await saveCheckpoint({
                lastProcessedIndex: i,
                keysProcessed,
                totalKeys,
                phase: 'config',
                checkpointedHalfway: checkpointedHalfway || shouldCheckpointHalfway
            });
            if (shouldCheckpointHalfway) {
                checkpointedHalfway = true;
                console.log(`[Migration] Checkpoint at 50% (${currentIndex}/${totalKeys}) for small migration`);
            }
        }
    }

    // Step 3: Migrate token keys (checkpoint after each - critical data)
    const legacyTokenValues = {};
    for (const key of allTokenKeys) {
        legacyTokenValues[key] = await getLegacyTokenValue(key);
    }

    const migratedTokenKeys = new Set();
    const secureStoreAvailable = !!SecureTokenStore?.isAvailable?.();
    if (!secureStoreAvailable && legacyTokensPresent) {
        console.warn('[Migration] SecureTokenStore unavailable; token migration deferred');
    }

    const tokenStartIndex = Math.max(0, startIndex - allConfigKeys.length);
    for (let i = tokenStartIndex; i < allTokenKeys.length; i++) {
        const key = allTokenKeys[i];
        const value = legacyTokenValues[key];

        if (value !== null) {
            try {
                let migrated = false;

                if (secureStoreAvailable && SecureTokenStore?.store) {
                    if (key === 'spotify_access_token') {
                        const rawExpiry = legacyTokenValues.spotify_token_expiry;
                        const expiryMs = parseExpiryMs(rawExpiry);
                        const options = {
                            metadata: { source: 'migration' }
                        };
                        if (expiryMs !== null) {
                            options.expiresIn = Math.max(0, expiryMs - Date.now());
                        }

                        migrated = await SecureTokenStore.store(key, value, options);
                        if (migrated) {
                            migratedTokenKeys.add('spotify_access_token');
                            if (rawExpiry !== null && rawExpiry !== undefined) {
                                migratedTokenKeys.add('spotify_token_expiry');
                            }
                        }
                    } else if (key === 'spotify_refresh_token') {
                        migrated = await SecureTokenStore.store(key, value, {
                            metadata: { source: 'migration' }
                        });
                        if (migrated) {
                            migratedTokenKeys.add(key);
                        }
                    } else if (key === 'spotify_token_expiry') {
                        migrated = migratedTokenKeys.has('spotify_access_token');
                    }
                } else if (!SecureTokenStore && ConfigAPI?.setToken) {
                    await ConfigAPI.setToken(key, value);
                    migrated = true;
                }

                if (migrated) {
                    keysProcessed++;

                    // HNW Hierarchy: Checkpoint after each token for critical data safety
                    // Tokens are few (3 keys) but critical for app configuration
                    await saveCheckpoint({
                        lastProcessedIndex: allConfigKeys.length + i,
                        keysProcessed,
                        totalKeys,
                        phase: 'token',
                        lastKey: key
                    });
                }
            } catch (err) {
                console.warn(`[Migration] Failed to migrate token '${key}':`, err);
            }
        }

        // Report progress
        if (onProgress) {
            const overallIndex = allConfigKeys.length + i + 1;
            onProgress(overallIndex, totalKeys, `Migrating ${key}...`);
        }
    }

    // Step 4: Mark migration complete
    await IndexedDBCore.put(IndexedDBCore.STORES.MIGRATION, {
        id: 'migration_state',
        version: MIGRATION_MODULE_VERSION,
        completedAt: new Date().toISOString(),
        keysProcessed
    });

    // Clear checkpoint on success
    await clearCheckpoint();

    // Step 5: Clear migrated keys from legacy storage (backup retained)
    if (needsVersionMigration) {
        for (const key of MIGRATION_CONFIG_KEYS) {
            localStorage.removeItem(key);
        }
    }
    for (const key of migratedTokenKeys) {
        await removeLegacyTokenKey(key);
    }

    console.log(`[Migration] Migration complete. Processed ${keysProcessed} keys.`);
    return { migrated: true, keysProcessed };
}

// ==========================================
// Public API
// ==========================================

export const StorageMigration = {
    // Migration
    migrateFromLocalStorage,
    isMigrationNeeded,
    getMigrationState,

    // Rollback
    rollbackMigration,
    backupLocalStorage,

    // Checkpointing
    getCheckpoint,
    saveCheckpoint,
    clearCheckpoint,

    // Configuration
    VERSION: MIGRATION_MODULE_VERSION,
    KEYS_TO_MIGRATE: MIGRATION_CONFIG_KEYS,
    TOKEN_KEYS: MIGRATION_TOKEN_KEYS,
    EXEMPT_KEYS: MIGRATION_EXEMPT_KEYS
};

console.log('[StorageMigration] Migration module loaded with checkpoint support');
