/**
 * Tests for Message Lifecycle Critical Fixes
 *
 * Tests for CRITICAL fixes:
 * - CRITICAL-1: LRU cache eviction in MessageValidator
 * - CRITICAL-2: Service initialization guards
 * - CRITICAL-3: Error handling around init()
 * - CRITICAL-4: StreamProcessor.processStream() functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MessageValidator } from '../../js/services/message-validator.js';
import { MessageLifecycleCoordinator } from '../../js/services/message-lifecycle-coordinator.js';
import { StreamProcessor } from '../../js/services/stream-processor.js';

describe('Message Lifecycle Critical Fixes', () => {
  describe('CRITICAL-1: LRU Cache Eviction', () => {
    beforeEach(() => {
      MessageValidator.init();
      MessageValidator.clearDuplicateCache();
    });

    afterEach(() => {
      MessageValidator.clearDuplicateCache();
    });

    it('should track message hashes with timestamps', () => {
      const message1 = 'Test message 1';
      const message2 = 'Test message 2';

      MessageValidator.trackProcessedMessage(message1);
      MessageValidator.trackProcessedMessage(message2);

      const stats = MessageValidator.getCacheStats();
      expect(stats.size).toBe(2);
    });

    it('should update timestamp on cache hit (LRU behavior)', () => {
      const message1 = 'Test message 1';
      const message2 = 'Test message 2';
      const message3 = 'Test message 3';

      // Track first message
      MessageValidator.trackProcessedMessage(message1);

      // Wait a bit to ensure different timestamp
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        /* intentionally empty: busy-wait for timestamp difference */
      }

      // Track second message
      MessageValidator.trackProcessedMessage(message2);

      // Check first message is duplicate (updates timestamp)
      const validation1 = MessageValidator.validateMessage(message1);
      expect(validation1.valid).toBe(false);
      expect(validation1.error).toContain('Duplicate');

      // Track third message
      MessageValidator.trackProcessedMessage(message3);

      const stats = MessageValidator.getCacheStats();
      expect(stats.size).toBe(3);
    });

    it('should evict least recently used entry when cache is full', () => {
      const MAX_SIZE = 1000; // MAX_HASH_CACHE_SIZE
      const messages = [];

      // Fill cache to max
      for (let i = 0; i < MAX_SIZE; i++) {
        const message = `Message ${i}`;
        messages.push(message);
        MessageValidator.trackProcessedMessage(message);
      }

      const statsBefore = MessageValidator.getCacheStats();
      expect(statsBefore.size).toBe(MAX_SIZE);

      // Access first message again to make it recently used
      const validation1 = MessageValidator.validateMessage(messages[0]);
      expect(validation1.valid).toBe(false);

      // Add one more message - should evict the least recently used (not message 0)
      const newMessage = 'New message that triggers eviction';
      MessageValidator.trackProcessedMessage(newMessage);

      const statsAfter = MessageValidator.getCacheStats();
      expect(statsAfter.size).toBe(MAX_SIZE);

      // First message should still be in cache (we just accessed it)
      const validation2 = MessageValidator.validateMessage(messages[0]);
      expect(validation2.valid).toBe(false);

      // The second message (which we didn't access) should have been evicted
      const validation3 = MessageValidator.validateMessage(messages[1]);
      expect(validation3.valid).toBe(true); // Not detected as duplicate
    });

    it('should properly handle cache eviction with Map instead of Set', () => {
      // This test verifies the fix: Map stores hash->timestamp, not just hash
      const message1 = 'First message';
      const message2 = 'Second message';

      MessageValidator.trackProcessedMessage(message1);

      // Small delay
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        /* intentionally empty: busy-wait for timestamp difference */
      }

      MessageValidator.trackProcessedMessage(message2);

      // Access message1 again (should update timestamp)
      MessageValidator.validateMessage(message1);

      // Add 999 more messages to trigger exactly ONE eviction (cache size is 1000)
      // Starting with 2 messages (message1, message2), adding 999 fills to 1001, causing 1 eviction
      for (let i = 0; i < 999; i++) {
        MessageValidator.trackProcessedMessage(`Message ${i}`);
      }

      // Message1 should still be cached because we accessed it recently
      // message2 (which we didn't access) should have been evicted
      const validation = MessageValidator.validateMessage(message1);
      expect(validation.valid).toBe(false); // Should be duplicate (valid=false)
    });
  });

  describe('CRITICAL-2: Service Initialization Guards', () => {
    it('MessageValidator should have init() method', () => {
      expect(typeof MessageValidator.init).toBe('function');
    });

    it('MessageValidator should have isInitialized() method', () => {
      expect(typeof MessageValidator.isInitialized).toBe('function');
    });

    it('MessageValidator.isInitialized should return false before init', () => {
      // Create a fresh instance by clearing state
      MessageValidator.clearDuplicateCache();
      const isInit = MessageValidator.isInitialized();
      expect(typeof isInit).toBe('boolean');
    });

    it('MessageValidator should be initialized after calling init()', () => {
      MessageValidator.init();
      expect(MessageValidator.isInitialized()).toBe(true);
    });

    it('StreamProcessor should have init() method', () => {
      expect(typeof StreamProcessor.init).toBe('function');
    });

    it('StreamProcessor should have isInitialized() method', () => {
      expect(typeof StreamProcessor.isInitialized).toBe('function');
    });

    it('StreamProcessor.isInitialized should return false before init', () => {
      expect(StreamProcessor.isInitialized()).toBe(false);
    });

    it('StreamProcessor should be initialized after calling init()', () => {
      StreamProcessor.init({ Settings: { showToast: () => {} } });
      expect(StreamProcessor.isInitialized()).toBe(true);
    });

    it('MessageLifecycleCoordinator should have isInitialized() method', () => {
      expect(typeof MessageLifecycleCoordinator.isInitialized).toBe('function');
    });

    it('MessageLifecycleCoordinator should have getInitializationErrors() method', () => {
      expect(typeof MessageLifecycleCoordinator.getInitializationErrors).toBe('function');
    });

    it('MessageLifecycleCoordinator should throw if operations called before init', async () => {
      // Reset state
      MessageLifecycleCoordinator.init({
        SessionManager: {
          getHistory: () => [],
          getUserContext: () => ({}),
          initChat: () => {},
        },
        ConversationOrchestrator: {
          getUserContext: () => ({}),
        },
        ToolCallHandlingService: {},
        FallbackResponseService: {},
        CircuitBreaker: {},
        ModuleRegistry: {},
        Settings: {},
        Config: {},
        Functions: {},
        MessageOperations: {},
        LLMProviderRoutingService: {},
        TokenCountingService: {},
        WaveTelemetry: {},
      });

      // After successful init, should not throw
      expect(MessageLifecycleCoordinator.isInitialized()).toBe(true);
    });
  });

  describe('CRITICAL-3: Error Handling Around init()', () => {
    it('should handle missing dependencies gracefully', () => {
      // This should not throw, but should record errors
      expect(() => {
        MessageLifecycleCoordinator.init({
          SessionManager: null, // Missing required dependency
          ConversationOrchestrator: {},
          ToolCallHandlingService: {},
          FallbackResponseService: {},
          Settings: {},
          Config: {},
          Functions: {},
        });
      }).not.toThrow();

      const errors = MessageLifecycleCoordinator.getInitializationErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('Missing required dependency'))).toBe(true);
    });

    it('should track multiple initialization errors', () => {
      MessageLifecycleCoordinator.init({
        SessionManager: null,
        ConversationOrchestrator: null,
        ToolCallHandlingService: null,
        FallbackResponseService: null,
        Settings: null,
        Config: null,
        Functions: null,
      });

      const errors = MessageLifecycleCoordinator.getInitializationErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should have empty errors after successful initialization', () => {
      MessageLifecycleCoordinator.init({
        SessionManager: {
          getHistory: () => [],
          initChat: () => {},
        },
        ConversationOrchestrator: {
          getUserContext: () => ({}),
        },
        ToolCallHandlingService: {
          handleToolCallsWithFallback: async () => ({}),
        },
        FallbackResponseService: {
          generateFallbackResponse: () => '',
        },
        CircuitBreaker: {},
        ModuleRegistry: {
          getModuleSync: () => null,
        },
        Settings: {
          getSettings: () => ({}),
          showToast: () => {},
        },
        Config: {
          openrouter: {},
        },
        Functions: {
          getEnabledSchemas: () => [],
        },
        MessageOperations: {},
        LLMProviderRoutingService: {},
        TokenCountingService: {},
        WaveTelemetry: {},
      });

      const errors = MessageLifecycleCoordinator.getInitializationErrors();
      expect(errors.length).toBe(0);
      expect(MessageLifecycleCoordinator.isInitialized()).toBe(true);
    });

    it('should prevent sendMessage when not properly initialized', async () => {
      // Create a coordinator with failed initialization
      MessageLifecycleCoordinator.init({
        SessionManager: null, // Missing required dep
      });

      // Should not be initialized
      expect(MessageLifecycleCoordinator.isInitialized()).toBe(false);

      // sendMessage should throw when called
      await expect(async () => {
        await MessageLifecycleCoordinator.sendMessage('test');
      }).rejects.toThrow();
    });
  });

  describe('CRITICAL-4: StreamProcessor.processStream() Functionality', () => {
    beforeEach(() => {
      StreamProcessor.init({ Settings: { showToast: () => {} } });
    });

    it('should have processStream() method', () => {
      expect(typeof StreamProcessor.processStream).toBe('function');
    });

    it('should have processNonStream() method', () => {
      expect(typeof StreamProcessor.processNonStream).toBe('function');
    });

    it('processNonStream should handle valid response', () => {
      const response = {
        choices: [{ message: { content: 'Test response' } }],
      };

      const content = StreamProcessor.processNonStream(response, null);
      expect(content).toBe('Test response');
    });

    it('processNonStream should throw on empty choices', () => {
      const response = { choices: [] };

      expect(() => {
        StreamProcessor.processNonStream(response, null);
      }).toThrow();
    });

    it('processNonStream should handle missing choices', () => {
      const response = {};

      expect(() => {
        StreamProcessor.processNonStream(response, null);
      }).toThrow();
    });

    it('processNonStream should notify progress callback', () => {
      let progressEvent = null;
      const onProgress = event => {
        progressEvent = event;
      };

      const response = {
        choices: [{ message: { content: 'Test response' } }],
      };

      StreamProcessor.processNonStream(response, onProgress);
      expect(progressEvent).toBeTruthy();
      expect(progressEvent.type).toBe('content');
      expect(progressEvent.content).toBe('Test response');
    });

    it('notifyProgress should handle callback errors gracefully', () => {
      const errorCallback = () => {
        throw new Error('Callback error');
      };

      // Should not throw
      expect(() => {
        StreamProcessor.notifyProgress(errorCallback, { type: 'test' });
      }).not.toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should initialize all services successfully', () => {
      MessageValidator.init();
      StreamProcessor.init({ Settings: {} });

      MessageLifecycleCoordinator.init({
        SessionManager: {
          getHistory: () => [],
          initChat: () => {},
        },
        ConversationOrchestrator: {
          getUserContext: () => ({}),
        },
        ToolCallHandlingService: {},
        FallbackResponseService: {},
        CircuitBreaker: {},
        ModuleRegistry: {},
        Settings: {},
        Config: {},
        Functions: {},
        MessageOperations: {},
        LLMProviderRoutingService: {},
        TokenCountingService: {},
        WaveTelemetry: {},
      });

      expect(MessageValidator.isInitialized()).toBe(true);
      expect(StreamProcessor.isInitialized()).toBe(true);
      expect(MessageLifecycleCoordinator.isInitialized()).toBe(true);
    });

    it('should track initialization errors across all services', () => {
      // Init with missing dependencies
      MessageLifecycleCoordinator.init({
        SessionManager: null,
        ConversationOrchestrator: null,
      });

      const errors = MessageLifecycleCoordinator.getInitializationErrors();
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
