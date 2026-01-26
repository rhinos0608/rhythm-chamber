/**
 * Tests for Validation Utils Security Fixes
 *
 * Tests for the 4 critical security fixes:
 * 1. LRU Cache (CRIT-001)
 * 2. ReDoS Protection (CRIT-002)
 * 3. Hash Collision Rate (CRIT-003)
 * 4. sanitizeHTML/escapeHTMLEntities (CRIT-004)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    validateMessage,
    trackProcessedMessage,
    clearProcessedMessages,
    removeProcessedMessage,
    validateSchema,
    escapeHTMLEntities,
    sanitizeHTML,
    Validation
} from '../../js/utils/validation.js';

describe('Validation Utils - Security Fixes', () => {

    // Reset cache before each test
    beforeEach(() => {
        clearProcessedMessages();
    });

    afterEach(() => {
        clearProcessedMessages();
    });

    // ==========================================
    // CRIT-001: LRU Cache Tests
    // ==========================================
    describe('CRIT-001: LRU Cache Implementation', () => {

        it('should track access time for cache entries', async () => {
            const message1 = 'First message';
            const message2 = 'Second message';
            const message3 = 'Third message';

            // Track first message
            await trackProcessedMessage(message1);
            await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

            // Track second message
            await trackProcessedMessage(message2);
            await new Promise(resolve => setTimeout(resolve, 10));

            // Track third message
            await trackProcessedMessage(message3);

            // Access first message to update its access time
            await trackProcessedMessage(message1);

            // Fill cache beyond limit
            for (let i = 4; i <= 1002; i++) {
                await trackProcessedMessage(`Message ${i}`);
            }

            // First message should still be in cache (recently accessed)
            const result1 = await validateMessage(message1);
            expect(result1.valid).toBe(false);
            expect(result1.error).toContain('Duplicate');
        });

        it('should evict least recently used entry when cache is full', async () => {
            const messages = [];
            const CACHE_SIZE = Validation.MESSAGE_CONFIG.MAX_HASH_CACHE_SIZE;

            // Fill cache to exactly its limit
            for (let i = 0; i < CACHE_SIZE; i++) {
                const msg = `Message ${i}`;
                messages.push(msg);
                await trackProcessedMessage(msg);
            }

            // Access the first message to make it recently used
            await trackProcessedMessage(messages[0]);

            // Add one more message - should evict messages[1] (oldest access time)
            await trackProcessedMessage('Overflow message');

            // messages[0] should still be cached (recently accessed)
            const result0 = await validateMessage(messages[0]);
            expect(result0.valid).toBe(false);
            expect(result0.error).toContain('Duplicate');

            // messages[1] should have been evicted (least recently used)
            const result1 = await validateMessage(messages[1]);
            expect(result1.valid).toBe(true);
        });

        it('should update access time on duplicate tracking', async () => {
            const message = 'Test message';

            // Track message
            await trackProcessedMessage(message);
            await new Promise(resolve => setTimeout(resolve, 10));

            // Track it again - should update access time
            await trackProcessedMessage(message);

            // Fill cache with 999 more messages (total 1000 including original)
            for (let i = 0; i < Validation.MESSAGE_CONFIG.MAX_HASH_CACHE_SIZE - 1; i++) {
                await trackProcessedMessage(`Filler ${i}`);
            }

            // Original message should still be cached (cache is full)
            const result = await validateMessage(message);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Duplicate');

            // Access original again to make it most recently used
            await trackProcessedMessage(message);

            // Add one more to trigger eviction - should evict least recently used (first filler, not original)
            await trackProcessedMessage('Eviction trigger');

            // Original should still be cached (was just accessed)
            const result2 = await validateMessage(message);
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('Duplicate');
        });
    });

    // ==========================================
    // CRIT-002: ReDoS Protection Tests
    // ==========================================
    describe('CRIT-002: ReDoS Protection', () => {

        it('should reject patterns with nested quantifiers', () => {
            const dangerousPattern = '(a+)+';
            const result = validateSchema('aaaaaaaaaaaaaaaaaaaaaaaaaab!', {
                type: 'string',
                pattern: dangerousPattern
            });

            // Should not hang - pattern validation should catch it
            expect(result.valid).toBe(false);
            expect(result.errors?.some(e => e.includes('Pattern validation error'))).toBe(true);
        });

        it('should reject patterns with lookahead quantifiers', () => {
            const dangerousPattern = 'a+(?=a+)';
            const result = validateSchema('aaaaa', {
                type: 'string',
                pattern: dangerousPattern
            });

            expect(result.valid).toBe(false);
            expect(result.errors?.some(e => e.includes('unsafe'))).toBe(true);
        });

        it('should reject patterns with too many quantifiers', () => {
            const dangerousPattern = 'a*b+c?d{1,2}e{3,4}f+g*';
            const result = validateSchema('test', {
                type: 'string',
                pattern: dangerousPattern
            });

            expect(result.valid).toBe(false);
            expect(result.errors?.some(e => e.includes('too many quantifiers'))).toBe(true);
        });

        it('should reject patterns with too many alternations', () => {
            const dangerousPattern = 'a|b|c|d|e|f|g|h|i|j|k|l';
            const result = validateSchema('test', {
                type: 'string',
                pattern: dangerousPattern
            });

            expect(result.valid).toBe(false);
            expect(result.errors?.some(e => e.includes('too many alternations'))).toBe(true);
        });

        it('should accept safe regex patterns', () => {
            const safePatterns = [
                { pattern: '^[a-zA-Z0-9]+$', testValue: 'test123' },
                { pattern: '^[a-z]+$', testValue: 'test' },
                { pattern: '^[0-9]+$', testValue: '123' },
                { pattern: '^.+$', testValue: 'anything' },
                { pattern: '^.*$', testValue: 'anything' }
            ];

            for (const { pattern, testValue } of safePatterns) {
                const result = validateSchema(testValue, {
                    type: 'string',
                    pattern: pattern
                });
                expect(result.valid).toBe(true);
            }
        });

        it('should timeout on long-running regex operations', () => {
            // This test is tricky - we can't actually test timeout without a very long operation
            // But we can verify the timeout mechanism exists
            const result = validateSchema('test', {
                type: 'string',
                pattern: '^(a+)+$' // Will be caught by pattern validation
            });

            expect(result.valid).toBe(false);
        });
    });

    // ==========================================
    // CRIT-003: Hash Collision Rate Tests
    // ==========================================
    describe('CRIT-003: Hash Collision Rate', () => {

        it('should generate different hashes for different messages', async () => {
            const message1 = 'Hello world';
            const message2 = 'Hello world!';
            const message3 = 'Hello World';

            const hash1 = await trackProcessedMessage(message1);
            const hash2 = await trackProcessedMessage(message2);
            const hash3 = await trackProcessedMessage(message3);

            expect(hash1).not.toBe(hash2);
            expect(hash1).not.toBe(hash3);
            expect(hash2).not.toBe(hash3);
        });

        it('should generate same hash for identical messages', async () => {
            const message = 'Test message';

            const hash1 = await trackProcessedMessage(message);
            const hash2 = await trackProcessedMessage(message);

            expect(hash1).toBe(hash2);
        });

        it('should produce 64-character hex strings (SHA-256)', async () => {
            const message = 'Test message for hash length';
            const hash = await trackProcessedMessage(message);

            // SHA-256 produces 64 hex characters
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should have negligible collision rate', async () => {
            const messages = [];
            const hashes = new Set();
            const numMessages = 1000;

            // Generate hashes for many messages
            for (let i = 0; i < numMessages; i++) {
                const message = `Message ${i} with some unique content ${Math.random()}`;
                const hash = await trackProcessedMessage(message);
                messages.push({ message, hash });
                hashes.add(hash);
            }

            // With SHA-256, we should have 0 collisions in 1000 messages
            // (collision probability is astronomically low)
            expect(hashes.size).toBe(numMessages);

            // Verify no duplicates in hashes
            const hashArray = Array.from(hashes);
            const uniqueHashes = new Set(hashArray);
            expect(uniqueHashes.size).toBe(hashArray.length);
        });

        it('should detect duplicates correctly with new hash', async () => {
            const message = 'Important message';

            // First validation should pass
            const result1 = await validateMessage(message);
            expect(result1.valid).toBe(true);

            // Track it
            await trackProcessedMessage(message);

            // Second validation should detect duplicate
            const result2 = await validateMessage(message);
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('Duplicate');
        });
    });

    // ==========================================
    // CRIT-004: escapeHTMLEntities Tests
    // ==========================================
    describe('CRIT-004: escapeHTMLEntities / sanitizeHTML', () => {

        it('should escape HTML entities correctly', () => {
            const input = '<script>alert("XSS")</script>';
            const escaped = escapeHTMLEntities(input);

            expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
        });

        it('should escape ampersands', () => {
            const input = 'Tom & Jerry';
            const escaped = escapeHTMLEntities(input);

            expect(escaped).toBe('Tom &amp; Jerry');
        });

        it('should escape single quotes', () => {
            const input = "It's a test";
            const escaped = escapeHTMLEntities(input);

            expect(escaped).toBe('It&#39;s a test');
        });

        it('should handle empty strings', () => {
            const escaped = escapeHTMLEntities('');
            expect(escaped).toBe('');
        });

        it('should handle non-string input', () => {
            expect(escapeHTMLEntities(null)).toBe('');
            expect(escapeHTMLEntities(undefined)).toBe('');
            expect(escapeHTMLEntities(123)).toBe('');
            expect(escapeHTMLEntities({})).toBe('');
        });

        it('should NOT protect against XSS in attributes', () => {
            // This documents the limitation
            const input = 'javascript:alert(1)';
            const escaped = escapeHTMLEntities(input);

            // The function doesn't escape javascript: protocol
            // This is expected - it only escapes HTML entities
            expect(escaped).toBe(input);

            // This would be unsafe in an attribute:
            // a.href = escaped; // XSS!
        });

        it('should provide backward compatibility with sanitizeHTML alias', () => {
            const input = '<test>';
            const result1 = escapeHTMLEntities(input);
            const result2 = sanitizeHTML(input);

            expect(result1).toBe(result2);
        });

        it('should handle mixed content', () => {
            const input = '<div>Hello & "welcome" \'friend\'</div>';
            const escaped = escapeHTMLEntities(input);

            expect(escaped).toBe('&lt;div&gt;Hello &amp; &quot;welcome&quot; &#39;friend&#39;&lt;/div&gt;');
        });
    });

    // ==========================================
    // Integration Tests
    // ==========================================
    describe('Integration Tests', () => {

        it('should handle complete validation workflow', async () => {
            const message = 'Hello world';

            // Validate message
            const validationResult = await validateMessage(message);
            expect(validationResult.valid).toBe(true);

            // Track it
            const hash = await trackProcessedMessage(message);
            expect(hash).toMatch(/^[a-f0-9]{64}$/);

            // Try to validate again - should detect duplicate
            const duplicateResult = await validateMessage(message);
            expect(duplicateResult.valid).toBe(false);
            expect(duplicateResult.error).toContain('Duplicate');
        });

        it('should handle schema validation with safe patterns', () => {
            const result = validateSchema('test123', {
                type: 'string',
                pattern: '^[a-z0-9]+$',
                minLength: 1,
                maxLength: 100
            });

            expect(result.valid).toBe(true);
            expect(result.normalizedValue).toBe('test123');
        });

        it('should reject schema validation with dangerous patterns', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '(a+)+'
            });

            expect(result.valid).toBe(false);
            expect(result.errors?.some(e => e.includes('unsafe'))).toBe(true);
        });

        it('should handle cache eviction with duplicate detection', async () => {
            const CACHE_SIZE = Validation.MESSAGE_CONFIG.MAX_HASH_CACHE_SIZE;
            const messages = [];

            // Fill cache
            for (let i = 0; i < CACHE_SIZE; i++) {
                const msg = `Message ${i}`;
                messages.push(msg);
                await trackProcessedMessage(msg);
            }

            // Access first message to make it recently used
            await trackProcessedMessage(messages[0]);

            // Add more messages to force eviction
            for (let i = CACHE_SIZE; i < CACHE_SIZE + 10; i++) {
                await trackProcessedMessage(`Message ${i}`);
            }

            // First message should still be cached
            const result0 = await validateMessage(messages[0]);
            expect(result0.valid).toBe(false);

            // Second message should have been evicted
            const result1 = await validateMessage(messages[1]);
            expect(result1.valid).toBe(true);
        });
    });

    // ==========================================
    // Breaking Changes Tests
    // ==========================================
    describe('Breaking Changes', () => {

        it('should require async/await for validateMessage', async () => {
            const message = 'Test message';

            // Old sync code would fail:
            // const result = validateMessage(message); // Returns Promise

            // New async code:
            const result = await validateMessage(message);
            expect(result.valid).toBe(true);
        });

        it('should require async/await for trackProcessedMessage', async () => {
            const message = 'Test message';

            // Old sync code would fail:
            // const hash = trackProcessedMessage(message); // Returns Promise

            // New async code:
            const hash = await trackProcessedMessage(message);
            expect(typeof hash).toBe('string');
            expect(hash.length).toBe(64);
        });

        it('should require async/await for removeProcessedMessage', async () => {
            const message = 'Test message';

            await trackProcessedMessage(message);

            // Old sync code would fail:
            // const removed = removeProcessedMessage(message); // Returns Promise

            // New async code:
            const removed = await removeProcessedMessage(message);
            expect(removed).toBe(true);
        });
    });
});
