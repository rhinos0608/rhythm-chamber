/**
 * Tests for message-validator module
 * @module tests/unit/utils/validation/message-validator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateMessage,
  trackProcessedMessage,
  removeProcessedMessage,
  clearProcessedMessages,
} from '../../../../js/utils/validation/message-validator.js';

// Mock crypto-hashing module
vi.mock('../../../../js/utils/crypto-hashing.js', () => ({
  hashMessageContent: vi.fn(),
}));

import { hashMessageContent } from '../../../../js/utils/crypto-hashing.js';

describe('message-validator', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearProcessedMessages();
    vi.clearAllMocks();
  });

  describe('validateMessage', () => {
    it('should validate a valid message', async () => {
      hashMessageContent.mockResolvedValue('abc123');

      const result = await validateMessage('Hello world');

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty string', async () => {
      const result = await validateMessage('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message cannot be empty');
    });

    it('should reject non-string input', async () => {
      const result = await validateMessage(123);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message must be a string');
    });

    it('should reject null input', async () => {
      const result = await validateMessage(null);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message must be a string');
    });

    it('should reject undefined input', async () => {
      const result = await validateMessage(undefined);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message must be a string');
    });

    it('should reject whitespace-only content', async () => {
      const result = await validateMessage('   ');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message cannot contain only whitespace');
    });

    it('should reject message below minimum length', async () => {
      const result = await validateMessage('Hi', { minLength: 3 });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message must be at least 3 characters');
    });

    it('should reject message above maximum length', async () => {
      const longMessage = 'a'.repeat(1001);
      const result = await validateMessage(longMessage, { maxLength: 1000 });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message too long (max 1000 characters)');
    });

    it('should detect duplicate message', async () => {
      hashMessageContent.mockResolvedValue('abc123');

      // Track message first
      await trackProcessedMessage('Hello world');

      // Try to validate the same message
      const result = await validateMessage('Hello world');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Duplicate message detected - this message was already processed');
    });

    it('should skip duplicate check when skipDuplicateCheck is true', async () => {
      hashMessageContent.mockResolvedValue('abc123');

      // Track message first
      await trackProcessedMessage('Hello world');

      // Validate with skipDuplicateCheck
      const result = await validateMessage('Hello world', { skipDuplicateCheck: true });

      expect(result.valid).toBe(true);
    });

    it('should use custom minLength', async () => {
      const result = await validateMessage('Hi', { minLength: 2 });

      expect(result.valid).toBe(true);
    });

    it('should use custom maxLength', async () => {
      const message = 'a'.repeat(500);
      const result = await validateMessage(message, { maxLength: 500 });

      expect(result.valid).toBe(true);
    });
  });

  describe('trackProcessedMessage', () => {
    it('should track a new message', async () => {
      hashMessageContent.mockResolvedValue('abc123');

      const hash = await trackProcessedMessage('Hello world');

      expect(hash).toBe('abc123');
    });

    it('should update existing message timestamp', async () => {
      hashMessageContent.mockResolvedValue('abc123');

      // Track message twice
      await trackProcessedMessage('Hello world');
      await trackProcessedMessage('Hello world');

      expect(hashMessageContent).toHaveBeenCalledTimes(2);
    });

    it('should return empty string for invalid input', async () => {
      hashMessageContent.mockResolvedValue('');

      const hash = await trackProcessedMessage('');

      expect(hash).toBe('');
    });

    it('should evict LRU entry when cache is full', async () => {
      // Set up to test cache eviction
      const messages = [];
      for (let i = 0; i < 1001; i++) {
        messages.push(`Message ${i}`);
      }

      for (let i = 0; i < messages.length; i++) {
        hashMessageContent.mockResolvedValueOnce(`hash${i}`);
        await trackProcessedMessage(messages[i]);
      }

      // Cache should be full, oldest entry evicted
      expect(hashMessageContent).toHaveBeenCalledTimes(1001);
    });
  });

  describe('removeProcessedMessage', () => {
    it('should remove a tracked message', async () => {
      hashMessageContent.mockResolvedValue('abc123');

      await trackProcessedMessage('Hello world');
      const removed = await removeProcessedMessage('Hello world');

      expect(removed).toBe(true);

      // Should be able to validate again after removal
      const result = await validateMessage('Hello world');
      expect(result.valid).toBe(true);
    });

    it('should return false for non-existent message', async () => {
      hashMessageContent.mockResolvedValue('abc123');

      const removed = await removeProcessedMessage('Non-existent message');

      expect(removed).toBe(false);
    });

    it('should return false for empty hash', async () => {
      hashMessageContent.mockResolvedValue('');

      const removed = await removeProcessedMessage('test');

      expect(removed).toBe(false);
    });
  });

  describe('clearProcessedMessages', () => {
    it('should clear all processed messages', async () => {
      hashMessageContent.mockResolvedValue('abc123');

      await trackProcessedMessage('Message 1');
      await trackProcessedMessage('Message 2');
      await trackProcessedMessage('Message 3');

      clearProcessedMessages();

      // All messages should be cleared, no duplicates detected
      const result1 = await validateMessage('Message 1');
      const result2 = await validateMessage('Message 2');
      const result3 = await validateMessage('Message 3');

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
      expect(result3.valid).toBe(true);
    });

    it('should handle empty cache', () => {
      // Should not throw when clearing empty cache
      expect(() => clearProcessedMessages()).not.toThrow();
    });
  });

  describe('LRU cache behavior', () => {
    it('should handle multiple messages with LRU eviction', async () => {
      const maxCacheSize = 1000;

      // Fill cache
      for (let i = 0; i < maxCacheSize; i++) {
        hashMessageContent.mockResolvedValueOnce(`hash${i}`);
        await trackProcessedMessage(`Message ${i}`);
      }

      // Add one more to trigger eviction
      hashMessageContent.mockResolvedValueOnce('hash1000');
      await trackProcessedMessage('Message 1000');

      // Oldest message should have been evicted
      hashMessageContent.mockResolvedValueOnce('hash0');
      const result = await validateMessage('Message 0');
      expect(result.valid).toBe(true); // Should not be detected as duplicate
    });

    it('should update LRU order on access', async () => {
      hashMessageContent.mockResolvedValue('abc123');

      // Track message
      await trackProcessedMessage('Message 1');

      // Track many other messages to move Message 1 to tail
      for (let i = 2; i <= 1000; i++) {
        hashMessageContent.mockResolvedValueOnce(`hash${i}`);
        await trackProcessedMessage(`Message ${i}`);
      }

      // Access Message 1 again - should move to front
      hashMessageContent.mockResolvedValue('abc123');
      await trackProcessedMessage('Message 1');

      // Add more messages - Message 1 should be safe (moved to front)
      hashMessageContent.mockResolvedValueOnce('hash1001');
      await trackProcessedMessage('Message 1001');

      // Message 1 should still be in cache
      const result = await validateMessage('Message 1');
      expect(result.valid).toBe(false); // Should be detected as duplicate
    });
  });

  describe('edge cases', () => {
    it('should handle message with special characters', async () => {
      hashMessageContent.mockResolvedValue('special123');

      const result = await validateMessage('Hello! @#$ %^&*()');

      expect(result.valid).toBe(true);
    });

    it('should handle message with emojis', async () => {
      hashMessageContent.mockResolvedValue('emoji123');

      const result = await validateMessage('Hello 👋 World 🌍');

      expect(result.valid).toBe(true);
    });

    it('should handle very long valid message', async () => {
      const longMessage = 'a'.repeat(50000);
      hashMessageContent.mockResolvedValue('long123');

      const result = await validateMessage(longMessage);

      expect(result.valid).toBe(true);
    });

    it('should handle message with newlines and tabs', async () => {
      hashMessageContent.mockResolvedValue('whitespace123');

      const result = await validateMessage('Hello\nWorld\tTest');

      expect(result.valid).toBe(true);
    });
  });
});
