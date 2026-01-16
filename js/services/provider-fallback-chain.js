/**
 * ProviderFallbackChain - Automatic Provider Fallback System
 *
 * Prevents cascade failures by automatically trying alternative LLM providers
 * when the primary provider fails. Implements health tracking, blacklisting,
 * and circuit breaker coordination for resilient provider switching.
 *
 * @module ProviderFallbackChain
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { EventBus } from './event-bus.js';
import { ProviderCircuitBreaker } from '../providers/provider-circuit-breaker.js';
import { ProviderInterface } from '../providers/provider-interface.js';

/**
 * Provider priority order (tried in sequence)
 * @readonly
 * @enum {number}
 */
export const ProviderPriority = Object.freeze({
    OPENROUTER: 1,    // Primary cloud provider
    LM_STUDIO: 2,     // Local inference
    OLLAMA: 3,        // Local inference
    FALLBACK: 4       // Static fallback responses
});

/**
 * Provider health status
 * @readonly
 * @enum {string}
 */
export const ProviderHealth = Object.freeze({
    HEALTHY: 'healthy',        // Provider is working normally
    DEGRADED: 'degraded',      // Provider is slow but functional
    UNHEALTHY: 'unhealthy',    // Provider is failing
    BLACKLISTED: 'blacklisted', // Provider is temporarily blacklisted
    UNKNOWN: 'unknown'         // Provider status unknown
});

/**
 * Provider configuration
 * @typedef {Object} ProviderConfig
 * @property {string} name - Provider name
 * @property {ProviderPriority} priority - Provider priority
 * @property {number} timeoutMs - Request timeout in milliseconds
 * @property {boolean} isLocal - Whether provider is local
 * @property {number} maxRetries - Maximum retry attempts
 */

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
 * Fallback chain result
 * @typedef {Object} FallbackChainResult
 * @property {boolean} success - Whether any provider succeeded
 * @property {string} provider - Provider that succeeded
 * @property {number} attempts - Number of provider attempts
 * @property {Array<ProviderAttempt>} attempts - All provider attempts
 * @property {Object} response - Provider response (if successful)
 * @property {Error|null} error - Final error (if all failed)
 */

/**
 * Provider attempt record
 * @typedef {Object} ProviderAttempt
 * @property {string} provider - Provider name
 * @property {boolean} success - Whether attempt succeeded
 * @property {number} latencyMs - Request latency in milliseconds
 * @property {Error|null} error - Error if failed
 * @property {number} timestamp - Attempt timestamp
 */

/**
 * ProviderFallbackChain Class
 *
 * Manages automatic provider fallback with health tracking and blacklisting.
 */
export class ProviderFallbackChain {
    /**
     * @private
     * @type {Map<string, ProviderConfig>}
     */
    _providerConfigs = new Map();

    /**
     * @private
     * @type {Map<string, ProviderHealthRecord>}
     */
    _providerHealth = new Map();

    /**
     * @private
     * @type {Map<string, number>}
     */
    _providerBlacklist = new Map();

    /**
     * @private
     * @type {EventBus}
     */
    _eventBus = EventBus;

    /**
     * @private
     * @type {number}
     */
    _blacklistDurationMs = 300000; // 5 minutes default

    /**
     * @private
     * @type {number}
     */
    _healthCheckIntervalMs = 60000; // 1 minute

    /**
     * @private
     * @type {number|null}
     */
    _healthCheckIntervalId = null;

    /**
     * Initialize the ProviderFallbackChain
     * @public
     * @param {Object} options - Configuration options
     * @param {EventBus} options.eventBus - Event bus instance
     * @param {number} options.blacklistDurationMs - Blacklist duration in milliseconds
     * @param {number} options.healthCheckIntervalMs - Health check interval in milliseconds
     */
    constructor({ eventBus, blacklistDurationMs = 300000, healthCheckIntervalMs = 60000 } = {}) {
        if (eventBus) this._eventBus = eventBus;
        this._blacklistDurationMs = blacklistDurationMs;
        this._healthCheckIntervalMs = healthCheckIntervalMs;

        this._initializeProviders();
        this._initializeHealthTracking();
        this._subscribeToEvents();
        this._startHealthMonitoring();

        performance.mark('provider-fallback-chain-init');
    }

