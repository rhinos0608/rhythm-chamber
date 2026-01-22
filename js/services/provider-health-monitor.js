/**
 * Provider Health Monitor Service
 *
 * Real-time provider health monitoring with UI integration.
 * 
 * REFACTORED: Now a thin adapter that delegates to ProviderHealthAuthority
 * (the single source of truth for provider health).
 *
 * This module provides:
 * - UI-friendly health data formatting
 * - Periodic polling for UI updates
 * - Recommended actions for degraded providers
 *
 * @module services/provider-health-monitor
 */

import { EventBus } from './event-bus.js';
import { 
    ProviderHealthAuthority, 
    HealthStatus as AuthorityHealthStatus 
} from './provider-health-authority.js';

/**
 * Health status levels for UI display
 * Re-exported from ProviderHealthAuthority for backwards compatibility
 * @readonly
 * @enum {string}
 */
export const HealthStatus = AuthorityHealthStatus;

/**
 * Provider health data structure
 * @typedef {Object} ProviderHealthData
 * @property {string} provider - Provider name
 * @property {HealthStatus} status - Current health status
 * @property {number} successCount - Number of successful requests
 * @property {number} failureCount - Number of failed requests
 * @property {number} avgLatencyMs - Average latency in milliseconds
 * @property {number} lastSuccessTime - Last successful request timestamp
 * @property {number} lastFailureTime - Last failed request timestamp
 * @property {string|null} blacklistExpiry - Blacklist expiry timestamp
 * @property {string} circuitState - Circuit breaker state (closed, open, half_open)
 * @property {number} cooldownRemaining - Circuit breaker cooldown remaining (ms)
 * @property {boolean} isLocal - Whether provider is local
 */

/**
 * Provider Health Monitor Class
 */
export class ProviderHealthMonitor {
    /**
     * @private
     * @type {Map<string, ProviderHealthData>}
     */
    _healthData = new Map();

    /**
     * @private
     * @type {EventBus}
     */
    _eventBus = EventBus;

    /**
     * @private
     * @type {number|null}
     */
    _updateIntervalId = null;

    /**
     * @private
     * @type {number}
     */
    _updateIntervalMs = 2000; // Update every 2 seconds

    /**
     * @private
     * @type {Array<Function>}
     */
    _uiCallbacks = [];

    constructor() {
        this._initializeHealthData();
        this._subscribeToEvents();
        // Don't start monitoring in constructor - make it explicit
    }

    /**
     * Async initialization - starts monitoring after health data is ready
     * Call this after creating an instance to start periodic health updates
     * @public
     */
    async initialize() {
        // _refreshHealthData is synchronous, no await needed
        this._refreshHealthData();
        this._startMonitoring();
    }

    /**
     * Initialize health data for all providers
     * @private
     */
    _initializeHealthData() {
        const providers = ['openrouter', 'ollama', 'lmstudio', 'fallback'];

        for (const provider of providers) {
            this._healthData.set(provider, {
                provider,
                status: HealthStatus.UNKNOWN,
                successCount: 0,
                failureCount: 0,
                avgLatencyMs: 0,
                lastSuccessTime: 0,
                lastFailureTime: 0,
                blacklistExpiry: null,
                circuitState: 'closed',
                cooldownRemaining: 0,
                isLocal: ['ollama', 'lmstudio', 'fallback'].includes(provider)
            });
        }
    }

    /**
     * Subscribe to provider health events
     * @private
     */
    _subscribeToEvents() {
        this._eventBus.on('PROVIDER:HEALTH_UPDATE', (event, data) => {
            this._updateHealthFromEvent(data);
        });

        this._eventBus.on('PROVIDER:BLACKLISTED', (event, data) => {
            this._handleProviderBlacklisted(data);
        });

        this._eventBus.on('PROVIDER:UNBLACKLISTED', (event, data) => {
            this._handleProviderUnblacklisted(data);
        });

        this._eventBus.on('CIRCUIT_BREAKER:TRIPPED', (event, data) => {
            this._handleCircuitBreakerTripped(data);
        });

        this._eventBus.on('CIRCUIT_BREAKER:RECOVERED', (event, data) => {
            this._handleCircuitBreakerRecovered(data);
        });
    }

