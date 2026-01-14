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
 * @returns {Promise<{migrated: boolean, keysProcessed: number}>}
 */
async function migrateFromLocalStorage() {
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

    // Step 1: Backup everything first (atomic safety)
    await backupLocalStorage();

    let keysProcessed = 0;

    // Step 2: Migrate config keys
    for (const key of MIGRATION_CONFIG_KEYS) {
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
    }

    // Step 3: Migrate token keys
    for (const key of MIGRATION_TOKEN_KEYS) {
        const value = localStorage.getItem(key);
        if (value !== null) {
            try {
                await window.ConfigAPI.setToken(key, value);
                keysProcessed++;
            } catch (err) {
                console.warn(`[Migration] Failed to migrate token '${key}':`, err);
            }
        }
    }

    // Step 4: Mark migration complete
    await window.IndexedDBCore.put(window.IndexedDBCore.STORES.MIGRATION, {
        id: 'migration_state',
        version: MIGRATION_MODULE_VERSION,
        completedAt: new Date().toISOString(),
        keysProcessed
    });

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

    // Configuration
    VERSION: MIGRATION_MODULE_VERSION,
    KEYS_TO_MIGRATE: MIGRATION_CONFIG_KEYS,
    TOKEN_KEYS: MIGRATION_TOKEN_KEYS,
    EXEMPT_KEYS: MIGRATION_EXEMPT_KEYS
};

// Keep window global for backwards compatibility during migration
if (typeof window !== 'undefined') {
    window.StorageMigration = StorageMigration;
}

console.log('[StorageMigration] Migration module loaded');

