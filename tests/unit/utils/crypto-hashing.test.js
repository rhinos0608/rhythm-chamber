import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashMessageContent,
  clearHashCache,
  getHashCacheSize,
  MessageHashCache,
} from '../../../js/utils/crypto-hashing.js';

describe('Crypto Hashing', () => {
  beforeEach(() => {
    clearHashCache();
  });

  it('should hash message content with SHA-256', async () => {
    const content = 'Test message';
    const hash = await hashMessageContent(content);
    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64);
  });

  it('should return empty string for empty content', async () => {
    const hash = await hashMessageContent('');
    expect(hash).toBe('');
  });

  it('should cache hash results', async () => {
    const content = 'Test message';
    const hash1 = await hashMessageContent(content);
    const hash2 = await hashMessageContent(content);
    expect(hash1).toBe(hash2);
    expect(getHashCacheSize()).toBe(1);
  });

  it('should clear cache', async () => {
    await hashMessageContent('test1');
    await hashMessageContent('test2');
    expect(getHashCacheSize()).toBe(2);
    clearHashCache();
    expect(getHashCacheSize()).toBe(0);
  });

  it('should evict oldest entries when at capacity', () => {
    const cache = new MessageHashCache(3);
    cache.set('msg1', 'hash1');
    cache.set('msg2', 'hash2');
    cache.set('msg3', 'hash3');
    expect(cache.size).toBe(3);
    cache.set('msg4', 'hash4');
    expect(cache.size).toBe(3);
    expect(cache.get('msg1')).toBeNull();
  });
});
