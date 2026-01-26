/**
 * Message Validator Module
 *
 * Provides message validation and duplicate detection using LRU cache.
 * Extracted from validation.js to reduce module size and improve maintainability.
 *
 * Features:
 * - Message content validation (type, length, format)
 * - Duplicate detection using SHA-256 hashing
 * - LRU cache for processed message tracking
 * - Configurable validation rules
 *
 * @module utils/validation/message-validator
 */

import { hashMessageContent } from '../crypto-hashing.js';

// ==========================================
// Configuration
// ==========================================

/**
 * Message validation configuration
 */
const MESSAGE_CONFIG = {
    MIN_LENGTH: 1,
    MAX_LENGTH: 50000,
    MAX_HASH_CACHE_SIZE: 1000
};

/**
 * LRU cache for processed message hashes
 * Uses a doubly-linked list implemented with Map for O(1) access and eviction
 * Structure: Map<hash, {prev, next, timestamp}>
 * @private
 */
let _lruHead = null; // Most recently used
let _lruTail = null; // Least recently used
let _lruCache = new Map(); // hash -> node
let _lruSize = 0;

// ==========================================
// Public API
// ==========================================

/**
 * Validate a message content
 *
 * Checks for:
 * - Type validation (must be string)
 * - Empty string
 * - Whitespace-only content
 * - Maximum length
 * - Duplicate content (optional)
 *
 * @param {*} message - The message to validate
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.skipDuplicateCheck=false] - Skip duplicate content check
 * @param {number} [options.minLength=MESSAGE_CONFIG.MIN_LENGTH] - Minimum message length
 * @param {number} [options.maxLength=MESSAGE_CONFIG.MAX_LENGTH] - Maximum message length
 * @returns {Promise<ValidationResult>} Validation result (async due to hashing)
 *
 * @example
 * // Basic validation
 * const result = await validateMessage("Hello world");
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 *
 * @example
 * // Skip duplicate check for regeneration
 * const result = await validateMessage(regeneratedMessage, { skipDuplicateCheck: true });
 */
export async function validateMessage(message, options = {}) {
    const {
        skipDuplicateCheck = false,
        minLength = MESSAGE_CONFIG.MIN_LENGTH,
        maxLength = MESSAGE_CONFIG.MAX_LENGTH
    } = options;

    const errors = [];

    // Check for non-string input
    if (typeof message !== 'string') {
        return {
            valid: false,
            error: 'Message must be a string'
        };
    }

    // Check for empty string
    if (message.length === 0) {
        return {
            valid: false,
            error: 'Message cannot be empty'
        };
    }

    // Check for minimum length
    if (message.length < minLength) {
        return {
            valid: false,
            error: `Message must be at least ${minLength} character${minLength === 1 ? '' : 's'}`
        };
    }

    // Check for whitespace-only content
    if (message.trim().length === 0) {
        return {
            valid: false,
            error: 'Message cannot contain only whitespace'
        };
    }

    // Check for unreasonably long messages (prevent abuse/DoS)
    if (message.length > maxLength) {
        return {
            valid: false,
            error: `Message too long (max ${maxLength} characters)`
        };
    }

    // Check for duplicate content (skip if regenerating)
    if (!skipDuplicateCheck) {
        const messageHash = await hashMessageContent(message);
        if (_lruCache.has(messageHash)) {
            return {
                valid: false,
                error: 'Duplicate message detected - this message was already processed'
            };
        }
    }

    return { valid: true };
}

/**
 * Track a message as processed to prevent duplicates
 * Implements O(1) LRU eviction using doubly-linked list
 *
 * @param {string} message - The message to track
 * @returns {Promise<string>} The hash of the tracked message
 *
 * @example
 * await trackProcessedMessage(userMessage);
 */
export async function trackProcessedMessage(message) {
    const messageHash = await hashMessageContent(message);
    if (!messageHash) return messageHash;

    const now = Date.now();

    // Check if already exists
    if (_lruCache.has(messageHash)) {
        // Move to front (most recently used)
        _moveToFront(messageHash, now);
    } else {
        // Evict least recently used BEFORE adding if cache is full
        if (_lruSize >= MESSAGE_CONFIG.MAX_HASH_CACHE_SIZE) {
            _evictLRU();
        }

        // Create new node and add to front
        const newNode = {
            hash: messageHash,
            timestamp: now,
            prev: null,
            next: _lruHead
        };

        if (_lruHead) {
            _lruHead.prev = newNode;
        }
        _lruHead = newNode;

        if (!_lruTail) {
            _lruTail = newNode;
        }

        _lruCache.set(messageHash, newNode);
        _lruSize++;
    }

    return messageHash;
}

/**
 * Clear the duplicate detection cache
 * Useful for testing or when intentional re-submission is needed
 *
 * @example
 * clearProcessedMessages();
 */
export function clearProcessedMessages() {
    _lruCache.clear();
    _lruHead = null;
    _lruTail = null;
    _lruSize = 0;
}

/**
 * Remove a specific message from the processed cache
 * Useful for message regeneration
 *
 * @param {string} message - The message to remove from cache
 * @returns {Promise<boolean>} True if the message was in the cache
 *
 * @example
 * // Before regenerating a response
 * await removeProcessedMessage(originalMessage);
 */
export async function removeProcessedMessage(message) {
    const messageHash = await hashMessageContent(message);
    if (!messageHash) return false;

    const node = _lruCache.get(messageHash);
    if (!node) return false;

    // Remove from linked list
    if (node.prev) {
        node.prev.next = node.next;
    }
    if (node.next) {
        node.next.prev = node.prev;
    }

    // Update head/tail pointers
    if (node === _lruHead) {
        _lruHead = node.next;
    }
    if (node === _lruTail) {
        _lruTail = node.prev;
    }

    // Remove from cache
    _lruCache.delete(messageHash);
    _lruSize--;

    return true;
}

// ==========================================
// Private Helpers
// ==========================================

/**
 * Move an existing node to the front of the LRU list
 * @param {string} hash - The hash to move
 * @param {number} timestamp - New timestamp
 * @private
 */
function _moveToFront(hash, timestamp) {
    const node = _lruCache.get(hash);
    if (!node) return;

    // Update timestamp
    node.timestamp = timestamp;

    // If already at head, nothing to do
    if (node === _lruHead) return;

    // Remove from current position
    if (node.prev) {
        node.prev.next = node.next;
    }
    if (node.next) {
        node.next.prev = node.prev;
    }

    // Update tail if needed
    if (node === _lruTail) {
        _lruTail = node.prev;
    }

    // Move to front
    node.prev = null;
    node.next = _lruHead;
    if (_lruHead) {
        _lruHead.prev = node;
    }
    _lruHead = node;
}

/**
 * Evict the least recently used entry from the cache
 * @private
 */
function _evictLRU() {
    if (!_lruTail) return;

    // Remove tail from cache
    _lruCache.delete(_lruTail.hash);

    // Update tail pointer
    _lruTail = _lruTail.prev;
    if (_lruTail) {
        _lruTail.next = null;
    } else {
        // Cache is now empty
        _lruHead = null;
    }

    _lruSize--;
}

// ==========================================
// Exports
// ==========================================

export { MESSAGE_CONFIG };
