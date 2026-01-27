/**
 * Tier Handlers - Tier-Specific Response Management
 *
 * Handles tier-specific responses to storage degradation.
 * Responsible for:
 * - Tier-specific actions (WARNING, CRITICAL, EXCEEDED, EMERGENCY, NORMAL)
 * - Tier transitions
 * - Event emissions for UI updates
 * - Mode activation (read-only, emergency)
 *
 * @module TierHandlers
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { DegradationTier } from './degradation-detector.js';
import { CleanupPriority } from './cleanup-strategies.js';
import { STORAGE_KEYS } from '../../storage/keys.js';

/**
 * TierHandlers Class
 *
 * Manages tier-specific responses to storage degradation.
 */
export class TierHandlers {
    /**
     * @private
     * @type {DegradationTier}
     */
    _currentTier = DegradationTier.NORMAL;

    /**
     * @private
     * @type {boolean}
     */
    _isEmergencyMode = false;

    /**
     * @private
     * @type {boolean}
     */
    _isReadOnlyMode = false;

    /**
     * @private
     * @type {EventBus}
     */
    _eventBus;

    /**
     * @private
     * @type {CleanupStrategies}
     */
    _cleanupStrategies;

    /**
     * @private
     * @type {Map<string, Object>}
     */
    _itemRegistry = new Map();

    /**
     * @private
     * @type {boolean}
     */
    _autoCleanupEnabled = true;

    /**
     * Initialize the TierHandlers
     * @public
     * @param {Object} options - Configuration options
     * @param {EventBus} options.eventBus - Event bus instance
     * @param {CleanupStrategies} options.cleanupStrategies - Cleanup strategies instance
     * @param {boolean} options.autoCleanupEnabled - Enable automatic cleanup
     */
    constructor(options = {}) {
        const { eventBus = null, cleanupStrategies = null, autoCleanupEnabled = true } = options;
        this._eventBus = eventBus;
        this._cleanupStrategies = cleanupStrategies;
        this._autoCleanupEnabled = autoCleanupEnabled;

        this._initializeItemRegistry();
        this._subscribeToStorageEvents();

        performance.mark('tier-handlers-init');
    }

    /**
     * Initialize item registry with metadata
     * @private
     */
    _initializeItemRegistry() {
        // Critical data - never delete
        this._registerItem(STORAGE_KEYS.PERSONALITY_RESULT, {
            priority: CleanupPriority.NEVER_DELETE,
            category: 'personality',
            regeneratable: false
        });

        this._registerItem(STORAGE_KEYS.USER_SETTINGS, {
            priority: CleanupPriority.NEVER_DELETE,
            category: 'settings',
            regeneratable: false
        });

        // Active session - never delete
        this._registerItem(STORAGE_KEYS.ACTIVE_SESSION_ID, {
            priority: CleanupPriority.NEVER_DELETE,
            category: 'session',
            regeneratable: false
        });

        // Embeddings - regeneratable, high cleanup priority
        this._registerItem(STORAGE_KEYS.EMBEDDING_CACHE, {
            priority: CleanupPriority.AGGRESSIVE,
            category: 'embedding',
            regeneratable: true
        });

        // Chat sessions - medium priority based on age
        this._registerItem(STORAGE_KEYS.CHAT_SESSIONS, {
            priority: CleanupPriority.MEDIUM,
            category: 'session',
            regeneratable: false
        });

        // Chunks - regeneratable from streams
        this._registerItem(STORAGE_KEYS.AGGREGATED_CHUNKS, {
            priority: CleanupPriority.HIGH,
            category: 'chunk',
            regeneratable: true
        });

        // Raw streams - keep recent, aggressive cleanup for old
        this._registerItem(STORAGE_KEYS.RAW_STREAMS, {
            priority: CleanupPriority.HIGH,
            category: 'stream',
            regeneratable: false
        });
    }

    /**
     * Register storage item with metadata
     * @private
     * @param {string} key - Storage key
     * @param {Object} metadata - Item metadata
     */
    _registerItem(key, metadata) {
        this._itemRegistry.set(key, {
            key,
            ...metadata,
            sizeBytes: 0,
            lastAccessed: Date.now()
        });
    }

    /**
     * Subscribe to storage events
     * @private
     */
    _subscribeToStorageEvents() {
        if (!this._eventBus) return;

        // Monitor storage writes
        this._eventBus.on('STORAGE:WRITE', async (event, data) => {
            await this._onStorageWrite(data);
        });

        // Monitor storage errors
        this._eventBus.on('STORAGE:ERROR', async (event, data) => {
            await this._onStorageError(data);
        });

        // Monitor connection failures from IndexedDB
        this._eventBus.on('storage:connection_failed', async (payload) => {
            await this._onConnectionFailed(payload);
        });

        // Monitor connection blocked (upgrade blocked by other tabs)
        this._eventBus.on('storage:connection_blocked', async (payload) => {
            this._eventBus.emit('UI:TOAST', {
                type: 'warning',
                message: payload.message || 'Database upgrade blocked by other tabs. Please close other tabs.',
                duration: 10000
            });
        });
    }

