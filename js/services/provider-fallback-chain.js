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
import { ProviderHealthAuthority, HealthStatus } from './provider-health-authority.js';
import { ProviderInterface } from '../providers/provider-interface.js';

// Note: ProviderCircuitBreaker is deprecated - use ProviderHealthAuthority instead
// Legacy import kept for backwards compatibility during transition
// import { ProviderCircuitBreaker } from '../providers/provider-circuit-breaker.js';

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
 * @deprecated Use HealthStatus from provider-health-authority.js instead
 * @readonly
 * @enum {string}
 */
export const ProviderHealth = HealthStatus; // Re-export for backwards compatibility

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
 * @property {number} attemptsCount - Number of provider attempts
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
            // Get initial status from ProviderHealthAuthority if available
            const authorityStatus = ProviderHealthAuthority.getStatus(name);
            
            this._providerHealth.set(name, {
                provider: name,
                health: authorityStatus.healthStatus || HealthStatus.UNKNOWN,
                successCount: authorityStatus.totalSuccesses || 0,
                failureCount: authorityStatus.totalFailures || 0,
                avgLatencyMs: authorityStatus.avgLatencyMs || 0,
                lastSuccessTime: authorityStatus.lastSuccessTime || 0,
                lastFailureTime: authorityStatus.lastFailureTime || 0,
                blacklistExpiry: authorityStatus.blacklistExpiry 
                    ? new Date(authorityStatus.blacklistExpiry).toISOString() 
                    : null
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
        // Delegate to ProviderHealthAuthority - single source of truth
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
     * Record successful provider request
     * @private
     * @param {string} providerName - Provider name
     * @param {number} latencyMs - Request latency in milliseconds
     */
    async _recordProviderSuccess(providerName, latencyMs) {
        // Delegate to ProviderHealthAuthority - single source of truth
        // This handles: metrics update, circuit breaker state, event emission
        ProviderHealthAuthority.recordSuccess(providerName, latencyMs);
        
        // Update local cache for backwards compatibility
        const healthRecord = this._providerHealth.get(providerName);
        if (healthRecord) {
            healthRecord.successCount++;
            healthRecord.lastSuccessTime = Date.now();
            healthRecord.avgLatencyMs = healthRecord.avgLatencyMs === 0 
                ? latencyMs 
                : (healthRecord.avgLatencyMs * 0.9) + (latencyMs * 0.1);
            healthRecord.failureCount = Math.max(0, healthRecord.failureCount - 1);
            healthRecord.health = ProviderHealthAuthority.getStatus(providerName).healthStatus;
        }
    }

    /**
     * Record failed provider request
     * @private
     * @param {string} providerName - Provider name
     * @param {Error} error - Error that occurred
     */
    async _recordProviderFailure(providerName, error) {
        // Delegate to ProviderHealthAuthority - single source of truth
        // This handles: metrics update, circuit breaker state, event emission, blacklisting
        ProviderHealthAuthority.recordFailure(providerName, error);
        
        // Update local cache for backwards compatibility
        const healthRecord = this._providerHealth.get(providerName);
        if (healthRecord) {
            healthRecord.failureCount++;
            healthRecord.lastFailureTime = Date.now();
            healthRecord.health = ProviderHealthAuthority.getStatus(providerName).healthStatus;
            
            // Sync blacklist state from authority
            const status = ProviderHealthAuthority.getStatus(providerName);
            if (status.isBlacklisted) {
                this._providerBlacklist.set(providerName, status.blacklistExpiry);
                healthRecord.blacklistExpiry = new Date(status.blacklistExpiry).toISOString();
            }
        }
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
        // Delegate to ProviderHealthAuthority - single source of truth
        ProviderHealthAuthority.blacklist(providerName, durationMs);
        
        // Update local cache for backwards compatibility
        const expiry = Date.now() + durationMs;
        this._providerBlacklist.set(providerName, expiry);

        const healthRecord = this._providerHealth.get(providerName);
        if (healthRecord) {
            healthRecord.health = HealthStatus.BLACKLISTED;
            healthRecord.blacklistExpiry = new Date(expiry).toISOString();
        }

        console.warn(`[ProviderFallbackChain] Blacklisted ${providerName} for ${durationMs}ms (via ProviderHealthAuthority)`);
    }

    /**
     * Remove provider from blacklist
     * @private
     * @param {string} providerName - Provider name
     */
    async _removeProviderFromBlacklist(providerName) {
        // Delegate to ProviderHealthAuthority - single source of truth
        ProviderHealthAuthority.unblacklist(providerName);
        
        // Update local cache for backwards compatibility
        this._providerBlacklist.delete(providerName);

        const healthRecord = this._providerHealth.get(providerName);
        if (healthRecord) {
            healthRecord.health = ProviderHealthAuthority.getStatus(providerName).healthStatus;
            healthRecord.blacklistExpiry = null;
        }

        console.log(`[ProviderFallbackChain] Removed ${providerName} from blacklist (via ProviderHealthAuthority)`);
    }

    /**
     * Check if provider is blacklisted
     * @private
     * @param {string} providerName - Provider name
     * @returns {Promise<boolean>} True if provider is blacklisted
     */
    async _isProviderBlacklisted(providerName) {
        // Delegate to ProviderHealthAuthority - single source of truth
        return ProviderHealthAuthority.isBlacklisted(providerName);
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
            if (await this._isProviderBlacklisted(providerName)) {
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
                        attemptsCount: attempts.length,
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
            attemptsCount: attempts.length,
            attempts,
            response: null,
            error: new Error('All providers failed')
        };
    }

    /**
     * Get provider priority order for fallback (with dynamic health-based ordering)
     * 
     * Providers are scored based on:
     * - Health status (healthy > degraded > unknown > unhealthy/blacklisted)
     * - Circuit breaker state (closed > half_open > open)
     * - Average latency (lower is better)
     * - Success rate (higher is better)
     * - Base priority (configured priority as tiebreaker)
     * 
     * @private
     * @param {string} primaryProvider - Primary provider to start with (gets priority boost)
     * @returns {string[]} Ordered list of provider names (best first)
     */
    _getProviderPriorityOrder(primaryProvider) {
        const providers = Array.from(this._providerConfigs.values());
        
        // Score each provider based on health metrics
        const scoredProviders = providers.map(config => {
            const status = ProviderHealthAuthority.getStatus(config.name);
            let score = 0;
            
            // Health status scoring (higher = better)
            // Range: 0-100 for health status
            switch (status.healthStatus) {
                case HealthStatus.HEALTHY:
                    score += 100;
                    break;
                case HealthStatus.DEGRADED:
                    score += 60;
                    break;
                case HealthStatus.UNKNOWN:
                    score += 40; // Unknown gets moderate score - worth trying
                    break;
                case HealthStatus.UNHEALTHY:
                    score += 10;
                    break;
                case HealthStatus.BLACKLISTED:
                    score += 0; // Blacklisted gets lowest score
                    break;
            }
            
            // Circuit breaker state scoring (additional 0-30 points)
            if (status.isClosed) {
                score += 30;
            } else if (status.isHalfOpen) {
                score += 15; // Half-open is worth testing
            } else if (status.isOpen) {
                score += 0;
            }
            
            // Success rate scoring (0-20 points)
            // successRate is 0-1, multiply by 20
            score += (status.successRate || 0) * 20;
            
            // Latency penalty (0 to -10 points for high latency)
            // Penalty kicks in above 2000ms, max penalty at 10000ms
            const latencyPenalty = Math.min(10, Math.max(0, (status.avgLatencyMs - 2000) / 800));
            score -= latencyPenalty;
            
            // Primary provider boost (+50 points)
            if (config.name === primaryProvider) {
                score += 50;
            }
            
            // Local provider slight boost (+5 points) - more reliable
            if (config.isLocal) {
                score += 5;
            }
            
            // Base priority as minor tiebreaker (0-4 points, inverted since lower priority = better)
            // Priority 1 gets 4 points, priority 4 gets 1 point
            score += Math.max(0, 5 - config.priority);
            
            return {
                name: config.name,
                score,
                // Include for debugging
                healthStatus: status.healthStatus,
                circuitState: status.circuitState,
                successRate: status.successRate,
                avgLatencyMs: status.avgLatencyMs,
                basePriority: config.priority
            };
        });
        
        // Sort by score (highest first)
        scoredProviders.sort((a, b) => b.score - a.score);
        
        // Log the dynamic ordering in debug mode
        if (this._eventBus && scoredProviders.length > 0) {
            const orderSummary = scoredProviders
                .map(p => `${p.name}(${p.score.toFixed(1)})`)
                .join(' > ');
            console.log(`[ProviderFallbackChain] Dynamic provider order: ${orderSummary}`);
        }
        
        return scoredProviders.map(p => p.name);
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

        // Check circuit breaker status using ProviderHealthAuthority
        const checkResult = ProviderHealthAuthority.canExecute(provider);
        if (!checkResult.allowed) {
            return {
                success: false,
                latencyMs: 0,
                error: new Error(checkResult.reason),
                response: null
            };
        }

        // Track half-open request if applicable
        const status = ProviderHealthAuthority.getStatus(provider);
        if (status.isHalfOpen) {
            ProviderHealthAuthority.markHalfOpenRequestStarted(provider);
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
        } finally {
            // Clean up half-open tracking
            if (status.isHalfOpen) {
                ProviderHealthAuthority.markHalfOpenRequestCompleted(provider);
            }
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