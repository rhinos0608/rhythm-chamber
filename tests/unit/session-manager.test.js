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
    clearAll: vi.fn(),
    registerSchemas: vi.fn()
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

// Helper to generate valid UUID v4 format IDs for tests
function generateMockUUID(suffix = '') {
    // Generate deterministic UUID based on suffix for consistency
    const hash = suffix.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hex = (hash + 0x10000).toString(16).substring(1);

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where x is any hex digit and y is 8, 9, a, or b
    const segment1 = hex.padStart(8, '0').substring(0, 8);
    const segment2 = '0000';
    // 4xxx format - need exactly 4 characters
    const seg3Hex = hex.padStart(3, '0').substring(0, 3);
    const segment3 = `4${seg3Hex}`;
    // yxxx format where y is 8, 9, a, or b - need exactly 4 characters
    const seg4Hex = hex.padStart(3, '0').substring(0, 3);
    const segment4 = `8${seg4Hex}`;
    const segment5 = hex.padStart(12, '0').substring(0, 12);

    return `${segment1}-${segment2}-${segment3}-${segment4}-${segment5}`;
}

// ==========================================
// Setup & Teardown
// ==========================================

let SessionManager;
let SessionLifecycle;

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
    // Import SessionLifecycle for testing moved methods
    const lifecycleModule = await import('../../js/services/session-manager/session-lifecycle.js');
    SessionLifecycle = lifecycleModule;
});

afterEach(() => {
    vi.clearAllMocks();
});

// ==========================================
// UUID Generation Tests (moved to SessionLifecycle)
// ==========================================

describe('SessionLifecycle UUID Generation', () => {
    it('should generate valid UUID v4 format', () => {
        const uuid = SessionLifecycle.generateUUID();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
        const uuids = new Set();
        for (let i = 0; i < 100; i++) {
            uuids.add(SessionLifecycle.generateUUID());
        }
        expect(uuids.size).toBe(100);
    });
});

// ==========================================
// Session Validation Tests (moved to SessionLifecycle)
// ==========================================

describe('SessionLifecycle Validation', () => {
    it('should validate valid session structure', () => {
        const validSession = createMockSession('test-id', [{ role: 'user', content: 'Hello' }]);
        expect(SessionLifecycle.validateSession(validSession)).toBe(true);
    });

    it('should reject session without id', () => {
        const invalidSession = {
            createdAt: new Date().toISOString(),
            messages: []
        };
        expect(SessionLifecycle.validateSession(invalidSession)).toBe(false);
    });

    it('should reject session without messages array', () => {
        const invalidSession = {
            id: 'test-id',
            createdAt: new Date().toISOString(),
            messages: 'not an array'
        };
        expect(SessionLifecycle.validateSession(invalidSession)).toBe(false);
    });

    it('should reject session without createdAt', () => {
        const invalidSession = {
            id: 'test-id',
            messages: []
        };
        expect(SessionLifecycle.validateSession(invalidSession)).toBe(false);
    });

    it('should reject null session', () => {
        expect(SessionLifecycle.validateSession(null)).toBeFalsy();
    });

    it('should reject undefined session', () => {
        expect(SessionLifecycle.validateSession(undefined)).toBeFalsy();
    });
});

// ==========================================
// Session Creation Tests (updated API)
// ==========================================

describe('SessionManager Session Creation', () => {
    it('should create new session with title and personality', async () => {
        const session = await SessionManager.createSession('My Chat', 'default');
        expect(session).toBeDefined();
        expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should save session to storage on creation', async () => {
        await SessionManager.createSession('Test Chat', 'default');
        expect(mockStorage.setConfig).toHaveBeenCalledWith(
            'rhythm_chamber_current_session',
            expect.any(String)
        );
    });

    it('should create session with default title if not provided', async () => {
        const session = await SessionManager.createSession();
        expect(session).toBeDefined();
        expect(session.id).toBeTruthy();
    });

    it('should emit session:created event', async () => {
        await SessionManager.createSession('New Chat', 'default');
        expect(mockEventBus.emit).toHaveBeenCalledWith(
            'session:created',
            expect.objectContaining({
                sessionId: expect.any(String)
            })
        );
    });
});

// ==========================================
// Session Data Access Tests (updated API)
// ==========================================

