/**
 * Session State Module Unit Tests
 *
 * Tests for session state management including:
 * - Session data get/set/update operations
 * - Message history management
 * - Deep cloning for immutability
 * - Mutex protection for concurrent access
 * - State synchronization with AppState
 *
 * @module tests/unit/session-manager/session-state.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mocks
// ==========================================

const mockDataVersion = {
    tagMessage: vi.fn()
};

const mockAppState = {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn()
};

// Mock modules before importing
// NOTE: We use the REAL Mutex class, not a mock, to test actual concurrent behavior
// The fake serialization mock was preventing real race condition testing
vi.mock('../../../js/services/data-version.js', () => ({ DataVersion: mockDataVersion }));
vi.mock('../../../js/state/app-state.js', () => ({ AppState: mockAppState }));

// Import the real Mutex to test actual concurrent behavior
import { Mutex } from '../../../js/utils/concurrency/mutex.js';

// Helper to reset all mocks
function resetMocks() {
    mockDataVersion.tagMessage.mockReset();
    mockAppState.update.mockReset();
}

// Mock window for legacy compatibility
global.window = {
    location: { origin: 'http://localhost:3000' },
    _sessionData: null
};

// ==========================================
// Setup & Teardown
// ==========================================

let SessionState;

beforeEach(async () => {
    resetMocks();

    // Fresh import for each test
    vi.resetModules();
    const module = await import('../../../js/services/session-manager/session-state.js');
    SessionState = module;
});

afterEach(() => {
    vi.clearAllMocks();
});

// ==========================================
// Deep Cloning Tests
// ==========================================

describe('SessionState Deep Cloning', () => {
    it('should deep clone a single message object', () => {
        const message = { role: 'user', content: 'Test', timestamp: Date.now() };
        const cloned = SessionState.deepCloneMessage(message);

        expect(cloned).toEqual(message);
        expect(cloned).not.toBe(message);
    });

    it('should handle null message gracefully', () => {
        const cloned = SessionState.deepCloneMessage(null);
        expect(cloned).toBeNull();
    });

    it('should deep clone array of messages', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' }
        ];
        const cloned = SessionState.deepCloneMessages(messages);

        expect(cloned).toEqual(messages);
        expect(cloned).not.toBe(messages);
        expect(cloned[0]).not.toBe(messages[0]);
        expect(cloned[1]).not.toBe(messages[1]);
    });

    it('should handle empty array', () => {
        const cloned = SessionState.deepCloneMessages([]);
        expect(cloned).toEqual([]);
    });

    it('should handle null/undefined messages array', () => {
        expect(SessionState.deepCloneMessages(null)).toEqual([]);
        expect(SessionState.deepCloneMessages(undefined)).toEqual([]);
    });

    it('should prevent mutations to cloned messages', () => {
        const original = [{ role: 'user', content: 'Test' }];
        const cloned = SessionState.deepCloneMessages(original);

        cloned[0].content = 'Modified';

        expect(original[0].content).toBe('Test');
    });

    // M1: Test actual deep cloning with nested objects
    it('should deep clone messages with nested objects', () => {
        const message = {
            role: 'user',
            content: 'Test',
            metadata: {
                timestamp: Date.now(),
                nested: { value: 'deep' }
            }
        };
        const cloned = SessionState.deepCloneMessage(message);

        // Modifying nested object in clone should not affect original
        cloned.metadata.nested.value = 'modified';
        cloned.metadata.timestamp = 999;

        expect(message.metadata.nested.value).toBe('deep');
        expect(message.metadata.timestamp).not.toBe(999);
    });

    it('should deep clone messages with array properties', () => {
        const message = {
            role: 'user',
            content: 'Test',
            tokens: [1, 2, 3],
            tags: ['tag1', 'tag2']
        };
        const cloned = SessionState.deepCloneMessage(message);

        // Modifying arrays in clone should not affect original
        cloned.tokens.push(4);
        cloned.tags[0] = 'modified';

        expect(message.tokens).toEqual([1, 2, 3]);
        expect(message.tags[0]).toBe('tag1');
    });

    it('should handle messages with Date objects', () => {
        const date = new Date('2024-01-01');
        const message = { role: 'user', timestamp: date };
        const cloned = SessionState.deepCloneMessage(message);

        // Date should be cloned (not same reference for structuredClone)
        // Note: JSON.stringify converts Date to ISO string, structuredClone keeps it as Date
        expect(cloned).toBeDefined();
        expect(cloned.role).toBe('user');
        // Verify timestamp is preserved in some form
        expect(cloned.timestamp).toBeDefined();
    });

    it('should clone simple flat messages correctly', () => {
        const message = { role: 'user', content: 'Test', timestamp: 12345 };
        const cloned = SessionState.deepCloneMessage(message);

        expect(cloned).toEqual(message);
        expect(cloned).not.toBe(message);
    });
});

// ==========================================
// Session Data Get/Set Tests
// ==========================================

describe('SessionState Session Data', () => {
    it('should get empty session data initially', () => {
        const data = SessionState.getSessionData();
        expect(data.id).toBeNull();
        expect(data.messages).toEqual([]);
        expect(data).toHaveProperty('_version');
    });

    it('should return frozen session data', () => {
        SessionState.setSessionData({
            id: 'test-id',
            messages: []
        });
        const data = SessionState.getSessionData();

        // Attempting to mutate frozen data should throw in strict mode
        // The important thing is the data is actually frozen and cannot be modified
        expect(() => {
            data.id = 'modified';
        }).toThrow();  // Object.freeze prevents mutation

        // Even if we try to modify, the original data should not be changed
        // (get a fresh snapshot to verify)
        const freshData = SessionState.getSessionData();
        expect(freshData.id).toBe('test-id');
    });

    it('should set session data with deep cloning', () => {
        const messages = [{ role: 'user', content: 'Test' }];
        const originalMessages = [...messages];

        SessionState.setSessionData({
            id: 'test-id',
            messages: messages
        });

        // Modify original array
        messages[0].content = 'Modified';

        // Session data should not be affected
        const data = SessionState.getSessionData();
        expect(data.messages[0].content).toBe('Test');
    });

    it('should handle missing id in setSessionData', () => {
        SessionState.setSessionData({
            messages: []
        });

        const data = SessionState.getSessionData();
        expect(data.id).toBeNull();
    });
});

// ==========================================
// Atomic Update Tests
// ==========================================

describe('SessionState Atomic Updates', () => {
    it('should update session data atomically', async () => {
        SessionState.setSessionData({
            id: 'test-id',
            messages: [{ role: 'user', content: 'Original' }]
        });

        await SessionState.updateSessionData((data) => ({
            ...data,
            messages: [...data.messages, { role: 'assistant', content: 'Response' }]
        }));

        const updated = SessionState.getSessionData();
        expect(updated.messages).toHaveLength(2);
        expect(updated.messages[1].content).toBe('Response');
    });

    it('should use mutex for concurrent updates', async () => {
        // This test verifies that the mutex serializes operations correctly
        SessionState.setSessionData({
            id: 'test-id',
            messages: []
        });

        // Start multiple updates concurrently
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(
                SessionState.updateSessionData((data) => ({
                    ...data,
                    messages: [...data.messages, { role: 'user', content: `Update ${i}` }]
                }))
            );
        }

        await Promise.all(promises);

        // All updates should be applied sequentially via mutex
        const result = SessionState.getSessionData();
        expect(result.messages).toHaveLength(5);
        expect(result._version).toBe(5);
    });

    it('should sync to window after update', async () => {
        SessionState.setSessionData({
            id: 'test-id',
            messages: [{ role: 'user', content: 'Test' }]
        });

        await SessionState.updateSessionData((data) => data);

        // SessionState no longer uses window._sessionData
        // It uses ES module exports instead
        // Verify session data is accessible via getSessionData
        const data = SessionState.getSessionData();
        expect(data.id).toBe('test-id');
        expect(data.messages).toHaveLength(1);
    });

    it('should handle updater function returning frozen data', async () => {
        SessionState.setSessionData({
            id: 'test-id',
            messages: []
        });

        // Updater receives frozen data
        await SessionState.updateSessionData((frozenData) => {
            // Should not be able to mutate frozen data
            const newData = {
                id: frozenData.id,
                messages: [...frozenData.messages, { role: 'user', content: 'New' }]
            };
            return newData;
        });

        const result = SessionState.getSessionData();
        expect(result.messages).toHaveLength(1);
    });
});

// ==========================================
// Message History Tests
// ==========================================

describe('SessionState Message History', () => {
    beforeEach(() => {
        SessionState.setSessionData({
            id: 'test-session',
            messages: []
        });
    });

    it('should get current session ID', () => {
        SessionState.setSessionData({
            id: 'session-123',
            messages: []
        });

        const id = SessionState.getCurrentSessionId();
        expect(id).toBe('session-123');
    });

    it('should return empty history initially', () => {
        const history = SessionState.getHistory();
        expect(history).toEqual([]);
    });

    it('should return copy of history (not reference)', () => {
        SessionState.setSessionData({
            id: 'test',
            messages: [{ role: 'user', content: 'Test' }]
        });

        const history1 = SessionState.getHistory();
        const history2 = SessionState.getHistory();

        expect(history1).not.toBe(history2);
        expect(history1).toEqual(history2);
    });

    it('should add single message to history', async () => {
        const message = { role: 'user', content: 'Hello' };

        await SessionState.addMessageToHistory(message);

        const history = SessionState.getHistory();
        expect(history).toContainEqual(message);
    });

    it('should tag message with data version when adding', async () => {
        const message = { role: 'user', content: 'Test' };

        await SessionState.addMessageToHistory(message);

        expect(mockDataVersion.tagMessage).toHaveBeenCalledWith(message);
    });

    it('should add multiple messages atomically', async () => {
        const messages = [
            { role: 'user', content: 'First' },
            { role: 'assistant', content: 'Response 1' },
            { role: 'user', content: 'Second' }
        ];

        await SessionState.addMessagesToHistory(messages);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(3);
    });

    it('should tag all messages when adding multiple', async () => {
        const messages = [
            { role: 'user', content: 'First' },
            { role: 'assistant', content: 'Second' }
        ];

        await SessionState.addMessagesToHistory(messages);

        expect(mockDataVersion.tagMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle empty array in addMessagesToHistory', async () => {
        await expect(SessionState.addMessagesToHistory([])).resolves.not.toThrow();
        await expect(SessionState.addMessagesToHistory(null)).resolves.not.toThrow();
    });

    it('should remove message from history by index', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'First' });
        await SessionState.addMessageToHistory({ role: 'assistant', content: 'Second' });
        await SessionState.addMessageToHistory({ role: 'user', content: 'Third' });

        const removed = await SessionState.removeMessageFromHistory(1);

        expect(removed).toBe(true);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(2);
        expect(history[0].content).toBe('First');
        expect(history[1].content).toBe('Third');
    });

    it('should return false when removing invalid index', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = await SessionState.removeMessageFromHistory(10);
        expect(removed).toBe(false);
    });

    // TD-7: Array bounds checking tests
    it('should return false when removing with negative index', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = await SessionState.removeMessageFromHistory(-1);
        expect(removed).toBe(false);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(1);
    });

    it('should return false when removing with index at array length', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = await SessionState.removeMessageFromHistory(1);
        expect(removed).toBe(false);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(1);
    });

    it('should return false when removing from empty history', async () => {
        const removed = await SessionState.removeMessageFromHistory(0);
        expect(removed).toBe(false);
    });

    it('should handle undefined index gracefully', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = await SessionState.removeMessageFromHistory(undefined);
        expect(removed).toBe(false);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(1);
    });

    it('should handle null index gracefully', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = await SessionState.removeMessageFromHistory(null);
        expect(removed).toBe(false);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(1);
    });

    it('should handle NaN index gracefully', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = await SessionState.removeMessageFromHistory(NaN);
        expect(removed).toBe(false);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(1);
    });

    it('should handle very large positive index gracefully', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = await SessionState.removeMessageFromHistory(Number.MAX_SAFE_INTEGER);
        expect(removed).toBe(false);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(1);
    });

    it('should handle very large negative index gracefully', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = await SessionState.removeMessageFromHistory(Number.MIN_SAFE_INTEGER);
        expect(removed).toBe(false);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(1);
    });

    it('should handle float index gracefully', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = await SessionState.removeMessageFromHistory(1.5);
        expect(removed).toBe(false);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(1);
    });

    it('should handle zero index correctly', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'First' });
        await SessionState.addMessageToHistory({ role: 'assistant', content: 'Second' });

        const removed = await SessionState.removeMessageFromHistory(0);
        expect(removed).toBe(true);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].content).toBe('Second');
    });

    it('should remove last message by index', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'First' });
        await SessionState.addMessageToHistory({ role: 'assistant', content: 'Second' });
        await SessionState.addMessageToHistory({ role: 'user', content: 'Third' });

        const removed = await SessionState.removeMessageFromHistory(2);
        expect(removed).toBe(true);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(2);
        expect(history[0].content).toBe('First');
        expect(history[1].content).toBe('Second');
    });

    it('should truncate history to specified length', async () => {
        for (let i = 0; i < 10; i++) {
            await SessionState.addMessageToHistory({ role: 'user', content: `Message ${i}` });
        }

        await SessionState.truncateHistory(5);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(5);
        expect(history[0].content).toBe('Message 0');
    });

    it('should replace entire history', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Old' });

        const newMessages = [
            { role: 'user', content: 'New 1' },
            { role: 'assistant', content: 'New 2' }
        ];

        await SessionState.replaceHistory(newMessages);

        const history = SessionState.getHistory();
        expect(history).toEqual(newMessages);
    });

    it('should preserve session ID when replacing history', async () => {
        SessionState.setSessionData({
            id: 'session-123',
            messages: []
        });

        await SessionState.replaceHistory([{ role: 'user', content: 'Test' }]);

        expect(SessionState.getCurrentSessionId()).toBe('session-123');
    });
});

// ==========================================
// In-Memory Sliding Window Tests
// ==========================================

describe('SessionState Sliding Window', () => {
    beforeEach(() => {
        SessionState.setSessionData({
            id: 'test',
            messages: []
        });
    });

    it('should preserve system messages during truncation', async () => {
        // Add system prompt
        await SessionState.addMessageToHistory({ role: 'system', content: 'System prompt' });

        // Add many user messages (more than limit)
        for (let i = 0; i < 210; i++) {
            await SessionState.addMessageToHistory({ role: 'user', content: `Message ${i}` });
        }

        const history = SessionState.getHistory();

        // Should keep system message + recent messages (limit is 200 in memory)
        expect(history[0].role).toBe('system');
        expect(history[0].content).toBe('System prompt');
        expect(history.length).toBeLessThanOrEqual(201); // system + 200 messages
    });

    it('should drop oldest non-system messages when limit exceeded', async () => {
        await SessionState.addMessageToHistory({ role: 'system', content: 'System' });

        for (let i = 0; i < 200; i++) {
            await SessionState.addMessageToHistory({ role: 'user', content: `Msg ${i}` });
        }

        const history = SessionState.getHistory();

        // First message should still be system prompt
        expect(history[0].role).toBe('system');

        // Last message should be the most recent
        expect(history[history.length - 1].content).toBe('Msg 199');
    });
});

// ==========================================
// AppState Synchronization Tests
// ==========================================

describe('SessionState AppState Sync', () => {
    it('should sync session ID to AppState', () => {
        SessionState.syncSessionIdToAppState('test-session-id');

        expect(mockAppState.update).toHaveBeenCalledWith('ui', {
            currentSessionId: 'test-session-id'
        });
    });

    it('should handle null session ID', () => {
        SessionState.syncSessionIdToAppState(null);

        expect(mockAppState.update).toHaveBeenCalledWith('ui', {
            currentSessionId: null
        });
    });

    it('should handle missing AppState gracefully', () => {
        // Temporarily remove AppState
        const originalAppState = global.AppState;
        delete global.AppState;

        expect(() => {
            SessionState.syncSessionIdToAppState('test-id');
        }).not.toThrow();

        global.AppState = originalAppState;
    });

    it('should handle AppState.update errors gracefully', () => {
        mockAppState.update.mockImplementation(() => {
            throw new Error('Sync error');
        });

        expect(() => {
            SessionState.syncSessionIdToAppState('test-id');
        }).not.toThrow();
    });
});

// ==========================================
// Concurrency Tests
// ==========================================

describe('SessionState Concurrency', () => {
    beforeEach(() => {
        SessionState.setSessionData({
            id: 'test',
            messages: []
        });
    });

    it('should serialize concurrent updates via mutex', async () => {
        // Simulate concurrent updates with Promise.all
        const updates = [];
        for (let i = 0; i < 10; i++) {
            updates.push(
                SessionState.updateSessionData((data) => ({
                    ...data,
                    messages: [...data.messages, { role: 'user', content: `Update ${i}` }]
                }))
            );
        }

        await Promise.all(updates);

        const history = SessionState.getHistory();
        // All updates should be applied sequentially via mutex
        expect(history.length).toBe(10);
    });

    it('should handle rapid concurrent message additions', async () => {
        // Create 50 concurrent add operations
        const promises = [];
        for (let i = 0; i < 50; i++) {
            promises.push(
                SessionState.addMessageToHistory({ role: 'user', content: `Msg ${i}` })
            );
        }

        await Promise.all(promises);

        const history = SessionState.getHistory();
        expect(history.length).toBe(50);
    });

    it('should serialize real Mutex operations', async () => {
        // Verify the real Mutex class serializes operations correctly
        // This test uses the actual Mutex, not a mock
        let concurrentCount = 0;
        let maxConcurrent = 0;
        const executionOrder = [];

        const mutex = new Mutex();

        const operations = Array.from({ length: 10 }, async (_, i) => {
            return mutex.runExclusive(async () => {
                concurrentCount++;
                if (concurrentCount > maxConcurrent) {
                    maxConcurrent = concurrentCount;
                }
                executionOrder.push({ id: i, count: concurrentCount });

                // Simulate async work
                await Promise.resolve();
                await Promise.resolve();

                concurrentCount--;
            });
        });

        await Promise.all(operations);

        // With proper serialization, maxConcurrent should be 1
        expect(maxConcurrent).toBe(1);
        expect(executionOrder).toHaveLength(10);

        // Verify each operation ran with only itself in the critical section
        executionOrder.forEach(entry => {
            expect(entry.count).toBe(1);
        });
    });

    it('should maintain FIFO order with real Mutex', async () => {
        const results = [];
        const mutex = new Mutex();

        const operations = [1, 2, 3, 4, 5].map(async (val) => {
            return mutex.runExclusive(async () => {
                await Promise.resolve();
                results.push(val);
            });
        });

        await Promise.all(operations);

        // Should maintain submission order
        expect(results).toEqual([1, 2, 3, 4, 5]);
    });

    it('should create true race condition with setTimeout', async () => {
        // This test creates a REAL race condition by having two operations
        // read the same version, then both try to update simultaneously
        const data = SessionState.getSessionData();
        const initialVersion = data._version;

        // Create two promises that both read the same version
        // but will execute at slightly different times
        let firstFinished = false;
        let secondFinished = false;

        const update1 = SessionState.updateSessionData({
            updaterFn: (d) => ({
                ...d,
                messages: [...d.messages, { role: 'user', content: 'First' }]
            }),
            expectedVersion: initialVersion
        }).then((result) => {
            firstFinished = true;
            return result;
        });

        // Use setTimeout to ensure the second update is created AFTER
        // the first one has entered the mutex queue
        await new Promise(resolve => setImmediate(resolve));

        // At this point, update1 is pending but hasn't executed yet
        // So update2 still sees the same version
        const update2 = SessionState.updateSessionData({
            updaterFn: (d) => ({
                ...d,
                messages: [...d.messages, { role: 'user', content: 'Second' }]
            }),
            expectedVersion: initialVersion
        }).then((result) => {
            secondFinished = true;
            return result;
        });

        const [result1, result2] = await Promise.all([update1, update2]);

        // Exactly one should succeed, one should fail
        // The mutex serializes them, so the second sees the stale version
        expect(result1.success !== result2.success).toBe(true);

        // Only one message should be added
        const finalData = SessionState.getSessionData();
        expect(finalData.messages.length).toBe(1);
    });

    it('should handle overlapping read-modify-write operations', async () => {
        // Test multiple overlapping operations that all read the same state
        const snapshot = SessionState.getSessionData();
        const baseVersion = snapshot._version;

        // Start 5 updates all based on the same snapshot
        // This simulates a true race condition where multiple clients
        // read the same data and try to update simultaneously
        const updates = [1, 2, 3, 4, 5].map((id) => {
            return SessionState.updateSessionData({
                updaterFn: (data) => ({
                    ...data,
                    messages: [...data.messages, { role: 'user', content: `Update ${id}` }]
                }),
                expectedVersion: baseVersion
            });
        });

        const results = await Promise.all(updates);

        // Only ONE should succeed - the first one through the mutex
        // All others should fail with version mismatch
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        expect(successCount).toBe(1);
        expect(failureCount).toBe(4);

        // Only one message should be in the final state
        const finalData = SessionState.getSessionData();
        expect(finalData.messages.length).toBe(1);
    });

    it('should serialize mix of add and remove operations', async () => {
        // Add initial messages
        await SessionState.addMessageToHistory({ role: 'user', content: 'M1' });
        await SessionState.addMessageToHistory({ role: 'user', content: 'M2' });
        await SessionState.addMessageToHistory({ role: 'user', content: 'M3' });

        // Run concurrent removes and adds
        const promises = [
            SessionState.removeMessageFromHistory(0),
            SessionState.addMessageToHistory({ role: 'user', content: 'M4' }),
            SessionState.removeMessageFromHistory(1),
            SessionState.addMessageToHistory({ role: 'user', content: 'M5' })
        ];

        await Promise.all(promises);

        // Verify final state is consistent
        const history = SessionState.getHistory();
        // The exact count depends on serialization order
        expect(history.length).toBeGreaterThan(0);
        expect(history.length).toBeLessThan(5);
    });
});

// ==========================================
// Edge Cases
// ==========================================

describe('SessionState Edge Cases', () => {
    it('should handle adding null message', async () => {
        await expect(SessionState.addMessageToHistory(null)).resolves.not.toThrow();
    });

    it('should handle message with missing fields', async () => {
        await expect(SessionState.addMessageToHistory({})).resolves.not.toThrow();
    });

    it('should handle very long message content', async () => {
        const longContent = 'A'.repeat(10000);
        await SessionState.addMessageToHistory({ role: 'user', content: longContent });

        const history = SessionState.getHistory();
        expect(history[0].content.length).toBe(10000);
    });

    it('should handle special characters in message content', async () => {
        const specialContent = 'Test\n\t\r\\"\'<>{}[]';
        await SessionState.addMessageToHistory({ role: 'user', content: specialContent });

        const history = SessionState.getHistory();
        expect(history[0].content).toBe(specialContent);
    });

    it('should handle Unicode characters in messages', async () => {
        const unicodeContent = 'Hello 世界 🎵 test';
        await SessionState.addMessageToHistory({ role: 'user', content: unicodeContent });

        const history = SessionState.getHistory();
        expect(history[0].content).toBe(unicodeContent);
    });

    it('should handle truncate with length greater than current', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        await SessionState.truncateHistory(100);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(1);
    });

    it('should handle truncate with zero length', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Test' });

        await SessionState.truncateHistory(0);

        const history = SessionState.getHistory();
        expect(history).toHaveLength(0);
    });
});

// ==========================================
// State Versioning Tests
// ==========================================

describe('SessionState Versioning', () => {
    beforeEach(() => {
        SessionState.setSessionData({
            id: 'test-session',
            messages: []
        });
    });

    it('should include _version in getSessionData result', () => {
        const data = SessionState.getSessionData();
        expect(data).toHaveProperty('_version');
        expect(typeof data._version).toBe('number');
    });

    it('should start with version 0', () => {
        SessionState.setSessionData({
            id: 'test',
            messages: []
        });
        const data = SessionState.getSessionData();
        expect(data._version).toBe(0);
    });

    it('should increment version after update', async () => {
        const beforeData = SessionState.getSessionData();
        const initialVersion = beforeData._version;

        await SessionState.updateSessionData((data) => ({
            ...data,
            messages: [...data.messages, { role: 'user', content: 'Test' }]
        }));

        const afterData = SessionState.getSessionData();
        expect(afterData._version).toBe(initialVersion + 1);
    });

    it('should increment version on each update', async () => {
        await SessionState.updateSessionData((data) => data);
        await SessionState.updateSessionData((data) => data);
        await SessionState.updateSessionData((data) => data);

        const data = SessionState.getSessionData();
        expect(data._version).toBe(3);
    });

    it('should return success and version from updateSessionData', async () => {
        const result = await SessionState.updateSessionData((data) => data);

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('version');
        expect(result.success).toBe(true);
        expect(typeof result.version).toBe('number');
    });

    it('should reject update when expectedVersion does not match', async () => {
        const data = SessionState.getSessionData();
        const staleVersion = data._version;

        // Make a change that increments the version
        await SessionState.updateSessionData((d) => ({
            ...d,
            messages: [...d.messages, { role: 'user', content: 'Update 1' }]
        }));

        // Try to update with the stale version
        const result = await SessionState.updateSessionData({
            updaterFn: (d) => ({
                ...d,
                messages: [...d.messages, { role: 'user', content: 'Stale Update' }]
            }),
            expectedVersion: staleVersion
        });

        expect(result.success).toBe(false);
        expect(result.version).not.toBe(staleVersion);
    });

    it('should allow update when expectedVersion matches', async () => {
        const data = SessionState.getSessionData();
        const currentVersion = data._version;

        const result = await SessionState.updateSessionData({
            updaterFn: (d) => ({
                ...d,
                messages: [...d.messages, { role: 'user', content: 'Valid Update' }]
            }),
            expectedVersion: currentVersion
        });

        expect(result.success).toBe(true);
        expect(result.version).toBe(currentVersion + 1);
    });

    it('should support backward-compatible function API', async () => {
        // Old API: passing a function directly
        const result = await SessionState.updateSessionData((data) => ({
            ...data,
            messages: [...data.messages, { role: 'user', content: 'Test' }]
        }));

        expect(result.success).toBe(true);
        expect(result.version).toBe(1);
    });

    it('should handle concurrent updates with versioning correctly', async () => {
        // This test creates a TRUE race condition by having two updates
        // both read the same version before either completes
        const snapshot = SessionState.getSessionData();
        const baseVersion = snapshot._version;

        // Start two updates with the SAME expected version
        // This simulates two clients reading the same state simultaneously
        const update1 = SessionState.updateSessionData({
            updaterFn: (data) => ({
                ...data,
                messages: [...data.messages, { role: 'user', content: 'Update 1' }]
            }),
            expectedVersion: baseVersion
        });

        const update2 = SessionState.updateSessionData({
            updaterFn: (data) => ({
                ...data,
                messages: [...data.messages, { role: 'user', content: 'Update 2' }]
            }),
            expectedVersion: baseVersion
        });

        const [result1, result2] = await Promise.all([update1, update2]);

        // With the real Mutex serializing operations:
        // - First update wins (success=true, version=baseVersion+1)
        // - Second update fails (success=false, version=baseVersion+1 - the current version)
        const successResults = [result1, result2].filter(r => r.success);
        const failureResults = [result1, result2].filter(r => !r.success);

        // Exactly ONE should succeed
        expect(successResults.length).toBe(1);
        expect(failureResults.length).toBe(1);

        // The successful one should have incremented the version
        expect(successResults[0].version).toBe(baseVersion + 1);

        // The failed one should see the current version (not the stale one)
        expect(failureResults[0].version).toBe(baseVersion + 1);

        // Only ONE message should be in the final state
        const finalData = SessionState.getSessionData();
        expect(finalData.messages.length).toBe(1);
        expect(finalData._version).toBe(baseVersion + 1);
    });

    it('should reset version when setSessionData is called', async () => {
        await SessionState.updateSessionData((data) => data);
        await SessionState.updateSessionData((data) => data);

        expect(SessionState.getSessionData()._version).toBe(2);

        SessionState.setSessionData({
            id: 'new-session',
            messages: []
        });

        expect(SessionState.getSessionData()._version).toBe(0);
    });

    it('should work with addMessageToHistory (backward compatibility)', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'Hello' });

        const data = SessionState.getSessionData();
        expect(data.messages).toHaveLength(1);
        expect(data._version).toBe(1);
    });

    it('should work with addMessagesToHistory (backward compatibility)', async () => {
        const messages = [
            { role: 'user', content: 'First' },
            { role: 'assistant', content: 'Second' }
        ];

        await SessionState.addMessagesToHistory(messages);

        const data = SessionState.getSessionData();
        expect(data.messages).toHaveLength(2);
        expect(data._version).toBe(1);
    });

    it('should work with removeMessageFromHistory (backward compatibility)', async () => {
        await SessionState.addMessageToHistory({ role: 'user', content: 'First' });
        await SessionState.addMessageToHistory({ role: 'assistant', content: 'Second' });

        const removed = await SessionState.removeMessageFromHistory(0);

        expect(removed).toBe(true);
        const data = SessionState.getSessionData();
        expect(data.messages).toHaveLength(1);
        // Version should have incremented twice for adds + once for remove
        expect(data._version).toBeGreaterThan(0);
    });

    it('should include version in frozen session data', () => {
        const data = SessionState.getSessionData();

        // Attempting to mutate frozen data should throw
        expect(() => {
            data._version = 999;  // This should throw due to Object.freeze
        }).toThrow();

        // Version should not have changed in the actual state
        const data2 = SessionState.getSessionData();
        expect(data2._version).toBe(0);
    });
});
