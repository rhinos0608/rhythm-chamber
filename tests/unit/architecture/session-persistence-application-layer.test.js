/**
 * Session Persistence Application Logic Layer Tests
 *
 * Tests the "HOW" layer - orchestration of data operations
 * This layer coordinates business logic with infrastructure but contains
 * no direct IndexedDB/storage API calls.
 *
 * Layer Responsibilities:
 * - Sequence data fetching and processing
 * - Orchestrate business rules
 * - Transform data between layers
 * - No direct storage API calls
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    prepareSessionForSave,
    filterMessagesForStorage,
    buildSessionMetadata
} from '../../../js/architecture/session-persistence-application-layer.js';

describe('Session Persistence Application Logic Layer', () => {

    describe('filterMessagesForStorage', () => {
        it('should filter to max saved messages with system messages preserved', () => {
            const messages = [
                { role: 'system', content: 'You are helpful' },
                ...Array(150).fill(0).map((_, i) => ({
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `Message ${i}`
                }))
            ];

            const result = filterMessagesForStorage(messages, 100);

            // Should keep system messages + recent messages
            const systemMessages = result.filter(m => m.role === 'system');
            const nonSystemMessages = result.filter(m => m.role !== 'system');

            expect(systemMessages).toHaveLength(1);
            expect(result.length).toBeLessThanOrEqual(100);
        });

        it('should return all messages if under limit', () => {
            const messages = [
                { role: 'system', content: 'System prompt' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there' }
            ];

            const result = filterMessagesForStorage(messages, 100);

            expect(result).toHaveLength(3);
        });

        it('should be a pure function (no side effects)', () => {
            const messages = [
                { role: 'user', content: 'Test' }
            ];
            const original = JSON.stringify(messages);

            filterMessagesForStorage(messages, 100);

            expect(JSON.stringify(messages)).toBe(original);
        });

        it('should not reference IndexedDB directly', () => {
            // This is an application-layer function that transforms data
            // It should be testable without any IndexedDB mock
            const messages = [{ role: 'user', content: 'Test' }];
            const result = filterMessagesForStorage(messages, 100);

            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('buildSessionMetadata', () => {
        it('should extract personality from session data', () => {
            const personality = { name: 'Creative', emoji: '🎨' };
            const sessionData = { personality, isLiteMode: false };

            const metadata = buildSessionMetadata(sessionData);

            expect(metadata.personalityName).toBe('Creative');
            expect(metadata.personalityEmoji).toBe('🎨');
            expect(metadata.isLiteMode).toBe(false);
        });

        it('should handle missing personality gracefully', () => {
            const sessionData = {};

            const metadata = buildSessionMetadata(sessionData);

            expect(metadata.personalityName).toBe('Unknown');
            expect(metadata.personalityEmoji).toBe('🎵');
        });
    });

    describe('prepareSessionForSave', () => {
        it('should orchestrate session data preparation', () => {
            const sessionData = {
                id: 'session-123',
                createdAt: '2024-01-01T00:00:00.000Z',
                messages: [
                    { role: 'system', content: 'You are helpful' },
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi' }
                ],
                personality: { name: 'Test', emoji: '🧪' },
                isLiteMode: false
            };

            const prepared = prepareSessionForSave(sessionData, 100);

            expect(prepared.id).toBe('session-123');
            expect(prepared.createdAt).toBe('2024-01-01T00:00:00.000Z');
            expect(prepared.messages).toHaveLength(3);
            expect(prepared.metadata.personalityName).toBe('Test');
        });

        it('should generate title from first user message if not provided', () => {
            const sessionData = {
                id: 'session-123',
                messages: [
                    { role: 'user', content: 'This is a very long message that should be truncated' }
                ]
            };

            const prepared = prepareSessionForSave(sessionData, 100);

            expect(prepared.title).toContain('...');
            expect(prepared.title.length).toBeLessThanOrEqual(53); // 50 + '...'
        });

        it('should use provided title if available', () => {
            const sessionData = {
                id: 'session-123',
                messages: [{ role: 'user', content: 'Hello' }],
                title: 'Custom Title'
            };

            const prepared = prepareSessionForSave(sessionData, 100);

            expect(prepared.title).toBe('Custom Title');
        });

        it('should default to "New Chat" title when no user messages', () => {
            const sessionData = {
                id: 'session-123',
                messages: [{ role: 'system', content: 'System prompt' }]
            };

            const prepared = prepareSessionForSave(sessionData, 100);

            expect(prepared.title).toBe('New Chat');
        });

        it('should handle empty first user message', () => {
            const sessionData = {
                id: 'session-123',
                messages: [
                    { role: 'user', content: '' },
                    { role: 'user', content: 'Actual message' }
                ]
            };

            const prepared = prepareSessionForSave(sessionData, 100);

            expect(prepared.title).toBe('Actual message');
        });
    });

    describe('Application Layer Constraints', () => {
        it('should be testable without IndexedDB', () => {
            // Application layer transforms data - no storage needed for testing
            const sessionData = {
                id: 'test',
                messages: [{ role: 'user', content: 'Hello' }]
            };

            const prepared = prepareSessionForSave(sessionData, 100);

            expect(prepared).toBeDefined();
            expect(prepared.id).toBe('test');
        });

        it('should provide deterministic output for same input', () => {
            const sessionData = {
                id: 'test',
                messages: [{ role: 'user', content: 'Hello' }]
            };

            const result1 = prepareSessionForSave(sessionData, 100);
            const result2 = prepareSessionForSave(sessionData, 100);

            expect(result1).toEqual(result2);
        });
    });
});
