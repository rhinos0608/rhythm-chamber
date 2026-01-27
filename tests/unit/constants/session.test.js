/**
 * Session Constants Unit Tests
 *
 * Tests for shared session-related constants including:
 * - MAX_SAVED_MESSAGES limit
 * - MAX_ID_LENGTH validation
 * - ID_PATTERN regex validation
 *
 * @module tests/unit/constants/session.test
 */

import { describe, it, expect } from 'vitest';
import { SESSION } from '../../../js/constants/session.js';

describe('SESSION Constants', () => {
    describe('MAX_SAVED_MESSAGES', () => {
        it('should be defined', () => {
            expect(SESSION.MAX_SAVED_MESSAGES).toBeDefined();
        });

        it('should be a positive number', () => {
            expect(SESSION.MAX_SAVED_MESSAGES).toBeGreaterThan(0);
        });

        it('should be at least 100', () => {
            expect(SESSION.MAX_SAVED_MESSAGES).toBeGreaterThanOrEqual(100);
        });
    });

    describe('MAX_ID_LENGTH', () => {
        it('should be defined', () => {
            expect(SESSION.MAX_ID_LENGTH).toBeDefined();
        });

        it('should be a positive number', () => {
            expect(SESSION.MAX_ID_LENGTH).toBeGreaterThan(0);
        });

        it('should be at least 64', () => {
            expect(SESSION.MAX_ID_LENGTH).toBeGreaterThanOrEqual(64);
        });
    });

    describe('ID_PATTERN', () => {
        it('should be defined as a RegExp', () => {
            expect(SESSION.ID_PATTERN).toBeInstanceOf(RegExp);
        });

        it('should accept valid lowercase alphanumeric IDs', () => {
            expect(SESSION.ID_PATTERN.test('abc123')).toBe(true);
            expect(SESSION.ID_PATTERN.test('session123')).toBe(true);
        });

        it('should accept valid IDs with hyphens and underscores', () => {
            expect(SESSION.ID_PATTERN.test('session-123')).toBe(true);
            expect(SESSION.ID_PATTERN.test('session_123')).toBe(true);
            expect(SESSION.ID_PATTERN.test('my_session-123')).toBe(true);
        });

        it('should accept uppercase letters (case insensitive)', () => {
            expect(SESSION.ID_PATTERN.test('ABC123')).toBe(true);
            expect(SESSION.ID_PATTERN.test('Session-123')).toBe(true);
        });

        it('should reject empty string', () => {
            expect(SESSION.ID_PATTERN.test('')).toBe(false);
        });

        it('should reject single character IDs', () => {
            expect(SESSION.ID_PATTERN.test('a')).toBe(false);
        });

        it('should reject IDs starting with special character', () => {
            expect(SESSION.ID_PATTERN.test('-session')).toBe(false);
            expect(SESSION.ID_PATTERN.test('_session')).toBe(false);
        });

        it('should reject IDs ending with special character', () => {
            expect(SESSION.ID_PATTERN.test('session-')).toBe(false);
            expect(SESSION.ID_PATTERN.test('session_')).toBe(false);
        });

        it('should reject IDs with spaces', () => {
            expect(SESSION.ID_PATTERN.test('session 123')).toBe(false);
        });

        it('should reject IDs with special characters', () => {
            expect(SESSION.ID_PATTERN.test('session.123')).toBe(false);
            expect(SESSION.ID_PATTERN.test('session@123')).toBe(false);
            expect(SESSION.ID_PATTERN.test('session#123')).toBe(false);
        });

        it('should accept 2 character IDs', () => {
            expect(SESSION.ID_PATTERN.test('a1')).toBe(true);
            expect(SESSION.ID_PATTERN.test('ab')).toBe(true);
        });

        it('should accept IDs at max length boundary', () => {
            // Create a 64 character valid ID
            const longId = 'a' + 'b'.repeat(62) + 'c';
            expect(longId.length).toBe(64);
            expect(SESSION.ID_PATTERN.test(longId)).toBe(true);
        });

        it('should reject IDs over max length boundary', () => {
            // The pattern itself enforces max length via {0,62} in middle + 2 chars = 64 max
            // A 65 character ID won't match the pattern
            const tooLongId = 'a' + 'b'.repeat(63) + 'c';
            expect(tooLongId.length).toBe(65);
            expect(SESSION.ID_PATTERN.test(tooLongId)).toBe(false);
        });
    });

    describe('Integration: isValidSessionId using constants', () => {
        function isValidSessionId(id) {
            if (typeof id !== 'string' || id.length === 0 || id.length > SESSION.MAX_ID_LENGTH) {
                return false;
            }
            return SESSION.ID_PATTERN.test(id);
        }

        it('should validate correct session IDs', () => {
            expect(isValidSessionId('session-123')).toBe(true);
            expect(isValidSessionId('my_session_abc')).toBe(true);
            expect(isValidSessionId('abc123')).toBe(true);
        });

        it('should reject IDs that are too long', () => {
            const longId = 'a'.repeat(65);
            expect(isValidSessionId(longId)).toBe(false);
        });

        it('should reject empty IDs', () => {
            expect(isValidSessionId('')).toBe(false);
        });

        it('should reject non-string IDs', () => {
            expect(isValidSessionId(null)).toBe(false);
            expect(isValidSessionId(undefined)).toBe(false);
            expect(isValidSessionId(123)).toBe(false);
        });

        it('should reject IDs with invalid characters', () => {
            expect(isValidSessionId('session.123')).toBe(false);
            expect(isValidSessionId('session@123')).toBe(false);
            expect(isValidSessionId('-session')).toBe(false);
            expect(isValidSessionId('session-')).toBe(false);
        });
    });
});
