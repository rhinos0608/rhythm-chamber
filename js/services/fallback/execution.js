/**
 * Fallback Chain Execution
 *
 * Executes provider calls with automatic fallback and circuit
 * breaker coordination.
 *
 * @module fallback/execution
 */

import { ProviderHealthAuthority } from '../provider-health-authority.js';
import { ProviderInterface } from '../../providers/provider-interface.js';
import { getProviderPriorityOrder } from './priority.js';
import { recordProviderSuccess, recordProviderFailure, isProviderBlacklisted } from './health.js';
import { generateFallbackResponse } from './fallback-response.js';

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
 * Execute LLM call with automatic provider fallback
 * @param {Map<string, *>} providerConfigs - Provider configurations
 * @param {Map<string, *>} health - Health tracking map
 * @param {Map<string, number>} blacklist - Blacklist map
 * @param {number} blacklistDurationMs - Default blacklist duration
 * @param {Object} options - Call options
 * @param {string} options.provider - Primary provider to try
 * @param {string} options.apiKey - API key for provider
 * @param {Array} options.messages - Chat messages
 * @param {Array} options.tools - Function calling tools
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<FallbackChainResult>}
 */
export async function executeWithFallback(
    providerConfigs,
    health,
    blacklist,
    blacklistDurationMs,
    { provider, apiKey, messages, tools, onProgress }
) {
    performance.mark('provider-fallback-chain-start');

    const attempts = [];
    const providersToTry = getProviderPriorityOrder(providerConfigs, provider);

    for (const providerName of providersToTry) {
        // Skip blacklisted providers
        if (await isProviderBlacklisted(providerName)) {
            console.log(`[ProviderFallbackChain] Skipping blacklisted provider: ${providerName}`);
            attempts.push({
                provider: providerName,
                success: false,
                latencyMs: 0,
                error: new Error('Provider blacklisted'),
                timestamp: Date.now(),
            });
            continue;
        }

        // Execute provider call with atomic circuit breaker protection
        try {
            const result = await executeProviderWithCircuitBreaker(
                providerConfigs,
                health,
                blacklistDurationMs,
                { provider: providerName, apiKey, messages, tools, onProgress }
            );

            if (result.success) {
                attempts.push({
                    provider: providerName,
                    success: true,
                    latencyMs: result.latencyMs,
                    error: null,
                    timestamp: Date.now(),
                });

                performance.measure(
                    'provider-fallback-chain-success',
                    'provider-fallback-chain-start'
                );

                return {
                    success: true,
                    provider: providerName,
                    attemptsCount: attempts.length,
                    attempts,
                    response: result.response,
                };
            } else {
                attempts.push({
                    provider: providerName,
                    success: false,
                    latencyMs: result.latencyMs,
                    error: result.error,
                    timestamp: Date.now(),
                });

                console.error(
                    `[ProviderFallbackChain] Provider ${providerName} failed:`,
                    result.error?.message
                );

                // Continue to next provider
                continue;
            }
        } catch (error) {
            attempts.push({
                provider: providerName,
                success: false,
                latencyMs: 0,
                error,
                timestamp: Date.now(),
            });

            console.error(
                `[ProviderFallbackChain] Provider ${providerName} failed with exception:`,
                error.message
            );

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
        error: new Error('All providers failed'),
    };
}

/**
 * Execute provider call with atomic circuit breaker protection
 * This method combines circuit breaker check, execution, and recording
 * to prevent TOCTOU (Time-Of-Check-Time-Of-Use) race conditions.
 * @private
 * @param {Map<string, *>} providerConfigs - Provider configurations
 * @param {Map<string, *>} health - Health tracking map
 * @param {number} blacklistDurationMs - Default blacklist duration
 * @param {Object} options - Call options
 * @returns {Promise<Object>} Result object with success, latencyMs, response, error
 */
async function executeProviderWithCircuitBreaker(
    providerConfigs,
    health,
    blacklistDurationMs,
    { provider, apiKey, messages, tools, onProgress }
) {
    const startTime = performance.now();

    // Check circuit breaker status using ProviderHealthAuthority
    const checkResult = ProviderHealthAuthority.canExecute(provider);
    if (!checkResult.allowed) {
        return {
            success: false,
            latencyMs: 0,
            error: new Error(checkResult.reason),
            response: null,
        };
    }

    // Track half-open request if applicable
    const status = ProviderHealthAuthority.getStatus(provider);
    if (status.isHalfOpen) {
        ProviderHealthAuthority.markHalfOpenRequestStarted(provider);
    }

    try {
        // Execute provider call
        const response = await executeProviderCall(providerConfigs, {
            provider,
            apiKey,
            messages,
            tools,
            onProgress,
        });

        const latencyMs = performance.now() - startTime;

        // Record success (atomic with execution)
        recordProviderSuccess(health, provider, latencyMs);

        return {
            success: true,
            latencyMs,
            response,
            error: null,
        };
    } catch (error) {
        const latencyMs = performance.now() - startTime;

        // Record failure (atomic with execution)
        recordProviderFailure(health, provider, error, new Map(), blacklistDurationMs);

        return {
            success: false,
            latencyMs,
            error,
            response: null,
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
 * @param {Map<string, *>} providerConfigs - Provider configurations
 * @param {Object} options - Call options
 * @returns {Promise<Object>} Provider response
 */
async function executeProviderCall(
    providerConfigs,
    { provider, apiKey, messages, tools, onProgress }
) {
    // Fallback provider returns static response
    if (provider === 'fallback') {
        return generateFallbackResponse(messages);
    }

    // Build provider configuration
    const config = providerConfigs.get(provider);
    if (!config) {
        throw new Error(`Unknown provider: ${provider}`);
    }

    const providerConfig = await ProviderInterface.buildProviderConfig(provider, { apiKey });

    // Execute provider call with timeout
    let timeoutId = null;
    try {
        const response = await Promise.race([
            ProviderInterface.callProvider(providerConfig, apiKey, messages, tools, onProgress),
            new Promise((_, reject) => {
                timeoutId = setTimeout(
                    () => reject(new Error('Provider timeout')),
                    config.timeoutMs
                );
            }),
        ]);
        return response;
    } finally {
        // CRITICAL: Clear timeout to prevent memory leak
        // Rejected promises in race hold reference to timeout
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
    }
}
