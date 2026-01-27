/**
 * Provider Health Monitor Tests
 *
 * Comprehensive test suite for provider health monitoring system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderHealthMonitor, HealthStatus } from '../../js/services/provider-health-monitor.js';

// Mock EventBus
vi.mock('../../js/services/event-bus.js', () => ({
    EventBus: {
        on: vi.fn(),
        emit: vi.fn()
    }
}));

// Mock ProviderHealthAuthority
vi.mock('../../js/services/provider-health-authority.js', () => ({
    ProviderHealthAuthority: {
        getProviderSnapshot: vi.fn(() => ({
            provider: 'test',
            status: 'unknown',
            successCount: 0,
            failureCount: 0,
            avgLatencyMs: 0,
            lastSuccessTime: 0,
            lastFailureTime: 0,
            blacklistExpiry: null,
            circuitState: 'closed',
            cooldownRemaining: 0
        })),
        getHealthSummary: vi.fn(() => ({
            total: 4,
            healthy: 0,
            degraded: 0,
            unhealthy: 0,
            blacklisted: 0,
            unknown: 4,
            overallStatus: 'unknown'
        }))
    },
    HealthStatus: {
        HEALTHY: 'healthy',
        DEGRADED: 'degraded',
        UNHEALTHY: 'unhealthy',
        BLACKLISTED: 'blacklisted',
        UNKNOWN: 'unknown'
    }
}));

describe('ProviderHealthMonitor', () => {
    let monitor;

    beforeEach(() => {
        // Create fresh instance for each test
        monitor = new ProviderHealthMonitor();
    });

    afterEach(() => {
        monitor.stopMonitoring();
    });

    describe('Initialization', () => {
        it('should initialize with default providers', () => {
            const snapshot = monitor.getHealthSnapshot();
            expect(snapshot).toHaveProperty('openrouter');
            expect(snapshot).toHaveProperty('ollama');
            expect(snapshot).toHaveProperty('lmstudio');
            expect(snapshot).toHaveProperty('fallback');
        });

        it('should initialize all providers with unknown status', () => {
            const snapshot = monitor.getHealthSnapshot();
            for (const provider of Object.values(snapshot)) {
                expect(provider.status).toBe(HealthStatus.UNKNOWN);
            }
        });
    });

    describe('Health Data Management', () => {
        it('should return health data for specific provider', () => {
            const health = monitor.getProviderHealth('openrouter');
            expect(health).not.toBeNull();
            expect(health.provider).toBe('openrouter');
        });

        it('should return null for unknown provider', () => {
            const health = monitor.getProviderHealth('unknown_provider');
            expect(health).toBeNull();
        });

        it('should provide health summary', () => {
            const summary = monitor.getHealthSummary();
            expect(summary).toHaveProperty('total');
            expect(summary).toHaveProperty('healthy');
            expect(summary).toHaveProperty('degraded');
            expect(summary).toHaveProperty('unhealthy');
            expect(summary).toHaveProperty('blacklisted');
            expect(summary).toHaveProperty('unknown');
            expect(summary).toHaveProperty('overallStatus');
        });
    });

    describe('Health Status Mapping', () => {
        it('should map healthy status correctly', () => {
            monitor._updateHealthFromEvent({ provider: 'openrouter', health: 'healthy' });
            const health = monitor.getProviderHealth('openrouter');
            expect(health.status).toBe(HealthStatus.HEALTHY);
        });

        it('should map degraded status correctly', () => {
            monitor._updateHealthFromEvent({ provider: 'ollama', health: 'degraded' });
            const health = monitor.getProviderHealth('ollama');
            expect(health.status).toBe(HealthStatus.DEGRADED);
        });

        it('should map unhealthy status correctly', () => {
            monitor._updateHealthFromEvent({ provider: 'lmstudio', health: 'unhealthy' });
            const health = monitor.getProviderHealth('lmstudio');
            expect(health.status).toBe(HealthStatus.UNHEALTHY);
        });

        it('should map blacklisted status correctly', () => {
            monitor._handleProviderBlacklisted({
                provider: 'openrouter',
                expiry: new Date(Date.now() + 300000).toISOString()
            });
            const health = monitor.getProviderHealth('openrouter');
            expect(health.status).toBe(HealthStatus.BLACKLISTED);
        });
    });

    describe('Circuit Breaker Integration', () => {
        it('should handle circuit breaker tripped', () => {
            monitor._handleCircuitBreakerTripped({ provider: 'ollama' });
            const health = monitor.getProviderHealth('ollama');
            expect(health.status).toBe(HealthStatus.UNHEALTHY);
            expect(health.circuitState).toBe('open');
        });

        it('should handle circuit breaker recovered', () => {
            monitor._handleCircuitBreakerRecovered({ provider: 'lmstudio' });
            const health = monitor.getProviderHealth('lmstudio');
            expect(health.status).toBe(HealthStatus.HEALTHY);
            expect(health.circuitState).toBe('closed');
        });
    });

    describe('Blacklist Management', () => {
        it('should handle provider blacklisted', () => {
            const expiry = new Date(Date.now() + 300000).toISOString();
            monitor._handleProviderBlacklisted({ provider: 'openrouter', expiry });
            const health = monitor.getProviderHealth('openrouter');
            expect(health.status).toBe(HealthStatus.BLACKLISTED);
            expect(health.blacklistExpiry).toBe(expiry);
        });

        it('should handle provider unblacklisted', () => {
            monitor._handleProviderBlacklisted({
                provider: 'ollama',
                expiry: new Date(Date.now() + 300000).toISOString()
            });
            monitor._handleProviderUnblacklisted({ provider: 'ollama' });
            const health = monitor.getProviderHealth('ollama');
            expect(health.status).toBe(HealthStatus.UNKNOWN);
            expect(health.blacklistExpiry).toBeNull();
        });
    });

    describe('UI Callbacks', () => {
        it('should register UI callback', () => {
            const callback = vi.fn();
            monitor.onHealthUpdate(callback);
            expect(monitor._uiCallbacks).toContain(callback);
        });

        it('should unregister UI callback', () => {
            const callback = vi.fn();
            monitor.onHealthUpdate(callback);
            monitor.offHealthUpdate(callback);
            expect(monitor._uiCallbacks).not.toContain(callback);
        });

        it('should notify UI callbacks on health update', () => {
            const callback = vi.fn();
            monitor.onHealthUpdate(callback);
            monitor._updateHealthFromEvent({ provider: 'openrouter', health: 'healthy' });
            expect(callback).toHaveBeenCalled();
        });

        it('should handle callback errors gracefully', () => {
            const errorCallback = vi.fn(() => {
                throw new Error('Callback error');
            });
            const successCallback = vi.fn();
            monitor.onHealthUpdate(errorCallback);
            monitor.onHealthUpdate(successCallback);
            monitor._updateHealthFromEvent({ provider: 'openrouter', health: 'healthy' });
            expect(successCallback).toHaveBeenCalled();
        });
    });

    describe('Recommended Actions', () => {
        it('should recommend switching for unhealthy provider', () => {
            monitor._updateHealthFromEvent({ provider: 'openrouter', health: 'unhealthy' });
            const action = monitor.getRecommendedAction('openrouter');
            expect(action.action).toBe('switch');
            expect(action.canSwitch).toBe(true);
        });

        it('should recommend waiting for blacklisted provider', () => {
            const expiry = new Date(Date.now() + 300000).toISOString();
            monitor._handleProviderBlacklisted({ provider: 'ollama', expiry });
            const action = monitor.getRecommendedAction('ollama');
            expect(action.action).toBe('wait');
            expect(action.canSwitch).toBe(true);
        });

        it('should recommend optional switch for degraded provider', () => {
            monitor._updateHealthFromEvent({ provider: 'lmstudio', health: 'degraded' });
            const action = monitor.getRecommendedAction('lmstudio');
            expect(action.action).toBe('optional_switch');
            expect(action.canSwitch).toBe(true);
        });

        it('should recommend testing for unknown provider', () => {
            const action = monitor.getRecommendedAction('openrouter');
            expect(action.action).toBe('test');
            expect(action.canSwitch).toBe(false);
        });

        it('should recommend no action for healthy provider', () => {
            monitor._updateHealthFromEvent({ provider: 'fallback', health: 'healthy' });
            const action = monitor.getRecommendedAction('fallback');
            expect(action.action).toBe('none');
            expect(action.canSwitch).toBe(false);
        });
    });

    describe('Health Summary Calculation', () => {
        it('should calculate overall status as healthy when all providers healthy', () => {
            monitor._updateHealthFromEvent({ provider: 'openrouter', health: 'healthy' });
            monitor._updateHealthFromEvent({ provider: 'ollama', health: 'healthy' });
            monitor._updateHealthFromEvent({ provider: 'lmstudio', health: 'healthy' });
            monitor._updateHealthFromEvent({ provider: 'fallback', health: 'healthy' });
            const summary = monitor.getHealthSummary();
            expect(summary.overallStatus).toBe(HealthStatus.HEALTHY);
        });

        it('should calculate overall status as unhealthy when any provider blacklisted', () => {
            monitor._updateHealthFromEvent({ provider: 'openrouter', health: 'healthy' });
            monitor._handleProviderBlacklisted({
                provider: 'ollama',
                expiry: new Date(Date.now() + 300000).toISOString()
            });
            const summary = monitor.getHealthSummary();
            expect(summary.overallStatus).toBe(HealthStatus.UNHEALTHY);
        });

        it('should calculate overall status as degraded when any provider degraded', () => {
            monitor._updateHealthFromEvent({ provider: 'openrouter', health: 'healthy' });
            monitor._updateHealthFromEvent({ provider: 'ollama', health: 'degraded' });
            monitor._updateHealthFromEvent({ provider: 'lmstudio', health: 'healthy' });
            const summary = monitor.getHealthSummary();
            expect(summary.overallStatus).toBe(HealthStatus.DEGRADED);
        });
    });

    describe('Monitoring Lifecycle', () => {
        it('should start monitoring on initialization', () => {
            expect(monitor._updateIntervalId).not.toBeNull();
        });

        it('should stop monitoring when requested', () => {
            monitor.stopMonitoring();
            expect(monitor._updateIntervalId).toBeNull();
        });

        it('should restart monitoring after stop', () => {
            monitor.stopMonitoring();
            monitor._startMonitoring();
            expect(monitor._updateIntervalId).not.toBeNull();
        });
    });

    describe('Data Privacy', () => {
        it('should return copy of health snapshot', () => {
            const snapshot1 = monitor.getHealthSnapshot();
            const snapshot2 = monitor.getHealthSnapshot();
            expect(snapshot1).not.toBe(snapshot2);
            expect(snapshot1.openrouter).toEqual(snapshot2.openrouter);
        });

        it('should not expose internal callbacks array', () => {
            expect(monitor._uiCallbacks).toBeInstanceOf(Array);
            expect(monitor._uiCallbacks).not.toBe(monitor.getHealthSnapshot());
        });
    });

    describe('TD-15: Timeout Error Handling', () => {
        let TimeoutError;

        beforeEach(async () => {
            // Import TimeoutError for testing
            const module = await import('../../js/services/timeout-error.js');
            TimeoutError = module.TimeoutError;
        });

        it('should get timeout action for retryable timeout', () => {
            const error = new TimeoutError('Request timed out', {
                timeout: 60000,
                timeoutType: 'read',
                retryable: true,
                retryAfter: 2000
            });

            const action = monitor.getTimeoutAction(error, 'openrouter');

            expect(action.action).toBe('retry');
            expect(action.canRetry).toBe(true);
            expect(action.retryAfter).toBe(2000);
            expect(action.timeoutType).toBe('read');
            expect(action.message).toBeTruthy();
        });

        it('should get timeout action for non-retryable timeout', () => {
            const error = new TimeoutError('Request timed out', {
                timeout: 60000,
                timeoutType: 'connection',
                retryable: false
            });

            const action = monitor.getTimeoutAction(error, 'ollama');

            expect(action.action).toBe('contact_support');
            expect(action.canRetry).toBe(false);
        });

        it('should handle generic timeout-related errors', () => {
            const error = new Error('Request timed out after 30s');

            const action = monitor.getTimeoutAction(error, 'lmstudio');

            expect(action.action).toBe('retry');
            expect(action.canRetry).toBe(true);
            expect(action.message).toContain('lmstudio');
            expect(action.message).toContain('timed out');
        });

        it('should handle non-timeout errors', () => {
            const error = new Error('Something went wrong');

            const action = monitor.getTimeoutAction(error, 'fallback');

            expect(action.action).toBe('none');
            expect(action.canRetry).toBe(false);
            expect(action.message).toContain('Something went wrong');
        });

        it('should record timeout error for provider', () => {
            const error = new TimeoutError('Request timed out', {
                timeout: 60000,
                timeoutType: 'read',
                retryable: true
            });

            monitor.recordTimeoutError('openrouter', error);

            const health = monitor.getProviderHealth('openrouter');
            expect(health.failureCount).toBeGreaterThan(0);
            expect(health.lastFailureTime).toBeGreaterThan(0);
        });

        it('should mark provider as unhealthy after non-retryable timeout', () => {
            const error = new TimeoutError('Request timed out', {
                timeout: 60000,
                timeoutType: 'connection',
                retryable: false
            });

            monitor.recordTimeoutError('ollama', error);

            const health = monitor.getProviderHealth('ollama');
            expect(health.status).toBe(HealthStatus.UNHEALTHY);
        });

        it('should mark provider as degraded after multiple retryable timeouts', () => {
            const error = new TimeoutError('Request timed out', {
                timeout: 60000,
                timeoutType: 'read',
                retryable: true
            });

            // Record 3 timeouts
            monitor.recordTimeoutError('lmstudio', error);
            monitor.recordTimeoutError('lmstudio', error);
            monitor.recordTimeoutError('lmstudio', error);

            const health = monitor.getProviderHealth('lmstudio');
            expect(health.status).toBe(HealthStatus.DEGRADED);
        });

        it('should emit PROVIDER:TIMEOUT event when recording timeout', async () => {
            const { EventBus } = await import('../../js/services/event-bus.js');
            const emitSpy = vi.fn();
            EventBus.emit = emitSpy;

            const error = new TimeoutError('Request timed out', {
                timeout: 60000,
                timeoutType: 'connection',
                retryable: true,
                retryAfter: 2000
            });

            monitor.recordTimeoutError('openrouter', error);

            expect(emitSpy).toHaveBeenCalledWith('PROVIDER:TIMEOUT', {
                provider: 'openrouter',
                timeoutType: 'connection',
                timeout: 60000,
                retryable: true,
                retryAfter: 2000
            });
        });
    });
});
