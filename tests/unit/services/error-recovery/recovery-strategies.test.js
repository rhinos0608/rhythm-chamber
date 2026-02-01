/**
 * Recovery Strategies Tests
 *
 * Tests for domain-specific recovery handlers extracted from
 * error-recovery-coordinator.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RecoveryDomain,
  RecoveryPriority,
} from '../../../../js/services/error-recovery-coordinator.js';
import { RecoveryStrategies } from '../../../../js/services/error-recovery/recovery-strategies.js';

describe('RecoveryStrategies', () => {
  let strategies;
  let mockEventBus;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
    };
    strategies = new RecoveryStrategies(mockEventBus);
  });

  describe('Security Error Handler', () => {
    it('should handle security errors with recovery action', async () => {
      const errorData = {
        error: new Error('Security threat detected'),
        context: { threatLevel: 'high' },
        recoveryAction: 'lockdown',
      };

      await strategies.handleSecurityError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'SECURITY:RECOVERY',
        expect.objectContaining({
          error: errorData.error,
          context: errorData.context,
          action: 'lockdown',
        })
      );
    });

    it('should handle security errors with default action', async () => {
      const errorData = {
        error: new Error('Unauthorized access'),
        context: { userId: 'user123' },
      };

      await strategies.handleSecurityError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'SECURITY:RECOVERY',
        expect.objectContaining({
          action: 'default',
        })
      );
    });

    it('should log security error handling', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const errorData = {
        error: new Error('Security violation'),
        context: {},
      };

      await strategies.handleSecurityError(errorData);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[RecoveryStrategies] Handling security error:',
        errorData
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Storage Error Handler', () => {
    it('should handle storage errors with recovery action', async () => {
      const errorData = {
        error: new Error('IndexedDB quota exceeded'),
        context: { database: 'rhythm-chamber' },
        recoveryAction: 'cleanup',
      };

      await strategies.handleStorageError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'STORAGE:RECOVERY',
        expect.objectContaining({
          error: errorData.error,
          context: errorData.context,
          action: 'cleanup',
        })
      );
    });

    it('should handle storage errors with fallback action', async () => {
      const errorData = {
        error: new Error('Transaction failed'),
        context: { store: 'patterns' },
      };

      await strategies.handleStorageError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'STORAGE:RECOVERY',
        expect.objectContaining({
          action: 'fallback',
        })
      );
    });

    it('should log storage error handling', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const errorData = {
        error: new Error('Storage error'),
        context: {},
      };

      await strategies.handleStorageError(errorData);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[RecoveryStrategies] Handling storage error:',
        errorData
      );
      consoleSpy.mockRestore();
    });
  });

  describe('UI Error Handler', () => {
    it('should handle UI errors with widget ID', async () => {
      const errorData = {
        error: new Error('Widget rendering failed'),
        context: { component: 'PatternGrid' },
        widgetId: 'pattern-grid-123',
      };

      await strategies.handleUIError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'UI:RECOVERY',
        expect.objectContaining({
          error: errorData.error,
          context: errorData.context,
          widgetId: 'pattern-grid-123',
        })
      );
    });

    it('should handle UI errors without widget ID', async () => {
      const errorData = {
        error: new Error('UI component error'),
        context: { component: 'App' },
      };

      await strategies.handleUIError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'UI:RECOVERY',
        expect.objectContaining({
          error: errorData.error,
          context: errorData.context,
        })
      );
    });

    it('should log UI error handling', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const errorData = {
        error: new Error('UI error'),
        context: {},
      };

      await strategies.handleUIError(errorData);

      expect(consoleSpy).toHaveBeenCalledWith('[RecoveryStrategies] Handling UI error:', errorData);
      consoleSpy.mockRestore();
    });
  });

  describe('Operational Error Handler', () => {
    it('should handle operational errors with retryable flag', async () => {
      const errorData = {
        error: new Error('Operation timeout'),
        context: { operation: 'pattern-save' },
        retryable: true,
      };

      await strategies.handleOperationalError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'OPERATIONAL:RECOVERY',
        expect.objectContaining({
          error: errorData.error,
          context: errorData.context,
          retryable: true,
        })
      );
    });

    it('should handle operational errors with non-retryable flag', async () => {
      const errorData = {
        error: new Error('Invalid operation'),
        context: { operation: 'delete-all' },
        retryable: false,
      };

      await strategies.handleOperationalError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'OPERATIONAL:RECOVERY',
        expect.objectContaining({
          retryable: false,
        })
      );
    });

    it('should default retryable to true if not specified', async () => {
      const errorData = {
        error: new Error('Operational error'),
        context: {},
      };

      await strategies.handleOperationalError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'OPERATIONAL:RECOVERY',
        expect.objectContaining({
          retryable: true,
        })
      );
    });

    it('should log operational error handling', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const errorData = {
        error: new Error('Operational error'),
        context: {},
      };

      await strategies.handleOperationalError(errorData);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[RecoveryStrategies] Handling operational error:',
        errorData
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Network Error Handler', () => {
    it('should handle network errors with URL', async () => {
      const errorData = {
        error: new Error('Network request failed'),
        url: 'https://api.example.com/patterns',
      };

      await strategies.handleNetworkError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'NETWORK:RECOVERY',
        expect.objectContaining({
          error: errorData.error,
          url: 'https://api.example.com/patterns',
          retryable: true,
        })
      );
    });

    it('should handle network errors without URL', async () => {
      const errorData = {
        error: new Error('Connection timeout'),
      };

      await strategies.handleNetworkError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'NETWORK:RECOVERY',
        expect.objectContaining({
          error: errorData.error,
          retryable: true,
        })
      );
    });

    it('should always mark network errors as retryable', async () => {
      const errorData = {
        error: new Error('Network error'),
        retryable: false,
      };

      await strategies.handleNetworkError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'NETWORK:RECOVERY',
        expect.objectContaining({
          retryable: true,
        })
      );
    });

    it('should log network error handling', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const errorData = {
        error: new Error('Network error'),
        url: 'https://api.example.com',
      };

      await strategies.handleNetworkError(errorData);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[RecoveryStrategies] Handling network error:',
        errorData
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Provider Error Handler', () => {
    it('should handle provider errors with fallback available', async () => {
      const errorData = {
        error: new Error('Provider API failed'),
        provider: 'openai',
        fallbackAvailable: true,
      };

      await strategies.handleProviderError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'PROVIDER:RECOVERY',
        expect.objectContaining({
          error: errorData.error,
          provider: 'openai',
          fallbackAvailable: true,
        })
      );
    });

    it('should handle provider errors without fallback', async () => {
      const errorData = {
        error: new Error('Provider unavailable'),
        provider: 'anthropic',
        fallbackAvailable: false,
      };

      await strategies.handleProviderError(errorData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'PROVIDER:RECOVERY',
        expect.objectContaining({
          provider: 'anthropic',
          fallbackAvailable: false,
        })
      );
    });

    it('should log provider error handling', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const errorData = {
        error: new Error('Provider error'),
        provider: 'openai',
      };

      await strategies.handleProviderError(errorData);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[RecoveryStrategies] Handling provider error:',
        errorData
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Handler Registration', () => {
    it('should initialize handlers for all recovery domains', () => {
      const handlers = strategies.getHandlers();

      expect(handlers.get(RecoveryDomain.SECURITY)).toBeDefined();
      expect(handlers.get(RecoveryDomain.STORAGE)).toBeDefined();
      expect(handlers.get(RecoveryDomain.UI)).toBeDefined();
      expect(handlers.get(RecoveryDomain.OPERATIONAL)).toBeDefined();
      expect(handlers.get(RecoveryDomain.NETWORK)).toBeDefined();
      expect(handlers.get(RecoveryDomain.PROVIDER)).toBeDefined();
    });

    it('should provide handler functions for each domain', () => {
      const handlers = strategies.getHandlers();

      expect(handlers.get(RecoveryDomain.SECURITY)).toHaveLength(1);
      expect(handlers.get(RecoveryDomain.STORAGE)).toHaveLength(1);
      expect(handlers.get(RecoveryDomain.UI)).toHaveLength(1);
      expect(handlers.get(RecoveryDomain.OPERATIONAL)).toHaveLength(1);
      expect(handlers.get(RecoveryDomain.NETWORK)).toHaveLength(1);
      expect(handlers.get(RecoveryDomain.PROVIDER)).toHaveLength(1);
    });

    it('should allow custom handler registration', () => {
      const customHandler = vi.fn();
      strategies.registerHandler(RecoveryDomain.SECURITY, customHandler);

      const handlers = strategies.getHandlers();
      const securityHandlers = handlers.get(RecoveryDomain.SECURITY);

      expect(securityHandlers).toHaveLength(2);
      expect(securityHandlers[1]).toBe(customHandler);
    });
  });

  describe('Dependency Handler Mapping', () => {
    it('should provide operation_lock dependency handler name', () => {
      const handlerName = strategies.getDependencyHandlerName('operation_lock');

      expect(handlerName).toBeDefined();
      expect(handlerName).toBe('operation_lock');
    });

    it('should provide state_validation dependency handler name', () => {
      const handlerName = strategies.getDependencyHandlerName('state_validation');

      expect(handlerName).toBeDefined();
      expect(handlerName).toBe('state_validation');
    });

    it('should provide tab_coordination dependency handler name', () => {
      const handlerName = strategies.getDependencyHandlerName('tab_coordination');

      expect(handlerName).toBeDefined();
      expect(handlerName).toBe('tab_coordination');
    });

    it('should return null for unknown dependencies', () => {
      const handlerName = strategies.getDependencyHandlerName('unknown_dependency');

      expect(handlerName).toBeNull();
    });
  });
});
