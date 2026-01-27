/**
 * Session Manager Facade - Delegation Tests
 *
 * Tests that verify SessionManager facade methods correctly delegate
 * to the internal module's session manager instance.
 *
 * @module tests/unit/session-manager-facade.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

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

// Mock window
global.window = {
    location: { origin: 'http://localhost:3000' },
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    showToast: vi.fn(),
    _sessionData: null,
    _userContext: null
};

// Mock document
global.document = {
    visibilityState: 'visible',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
};

// ==========================================
// Setup & Teardown
// ==========================================

let SessionManager;
let Internal;

beforeEach(async () => {
    // Clear mocks
    localStorageMock.clear();
    sessionStorageMock.clear();
    mockEventBus.clearAll();

    // Reset storage mocks
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

    // Fresh import for each test
    vi.resetModules();
    const facadeModule = await import('../../js/services/session-manager.js');
    SessionManager = facadeModule.SessionManager;
    Internal = await import('../../js/services/session-manager/index.js');
});

afterEach(() => {
    vi.clearAllMocks();
});

// ==========================================
// Persistence Methods Delegation Tests
// ==========================================

describe('SessionManager Facade - Persistence Methods Delegate Correctly', () => {
    describe('saveConversation', () => {
        it('should delegate saveConversation to Internal session manager', () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'saveConversation');

            SessionManager.saveConversation(2000);

            expect(spy).toHaveBeenCalledWith(2000);
        });

        it('should delegate saveConversation with default delay', () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'saveConversation');

            SessionManager.saveConversation();

            expect(spy).toHaveBeenCalledWith(2000);
        });

        it('should delegate saveConversation with custom delay', () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'saveConversation');

            SessionManager.saveConversation(5000);

            expect(spy).toHaveBeenCalledWith(5000);
        });
    });

    describe('flushPendingSaveAsync', () => {
        it('should delegate flushPendingSaveAsync to Internal session manager', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'flushPendingSaveAsync');

            await SessionManager.flushPendingSaveAsync();

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('emergencyBackupSync', () => {
        it('should delegate emergencyBackupSync to Internal session manager', () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'emergencyBackupSync');

            SessionManager.emergencyBackupSync();

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('recoverEmergencyBackup', () => {
        it('should delegate recoverEmergencyBackup to Internal module function', async () => {
            const spy = vi.spyOn(Internal, 'recoverEmergencyBackup');

            await SessionManager.recoverEmergencyBackup();

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('saveCurrentSession', () => {
        it('should delegate saveCurrentSession to Internal session manager', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'saveCurrentSession');

            await SessionManager.saveCurrentSession();

            expect(spy).toHaveBeenCalled();
        });
    });
});

// ==========================================
// State Methods Delegation Tests
// ==========================================

describe('SessionManager Facade - State Methods Delegate Correctly', () => {
    describe('getHistory', () => {
        it('should delegate getHistory to Internal session manager', () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'getHistory');

            SessionManager.getHistory();

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('addMessageToHistory', () => {
        it('should delegate addMessageToHistory to Internal session manager', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'addMessageToHistory');
            const message = { role: 'user', content: 'Test message' };

            await SessionManager.addMessageToHistory(message);

            expect(spy).toHaveBeenCalledWith(message);
        });
    });

    describe('addMessagesToHistory', () => {
        it('should delegate addMessagesToHistory to Internal session manager', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'addMessagesToHistory');
            const messages = [
                { role: 'user', content: 'First' },
                { role: 'assistant', content: 'Response' }
            ];

            await SessionManager.addMessagesToHistory(messages);

            expect(spy).toHaveBeenCalledWith(messages);
        });
    });

    describe('truncateHistory', () => {
        it('should delegate truncateHistory to Internal session manager', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'truncateHistory');

            await SessionManager.truncateHistory(10);

            expect(spy).toHaveBeenCalledWith(10);
        });
    });

    describe('removeMessageFromHistory', () => {
        it('should delegate removeMessageFromHistory to Internal session manager', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'removeMessageFromHistory');

            await SessionManager.removeMessageFromHistory(5);

            expect(spy).toHaveBeenCalledWith(5);
        });
    });
});

// ==========================================
// Lifecycle Methods Delegation Tests
// ==========================================

describe('SessionManager Facade - Lifecycle Methods Delegate Correctly', () => {
    describe('createSession', () => {
        it('should delegate createSession to Internal session manager', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'createSession');

            await SessionManager.createSession('Test Title', 'default');

            expect(spy).toHaveBeenCalledWith('Test Title', 'default');
        });

        it('should delegate createSession with undefined title', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'createSession');

            await SessionManager.createSession(undefined, 'default');

            expect(spy).toHaveBeenCalledWith(undefined, 'default');
        });
    });

    describe('deleteSession', () => {
        it('should delegate deleteSession to Internal module function', async () => {
            const spy = vi.spyOn(Internal, 'deleteSession');
            const sessionId = 'test-session-id';

            await SessionManager.deleteSession(sessionId);

            expect(spy).toHaveBeenCalledWith(sessionId);
        });
    });

    describe('getAllSessions', () => {
        it('should delegate getAllSessions to Internal module function', async () => {
            const spy = vi.spyOn(Internal, 'getAllSessions');

            await SessionManager.getAllSessions();

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('renameSession', () => {
        it('should delegate renameSession to Internal module function', async () => {
            const spy = vi.spyOn(Internal, 'renameSession');
            const sessionId = 'test-session-id';
            const newTitle = 'New Title';

            await SessionManager.renameSession(sessionId, newTitle);

            expect(spy).toHaveBeenCalledWith(sessionId, newTitle);
        });
    });

    describe('clearAllSessions', () => {
        it('should delegate clearAllSessions to Internal module function', async () => {
            const spy = vi.spyOn(Internal, 'clearAllSessions');

            await SessionManager.clearAllSessions();

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('activateSession', () => {
        it('should delegate activateSession to Internal session manager', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'activateSession');
            const sessionId = 'test-session-id';

            await SessionManager.activateSession(sessionId);

            expect(spy).toHaveBeenCalledWith(sessionId);
        });
    });

    describe('loadSession', () => {
        it('should delegate loadSession to Internal module function', async () => {
            const spy = vi.spyOn(Internal, 'getSession');
            const sessionId = 'test-session-id';

            await SessionManager.loadSession(sessionId);

            expect(spy).toHaveBeenCalledWith(sessionId);
        });
    });

    describe('getCurrentSession', () => {
        it('should delegate getCurrentSession to Internal session manager', () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'getCurrentSession');

            SessionManager.getCurrentSession();

            expect(spy).toHaveBeenCalled();
        });
    });
});

// ==========================================
// Additional Methods Delegation Tests
// ==========================================

describe('SessionManager Facade - Additional Methods Delegate Correctly', () => {
    describe('switchSession', () => {
        it('should delegate switchSession to Internal module function', async () => {
            const spy = vi.spyOn(Internal, 'switchSession');
            const sessionId = 'test-session-id';

            await SessionManager.switchSession(sessionId);

            expect(spy).toHaveBeenCalledWith(sessionId);
        });
    });

    describe('clearConversation', () => {
        it('should delegate clearConversation to Internal session manager', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'clearConversation');

            await SessionManager.clearConversation();

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('initialize', () => {
        it('should delegate initialize to Internal session manager', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'initialize');

            await SessionManager.initialize();

            expect(spy).toHaveBeenCalled();
        });

        it('should register event schemas on initialize', async () => {
            await SessionManager.initialize();

            expect(mockEventBus.registerSchemas).toHaveBeenCalled();
        });
    });

    describe('init', () => {
        it('should delegate init (backward compatible alias) to initialize', async () => {
            const manager = Internal.getSessionManager();
            const spy = vi.spyOn(manager, 'initialize');

            await SessionManager.init();

            expect(spy).toHaveBeenCalled();
        });
    });

    describe('setUserContext', () => {
        it('should handle deprecated setUserContext method', () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn');

            SessionManager.setUserContext({ test: 'context' });

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                '[SessionManager] setUserContext() is deprecated and has no effect'
            );
        });
    });
});
