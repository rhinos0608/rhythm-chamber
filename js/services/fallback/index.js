/**
 * Provider Fallback Chain - Facade
 *
 * Maintains backward compatibility while delegating to
 * refactored modules.
 *
 * @module fallback/index
 */

import { EventBus } from '../event-bus.js';
import { createDefaultProviderConfigs, ProviderPriority, ProviderHealth, DEFAULT_CONFIG } from './config.js';
import {
    initializeHealthTracking,
    recordProviderSuccess,
    recordProviderFailure,
    blacklistProvider,
    removeProviderFromBlacklist,
    getProviderHealth,
    getProviderHealthStatus,
    getBlacklistStatus
} from './health.js';
import { getProviderPriorityOrder as calcPriorityOrder } from './priority.js';
import { executeWithFallback } from './execution.js';

/**
 * Provider health record
 * @typedef {Object} ProviderHealthRecord
 * @property {string} provider - Provider name
 * @property {ProviderHealth} health - Current health status
 * @property {number} successCount - Number of successful requests
 * @property {number} failureCount - Number of failed requests
 * @property {number} avgLatencyMs - Average latency in milliseconds
 * @property {number} lastSuccessTime - Last successful request timestamp
 * @property {number} lastFailureTime - Last failed request timestamp
 * @property {string|null} blacklistExpiry - Blacklist expiry timestamp
 */

/**
 * ProviderFallbackChain Class
 *
 * Manages automatic provider fallback with health tracking and blacklisting.
 */
export class ProviderFallbackChain {
    /**
     * @private
     * @type {Map<string, *>}
     */
    _providerConfigs;

    /**
     * @private
     * @type {Map<string, ProviderHealthRecord>}
     */
    _providerHealth;

    /**
     * @private
     * @type {Map<string, number>}
     */
    _providerBlacklist;

    /**
     * @private
     * @type {EventBus}
     */
    _eventBus;

    /**
     * @private
     * @type {number}
     */
    _blacklistDurationMs;

    /**
     * @private
     * @type {number}
     */
    _healthCheckIntervalMs;

    /**
     * @private
     * @type {number|null}
     */
    _healthCheckIntervalId;

    /**
     * Initialize the ProviderFallbackChain
     * @public
     * @param {Object} options - Configuration options
     * @param {EventBus} options.eventBus - Event bus instance
     * @param {number} options.blacklistDurationMs - Blacklist duration in milliseconds
     * @param {number} options.healthCheckIntervalMs - Health check interval in milliseconds
     */
    constructor({ eventBus, blacklistDurationMs, healthCheckIntervalMs } = {}) {
        this._eventBus = eventBus || EventBus;
        this._blacklistDurationMs = blacklistDurationMs || DEFAULT_CONFIG.BLACKLIST_DURATION_MS;
        this._healthCheckIntervalMs = healthCheckIntervalMs || DEFAULT_CONFIG.HEALTH_CHECK_INTERVAL_MS;

        this._providerConfigs = createDefaultProviderConfigs();
        this._providerHealth = initializeHealthTracking(this._providerConfigs);
        this._providerBlacklist = new Map();

        this._subscribeToEvents();
        this._startHealthMonitoring();

        performance.mark('provider-fallback-chain-init');
    }

    /**
     * Subscribe to provider events
     * @private
     */
    _subscribeToEvents() {
        // Subscribe to provider success events
        this._eventBus.on('PROVIDER:SUCCESS', async (event, data) => {
            await recordProviderSuccess(this._providerHealth, data.provider, data.latencyMs);
        });

        // Subscribe to provider failure events
        this._eventBus.on('PROVIDER:FAILURE', async (event, data) => {
            await recordProviderFailure(
                this._providerHealth,
                data.provider,
                data.error,
                this._providerBlacklist,
                this._blacklistDurationMs
            );
        });

        // Subscribe to circuit breaker events
        this._eventBus.on('CIRCUIT_BREAKER:TRIPPED', async (event, data) => {
            await this._handleCircuitBreakerTripped(data.provider);
        });

        // Subscribe to circuit breaker recovery events
        this._eventBus.on('CIRCUIT_BREAKER:RECOVERED', async (event, data) => {
            await this._handleCircuitBreakerRecovered(data.provider);
        });
    }

    /**
     * Start periodic health monitoring
     * @private
     */
    _startHealthMonitoring() {
        if (this._healthCheckIntervalId) {
            clearInterval(this._healthCheckIntervalId);
        }

        this._healthCheckIntervalId = setInterval(async () => {
            await this._performHealthChecks();
        }, this._healthCheckIntervalMs);
    }

