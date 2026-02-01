/**
 * Unit Tests for Data Provider Pattern
 *
 * Tests for the data provider abstraction:
 * - Provider registration
 * - Provider switching
 * - Data access delegation
 * - EventBus integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataProvider } from '../../js/providers/data-provider-interface.js';
import { EventBus } from '../../js/services/event-bus.js';

// ==========================================
// Mock Provider for Testing
// ==========================================

function createMockProvider(type, data = {}) {
  return {
    getType: () => type,
    isReady: vi.fn().mockResolvedValue(data.ready ?? true),
    getStreams: vi.fn().mockResolvedValue(data.streams ?? []),
    getPatterns: vi.fn().mockResolvedValue(data.patterns ?? null),
    getPersonality: vi.fn().mockResolvedValue(data.personality ?? null),
    getSummary: vi.fn().mockResolvedValue(data.summary ?? null),
    getStreamCount: vi.fn().mockResolvedValue(data.streamCount ?? 0),
  };
}

// ==========================================
// Setup & Teardown
// ==========================================

beforeEach(() => {
  EventBus.clearAll();
});

afterEach(() => {
  EventBus.clearAll();
});

// ==========================================
// Provider Registration Tests
// ==========================================

describe('DataProvider Registration', () => {
  it('should register a valid provider', () => {
    const mockProvider = createMockProvider('test');

    expect(() => DataProvider.registerProvider('test', mockProvider)).not.toThrow();
    expect(DataProvider.getProvider('test')).toBe(mockProvider);
  });

  it('should reject provider missing required methods', () => {
    const incompleteProvider = {
      getType: () => 'incomplete',
      // Missing other required methods
    };

    expect(() => DataProvider.registerProvider('incomplete', incompleteProvider)).toThrow(
      /missing methods/
    );
  });

  it('should return null for unregistered provider', () => {
    expect(DataProvider.getProvider('nonexistent')).toBeNull();
  });
});

// ==========================================
// Provider Switching Tests
// ==========================================

describe('DataProvider Switching', () => {
  it('should switch to a registered provider', async () => {
    const mockProvider = createMockProvider('switch-test');
    DataProvider.registerProvider('switch-test', mockProvider);

    const result = await DataProvider.switchProvider('switch-test');

    expect(result).toBe(true);
    expect(DataProvider.getCurrentType()).toBe('switch-test');
  });

  it('should emit event on provider switch', async () => {
    const mockProvider = createMockProvider('event-test');
    DataProvider.registerProvider('event-test', mockProvider);

    const handler = vi.fn();
    EventBus.on('data:provider_changed', handler);

    await DataProvider.switchProvider('event-test');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ providerType: 'event-test' }),
      expect.any(Object)
    );
  });

  it('should return false for unknown provider type', async () => {
    const result = await DataProvider.switchProvider('unknown-type');
    expect(result).toBe(false);
  });
});

// ==========================================
// Data Access Tests
// ==========================================

describe('DataProvider Data Access', () => {
  const testStreams = [{ ts: '2023-01-01', master_metadata_track_name: 'Test Track' }];
  const testPersonality = { type: 'Test', name: 'Tester', emoji: '🧪' };
  const testPatterns = { comfortDiscovery: { ratio: 50 } };

  beforeEach(async () => {
    const mockProvider = createMockProvider('data-test', {
      streams: testStreams,
      personality: testPersonality,
      patterns: testPatterns,
      streamCount: 100,
      ready: true,
    });
    DataProvider.registerProvider('data-test', mockProvider);
    await DataProvider.switchProvider('data-test');
  });

  it('should delegate getStreams to current provider', async () => {
    const streams = await DataProvider.getStreams();
    expect(streams).toEqual(testStreams);
  });

  it('should delegate getPersonality to current provider', async () => {
    const personality = await DataProvider.getPersonality();
    expect(personality).toEqual(testPersonality);
  });

  it('should delegate getPatterns to current provider', async () => {
    const patterns = await DataProvider.getPatterns();
    expect(patterns).toEqual(testPatterns);
  });

  it('should delegate getStreamCount to current provider', async () => {
    const count = await DataProvider.getStreamCount();
    expect(count).toBe(100);
  });

  it('should delegate isReady to current provider', async () => {
    const ready = await DataProvider.isReady();
    expect(ready).toBe(true);
  });
});

// ==========================================
// isDemo Tests
// ==========================================

describe('DataProvider isDemo', () => {
  it('should return true when demo provider is active', async () => {
    const demoProvider = createMockProvider('demo');
    DataProvider.registerProvider('demo', demoProvider);
    await DataProvider.switchProvider('demo');

    expect(DataProvider.isDemo()).toBe(true);
  });

  it('should return false when user provider is active', async () => {
    const userProvider = createMockProvider('user');
    DataProvider.registerProvider('user', userProvider);
    await DataProvider.switchProvider('user');

    expect(DataProvider.isDemo()).toBe(false);
  });
});

// ==========================================
// Edge Cases
// ==========================================

describe('DataProvider Edge Cases', () => {
  it('should return empty array when no provider is set', async () => {
    // Force no provider by switching to unregistered
    await DataProvider.switchProvider('nonexistent');

    // This should not throw
    const streams = await DataProvider.getStreams();
    expect(streams === null || (Array.isArray(streams) && streams.length === 0)).toBe(true);
  });

  it('should handle provider returning null gracefully', async () => {
    const nullProvider = createMockProvider('null-test', {
      personality: null,
      patterns: null,
      summary: null,
    });
    DataProvider.registerProvider('null-test', nullProvider);
    await DataProvider.switchProvider('null-test');

    const personality = await DataProvider.getPersonality();
    const patterns = await DataProvider.getPatterns();

    expect(personality).toBeNull();
    expect(patterns).toBeNull();
  });
});
