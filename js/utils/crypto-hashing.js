/**
 * Message Content Hashing
 *
 * SHA-256 hashing with LRU cache for duplicate detection.
 * Provides fallback hashing when crypto API unavailable.
 *
 * @module utils/crypto-hashing
 */

const MAX_HASH_CACHE_SIZE = 1000;

// ==========================================
// LRU Cache Implementation
// ==========================================

class MessageHashCache {
  constructor(maxSize = MAX_HASH_CACHE_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(content) {
    const entry = this.cache.get(content);
    if (entry) {
      this.cache.delete(content);
      this.cache.set(content, entry);
      return entry.hash;
    }
    return null;
  }

  set(content, hash) {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(content, {
      hash,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

const hashCache = new MessageHashCache();

/**
 * Generate SHA-256 hash of message content
 */
export async function hashMessageContent(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  const cached = hashCache.get(content);
  if (cached) {
    return cached;
  }

  let hash;

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.warn('[CryptoHashing] Crypto API unavailable, using fallback');

    let h1 = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) {
      h1 ^= content.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }

    let h2 = 0x811c9dc5;
    for (let i = content.length - 1; i >= 0; i--) {
      h2 ^= content.charCodeAt(i);
      h2 = Math.imul(h2, 0x01000193);
    }

    hash = ((h1 >>> 0) + '_' + (h2 >>> 0)).toString(16);
  }

  hashCache.set(content, hash);
  return hash;
}

export function clearHashCache() {
  hashCache.clear();
}

export function getHashCacheSize() {
  return hashCache.size;
}

export { MessageHashCache };
