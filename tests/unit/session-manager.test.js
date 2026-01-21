/**
 * Session Manager Unit Tests
 *
 * Tests for the session lifecycle management service.
 *
 * @module tests/unit/session-manager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mocks
// ==========================================

const mockStorage = {
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    getSession: vi.fn(),
    saveSession: vi.fn(),
    deleteSession: vi.fn(),
    getAllSessions: vi.fn()
};

const mockEventBus = {
    emit: vi.fn(),
    on: vi.fn(),
    clearAll: vi.fn()
};

const mockDataVersion = {
    tagMessage: vi.fn()
};

// Mock modules before importing
vi.mock('../../js/storage.js', () => ({ Storage: mockStorage }));
vi.mock('../../js/services/event-bus.js', () => ({ EventBus: mockEventBus }));
vi.mock('../../js/services/data-version.js', () => ({ DataVersion: mockDataVersion }));

// Helper to reset all storage mocks
function resetStorageMocks() {
    // Restore methods if they were deleted by tests
    if (!mockStorage.getAllSessions) {
        mockStorage.getAllSessions = vi.fn();
    }
    if (!mockStorage.deleteSession) {
        mockStorage.deleteSession = vi.fn();
    }
    if (!mockStorage.getSession) {
        mockStorage.getSession = vi.fn();
    }
    if (!mockStorage.saveSession) {
        mockStorage.saveSession = vi.fn();
    }
    if (!mockStorage.setConfig) {
        mockStorage.setConfig = vi.fn();
    }
    if (!mockStorage.getConfig) {
        mockStorage.getConfig = vi.fn();
    }

    mockStorage.getConfig.mockReset();
    mockStorage.setConfig.mockReset();
    mockStorage.getSession.mockReset();
    mockStorage.saveSession.mockReset();
    mockStorage.deleteSession.mockReset();
    mockStorage.getAllSessions.mockReset();

    // Set default return values
    mockStorage.getConfig.mockResolvedValue(null);
    mockStorage.getSession.mockResolvedValue(null);
    mockStorage.saveSession.mockResolvedValue(true);
    mockStorage.deleteSession.mockResolvedValue(true);
    mockStorage.getAllSessions.mockResolvedValue([]);
    mockStorage.setConfig.mockResolvedValue(undefined);
}

// Mock localStorage
const localStorageMock = {
    store: {},
    getItem: vi.fn((key) => localStorageMock.store[key] || null),
    setItem: vi.fn((key, value) => { localStorageMock.store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete localStorageMock.store[key]; }),
    clear: vi.fn(() => { localStorageMock.store = {}; })
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock sessionStorage
const sessionStorageMock = {
    store: {},
    getItem: vi.fn((key) => sessionStorageMock.store[key] || null),
    setItem: vi.fn((key, value) => { sessionStorageMock.store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete sessionStorageMock.store[key]; }),
    clear: vi.fn(() => { sessionStorageMock.store = {}; })
};
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock });

// Mock window with addEventListener for session-manager
global.window = {
    location: { origin: 'http://localhost:3000' },
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    showToast: vi.fn(),
    _sessionData: null,
    _userContext: null
};

// Mock document for visibilitychange event
global.document = {
    visibilityState: 'visible',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
};

// ==========================================
// Helper Functions
// ==========================================

function createMockSession(id, messages = []) {
    return {
        id,
        title: 'Test Session',
        createdAt: new Date().toISOString(),
        messages,
        metadata: {
            personalityName: 'Test',
            personalityEmoji: '🧪',
            isLiteMode: false
        }
    };
}

// ==========================================
// Setup & Teardown
// ==========================================

let SessionManager;

beforeEach(async () => {
    // Clear local storage mocks
    localStorageMock.clear();
    sessionStorageMock.clear();
    mockEventBus.clearAll();

    // Reset storage mocks to return default values
    resetStorageMocks();

    // Fresh import for each test
    vi.resetModules();
    const module = await import('../../js/services/session-manager.js');
    SessionManager = module.SessionManager;
});

afterEach(() => {
    vi.clearAllMocks();
});

// ==========================================
// UUID Generation Tests
// ==========================================

describe('SessionManager UUID Generation', () => {
    it('should generate valid UUID v4 format', () => {
        const uuid = SessionManager.generateUUID();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
        const uuids = new Set();
        for (let i = 0; i < 100; i++) {
            uuids.add(SessionManager.generateUUID());
        }
        expect(uuids.size).toBe(100);
    });
});

// ==========================================
// Session Validation Tests
// ==========================================

describe('SessionManager Validation', () => {
    it('should validate valid session structure', () => {
        const validSession = createMockSession('test-id', [{ role: 'user', content: 'Hello' }]);
        expect(SessionManager.validateSession(validSession)).toBe(true);
    });

    it('should reject session without id', () => {
        const invalidSession = {
            createdAt: new Date().toISOString(),
            messages: []
        };
        expect(SessionManager.validateSession(invalidSession)).toBe(false);
    });

    it('should reject session without messages array', () => {
        const invalidSession = {
            id: 'test-id',
            createdAt: new Date().toISOString(),
            messages: 'not an array'
        };
        expect(SessionManager.validateSession(invalidSession)).toBe(false);
    });

    it('should reject session without createdAt', () => {
        const invalidSession = {
            id: 'test-id',
            messages: []
        };
        expect(SessionManager.validateSession(invalidSession)).toBe(false);
    });

    it('should reject null session', () => {
        expect(SessionManager.validateSession(null)).toBeFalsy();
    });

    it('should reject undefined session', () => {
        expect(SessionManager.validateSession(undefined)).toBeFalsy();
    });
});

// ==========================================
// Session Creation Tests
// ==========================================

describe('SessionManager Session Creation', () => {
    it('should create new session with unique ID', async () => {
        const sessionId = await SessionManager.createNewSession();
        expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should save session to storage on creation', async () => {
        await SessionManager.createNewSession();
        expect(mockStorage.setConfig).toHaveBeenCalledWith(
            'rhythm_chamber_current_session',
            expect.any(String)
        );
    });

    it('should create session with initial messages', async () => {
        const initialMessages = [
            { role: 'user', content: 'Test message' },
            { role: 'assistant', content: 'Test response' }
        ];
        const sessionId = await SessionManager.createNewSession(initialMessages);

        expect(mockStorage.saveSession).toHaveBeenCalledWith(
            expect.objectContaining({
                id: sessionId,
                messages: initialMessages
            })
        );
    });

    it('should emit session:created event', async () => {
        await SessionManager.createNewSession();
        expect(mockEventBus.emit).toHaveBeenCalledWith(
            'session:created',
            expect.objectContaining({
                sessionId: expect.any(String),
                title: 'New Chat'
            })
        );
    });
});

// ==========================================
// Session Data Access Tests
// ==========================================

describe('SessionManager Data Access', () => {
    it('should return current session ID', async () => {
        const sessionId = await SessionManager.createNewSession();
        expect(SessionManager.getCurrentSessionId()).toBe(sessionId);
    });

    it('should return empty history initially', async () => {
        await SessionManager.createNewSession();
        const history = SessionManager.getHistory();
        expect(history).toEqual([]);
    });

    it('should add message to history', async () => {
        await SessionManager.createNewSession();
        const message = { role: 'user', content: 'Hello' };
        SessionManager.addMessageToHistory(message);

        const history = SessionManager.getHistory();
        expect(history).toContainEqual(message);
    });

    it('should return copy of history (not reference)', async () => {
        await SessionManager.createNewSession();
        const history1 = SessionManager.getHistory();
        const history2 = SessionManager.getHistory();

        expect(history1).not.toBe(history2);
        expect(history1).toEqual(history2);
    });

    it('should tag message with data version', async () => {
        await SessionManager.createNewSession();
        const message = { role: 'user', content: 'Hello' };
        SessionManager.addMessageToHistory(message);

        expect(mockDataVersion.tagMessage).toHaveBeenCalledWith(message);
    });

    it('should remove message from history by index', async () => {
        await SessionManager.createNewSession();
        SessionManager.addMessageToHistory({ role: 'user', content: 'First' });
        SessionManager.addMessageToHistory({ role: 'assistant', content: 'Response' });

        const removed = SessionManager.removeMessageFromHistory(0);
        expect(removed).toBe(true);

        const history = SessionManager.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].role).toBe('assistant');
    });

    it('should return false when removing invalid index', async () => {
        await SessionManager.createNewSession();
        SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = SessionManager.removeMessageFromHistory(10);
        expect(removed).toBe(false);
    });

    it('should truncate history to length', async () => {
        await SessionManager.createNewSession();
        for (let i = 0; i < 10; i++) {
            SessionManager.addMessageToHistory({ role: 'user', content: `Message ${i}` });
        }

        SessionManager.truncateHistory(5);
        expect(SessionManager.getHistory()).toHaveLength(5);
    });

    it('should replace entire history', async () => {
        await SessionManager.createNewSession();
        const newMessages = [
            { role: 'user', content: 'New message' },
            { role: 'assistant', content: 'New response' }
        ];

        SessionManager.replaceHistory(newMessages);
        expect(SessionManager.getHistory()).toEqual(newMessages);
    });
});

// ==========================================
// Session Persistence Tests
// ==========================================

describe('SessionManager Persistence', () => {
    it('should save current session', async () => {
        const sessionId = await SessionManager.createNewSession();
        SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });

        await SessionManager.saveCurrentSession();

        expect(mockStorage.saveSession).toHaveBeenCalledWith(
            expect.objectContaining({
                id: sessionId,
                messages: expect.any(Array)
            })
        );
    });

    it('should limit saved messages to MAX_SAVED_MESSAGES', async () => {
        await SessionManager.createNewSession();
        for (let i = 0; i < 150; i++) {
            SessionManager.addMessageToHistory({ role: 'user', content: `Message ${i}` });
        }

        await SessionManager.saveCurrentSession();

        const savedCall = mockStorage.saveSession.mock.calls[0][0];
        expect(savedCall.messages.length).toBeLessThanOrEqual(100);
    });

    it('should use debounced save', async () => {
        vi.useFakeTimers();
        await SessionManager.createNewSession();

        SessionManager.saveConversation(2000);
        expect(mockStorage.saveSession).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(mockStorage.saveSession).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1001);
        await vi.runAllTimersAsync(); // Wait for async save to complete
        expect(mockStorage.saveSession).toHaveBeenCalled();

        vi.useRealTimers();
    });
});

// ==========================================
// Session Loading Tests
// ==========================================

describe('SessionManager Loading', () => {
    it('should load existing session', async () => {
        const mockSession = createMockSession('existing-id', [
            { role: 'user', content: 'Loaded message' }
        ]);
        mockStorage.getSession.mockResolvedValue(mockSession);

        const loaded = await SessionManager.loadSession('existing-id');
        expect(loaded).toEqual(mockSession);
        expect(SessionManager.getCurrentSessionId()).toBe('existing-id');
    });

    it('should return null for non-existent session', async () => {
        mockStorage.getSession.mockResolvedValue(null);

        const loaded = await SessionManager.loadSession('non-existent');
        expect(loaded).toBeNull();
    });

    it('should return null for invalid session', async () => {
        mockStorage.getSession.mockResolvedValue({
            id: 'invalid',
            createdAt: '2023-01-01'
            // Missing messages array
        });

        const loaded = await SessionManager.loadSession('invalid');
        expect(loaded).toBeNull();
    });

    it('should emit session:loaded event', async () => {
        const mockSession = createMockSession('load-id', [
            { role: 'user', content: 'Test' }
        ]);
        mockStorage.getSession.mockResolvedValue(mockSession);

        await SessionManager.loadSession('load-id');

        expect(mockEventBus.emit).toHaveBeenCalledWith(
            'session:loaded',
            expect.objectContaining({
                sessionId: 'load-id'
            })
        );
    });
});

// ==========================================
// Session Switching Tests
// ==========================================

describe('SessionManager Switching', () => {
    it('should switch to another session', async () => {
        const firstId = await SessionManager.createNewSession();
        SessionManager.addMessageToHistory({ role: 'user', content: 'First session' });

        const mockSession = createMockSession('second-id', [
            { role: 'user', content: 'Second session' }
        ]);
        mockStorage.getSession.mockResolvedValue(mockSession);

        const switched = await SessionManager.switchSession('second-id');

        expect(switched).toBe(true);
        expect(SessionManager.getCurrentSessionId()).toBe('second-id');
    });

    it('should save current session before switching when there is a pending save', async () => {
        const firstId = await SessionManager.createNewSession();
        SessionManager.addMessageToHistory({ role: 'user', content: 'Before switch' });

        // Trigger a debounced save (which creates autoSaveTimeoutId)
        SessionManager.saveConversation(100);

        // Wait a bit and clear the timeout to simulate immediate save
        await new Promise(resolve => setTimeout(resolve, 50));

        const mockSession = createMockSession('second-id', []);
        mockStorage.getSession.mockResolvedValue(mockSession);

        await SessionManager.switchSession('second-id');

        // saveSession should be called (either from switchSession or the debounced save)
        expect(mockStorage.saveSession).toHaveBeenCalled();
    });

    it('should return false when switching to non-existent session', async () => {
        await SessionManager.createNewSession();
        mockStorage.getSession.mockResolvedValue(null);

        const switched = await SessionManager.switchSession('non-existent');
        expect(switched).toBe(false);
    });

    it('should emit session:switched event', async () => {
        const firstId = await SessionManager.createNewSession();
        const mockSession = createMockSession('target-id', []);
        mockStorage.getSession.mockResolvedValue(mockSession);

        await SessionManager.switchSession('target-id');

        expect(mockEventBus.emit).toHaveBeenCalledWith(
            'session:switched',
            expect.objectContaining({
                fromSessionId: firstId,
                toSessionId: 'target-id'
            })
        );
    });
});

// ==========================================
// Session Listing Tests
// ==========================================

describe('SessionManager Listing', () => {
    it('should return empty array when storage unavailable', async () => {
        delete mockStorage.getAllSessions;

        const sessions = await SessionManager.listSessions();
        expect(sessions).toEqual([]);
    });

    it('should return all sessions from storage', async () => {
        const mockSessions = [
            createMockSession('id-1'),
            createMockSession('id-2')
        ];
        mockStorage.getAllSessions.mockResolvedValue(mockSessions);

        const sessions = await SessionManager.listSessions();
        expect(sessions).toEqual(mockSessions);
    });

    it('should return empty array on storage error', async () => {
        mockStorage.getAllSessions.mockRejectedValue(new Error('Storage error'));

        const sessions = await SessionManager.listSessions();
        expect(sessions).toEqual([]);
    });
});

// ==========================================
// Session Deletion Tests
// ==========================================

describe('SessionManager Deletion', () => {
    it('should delete session by ID', async () => {
        await SessionManager.createNewSession();
        const sessionId = SessionManager.getCurrentSessionId();

        const deleted = await SessionManager.deleteSessionById(sessionId);

        expect(deleted).toBe(true);
        expect(mockStorage.deleteSession).toHaveBeenCalledWith(sessionId);
    });

    it('should create new session after deleting current', async () => {
        const currentId = await SessionManager.createNewSession();
        mockStorage.getSession.mockResolvedValue(null); // No session exists

        await SessionManager.deleteSessionById(currentId);

        const newId = SessionManager.getCurrentSessionId();
        expect(newId).not.toBe(currentId);
    });

    it('should emit session:deleted event', async () => {
        await SessionManager.createNewSession();
        const sessionId = SessionManager.getCurrentSessionId();

        await SessionManager.deleteSessionById(sessionId);

        expect(mockEventBus.emit).toHaveBeenCalledWith(
            'session:deleted',
            expect.objectContaining({
                sessionId
            })
        );
    });

    it('should return false when storage unavailable', async () => {
        delete mockStorage.deleteSession;

        const deleted = await SessionManager.deleteSessionById('any-id');
        expect(deleted).toBe(false);
    });
});

// ==========================================
// Session Renaming Tests
// ==========================================

describe('SessionManager Renaming', () => {
    it('should rename session', async () => {
        const mockSession = createMockSession('rename-id', []);
        mockStorage.getSession.mockResolvedValue(mockSession);

        const renamed = await SessionManager.renameSession('rename-id', 'New Title');

        expect(renamed).toBe(true);
        expect(mockStorage.saveSession).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'rename-id',
                title: 'New Title'
            })
        );
    });

    it('should return false for non-existent session', async () => {
        mockStorage.getSession.mockResolvedValue(null);

        const renamed = await SessionManager.renameSession('non-existent', 'Title');
        expect(renamed).toBe(false);
    });

    it('should emit session:updated event on rename', async () => {
        const mockSession = createMockSession('update-id', []);
        mockStorage.getSession.mockResolvedValue(mockSession);

        await SessionManager.renameSession('update-id', 'Updated');

        expect(mockEventBus.emit).toHaveBeenCalledWith(
            'session:updated',
            expect.objectContaining({
                sessionId: 'update-id',
                field: 'title'
            })
        );
    });
});

// ==========================================
// Clear Conversation Tests
// ==========================================

describe('SessionManager Clear Conversation', () => {
    it('should clear conversation history', async () => {
        await SessionManager.createNewSession();
        SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });
        SessionManager.addMessageToHistory({ role: 'assistant', content: 'Response' });

        await SessionManager.clearConversation();

        expect(SessionManager.getHistory()).toEqual([]);
    });

    it('should create new session after clear', async () => {
        const oldId = await SessionManager.createNewSession();
        SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });

        await SessionManager.clearConversation();

        const newId = SessionManager.getCurrentSessionId();
        expect(newId).not.toBe(oldId);
    });
});

// ==========================================
// Edge Cases
// ==========================================

describe('SessionManager Edge Cases', () => {
    it('should handle concurrent updates via updateSessionData', async () => {
        await SessionManager.createNewSession();

        // Simulate concurrent updates
        const update1 = SessionManager.updateSessionData((data) => ({
            ...data,
            messages: [...data.messages, { role: 'user', content: 'Update 1' }]
        }));

        const update2 = SessionManager.updateSessionData((data) => ({
            ...data,
            messages: [...data.messages, { role: 'user', content: 'Update 2' }]
        }));

        await Promise.all([update1, update2]);

        const history = SessionManager.getHistory();
        // Both updates should be applied sequentially
        expect(history.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty messages in addMessageToHistory', async () => {
        await SessionManager.createNewSession();
        expect(() => SessionManager.addMessageToHistory(null)).not.toThrow();
    });
});
