/**
 * Cross-Tab Communication Tests
 *
 * Tests for BroadcastChannel message format validation,
 * malformed message handling, and cross-tab coordination.
 *
 * Covers:
 * - Message format validation
 * - Malformed message handling
 * - Message type validation
 * - Cross-tab synchronization
 * - Authority changes
 *
 * @module tests/unit/cross-tab-communication-tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mock BroadcastChannel
// ==========================================

class MockBroadcastChannel {
  static channels = new Map();

  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this._listeners = [];
    this._messageLog = [];

    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name).add(this);
  }

  postMessage(data) {
    this._messageLog.push({ sent: data, timestamp: Date.now() });

    // Broadcast to all other channels with same name
    const channels = MockBroadcastChannel.channels.get(this.name);
    for (const channel of channels) {
      if (channel !== this && channel.onmessage) {
        // Use setTimeout to simulate async message delivery
        setTimeout(() => {
          try {
            channel.onmessage({ data });
          } catch (error) {
            console.error('Error in message handler:', error);
          }
        }, 0);
      }
    }
  }

  addEventListener(type, handler) {
    if (type === 'message') {
      this._listeners.push(handler);
      this.onmessage = handler;
    }
  }

  removeEventListener(type, handler) {
    if (type === 'message') {
      this._listeners = this._listeners.filter(h => h !== handler);
      if (this._listeners.length === 0) {
        this.onmessage = null;
      }
    }
  }

  close() {
    const channels = MockBroadcastChannel.channels.get(this.name);
    if (channels) {
      channels.delete(this);
    }
  }

  getMessageLog() {
    return this._messageLog;
  }

  static reset() {
    MockBroadcastChannel.channels.clear();
  }
}

// ==========================================
// Test: Message Format Validation
// ==========================================

describe('Message Format Validation', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset();
    vi.useFakeTimers();
    global.BroadcastChannel = MockBroadcastChannel;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.BroadcastChannel;
  });

  it('should validate message structure', () => {
    const validMessageFormats = [
      { type: 'CANDIDATE', tabId: 'tab-001', timestamp: Date.now() },
      { type: 'CLAIM_PRIMARY', tabId: 'tab-001', timestamp: Date.now() },
      { type: 'RELEASE_PRIMARY', tabId: 'tab-001', timestamp: Date.now() },
      { type: 'PING', tabId: 'tab-001', timestamp: Date.now() },
      { type: 'PONG', tabId: 'tab-001', timestamp: Date.now() },
    ];

    function isValidMessage(message) {
      return (
        message &&
        typeof message === 'object' &&
        typeof message.type === 'string' &&
        typeof message.tabId === 'string' &&
        typeof message.timestamp === 'number' &&
        message.timestamp > 0
      );
    }

    validMessageFormats.forEach(message => {
      expect(isValidMessage(message)).toBe(true);
    });

    const invalidMessages = [
      null,
      undefined,
      'string',
      123,
      { type: 'CANDIDATE' }, // Missing tabId
      { tabId: 'tab-001' }, // Missing type
      { type: 'CANDIDATE', tabId: 123 }, // Invalid tabId type
      { type: 'CANDIDATE', tabId: 'tab-001', timestamp: 'invalid' }, // Invalid timestamp
    ];

    invalidMessages.forEach(message => {
      expect(isValidMessage(message)).toBe(false);
    });
  });

  it('should handle malformed messages gracefully', () => {
    const channel = new MockBroadcastChannel('test-channel');
    const receivedMessages = [];
    const errorMessages = [];

    channel.addEventListener('message', event => {
      try {
        const message = event.data;

        // Validate message structure
        if (!message || typeof message !== 'object') {
          throw new Error('Invalid message: not an object');
        }

        if (!message.type || typeof message.type !== 'string') {
          throw new Error('Invalid message: missing or invalid type');
        }

        if (!message.tabId || typeof message.tabId !== 'string') {
          throw new Error('Invalid message: missing or invalid tabId');
        }

        receivedMessages.push(message);
      } catch (error) {
        errorMessages.push(error.message);
      }
    });

    // Send malformed messages
    channel.postMessage(null);
    channel.postMessage(undefined);
    channel.postMessage('string');
    channel.postMessage({ type: 'TEST' });
    channel.postMessage({ tabId: 'tab-001' });

    vi.advanceTimersByTime(10);

    // All malformed messages should be caught
    expect(receivedMessages).toHaveLength(0);
    expect(errorMessages).toHaveLength(5);
  });

  it('should validate message types', () => {
    const VALID_MESSAGE_TYPES = new Set([
      'CANDIDATE',
      'CLAIM_PRIMARY',
      'RELEASE_PRIMARY',
      'PING',
      'PONG',
      'AUTHORITY_CHANGE',
      'STATE_UPDATE',
    ]);

    function isValidMessageType(type) {
      return VALID_MESSAGE_TYPES.has(type);
    }

    // Valid types
    VALID_MESSAGE_TYPES.forEach(type => {
      expect(isValidMessageType(type)).toBe(true);
    });

    // Invalid types
    const invalidTypes = ['INVALID', 'UNKNOWN', '', null, undefined, 123];
    invalidTypes.forEach(type => {
      expect(isValidMessageType(type)).toBe(false);
    });
  });
});

// ==========================================
// Test: Message Type Handling
// ==========================================

describe('Message Type Handling', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset();
    vi.useFakeTimers();
    global.BroadcastChannel = MockBroadcastChannel;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.BroadcastChannel;
  });

  it('should route messages by type', () => {
    const channel = new MockBroadcastChannel('coordination');
    const handledMessages = [];

    const messageHandlers = {
      CANDIDATE: message => {
        handledMessages.push({ type: 'CANDIDATE', handled: true, data: message });
      },
      CLAIM_PRIMARY: message => {
        handledMessages.push({ type: 'CLAIM_PRIMARY', handled: true, data: message });
      },
      RELEASE_PRIMARY: message => {
        handledMessages.push({ type: 'RELEASE_PRIMARY', handled: true, data: message });
      },
    };

    channel.addEventListener('message', event => {
      const message = event.data;
      const handler = messageHandlers[message.type];

      if (handler) {
        handler(message);
      } else {
        handledMessages.push({ type: message.type, handled: false, data: message });
      }
    });

    // Send different message types
    channel.postMessage({ type: 'CANDIDATE', tabId: 'tab-001', timestamp: Date.now() });
    channel.postMessage({ type: 'CLAIM_PRIMARY', tabId: 'tab-001', timestamp: Date.now() });
    channel.postMessage({ type: 'RELEASE_PRIMARY', tabId: 'tab-001', timestamp: Date.now() });
    channel.postMessage({ type: 'UNKNOWN', tabId: 'tab-001', timestamp: Date.now() });

    vi.advanceTimersByTime(10);

    expect(handledMessages).toHaveLength(4);
    expect(handledMessages[0].handled).toBe(true);
    expect(handledMessages[1].handled).toBe(true);
    expect(handledMessages[2].handled).toBe(true);
    expect(handledMessages[3].handled).toBe(false);
  });

  it('should handle unknown message types', () => {
    const channel = new MockBroadcastChannel('coordination');
    const unknownTypes = [];

    channel.addEventListener('message', event => {
      const message = event.data;

      if (!['CANDIDATE', 'CLAIM_PRIMARY'].includes(message.type)) {
        unknownTypes.push(message.type);
        console.warn(`Unknown message type: ${message.type}`);
      }
    });

    // Send known and unknown types
    channel.postMessage({ type: 'CANDIDATE', tabId: 'tab-001', timestamp: Date.now() });
    channel.postMessage({ type: 'UNKNOWN_TYPE', tabId: 'tab-001', timestamp: Date.now() });
    channel.postMessage({ type: 'ANOTHER_UNKNOWN', tabId: 'tab-001', timestamp: Date.now() });
    channel.postMessage({ type: 'CLAIM_PRIMARY', tabId: 'tab-001', timestamp: Date.now() });

    vi.advanceTimersByTime(10);

    expect(unknownTypes).toEqual(['UNKNOWN_TYPE', 'ANOTHER_UNKNOWN']);
  });
});

// ==========================================
// Test: Cross-Tab Synchronization
// ==========================================

describe('Cross-Tab Synchronization', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset();
    vi.useFakeTimers();
    global.BroadcastChannel = MockBroadcastChannel;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.BroadcastChannel;
  });

  it('should synchronize state across tabs', () => {
    const tabs = [];
    const CHANNEL_NAME = 'state-sync';

    function createTab(tabId) {
      const channel = new MockBroadcastChannel(CHANNEL_NAME);
      let state = { version: 0, data: {} };

      channel.addEventListener('message', event => {
        const { type, tabId: senderId, payload } = event.data;

        if (type === 'STATE_UPDATE' && senderId !== tabId) {
          // Apply update if newer
          if (payload.version > state.version) {
            state = payload;
          }
        }
      });

      function updateState(newData) {
        state.version++;
        state.data = { ...state.data, ...newData };

        // Broadcast update
        channel.postMessage({
          type: 'STATE_UPDATE',
          tabId,
          timestamp: Date.now(),
          payload: state,
        });
      }

      function getState() {
        return state;
      }

      return { tabId, updateState, getState, channel };
    }

    // Create multiple tabs
    const tab1 = createTab('tab-001');
    const tab2 = createTab('tab-002');
    const tab3 = createTab('tab-003');

    // Tab 1 updates state
    tab1.updateState({ key1: 'value1' });

    vi.advanceTimersByTime(10);

    // All tabs should have the updated state
    expect(tab1.getState().data.key1).toBe('value1');
    expect(tab2.getState().data.key1).toBe('value1');
    expect(tab3.getState().data.key1).toBe('value1');

    // Tab 2 updates state
    tab2.updateState({ key2: 'value2' });

    vi.advanceTimersByTime(10);

    // All tabs should have both updates
    expect(tab1.getState().data.key1).toBe('value1');
    expect(tab1.getState().data.key2).toBe('value2');
    expect(tab2.getState().data.key1).toBe('value1');
    expect(tab2.getState().data.key2).toBe('value2');
    expect(tab3.getState().data.key1).toBe('value1');
    expect(tab3.getState().data.key2).toBe('value2');
  });

  it('should handle concurrent state updates', () => {
    const tabs = [];
    const CHANNEL_NAME = 'concurrent-sync';

    function createTab(tabId) {
      const channel = new MockBroadcastChannel(CHANNEL_NAME);
      let state = { counter: 0, version: 0 };

      channel.addEventListener('message', event => {
        const { type, payload } = event.data;

        if (type === 'INCREMENT') {
          state.counter++;
          state.version++;
        }
      });

      function increment() {
        state.counter++;
        state.version++;

        channel.postMessage({
          type: 'INCREMENT',
          tabId,
          timestamp: Date.now(),
          payload: { counter: state.counter, version: state.version },
        });
      }

      function getState() {
        return state;
      }

      return { increment, getState };
    }

    const tab1 = createTab('tab-001');
    const tab2 = createTab('tab-002');
    const tab3 = createTab('tab-003');

    // All tabs increment concurrently
    tab1.increment();
    tab2.increment();
    tab3.increment();

    vi.advanceTimersByTime(10);

    // Each tab should receive all increments
    expect(tab1.getState().counter).toBe(3);
    expect(tab2.getState().counter).toBe(3);
    expect(tab3.getState().counter).toBe(3);
  });
});

// ==========================================
// Test: Authority Changes
// ==========================================

describe('Authority Changes (71a7192)', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset();
    vi.useFakeTimers();
    global.BroadcastChannel = MockBroadcastChannel;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.BroadcastChannel;
  });

  it('should notify tabs of authority changes', () => {
    const CHANNEL_NAME = 'authority-coordination';
    const authorityChanges = [];

    function createTab(tabId) {
      const channel = new MockBroadcastChannel(CHANNEL_NAME);
      let isPrimary = false;

      channel.addEventListener('message', event => {
        const { type, tabId: senderId, payload } = event.data;

        if (type === 'CLAIM_PRIMARY' && senderId !== tabId) {
          // Another tab claimed primary
          if (isPrimary) {
            isPrimary = false;
            authorityChanges.push({
              tabId,
              from: 'primary',
              to: 'secondary',
              triggeredBy: senderId,
            });
          }
        }

        if (type === 'RELEASE_PRIMARY' && senderId !== tabId) {
          // Primary released, may need re-election
          authorityChanges.push({
            tabId,
            event: 'primary_released',
            triggeredBy: senderId,
          });
        }
      });

      function claimPrimary() {
        isPrimary = true;

        channel.postMessage({
          type: 'CLAIM_PRIMARY',
          tabId,
          timestamp: Date.now(),
          payload: { isPrimary: true },
        });
      }

      function releasePrimary() {
        isPrimary = false;

        channel.postMessage({
          type: 'RELEASE_PRIMARY',
          tabId,
          timestamp: Date.now(),
          payload: { isPrimary: false },
        });
      }

      return { tabId, claimPrimary, releasePrimary };
    }

    const tab1 = createTab('tab-001');
    const tab2 = createTab('tab-002');
    const tab3 = createTab('tab-003');

    // Tab 1 claims primary
    tab1.claimPrimary();

    vi.advanceTimersByTime(10);

    // Tab 2 and 3 should have received authority change
    expect(authorityChanges.length).toBeGreaterThanOrEqual(2);

    // Tab 2 tries to claim primary (should notify tab 1)
    tab2.claimPrimary();

    vi.advanceTimersByTime(10);

    // Tab 1 should have been notified of authority change
    const tab1Change = authorityChanges.find(c => c.tabId === 'tab-001');
    expect(tab1Change).toBeDefined();
    expect(tab1Change.from).toBe('primary');
    expect(tab1Change.to).toBe('secondary');
  });

  it('should emit tab:authority_changed event with correct payload', () => {
    const CHANNEL_NAME = 'authority-events';
    const authorityEvents = [];

    function createTab(tabId) {
      const channel = new MockBroadcastChannel(CHANNEL_NAME);
      let authorityLevel = 'none';

      channel.addEventListener('message', event => {
        const { type, payload } = event.data;

        if (type === 'AUTHORITY_CHANGE') {
          authorityLevel = payload.level;

          authorityEvents.push({
            tabId,
            isPrimary: payload.isPrimary,
            level: payload.level,
            mode: payload.mode,
            message: payload.message,
          });
        }
      });

      function setAuthority(isPrimary, level, mode) {
        channel.postMessage({
          type: 'AUTHORITY_CHANGE',
          tabId,
          timestamp: Date.now(),
          payload: {
            isPrimary,
            level,
            mode,
            message: isPrimary
              ? `Tab ${tabId} is now primary (${level})`
              : `Tab ${tabId} is now secondary (${level})`,
          },
        });
      }

      return { tabId, setAuthority, getAuthorityLevel: () => authorityLevel };
    }

    const tab1 = createTab('tab-001');
    const tab2 = createTab('tab-002');

    // Tab 1 becomes primary
    tab1.setAuthority(true, 'full', 'primary');

    vi.advanceTimersByTime(10);

    // Tab 2 should receive authority change event
    const tab2Event = authorityEvents.find(e => e.tabId === 'tab-002');
    expect(tab2Event).toBeDefined();
    expect(tab2Event.isPrimary).toBe(false); // Tab 2 is not primary
    expect(tab2Event.level).toBe('full');
    expect(tab2Event.mode).toBe('primary');
    expect(tab2Event.message).toContain('Tab tab-001 is now primary');
  });
});

// ==========================================
// Test: Message Replay and Watermarks
// ==========================================

describe('Message Replay and Watermarks', () => {
  it('should track message sequence for replay', () => {
    const messages = [];
    let sequenceNumber = 0;

    function emitMessage(type, payload) {
      const sequence = ++sequenceNumber;
      const message = {
        type,
        sequence,
        timestamp: Date.now(),
        payload,
      };
      messages.push(message);
      return message;
    }

    function getReplayWatermark(failedSequence) {
      // Replay from first failed sequence
      return Math.min(failedSequence, sequenceNumber);
    }

    function replayFrom(watermark) {
      return messages.filter(m => m.sequence >= watermark);
    }

    // Emit messages
    emitMessage('event1', { data: 'test1' });
    emitMessage('event2', { data: 'test2' });
    const msg3 = emitMessage('event3', { data: 'test3' });
    emitMessage('event4', { data: 'test4' });

    // Simulate failure at sequence 3
    const failedSequence = msg3.sequence;

    // Get replay watermark
    const watermark = getReplayWatermark(failedSequence);
    expect(watermark).toBe(3);

    // Get messages to replay
    const replayMessages = replayFrom(watermark);
    expect(replayMessages).toHaveLength(2);
    expect(replayMessages[0].sequence).toBe(3);
    expect(replayMessages[1].sequence).toBe(4);
  });
});