    /**
     * Start periodic health monitoring
     * @private
     */
    _startMonitoring() {
        if (this._updateIntervalId) {
            clearInterval(this._updateIntervalId);
        }

        this._updateIntervalId = setInterval(() => {
            this._refreshHealthData();
            this._notifyUI();
        }, this._updateIntervalMs);
    }

    /**
     * Stop health monitoring
     */
    stopMonitoring() {
        if (this._updateIntervalId) {
            clearInterval(this._updateIntervalId);
            this._updateIntervalId = null;
        }
    }

    /**
     * Refresh health data from ProviderHealthAuthority
     * @private
     */
    _refreshHealthData() {
        const providers = ['openrouter', 'ollama', 'lmstudio', 'fallback'];

        for (const provider of providers) {
            // Get snapshot from ProviderHealthAuthority - the single source of truth
            const snapshot = ProviderHealthAuthority.getProviderSnapshot(provider);
            
            const healthData = this._healthData.get(provider);
            if (healthData && snapshot) {
                healthData.status = snapshot.status;
                healthData.successCount = snapshot.successCount;
                healthData.failureCount = snapshot.failureCount;
                healthData.avgLatencyMs = snapshot.avgLatencyMs;
                healthData.lastSuccessTime = snapshot.lastSuccessTime;
                healthData.lastFailureTime = snapshot.lastFailureTime;
                healthData.blacklistExpiry = snapshot.blacklistExpiry;
                healthData.circuitState = snapshot.circuitState;
                healthData.cooldownRemaining = snapshot.cooldownRemaining;
            }
        }
    }

    /**
     * Map provider health status to UI status
     * @deprecated ProviderHealthAuthority now provides status directly
     * @private
     * @param {string} health - Provider health status
     * @returns {HealthStatus} UI health status
     */
    _mapHealthStatus(health) {
        // ProviderHealthAuthority uses the same HealthStatus enum,
        // so this is now just a passthrough for backwards compatibility
        return health || HealthStatus.UNKNOWN;
    }

    /**
     * Update health from event
     * @private
     * @param {Object} data - Event data
     */
    _updateHealthFromEvent(data) {
        const { provider, health } = data;
        const healthData = this._healthData.get(provider);
        if (healthData) {
            healthData.status = this._mapHealthStatus(health);
            this._notifyUI();
        }
    }

    /**
     * Handle provider blacklisted event
     * @private
     * @param {Object} data - Event data
     */
    _handleProviderBlacklisted(data) {
        const { provider, expiry } = data;
        const healthData = this._healthData.get(provider);
        if (healthData) {
            healthData.status = HealthStatus.BLACKLISTED;
            healthData.blacklistExpiry = expiry;
            this._notifyUI();
        }
    }

    /**
     * Handle provider unblacklisted event
     * @private
     * @param {Object} data - Event data
     */
    _handleProviderUnblacklisted(data) {
        const { provider } = data;
        const healthData = this._healthData.get(provider);
        if (healthData) {
            healthData.status = HealthStatus.UNKNOWN;
            healthData.blacklistExpiry = null;
            this._notifyUI();
        }
    }

    /**
     * Handle circuit breaker tripped event
     * @private
     * @param {Object} data - Event data
     */
    _handleCircuitBreakerTripped(data) {
        const { provider } = data;
        const healthData = this._healthData.get(provider);
        if (healthData) {
            healthData.circuitState = 'open';
            healthData.status = HealthStatus.UNHEALTHY;
            this._notifyUI();
        }
    }