describe('SessionManager Data Access', () => {
    it('should return current session object', async () => {
        await SessionManager.createSession('Test', 'default');
        const session = SessionManager.getCurrentSession();
        expect(session).toBeDefined();
        expect(session.id).toBeTruthy();
    });

    it('should get session id from current session', async () => {
        await SessionManager.createSession('Test', 'default');
        const session = SessionManager.getCurrentSession();
        expect(session.id).toBeTruthy();
    });

    it('should return empty history initially', async () => {
        await SessionManager.createSession('Test', 'default');
        const history = SessionManager.getHistory();
        expect(history).toEqual([]);
    });

    it('should add message to history', async () => {
        await SessionManager.createSession('Test', 'default');
        const message = { role: 'user', content: 'Hello' };
        await SessionManager.addMessageToHistory(message);

        const history = SessionManager.getHistory();
        expect(history).toContainEqual(message);
    });

    it('should return copy of history (not reference)', async () => {
        await SessionManager.createSession('Test', 'default');
        const history1 = SessionManager.getHistory();
        const history2 = SessionManager.getHistory();

        expect(history1).not.toBe(history2);
        expect(history1).toEqual(history2);
    });

    it('should tag message with data version', async () => {
        await SessionManager.createSession('Test', 'default');
        const message = { role: 'user', content: 'Hello' };
        await SessionManager.addMessageToHistory(message);

        expect(mockDataVersion.tagMessage).toHaveBeenCalledWith(message);
    });

    it('should remove message from history by index', async () => {
        await SessionManager.createSession('Test', 'default');
        await SessionManager.addMessageToHistory({ role: 'user', content: 'First' });
        await SessionManager.addMessageToHistory({ role: 'assistant', content: 'Response' });

        const removed = await SessionManager.removeMessageFromHistory(0);
        expect(removed).toBe(true);

        const history = SessionManager.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].role).toBe('assistant');
    });

    it('should return false when removing invalid index', async () => {
        await SessionManager.createSession('Test', 'default');
        await SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });

        const removed = await SessionManager.removeMessageFromHistory(10);
        expect(removed).toBe(false);
    });

    it('should truncate history to length', async () => {
        await SessionManager.createSession('Test', 'default');
        for (let i = 0; i < 10; i++) {
            await SessionManager.addMessageToHistory({ role: 'user', content: `Message ${i}` });
        }

        await SessionManager.truncateHistory(5);
        expect(SessionManager.getHistory()).toHaveLength(5);
    });

    it('should add multiple messages to history atomically', async () => {
        await SessionManager.createSession('Test', 'default');
        const messages = [
            { role: 'user', content: 'First' },
            { role: 'assistant', content: 'Response' },
            { role: 'user', content: 'Second' }
        ];

        await SessionManager.addMessagesToHistory(messages);
        const history = SessionManager.getHistory();
        expect(history).toHaveLength(3);
        expect(history).toEqual(messages);
    });
});

// ==========================================
// Session Persistence Tests (updated API)
// ==========================================

describe('SessionManager Persistence', () => {
    it('should save current session and return boolean', async () => {
        await SessionManager.createSession('Test', 'default');
        await SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });

        const result = await SessionManager.saveCurrentSession();
        expect(result).toBe(true);

        expect(mockStorage.saveSession).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: expect.any(Array)
            })
        );
    });

    it('should use debounced save', async () => {
        vi.useFakeTimers();
        await SessionManager.createSession('Test', 'default');

        SessionManager.saveConversation(2000);
        expect(mockStorage.saveSession).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(mockStorage.saveSession).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1001);
        await vi.runAllTimersAsync(); // Wait for async save to complete
        expect(mockStorage.saveSession).toHaveBeenCalled();

        vi.useRealTimers();
    });

    it('should flush pending save async', async () => {
        await SessionManager.createSession('Test', 'default');
        SessionManager.saveConversation(5000);

        // Flush should trigger immediate save
        await SessionManager.flushPendingSaveAsync();
        expect(mockStorage.saveSession).toHaveBeenCalled();
    });

    it('should perform emergency backup sync', async () => {
        await SessionManager.createSession('Test', 'default');
        await SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });

        // Should not throw
        expect(() => {
            SessionManager.emergencyBackupSync();
        }).not.toThrow();
    });

    it('should recover from emergency backup', async () => {
        // Set up emergency backup in localStorage using the correct key
        const backupId = generateMockUUID('backup');
        const backupData = {
            sessionId: backupId, // Should be sessionId, not id
            messages: [{ role: 'user', content: 'Backed up message' }],
            timestamp: Date.now(), // Required by recoverEmergencyBackup
            createdAt: new Date().toISOString()
        };
        localStorageMock.store['rc_session_emergency_backup'] = JSON.stringify(backupData);

        // Mock Storage.getSession to return null (session doesn't exist)
        mockStorage.getSession.mockResolvedValue(null);

        const recovered = await SessionManager.recoverEmergencyBackup();
        expect(recovered).toBe(true);
    });
});

