/**
 * CRITICAL ReDoS Bypass Vulnerability Test
 *
 * Tests the fix for the ReDoS bypass vulnerability where patterns like ((a+)+
 * could bypass the original detection mechanism.
 *
 * Vulnerability: The original pattern /\(([a-zA-Z*+]+)\+/ only detected
 * letters inside parentheses, missing nested quantifiers.
 *
 * Fix: AST-based detection + comprehensive pattern matching to catch all
 * variations of nested quantifiers.
 */

import { describe, it, expect } from 'vitest';

// Import the validation functions
import { validateSchema } from '../../js/utils/validation.js';

describe('CRITICAL: ReDoS Bypass Vulnerability Fix', () => {
    describe('Original bypass pattern detection', () => {
        it('should detect ((a+)+ - the original bypass pattern', () => {
            // This pattern bypassed the old detection
            const result = validateSchema('test', {
                type: 'string',
                pattern: '((a+)+'
            });

            // Should be rejected due to nested quantifiers
            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors.some(e =>
                e.includes('nested quantifiers') ||
                e.includes('dangerous construct') ||
                e.includes('ReDoS')
            )).toBe(true);
        });

        it('should detect ((a*)+ - variation with star', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '((a*)+'
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e =>
                e.includes('nested quantifiers') ||
                e.includes('dangerous construct')
            )).toBe(true);
        });

        it('should detect (a+)+ - single nested quantifier', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '(a+)+'
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e =>
                e.includes('nested quantifiers') ||
                e.includes('dangerous construct')
            )).toBe(true);
        });

        it('should detect (a*)* - double star nesting', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '(a*)*'
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e =>
                e.includes('nested quantifiers') ||
                e.includes('dangerous construct')
            )).toBe(true);
        });
    });

    describe('Complex nested quantifier patterns', () => {
        it('should detect ((a+b)+)+ - deeply nested', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '((a+b)+)+'
            });

            expect(result.valid).toBe(false);
        });

        it('should detect (?:a+)+ - non-capturing nested', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '(?:a+)+'
            });

            expect(result.valid).toBe(false);
        });

        it('should detect ([a-z]+)+ - character class nested', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '([a-z]+)+'
            });

            expect(result.valid).toBe(false);
        });

        it('should detect ((\w+)+) - word character nested', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '((\\w+)+)'
            });

            expect(result.valid).toBe(false);
        });
    });

    describe('Lookahead with nested quantifiers', () => {
        it('should detect (?=a+) - lookahead with quantifier', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '(?=a+)'
            });

            expect(result.valid).toBe(false);
        });

        it('should detect (?!b+)+ - negative lookahead nested', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '(?!b+)+'
            });

            expect(result.valid).toBe(false);
        });
    });

    describe('Range quantifier nesting', () => {
        it('should detect (a{1,10})+ - range with plus', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '(a{1,10})+'
            });

            expect(result.valid).toBe(false);
        });

        it('should detect ((a+){2,}) - nested with range', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '((a+){2,})'
            });

            expect(result.valid).toBe(false);
        });
    });

    describe('Safe patterns should pass', () => {
        it('should allow ^[a-zA-Z0-9]+$ - simple pattern', () => {
            const result = validateSchema('test123', {
                type: 'string',
                pattern: '^[a-zA-Z0-9]+$'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow ^[a-z]+$ - simple character class', () => {
            const result = validateSchema('abc', {
                type: 'string',
                pattern: '^[a-z]+$'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow ^\\d+$ - simple digit pattern', () => {
            const result = validateSchema('123', {
                type: 'string',
                pattern: '^\\d+$'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$ - email pattern', () => {
            const result = validateSchema('test@example.com', {
                type: 'string',
                pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow ^https?://[^\\s/$.?#].[^\\s]*$ - URL pattern', () => {
            const result = validateSchema('https://example.com', {
                type: 'string',
                pattern: '^https?://[^\\s/$.?#].[^\\s]*$'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow ^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$ - simple email', () => {
            const result = validateSchema('user@domain.com', {
                type: 'string',
                pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow ^[a-fA-F0-9]+$ - hex pattern', () => {
            const result = validateSchema('ABC123', {
                type: 'string',
                pattern: '^[a-fA-F0-9]+$'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow quantifiers without nesting - a+', () => {
            const result = validateSchema('aaa', {
                type: 'string',
                pattern: 'a+'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow character classes without nesting - [a-z]+', () => {
            const result = validateSchema('abc', {
                type: 'string',
                pattern: '[a-z]+'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow optional quantifiers - a?', () => {
            const result = validateSchema('a', {
                type: 'string',
                pattern: 'a?'
            });

            expect(result.valid).toBe(true);
        });
    });

    describe('Edge cases', () => {
        it('should reject pattern with many quantifiers (> 5)', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: 'a+b*c+d?e{1,2}f{3,5}g+'
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e =>
                e.includes('too many quantifiers')
            )).toBe(true);
        });

        it('should reject pattern with many alternations (> 10)', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: 'a|b|c|d|e|f|g|h|i|j|k|l'
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e =>
                e.includes('too many alternations')
            )).toBe(true);
        });

        it('should handle empty pattern gracefully', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: ''
            });

            // Empty pattern should either be valid or give a clear error
            expect(result.valid !== undefined).toBe(true);
        });

        it('should handle invalid regex pattern', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '[unclosed'
            });

            expect(result.valid).toBe(false);
        });
    });

    describe('Real-world attack patterns', () => {
        it('should block ((a+)+ applied to malicious input', () => {
            // Attempt to use a vulnerable pattern
            const result = validateSchema('aaaaaaaaaaaaaaaaaaaaaaaab', {
                type: 'string',
                pattern: '((a+)+'
            });

            // Should be rejected before it can cause ReDoS
            expect(result.valid).toBe(false);
        });

        it('should block (\\w+\\s+)+ - common vulnerable pattern', () => {
            const result = validateSchema('test string here', {
                type: 'string',
                pattern: '(\\w+\\s+)+'
            });

            expect(result.valid).toBe(false);
        });

        it('should block ([\\w\\s]+)+ - another common vulnerable pattern', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '([\\w\\s]+)+'
            });

            expect(result.valid).toBe(false);
        });
    });

    describe('Performance-safe patterns', () => {
        it('should allow anchored patterns - ^test$', () => {
            const result = validateSchema('test', {
                type: 'string',
                pattern: '^test$'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow word boundaries - \\bword\\b', () => {
            const result = validateSchema('word', {
                type: 'string',
                pattern: '\\bword\\b'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow simple alternation - cat|dog', () => {
            const result = validateSchema('cat', {
                type: 'string',
                pattern: 'cat|dog'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow character ranges - [a-z]', () => {
            const result = validateSchema('m', {
                type: 'string',
                pattern: '[a-z]'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow negated character classes - [^0-9]', () => {
            const result = validateSchema('a', {
                type: 'string',
                pattern: '[^0-9]'
            });

            expect(result.valid).toBe(true);
        });
    });

    describe('Multiple quantifiers without nesting', () => {
        it('should allow a+b+c - sequential quantifiers', () => {
            const result = validateSchema('aaabbbccc', {
                type: 'string',
                pattern: 'a+b+c+'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow \\d+\\w* - different tokens with quantifiers', () => {
            const result = validateSchema('123abc', {
                type: 'string',
                pattern: '\\d+\\w*'
            });

            expect(result.valid).toBe(true);
        });

        it('should allow [a-z]+[0-9]* - character classes with quantifiers', () => {
            const result = validateSchema('abc123', {
                type: 'string',
                pattern: '[a-z]+[0-9]*'
            });

            expect(result.valid).toBe(true);
        });
    });
});
