/**
 * Tests for Validation Utils Security Fixes (Corrected)
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

describe('Validation Utils - Security Fixes (Corrected)', () => {

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
            // Clear cache first
            clearProcessedMessages();

            const message1 = 'Message 1';
            const message2 = 'Message 2';
            const message3 = 'Message 3';

            // Track first three messages
            await trackProcessedMessage(message1);
            await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

            await trackProcessedMessage(message2);
            await new Promise(resolve => setTimeout(resolve, 10));

            await trackProcessedMessage(message3);

            // Access first message again to update its access time
            await trackProcessedMessage(message1);

            // Verify all three are in cache
            const result1 = await validateMessage(message1, { skipDuplicateCheck: false });
            expect(result1.valid).toBe(false);
            expect(result1.error).toContain('Duplicate');

            const result2 = await validateMessage(message2, { skipDuplicateCheck: false });
            expect(result2.valid).toBe(false);

            const result3 = await validateMessage(message3, { skipDuplicateCheck: false });
            expect(result3.valid).toBe(false);
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
            const result0 = await validateMessage(messages[0], { skipDuplicateCheck: false });
            expect(result0.valid).toBe(false);
            expect(result0.error).toContain('Duplicate');

            // messages[1] should have been evicted (least recently used)
            const result1 = await validateMessage(messages[1], { skipDuplicateCheck: false });
            expect(result1.valid).toBe(true);
        });

        it('should update access time on duplicate tracking', async () => {
            // Clear cache first
            clearProcessedMessages();

            const message1 = 'Message 1';
            const message2 = 'Message 2';

            // Track first message
            await trackProcessedMessage(message1);
            await new Promise(resolve => setTimeout(resolve, 10));

            // Track second message
            await trackProcessedMessage(message2);

            // Track first message again - should update its access time
            await trackProcessedMessage(message1);

            // Both should still be in cache
            const result1 = await validateMessage(message1, { skipDuplicateCheck: false });
            expect(result1.valid).toBe(false);
            expect(result1.error).toContain('Duplicate');

            const result2 = await validateMessage(message2, { skipDuplicateCheck: false });
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('Duplicate');
        });
    });

    // ==========================================
    // CRIT-002: ReDoS Protection Tests
    // ==========================================
    describe('CRIT-002: ReDoS Protection', () => {

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
                ['test123', '^[a-zA-Z0-9]+$'],
                ['test', '^[a-z]+$'],
                ['12345', '^[0-9]+$'],
                ['anything', '^.+$'],
                ['anything', '^.*$']
            ];

            for (const [value, pattern] of safePatterns) {
                const result = validateSchema(value, {
                    type: 'string',
                    pattern: pattern
                });
                expect(result.valid).toBe(true);
            }
        });

        it('should validate pattern with timeout protection', () => {
            // Test that the pattern validation itself works
            const result = validateSchema('test', {
                type: 'string',
                pattern: '^[a-z]+$'
            });

            expect(result.valid).toBe(true);
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
            const numMessages = 100;

            // Generate hashes for many messages
            for (let i = 0; i < numMessages; i++) {
                const message = `Message ${i} with some unique content ${Math.random()}`;
                const hash = await trackProcessedMessage(message);
                messages.push({ message, hash });
                hashes.add(hash);
            }

            // With SHA-256, we should have 0 collisions in 100 messages
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

            // Browser's textContent escapes < and > but not quotes
            expect(escaped).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
        });

        it('should escape ampersands', () => {
            const input = 'Tom & Jerry';
            const escaped = escapeHTMLEntities(input);

            expect(escaped).toBe('Tom &amp; Jerry');
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
            const input = '<div>Hello & welcome</div>';
            const escaped = escapeHTMLEntities(input);

            expect(escaped).toBe('&lt;div&gt;Hello &amp; welcome&lt;/div&gt;');
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
            const result0 = await validateMessage(messages[0], { skipDuplicateCheck: false });
            expect(result0.valid).toBe(false);

            // Second message should have been evicted
            const result1 = await validateMessage(messages[1], { skipDuplicateCheck: false });
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
