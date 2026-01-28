/**
 * Fallback Chain Priority Scoring
 *
 * Dynamic provider priority ordering based on health status,
 * circuit breaker state, latency, and success rate.
 *
 * @module fallback/priority
 */

import { ProviderHealthAuthority, HealthStatus } from '../provider-health-authority.js';

/**
 * Get provider priority order with dynamic health-based scoring
 *
 * Providers are scored based on:
 * - Health status (healthy > degraded > unknown > unhealthy/blacklisted)
 * - Circuit breaker state (closed > half_open > open)
 * - Average latency (lower is better)
 * - Success rate (higher is better)
 * - Base priority (configured priority as tiebreaker)
 *
 * @param {Map<string, *>} providerConfigs - Provider configurations
 * @param {string} primaryProvider - Primary provider to start with (gets priority boost)
 * @returns {string[]} Ordered list of provider names (best first)
 */
export function getProviderPriorityOrder(providerConfigs, primaryProvider) {
    const providers = Array.from(providerConfigs.values());

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

    // Log the dynamic ordering
    if (scoredProviders.length > 0) {
        const orderSummary = scoredProviders
            .map(p => `${p.name}(${p.score.toFixed(1)})`)
            .join(' > ');
        console.log(`[ProviderFallbackChain] Dynamic provider order: ${orderSummary}`);
    }

    return scoredProviders.map(p => p.name);
}
