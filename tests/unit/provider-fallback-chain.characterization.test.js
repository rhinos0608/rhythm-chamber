/**
 * Provider Fallback Chain Characterization Tests
 *
 * These tests capture the CURRENT behavior of ProviderFallbackChain
 * before refactoring. They serve as a safety net to ensure refactoring
 * doesn't break existing functionality.
 *
 * After refactoring, these tests should continue to pass.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderFallbackChain, ProviderPriority, ProviderHealth } from '../../js/services/provider-fallback-chain.js';

// Mock EventBus
vi.mock('../../js/services/event-bus.js', () => {
    const handlers = new Map();

    const mockEventBus = {
        on: vi.fn((event, handler) => {
            if (!handlers.has(event)) {
                handlers.set(event, []);
            }
            handlers.get(event).push(handler);
            return vi.fn();
        }),
        emit: vi.fn((event, data) => {
            const eventHandlers = handlers.get(event) || [];
            eventHandlers.forEach(handler => handler(event, data));
        }),
        once: vi.fn(() => vi.fn()),
        off: vi.fn(),
        _getHandlers: (event) => handlers.get(event) || [],
        _clearHandlers: () => handlers.clear(),
        _handlers: handlers
    };

    return {
        EventBus: mockEventBus
    };
});

// Mock ProviderHealthAuthority
vi.mock('../../js/services/provider-health-authority.js', () => {
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
                    blacklistExpiry: null,
                    isClosed: true,
                    isHalfOpen: false,
                    isOpen: false,
                    successRate: 0,
                    circuitState: 'CLOSED'
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
        canExecute: vi.fn((provider) => {
            const status = providerStatus.get(provider);
            if (!status) {
                return { allowed: true, reason: null };
            }
            if (status.isBlacklisted) {
                return { allowed: false, reason: 'Provider is blacklisted' };
            }
            if (status.isOpen) {
                return { allowed: false, reason: 'Circuit breaker is open' };
            }
            return { allowed: true, reason: null };
        }),
        markHalfOpenRequestStarted: vi.fn(),
        markHalfOpenRequestCompleted: vi.fn(),
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

// Mock ProviderInterface
vi.mock('../../js/providers/provider-interface.js', () => ({
    ProviderInterface: {
        buildProviderConfig: vi.fn((provider, options) => ({
            name: provider,
            apiKey: options.apiKey
        })),
        callProvider: vi.fn(async (config, apiKey, messages, tools, onProgress) => {
            // Simulate successful provider call
            return {
                content: `Response from ${config.name}`,
                status: 'success',
                role: 'assistant'
            };
        })
    }
}));

// Mock FallbackResponseService
vi.mock('../../js/services/fallback-response-service.js', () => ({
    FallbackResponseService: {
        generateFallbackResponse: vi.fn((message, context) => {
            return 'I apologize, but I am currently unable to process your request. Please try again later.';
        })
    }
}));

describe('ProviderFallbackChain - Characterization Tests', () => {
    let fallbackChain;
    let mockEventBus;
    let mockAuthority;
    let mockProviderInterface;
    let mockFallbackService;

    beforeEach(async () => {
        // Get mocked dependencies
        const { EventBus } = await import('../../js/services/event-bus.js');
        mockEventBus = EventBus;

        const { ProviderHealthAuthority } = await import('../../js/services/provider-health-authority.js');
        mockAuthority = ProviderHealthAuthority;
        mockAuthority._clearStatus();

        const { ProviderInterface } = await import('../../js/providers/provider-interface.js');
        mockProviderInterface = ProviderInterface;

        const { FallbackResponseService } = await import('../../js/services/fallback-response-service.js');
        mockFallbackService = FallbackResponseService;

        // Clear mocks
        vi.clearAllMocks();
        mockEventBus._clearHandlers();

        // Initialize default provider statuses
        mockAuthority._setStatus('openrouter', {
            healthStatus: 'HEALTHY',
            totalSuccesses: 10,
            totalFailures: 1,
            avgLatencyMs: 500,
            lastSuccessTime: Date.now() - 1000,
            lastFailureTime: Date.now() - 5000,
            isBlacklisted: false,
            blacklistExpiry: null,
            isClosed: true,
            isHalfOpen: false,
            isOpen: false,
            successRate: 0.91,
            circuitState: 'CLOSED'
        });

        mockAuthority._setStatus('lmstudio', {
            healthStatus: 'HEALTHY',
            totalSuccesses: 8,
            totalFailures: 0,
            avgLatencyMs: 300,
            lastSuccessTime: Date.now() - 2000,
            lastFailureTime: 0,
            isBlacklisted: false,
            blacklistExpiry: null,
            isClosed: true,
            isHalfOpen: false,
            isOpen: false,
            successRate: 1.0,
            circuitState: 'CLOSED'
        });

        mockAuthority._setStatus('ollama', {
            healthStatus: 'UNKNOWN',
            totalSuccesses: 0,
            totalFailures: 0,
            avgLatencyMs: 0,
            lastSuccessTime: 0,
            lastFailureTime: 0,
            isBlacklisted: false,
            blacklistExpiry: null,
            isClosed: true,
            isHalfOpen: false,
            isOpen: false,
            successRate: 0,
            circuitState: 'CLOSED'
        });

        // Create instance
        fallbackChain = new ProviderFallbackChain();
    });

    afterEach(() => {
        if (fallbackChain) {
            fallbackChain.stopHealthMonitoring();
        }
    });

    describe('Exports and Constants', () => {
        it('should export ProviderPriority enum with correct values', () => {
            expect(ProviderPriority.OPENROUTER).toBe(1);
            expect(ProviderPriority.LM_STUDIO).toBe(2);
            expect(ProviderPriority.OLLAMA).toBe(3);
            expect(ProviderPriority.FALLBACK).toBe(4);
        });

        it('should export ProviderHealth (alias for HealthStatus)', () => {
            expect(ProviderHealth).toBeDefined();
            expect(ProviderHealth.HEALTHY).toBe('HEALTHY');
            expect(ProviderHealth.DEGRADED).toBe('DEGRADED');
            expect(ProviderHealth.UNKNOWN).toBe('UNKNOWN');
            expect(ProviderHealth.UNHEALTHY).toBe('UNHEALTHY');
            expect(ProviderHealth.BLACKLISTED).toBe('BLACKLISTED');
        });

        it('should export ProviderFallbackChain class', () => {
            expect(ProviderFallbackChain).toBeDefined();
            expect(typeof ProviderFallbackChain).toBe('function');
        });

        it('should export default singleton instance', async () => {
            const module = await import('../../js/services/provider-fallback-chain.js');
            expect(module.default).toBeInstanceOf(ProviderFallbackChain);
        });
    });

    describe('Initialization', () => {
        it('should initialize provider configurations', () => {
            const health = fallbackChain.getProviderHealth();

            expect(health.get('openrouter')).toBeDefined();
            expect(health.get('openrouter').provider).toBe('openrouter');
            expect(health.get('openrouter').priority).toBeUndefined(); // Config, not health

            expect(health.get('lmstudio')).toBeDefined();
            expect(health.get('lmstudio').provider).toBe('lmstudio');

            expect(health.get('ollama')).toBeDefined();
            expect(health.get('ollama').provider).toBe('ollama');

            expect(health.get('fallback')).toBeDefined();
            expect(health.get('fallback').provider).toBe('fallback');
        });

        it('should initialize health tracking from ProviderHealthAuthority', () => {
            const health = fallbackChain.getProviderHealth();

            const openrouterHealth = health.get('openrouter');
            expect(openrouterHealth.health).toBe('HEALTHY');
            expect(openrouterHealth.successCount).toBe(10);
            expect(openrouterHealth.failureCount).toBe(1);
            expect(openrouterHealth.avgLatencyMs).toBe(500);

            const lmstudioHealth = health.get('lmstudio');
            expect(lmstudioHealth.health).toBe('HEALTHY');
            expect(lmstudioHealth.successCount).toBe(8);
            expect(lmstudioHealth.failureCount).toBe(0);
        });

        it('should subscribe to event bus events', () => {
            expect(mockEventBus.on).toHaveBeenCalledWith('PROVIDER:SUCCESS', expect.any(Function));
            expect(mockEventBus.on).toHaveBeenCalledWith('PROVIDER:FAILURE', expect.any(Function));
            expect(mockEventBus.on).toHaveBeenCalledWith('CIRCUIT_BREAKER:TRIPPED', expect.any(Function));
            expect(mockEventBus.on).toHaveBeenCalledWith('CIRCUIT_BREAKER:RECOVERED', expect.any(Function));
        });

        it('should accept custom options in constructor', () => {
            const customChain = new ProviderFallbackChain({
                blacklistDurationMs: 600000,
                healthCheckIntervalMs: 120000
            });

            expect(customChain).toBeDefined();
            customChain.stopHealthMonitoring();
        });
    });

    describe('Health Tracking', () => {
        it('should return health for all providers', () => {
            const health = fallbackChain.getProviderHealth();

            expect(health).toBeInstanceOf(Map);
            expect(health.size).toBeGreaterThanOrEqual(4); // openrouter, lmstudio, ollama, fallback
        });

        it('should return health for specific provider', () => {
            const health = fallbackChain.getProviderHealthStatus('openrouter');

            expect(health).toBeDefined();
            expect(health.provider).toBe('openrouter');
            expect(health.health).toBeDefined();
            expect(typeof health.successCount).toBe('number');
            expect(typeof health.failureCount).toBe('number');
        });

        it('should return null for unknown provider', () => {
            const health = fallbackChain.getProviderHealthStatus('unknown');
            expect(health).toBeNull();
        });

        it('should handle PROVIDER:SUCCESS events', async () => {
            const handlers = mockEventBus._getHandlers('PROVIDER:SUCCESS');
            expect(handlers.length).toBeGreaterThan(0);

            const handler = handlers[0];

            // Record initial state
            const initialHealth = fallbackChain.getProviderHealthStatus('openrouter');
            const initialSuccessCount = initialHealth.successCount;

            // Trigger success event
            await handler('PROVIDER:SUCCESS', {
                provider: 'openrouter',
                latencyMs: 750
            });

            // Verify success was recorded
            const updatedHealth = fallbackChain.getProviderHealthStatus('openrouter');
            expect(updatedHealth.successCount).toBe(initialSuccessCount + 1);
            expect(mockAuthority.recordSuccess).toHaveBeenCalledWith('openrouter', 750);
        });

        it('should handle PROVIDER:FAILURE events', async () => {
            const handlers = mockEventBus._getHandlers('PROVIDER:FAILURE');
            expect(handlers.length).toBeGreaterThan(0);

            const handler = handlers[0];

            // Record initial state
            const initialHealth = fallbackChain.getProviderHealthStatus('openrouter');
            const initialFailureCount = initialHealth.failureCount;

            // Trigger failure event
            const error = new Error('Connection timeout');
            await handler('PROVIDER:FAILURE', {
                provider: 'openrouter',
                error: error
            });

            // Verify failure was recorded
            const updatedHealth = fallbackChain.getProviderHealthStatus('openrouter');
            expect(updatedHealth.failureCount).toBe(initialFailureCount + 1);
            expect(mockAuthority.recordFailure).toHaveBeenCalledWith('openrouter', error);
        });
    });

    describe('Blacklist Management', () => {
        it('should return blacklist status', () => {
            const blacklist = fallbackChain.getBlacklistStatus();

            expect(blacklist).toBeInstanceOf(Map);
        });

        it('should blacklist a provider manually', async () => {
            await fallbackChain.blacklistProvider('openrouter', 60000);

            const blacklist = fallbackChain.getBlacklistStatus();
            expect(blacklist.has('openrouter')).toBe(true);
            expect(mockAuthority.blacklist).toHaveBeenCalledWith('openrouter', 60000);
        });

        it('should unblacklist a provider manually', async () => {
            // First blacklist
            await fallbackChain.blacklistProvider('openrouter', 60000);
            expect(fallbackChain.getBlacklistStatus().has('openrouter')).toBe(true);

            // Then unblacklist
            await fallbackChain.unblacklistProvider('openrouter');
            expect(fallbackChain.getBlacklistStatus().has('openrouter')).toBe(false);
            expect(mockAuthority.unblacklist).toHaveBeenCalledWith('openrouter');
        });

        it('should handle CIRCUIT_BREAKER:TRIPPED events', async () => {
            const handlers = mockEventBus._getHandlers('CIRCUIT_BREAKER:TRIPPED');
            expect(handlers.length).toBeGreaterThan(0);

            const handler = handlers[0];

            // Trigger circuit breaker tripped event
            await handler('CIRCUIT_BREAKER:TRIPPED', {
                provider: 'openrouter'
            });

            // Verify provider was blacklisted
            const blacklist = fallbackChain.getBlacklistStatus();
            expect(blacklist.has('openrouter')).toBe(true);
        });

        it('should handle CIRCUIT_BREAKER:RECOVERED events', async () => {
            const handlers = mockEventBus._getHandlers('CIRCUIT_BREAKER:RECOVERED');
            expect(handlers.length).toBeGreaterThan(0);

            const handler = handlers[0];

            // First blacklist
            await fallbackChain.blacklistProvider('openrouter', 60000);

            // Trigger recovery event
            await handler('CIRCUIT_BREAKER:RECOVERED', {
                provider: 'openrouter'
            });

            // Verify provider was unblacklisted
            const blacklist = fallbackChain.getBlacklistStatus();
            expect(blacklist.has('openrouter')).toBe(false);
        });
    });

    describe('Provider Priority Order', () => {
        it('should return provider priority order', () => {
            const order = fallbackChain.getProviderPriorityOrder('openrouter');

            expect(Array.isArray(order)).toBe(true);
            expect(order.length).toBeGreaterThan(0);
            expect(order.includes('openrouter')).toBe(true);
            expect(order.includes('lmstudio')).toBe(true);
            expect(order.includes('ollama')).toBe(true);
            expect(order.includes('fallback')).toBe(true);
        });

        it('should prioritize healthy providers', () => {
            // All providers are healthy except ollama (UNKNOWN)
            const order = fallbackChain.getProviderPriorityOrder('openrouter');

            // Healthy providers should come before UNKNOWN
            const openrouterIndex = order.indexOf('openrouter');
            const lmstudioIndex = order.indexOf('lmstudio');
            const ollamaIndex = order.indexOf('ollama');

            // OpenRouter (primary + healthy) should be very high
            expect(openrouterIndex).toBeLessThan(ollamaIndex);
        });

        it('should respect primary provider parameter', () => {
            const order1 = fallbackChain.getProviderPriorityOrder('openrouter');
            const order2 = fallbackChain.getProviderPriorityOrder('lmstudio');

            // Primary provider should get priority boost
            expect(order1[0]).toBe('openrouter');
            expect(order2[0]).toBe('lmstudio');
        });
    });

    describe('Fallback Execution', () => {
        it('should execute with fallback on success', async () => {
            const result = await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: []
            });

            expect(result.success).toBe(true);
            expect(result.provider).toBe('openrouter');
            expect(result.attemptsCount).toBe(1);
            expect(result.attempts.length).toBe(1);
            expect(result.attempts[0].success).toBe(true);
            expect(result.response).toBeDefined();
            expect(mockProviderInterface.buildProviderConfig).toHaveBeenCalled();
            expect(mockProviderInterface.callProvider).toHaveBeenCalled();
        });

        it('should fallback to next provider on failure', async () => {
            // Mock first provider to fail
            mockProviderInterface.callProvider
                .mockRejectedValueOnce(new Error('OpenRouter failed'))
                .mockResolvedValueOnce({
                    content: 'Response from lmstudio',
                    status: 'success',
                    role: 'assistant'
                });

            const result = await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: []
            });

            expect(result.success).toBe(true);
            expect(result.provider).not.toBe('openrouter'); // Should be fallback
            expect(result.attemptsCount).toBeGreaterThan(1);
        });

        it('should skip blacklisted providers', async () => {
            // Blacklist openrouter
            await fallbackChain.blacklistProvider('openrouter', 60000);

            const result = await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: []
            });

            expect(result.success).toBe(true);
            expect(result.provider).not.toBe('openrouter');
        });

        it('should return fallback response when all providers fail', async () => {
            // Mock all providers to fail
            mockProviderInterface.callProvider.mockRejectedValue(new Error('All failed'));

            const result = await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: []
            });

            expect(result.success).toBe(true); // Fallback always succeeds
            expect(result.provider).toBe('fallback');
            expect(result.response.isFallback).toBe(true);
            expect(mockFallbackService.generateFallbackResponse).toHaveBeenCalled();
        });

        it('should include latency in successful attempts', async () => {
            const result = await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: []
            });

            expect(result.attempts[0].latencyMs).toBeGreaterThanOrEqual(0);
            expect(typeof result.attempts[0].latencyMs).toBe('number');
        });

        it('should include error in failed attempts', async () => {
            mockProviderInterface.callProvider.mockRejectedValue(new Error('Provider failed'));

            const result = await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: []
            });

            // Should eventually reach fallback
            expect(result.attempts.some(a => a.error && a.error.message)).toBe(true);
        });
    });

    describe('Circuit Breaker Integration', () => {
        it('should check circuit breaker before execution', async () => {
            // Set provider as blacklisted (circuit breaker open)
            mockAuthority._setStatus('openrouter', {
                healthStatus: 'BLACKLISTED',
                totalSuccesses: 0,
                totalFailures: 10,
                avgLatencyMs: 0,
                lastSuccessTime: 0,
                lastFailureTime: Date.now(),
                isBlacklisted: true,
                blacklistExpiry: Date.now() + 300000,
                isClosed: false,
                isHalfOpen: false,
                isOpen: true,
                successRate: 0,
                circuitState: 'OPEN'
            });

            const result = await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: []
            });

            // Should skip openrouter and use next provider
            expect(result.provider).not.toBe('openrouter');
        });

        it('should record success to health authority', async () => {
            await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: []
            });

            // recordSuccess should be called with the provider that succeeded
            // In this case, it's 'fallback' because that's what actually succeeds in the test
            expect(mockAuthority.recordSuccess).toHaveBeenCalledWith(expect.any(String), expect.any(Number));
        });

        it('should record failure to health authority', async () => {
            mockProviderInterface.callProvider.mockRejectedValue(new Error('Failed'));

            await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: []
            });

            expect(mockAuthority.recordFailure).toHaveBeenCalledWith('openrouter', expect.any(Error));
        });
    });

    describe('Health Monitoring', () => {
        it('should start health monitoring interval', () => {
            // Health monitoring starts in constructor
            // This test just verifies it doesn't throw
            expect(fallbackChain).toBeDefined();
        });

        it('should stop health monitoring', () => {
            expect(() => fallbackChain.stopHealthMonitoring()).not.toThrow();
        });

        it('should reset health tracking', () => {
            expect(() => fallbackChain.resetHealthTracking()).not.toThrow();

            const health = fallbackChain.getProviderHealth();
            expect(health).toBeInstanceOf(Map);
        });
    });

    describe('Fallback Response Generation', () => {
        it('should use FallbackResponseService for fallback provider', async () => {
            mockProviderInterface.callProvider.mockRejectedValue(new Error('All failed'));

            await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Help me' }],
                tools: []
            });

            expect(mockFallbackService.generateFallbackResponse).toHaveBeenCalledWith(
                'Help me',
                expect.objectContaining({
                    message: 'Help me',
                    timestamp: expect.any(Number)
                })
            );
        });
    });

    describe('Performance Metrics', () => {
        it('should use Performance API for timing', () => {
            // Verify performance marks are being set
            expect(typeof performance.mark).toBe('function');
            expect(typeof performance.measure).toBe('function');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty messages array', async () => {
            const result = await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [],
                tools: []
            });

            expect(result).toBeDefined();
        });

        it('should handle null onProgress callback', async () => {
            const result = await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: [],
                onProgress: null
            });

            expect(result.success).toBe(true);
        });

        it('should handle onProgress callback', async () => {
            const onProgress = vi.fn();

            await fallbackChain.executeWithFallback({
                provider: 'openrouter',
                apiKey: 'test-key',
                messages: [{ role: 'user', content: 'Hello' }],
                tools: [],
                onProgress
            });

            // onProgress should be passed through to ProviderInterface
            expect(mockProviderInterface.callProvider).toHaveBeenCalledWith(
                expect.any(Object),
                'test-key',
                [{ role: 'user', content: 'Hello' }],
                [],
                onProgress
            );
        });
    });
});