    /**
     * Handle storage write events
     * @private
     * @param {Object} data - Event data
     */
    async _onStorageWrite(data) {
        // Update item registry with size and access time
        if (data.key && this._itemRegistry.has(data.key)) {
            const item = this._itemRegistry.get(data.key);
            item.sizeBytes = data.size || 0;
            item.lastAccessed = Date.now();
        }
    }

    /**
     * Handle storage error events
     * @private
     * @param {Object} data - Event data
     */
    async _onStorageError(data) {
        // Check if error is quota exceeded
        if (data.error?.name === 'QuotaExceededError' ||
            data.error?.message?.includes('quota')) {
            console.error('[TierHandlers] Quota exceeded error detected');
            await this._handleQuotaExceeded();
        }
    }

    /**
     * Handle IndexedDB connection failure
     * @private
     * @param {Object} data - Event data
     */
    async _onConnectionFailed(data) {
        console.error('[TierHandlers] IndexedDB connection failed:', data.error);

        const oldTier = this._currentTier;

        // Enter emergency mode and update tier
        this._isEmergencyMode = true;
        this._currentTier = DegradationTier.EMERGENCY;

        // Emit tier change event
        if (this._eventBus) {
            this._eventBus.emit('STORAGE:TIER_CHANGE', {
                oldTier,
                newTier: DegradationTier.EMERGENCY,
                metrics: null,
                reason: 'connection_failed'
            });
        }

        // Pause non-critical operations
        if (this._eventBus) {
            this._eventBus.emit('STORAGE:PAUSE_NON_CRITICAL');
        }

        // Show emergency modal for session-only mode
        if (this._eventBus) {
            this._eventBus.emit('UI:MODAL', {
                type: 'emergency',
                title: 'Storage Unavailable',
                message: `Unable to connect to storage after ${data.attempts} attempts. Your data will only be saved for this session.`,
                options: [
                    {
                        label: 'Continue in Session-Only Mode',
                        action: 'session_only_mode',
                        primary: true
                    },
                    {
                        label: 'Retry Connection',
                        action: 'retry_connection'
                    }
                ]
            });
        }

        // Emit storage mode change
        if (this._eventBus) {
            this._eventBus.emit('STORAGE:SESSION_ONLY_MODE', { enabled: true, reason: 'connection_failed' });
        }
    }

    /**
     * Transition to new degradation tier
     * @private
     * @param {DegradationTier} newTier - New degradation tier
     * @param {DegradationTier} oldTier - Old degradation tier
     * @param {boolean} emitEvent - Whether to emit tier change event (default: false to prevent infinite loop)
     */
    async _transitionToTier(newTier, oldTier, emitEvent = false) {
        this._currentTier = newTier;

        console.log(`[TierHandlers] Transitioning from ${oldTier} to ${newTier}`);

        performance.mark(`storage-tier-transition-${oldTier}-to-${newTier}`);

        try {
            switch (newTier) {
                case DegradationTier.WARNING:
                    await this._handleWarningTier();
                    break;

                case DegradationTier.CRITICAL:
                    await this._handleCriticalTier();
                    break;

                case DegradationTier.EXCEEDED:
                    await this._handleQuotaExceeded();
                    break;

                case DegradationTier.EMERGENCY:
                    await this._handleEmergencyMode();
                    break;

                case DegradationTier.NORMAL:
                    await this._handleNormalTier();
                    break;
            }
        } catch (error) {
            console.error(`[TierHandlers] Error handling tier ${newTier}:`, error);
        }

        // Emit tier transition event with different reason to prevent infinite loop
        // Only emit if explicitly requested (e.g., for direct transitions not from quota check)
        if (this._eventBus && emitEvent) {
            this._eventBus.emit('STORAGE:TIER_CHANGE', {
                oldTier,
                newTier,
                metrics: null,
                reason: 'tier_transition'
            });
        }

        performance.measure(`storage-tier-${oldTier}-to-${newTier}`, `storage-tier-transition-${oldTier}-to-${newTier}`);
    }

    /**
     * Handle WARNING tier (80-94%)
     * @private
     */
    async _handleWarningTier() {
        console.warn('[TierHandlers] Storage quota at WARNING level (80-94%)');

        // Show user warning
        if (this._eventBus) {
            this._eventBus.emit('UI:TOAST', {
                type: 'warning',
                message: 'Storage space is getting low. Old chat sessions may be cleaned up automatically.',
                duration: 10000
            });
        }

        // Enable aggressive LRU eviction
        if (this._eventBus) {
            this._eventBus.emit('LRU:EVICTION_POLICY', {
                mode: 'aggressive',
                targetRatio: 0.7 // Target 70% of current usage
            });
        }

        // Clean up old sessions if auto-cleanup enabled
        if (this._autoCleanupEnabled && this._cleanupStrategies) {
            await this._cleanupStrategies.triggerCleanup(CleanupPriority.HIGH);
        }
    }

