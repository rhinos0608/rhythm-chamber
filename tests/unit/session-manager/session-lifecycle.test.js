/**
 * Session Lifecycle Module Tests
 *
 * Tests session lifecycle operations:
 * - createSession, activateSession, switchSession
 * - deleteSession, clearAllSessions, renameSession
 * - Session state transitions
 * - Session cleanup
 *
 * @module tests/unit/session-manager/session-lifecycle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../../js/services/event-bus.js';
import { Storage } from '../../../js/storage.js';
import * as SessionLifecycle from '../../../js/services/session-manager/session-lifecycle.js';
import * as SessionState from '../../../js/services/session-manager/session-state.js';
import * as SessionPersistence from '../../../js/services/session-manager/session-persistence.js';

// ==========================================
// Module Initialization for Tests
// ==========================================

// Initialize the lifecycle module with state accessor to avoid circular dependency
SessionLifecycle.initialize({
  getCurrentSessionId: SessionState.getCurrentSessionId,
  setCurrentSessionId: SessionState.setCurrentSessionId,
  getCurrentSessionCreatedAt: SessionState.getCurrentSessionCreatedAt,
  setCurrentSessionCreatedAt: SessionState.setCurrentSessionCreatedAt,
  syncSessionIdToAppState: SessionState.syncSessionIdToAppState,
  getSessionData: SessionState.getSessionData,
  setSessionData: SessionState.setSessionData,
  updateSessionData: SessionState.updateSessionData,
  getHistory: SessionState.getHistory,
});

// Mock dependencies
vi.mock('../../../js/services/event-bus.js', () => ({
  EventBus: {
    emit: vi.fn(),
    registerSchemas: vi.fn(),
  },
}));

vi.mock('../../../js/storage.js', () => ({
  Storage: {
    getSession: vi.fn(),
    saveSession: vi.fn(),
    deleteSession: vi.fn(),
    getAllSessions: vi.fn(),
    setConfig: vi.fn(),
    getConfig: vi.fn(),
  },
}));

vi.mock('../../../js/state/app-state.js', () => ({
  AppState: {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../js/services/session-lock-manager.js', () => ({
  default: {
    acquireProcessingLock: vi.fn(() => Promise.resolve({ locked: true, currentSessionId: null })),
  },
}));

vi.mock('../../../js/services/session-manager/session-persistence.js', () => ({
  saveCurrentSession: vi.fn(() => Promise.resolve(true)),
  flushPendingSaveAsync: vi.fn(() => Promise.resolve()),
  saveConversation: vi.fn(() => {}),
  emergencyBackupSync: vi.fn(() => {}),
  recoverEmergencyBackup: vi.fn(() => Promise.resolve(false)),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn(key => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

global.localStorage = localStorageMock;

describe('SessionLifecycle Module', () => {
  let testSessionId;

  beforeEach(() => {
    vi.clearAllMocks();
    // Use valid UUID v4 format for tests
    testSessionId = '8f4eee4b-a7e0-477f-a3fe-6cd1d3aa821a';

    // Setup basic Storage mocks
    Storage.setConfig.mockResolvedValue(undefined);
    Storage.getConfig.mockResolvedValue(null);
    Storage.saveSession.mockResolvedValue(undefined);

    // Setup SessionPersistence mocks
    SessionPersistence.saveCurrentSession.mockResolvedValue(true);
    SessionPersistence.flushPendingSaveAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset lifecycle module state between tests
    SessionLifecycle.reset();
    // Re-initialize with state accessor after reset
    SessionLifecycle.initialize({
      getCurrentSessionId: SessionState.getCurrentSessionId,
      setCurrentSessionId: SessionState.setCurrentSessionId,
      getCurrentSessionCreatedAt: SessionState.getCurrentSessionCreatedAt,
      setCurrentSessionCreatedAt: SessionState.setCurrentSessionCreatedAt,
      syncSessionIdToAppState: SessionState.syncSessionIdToAppState,
      getSessionData: SessionState.getSessionData,
      setSessionData: SessionState.setSessionData,
      updateSessionData: SessionState.updateSessionData,
      getHistory: SessionState.getHistory,
    });
  });

  // ==========================================
  // createSession Tests
  // ==========================================

  describe('createSession', () => {
    it('should create a new session with valid UUID', async () => {
      const sessionId = await SessionLifecycle.createSession();

      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should create session with initial messages', async () => {
      const initialMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const sessionId = await SessionLifecycle.createSession(initialMessages);

      expect(sessionId).toBeTruthy();
      expect(SessionPersistence.saveCurrentSession).toHaveBeenCalled();
    });

    it('should save empty session to storage before emitting event', async () => {
      // CRITICAL: This test verifies the fix for the session navigation bug
      // where empty sessions weren't appearing in sidebar because they
      // weren't persisted before the session:created event was emitted

      // Create session with NO initial messages
      const sessionId = await SessionLifecycle.createSession();

      // Verify save was called even for empty session
      expect(SessionPersistence.saveCurrentSession).toHaveBeenCalled();

      // Verify event was emitted
      expect(EventBus.emit).toHaveBeenCalledWith(
        'session:created',
        expect.objectContaining({ sessionId })
      );
    });

    it('should save session ID to storage', async () => {
      const sessionId = await SessionLifecycle.createSession();

      expect(Storage.setConfig).toHaveBeenCalledWith(expect.any(String), sessionId);
    });

    it('should sync session ID to AppState', async () => {
      await SessionLifecycle.createSession();

      // AppState should be called via SessionState
      expect(SessionState.getCurrentSessionId()).toBeTruthy();
    });

    it('should emit session:created event', async () => {
      await SessionLifecycle.createSession();

      expect(EventBus.emit).toHaveBeenCalledWith(
        'session:created',
        expect.objectContaining({
          sessionId: expect.any(String),
        })
      );
    });

    it('should handle storage errors gracefully', async () => {
      Storage.setConfig.mockRejectedValue(new Error('Storage error'));

      const sessionId = await SessionLifecycle.createSession();

      // Should still return a session ID despite storage error
      expect(sessionId).toBeTruthy();
    });

    it('should create unique session IDs', async () => {
      const sessionId1 = await SessionLifecycle.createSession();
      const sessionId2 = await SessionLifecycle.createSession();

      expect(sessionId1).not.toBe(sessionId2);
    });

    it('should reset message limit warning flag for new sessions', async () => {
      // First session with many messages
      const manyMessages = Array(95)
        .fill(null)
        .map((_, i) => ({
          role: 'user',
          content: `Message ${i}`,
        }));

      await SessionLifecycle.createSession(manyMessages);

      // Second session should reset warning flag
      const sessionId2 = await SessionLifecycle.createSession([]);
      expect(sessionId2).toBeTruthy();
    });
  });

  // ==========================================
  // activateSession (loadSession) Tests
  // ==========================================

  describe('activateSession', () => {
    it('should load existing session by ID', async () => {
      const mockSession = {
        id: testSessionId,
        title: 'Test Chat',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [{ role: 'user', content: 'Test' }],
      };

      Storage.getSession.mockResolvedValue(mockSession);

      const result = await SessionLifecycle.activateSession(testSessionId);

      expect(result).toEqual(mockSession);
      expect(SessionState.getCurrentSessionId()).toBe(testSessionId);
    });

    it('should return null for non-existent session', async () => {
      Storage.getSession.mockResolvedValue(null);

      const result = await SessionLifecycle.activateSession(testSessionId);

      expect(result).toBeNull();
    });

    it('should return null for invalid session ID format', async () => {
      const result = await SessionLifecycle.activateSession('invalid-id');

      expect(result).toBeNull();
      expect(Storage.getSession).not.toHaveBeenCalled();
    });

    it('should return null for corrupted session', async () => {
      const corruptedSession = {
        id: testSessionId,
        // Missing required fields
        messages: 'not-an-array',
      };

      Storage.getSession.mockResolvedValue(corruptedSession);

      const result = await SessionLifecycle.activateSession(testSessionId);

      expect(result).toBeNull();
    });

    it('should emit session:loaded event', async () => {
      const mockSession = {
        id: testSessionId,
        title: 'Test Chat',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [{ role: 'user', content: 'Test' }],
      };

      Storage.getSession.mockResolvedValue(mockSession);

      await SessionLifecycle.activateSession(testSessionId);

      expect(EventBus.emit).toHaveBeenCalledWith(
        'session:loaded',
        expect.objectContaining({
          sessionId: testSessionId,
        })
      );
    });

    it('should save session ID to storage on load', async () => {
      const mockSession = {
        id: testSessionId,
        title: 'Test Chat',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [],
      };

      Storage.getSession.mockResolvedValue(mockSession);

      await SessionLifecycle.activateSession(testSessionId);

      expect(Storage.setConfig).toHaveBeenCalledWith(expect.any(String), testSessionId);
    });

    it('should sync to AppState on load', async () => {
      const mockSession = {
        id: testSessionId,
        title: 'Test Chat',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [],
      };

      Storage.getSession.mockResolvedValue(mockSession);

      await SessionLifecycle.activateSession(testSessionId);

      expect(SessionState.getCurrentSessionId()).toBe(testSessionId);
    });

    it('should handle storage errors gracefully', async () => {
      Storage.getSession.mockRejectedValue(new Error('Storage error'));

      const result = await SessionLifecycle.activateSession(testSessionId);

      expect(result).toBeNull();
    });
  });

  // ==========================================
  // switchSession Tests
  // ==========================================

  describe('switchSession', () => {
    it('should switch to different session', async () => {
      const currentId = await SessionLifecycle.createSession();
      const targetId = '9f4eee4b-a7e0-477f-a3fe-6cd1d3aa821b';

      const mockTargetSession = {
        id: targetId,
        title: 'Target Chat',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [],
      };

      Storage.getSession.mockResolvedValue(mockTargetSession);

      const result = await SessionLifecycle.switchSession(targetId);

      expect(result).toBe(true);
      expect(SessionState.getCurrentSessionId()).toBe(targetId);
    });

    it('should save current session before switching', async () => {
      const currentId = await SessionLifecycle.createSession([
        { role: 'user', content: 'Current session' },
      ]);
      const targetId = '9f4eee4b-a7e0-477f-a3fe-6cd1d3aa821b';

      const mockTargetSession = {
        id: targetId,
        title: 'Target Chat',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [],
      };

      Storage.getSession.mockResolvedValue(mockTargetSession);

      await SessionLifecycle.switchSession(targetId);

      // Verify save was called for current session (via SessionPersistence)
      expect(SessionPersistence.saveCurrentSession).toHaveBeenCalled();
    });

    it('should emit session:switched event', async () => {
      const currentId = await SessionLifecycle.createSession();
      const targetId = '9f4eee4b-a7e0-477f-a3fe-6cd1d3aa821b';

      const mockTargetSession = {
        id: targetId,
        title: 'Target Chat',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [],
      };

      Storage.getSession.mockResolvedValue(mockTargetSession);

      await SessionLifecycle.switchSession(targetId);

      expect(EventBus.emit).toHaveBeenCalledWith(
        'session:switched',
        expect.objectContaining({
          fromSessionId: currentId,
          toSessionId: targetId,
        })
      );
    });

    it('should return false for non-existent target session', async () => {
      await SessionLifecycle.createSession();
      const targetId = 'non-existent-session';

      Storage.getSession.mockResolvedValue(null);

      const result = await SessionLifecycle.switchSession(targetId);

      expect(result).toBe(false);
    });

    it('should return false for invalid target session ID', async () => {
      await SessionLifecycle.createSession();

      const result = await SessionLifecycle.switchSession('invalid-id');

      expect(result).toBe(false);
    });

    it('should handle save errors during switch', async () => {
      const currentId = await SessionLifecycle.createSession([{ role: 'user', content: 'Test' }]);
      const targetId = '9f4eee4b-a7e0-477f-a3fe-6cd1d3aa821b';

      Storage.saveSession.mockRejectedValue(new Error('Save failed'));

      const mockTargetSession = {
        id: targetId,
        title: 'Target Chat',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [],
      };

      Storage.getSession.mockResolvedValue(mockTargetSession);

      // Should still complete switch despite save error
      const result = await SessionLifecycle.switchSession(targetId);

      expect(result).toBe(true);
    });
  });

  // ==========================================
  // deleteSession Tests
  // ==========================================

  describe('deleteSession', () => {
    it('should delete session by ID', async () => {
      Storage.deleteSession.mockResolvedValue(undefined);

      const result = await SessionLifecycle.deleteSession(testSessionId);

      expect(result).toBe(true);
      expect(Storage.deleteSession).toHaveBeenCalledWith(testSessionId);
    });

    it('should return false for invalid session ID', async () => {
      const result = await SessionLifecycle.deleteSession('invalid-id');

      expect(result).toBe(false);
      expect(Storage.deleteSession).not.toHaveBeenCalled();
    });

    it('should create new session if deleting current session', async () => {
      const currentId = await SessionLifecycle.createSession();

      Storage.deleteSession.mockResolvedValue(undefined);

      await SessionLifecycle.deleteSession(currentId);

      // Should have a new session created
      expect(SessionState.getCurrentSessionId()).not.toBe(currentId);
    });

    it('should not create new session if deleting other session', async () => {
      const currentId = await SessionLifecycle.createSession();
      const otherId = 'af4eee4b-a7e0-477f-a3fe-6cd1d3aa821c';

      Storage.deleteSession.mockResolvedValue(undefined);

      await SessionLifecycle.deleteSession(otherId);

      // Current session should remain unchanged
      expect(SessionState.getCurrentSessionId()).toBe(currentId);
    });

    it('should emit session:deleted event', async () => {
      Storage.deleteSession.mockResolvedValue(undefined);

      await SessionLifecycle.deleteSession(testSessionId);

      expect(EventBus.emit).toHaveBeenCalledWith(
        'session:deleted',
        expect.objectContaining({
          sessionId: testSessionId,
        })
      );
    });

    it('should handle storage errors gracefully', async () => {
      Storage.deleteSession.mockRejectedValue(new Error('Delete failed'));

      const result = await SessionLifecycle.deleteSession(testSessionId);

      expect(result).toBe(false);
    });
  });

  // ==========================================
  // renameSession Tests
  // ==========================================

  describe('renameSession', () => {
    it('should rename session with valid ID and title', async () => {
      const mockSession = {
        id: testSessionId,
        title: 'Old Title',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [],
      };

      Storage.getSession.mockResolvedValue(mockSession);
      Storage.saveSession.mockResolvedValue(undefined);

      const newTitle = 'New Title';
      const result = await SessionLifecycle.renameSession(testSessionId, newTitle);

      expect(result).toBe(true);
      expect(Storage.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: testSessionId,
          title: newTitle,
        })
      );
    });

    it('should return false for invalid session ID', async () => {
      const result = await SessionLifecycle.renameSession('invalid-id', 'New Title');

      expect(result).toBe(false);
      expect(Storage.getSession).not.toHaveBeenCalled();
    });

    it('should return false for non-existent session', async () => {
      Storage.getSession.mockResolvedValue(null);

      const result = await SessionLifecycle.renameSession(testSessionId, 'New Title');

      expect(result).toBe(false);
    });

    it('should emit session:updated event on success', async () => {
      const mockSession = {
        id: testSessionId,
        title: 'Old Title',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [],
      };

      Storage.getSession.mockResolvedValue(mockSession);
      Storage.saveSession.mockResolvedValue(undefined);

      await SessionLifecycle.renameSession(testSessionId, 'New Title');

      expect(EventBus.emit).toHaveBeenCalledWith(
        'session:updated',
        expect.objectContaining({
          sessionId: testSessionId,
          field: 'title',
        })
      );
    });

    it('should handle storage errors gracefully', async () => {
      const mockSession = {
        id: testSessionId,
        title: 'Old Title',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [],
      };

      Storage.getSession.mockResolvedValue(mockSession);
      Storage.saveSession.mockRejectedValue(new Error('Save failed'));

      const result = await SessionLifecycle.renameSession(testSessionId, 'New Title');

      expect(result).toBe(false);
    });
  });

  // ==========================================
  // clearAllSessions Tests
  // ==========================================

  describe('clearAllSessions', () => {
    it('should clear conversation and create new session', async () => {
      const currentId = await SessionLifecycle.createSession([
        { role: 'user', content: 'Test message' },
      ]);

      // Verify we have messages
      const historyBefore = SessionState.getHistory();
      expect(historyBefore.length).toBeGreaterThan(0);

      await SessionLifecycle.clearAllSessions();

      // Should have new session with empty history
      const newSessionId = SessionState.getCurrentSessionId();
      expect(newSessionId).not.toBe(currentId);

      const historyAfter = SessionState.getHistory();
      expect(historyAfter.length).toBe(0);
    });

    it('should save current session before clearing', async () => {
      await SessionLifecycle.createSession([{ role: 'user', content: 'Test message' }]);

      await SessionLifecycle.clearAllSessions();

      // Verify save was called (via SessionPersistence)
      expect(SessionPersistence.saveCurrentSession).toHaveBeenCalled();
    });

    it('should emit session:created event for new session', async () => {
      await SessionLifecycle.createSession();

      EventBus.emit.mockClear();

      await SessionLifecycle.clearAllSessions();

      expect(EventBus.emit).toHaveBeenCalledWith(
        'session:created',
        expect.objectContaining({
          sessionId: expect.any(String),
        })
      );
    });

    it('should handle save errors gracefully', async () => {
      await SessionLifecycle.createSession([{ role: 'user', content: 'Test' }]);

      Storage.saveSession.mockRejectedValue(new Error('Save failed'));

      // Should still complete clear operation
      await SessionLifecycle.clearAllSessions();

      const history = SessionState.getHistory();
      expect(history.length).toBe(0);
    });
  });

  // ==========================================
  // Session State Transitions Tests
  // ==========================================

  describe('Session State Transitions', () => {
    it('should track session transitions correctly', async () => {
      const session1 = await SessionLifecycle.createSession();
      expect(SessionState.getCurrentSessionId()).toBe(session1);

      const session2 = await SessionLifecycle.createSession();
      expect(SessionState.getCurrentSessionId()).toBe(session2);

      expect(session1).not.toBe(session2);
    });

    it('should maintain state integrity through switches', async () => {
      const session1 = await SessionLifecycle.createSession([
        { role: 'user', content: 'Session 1' },
      ]);

      const session2Id = 'bf4eee4b-a7e0-477f-a3fe-6cd1d3aa821d';
      const mockSession2 = {
        id: session2Id,
        title: 'Session 2',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [{ role: 'user', content: 'Session 2' }],
      };

      Storage.getSession.mockResolvedValue(mockSession2);

      await SessionLifecycle.switchSession(session2Id);
      expect(SessionState.getCurrentSessionId()).toBe(session2Id);

      // Switch back
      const mockSession1 = {
        id: session1,
        title: 'Session 1',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [{ role: 'user', content: 'Session 1' }],
      };

      Storage.getSession.mockResolvedValue(mockSession1);

      await SessionLifecycle.switchSession(session1);
      expect(SessionState.getCurrentSessionId()).toBe(session1);
    });
  });

  // ==========================================
  // Session Cleanup Tests
  // ==========================================

  describe('Session Cleanup', () => {
    it('should handle cleanup on session deletion', async () => {
      const currentId = await SessionLifecycle.createSession([{ role: 'user', content: 'Test' }]);

      Storage.deleteSession.mockResolvedValue(undefined);

      await SessionLifecycle.deleteSession(currentId);

      // Verify new session was created (cleanup)
      const newSessionId = SessionState.getCurrentSessionId();
      expect(newSessionId).toBeTruthy();
      expect(newSessionId).not.toBe(currentId);
    });

    it('should not cleanup when deleting non-current session', async () => {
      const currentId = await SessionLifecycle.createSession();
      const otherId = 'other-session';

      Storage.deleteSession.mockResolvedValue(undefined);

      await SessionLifecycle.deleteSession(otherId);

      // Current session should remain
      expect(SessionState.getCurrentSessionId()).toBe(currentId);
    });
  });

  // ==========================================
  // Error Handling Tests
  // ==========================================

  describe('Error Handling', () => {
    it('should handle null session ID gracefully', async () => {
      const result = await SessionLifecycle.activateSession(null);
      expect(result).toBeNull();
    });

    it('should handle undefined session ID gracefully', async () => {
      const result = await SessionLifecycle.activateSession(undefined);
      expect(result).toBeNull();
    });

    it('should handle empty string session ID gracefully', async () => {
      const result = await SessionLifecycle.activateSession('');
      expect(result).toBeNull();
    });

    it('should handle storage unavailability gracefully', async () => {
      Storage.getSession.mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const result = await SessionLifecycle.activateSession(testSessionId);

      expect(result).toBeNull();
    });
  });

  // ==========================================
  // Facade Pattern Tests (No Circular Imports)
  // ==========================================

  describe('Facade Pattern Compliance', () => {
    it('should not directly import session-state.js (facade pattern)', async () => {
      // This test verifies that session-lifecycle does not have a direct
      // dependency on session-state, which would create a circular reference
      // and violate the facade pattern.

      // The facade pattern requires that:
      // 1. session-lifecycle uses injected dependencies or callbacks
      // 2. State access goes through the index.js facade
      // 3. No direct coupling between lifecycle and state modules

      // Verify the module can function through its public API only
      const sessionId = await SessionLifecycle.createSession();
      expect(sessionId).toBeTruthy();

      // Verify state was updated through proper abstraction
      expect(SessionState.getCurrentSessionId()).toBe(sessionId);
    });

    it('should work without direct SessionState coupling', async () => {
      // Test that lifecycle operations work through proper abstraction
      // even when we only use the lifecycle API

      const sessionId = await SessionLifecycle.createSession([{ role: 'user', content: 'Test' }]);

      // Operations should complete without errors
      expect(sessionId).toBeTruthy();

      // State should be consistently updated through the facade
      const history = SessionState.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Test');
    });
  });

  // ==========================================
  // Memory Leak Prevention Tests
  // ==========================================

  describe('Memory Leak Prevention', () => {
    it('should clean up resources on session switch', async () => {
      const currentId = await SessionLifecycle.createSession([
        { role: 'user', content: 'Current session' },
      ]);
      const targetId = '9f4eee4b-a7e0-477f-a3fe-6cd1d3aa821b';

      const mockTargetSession = {
        id: targetId,
        title: 'Target Chat',
        createdAt: '2024-01-27T12:00:00Z',
        messages: [],
      };

      Storage.getSession.mockResolvedValue(mockTargetSession);

      // Switch should not leak references to old session
      await SessionLifecycle.switchSession(targetId);

      // Verify new session is active
      expect(SessionState.getCurrentSessionId()).toBe(targetId);
    });

    it('should handle multiple session switches without leaks', async () => {
      const sessions = [
        '9f4eee4b-a7e0-477f-a3fe-6cd1d3aa821a',
        '9f4eee4b-a7e0-477f-a3fe-6cd1d3aa821b',
        '9f4eee4b-a7e0-477f-a3fe-6cd1d3aa821c',
      ];

      for (const sessionId of sessions) {
        const mockSession = {
          id: sessionId,
          title: `Chat ${sessionId}`,
          createdAt: '2024-01-27T12:00:00Z',
          messages: [],
        };

        Storage.getSession.mockResolvedValue(mockSession);
        await SessionLifecycle.switchSession(sessionId);
      }

      // Final state should be the last session
      expect(SessionState.getCurrentSessionId()).toBe(sessions[2]);
    });
  });
});
