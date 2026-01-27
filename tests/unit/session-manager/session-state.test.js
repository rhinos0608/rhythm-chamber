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
    update: vi.fn()
};

// Create a proper class mock for Mutex
const mockRunExclusive = vi.fn((fn) => fn());

class MockMutex {
    constructor() {
        this.runExclusive = mockRunExclusive;
    }
}

// Mock modules before importing
vi.mock('../../../js/services/data-version.js', () => ({ DataVersion: mockDataVersion }));
vi.mock('../../../js/state/app-state.js', () => ({ AppState: mockAppState }));
vi.mock('../../../js/utils/concurrency/mutex.js', () => ({
    Mutex: MockMutex
}));

// Helper to reset all mocks
function resetMocks() {
    mockDataVersion.tagMessage.mockReset();
    mockAppState.update.mockReset();
    mockRunExclusive.mockReset();
    mockRunExclusive.mockImplementation((fn) => fn());
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
});

// ==========================================
// Session Data Get/Set Tests
// ==========================================

describe('SessionState Session Data', () => {
    it('should get empty session data initially', () => {
        const data = SessionState.getSessionData();
        expect(data).toEqual({
            id: null,
            messages: []
        });
    });

    it('should return frozen session data', () => {
        const data = SessionState.getSessionData();

        // Attempting to mutate frozen data should throw in strict mode
        expect(() => {
            if (data.id !== null) {
                data.id = 'modified';
            }
        }).not.toThrow();
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
        await SessionState.updateSessionData(() => ({}));

        expect(mockRunExclusive).toHaveBeenCalled();
    });

    it('should sync to window after update', async () => {
        SessionState.setSessionData({
            id: 'test-id',
            messages: [{ role: 'user', content: 'Test' }]
        });

        await SessionState.updateSessionData((data) => data);

        expect(global.window._sessionData).toBeDefined();
        expect(global.window._sessionData.id).toBe('test-id');
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
    it('should handle concurrent updates via mutex', async () => {
        SessionState.setSessionData({
            id: 'test',
            messages: []
        });

        // Simulate concurrent updates
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

    it('should prevent race conditions in addMessageToHistory', async () => {
        const promises = [];
        for (let i = 0; i < 20; i++) {
            promises.push(
                SessionState.addMessageToHistory({ role: 'user', content: `Msg ${i}` })
            );
        }

        await Promise.all(promises);

        const history = SessionState.getHistory();
        expect(history.length).toBe(20);
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