    /**
     * Handle CRITICAL tier (95-99%)
     * @private
     */
    async _handleCriticalTier() {
        console.error('[TierHandlers] Storage quota at CRITICAL level (95-99%)');

        // Show urgent warning
        if (this._eventBus) {
            this._eventBus.emit('UI:TOAST', {
                type: 'error',
                message: 'Storage space is critically low! Old data is being cleaned up. Consider exporting your data.',
                duration: 15000,
                actions: [
                    {
                        label: 'Export Data',
                        action: 'export_data'
                    },
                    {
                        label: 'Clear Old Sessions',
                        action: 'clear_sessions'
                    }
                ]
            });
        }

        // Enter read-only mode for non-essential writes
        this._isReadOnlyMode = true;
        if (this._eventBus) {
            this._eventBus.emit('STORAGE:READ_ONLY_MODE', { enabled: true });
        }

        // Aggressive cleanup
        if (this._autoCleanupEnabled && this._cleanupStrategies) {
            await this._cleanupStrategies.triggerCleanup(CleanupPriority.AGGRESSIVE);
        }
    }

    /**
     * Handle quota exceeded (100%)
     * @private
     */
    async _handleQuotaExceeded() {
        console.error('[TierHandlers] Storage quota EXCEEDED');

        // Immediate emergency cleanup
        let cleanupResult;
        if (this._cleanupStrategies) {
            cleanupResult = await this._cleanupStrategies.triggerEmergencyCleanup();
        }

        if (!cleanupResult || !cleanupResult.success || cleanupResult.bytesFreed === 0) {
            // If cleanup failed, enter emergency mode
            await this._handleEmergencyMode();
        }
    }

    /**
     * Handle EMERGENCY mode
     * @private
     */
    async _handleEmergencyMode() {
        console.error('[TierHandlers] Entering EMERGENCY mode');

        this._isEmergencyMode = true;

        // Show emergency modal
        if (this._eventBus) {
            this._eventBus.emit('UI:MODAL', {
                type: 'emergency',
                title: 'Storage Full - Action Required',
                message: 'Storage quota has been exceeded. Please choose an option:',
                options: [
                    {
                        label: 'Clear Old Data (Keep Active Session)',
                        action: 'clear_old_data',
                        primary: true
                    },
                    {
                        label: 'Export and Clear',
                        action: 'export_and_clear'
                    },
                    {
                        label: 'Continue in Session-Only Mode',
                        action: 'session_only_mode'
                    }
                ]
            });
        }

        // Pause non-critical operations
        if (this._eventBus) {
            this._eventBus.emit('STORAGE:PAUSE_NON_CRITICAL');
        }
    }

    /**
     * Handle NORMAL tier
     * @private
     */
    async _handleNormalTier() {
        console.log('[TierHandlers] Storage quota back to NORMAL');

        // Disable emergency/read-only modes
        this._isEmergencyMode = false;
        this._isReadOnlyMode = false;

        // Resume normal operations
        if (this._eventBus) {
            this._eventBus.emit('STORAGE:READ_ONLY_MODE', { enabled: false });
            this._eventBus.emit('STORAGE:RESUME_NON_CRITICAL');
        }

        // Reset LRU eviction to normal
        if (this._eventBus) {
            this._eventBus.emit('LRU:EVICTION_POLICY', {
                mode: 'normal',
                targetRatio: 1.0
            });
        }
    }

    /**
     * Get current degradation tier
     * @public
     * @returns {DegradationTier} Current tier
     */
    getCurrentTier() {
        return this._currentTier;
    }

    /**
     * Set current degradation tier
     * @public
     * @param {DegradationTier} tier - Current tier
     */
    setCurrentTier(tier) {
        this._currentTier = tier;
    }

    /**
     * Check if in read-only mode
     * @public
     * @returns {boolean} True if in read-only mode
     */
    isReadOnlyMode() {
        return this._isReadOnlyMode;
    }

    /**
     * Check if in emergency mode
     * @public
     * @returns {boolean} True if in emergency mode
     */
    isEmergencyMode() {
        return this._isEmergencyMode;
    }

    /**
     * Manually trigger tier transition
     * @public
     * @param {DegradationTier} newTier - New tier to transition to
     * @returns {Promise<void>}
     */
    async transitionTo(newTier) {
        const oldTier = this._currentTier;
        await this._transitionToTier(newTier, oldTier);
    }

    /**
     * Set auto-cleanup enabled state
     * @public
     * @param {boolean} enabled - Whether auto-cleanup should be enabled
     */
    setAutoCleanupEnabled(enabled) {
        this._autoCleanupEnabled = enabled;
    }
}
