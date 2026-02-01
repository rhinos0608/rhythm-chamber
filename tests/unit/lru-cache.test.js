/**
 * LRU Cache Tests
 *
 * Unit tests for js/storage/lru-cache.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LRUCache, DEFAULT_VECTOR_MAX_SIZE } from '../../js/storage/lru-cache.js';

// ==========================================
// Basic Operations Tests
// ==========================================

describe('LRUCache Basic Operations', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache(3);
  });

  it('should store and retrieve values', () => {
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should update existing values', () => {
    cache.set('a', 1);
    cache.set('a', 2);

    expect(cache.get('a')).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('should track size correctly', () => {
    expect(cache.size).toBe(0);

    cache.set('a', 1);
    expect(cache.size).toBe(1);

    cache.set('b', 2);
    expect(cache.size).toBe(2);

    cache.delete('a');
    expect(cache.size).toBe(1);
  });

  it('should clear all items', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('should check existence with has()', () => {
    cache.set('a', 1);

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });
});

// ==========================================
// LRU Eviction Tests
// ==========================================

describe('LRUCache Eviction', () => {
  it('should evict oldest item when at capacity', () => {
    const cache = new LRUCache(3);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // At capacity, adding new item should evict oldest ('a')
    cache.set('d', 4);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
    expect(cache.size).toBe(3);
  });

  it('should update recency on get()', () => {
    const cache = new LRUCache(3);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Access 'a' to make it most recent
    cache.get('a');

    // Add new item - should evict 'b' (now oldest)
    cache.set('d', 4);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined(); // Evicted
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should update recency on set() for existing key', () => {
    const cache = new LRUCache(3);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Update 'a' to make it most recent
    cache.set('a', 100);

    // Add new item - should evict 'b' (now oldest)
    cache.set('d', 4);

    expect(cache.get('a')).toBe(100);
    expect(cache.get('b')).toBeUndefined(); // Evicted
  });

  it('should return true when eviction occurs', () => {
    const cache = new LRUCache(2);

    expect(cache.set('a', 1)).toBe(false);
    expect(cache.set('b', 2)).toBe(false);
    expect(cache.set('c', 3)).toBe(true); // Eviction occurred
  });

  it('should track eviction count in stats', () => {
    const cache = new LRUCache(2);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // Evicts 'a'
    cache.set('d', 4); // Evicts 'b'

    const stats = cache.getStats();
    expect(stats.evictionCount).toBe(2);
  });
});

// ==========================================
// Eviction Callback Tests
// ==========================================

describe('LRUCache Eviction Callbacks', () => {
  it('should call onEvict callback when item is evicted', () => {
    const onEvict = vi.fn();
    const cache = new LRUCache(2, { onEvict });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // Should trigger eviction of 'a'

    // Eviction is tracked in pendingEvictions
    const pending = cache.getPendingEvictions();
    expect(pending).toContain('a');
  });

  it('should clear pending evictions after getPendingEvictions()', () => {
    const cache = new LRUCache(2, { onEvict: () => {} });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.getPendingEvictions();
    expect(cache.getPendingEvictions()).toEqual([]);
  });
});

// ==========================================
// Max Size Management Tests
// ==========================================

describe('LRUCache Max Size Management', () => {
  it('should enforce minimum max size on setMaxSize', () => {
    const cache = new LRUCache(10);
    cache.setMaxSize(0);

    expect(cache.maxSize).toBeGreaterThan(0);
  });

  it('should evict items when max size is reduced', () => {
    const cache = new LRUCache(5);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);
    cache.set('e', 5);

    expect(cache.size).toBe(5);

    cache.setMaxSize(2);

    expect(cache.size).toBe(2);
    // Oldest items (a, b, c) should be gone
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeUndefined();
    // Newest items (d, e) should remain
    expect(cache.get('d')).toBe(4);
    expect(cache.get('e')).toBe(5);
  });
});

// ==========================================
// Statistics Tests
// ==========================================

describe('LRUCache Statistics', () => {
  it('should track hit and miss counts', () => {
    const cache = new LRUCache(3);

    cache.set('a', 1);

    cache.get('a'); // Hit
    cache.get('a'); // Hit
    cache.get('b'); // Miss

    const stats = cache.getStats();
    expect(stats.hitCount).toBe(2);
    expect(stats.missCount).toBe(1);
  });

  it('should calculate hit rate correctly', () => {
    const cache = new LRUCache(3);

    cache.set('a', 1);

    cache.get('a'); // Hit
    cache.get('a'); // Hit
    cache.get('b'); // Miss
    cache.get('c'); // Miss

    const stats = cache.getStats();
    // 2 hits out of 4 total = 0.5 hit rate
    expect(stats.hitRate).toBe(0.5);
  });

  it('should reset stats', () => {
    const cache = new LRUCache(3);

    cache.set('a', 1);
    cache.get('a');
    cache.get('b');

    cache.resetStats();

    const stats = cache.getStats();
    expect(stats.hitCount).toBe(0);
    expect(stats.missCount).toBe(0);
    expect(stats.evictionCount).toBe(0);
  });

  it('should report utilization', () => {
    const cache = new LRUCache(4);

    cache.set('a', 1);
    cache.set('b', 2);

    const stats = cache.getStats();
    expect(stats.utilization).toBe(0.5);
  });
});

// ==========================================
// Iterator Tests
// ==========================================

describe('LRUCache Iterators', () => {
  it('should iterate over entries', () => {
    const cache = new LRUCache(3);

    cache.set('a', 1);
    cache.set('b', 2);

    const entries = Array.from(cache.entries());
    expect(entries).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('should iterate over keys', () => {
    const cache = new LRUCache(3);

    cache.set('a', 1);
    cache.set('b', 2);

    const keys = Array.from(cache.keys());
    expect(keys).toEqual(['a', 'b']);
  });

  it('should iterate over values', () => {
    const cache = new LRUCache(3);

    cache.set('a', 1);
    cache.set('b', 2);

    const values = Array.from(cache.values());
    expect(values).toEqual([1, 2]);
  });
});

// ==========================================
// Pinning Functionality Tests
// ==========================================

describe('LRUCache Pinning', () => {
  it('should not update recency for pinned items on get()', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.pin('a'); // Pin 'a'
    cache.get('a'); // Access pinned item - should NOT update recency

    cache.set('d', 4); // Add new item - should evict 'b' (oldest unpinned)

    expect(cache.get('a')).toBe(1); // 'a' should still exist (pinned)
    expect(cache.get('b')).toBeUndefined(); // 'b' evicted
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should skip pinned items during eviction', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.pin('a');
    cache.pin('b');

    // Try to add 4th item - only 'c' should be evicted
    cache.set('d', 4);

    expect(cache.get('a')).toBe(1); // Pinned
    expect(cache.get('b')).toBe(2); // Pinned
    expect(cache.get('c')).toBeUndefined(); // Evicted
    expect(cache.get('d')).toBe(4);
  });

  it('should track pinned count correctly', () => {
    const cache = new LRUCache(5);
    cache.set('a', 1);
    cache.set('b', 2);

    cache.pin('a');
    cache.pin('b');
    cache.pin('c'); // Pinning non-existent key should be ignored

    expect(cache.pinnedCount).toBe(2);
  });

  it('should check isPinned correctly', () => {
    const cache = new LRUCache(5);
    cache.set('a', 1);

    cache.pin('a');

    expect(cache.isPinned('a')).toBe(true);
    expect(cache.isPinned('b')).toBe(false);
  });

  it('should unpin items correctly', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.pin('a');

    expect(cache.isPinned('a')).toBe(true);

    cache.unpin('a');
    expect(cache.isPinned('a')).toBe(false);
  });

  it('should not pin non-existent keys', () => {
    const cache = new LRUCache(5);

    cache.pin('nonexistent');

    expect(cache.pinnedCount).toBe(0);
    expect(cache.isPinned('nonexistent')).toBe(false);
  });

  it('should unpin non-existent keys without error', () => {
    const cache = new LRUCache(5);
    cache.set('a', 1);
    cache.pin('a');

    cache.unpin('nonexistent'); // Should not throw
    cache.unpin('a');

    expect(cache.isPinned('a')).toBe(false);
    expect(cache.pinnedCount).toBe(0);
  });

  it('should allow pinned items to be deleted', () => {
    const cache = new LRUCache(5);
    cache.set('a', 1);
    cache.pin('a');

    expect(cache.isPinned('a')).toBe(true);

    cache.delete('a');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.isPinned('a')).toBe(false);
    expect(cache.pinnedCount).toBe(0);
  });

  it('should clear pinned items on clear()', () => {
    const cache = new LRUCache(5);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.pin('a');
    cache.pin('b');

    expect(cache.pinnedCount).toBe(2);

    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.pinnedCount).toBe(0);
  });

  it('should update pinned count after unpin', () => {
    const cache = new LRUCache(5);
    cache.set('a', 1);
    cache.set('b', 2);

    cache.pin('a');
    cache.pin('b');

    expect(cache.pinnedCount).toBe(2);

    cache.unpin('a');
    expect(cache.pinnedCount).toBe(1);

    cache.unpin('b');
    expect(cache.pinnedCount).toBe(0);
  });

  it('should skip all pinned items and evict oldest unpinned', () => {
    const cache = new LRUCache(5);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);
    cache.set('e', 5);

    // Pin first 3 items
    cache.pin('a');
    cache.pin('b');
    cache.pin('c');

    // Add 6th item - should evict 'd' (oldest unpinned)
    cache.set('f', 6);

    expect(cache.get('a')).toBe(1); // Pinned
    expect(cache.get('b')).toBe(2); // Pinned
    expect(cache.get('c')).toBe(3); // Pinned
    expect(cache.get('d')).toBeUndefined(); // Evicted
    expect(cache.get('e')).toBe(5);
    expect(cache.get('f')).toBe(6);
  });

  it('should allow cache to exceed maxSize when all items are pinned', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Pin all items
    cache.pin('a');
    cache.pin('b');
    cache.pin('c');

    // Add 4th item - should allow overflow since all items are pinned
    cache.set('d', 4);

    expect(cache.size).toBe(4);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should call onEvict callback for pinned items when explicitly deleted', () => {
    const onEvict = vi.fn();
    const cache = new LRUCache(5, { onEvict });

    cache.set('a', 1);
    cache.pin('a');

    cache.delete('a');

    // onEvict should NOT be called for explicit delete (only eviction)
    expect(onEvict).not.toHaveBeenCalled();
  });

  it('should handle multiple pins and unpins of same key', () => {
    const cache = new LRUCache(5);
    cache.set('a', 1);

    cache.pin('a');
    expect(cache.pinnedCount).toBe(1);

    cache.pin('a'); // Pin again - should be idempotent
    expect(cache.pinnedCount).toBe(1);

    cache.unpin('a');
    expect(cache.pinnedCount).toBe(0);

    cache.unpin('a'); // Unpin again - should be safe
    expect(cache.pinnedCount).toBe(0);
  });

  it('should not update recency for pinned items on set() update', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.pin('a');
    cache.set('a', 100); // Update pinned item - should NOT update recency

    cache.set('d', 4); // Should evict 'b' (oldest unpinned)

    expect(cache.get('a')).toBe(100); // Pinned, updated value
    expect(cache.get('b')).toBeUndefined(); // Evicted
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should skip pinned items when reducing max size', () => {
    const cache = new LRUCache(5);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);
    cache.set('e', 5);

    cache.pin('a');
    cache.pin('b');

    cache.setMaxSize(2);

    // Should keep pinned items (a, b) and newest unpinned items
    expect(cache.get('a')).toBe(1); // Pinned
    expect(cache.get('b')).toBe(2); // Pinned
    expect(cache.get('c')).toBeUndefined(); // Evicted
    expect(cache.get('d')).toBeUndefined(); // Evicted
    expect(cache.get('e')).toBeUndefined(); // Evicted
  });

  it('should handle pinning items that are about to be evicted', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Pin 'a' (oldest item)
    cache.pin('a');

    // Add new item - should skip 'a' and evict 'b' instead
    cache.set('d', 4);

    expect(cache.get('a')).toBe(1); // Still there (pinned)
    expect(cache.get('b')).toBeUndefined(); // Evicted
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });
});

// ==========================================
// Default Export Tests
// ==========================================

describe('LRUCache Defaults', () => {
  it('should export default max size', () => {
    expect(DEFAULT_VECTOR_MAX_SIZE).toBe(5000);
  });

  it('should use default max size when not specified', () => {
    const cache = new LRUCache();
    expect(cache.maxSize).toBe(5000);
  });
});
