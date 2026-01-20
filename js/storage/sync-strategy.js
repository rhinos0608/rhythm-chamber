/**
 * Sync Strategy Abstraction
 * 
 * Provides interface for different sync strategies:
 * - LocalOnlySync: Current behavior - all data stays in IndexedDB
 * - CloudSync: Phase 2 - encrypted backup to Supabase (stub)
 * 
 * HNW Pattern:
 * - Hierarchy: Strategy selection controlled by license tier
 * - Network: Strategies share common interface, isolated implementation
 * - Wave: Sync operations are async with defined timing expectations
 * 
 * @module storage/sync-strategy
 */

// ==========================================
// Strategy Interface
// ==========================================

/**
 * Base class for sync strategies
 * All strategies must implement these methods
 */
class SyncStrategy {
    constructor(name) {
        this.name = name;
        this.initialized = false;
    }

    /**
     * Initialize the sync strategy
     * @returns {Promise<void>}
     */
    async init() {
        throw new Error('SyncStrategy.init() must be implemented');
    }

    /**
     * Push local data to sync target
     * @param {object} data - Data to sync (chunks, personality, etc.)
     * @returns {Promise<{synced: boolean, version?: number, error?: string}>}
     */
    async push(data) {
        throw new Error('SyncStrategy.push() must be implemented');
    }

    /**
     * Pull data from sync target
     * @returns {Promise<{data: object|null, version?: number, error?: string}>}
     */
    async pull() {
        throw new Error('SyncStrategy.pull() must be implemented');
    }

    /**
     * Check if sync is available
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        throw new Error('SyncStrategy.isAvailable() must be implemented');
    }

    /**
     * Get sync status
     * @returns {Promise<{lastSync: Date|null, version: number, pending: boolean}>}
     */
    async getStatus() {
        throw new Error('SyncStrategy.getStatus() must be implemented');
    }
}

// ==========================================
// LocalOnlySync - Current Behavior
// ==========================================

/**
 * Local-only sync strategy
 * 
 * All data stays in IndexedDB. No network sync.
 * This is the default strategy for free tier.
 */
class LocalOnlySync extends SyncStrategy {
    constructor() {
        super('local');
    }

    async init() {
        // Nothing to initialize - IndexedDB is managed by Storage facade
        this.initialized = true;
        console.log('[LocalOnlySync] Initialized (no external sync)');
    }

    async push(data) {
        // Local-only: "sync" is just confirming data is in IndexedDB
        // The Storage facade handles actual IndexedDB writes
        return {
            synced: true,
            version: 1,
            message: 'Data stored locally (no cloud backup)'
        };
    }

    async pull() {
        // Local-only: Always return null (no remote data to pull)
        return {
            data: null,
            version: 0,
            message: 'Local-only mode - no remote data'
        };
    }

    async isAvailable() {
        // Local storage is always available (IndexedDB support assumed)
        return true;
    }

    async getStatus() {
        return {
            lastSync: null,
            version: 0,
            pending: false,
            mode: 'local',
            message: 'Local-only mode - data not backed up to cloud'
        };
    }
}

// ==========================================
// DeviceBackup - Phase 2 Stub
// ==========================================

/**
 * Device backup strategy (STUB - NOT IMPLEMENTED)
 * 
 * Provides encrypted backup/restore between devices using Supabase.
 * This is intentionally NOT "Cloud Sync" - it's manual backup/restore
 * with "last-write-wins" semantics. No CRDTs, no conflict resolution,
 * just encrypted blob storage.
 * 
 * This class exists for interface definition only.
 */
class DeviceBackup extends SyncStrategy {
    constructor(config = {}) {
        super('device-backup');
        this.config = {
            supabaseUrl: config.supabaseUrl || null,
            supabaseKey: config.supabaseKey || null,
            ...config
        };
    }

    async init() {
        // Phase 2: Initialize Supabase client
        console.warn('[DeviceBackup] Not implemented - Phase 2 feature');
        this.initialized = false;
        throw new Error('DeviceBackup is not yet implemented. Coming in Phase 2.');
    }

    async push(data) {
        // Phase 2: 
        // 1. Encrypt data with Security.encryptData()
        // 2. POST to /api/backup (last-write-wins)
        // 3. Return version
        throw new Error('DeviceBackup.push() not implemented - Phase 2 feature');
    }

    async pull() {
        // Phase 2:
        // 1. GET from /api/backup
        // 2. Decrypt with Security.decryptData()
        // 3. Return data (overwrites local)
        throw new Error('DeviceBackup.pull() not implemented - Phase 2 feature');
    }

    async isAvailable() {
        // Phase 2: Check Supabase connection + user tier
        return false;
    }

    async getStatus() {
        return {
            lastSync: null,
            version: 0,
            pending: false,
            mode: 'device-backup',
            message: 'Device backup coming in Phase 2 (last-write-wins)'
        };
    }
}

// ==========================================
// Strategy Manager
// ==========================================

/**
 * Manages sync strategy selection and lifecycle
 */
const SyncManager = {
    _currentStrategy: null,
    _strategies: {
        local: LocalOnlySync,
        'device-backup': DeviceBackup
    },

    /**
     * Initialize with default strategy (local)
     * @returns {Promise<SyncStrategy>}
     */
    async init() {
        // Default to local-only for now
        // Phase 2: Check user tier and select appropriate strategy
        this._currentStrategy = new LocalOnlySync();
        await this._currentStrategy.init();
        return this._currentStrategy;
    },

    /**
     * Get current sync strategy
     * @returns {SyncStrategy}
     */
    getStrategy() {
        if (!this._currentStrategy) {
            console.warn('[SyncManager] Not initialized, using LocalOnlySync');
            this._currentStrategy = new LocalOnlySync();
        }
        return this._currentStrategy;
    },

    /**
     * Switch to a different sync strategy
     * @param {string} strategyName - 'local' or 'cloud'
     * @param {object} config - Strategy configuration
     * @returns {Promise<SyncStrategy>}
     */
    async setStrategy(strategyName, config = {}) {
        const StrategyClass = this._strategies[strategyName];
        if (!StrategyClass) {
            throw new Error(`Unknown sync strategy: ${strategyName}`);
        }

        this._currentStrategy = new StrategyClass(config);
        await this._currentStrategy.init();
        return this._currentStrategy;
    },

    /**
     * Check if device backup is available for user
     * @returns {Promise<boolean>}
     */
    async isDeviceBackupAvailable() {
        // Phase 2: Check user tier from user_metadata
        // For now, always return false
        return false;
    },

    /**
     * Get available strategies for current user
     * @returns {Array<{name: string, available: boolean, reason?: string}>}
     */
    getAvailableStrategies() {
        return [
            { name: 'local', available: true },
            { name: 'device-backup', available: false, reason: 'Coming in Phase 2 (last-write-wins)' }
        ];
    }
};

// ==========================================
// Public API
// ==========================================

// ES Module exports
export { SyncStrategy, LocalOnlySync, DeviceBackup, SyncManager };

console.log('[SyncStrategy] Sync abstraction layer loaded (LocalOnlySync active)');