// ==========================================
// Session Loading Tests (updated API)
// ==========================================

describe('SessionManager Loading', () => {
    it('should load existing session', async () => {
        const existingId = generateMockUUID('existing-id');
        const mockSession = createMockSession(existingId, [
            { role: 'user', content: 'Loaded message' }
        ]);
        mockStorage.getSession.mockResolvedValue(mockSession);

        const loaded = await SessionManager.loadSession(existingId);
        expect(loaded).toEqual(mockSession);
    });

    it('should return null for non-existent session', async () => {
        mockStorage.getSession.mockResolvedValue(null);

        const loaded = await SessionManager.loadSession(generateMockUUID('non-existent'));
        expect(loaded).toBeNull();
    });

    it('should activate session and set it as current', async () => {
        const existingId = generateMockUUID('activate-id');
        const mockSession = createMockSession(existingId, [
            { role: 'user', content: 'Activated message' }
        ]);
        mockStorage.getSession.mockResolvedValue(mockSession);

        const activated = await SessionManager.activateSession(existingId);
        expect(activated).toBeDefined();
        expect(activated.id).toBe(existingId);
    });
});

// ==========================================
// Session Switching Tests (updated API)
// ==========================================

describe('SessionManager Switching', () => {
    it('should switch to another session', async () => {
        const firstSession = await SessionManager.createSession('First', 'default');
        await SessionManager.addMessageToHistory({ role: 'user', content: 'First session' });

        const secondId = generateMockUUID('second-id');
        const mockSession = createMockSession(secondId, [
            { role: 'user', content: 'Second session' }
        ]);
        mockStorage.getSession.mockResolvedValue(mockSession);

        const switched = await SessionManager.switchSession(secondId);

        expect(switched).toBe(true);
        const current = SessionManager.getCurrentSession();
        expect(current.id).toBe(secondId);
    });

    it('should save current session before switching', async () => {
        const firstSession = await SessionManager.createSession('First', 'default');
        await SessionManager.addMessageToHistory({ role: 'user', content: 'Before switch' });

        // Trigger a debounced save
        SessionManager.saveConversation(100);

        // Wait a bit and clear the timeout to simulate immediate save
        await new Promise(resolve => setTimeout(resolve, 50));

        const secondId = generateMockUUID('second-id');
        const mockSession = createMockSession(secondId, []);
        mockStorage.getSession.mockResolvedValue(mockSession);

        await SessionManager.switchSession(secondId);

        // saveSession should be called (either from switchSession or the debounced save)
        expect(mockStorage.saveSession).toHaveBeenCalled();
    });

    it('should return false when switching to non-existent session', async () => {
        await SessionManager.createSession('Test', 'default');
        mockStorage.getSession.mockResolvedValue(null);

        const switched = await SessionManager.switchSession(generateMockUUID('non-existent'));
        expect(switched).toBe(false);
    });

    it('should emit session:switched event', async () => {
        const firstSession = await SessionManager.createSession('First', 'default');
        const targetId = generateMockUUID('target-id');
        const mockSession = createMockSession(targetId, []);
        mockStorage.getSession.mockResolvedValue(mockSession);

        await SessionManager.switchSession(targetId);

        expect(mockEventBus.emit).toHaveBeenCalledWith(
            'session:switched',
            expect.objectContaining({
                toSessionId: targetId
            })
        );
    });
});

// ==========================================
// Session Listing Tests (updated API)
// ==========================================

