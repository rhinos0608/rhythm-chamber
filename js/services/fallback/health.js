/**
 * Fallback Chain Health Tracking
 *
 * Manages provider health records, blacklist state, and
 * coordinates with ProviderHealthAuthority.
 *
 * @module fallback/health
 */

import { ProviderHealthAuthority, HealthStatus } from '../provider-health-authority.js';

/**
 * Provider health record
 * @typedef {Object} ProviderHealthRecord
 * @property {string} provider - Provider name
 * @property {HealthStatus} health - Current health status
 * @property {number} successCount - Number of successful requests
 * @property {number} failureCount - Number of failed requests
 * @property {number} avgLatencyMs - Average latency in milliseconds
 * @property {number} lastSuccessTime - Last successful request timestamp
 * @property {number} lastFailureTime - Last failed request timestamp
 * @property {string|null} blacklistExpiry - Blacklist expiry timestamp
 */

/**
 * Create health tracking map from provider configs
 * @param {Map<string, *>} providerConfigs - Provider configurations
 * @returns {Map<string, ProviderHealthRecord>}
 */
export function initializeHealthTracking(providerConfigs) {
    const health = new Map();

    for (const [name] of providerConfigs) {
        const authorityStatus = ProviderHealthAuthority.getStatus(name);

        health.set(name, {
            provider: name,
            health: authorityStatus.healthStatus || HealthStatus.UNKNOWN,
            successCount: authorityStatus.totalSuccesses || 0,
            failureCount: authorityStatus.totalFailures || 0,
            avgLatencyMs: authorityStatus.avgLatencyMs || 0,
            lastSuccessTime: authorityStatus.lastSuccessTime || 0,
            lastFailureTime: authorityStatus.lastFailureTime || 0,
            blacklistExpiry: authorityStatus.blacklistExpiry
                ? new Date(authorityStatus.blacklistExpiry).toISOString()
                : null,
        });
    }

    return health;
}

/**
 * Record successful provider request
 * @param {Map<string, ProviderHealthRecord>} health - Health tracking map
 * @param {string} providerName - Provider name
 * @param {number} latencyMs - Request latency in milliseconds
 */
export function recordProviderSuccess(health, providerName, latencyMs) {
    // Delegate to ProviderHealthAuthority - single source of truth
    ProviderHealthAuthority.recordSuccess(providerName, latencyMs);

    // Update local cache for backwards compatibility
    const healthRecord = health.get(providerName);
    if (healthRecord) {
        healthRecord.successCount++;
        healthRecord.lastSuccessTime = Date.now();
        healthRecord.avgLatencyMs =
            healthRecord.avgLatencyMs === 0
                ? latencyMs
                : healthRecord.avgLatencyMs * 0.9 + latencyMs * 0.1;
        healthRecord.failureCount = Math.max(0, healthRecord.failureCount - 1);
        healthRecord.health = ProviderHealthAuthority.getStatus(providerName).healthStatus;
    }
}

/**
 * Record failed provider request
 * @param {Map<string, ProviderHealthRecord>} health - Health tracking map
 * @param {string} providerName - Provider name
 * @param {Error} error - Error that occurred
 * @param {Map<string, number>} blacklist - Blacklist map
 * @param {number} blacklistDurationMs - Default blacklist duration
 */
export function recordProviderFailure(health, providerName, error, blacklist, blacklistDurationMs) {
    // Delegate to ProviderHealthAuthority - single source of truth
    ProviderHealthAuthority.recordFailure(providerName, error);

    // Update local cache for backwards compatibility
    const healthRecord = health.get(providerName);
    if (healthRecord) {
        healthRecord.failureCount++;
        healthRecord.lastFailureTime = Date.now();
        healthRecord.health = ProviderHealthAuthority.getStatus(providerName).healthStatus;

        // Sync blacklist state from authority
        const status = ProviderHealthAuthority.getStatus(providerName);
        if (status.isBlacklisted) {
            blacklist.set(providerName, status.blacklistExpiry);
            healthRecord.blacklistExpiry = new Date(status.blacklistExpiry).toISOString();
        }
    }
}

/**
 * Check if provider is blacklisted
 * @param {string} providerName - Provider name
 * @returns {boolean}
 */
export function isProviderBlacklisted(providerName) {
    return ProviderHealthAuthority.isBlacklisted(providerName);
}

/**
 * Blacklist a provider temporarily
 * @param {Map<string, ProviderHealthRecord>} health - Health tracking map
 * @param {Map<string, number>} blacklist - Blacklist map
 * @param {string} providerName - Provider name
 * @param {number} durationMs - Blacklist duration in milliseconds
 */
export function blacklistProvider(health, blacklist, providerName, durationMs) {
    // Delegate to ProviderHealthAuthority - single source of truth
    ProviderHealthAuthority.blacklist(providerName, durationMs);

    // Update local cache for backwards compatibility
    const expiry = Date.now() + durationMs;
    blacklist.set(providerName, expiry);

    const healthRecord = health.get(providerName);
    if (healthRecord) {
        healthRecord.health = HealthStatus.BLACKLISTED;
        healthRecord.blacklistExpiry = new Date(expiry).toISOString();
    }

    console.warn(
        `[ProviderFallbackChain] Blacklisted ${providerName} for ${durationMs}ms (via ProviderHealthAuthority)`
    );
}

/**
 * Remove provider from blacklist
 * @param {Map<string, ProviderHealthRecord>} health - Health tracking map
 * @param {Map<string, number>} blacklist - Blacklist map
 * @param {string} providerName - Provider name
 */
export function removeProviderFromBlacklist(health, blacklist, providerName) {
    // Delegate to ProviderHealthAuthority - single source of truth
    ProviderHealthAuthority.unblacklist(providerName);

    // Update local cache for backwards compatibility
    blacklist.delete(providerName);

    const healthRecord = health.get(providerName);
    if (healthRecord) {
        healthRecord.health = ProviderHealthAuthority.getStatus(providerName).healthStatus;
        healthRecord.blacklistExpiry = null;
    }

    console.log(
        `[ProviderFallbackChain] Removed ${providerName} from blacklist (via ProviderHealthAuthority)`
    );
}

/**
 * Get health status for all providers
 * @param {Map<string, ProviderHealthRecord>} health - Health tracking map
 * @returns {Map<string, ProviderHealthRecord>}
 */
export function getProviderHealth(health) {
    return new Map(health);
}

/**
 * Get health status for specific provider
 * @param {Map<string, ProviderHealthRecord>} health - Health tracking map
 * @param {string} providerName - Provider name
 * @returns {ProviderHealthRecord|null}
 */
export function getProviderHealthStatus(health, providerName) {
    return health.get(providerName) || null;
}

/**
 * Get blacklist status
 * @param {Map<string, number>} blacklist - Blacklist map
 * @returns {Map<string, number>}
 */
export function getBlacklistStatus(blacklist) {
    return new Map(blacklist);
}
