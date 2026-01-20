/**
 * Storage Migration Module
 * 
 * Handles migration of data from localStorage to IndexedDB.
 * Provides atomic migration with backup and rollback capabilities.
 * 
 * @module storage/migration
 */

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
// Migration State
// ==========================================

/**
 * Get the current migration state
 * @returns {Promise<Object|null>} Migration state or null if never migrated
 */
async function getMigrationState() {
    try {
        if (!window.IndexedDBCore) {
            return null;
        }

        return await window.IndexedDBCore.get(
            window.IndexedDBCore.STORES.MIGRATION,
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
    return !state || state.version < MIGRATION_MODULE_VERSION;
}

/**
 * Get checkpoint state for resumable migration
 * @returns {Promise<Object|null>}
 */
async function getCheckpoint() {
    try {
        if (!window.IndexedDBCore) {
            return null;
        }
        return await window.IndexedDBCore.get(
            window.IndexedDBCore.STORES.MIGRATION,
            'migration_checkpoint'
        );
    } catch (err) {
        console.warn('[Migration] Error getting checkpoint:', err);
        return null;
    }
}

/**
 * Save checkpoint for resumable migration
 * @param {Object} checkpoint - Checkpoint data
 * @returns {Promise<void>}
 */
async function saveCheckpoint(checkpoint) {
    if (!window.IndexedDBCore) {
        return;
    }
    try {
        await window.IndexedDBCore.put(window.IndexedDBCore.STORES.MIGRATION, {
            id: 'migration_checkpoint',
            ...checkpoint,
            timestamp: Date.now()
        });
    } catch (err) {
        console.warn('[Migration] Error saving checkpoint:', err);
    }
}

/**
 * Clear checkpoint after successful migration
 * @returns {Promise<void>}
 */
async function clearCheckpoint() {
    if (!window.IndexedDBCore) {
        return;
    }
    try {
        await window.IndexedDBCore.delete(
            window.IndexedDBCore.STORES.MIGRATION,
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

    if (!window.IndexedDBCore) {
        throw new Error('IndexedDBCore not available');
    }

    await window.IndexedDBCore.put(window.IndexedDBCore.STORES.MIGRATION, {
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
        if (!window.IndexedDBCore) {
            console.warn('[Migration] IndexedDBCore not available for rollback');
            return false;
        }

        const backup = await window.IndexedDBCore.get(
            window.IndexedDBCore.STORES.MIGRATION,
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
        await window.IndexedDBCore.delete(
            window.IndexedDBCore.STORES.MIGRATION,
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
    if (state && state.version >= MIGRATION_MODULE_VERSION) {
        console.log('[Migration] Migration already complete (v' + state.version + ')');
        return { migrated: false, keysProcessed: 0 };
    }

    console.log('[Migration] Starting localStorage → IndexedDB migration...');

    // Ensure dependencies are available
    if (!window.IndexedDBCore || !window.ConfigAPI) {
        console.warn('[Migration] Required modules not loaded, deferring migration');
        return { migrated: false, keysProcessed: 0, deferred: true };
    }

    // Check for existing checkpoint (resume support)
    const checkpoint = await getCheckpoint();
    let startIndex = 0;

    if (checkpoint) {
        startIndex = checkpoint.lastProcessedIndex + 1;
        console.log(`[Migration] Resuming from checkpoint at index ${startIndex}`);
    } else {
        // Step 1: Backup everything first (atomic safety)
        await backupLocalStorage();
    }

    const allConfigKeys = [...MIGRATION_CONFIG_KEYS];
    const allTokenKeys = [...MIGRATION_TOKEN_KEYS];
    const totalKeys = allConfigKeys.length + allTokenKeys.length;
    let keysProcessed = checkpoint?.keysProcessed || 0;
    const CHECKPOINT_INTERVAL = 100; // Save checkpoint every 100 records (for larger migrations)

    // HNW Reliability: Calculate 50% checkpoint for small migrations
    const halfwayPoint = Math.floor(allConfigKeys.length / 2);
    let checkpointedHalfway = checkpoint?.checkpointedHalfway || false;

    // Step 2: Migrate config keys
    for (let i = Math.max(0, startIndex); i < allConfigKeys.length; i++) {
        const key = allConfigKeys[i];
        const value = localStorage.getItem(key);

        if (value !== null) {
            try {
                let parsedValue;
                try {
                    parsedValue = JSON.parse(value);
                } catch {
                    parsedValue = value;
                }
                await window.ConfigAPI.setConfig(key, parsedValue);
                keysProcessed++;
            } catch (err) {
                console.warn(`[Migration] Failed to migrate key '${key}':`, err);
            }
        }

        // Report progress
        if (onProgress) {
            onProgress(i + 1, totalKeys, `Migrating ${key}...`);
        }

        // Checkpoint logic:
        // - For small migrations (<100 records): checkpoint at 50%
        // - For large migrations: checkpoint every 100 records
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
    const tokenStartIndex = Math.max(0, startIndex - allConfigKeys.length);
    for (let i = tokenStartIndex; i < allTokenKeys.length; i++) {
        const key = allTokenKeys[i];
        const value = localStorage.getItem(key);

        if (value !== null) {
            try {
                await window.ConfigAPI.setToken(key, value);
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
    await window.IndexedDBCore.put(window.IndexedDBCore.STORES.MIGRATION, {
        id: 'migration_state',
        version: MIGRATION_MODULE_VERSION,
        completedAt: new Date().toISOString(),
        keysProcessed
    });

    // Clear checkpoint on success
    await clearCheckpoint();

    // Step 5: Clear migrated keys from localStorage (backup retained)
    for (const key of MIGRATION_CONFIG_KEYS) {
        localStorage.removeItem(key);
    }
    for (const key of MIGRATION_TOKEN_KEYS) {
        localStorage.removeItem(key);
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
