/**
 * Session Persistence Unit Tests
 *
 * Tests for the session persistence module that handles auto-save,
 * emergency backup, and recovery functionality.
 *
 * @module tests/unit/session-persistence
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as SessionState from '../../js/services/session-manager/session-state.js';

// ==========================================
// Mocks
// ==========================================

const mockStorage = {
  saveSession: vi.fn(),
  getSession: vi.fn(),
};

// Mock modules before importing
vi.mock('../../js/storage.js', () => ({
  Storage: mockStorage,
}));

// Mock SessionState functions
vi.mock('../../js/services/session-manager/session-state.js', () => ({
  getCurrentSessionId: vi.fn(),
  getSessionData: vi.fn(),
  getCurrentSessionCreatedAt: vi.fn(),
  setCurrentSessionId: vi.fn(),
  setCurrentSessionCreatedAt: vi.fn(),
}));

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem: vi.fn(key => localStorageMock.store[key] || null),
  setItem: vi.fn((key, value) => {
    localStorageMock.store[key] = String(value);
  }),
  removeItem: vi.fn(key => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock window for personality context
global.window = {
  _userContext: {
    personality: {
      name: 'Test Persona',
      emoji: '🎵',
    },
  },
};

// ==========================================
// Helper Functions
// ==========================================

function resetMocks() {
  localStorageMock.store = {};
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();

  mockStorage.saveSession.mockReset();
  mockStorage.getSession.mockReset();

  vi.mocked(SessionState.getCurrentSessionId).mockReset();
  vi.mocked(SessionState.getSessionData).mockReset();
  vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReset();
}

// ==========================================
// Tests
// ==========================================

describe('SessionPersistence - saveConversation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Import and clear any pending timeouts
    vi.clearAllMocks();
  });

  it('should debounce save calls', async () => {
    const { saveConversation, getAutoSaveTimeoutId, clearAutoSaveTimeout } =
      await import('../../js/services/session-manager/session-persistence.js');

    // Set up session state mock
    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages: [{ role: 'user', content: 'test' }],
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');

    // First call sets timeout
    saveConversation(2000);
    const firstId = getAutoSaveTimeoutId();
    expect(firstId).not.toBeNull();

    // Second call with shorter delay should cancel first timeout
    saveConversation(1000);
    const secondId = getAutoSaveTimeoutId();
    expect(secondId).not.toBeNull();
    expect(secondId).not.toBe(firstId);

    // Third call should also cancel previous
    saveConversation(500);
    const thirdId = getAutoSaveTimeoutId();
    expect(thirdId).not.toBeNull();
    expect(thirdId).not.toBe(secondId);

    // Clean up
    clearAutoSaveTimeout();
    expect(getAutoSaveTimeoutId()).toBeNull();
  });

  it('should clear previous timeout when new save is scheduled', async () => {
    const { saveConversation, getAutoSaveTimeoutId, clearAutoSaveTimeout } =
      await import('../../js/services/session-manager/session-persistence.js');

    // Set up session state mock
    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages: [{ role: 'user', content: 'test' }],
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');

    const firstTimeout = saveConversation(2000);
    const firstId = getAutoSaveTimeoutId();
    expect(firstId).not.toBeNull();

    saveConversation(500);
    const secondId = getAutoSaveTimeoutId();

    expect(secondId).not.toBeNull();
    expect(secondId).not.toBe(firstId);

    clearAutoSaveTimeout();
    expect(getAutoSaveTimeoutId()).toBeNull();
  });
});

describe('SessionPersistence - saveCurrentSession', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should save session to IndexedDB', async () => {
    const { saveCurrentSession } =
      await import('../../js/services/session-manager/session-persistence.js');

    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-session-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-session-id',
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello world!' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');

    mockStorage.saveSession.mockResolvedValue(true);

    const result = await saveCurrentSession();

    expect(result).toBe(true);
    expect(mockStorage.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-session-id',
        title: 'Hello world!',
        createdAt: '2024-01-01T00:00:00.000Z',
        messages: expect.any(Array),
      })
    );
  });

  it('should return false when no session exists', async () => {
    const { saveCurrentSession } =
      await import('../../js/services/session-manager/session-persistence.js');

    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue(null);

    const result = await saveCurrentSession();

    expect(result).toBe(false);
    expect(mockStorage.saveSession).not.toHaveBeenCalled();
  });

  it('should generate title from first user message', async () => {
    const { saveCurrentSession } =
      await import('../../js/services/session-manager/session-persistence.js');

    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages: [
        { role: 'system', content: 'System message' },
        {
          role: 'user',
          content: 'This is a long message that should be truncated to fifty characters',
        },
        { role: 'assistant', content: 'Response' },
      ],
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');

    mockStorage.saveSession.mockResolvedValue(true);

    await saveCurrentSession();

    expect(mockStorage.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'This is a long message that should be truncated to...',
      })
    );
  });

  it('should use "New Chat" as default title when no user message', async () => {
    const { saveCurrentSession } =
      await import('../../js/services/session-manager/session-persistence.js');

    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages: [{ role: 'system', content: 'System message only' }],
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');

    mockStorage.saveSession.mockResolvedValue(true);

    await saveCurrentSession();

    expect(mockStorage.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New Chat',
      })
    );
  });

  it('should include personality metadata', async () => {
    const { saveCurrentSession } =
      await import('../../js/services/session-manager/session-persistence.js');

    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages: [{ role: 'user', content: 'test' }],
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');

    mockStorage.saveSession.mockResolvedValue(true);

    await saveCurrentSession();

    expect(mockStorage.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          personalityName: 'Test Persona',
          personalityEmoji: '🎵',
          isLiteMode: false,
        }),
      })
    );
  });

  it('should handle save errors gracefully', async () => {
    const { saveCurrentSession } =
      await import('../../js/services/session-manager/session-persistence.js');

    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages: [{ role: 'user', content: 'test' }],
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');

    mockStorage.saveSession.mockRejectedValue(new Error('Storage error'));

    const result = await saveCurrentSession();

    expect(result).toBe(false);
  });
});

describe('SessionPersistence - emergencyBackupSync', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should save backup to localStorage synchronously', () => {
    // Need to reload the module to reset state between tests
    vi.resetModules();
    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages: [{ role: 'user', content: 'test' }],
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');

    return import('../../js/services/session-manager/session-persistence.js').then(
      ({ emergencyBackupSync }) => {
        emergencyBackupSync();

        const backup = localStorageMock.store['rc_session_emergency_backup'];
        expect(backup).toBeTruthy();
        const data = JSON.parse(backup);
        expect(data.sessionId).toBe('test-id');
        expect(data.messages).toEqual([{ role: 'user', content: 'test' }]);
      }
    );
  });

  it('should not save when no session exists', () => {
    vi.resetModules();
    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue(null);

    return import('../../js/services/session-manager/session-persistence.js').then(
      ({ emergencyBackupSync }) => {
        emergencyBackupSync();

        expect(localStorageMock.setItem).not.toHaveBeenCalled();
      }
    );
  });

  it('should not save when no messages exist', () => {
    vi.resetModules();
    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages: [],
    });

    return import('../../js/services/session-manager/session-persistence.js').then(
      ({ emergencyBackupSync }) => {
        emergencyBackupSync();

        expect(localStorageMock.setItem).not.toHaveBeenCalled();
      }
    );
  });

  it('should limit backup to 100 messages', () => {
    vi.resetModules();
    const messages = Array.from({ length: 150 }, (_, i) => ({
      role: 'user',
      content: `Message ${i}`,
    }));

    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages,
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');

    return import('../../js/services/session-manager/session-persistence.js').then(
      ({ emergencyBackupSync }) => {
        emergencyBackupSync();

        const backup = JSON.parse(localStorageMock.store['rc_session_emergency_backup']);
        expect(backup.messages).toHaveLength(100);
        expect(backup.messages[0].content).toBe('Message 50');
      }
    );
  });
});

describe('SessionPersistence - recoverEmergencyBackup', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should return false when no backup exists', async () => {
    const { recoverEmergencyBackup } =
      await import('../../js/services/session-manager/session-persistence.js');

    const result = await recoverEmergencyBackup();

    expect(result).toBe(false);
  });

  it('should recover valid backup', async () => {
    const backup = {
      sessionId: 'recovered-id',
      createdAt: '2024-01-01T00:00:00.000Z',
      messages: [{ role: 'user', content: 'Recovered message' }],
      timestamp: Date.now() - 1000, // 1 second ago
    };
    localStorageMock.store['rc_session_emergency_backup'] = JSON.stringify(backup);
    mockStorage.saveSession.mockResolvedValue(true);

    const { recoverEmergencyBackup } =
      await import('../../js/services/session-manager/session-persistence.js');

    const result = await recoverEmergencyBackup();

    expect(result).toBe(true);
    expect(mockStorage.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'recovered-id',
        title: 'Recovered Chat',
        messages: [{ role: 'user', content: 'Recovered message' }],
      })
    );
    expect(localStorageMock.store['rc_session_emergency_backup']).toBeUndefined();
  });

  it('should reject backups older than 1 hour', async () => {
    const oldBackup = {
      sessionId: 'old-id',
      createdAt: '2024-01-01T00:00:00.000Z',
      messages: [{ role: 'user', content: 'Old message' }],
      timestamp: Date.now() - 61 * 60 * 1000, // 61 minutes ago
    };
    localStorageMock.store['rc_session_emergency_backup'] = JSON.stringify(oldBackup);

    const { recoverEmergencyBackup } =
      await import('../../js/services/session-manager/session-persistence.js');

    const result = await recoverEmergencyBackup();

    expect(result).toBe(false);
    expect(mockStorage.saveSession).not.toHaveBeenCalled();
    expect(localStorageMock.store['rc_session_emergency_backup']).toBeUndefined();
  });

  it('should merge with existing session if backup has more messages', async () => {
    const backup = {
      sessionId: 'existing-id',
      createdAt: '2024-01-01T00:00:00.000Z',
      messages: [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' },
      ],
      timestamp: Date.now() - 1000,
    };
    localStorageMock.store['rc_session_emergency_backup'] = JSON.stringify(backup);
    mockStorage.getSession.mockResolvedValue({
      id: 'existing-id',
      messages: [{ role: 'user', content: 'Message 1' }],
    });
    mockStorage.saveSession.mockResolvedValue(true);

    const { recoverEmergencyBackup } =
      await import('../../js/services/session-manager/session-persistence.js');

    const result = await recoverEmergencyBackup();

    expect(result).toBe(true);
    expect(mockStorage.getSession).toHaveBeenCalledWith('existing-id');
    expect(mockStorage.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'existing-id',
        messages: backup.messages, // Updated with more messages
      })
    );
  });

  it('should not merge if backup has fewer messages than existing', async () => {
    const backup = {
      sessionId: 'existing-id',
      createdAt: '2024-01-01T00:00:00.000Z',
      messages: [{ role: 'user', content: 'Message 1' }],
      timestamp: Date.now() - 1000,
    };
    localStorageMock.store['rc_session_emergency_backup'] = JSON.stringify(backup);
    mockStorage.getSession.mockResolvedValue({
      id: 'existing-id',
      messages: [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
      ],
    });

    const { recoverEmergencyBackup } =
      await import('../../js/services/session-manager/session-persistence.js');

    const result = await recoverEmergencyBackup();

    expect(result).toBe(true); // Still returns true as recovery was "successful"
    expect(mockStorage.saveSession).not.toHaveBeenCalled(); // But no save needed
    expect(localStorageMock.store['rc_session_emergency_backup']).toBeUndefined();
  });

  it('should handle corrupted backup gracefully', async () => {
    localStorageMock.store['rc_session_emergency_backup'] = 'invalid-json{';

    const { recoverEmergencyBackup } =
      await import('../../js/services/session-manager/session-persistence.js');

    const result = await recoverEmergencyBackup();

    expect(result).toBe(false);
    expect(mockStorage.saveSession).not.toHaveBeenCalled();
  });
});

describe('SessionPersistence - flushPendingSaveAsync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should flush pending save and clear timeout', async () => {
    const { saveConversation, flushPendingSaveAsync, getAutoSaveTimeoutId } =
      await import('../../js/services/session-manager/session-persistence.js');

    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages: [{ role: 'user', content: 'test' }],
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');
    mockStorage.saveSession.mockResolvedValue(true);

    // Schedule a delayed save
    saveConversation(5000);
    expect(getAutoSaveTimeoutId()).not.toBeNull();

    // Flush it
    await flushPendingSaveAsync();

    // Timeout should be cleared
    expect(getAutoSaveTimeoutId()).toBeNull();
    expect(mockStorage.saveSession).toHaveBeenCalled();
  });

  it('should clear emergency backup after successful save', async () => {
    const { flushPendingSaveAsync } =
      await import('../../js/services/session-manager/session-persistence.js');

    vi.mocked(SessionState.getCurrentSessionId).mockReturnValue('test-id');
    vi.mocked(SessionState.getSessionData).mockReturnValue({
      id: 'test-id',
      messages: [{ role: 'user', content: 'test' }],
    });
    vi.mocked(SessionState.getCurrentSessionCreatedAt).mockReturnValue('2024-01-01T00:00:00.000Z');
    mockStorage.saveSession.mockResolvedValue(true);
    localStorageMock.store['rc_session_emergency_backup'] = JSON.stringify({
      sessionId: 'test-id',
    });

    await flushPendingSaveAsync();

    expect(localStorageMock.store['rc_session_emergency_backup']).toBeUndefined();
  });
});

describe('SessionPersistence - exports', () => {
  it('should export all required functions', async () => {
    const module = await import('../../js/services/session-manager/session-persistence.js');

    expect(module.saveCurrentSession).toBeDefined();
    expect(typeof module.saveCurrentSession).toBe('function');

    expect(module.saveConversation).toBeDefined();
    expect(typeof module.saveConversation).toBe('function');

    expect(module.flushPendingSaveAsync).toBeDefined();
    expect(typeof module.flushPendingSaveAsync).toBe('function');

    expect(module.emergencyBackupSync).toBeDefined();
    expect(typeof module.emergencyBackupSync).toBe('function');

    expect(module.recoverEmergencyBackup).toBeDefined();
    expect(typeof module.recoverEmergencyBackup).toBe('function');

    expect(module.getAutoSaveTimeoutId).toBeDefined();
    expect(typeof module.getAutoSaveTimeoutId).toBe('function');

    expect(module.clearAutoSaveTimeout).toBeDefined();
    expect(typeof module.clearAutoSaveTimeout).toBe('function');
  });
});
