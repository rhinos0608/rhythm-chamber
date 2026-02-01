/**
 * Unit Tests for Vector Store Cache
 * @module tests/unit/vector-store/cache
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVectorCache } from '/Users/rhinesharar/rhythm-chamber/js/vector-store/cache.js';

describe('Vector Store Cache', () => {
  let cache;
  let evictedKeys;

  beforeEach(() => {
    evictedKeys = [];
    cache = createVectorCache(5, key => {
      evictedKeys.push(key);
    });
  });

  describe('Basic CRUD Operations', () => {
    it('should store and retrieve vectors', () => {
      const vector = { id: 'test-1', embedding: [1, 2, 3] };
      cache.set('test-1', vector);
      expect(cache.get('test-1')).toEqual(vector);
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('non-existent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('test-1', { id: 'test-1' });
      expect(cache.has('test-1')).toBe(true);
      expect(cache.has('non-existent')).toBe(false);
    });

    it('should delete vectors', () => {
      cache.set('test-1', { id: 'test-1' });
      cache.delete('test-1');
      expect(cache.has('test-1')).toBe(false);
      expect(cache.get('test-1')).toBeUndefined();
    });

    it('should clear all vectors', () => {
      cache.set('test-1', { id: 'test-1' });
      cache.set('test-2', { id: 'test-2' });
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.has('test-1')).toBe(false);
    });
  });

  describe('Size Management', () => {
    it('should track cache size', () => {
      expect(cache.size).toBe(0);
      cache.set('test-1', { id: 'test-1' });
      expect(cache.size).toBe(1);
      cache.set('test-2', { id: 'test-2' });
      expect(cache.size).toBe(2);
    });

    it('should evict oldest entry when max size exceeded', () => {
      cache.set('test-1', { id: 'test-1' });
      cache.set('test-2', { id: 'test-2' });
      cache.set('test-3', { id: 'test-3' });
      cache.set('test-4', { id: 'test-4' });
      cache.set('test-5', { id: 'test-5' });
      expect(cache.size).toBe(5);

      cache.set('test-6', { id: 'test-6' });
      expect(cache.size).toBe(5);
      expect(cache.has('test-1')).toBe(false);
      expect(evictedKeys).toContain('test-1');
    });

    it('should update size correctly after deletion', () => {
      cache.set('test-1', { id: 'test-1' });
      cache.set('test-2', { id: 'test-2' });
      cache.delete('test-1');
      expect(cache.size).toBe(1);
    });
  });

  describe('Pinning', () => {
    it('should pin a vector to prevent eviction', () => {
      cache.set('test-1', { id: 'test-1' });
      cache.pin('test-1');

      // Fill beyond max size
      cache.set('test-2', { id: 'test-2' });
      cache.set('test-3', { id: 'test-3' });
      cache.set('test-4', { id: 'test-4' });
      cache.set('test-5', { id: 'test-5' });
      cache.set('test-6', { id: 'test-6' });

      // Pinned item should still be there
      expect(cache.has('test-1')).toBe(true);
      expect(cache.size).toBe(5);
      expect(cache.pinnedCount).toBe(1);
    });

    it('should unpin a vector to allow eviction', () => {
      cache.set('test-1', { id: 'test-1' });
      cache.pin('test-1');
      expect(cache.isPinned('test-1')).toBe(true);

      cache.unpin('test-1');
      expect(cache.isPinned('test-1')).toBe(false);
    });

    it('should track pinned count', () => {
      cache.set('test-1', { id: 'test-1' });
      cache.set('test-2', { id: 'test-2' });
      cache.pin('test-1');
      cache.pin('test-2');
      expect(cache.pinnedCount).toBe(2);

      cache.unpin('test-1');
      expect(cache.pinnedCount).toBe(1);
    });
  });

  describe('Iteration', () => {
    beforeEach(() => {
      cache.set('test-1', { id: 'test-1' });
      cache.set('test-2', { id: 'test-2' });
      cache.set('test-3', { id: 'test-3' });
    });

    it('should iterate entries', () => {
      const entries = Array.from(cache.entries());
      expect(entries).toHaveLength(3);
      expect(entries[0][0]).toBe('test-1');
      expect(entries[0][1]).toEqual({ id: 'test-1' });
    });

    it('should iterate keys', () => {
      const keys = Array.from(cache.keys());
      expect(keys).toEqual(['test-1', 'test-2', 'test-3']);
    });

    it('should iterate values', () => {
      const values = Array.from(cache.values());
      expect(values).toEqual([{ id: 'test-1' }, { id: 'test-2' }, { id: 'test-3' }]);
    });

    it('should support Symbol.iterator', () => {
      const pairs = Array.from(cache);
      expect(pairs).toHaveLength(3);
      expect(pairs[0][0]).toBe('test-1');
    });
  });

  describe('Statistics', () => {
    it('should return cache statistics', () => {
      cache.set('test-1', { id: 'test-1' });
      cache.set('test-2', { id: 'test-2' });

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
      expect(typeof stats.hitCount).toBe('number');
      expect(typeof stats.missCount).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
      expect(stats.utilization).toBe(0.4); // 2/5
    });
  });

  describe('Configuration', () => {
    it('should allow setting max size', () => {
      cache.setMaxSize(10);
      for (let i = 0; i < 15; i++) {
        cache.set(`test-${i}`, { id: `test-${i}` });
      }
      expect(cache.size).toBe(10);
    });

    it('should enable auto-scale', () => {
      cache.enableAutoScale(true);
      // Auto-scale is handled by underlying LRUCache
      // Just verify method exists and doesn't throw
      expect(() => cache.enableAutoScale(false)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null onEvict callback', () => {
      const noCallbackCache = createVectorCache(5, null);
      expect(() => {
        for (let i = 0; i < 10; i++) {
          noCallbackCache.set(`test-${i}`, { id: `test-${i}` });
        }
      }).not.toThrow();
    });

    it('should handle default max size', () => {
      const defaultCache = createVectorCache();
      expect(() => {
        defaultCache.set('test-1', { id: 'test-1' });
      }).not.toThrow();
    });

    it('should handle pinning non-existent key', () => {
      expect(() => cache.pin('non-existent')).not.toThrow();
      expect(() => cache.unpin('non-existent')).not.toThrow();
    });

    it('should handle deleting non-existent key', () => {
      expect(() => cache.delete('non-existent')).not.toThrow();
      expect(cache.size).toBe(0);
    });
  });
});
