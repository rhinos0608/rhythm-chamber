/**
 * Fallback Priority Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getProviderPriorityOrder } from '../../../js/services/fallback/priority.js';

// Mock ProviderHealthAuthority
vi.mock('../../../js/services/provider-health-authority.js', () => {
  const providerStatus = new Map();

  const mockAuthority = {
    getStatus: vi.fn(provider => {
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
          circuitState: 'CLOSED',
        };
      }
      return providerStatus.get(provider);
    }),
    _setStatus: (provider, status) => providerStatus.set(provider, status),
    _clearStatus: () => providerStatus.clear(),
  };

  return {
    ProviderHealthAuthority: mockAuthority,
    HealthStatus: {
      HEALTHY: 'HEALTHY',
      DEGRADED: 'DEGRADED',
      UNKNOWN: 'UNKNOWN',
      UNHEALTHY: 'UNHEALTHY',
      BLACKLISTED: 'BLACKLISTED',
    },
  };
});

describe('fallback/priority', () => {
  let mockAuthority;
  let providerConfigs;

  beforeEach(async () => {
    const { ProviderHealthAuthority } =
      await import('../../../js/services/provider-health-authority.js');
    mockAuthority = ProviderHealthAuthority;
    mockAuthority._clearStatus();

    // Setup provider configs
    providerConfigs = new Map();
    providerConfigs.set('openrouter', {
      name: 'openrouter',
      priority: 1,
      isLocal: false,
      timeoutMs: 60000,
      maxRetries: 3,
    });
    providerConfigs.set('lmstudio', {
      name: 'lmstudio',
      priority: 2,
      isLocal: true,
      timeoutMs: 90000,
      maxRetries: 2,
    });
    providerConfigs.set('ollama', {
      name: 'ollama',
      priority: 3,
      isLocal: true,
      timeoutMs: 90000,
      maxRetries: 2,
    });
    providerConfigs.set('fallback', {
      name: 'fallback',
      priority: 4,
      isLocal: true,
      timeoutMs: 0,
      maxRetries: 0,
    });
  });

  describe('getProviderPriorityOrder', () => {
    it('should return array of provider names', () => {
      const order = getProviderPriorityOrder(providerConfigs, 'openrouter');

      expect(Array.isArray(order)).toBe(true);
      expect(order.length).toBe(4);
    });

    it('should include all providers', () => {
      const order = getProviderPriorityOrder(providerConfigs, 'openrouter');

      expect(order).toContain('openrouter');
      expect(order).toContain('lmstudio');
      expect(order).toContain('ollama');
      expect(order).toContain('fallback');
    });

    it('should prioritize healthy providers', () => {
      // Setup: openrouter is healthy, others are unknown
      mockAuthority._setStatus('openrouter', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.9,
        avgLatencyMs: 500,
      });

      mockAuthority._setStatus('lmstudio', {
        healthStatus: 'UNKNOWN',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0,
        avgLatencyMs: 0,
      });

      const order = getProviderPriorityOrder(providerConfigs, 'openrouter');

      expect(order[0]).toBe('openrouter');
    });

    it('should respect primary provider parameter', () => {
      mockAuthority._setStatus('openrouter', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.9,
        avgLatencyMs: 500,
      });

      mockAuthority._setStatus('lmstudio', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.9,
        avgLatencyMs: 300,
      });

      const orderWithOpenrouter = getProviderPriorityOrder(providerConfigs, 'openrouter');
      const orderWithLmstudio = getProviderPriorityOrder(providerConfigs, 'lmstudio');

      expect(orderWithOpenrouter[0]).toBe('openrouter');
      expect(orderWithLmstudio[0]).toBe('lmstudio');
    });

    it('should prioritize providers with lower latency', () => {
      mockAuthority._setStatus('openrouter', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.9,
        avgLatencyMs: 5000, // High latency
      });

      mockAuthority._setStatus('lmstudio', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.9,
        avgLatencyMs: 300, // Low latency
      });

      const order = getProviderPriorityOrder(providerConfigs, 'lmstudio');

      // lmstudio should be preferred due to lower latency (and primary boost)
      expect(order[0]).toBe('lmstudio');
    });

    it('should prioritize providers with higher success rate', () => {
      mockAuthority._setStatus('openrouter', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.5, // Lower success rate
        avgLatencyMs: 500,
      });

      mockAuthority._setStatus('lmstudio', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.95, // Higher success rate
        avgLatencyMs: 500,
      });

      const order = getProviderPriorityOrder(providerConfigs, 'lmstudio');

      expect(order.indexOf('lmstudio')).toBeLessThan(order.indexOf('openrouter'));
    });

    it('should deprioritize blacklisted providers', () => {
      mockAuthority._setStatus('openrouter', {
        healthStatus: 'BLACKLISTED',
        isClosed: false,
        isHalfOpen: false,
        isOpen: true,
        successRate: 0,
        avgLatencyMs: 0,
      });

      mockAuthority._setStatus('lmstudio', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.9,
        avgLatencyMs: 300,
      });

      const order = getProviderPriorityOrder(providerConfigs, 'lmstudio');

      // openrouter should be last due to blacklisted status
      expect(order[order.length - 1]).toBe('openrouter');
      expect(order[0]).toBe('lmstudio');
    });

    it('should give slight boost to local providers', () => {
      mockAuthority._setStatus('openrouter', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.9,
        avgLatencyMs: 500,
      });

      mockAuthority._setStatus('lmstudio', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.9,
        avgLatencyMs: 500,
      });

      const order = getProviderPriorityOrder(providerConfigs, 'fallback');

      // lmstudio (local) should be preferred over openrouter (cloud) when no primary boost
      const lmstudioIndex = order.indexOf('lmstudio');
      const openrouterIndex = order.indexOf('openrouter');

      expect(lmstudioIndex).toBeLessThan(openrouterIndex);
    });

    it('should handle degraded health status', () => {
      mockAuthority._setStatus('openrouter', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.9,
        avgLatencyMs: 500,
      });

      mockAuthority._setStatus('lmstudio', {
        healthStatus: 'DEGRADED',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.7,
        avgLatencyMs: 800,
      });

      const order = getProviderPriorityOrder(providerConfigs, 'openrouter');

      // Healthy provider should come before degraded
      expect(order.indexOf('openrouter')).toBeLessThan(order.indexOf('lmstudio'));
    });

    it('should handle unknown health status', () => {
      mockAuthority._setStatus('openrouter', {
        healthStatus: 'HEALTHY',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0.9,
        avgLatencyMs: 500,
      });

      mockAuthority._setStatus('ollama', {
        healthStatus: 'UNKNOWN',
        isClosed: true,
        isHalfOpen: false,
        isOpen: false,
        successRate: 0,
        avgLatencyMs: 0,
      });

      const order = getProviderPriorityOrder(providerConfigs, 'openrouter');

      // Healthy should come before unknown
      expect(order.indexOf('openrouter')).toBeLessThan(order.indexOf('ollama'));
    });
  });
});