    /**
     * Initialize provider configurations
     * @private
     */
    _initializeProviders() {
        // OpenRouter - Primary cloud provider
        this._providerConfigs.set('openrouter', {
            name: 'openrouter',
            priority: ProviderPriority.OPENROUTER,
            timeoutMs: 60000,
            isLocal: false,
            maxRetries: 3
        });

        // LM Studio - Local inference
        this._providerConfigs.set('lmstudio', {
            name: 'lmstudio',
            priority: ProviderPriority.LM_STUDIO,
            timeoutMs: 90000,
            isLocal: true,
            maxRetries: 2
        });

        // Ollama - Local inference
        this._providerConfigs.set('ollama', {
            name: 'ollama',
            priority: ProviderPriority.OLLAMA,
            timeoutMs: 90000,
            isLocal: true,
            maxRetries: 2
        });

        // Fallback responses - Static data
        this._providerConfigs.set('fallback', {
            name: 'fallback',
            priority: ProviderPriority.FALLBACK,
            timeoutMs: 0,
            isLocal: true,
            maxRetries: 0
        });
    }

    /**
     * Initialize health tracking for all providers
     * @private
     */
    _initializeHealthTracking() {
        const now = Date.now();

        for (const [name, config] of this._providerConfigs) {
            this._providerHealth.set(name, {
                provider: name,
                health: ProviderHealth.UNKNOWN,
                successCount: 0,
                failureCount: 0,
                avgLatencyMs: 0,
                lastSuccessTime: 0,
                lastFailureTime: 0,
                blacklistExpiry: null
            });
        }
    }