describe('SessionManager Listing', () => {
    it('should return empty array when storage unavailable', async () => {
        delete mockStorage.getAllSessions;

        const sessions = await SessionManager.getAllSessions();
        expect(sessions).toEqual([]);
    });

    it('should return empty array when getAllSessions is not a function', async () => {
        // Save the original mock
        const originalMock = mockStorage.getAllSessions;

        // Set getAllSessions to a non-function value
        mockStorage.getAllSessions = 'not-a-function';

        const sessions = await SessionManager.getAllSessions();
        expect(sessions).toEqual([]);

        // Restore the mock for other tests
        mockStorage.getAllSessions = originalMock;
    });

    it('should return all sessions from storage', async () => {
        const mockSessions = [
            createMockSession('id-1'),
            createMockSession('id-2')
        ];
        mockStorage.getAllSessions.mockResolvedValue(mockSessions);

        const sessions = await SessionManager.getAllSessions();
        expect(sessions).toEqual(mockSessions);
    });

    it('should return empty array on storage error', async () => {
        mockStorage.getAllSessions.mockRejectedValue(new Error('Storage error'));

        const sessions = await SessionManager.getAllSessions();
        expect(sessions).toEqual([]);
    });
});

// ==========================================
// Session Deletion Tests (updated API)
// ==========================================

describe('SessionManager Deletion', () => {
    it('should delete session by ID', async () => {
        await SessionManager.createSession('Test', 'default');
        const session = SessionManager.getCurrentSession();
        const sessionId = session.id;

        const deleted = await SessionManager.deleteSession(sessionId);

        expect(deleted).toBe(true);
        expect(mockStorage.deleteSession).toHaveBeenCalledWith(sessionId);
    });

    it('should emit session:deleted event', async () => {
        await SessionManager.createSession('Test', 'default');
        const session = SessionManager.getCurrentSession();
        const sessionId = session.id;

        await SessionManager.deleteSession(sessionId);

        expect(mockEventBus.emit).toHaveBeenCalledWith(
            'session:deleted',
            expect.objectContaining({
                sessionId
            })
        );
    });

    it('should return false when storage unavailable', async () => {
        delete mockStorage.deleteSession;

        const deleted = await SessionManager.deleteSession('any-id');
        expect(deleted).toBe(false);
    });
});

// ==========================================
// Session Renaming Tests
// ==========================================

describe('SessionManager Renaming', () => {
    it('should rename session', async () => {
        const renameId = generateMockUUID('rename-id');
        const mockSession = createMockSession(renameId, []);
        mockStorage.getSession.mockResolvedValue(mockSession);

        const renamed = await SessionManager.renameSession(renameId, 'New Title');

        expect(renamed).toBe(true);
        expect(mockStorage.saveSession).toHaveBeenCalledWith(
            expect.objectContaining({
                id: renameId,
                title: 'New Title'
            })
        );
    });

    it('should return false for non-existent session', async () => {
        mockStorage.getSession.mockResolvedValue(null);

        const renamed = await SessionManager.renameSession(generateMockUUID('non-existent'), 'Title');
        expect(renamed).toBe(false);
    });

    it('should emit session:updated event on rename', async () => {
        const updateId = generateMockUUID('update-id');
        const mockSession = createMockSession(updateId, []);
        mockStorage.getSession.mockResolvedValue(mockSession);

        await SessionManager.renameSession(updateId, 'Updated');

        expect(mockEventBus.emit).toHaveBeenCalledWith(
            'session:updated',
            expect.objectContaining({
                sessionId: updateId,
                field: 'title'
            })
        );
    });
});

// ==========================================
// Clear Conversation Tests (updated API)
// ==========================================

describe('SessionManager Clear Conversation', () => {
    it('should clear all sessions', async () => {
        await SessionManager.createSession('Test', 'default');
        await SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });
        await SessionManager.addMessageToHistory({ role: 'assistant', content: 'Response' });

        await SessionManager.clearAllSessions();

        expect(SessionManager.getHistory()).toEqual([]);
    });

    it('should create new session after clear', async () => {
        const oldSession = await SessionManager.createSession('Old', 'default');
        await SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });

        await SessionManager.clearAllSessions();

        const newSession = SessionManager.getCurrentSession();
        expect(newSession.id).not.toBe(oldSession.id);
    });
});

// ==========================================
// Edge Cases
// ==========================================

describe('SessionManager Edge Cases', () => {
    it('should handle empty messages in addMessageToHistory', async () => {
        await SessionManager.createSession('Test', 'default');
        await expect(SessionManager.addMessageToHistory(null)).resolves.not.toThrow();
    });

    it('should handle empty array in addMessagesToHistory', async () => {
        await SessionManager.createSession('Test', 'default');
        await expect(SessionManager.addMessagesToHistory([])).resolves.not.toThrow();
    });
});