    /**
     * Handle circuit breaker recovered event
     * @private
     * @param {Object} data - Event data
     */
    _handleCircuitBreakerRecovered(data) {
        const { provider } = data;
        const healthData = this._healthData.get(provider);
        if (healthData) {
            healthData.circuitState = 'closed';
            healthData.status = HealthStatus.HEALTHY;
            this._notifyUI();
        }
    }

    /**
     * Notify UI callbacks of health updates
     * @private
     */
    _notifyUI() {
        for (const callback of this._uiCallbacks) {
            try {
                callback(this.getHealthSnapshot());
            } catch (error) {
                console.error('[ProviderHealthMonitor] UI callback error:', error);
            }
        }
    }

    /**
     * Register a UI callback for health updates
     * @param {Function} callback - Callback function
     */
    onHealthUpdate(callback) {
        if (typeof callback === 'function') {
            this._uiCallbacks.push(callback);
        }
    }

    /**
     * Unregister a UI callback
     * @param {Function} callback - Callback function
     */
    offHealthUpdate(callback) {
        const index = this._uiCallbacks.indexOf(callback);
        if (index > -1) {
            this._uiCallbacks.splice(index, 1);
        }
    }

    /**
     * Get current health snapshot for all providers
     * @returns {Object} Health snapshot
     */
    getHealthSnapshot() {
        const snapshot = {};
        for (const [provider, data] of this._healthData) {
            snapshot[provider] = { ...data };
        }
        return snapshot;
    }

    /**
     * Get health data for a specific provider
     * @param {string} provider - Provider name
     * @returns {ProviderHealthData|null} Health data (shallow copy)
     */
    getProviderHealth(provider) {
        const healthData = this._healthData.get(provider);
        return healthData ? { ...healthData } : null;
    }

    /**
     * Get health summary for UI
     * @returns {Object} Health summary
     */
    getHealthSummary() {
        // Delegate to ProviderHealthAuthority
        return ProviderHealthAuthority.getHealthSummary();
    }

    /**
     * Get recommended action for a provider
     * @param {string} provider - Provider name
     * @returns {Object} Recommended action
     */
    getRecommendedAction(provider) {
        const health = this._healthData.get(provider);
        if (!health) {
            return {
                action: 'none',
                message: 'Unknown provider'
            };
        }

        switch (health.status) {
            case HealthStatus.BLACKLISTED:
                return {
                    action: 'wait',
                    message: health.blacklistExpiry
                        ? `Blacklisted until ${new Date(health.blacklistExpiry).toLocaleTimeString()}`
                        : 'Provider temporarily unavailable',
                    canSwitch: true
                };

            case HealthStatus.UNHEALTHY:
                return {
                    action: 'switch',
                    message: 'Provider is experiencing issues. Consider switching to an alternative.',
                    canSwitch: true
                };

            case HealthStatus.DEGRADED:
                return {
                    action: 'optional_switch',
                    message: 'Provider is slow but functional. You can switch if needed.',
                    canSwitch: true
                };

            case HealthStatus.UNKNOWN:
                return {
                    action: 'test',
                    message: 'Provider status unknown. Try sending a message to test.',
                    canSwitch: false
                };

            default:
                return {
                    action: 'none',
                    message: 'Provider is working normally',
                    canSwitch: false
                };
        }
    }
}

// Singleton instance with lazy initialization and auto-start for backward compatibility
let providerHealthMonitorInstance = null;

function getProviderHealthMonitor() {
    if (!providerHealthMonitorInstance) {
        providerHealthMonitorInstance = new ProviderHealthMonitor();
        // Auto-start monitoring for backward compatibility
        providerHealthMonitorInstance.initialize().catch(err => {
            console.error('[ProviderHealthMonitor] Initialization failed:', err);
        });
    }
    return providerHealthMonitorInstance;
}

// Export the function, not the result, to avoid race conditions at module load time
export default getProviderHealthMonitor;