    /**
     * Perform health checks on all providers
     * @private
     */
    async _performHealthChecks() {
        for (const [name] of this._providerConfigs) {
            if (name === 'fallback') continue; // Skip fallback provider

            try {
                // Health checks are delegated to ProviderHealthAuthority
                // This is just for notification purposes
                const health = await this._checkProviderHealth(name);
                this._updateProviderHealthStatus(name, health);
            } catch (error) {
                console.error(`[ProviderFallbackChain] Health check failed for ${name}:`, error);
                this._updateProviderHealthStatus(name, ProviderHealth.UNHEALTHY);
            }
        }

        // Emit health status summary
        this._eventBus.emit('PROVIDER:HEALTH_SUMMARY', {
            timestamp: Date.now(),
            health: Object.fromEntries(this._providerHealth)
        });
    }

    /**
     * Check health of a specific provider
     * @private
     * @param {string} providerName - Provider name
     * @returns {Promise<ProviderHealth>} Provider health status
     */
    async _checkProviderHealth(providerName) {
        // Delegate to ProviderHealthAuthority - single source of truth
        const { ProviderHealthAuthority } = await import('../provider-health-authority.js');
        const status = ProviderHealthAuthority.getStatus(providerName);
        return status.healthStatus;
    }

    /**
     * Update provider health status
     * @private
     * @param {string} providerName - Provider name
     * @param {ProviderHealth} health - Health status
     */
    _updateProviderHealthStatus(providerName, health) {
        const healthRecord = this._providerHealth.get(providerName);
        if (healthRecord) {
            healthRecord.health = health;
        }
    }

    /**
     * Handle circuit breaker tripped event
     * @private
     * @param {string} providerName - Provider name
     */
    async _handleCircuitBreakerTripped(providerName) {
        console.warn(`[ProviderFallbackChain] Circuit breaker tripped for ${providerName}`);
        await blacklistProvider(
            this._providerHealth,
            this._providerBlacklist,
            providerName,
            this._blacklistDurationMs
        );
    }

    /**
     * Handle circuit breaker recovered event
     * @private
     * @param {string} providerName - Provider name
     */
    async _handleCircuitBreakerRecovered(providerName) {
        console.log(`[ProviderFallbackChain] Circuit breaker recovered for ${providerName}`);
        await removeProviderFromBlacklist(
            this._providerHealth,
            this._providerBlacklist,
            providerName
        );
    }

    /**
     * Execute LLM call with automatic provider fallback
     * @public
     * @param {Object} options - Call options
     * @param {string} options.provider - Primary provider to try
     * @param {string} options.apiKey - API key for provider
     * @param {Array} options.messages - Chat messages
     * @param {Array} options.tools - Function calling tools
     * @param {Function} options.onProgress - Progress callback
     * @returns {Promise<Object>} Fallback chain result
     */
    async executeWithFallback(options) {
        return executeWithFallback(
            this._providerConfigs,
            this._providerHealth,
            this._providerBlacklist,
            this._blacklistDurationMs,
            options
        );
    }

    /**
     * Get health status for all providers
     * @public
     * @returns {Map<string, ProviderHealthRecord>} Provider health records
     */
    getProviderHealth() {
        return getProviderHealth(this._providerHealth);
    }

    /**
     * Get health status for specific provider
     * @public
     * @param {string} providerName - Provider name
     * @returns {ProviderHealthRecord|null} Provider health record
     */
    getProviderHealthStatus(providerName) {
        return getProviderHealthStatus(this._providerHealth, providerName);
    }

    /**
     * Get blacklist status
     * @public
     * @returns {Map<string, number>} Blacklisted providers with expiry times
     */
    getBlacklistStatus() {
        return getBlacklistStatus(this._providerBlacklist);
    }

    /**
     * Manually blacklist a provider
     * @public
     * @param {string} providerName - Provider name
     * @param {number} durationMs - Blacklist duration in milliseconds
     */
    async blacklistProvider(providerName, durationMs = this._blacklistDurationMs) {
        await blacklistProvider(
            this._providerHealth,
            this._providerBlacklist,
            providerName,
            durationMs
        );
    }

    /**
     * Manually remove provider from blacklist
     * @public
     * @param {string} providerName - Provider name
     */
    async unblacklistProvider(providerName) {
        await removeProviderFromBlacklist(
            this._providerHealth,
            this._providerBlacklist,
            providerName
        );
    }

    /**
     * Get provider priority order
     * @public
     * @param {string} primaryProvider - Primary provider
     * @returns {string[]} Ordered provider names
     */
    getProviderPriorityOrder(primaryProvider) {
        return calcPriorityOrder(this._providerConfigs, primaryProvider);
    }

    /**
     * Stop health monitoring
     * @public
     */
    stopHealthMonitoring() {
        if (this._healthCheckIntervalId) {
            clearInterval(this._healthCheckIntervalId);
            this._healthCheckIntervalId = null;
        }
    }

    /**
     * Reset all health tracking
     * @public
     */
    resetHealthTracking() {
        this._providerHealth = initializeHealthTracking(this._providerConfigs);
        this._providerBlacklist.clear();
        console.log('[ProviderFallbackChain] Reset all health tracking');
    }
}

// Re-export constants for backward compatibility
export { ProviderPriority, ProviderHealth };

// Export singleton instance
export default new ProviderFallbackChain();
