/**
 * Fallback Health Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    initializeHealthTracking,
    recordProviderSuccess,
    recordProviderFailure,
    isProviderBlacklisted,
    blacklistProvider,
    removeProviderFromBlacklist,
    getProviderHealth,
    getProviderHealthStatus,
    getBlacklistStatus
} from '../../../js/services/fallback/health.js';

// Mock ProviderHealthAuthority
vi.mock('../../../js/services/provider-health-authority.js', () => {
    const providerStatus = new Map();

    const mockAuthority = {
        getStatus: vi.fn((provider) => {
            if (!providerStatus.has(provider)) {
                return {
                    healthStatus: 'UNKNOWN',
                    totalSuccesses: 0,
                    totalFailures: 0,
                    avgLatencyMs: 0,
                    lastSuccessTime: 0,
                    lastFailureTime: 0,
                    isBlacklisted: false,
                    blacklistExpiry: null
                };
            }
            return providerStatus.get(provider);
        }),
        recordSuccess: vi.fn((provider, latencyMs) => {
            const status = providerStatus.get(provider);
            if (status) {
                status.totalSuccesses++;
                status.lastSuccessTime = Date.now();
                status.avgLatencyMs = status.avgLatencyMs === 0
                    ? latencyMs
                    : (status.avgLatencyMs * 0.9) + (latencyMs * 0.1);
                status.successRate = status.totalSuccesses / (status.totalSuccesses + status.totalFailures);
            }
        }),
        recordFailure: vi.fn((provider, error) => {
            const status = providerStatus.get(provider);
            if (status) {
                status.totalFailures++;
                status.lastFailureTime = Date.now();
                status.successRate = status.totalSuccesses / (status.totalSuccesses + status.totalFailures);
            }
        }),
        blacklist: vi.fn((provider, durationMs) => {
            const status = providerStatus.get(provider);
            if (status) {
                status.isBlacklisted = true;
                status.blacklistExpiry = Date.now() + durationMs;
                status.healthStatus = 'BLACKLISTED';
            }
        }),
        unblacklist: vi.fn((provider) => {
            const status = providerStatus.get(provider);
            if (status) {
                status.isBlacklisted = false;
                status.blacklistExpiry = null;
                status.healthStatus = 'UNKNOWN';
            }
        }),
        isBlacklisted: vi.fn((provider) => {
            const status = providerStatus.get(provider);
            return status ? status.isBlacklisted : false;
        }),
        _setStatus: (provider, status) => providerStatus.set(provider, status),
        _clearStatus: () => providerStatus.clear()
    };

    return {
        ProviderHealthAuthority: mockAuthority,
        HealthStatus: {
            HEALTHY: 'HEALTHY',
            DEGRADED: 'DEGRADED',
            UNKNOWN: 'UNKNOWN',
            UNHEALTHY: 'UNHEALTHY',
            BLACKLISTED: 'BLACKLISTED'
        }
    };
});

describe('fallback/health', () => {
    let mockAuthority;
    let providerConfigs;
    let health;
    let blacklist;

    beforeEach(async () => {
        const { ProviderHealthAuthority } = await import('../../../js/services/provider-health-authority.js');
        mockAuthority = ProviderHealthAuthority;
        mockAuthority._clearStatus();

        // Setup provider configs
        providerConfigs = new Map();
        providerConfigs.set('openrouter', { name: 'openrouter' });
        providerConfigs.set('lmstudio', { name: 'lmstudio' });
        providerConfigs.set('ollama', { name: 'ollama' });
        providerConfigs.set('fallback', { name: 'fallback' });

        // Initialize with default statuses
        mockAuthority._setStatus('openrouter', {
            healthStatus: 'HEALTHY',
            totalSuccesses: 10,
            totalFailures: 2,
            avgLatencyMs: 500,
            lastSuccessTime: Date.now(),
            lastFailureTime: Date.now() - 10000,
            isBlacklisted: false,
            blacklistExpiry: null,
            successRate: 0.83
        });

        health = initializeHealthTracking(providerConfigs);
        blacklist = new Map();
    });

    describe('initializeHealthTracking', () => {
        it('should initialize health tracking for all providers', () => {
            expect(health.size).toBe(4);
            expect(health.has('openrouter')).toBe(true);
            expect(health.has('lmstudio')).toBe(true);
            expect(health.has('ollama')).toBe(true);
            expect(health.has('fallback')).toBe(true);
        });

        it('should copy data from ProviderHealthAuthority', () => {
            const openrouterHealth = health.get('openrouter');

            expect(openrouterHealth.provider).toBe('openrouter');
            expect(openrouterHealth.health).toBe('HEALTHY');
            expect(openrouterHealth.successCount).toBe(10);
            expect(openrouterHealth.failureCount).toBe(2);
            expect(openrouterHealth.avgLatencyMs).toBe(500);
        });

        it('should handle providers with no authority data', () => {
            const ollamaHealth = health.get('ollama');

            expect(ollamaHealth.health).toBe('UNKNOWN');
            expect(ollamaHealth.successCount).toBe(0);
            expect(ollamaHealth.failureCount).toBe(0);
        });
    });

    describe('recordProviderSuccess', () => {
        it('should record success metrics', () => {
            const initialSuccessCount = health.get('openrouter').successCount;

            recordProviderSuccess(health, 'openrouter', 750);

            const updatedHealth = health.get('openrouter');
            expect(updatedHealth.successCount).toBe(initialSuccessCount + 1);
            expect(updatedHealth.lastSuccessTime).toBeGreaterThan(0);
            expect(mockAuthority.recordSuccess).toHaveBeenCalledWith('openrouter', 750);
        });

        it('should update average latency', () => {
            recordProviderSuccess(health, 'openrouter', 750);

            const updatedHealth = health.get('openrouter');
            expect(updatedHealth.avgLatencyMs).toBeGreaterThan(0);
            expect(updatedHealth.avgLatencyMs).toBeLessThan(750); // Weighted average
        });

        it('should decrease failure count on success', () => {
            const initialFailureCount = health.get('openrouter').failureCount;

            recordProviderSuccess(health, 'openrouter', 100);

            const updatedHealth = health.get('openrouter');
            expect(updatedHealth.failureCount).toBeLessThanOrEqual(initialFailureCount);
        });
    });

    describe('recordProviderFailure', () => {
        it('should record failure metrics', () => {
            const initialFailureCount = health.get('openrouter').failureCount;
            const error = new Error('Test error');

            recordProviderFailure(health, 'openrouter', error, blacklist, 300000);

            const updatedHealth = health.get('openrouter');
            expect(updatedHealth.failureCount).toBe(initialFailureCount + 1);
            expect(updatedHealth.lastFailureTime).toBeGreaterThan(0);
            expect(mockAuthority.recordFailure).toHaveBeenCalledWith('openrouter', error);
        });
    });

    describe('isProviderBlacklisted', () => {
        it('should check blacklist status via authority', () => {
            mockAuthority.isBlacklisted.mockReturnValue(true);

            const isBlacklisted = isProviderBlacklisted('openrouter');

            expect(isBlacklisted).toBe(true);
            expect(mockAuthority.isBlacklisted).toHaveBeenCalledWith('openrouter');
        });

        it('should return false for non-blacklisted provider', () => {
            mockAuthority.isBlacklisted.mockReturnValue(false);

            const isBlacklisted = isProviderBlacklisted('lmstudio');

            expect(isBlacklisted).toBe(false);
        });
    });

    describe('blacklistProvider', () => {
        it('should blacklist provider via authority', () => {
            blacklistProvider(health, blacklist, 'openrouter', 60000);

            expect(mockAuthority.blacklist).toHaveBeenCalledWith('openrouter', 60000);
            expect(blacklist.has('openrouter')).toBe(true);
        });

        it('should update local health record', () => {
            blacklistProvider(health, blacklist, 'lmstudio', 120000);

            const healthRecord = health.get('lmstudio');
            expect(healthRecord.health).toBe('BLACKLISTED');
            expect(healthRecord.blacklistExpiry).toBeDefined();
        });

        it('should store blacklist expiry in blacklist map', () => {
            const duration = 60000;
            const beforeBlacklist = Date.now();

            blacklistProvider(health, blacklist, 'ollama', duration);

            const expiry = blacklist.get('ollama');
            expect(expiry).toBeDefined();
            expect(expiry).toBeGreaterThan(beforeBlacklist);
        });
    });

    describe('removeProviderFromBlacklist', () => {
        it('should unblacklist provider via authority', () => {
            // First blacklist
            blacklistProvider(health, blacklist, 'openrouter', 60000);

            // Then unblacklist
            removeProviderFromBlacklist(health, blacklist, 'openrouter');

            expect(mockAuthority.unblacklist).toHaveBeenCalledWith('openrouter');
            expect(blacklist.has('openrouter')).toBe(false);
        });

        it('should update local health record', () => {
            // First blacklist
            blacklistProvider(health, blacklist, 'lmstudio', 60000);

            // Then unblacklist
            removeProviderFromBlacklist(health, blacklist, 'lmstudio');

            const healthRecord = health.get('lmstudio');
            expect(healthRecord.blacklistExpiry).toBeNull();
        });
    });

    describe('getProviderHealth', () => {
        it('should return copy of health map', () => {
            const healthCopy = getProviderHealth(health);

            expect(healthCopy).toBeInstanceOf(Map);
            expect(healthCopy.size).toBe(health.size);
            expect(healthCopy).not.toBe(health); // Different reference
        });

        it('should include all provider health records', () => {
            const healthCopy = getProviderHealth(health);

            expect(healthCopy.get('openrouter')).toBeDefined();
            expect(healthCopy.get('lmstudio')).toBeDefined();
            expect(healthCopy.get('ollama')).toBeDefined();
            expect(healthCopy.get('fallback')).toBeDefined();
        });
    });

    describe('getProviderHealthStatus', () => {
        it('should return health record for provider', () => {
            const status = getProviderHealthStatus(health, 'openrouter');

            expect(status).toBeDefined();
            expect(status.provider).toBe('openrouter');
            expect(status.health).toBeDefined();
        });

        it('should return null for unknown provider', () => {
            const status = getProviderHealthStatus(health, 'unknown');

            expect(status).toBeNull();
        });
    });

    describe('getBlacklistStatus', () => {
        it('should return copy of blacklist map', () => {
            blacklistProvider(health, blacklist, 'openrouter', 60000);

            const blacklistCopy = getBlacklistStatus(blacklist);

            expect(blacklistCopy).toBeInstanceOf(Map);
            expect(blacklistCopy.size).toBe(blacklist.size);
            expect(blacklistCopy).not.toBe(blacklist); // Different reference
        });

        it('should return empty map when no providers blacklisted', () => {
            const blacklistCopy = getBlacklistStatus(blacklist);

            expect(blacklistCopy.size).toBe(0);
        });

        it('should include blacklisted providers', () => {
            blacklistProvider(health, blacklist, 'openrouter', 60000);
            blacklistProvider(health, blacklist, 'lmstudio', 120000);

            const blacklistCopy = getBlacklistStatus(blacklist);

            expect(blacklistCopy.has('openrouter')).toBe(true);
            expect(blacklistCopy.has('lmstudio')).toBe(true);
            expect(blacklistCopy.size).toBe(2);
        });
    });
});