    /**
     * Subscribe to provider events
     * @private
     */
    _subscribeToEvents() {
        // Subscribe to provider success events
        this._eventBus.subscribe('PROVIDER:SUCCESS', async (event, data) => {
            await this._recordProviderSuccess(data.provider, data.latencyMs);
        });

        // Subscribe to provider failure events
        this._eventBus.subscribe('PROVIDER:FAILURE', async (event, data) => {
            await this._recordProviderFailure(data.provider, data.error);
        });

        // Subscribe to circuit breaker events
        this._eventBus.subscribe('CIRCUIT_BREAKER:TRIPPED', async (event, data) => {
            await this._handleCircuitBreakerTripped(data.provider);
        });

        // Subscribe to circuit breaker recovery events
        this._eventBus.subscribe('CIRCUIT_BREAKER:RECOVERED', async (event, data) => {
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
        for (const [name, config] of this._providerConfigs) {
            if (name === 'fallback') continue; // Skip fallback provider

            try {
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
        // Check circuit breaker status first
        const circuitStatus = ProviderCircuitBreaker.getStatus(providerName);
        if (!circuitStatus.allowed) {
            return ProviderHealth.BLACKLISTED;
        }

        // Check blacklist status
        if (this._isProviderBlacklisted(providerName)) {
            return ProviderHealth.BLACKLISTED;
        }

        // Check provider health record
        const healthRecord = this._providerHealth.get(providerName);
        if (!healthRecord) {
            return ProviderHealth.UNKNOWN;
        }

        // Determine health based on recent performance
        const now = Date.now();
        const recentFailures = healthRecord.failureCount;
        const recentSuccesses = healthRecord.successCount;
        const totalAttempts = recentFailures + recentSuccesses;

        if (totalAttempts === 0) {
            return ProviderHealth.UNKNOWN;
        }

        const successRate = recentSuccesses / totalAttempts;

        if (successRate >= 0.8) {
            return healthRecord.avgLatencyMs > 5000 ? ProviderHealth.DEGRADED : ProviderHealth.HEALTHY;
        } else if (successRate >= 0.5) {
            return ProviderHealth.DEGRADED;
        } else {
            return ProviderHealth.UNHEALTHY;
        }
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
     * Record successful provider request
     * @private
     * @param {string} providerName - Provider name
     * @param {number} latencyMs - Request latency in milliseconds
     */
    async _recordProviderSuccess(providerName, latencyMs) {
        const healthRecord = this._providerHealth.get(providerName);
        if (!healthRecord) return;

        healthRecord.successCount++;
        healthRecord.lastSuccessTime = Date.now();

        // Update average latency (exponential moving average)
        if (healthRecord.avgLatencyMs === 0) {
            healthRecord.avgLatencyMs = latencyMs;
        } else {
            healthRecord.avgLatencyMs = (healthRecord.avgLatencyMs * 0.9) + (latencyMs * 0.1);
        }

        // Reset failure count on success
        healthRecord.failureCount = Math.max(0, healthRecord.failureCount - 1);

        // Update circuit breaker
        ProviderCircuitBreaker.recordSuccess(providerName, latencyMs);

        // Emit health update event
        this._eventBus.emit('PROVIDER:HEALTH_UPDATE', {
            provider: providerName,
            health: healthRecord.health
        });
    }

    /**
     * Record failed provider request
     * @private
     * @param {string} providerName - Provider name
     * @param {Error} error - Error that occurred
     */
    async _recordProviderFailure(providerName, error) {
        const healthRecord = this._providerHealth.get(providerName);
        if (!healthRecord) return;

        healthRecord.failureCount++;
        healthRecord.lastFailureTime = Date.now();

        // Check if provider should be blacklisted
        const consecutiveFailures = healthRecord.failureCount;
        if (consecutiveFailures >= 3) {
            await this._blacklistProvider(providerName, this._blacklistDurationMs);
        }

        // Update circuit breaker
        ProviderCircuitBreaker.recordFailure(providerName, error);

        // Emit health update event
        this._eventBus.emit('PROVIDER:HEALTH_UPDATE', {
            provider: providerName,
            health: healthRecord.health
        });
    }

    /**
     * Handle circuit breaker tripped event
     * @private
     * @param {string} providerName - Provider name
     */
    async _handleCircuitBreakerTripped(providerName) {
        console.warn(`[ProviderFallbackChain] Circuit breaker tripped for ${providerName}`);
        await this._blacklistProvider(providerName, this._blacklistDurationMs);
    }

    /**
     * Handle circuit breaker recovered event
     * @private
     * @param {string} providerName - Provider name
     */
    async _handleCircuitBreakerRecovered(providerName) {
        console.log(`[ProviderFallbackChain] Circuit breaker recovered for ${providerName}`);
        await this._removeProviderFromBlacklist(providerName);
    }

    /**
     * Blacklist a provider temporarily
     * @private
     * @param {string} providerName - Provider name
     * @param {number} durationMs - Blacklist duration in milliseconds
     */
    async _blacklistProvider(providerName, durationMs) {
        const expiry = Date.now() + durationMs;
        this._providerBlacklist.set(providerName, expiry);

        const healthRecord = this._providerHealth.get(providerName);
        if (healthRecord) {
            healthRecord.health = ProviderHealth.BLACKLISTED;
            healthRecord.blacklistExpiry = new Date(expiry).toISOString();
        }

        console.warn(`[ProviderFallbackChain] Blacklisted ${providerName} for ${durationMs}ms`);

        // Emit blacklist event
        this._eventBus.emit('PROVIDER:BLACKLISTED', {
            provider: providerName,
            expiry: new Date(expiry).toISOString(),
            durationMs
        });
    }

    /**
     * Remove provider from blacklist
     * @private
     * @param {string} providerName - Provider name
     */
    async _removeProviderFromBlacklist(providerName) {
        this._providerBlacklist.delete(providerName);

        const healthRecord = this._providerHealth.get(providerName);
        if (healthRecord) {
            healthRecord.health = ProviderHealth.UNKNOWN;
            healthRecord.blacklistExpiry = null;
        }

        console.log(`[ProviderFallbackChain] Removed ${providerName} from blacklist`);

        // Emit unblacklist event
        this._eventBus.emit('PROVIDER:UNBLACKLISTED', {
            provider: providerName
        });
    }

    /**
     * Check if provider is blacklisted
     * @private
     * @param {string} providerName - Provider name
     * @returns {boolean} True if provider is blacklisted
     */
    _isProviderBlacklisted(providerName) {
        const expiry = this._providerBlacklist.get(providerName);
        if (!expiry) return false;

        if (Date.now() > expiry) {
            // Blacklist expired, remove it
            this._removeProviderFromBlacklist(providerName);
            return false;
        }

        return true;
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
     * @returns {Promise<FallbackChainResult>} Fallback chain result
     */
    async executeWithFallback({ provider, apiKey, messages, tools, onProgress }) {
        performance.mark('provider-fallback-chain-start');

        const attempts = [];
        const providersToTry = this._getProviderPriorityOrder(provider);

        for (const providerName of providersToTry) {
            // Skip blacklisted providers
            if (this._isProviderBlacklisted(providerName)) {
                console.log(`[ProviderFallbackChain] Skipping blacklisted provider: ${providerName}`);
                attempts.push({
                    provider: providerName,
                    success: false,
                    latencyMs: 0,
                    error: new Error('Provider blacklisted'),
                    timestamp: Date.now()
                });
                continue;
            }

            // Execute provider call with atomic circuit breaker protection
            try {
                const result = await this._executeProviderWithCircuitBreaker({
                    provider: providerName,
                    apiKey,
                    messages,
                    tools,
                    onProgress
                });

                if (result.success) {
                    attempts.push({
                        provider: providerName,
                        success: true,
                        latencyMs: result.latencyMs,
                        error: null,
                        timestamp: Date.now()
                    });

                    performance.measure('provider-fallback-chain-success', 'provider-fallback-chain-start');

                    return {
                        success: true,
                        provider: providerName,
                        attempts: attempts.length,
                        attempts,
                        response: result.response
                    };
                } else {
                    attempts.push({
                        provider: providerName,
                        success: false,
                        latencyMs: result.latencyMs,
                        error: result.error,
                        timestamp: Date.now()
                    });

                    console.error(`[ProviderFallbackChain] Provider ${providerName} failed:`, result.error?.message);

                    // Continue to next provider
                    continue;
                }

            } catch (error) {
                attempts.push({
                    provider: providerName,
                    success: false,
                    latencyMs: 0,
                    error,
                    timestamp: Date.now()
                });

                console.error(`[ProviderFallbackChain] Provider ${providerName} failed with exception:`, error.message);

                // Continue to next provider
                continue;
            }
        }

        // All providers failed
        performance.measure('provider-fallback-chain-failed', 'provider-fallback-chain-start');

        return {
            success: false,
            provider: null,
            attempts: attempts.length,
            attempts,
            response: null,
            error: new Error('All providers failed')
        };
    }

    /**
     * Get provider priority order for fallback
     * @private
     * @param {string} primaryProvider - Primary provider to start with
     * @returns {string[]} Ordered list of provider names
     */
    _getProviderPriorityOrder(primaryProvider) {
        const providers = Array.from(this._providerConfigs.values())
            .sort((a, b) => a.priority - b.priority)
            .map(config => config.name);

        // Move primary provider to front
        if (primaryProvider && providers.includes(primaryProvider)) {
            const index = providers.indexOf(primaryProvider);
            providers.splice(index, 1);
            providers.unshift(primaryProvider);
        }

        return providers;
    }

    /**
     * Execute provider call with atomic circuit breaker protection
     * This method combines circuit breaker check, execution, and recording
     * to prevent TOCTOU (Time-Of-Check-Time-Of-Use) race conditions.
     * @private
     * @param {Object} options - Call options
     * @returns {Promise<Object>} Result object with success, latencyMs, response, error
     */
    async _executeProviderWithCircuitBreaker({ provider, apiKey, messages, tools, onProgress }) {
        const startTime = performance.now();

        // Check circuit breaker status first
        const circuitStatus = ProviderCircuitBreaker.canExecute(provider);
        if (!circuitStatus.allowed) {
            return {
                success: false,
                latencyMs: 0,
                error: new Error(circuitStatus.reason),
                response: null
            };
        }

        try {
            // Execute provider call
            const response = await this._executeProviderCall({
                provider,
                apiKey,
                messages,
                tools,
                onProgress
            });

            const latencyMs = performance.now() - startTime;

            // Record success (atomic with execution)
            await this._recordProviderSuccess(provider, latencyMs);

            return {
                success: true,
                latencyMs,
                response,
                error: null
            };

        } catch (error) {
            const latencyMs = performance.now() - startTime;

            // Record failure (atomic with execution)
            await this._recordProviderFailure(provider, error);

            return {
                success: false,
                latencyMs,
                error,
                response: null
            };
        }
    }

    /**
     * Execute call to specific provider
     * @private
     * @param {Object} options - Call options
     * @returns {Promise<Object>} Provider response
     */
    async _executeProviderCall({ provider, apiKey, messages, tools, onProgress }) {
        // Fallback provider returns static response
        if (provider === 'fallback') {
            return this._generateFallbackResponse(messages);
        }

        // Build provider configuration
        const config = this._providerConfigs.get(provider);
        if (!config) {
            throw new Error(`Unknown provider: ${provider}`);
        }

        const providerConfig = await ProviderInterface.buildProviderConfig(
            provider,
            { apiKey }
        );

        // Execute provider call with timeout
        const response = await Promise.race([
            ProviderInterface.callProvider(providerConfig, apiKey, messages, tools, onProgress),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Provider timeout')), config.timeoutMs)
            )
        ]);

        return response;
    }

    /**
     * Generate fallback response when all providers fail
     * @private
     * @param {Array} messages - Chat messages
     * @returns {Promise<Object>} Fallback response
     */
    async _generateFallbackResponse(messages) {
        const { FallbackResponseService } = await import('./fallback-response-service.js');

        const lastMessage = messages[messages.length - 1];
        const queryContext = this._generateQueryContext(lastMessage?.content);

        const fallbackResponse = FallbackResponseService.generateFallbackResponse(
            lastMessage?.content || '',
            queryContext
        );

        return {
            content: fallbackResponse,
            status: 'success',
            role: 'assistant',
            isFallback: true
        };
    }

    /**
     * Generate query context for fallback response
     * @private
     * @param {string} message - User message
     * @returns {Object} Query context
     */
    _generateQueryContext(message) {
        // Basic context - can be enhanced
        return {
            message,
            timestamp: Date.now(),
            hasPersonality: false,
            hasPatterns: false
        };
    }

    /**
     * Get health status for all providers
     * @public
     * @returns {Map<string, ProviderHealthRecord>} Provider health records
     */
    getProviderHealth() {
        return new Map(this._providerHealth);
    }

    /**
     * Get health status for specific provider
     * @public
     * @param {string} providerName - Provider name
     * @returns {ProviderHealthRecord|null} Provider health record
     */
    getProviderHealthStatus(providerName) {
        return this._providerHealth.get(providerName) || null;
    }

    /**
     * Get blacklist status
     * @public
     * @returns {Map<string, number>} Blacklisted providers with expiry times
     */
    getBlacklistStatus() {
        return new Map(this._providerBlacklist);
    }

    /**
     * Manually blacklist a provider
     * @public
     * @param {string} providerName - Provider name
     * @param {number} durationMs - Blacklist duration in milliseconds
     */
    async blacklistProvider(providerName, durationMs = this._blacklistDurationMs) {
        await this._blacklistProvider(providerName, durationMs);
    }

    /**
     * Manually remove provider from blacklist
     * @public
     * @param {string} providerName - Provider name
     */
    async unblacklistProvider(providerName) {
        await this._removeProviderFromBlacklist(providerName);
    }

    /**
     * Get provider priority order
     * @public
     * @param {string} primaryProvider - Primary provider
     * @returns {string[]} Ordered provider names
     */
    getProviderPriorityOrder(primaryProvider) {
        return this._getProviderPriorityOrder(primaryProvider);
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
        this._initializeHealthTracking();
        this._providerBlacklist.clear();
        console.log('[ProviderFallbackChain] Reset all health tracking');
    }
}

// Export singleton instance
export default new ProviderFallbackChain();