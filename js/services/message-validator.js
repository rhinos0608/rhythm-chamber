/**
 * Message Validator Service
 *
 * Handles message validation, duplicate detection, and content safety checks.
 * Extracted from MessageLifecycleCoordinator to separate validation concerns.
 *
 * Responsibilities:
 * - Message content validation (length, type, whitespace)
 * - Duplicate detection using content hashing
 * - Cross-tab duplicate prevention
 *
 * @module services/message-validator
 */

'use strict';

// ==========================================
// Constants
// ==========================================

const MAX_MESSAGE_LENGTH = 50000; // 50k characters
const MAX_HASH_CACHE_SIZE = 1000;

// ==========================================
// State Management
// ==========================================

// ==========================================
// LRU Cache Implementation
// ==========================================

/**
 * Proper LRU (Least Recently Used) Cache
 *
 * Uses a combination of:
 * - Map for O(1) hash lookups
 * - Doubly-linked list for access order tracking
 *
 * Operations:
 * - get(): Move to most-recently-used position (end of list)
 * - set(): Add to most-recently-used, evict least-recently-used if full
 *
 * This ensures we evict the LEAST RECENTLY USED item, not the oldest inserted.
 */
class LRUCache {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.cache = new Map(); // hash -> node
        this.head = null; // least recently used
        this.tail = null; // most recently used
    }

    /**
     * Move node to most-recently-used position (end of list)
     */
    _moveToMRU(node) {
        if (node === this.tail) return; // Already at MRU

        // Remove from current position
        if (node.prev) {
            node.prev.next = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        }

        // Update head if removing head
        if (node === this.head) {
            this.head = node.next;
        }

        // Add to tail (MRU)
        node.prev = this.tail;
        node.next = null;
        if (this.tail) {
            this.tail.next = node;
        }
        this.tail = node;

        // Update head if this is the only node
        if (!this.head) {
            this.head = node;
        }
    }

    /**
     * Add new node to most-recently-used position
     */
    _addToMRU(hash) {
        const node = { hash, prev: this.tail, next: null };

        if (this.tail) {
            this.tail.next = node;
        }
        this.tail = node;

        if (!this.head) {
            this.head = node;
        }

        return node;
    }

    /**
     * Remove and return the least-recently-used node
     */
    _removeLRU() {
        if (!this.head) return null;

        const lruHash = this.head.hash;
        const lruNode = this.head;

        // Remove from list
        this.head = this.head.next;
        if (this.head) {
            this.head.prev = null;
        } else {
            this.tail = null;
        }

        return { hash: lruHash, node: lruNode };
    }

    /**
     * Check if hash exists and move to MRU
     */
    has(hash) {
        const exists = this.cache.has(hash);
        if (exists) {
            // Move to MRU on access
            const node = this.cache.get(hash);
            this._moveToMRU(node);
        }
        return exists;
    }

    /**
     * Add hash to cache, evicting LRU if full
     */
    set(hash) {
        // If already exists, just move to MRU
        if (this.cache.has(hash)) {
            const node = this.cache.get(hash);
            this._moveToMRU(node);
            return;
        }

        // Evict LRU if at capacity
        if (this.cache.size >= this.maxSize) {
            const { hash: lruHash } = this._removeLRU();
            this.cache.delete(lruHash);

            if (typeof window !== 'undefined' && window.__DEBUG_LRU_EVICTION) {
                console.log(`[LRU Eviction] Evicting least recently used hash ${lruHash}`);
            }
        }

        // Add new entry at MRU
        const node = this._addToMRU(hash);
        this.cache.set(hash, node);
    }

    /**
     * Delete a hash from cache
     */
    delete(hash) {
        const node = this.cache.get(hash);
        if (!node) return;

        // Remove from linked list
        if (node.prev) {
            node.prev.next = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        }
        if (node === this.head) {
            this.head = node.next;
        }
        if (node === this.tail) {
            this.tail = node.prev;
        }

        this.cache.delete(hash);
    }

    /**
     * Clear all entries
     */
    clear() {
        this.cache.clear();
        this.head = null;
        this.tail = null;
    }

    /**
     * Get cache size
     */
    get size() {
        return this.cache.size;
    }

    /**
     * Get all hashes in order from LRU to MRU
     */
    getOrderedHashes() {
        const hashes = [];
        let current = this.head;
        while (current) {
            hashes.push(current.hash);
            current = current.next;
        }
        return hashes;
    }
}

