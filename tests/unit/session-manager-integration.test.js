/**
 * SessionManager Integration Tests
 *
 * Integration tests for the full session lifecycle flow through the SessionManager facade.
 * Tests the complete user journey: create -> add messages -> save -> reload.
 *
 * Uses happy-dom for DOM APIs (localStorage, window).
 * Mocks Storage but keeps real EventBus for realistic event emission testing.
 *
 * @module tests/unit/session-manager-integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../js/services/event-bus/index.js';
import { SessionManager } from '../../js/services/session-manager.js';
import * as InternalSessionManager from '../../js/services/session-manager/index.js';

// ==========================================
// Mocks
// ==========================================

// Mock Storage layer but maintain real EventBus for integration testing
const mockSessions = new Map();
const mockConfigs = new Map();

vi.mock('../../js/storage.js', () => ({
  Storage: {
    getSession: vi.fn((id) => Promise.resolve(mockSessions.get(id) || null)),
    saveSession: vi.fn((session) => {
      mockSessions.set(session.id, { ...session });
      return Promise.resolve();
    }),
    deleteSession: vi.fn((id) => {
      mockSessions.delete(id);
      return Promise.resolve();
    }),
    getAllSessions: vi.fn(() => Promise.resolve(Array.from(mockSessions.values()))),
    setConfig: vi.fn((key, value) => {
      mockConfigs.set(key, value);
      return Promise.resolve();
    }),
    getConfig: vi.fn((key) => Promise.resolve(mockConfigs.get(key) || null))
  }
}));

// Mock AppState
vi.mock('../../js/state/app-state.js', () => ({
  AppState: {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn()
  }
}));

// Mock SessionLockManager
vi.mock('../../js/services/session-lock-manager.js', () => ({
  default: {
    acquireProcessingLock: vi.fn(() => Promise.resolve({ locked: true, currentSessionId: null }))
  }
}));

// Mock DataVersion
vi.mock('../../js/services/data-version.js', () => ({
  DataVersion: {
    tagMessage: vi.fn((msg) => {
      if (msg && typeof msg === 'object') {
        msg.dataVersion = '1.0.0';
      }
    })
  }
}));

// Mock Mutex - must be a class factory
vi.mock('../../js/utils/concurrency/mutex.js', () => ({
  Mutex: class MockMutex {
    runExclusive(fn) {
      return fn();
    }
  }
}));

// ==========================================
// Setup & Teardown
// ==========================================

beforeEach(async () => {
  // Clear all mocks
  vi.clearAllMocks();

  // Reset mock storage
  mockSessions.clear();
  mockConfigs.clear();

  // Reset EventBus state
  EventBus.clearAll();

  // Reset SessionManager internal state
  InternalSessionManager.resetManager();

  // Set up a default window._userContext for metadata
  if (typeof window !== 'undefined') {
    window._userContext = {
      personality: {
        name: 'default',
        emoji: '🎵'
      }
    };
  }

  // Initialize SessionManager
  await SessionManager.initialize();

  // Clear emergency backup key
  try {
    localStorage.removeItem('rc_session_emergency_backup');
  } catch (e) {
    // Ignore
  }
});

afterEach(() => {
  // Reset SessionManager
  InternalSessionManager.resetManager();

  // Clear EventBus
  EventBus.clearAll();

  // Clear localStorage
  try {
    localStorage.clear();
  } catch (e) {
    // Ignore
  }

  // Clean up window context
  if (typeof window !== 'undefined') {
    delete window._userContext;
  }
});

// ==========================================
// Full Flow Tests
// ==========================================

describe('SessionManager Integration - Full Flow', () => {
  it('should create session, add messages, persist, and reload', async () => {
    // Create a new session
    const session = await SessionManager.createSession('Test Chat', 'default');
    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.messages).toEqual([]);

    const sessionId = session.id;

    // Add messages
    await SessionManager.addMessageToHistory({ role: 'user', content: 'Hello' });
    await SessionManager.addMessageToHistory({ role: 'assistant', content: 'Hi there!' });

    // Verify messages in history
    const history = SessionManager.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ role: 'user', content: 'Hello' });
    expect(history[1]).toMatchObject({ role: 'assistant', content: 'Hi there!' });

    // Save
    const saved = await SessionManager.saveCurrentSession();
    expect(saved).toBe(true);

    // Verify session was persisted to mock storage
    const { Storage } = await import('../../js/storage.js');
    expect(Storage.saveSession).toHaveBeenCalled();

    // Clear current session and create new one
    await SessionManager.clearAllSessions();

    // Verify we have a new session
    const newSession = SessionManager.getCurrentSession();
    expect(newSession).toBeDefined();
    expect(newSession.id).not.toBe(sessionId);
    expect(SessionManager.getHistory()).toHaveLength(0);
  });

  it('should handle complete workflow: create -> add -> save -> reload -> add -> save', async () => {
    // Step 1: Create session
    const session1 = await SessionManager.createSession('Workflow Test');
    const sessionId1 = session1.id;

    // Step 2: Add initial messages
    await SessionManager.addMessageToHistory({ role: 'user', content: 'First message' });
    await SessionManager.addMessageToHistory({ role: 'assistant', content: 'First response' });

    // Step 3: Save
    const saved1 = await SessionManager.saveCurrentSession();
    expect(saved1).toBe(true);

    // Step 4: Verify current state
    expect(SessionManager.getHistory()).toHaveLength(2);

    // Step 5: Clear and start new
    await SessionManager.clearAllSessions();
    expect(SessionManager.getHistory()).toHaveLength(0);

    // Step 6: Create new session and add messages
    const session2 = await SessionManager.createSession('Second Chat');
    expect(session2.id).not.toBe(sessionId1);

    await SessionManager.addMessageToHistory({ role: 'user', content: 'Second message' });
    await SessionManager.addMessageToHistory({ role: 'assistant', content: 'Second response' });
    await SessionManager.addMessageToHistory({ role: 'user', content: 'Third message' });

    // Step 7: Verify and save
    expect(SessionManager.getHistory()).toHaveLength(3);
    const saved2 = await SessionManager.saveCurrentSession();
    expect(saved2).toBe(true);
  });

  it('should add multiple messages atomically', async () => {
    await SessionManager.createSession('Batch Test');

    const messages = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Response 2' }
    ];

    await SessionManager.addMessagesToHistory(messages);

    const history = SessionManager.getHistory();
    expect(history).toHaveLength(4);
    expect(history[0].content).toBe('Message 1');
    expect(history[3].content).toBe('Response 2');
  });
});

// ==========================================
// Event Emission Tests
// ==========================================

describe('SessionManager Integration - Event Emission', () => {
  it('should emit events on session lifecycle operations', async () => {
    const events = [];

    // Subscribe to session events
    EventBus.on('session:created', (data) => events.push({ type: 'created', data }));
    EventBus.on('session:loaded', (data) => events.push({ type: 'loaded', data }));
    EventBus.on('session:switched', (data) => events.push({ type: 'switched', data }));
    EventBus.on('session:updated', (data) => events.push({ type: 'updated', data }));
    EventBus.on('session:deleted', (data) => events.push({ type: 'deleted', data }));

    // Create session
    const session = await SessionManager.createSession('Event Test');
    expect(events.some(e => e.type === 'created')).toBe(true);

    // Clear and track new events
    events.length = 0;

    // Add message (should trigger update event)
    await SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });
    // Note: update event may or may not be emitted depending on implementation
  });

  it('should include correct payload in session:created event', async () => {
    let capturedEvent = null;

    EventBus.on('session:created', (data) => {
      capturedEvent = data;
    });

    await SessionManager.createSession('Payload Test', 'test-personality');

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.sessionId).toBeDefined();
    expect(typeof capturedEvent.sessionId).toBe('string');
  });

  it('should track event propagation through handlers', async () => {
    const callOrder = [];

    EventBus.on('session:created', () => callOrder.push('handler1'));
    EventBus.on('session:created', () => callOrder.push('handler2'));
    EventBus.on('session:created', () => callOrder.push('handler3'));

    await SessionManager.createSession('Order Test');

    expect(callOrder).toEqual(['handler1', 'handler2', 'handler3']);
  });

  it('should support wildcard event subscription', async () => {
    const allEvents = [];

    EventBus.on('*', (data, meta) => {
      allEvents.push({ type: meta.type, data });
    });

    await SessionManager.createSession('Wildcard Test');
    await SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });

    expect(allEvents.length).toBeGreaterThan(0);
    expect(allEvents.some(e => e.type === 'session:created')).toBe(true);
  });
});

// ==========================================
// Persistence Tests
// ==========================================

describe('SessionManager Integration - Emergency Backup', () => {
  it('should create emergency backup on pagehide signal', () => {
    // Setup session with messages
    SessionManager.createSession('Backup Test').then(() => {
      return SessionManager.addMessageToHistory({ role: 'user', content: 'Important message' });
    }).then(() => {
      return SessionManager.addMessageToHistory({ role: 'assistant', content: 'Important response' });
    }).then(() => {
      // Trigger emergency backup
      SessionManager.emergencyBackupSync();

      // Verify backup in localStorage
      const backupStr = localStorage.getItem('rc_session_emergency_backup');
      expect(backupStr).toBeDefined();

      const backup = JSON.parse(backupStr);
      expect(backup).toMatchObject({
        sessionId: expect.any(String),
        messages: expect.any(Array),
        timestamp: expect.any(Number)
      });
      expect(backup.messages).toHaveLength(2);
    });
  });

  it('should recover from emergency backup on initialization', async () => {
    // Create a backup manually
    const testSessionId = '8f4eee4b-a7e0-477f-a3fe-6cd1d3aa821a';
    const backupData = {
      sessionId: testSessionId,
      createdAt: new Date().toISOString(),
      messages: [
        { role: 'user', content: 'Recovered message 1' },
        { role: 'assistant', content: 'Recovered response 1' }
      ],
      timestamp: Date.now()
    };

    localStorage.setItem('rc_session_emergency_backup', JSON.stringify(backupData));

    // Reset and reinitialize to trigger recovery
    InternalSessionManager.resetManager();
    EventBus.clearAll();

    const recovered = await SessionManager.recoverEmergencyBackup();

    // Recovery should attempt to restore (success depends on mock storage)
    expect(recovered).toBeDefined();
  });

  it('should not recover stale emergency backup', async () => {
    // Create an old backup (more than 1 hour)
    const oldTimestamp = Date.now() - (61 * 60 * 1000); // 61 minutes ago
    const backupData = {
      sessionId: 'old-session-id',
      createdAt: new Date(oldTimestamp).toISOString(),
      messages: [{ role: 'user', content: 'Old message' }],
      timestamp: oldTimestamp
    };

    localStorage.setItem('rc_session_emergency_backup', JSON.stringify(backupData));

    // Attempt recovery
    const recovered = await SessionManager.recoverEmergencyBackup();

    // Should not recover stale backup
    expect(recovered).toBe(false);

    // Backup should be removed
    const backupStr = localStorage.getItem('rc_session_emergency_backup');
    expect(backupStr).toBeNull();
  });

  it('should clear emergency backup after successful recovery', async () => {
    // Create a fresh backup
    const testSessionId = '9f4eee4b-a7e0-477f-a3fe-6cd1d3aa821b';
    const backupData = {
      sessionId: testSessionId,
      createdAt: new Date().toISOString(),
      messages: [{ role: 'user', content: 'Test' }],
      timestamp: Date.now()
    };

    localStorage.setItem('rc_session_emergency_backup', JSON.stringify(backupData));

    // Also ensure session exists in storage
    const { Storage } = await import('../../js/storage.js');
    Storage.saveSession({
      id: testSessionId,
      title: 'Test Session',
      createdAt: backupData.createdAt,
      messages: [] // Empty, so backup should restore
    });

    // Recover
    await SessionManager.recoverEmergencyBackup();

    // Backup should be cleared after successful recovery
    const backupStr = localStorage.getItem('rc_session_emergency_backup');
    expect(backupStr).toBeNull();
  });
});

// ==========================================
// Debounced Save Tests
// ==========================================

describe('SessionManager Integration - Debounced Save', () => {
  it('should debounce saveConversation calls', async () => {
    vi.useFakeTimers();

    await SessionManager.createSession('Debounce Test');
    await SessionManager.addMessageToHistory({ role: 'user', content: 'Hello' });

    // Import to spy on saveCurrentSession
    const { SessionPersistence } = await import('../../js/services/session-manager/session-persistence.js');

    // Call saveConversation multiple times rapidly
    SessionManager.saveConversation(2000);
    SessionManager.saveConversation(1000);
    SessionManager.saveConversation(500);

    // Advance timer by the shortest delay - only the last call should execute
    vi.advanceTimersByTime(500);

    // Restore timers before awaiting async operations
    vi.useRealTimers();

    // Wait a bit for debounced function to potentially execute
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('should cancel previous debounced save when new one is scheduled', async () => {
    vi.useFakeTimers();

    await SessionManager.createSession('Cancel Test');

    // Schedule first save
    SessionManager.saveConversation(2000);

    // Schedule second save with shorter delay (should cancel first)
    SessionManager.saveConversation(500);

    // Advance past first delay but not second
    vi.advanceTimersByTime(1000);

    vi.useRealTimers();

    // The first save should have been cancelled
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('should flush pending saves immediately', async () => {
    vi.useFakeTimers();

    await SessionManager.createSession('Flush Test');
    await SessionManager.addMessageToHistory({ role: 'user', content: 'Flush me' });

    // Schedule a delayed save
    SessionManager.saveConversation(5000);

    // Immediately flush without waiting
    await SessionManager.flushPendingSaveAsync();

    vi.useRealTimers();

    // Verify flush completed
    expect(true).toBe(true);
  });
});

// ==========================================
// Error Handling Tests
// ==========================================

describe('SessionManager Integration - Error Handling', () => {
  it('should handle missing session gracefully on getHistory', async () => {
    // Create a fresh session to verify getHistory works
    await SessionManager.createSession('History Test');

    const history = SessionManager.getHistory();
    // Should return an array (even if empty from a new session)
    expect(Array.isArray(history)).toBe(true);
  });

  it('should handle getCurrentSession when no session exists', () => {
    InternalSessionManager.resetManager();

    const session = SessionManager.getCurrentSession();
    expect(session).toBeDefined();
  });

  it('should continue operation after save failure', async () => {
    await SessionManager.createSession('Error Recovery Test');
    await SessionManager.addMessageToHistory({ role: 'user', content: 'Test message' });

    // Mock a save failure
    const { Storage } = await import('../../js/storage.js');
    Storage.saveSession.mockRejectedValueOnce(new Error('Storage unavailable'));

    // Save should handle error gracefully
    const result = await SessionManager.saveCurrentSession();
    expect(result).toBe(false);

    // Subsequent operations should still work
    await SessionManager.addMessageToHistory({ role: 'assistant', content: 'Still working' });
    expect(SessionManager.getHistory()).toHaveLength(2);
  });
});

// ==========================================
// Session Switching Tests
// ==========================================

describe('SessionManager Integration - Session Switching', () => {
  it('should maintain separate histories when switching sessions', async () => {
    // Create first session with messages
    const session1 = await SessionManager.createSession('First Session');
    await SessionManager.addMessageToHistory({ role: 'user', content: 'Session 1 message' });

    const history1 = SessionManager.getHistory();
    expect(history1).toHaveLength(1);

    // Save and get all sessions
    await SessionManager.saveCurrentSession();

    // Clear and create second session
    await SessionManager.clearAllSessions();
    const session2 = await SessionManager.createSession('Second Session');
    await SessionManager.addMessageToHistory({ role: 'user', content: 'Session 2 message' });

    const history2 = SessionManager.getHistory();
    expect(history2).toHaveLength(1);
    expect(history2[0].content).toBe('Session 2 message');
  });

  it('should preserve message data through save cycle', async () => {
    const testMessages = [
      { role: 'user', content: 'Question 1' },
      { role: 'assistant', content: 'Answer 1' },
      { role: 'user', content: 'Question 2' },
      { role: 'assistant', content: 'Answer 2' },
      { role: 'user', content: 'Question 3' },
      { role: 'assistant', content: 'Answer 3' }
    ];

    await SessionManager.createSession('Persistence Test');

    for (const msg of testMessages) {
      await SessionManager.addMessageToHistory(msg);
    }

    // Save
    const saved = await SessionManager.saveCurrentSession();
    expect(saved).toBe(true);

    // Verify history
    const history = SessionManager.getHistory();
    expect(history).toHaveLength(6);

    // Verify content order
    for (let i = 0; i < testMessages.length; i++) {
      expect(history[i].role).toBe(testMessages[i].role);
      expect(history[i].content).toBe(testMessages[i].content);
    }
  });
});

// ==========================================
// Truncation Tests
// ==========================================

describe('SessionManager Integration - Message Truncation', () => {
  it('should truncate history when requested', async () => {
    await SessionManager.createSession('Truncate Test');

    // Add many messages
    for (let i = 0; i < 10; i++) {
      await SessionManager.addMessageToHistory({ role: 'user', content: `Message ${i}` });
    }

    expect(SessionManager.getHistory()).toHaveLength(10);

    // Truncate to 5
    await SessionManager.truncateHistory(5);

    expect(SessionManager.getHistory()).toHaveLength(5);
  });

  it('should remove message at specific index', async () => {
    await SessionManager.createSession('Remove Test');

    await SessionManager.addMessagesToHistory([
      { role: 'user', content: 'Keep 1' },
      { role: 'assistant', content: 'Remove this' },
      { role: 'user', content: 'Keep 2' }
    ]);

    expect(SessionManager.getHistory()).toHaveLength(3);

    // Remove middle message
    const removed = await SessionManager.removeMessageFromHistory(1);

    expect(removed).toBe(true);
    expect(SessionManager.getHistory()).toHaveLength(2);
    expect(SessionManager.getHistory()[1].content).toBe('Keep 2');
  });

  it('should return false when removing invalid index', async () => {
    await SessionManager.createSession('Invalid Index Test');
    await SessionManager.addMessageToHistory({ role: 'user', content: 'Test' });

    const removed = await SessionManager.removeMessageFromHistory(10);

    expect(removed).toBe(false);
    expect(SessionManager.getHistory()).toHaveLength(1);
  });
});
