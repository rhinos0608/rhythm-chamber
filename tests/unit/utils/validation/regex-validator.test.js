/**
 * Tests for regex-validator module
 * Tests ReDoS (Regular Expression Denial of Service) prevention
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  _detectNestedQuantifiers,
  _validateRegexPattern,
  _createSafeRegex,
  _safeRegexTest,
} from '../../../../js/utils/validation/regex-validator.js';

describe('regex-validator', () => {
  describe('_detectNestedQuantifiers', () => {
    it('should detect direct nested quantifiers like (a+)+', () => {
      const result = _detectNestedQuantifiers('(a+)+');
      expect(result.hasNestedQuantifiers).toBe(true);
      expect(result.details).toContain('Group with quantifier followed by outer quantifier');
    });

    it('should detect (a*)+ pattern', () => {
      const result = _detectNestedQuantifiers('(a*)+');
      expect(result.hasNestedQuantifiers).toBe(true);
    });

    it('should detect double-nested patterns like ((a+)+)', () => {
      const result = _detectNestedQuantifiers('((a+)+)');
      expect(result.hasNestedQuantifiers).toBe(true);
      expect(result.details).toContain('quantifier');
    });

    it('should detect consecutive quantifiers like )++', () => {
      const result = _detectNestedQuantifiers(')++');
      expect(result.hasNestedQuantifiers).toBe(true);
    });

    it('should detect lookahead with nested quantifier', () => {
      const result = _detectNestedQuantifiers('(?=a+)+');
      expect(result.hasNestedQuantifiers).toBe(true);
      expect(result.details).toContain('quantifier');
    });

    it('should allow safe patterns like ^[a-z]+$', () => {
      const result = _detectNestedQuantifiers('^[a-z]+$');
      expect(result.hasNestedQuantifiers).toBe(false);
    });

    it('should allow safe patterns like ^[a-zA-Z0-9]+$', () => {
      const result = _detectNestedQuantifiers('^[a-zA-Z0-9]+$');
      expect(result.hasNestedQuantifiers).toBe(false);
    });

    it('should allow simple quantifiers without nesting', () => {
      const result = _detectNestedQuantifiers('^[a-z]+[0-9]*$');
      expect(result.hasNestedQuantifiers).toBe(false);
    });

    it('should detect complex nested quantifiers using AST parsing', () => {
      const result = _detectNestedQuantifiers('a+(b+)+');
      expect(result.hasNestedQuantifiers).toBe(true);
    });

    it('should handle escaped parentheses correctly', () => {
      const result = _detectNestedQuantifiers('^\\(a\\)+$');
      expect(result.hasNestedQuantifiers).toBe(false);
    });
  });

  describe('_validateRegexPattern', () => {
    it('should accept safe patterns', () => {
      const result = _validateRegexPattern('^[a-z]+$');
      expect(result.safe).toBe(true);
    });

    it('should reject nested quantifiers', () => {
      const result = _validateRegexPattern('(a+)+');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('nested quantifiers');
    });

    it('should reject patterns with lookahead and quantifier combinations', () => {
      const result = _validateRegexPattern('a+(?=a+)');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('lookahead with quantifiers');
    });

    it('should reject patterns with too many quantifiers', () => {
      const result = _validateRegexPattern('a+b*c{1,2}d{3,4}e{5,6}f+g*');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('too many quantifiers');
    });

    it('should reject patterns with too many alternations', () => {
      const manyAlternations = 'a|b|c|d|e|f|g|h|i|j|k|l|m'; // 12 alternations (11 pipe symbols)
      const result = _validateRegexPattern(manyAlternations);
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('too many alternations');
    });

    it('should reject non-string patterns', () => {
      const result = _validateRegexPattern(123);
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('must be a string');
    });

    it('should reject nested groups with quantifiers', () => {
      const result = _validateRegexPattern('(a+)+(b+)+(c+)+');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('quantifier');
    });

    it('should accept email pattern', () => {
      const result = _validateRegexPattern('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$');
      expect(result.safe).toBe(true);
    });

    it('should accept URL pattern', () => {
      const result = _validateRegexPattern('^https?://[^\\s/$.?#][^\\s]*$');
      expect(result.safe).toBe(true);
    });

    it('should handle empty string pattern', () => {
      const result = _validateRegexPattern('');
      expect(result.safe).toBe(true);
    });

    it('should handle unicode patterns', () => {
      const result = _validateRegexPattern('^[\\p{L}\\p{N}]+$');
      expect(result.safe).toBe(true);
    });
  });

  describe('_createSafeRegex', () => {
    it('should create regex for safe patterns', () => {
      const regex = _createSafeRegex('^[a-z]+$');
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.test('hello')).toBe(true);
      expect(regex.test('hello123')).toBe(false);
    });

    it('should throw error for unsafe patterns', () => {
      expect(() => _createSafeRegex('(a+)+')).toThrow('Unsafe regex pattern');
    });

    it('should support regex flags', () => {
      const regex = _createSafeRegex('^[a-z]+$', 'i');
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.test('HELLO')).toBe(true);
    });

    it('should support global flag', () => {
      const regex = _createSafeRegex('[a-z]', 'g');
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.flags).toContain('g');
    });

    it('should throw error for invalid regex syntax', () => {
      expect(() => _createSafeRegex('[unclosed')).toThrow('Invalid regex pattern');
    });

    it('should handle special characters', () => {
      const regex = _createSafeRegex('^[\\w\\s.-]+$');
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.test('hello-world_123')).toBe(true);
    });
  });

  describe('_safeRegexTest', () => {
    it('should return true for matching strings', () => {
      const result = _safeRegexTest('hello', '^[a-z]+$');
      expect(result).toBe(true);
    });

    it('should return false for non-matching strings', () => {
      const result = _safeRegexTest('hello123', '^[a-z]+$');
      expect(result).toBe(false);
    });

    it('should throw error for unsafe patterns', () => {
      expect(() => _safeRegexTest('aaa', '(a+)+')).toThrow();
    });

    it('should handle empty strings', () => {
      const result = _safeRegexTest('', '^$');
      expect(result).toBe(true);
    });

    it('should handle special characters', () => {
      const result = _safeRegexTest(
        'test@example.com',
        '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
      );
      expect(result).toBe(true);
    });

    it('should handle unicode strings', () => {
      const result = _safeRegexTest('café', '^[\\w\\s-éèàôäöüß]+$');
      expect(result).toBe(true);
    });

    it('should not hang on ReDoS patterns (timeout protection)', { timeout: 3000 }, () => {
      // This pattern could cause catastrophic backtracking
      // The timeout should prevent it from hanging
      const startTime = Date.now();
      expect(() => {
        _safeRegexTest('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaab', '(a+)+b');
      }).toThrow();
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000); // Should timeout quickly
    });

    it('should handle complex but safe patterns', () => {
      const result = _safeRegexTest(
        'test@example.com',
        '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
      );
      expect(result).toBe(true);
    });

    it('should handle multiple test calls', () => {
      expect(_safeRegexTest('hello', '^[a-z]+$')).toBe(true);
      expect(_safeRegexTest('world', '^[a-z]+$')).toBe(true);
      expect(_safeRegexTest('123', '^[a-z]+$')).toBe(false);
    });
  });

  describe('ReDoS prevention', () => {
    it('should prevent catastrophic backtracking in (a+)+ pattern', () => {
      expect(() => {
        _validateRegexPattern('(a+)+');
      }).not.toThrow();

      const validation = _validateRegexPattern('(a+)+');
      expect(validation.safe).toBe(false);
    });

    it('should prevent nested quantifier attacks', () => {
      const patterns = ['(a+)+', '(a*)+', '((a+)+)', 'a+(b+)+', '(a+)*'];

      patterns.forEach(pattern => {
        const validation = _validateRegexPattern(pattern);
        expect(validation.safe).toBe(false);
      });
    });

    it('should allow legitimate complex patterns', () => {
      const patterns = [
        '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
        '^https?://[^\\s/$.?#][^\\s]*$',
        '^[\\s\\S]*$',
        '^.+$',
        '^.*$',
      ];

      patterns.forEach(pattern => {
        const validation = _validateRegexPattern(pattern);
        expect(validation.safe).toBe(true);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle null input', () => {
      const result = _validateRegexPattern(null);
      expect(result.safe).toBe(false);
    });

    it('should handle undefined input', () => {
      const result = _validateRegexPattern(undefined);
      expect(result.safe).toBe(false);
    });

    it('should handle very long patterns', () => {
      const longPattern = '^[a-z]$'.repeat(100);
      const result = _validateRegexPattern(longPattern);
      // Should work but might have performance warning
      expect(result).toBeDefined();
    });

    it('should handle patterns with escape sequences', () => {
      const result = _validateRegexPattern('^[\\n\\r\\t]+$');
      expect(result.safe).toBe(true);
    });

    it('should handle character classes', () => {
      const result = _validateRegexPattern('^[a-zA-Z0-9_]+$');
      expect(result.safe).toBe(true);
    });

    it('should handle negated character classes', () => {
      const result = _validateRegexPattern('^[^a-z]+$');
      expect(result.safe).toBe(true);
    });
  });
});