// Track processed message hashes for deduplication with LRU eviction
const _processedMessageHashes = new LRUCache(MAX_HASH_CACHE_SIZE);

// Initialization state flag
let _isInitialized = false;

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize MessageValidator service
 * Although this service is mostly stateless, we provide init() for consistency
 * and to allow for future dependency injection
 */
function init() {
    _isInitialized = true;
    console.log('[MessageValidator] Initialized');
}

/**
 * Check if service is initialized
 * @returns {boolean} True if initialized
 */
function isInitialized() {
    return _isInitialized;
}

/**
 * Ensure service is initialized, throw if not
 * @throws {Error} If service not initialized
 */
function requireInitialized() {
    if (!_isInitialized) {
        throw new Error('[MessageValidator] Service not initialized. Call init() first.');
    }
}

// ==========================================
// Hash Functions
// ==========================================

/**
 * Generate a simple hash for message content (FNV-1a inspired)
 * Used for duplicate detection without requiring crypto APIs
 * @param {string} content - The message content to hash
 * @returns {string} Hex string hash
 */
function hashMessageContent(content) {
    if (!content || typeof content !== 'string') return '';

    let hash = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) {
        hash ^= content.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
}

// ==========================================
// Validation Functions
// ==========================================

/**
 * Validate message content before processing
 * @param {string} message - The message to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.skipDuplicateCheck - Skip duplicate content check (for regeneration)
 * @returns {Object} Validation result with valid flag and error message
 */
function validateMessage(message, { skipDuplicateCheck = false } = {}) {
    // Check initialization (but allow basic validation without init for backward compatibility)
    // Full duplicate detection requires initialization
    // Check for non-string input
    if (typeof message !== 'string') {
        return {
            valid: false,
            error: 'Message must be a string',
        };
    }

    // Check for empty string
    if (message.length === 0) {
        return {
            valid: false,
            error: 'Message cannot be empty',
        };
    }

    // Check for whitespace-only content
    if (message.trim().length === 0) {
        return {
            valid: false,
            error: 'Message cannot contain only whitespace',
        };
    }

    // Check for unreasonably long messages (prevent abuse/DoS)
    if (message.length > MAX_MESSAGE_LENGTH) {
        return {
            valid: false,
            error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`,
        };
    }

    // Check for duplicate content (skip if regenerating)
    if (!skipDuplicateCheck) {
        const messageHash = hashMessageContent(message);
        if (_processedMessageHashes.has(messageHash)) {
            // LRU cache already moved this to MRU position in has()
            return {
                valid: false,
                error: 'Duplicate message detected - this message was already processed',
            };
        }
    }

    return { valid: true };
}

/**
 * Add a message hash to the processed set
 * Implements proper LRU (Least Recently Used) eviction when cache is full
 *
 * @param {string} message - The message whose hash to add
 */
function trackProcessedMessage(message) {
    const messageHash = hashMessageContent(message);
    if (messageHash) {
        // LRU cache handles eviction automatically
        _processedMessageHashes.set(messageHash);
    }
}

/**
 * Remove a message hash from the processed set
 * Used when regenerating a message to allow re-processing
 * @param {string} message - The message whose hash to remove
 */
function removeProcessedHash(message) {
    const messageHash = hashMessageContent(message);
    if (messageHash) {
        _processedMessageHashes.delete(messageHash);
    }
}

/**
 * Clear duplicate detection cache
 * Useful for testing or when intentional re-submission is needed
 */
function clearDuplicateCache() {
    _processedMessageHashes.clear();
}

/**
 * Get cache statistics for monitoring
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
    return {
        size: _processedMessageHashes.size,
        maxSize: MAX_HASH_CACHE_SIZE,
        usagePercent: (_processedMessageHashes.size / MAX_HASH_CACHE_SIZE) * 100,
    };
}

// ==========================================
// Public API
// ==========================================

const MessageValidator = {
    init,
    isInitialized,
    validateMessage,
    trackProcessedMessage,
    removeProcessedHash,
    clearDuplicateCache,
    getCacheStats,
    hashMessageContent, // Exported for testing
};

// ES Module export
export { MessageValidator };

console.log('[MessageValidator] Service loaded');
