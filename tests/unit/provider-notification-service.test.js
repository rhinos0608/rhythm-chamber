/**
 * Provider Notification Service Tests
 *
 * Comprehensive test suite for provider notification system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ProviderNotificationService,
  NotificationType,
  NotificationSeverity,
} from '../../js/services/provider-notification-service.js';

// Mock EventBus with handler tracking
// The mock factory is defined inline to avoid hoisting issues
vi.mock('../../js/services/event-bus.js', () => {
  const handlers = new Map();

  const mockEventBus = {
    on: vi.fn((event, handler) => {
      if (!handlers.has(event)) {
        handlers.set(event, []);
      }
      handlers.get(event).push(handler);
      return vi.fn(); // unsubscribe function
    }),
    emit: vi.fn((event, data) => {
      // Call registered handlers
      const eventHandlers = handlers.get(event) || [];
      eventHandlers.forEach(handler => handler(event, data));
    }),
    once: vi.fn(() => vi.fn()),
    off: vi.fn(),
    // Helper for tests to get handlers
    _getHandlers: event => handlers.get(event) || [],
    _clearHandlers: () => handlers.clear(),
    // Internal access to handlers map for tests
    _handlers: handlers,
  };

  return {
    EventBus: mockEventBus,
  };
});

// Mock Settings module for toast notifications
vi.mock('../../js/settings.js', () => ({
  Settings: {
    showToast: vi.fn(),
  },
}));

describe('ProviderNotificationService', () => {
  let service;
  let mockEventBus;
  let mockSettings;
  let mockHandlers;

  beforeEach(async () => {
    // Get mocked EventBus
    const { EventBus } = await import('../../js/services/event-bus.js');
    mockEventBus = EventBus;
    mockHandlers = mockEventBus._handlers;

    // Get mocked Settings
    const { Settings } = await import('../../js/settings.js');
    mockSettings = Settings;

    // Clear mocks
    vi.clearAllMocks();
    mockEventBus.on.mockClear();
    mockEventBus.emit.mockClear();
    mockSettings.showToast.mockClear();

    // Clear handlers
    mockEventBus._clearHandlers();

    // Create fresh instance
    service = new ProviderNotificationService();
  });

  describe('Initialization', () => {
    it('should subscribe to provider events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith('PROVIDER:FALLBACK', expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith('PROVIDER:RECOVERED', expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith('PROVIDER:BLACKLISTED', expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith('PROVIDER:FAILURE', expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith('PROVIDER:ALL_FAILED', expect.any(Function));
    });

    it('should be enabled by default', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('Provider Fallback Notifications', () => {
    it('should handle provider fallback event', () => {
      const callback = mockHandlers.get('PROVIDER:FALLBACK')[0];

      callback('PROVIDER:FALLBACK', {
        fromProvider: 'openrouter',
        toProvider: 'ollama',
        reason: 'Connection timeout',
        latencyMs: 30000,
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'PROVIDER:NOTIFICATION',
        expect.objectContaining({
          type: NotificationType.PROVIDER_FALLBACK,
          severity: NotificationSeverity.WARNING,
        })
      );
    });

    it('should create appropriate fallback message', () => {
      const callback = mockHandlers.get('PROVIDER:FALLBACK')[0];

      callback('PROVIDER:FALLBACK', {
        fromProvider: 'openrouter',
        toProvider: 'ollama',
        reason: 'API error',
      });

      const notification = mockEventBus.emit.mock.calls[0][1];
      expect(notification.message).toContain('OpenRouter');
      expect(notification.message).toContain('Ollama');
      expect(notification.message).toContain('API error');
    });

    it('should include switch back action', () => {
      const callback = mockHandlers.get('PROVIDER:FALLBACK')[0];

      callback('PROVIDER:FALLBACK', {
        fromProvider: 'openrouter',
        toProvider: 'ollama',
        reason: 'Connection failed',
      });

      const notification = mockEventBus.emit.mock.calls[0][1];
      const switchBackAction = notification.actions.find(a => a.action === 'switch_provider');
      expect(switchBackAction).toBeDefined();
      expect(switchBackAction.provider).toBe('openrouter');
    });
  });

  describe('Provider Recovery Notifications', () => {
    it('should handle provider recovered event', () => {
      const callback = mockHandlers.get('PROVIDER:RECOVERED')[0];

      callback('PROVIDER:RECOVERED', {
        provider: 'ollama',
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'PROVIDER:NOTIFICATION',
        expect.objectContaining({
          type: NotificationType.PROVIDER_RECOVERED,
          severity: NotificationSeverity.SUCCESS,
        })
      );
    });

    it('should include switch to recovered provider action', () => {
      const callback = mockHandlers.get('PROVIDER:RECOVERED')[0];

      callback('PROVIDER:RECOVERED', {
        provider: 'ollama',
      });

      const notification = mockEventBus.emit.mock.calls[0][1];
      const switchAction = notification.actions.find(a => a.action === 'switch_provider');
      expect(switchAction).toBeDefined();
      expect(switchAction.provider).toBe('ollama');
      expect(switchAction.primary).toBe(true);
    });
  });

  describe('Provider Blacklist Notifications', () => {
    it('should handle provider blacklisted event', () => {
      const callback = mockHandlers.get('PROVIDER:BLACKLISTED')[0];

      const expiry = new Date(Date.now() + 300000).toISOString();
      callback('PROVIDER:BLACKLISTED', {
        provider: 'openrouter',
        expiry,
        durationMs: 300000,
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'PROVIDER:NOTIFICATION',
        expect.objectContaining({
          type: NotificationType.PROVIDER_BLACKLISTED,
          severity: NotificationSeverity.WARNING,
        })
      );
    });

    it('should display expiry time in blacklist message', () => {
      const callback = mockHandlers.get('PROVIDER:BLACKLISTED')[0];

      const expiry = new Date(Date.now() + 300000);
      callback('PROVIDER:BLACKLISTED', {
        provider: 'openrouter',
        expiry: expiry.toISOString(),
        durationMs: 300000,
      });

      const notification = mockEventBus.emit.mock.calls[0][1];
      expect(notification.message).toContain('5 minutes');
      // Use fixed locale for deterministic test
      expect(notification.message).toContain(expiry.toLocaleTimeString('en-US'));
    });

    it('should suggest alternative providers', () => {
      const callback = mockHandlers.get('PROVIDER:BLACKLISTED')[0];

      callback('PROVIDER:BLACKLISTED', {
        provider: 'openrouter',
        expiry: new Date(Date.now() + 300000).toISOString(),
        durationMs: 300000,
      });

      const notification = mockEventBus.emit.mock.calls[0][1];
      const switchActions = notification.actions.filter(a => a.action === 'switch_provider');
      expect(switchActions.length).toBeGreaterThan(0);
      expect(switchActions.some(a => a.provider === 'ollama')).toBe(true);
      expect(switchActions.some(a => a.provider === 'lmstudio')).toBe(true);
    });
  });

  describe('Provider Error Notifications', () => {
    it('should handle provider failure event', () => {
      const callback = mockHandlers.get('PROVIDER:FAILURE')[0];

      const error = new Error('Connection refused');
      callback('PROVIDER:FAILURE', {
        provider: 'ollama',
        error,
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'PROVIDER:NOTIFICATION',
        expect.objectContaining({
          type: NotificationType.PROVIDER_ERROR,
          severity: NotificationSeverity.ERROR,
        })
      );
    });

    it('should provide Ollama-specific error guidance', () => {
      const callback = mockHandlers.get('PROVIDER:FAILURE')[0];

      const error = new Error('ECONNREFUSED');
      callback('PROVIDER:FAILURE', {
        provider: 'ollama',
        error,
      });

      const notification = mockEventBus.emit.mock.calls[0][1];
      expect(notification.message).toContain('not running');
      expect(notification.message).toContain('ollama serve');
    });

    it('should provide LM Studio-specific error guidance', () => {
      const callback = mockHandlers.get('PROVIDER:FAILURE')[0];

      const error = new Error('ECONNREFUSED');
      callback('PROVIDER:FAILURE', {
        provider: 'lmstudio',
        error,
      });

      const notification = mockEventBus.emit.mock.calls[0][1];
      expect(notification.message).toContain('server is not running');
      expect(notification.message).toContain('LM Studio');
    });

    it('should provide OpenRouter-specific error guidance for auth errors', () => {
      const callback = mockHandlers.get('PROVIDER:FAILURE')[0];

      const error = new Error('401 Unauthorized');
      callback('PROVIDER:FAILURE', {
        provider: 'openrouter',
        error,
      });

      const notification = mockEventBus.emit.mock.calls[0][1];
      expect(notification.message).toContain('authentication failed');
      expect(notification.message).toContain('API key');
    });
  });

  describe('All Providers Failed Notifications', () => {
    it('should handle all providers failed event', () => {
      const callback = mockHandlers.get('PROVIDER:ALL_FAILED')[0];

      callback('PROVIDER:ALL_FAILED', {
        attempts: [
          { provider: 'openrouter', success: false, error: new Error('Timeout') },
          { provider: 'ollama', success: false, error: new Error('ECONNREFUSED') },
          { provider: 'lmstudio', success: false, error: new Error('ECONNREFUSED') },
        ],
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'PROVIDER:NOTIFICATION',
        expect.objectContaining({
          type: NotificationType.ALL_PROVIDERS_FAILED,
          severity: NotificationSeverity.ERROR,
        })
      );
    });

    it('should list all failed providers', () => {
      const callback = mockHandlers.get('PROVIDER:ALL_FAILED')[0];

      callback('PROVIDER:ALL_FAILED', {
        attempts: [
          { provider: 'openrouter', success: false },
          { provider: 'ollama', success: false },
          { provider: 'lmstudio', success: false },
        ],
      });

      const notification = mockEventBus.emit.mock.calls[0][1];
      expect(notification.message).toContain('OpenRouter');
      expect(notification.message).toContain('Ollama');
      expect(notification.message).toContain('LM Studio');
    });
  });

  describe('Notification History', () => {
    it('should maintain notification history', () => {
      const callback = mockHandlers.get('PROVIDER:FALLBACK')[0];

      callback('PROVIDER:FALLBACK', {
        fromProvider: 'openrouter',
        toProvider: 'ollama',
        reason: 'Test',
      });

      const history = service.getHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].type).toBe(NotificationType.PROVIDER_FALLBACK);
    });

    it('should limit history size', () => {
      const callback = mockHandlers.get('PROVIDER:FALLBACK')[0];

      // Generate more notifications than max history size
      for (let i = 0; i < 60; i++) {
        callback('PROVIDER:FALLBACK', {
          fromProvider: 'openrouter',
          toProvider: 'ollama',
          reason: `Test ${i}`,
        });
      }

      const history = service.getHistory();
      expect(history.length).toBeLessThanOrEqual(50);
    });

    it('should clear notification history', () => {
      const callback = mockHandlers.get('PROVIDER:FALLBACK')[0];

      callback('PROVIDER:FALLBACK', {
        fromProvider: 'openrouter',
        toProvider: 'ollama',
        reason: 'Test',
      });

      service.clearHistory();
      const history = service.getHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('Enable/Disable Notifications', () => {
    it('should disable notifications', () => {
      service.disable();
      expect(service.isEnabled()).toBe(false);
    });

    it('should enable notifications', () => {
      service.disable();
      service.enable();
      expect(service.isEnabled()).toBe(true);
    });

    it('should not show notifications when disabled', () => {
      service.disable();

      const callback = mockHandlers.get('PROVIDER:FALLBACK')[0];

      callback('PROVIDER:FALLBACK', {
        fromProvider: 'openrouter',
        toProvider: 'ollama',
        reason: 'Test',
      });

      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should show notifications when re-enabled', () => {
      service.disable();
      service.enable();

      const callback = mockHandlers.get('PROVIDER:FALLBACK')[0];

      callback('PROVIDER:FALLBACK', {
        fromProvider: 'openrouter',
        toProvider: 'ollama',
        reason: 'Test',
      });

      expect(mockEventBus.emit).toHaveBeenCalled();
    });
  });

  describe('Toast Integration', () => {
    it('should show toast notification when enabled', () => {
      const callback = mockHandlers.get('PROVIDER:FALLBACK')[0];

      callback('PROVIDER:FALLBACK', {
        fromProvider: 'openrouter',
        toProvider: 'ollama',
        reason: 'Test',
      });

      expect(mockSettings.showToast).toHaveBeenCalled();
    });

    it('should use appropriate duration for error notifications', () => {
      const callback = mockHandlers.get('PROVIDER:FAILURE')[0];

      callback('PROVIDER:FAILURE', {
        provider: 'ollama',
        error: new Error('Test error'),
      });

      expect(mockSettings.showToast).toHaveBeenCalledWith(expect.any(String), 5000);
    });

    it('should use default duration for non-error notifications', () => {
      const callback = mockHandlers.get('PROVIDER:RECOVERED')[0];

      callback('PROVIDER:RECOVERED', {
        provider: 'ollama',
      });

      expect(mockSettings.showToast).toHaveBeenCalledWith(expect.any(String), 3000);
    });
  });

  describe('Severity Icons', () => {
    it('should use error icon for error severity', () => {
      const icon = service._getSeverityIcon(NotificationSeverity.ERROR);
      expect(icon).toBe('❌');
    });

    it('should use warning icon for warning severity', () => {
      const icon = service._getSeverityIcon(NotificationSeverity.WARNING);
      expect(icon).toBe('⚠️');
    });

    it('should use success icon for success severity', () => {
      const icon = service._getSeverityIcon(NotificationSeverity.SUCCESS);
      expect(icon).toBe('✅');
    });

    it('should use info icon for info severity', () => {
      const icon = service._getSeverityIcon(NotificationSeverity.INFO);
      expect(icon).toBe('ℹ️');
    });
  });
});
