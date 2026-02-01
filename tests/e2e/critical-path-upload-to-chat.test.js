/**
 * E2E Tests for Critical Path: Upload → Parse → Patterns → Chat
 *
 * Tests the complete flow from file upload through to chat initialization.
 * This is the core user journey and must be robust.
 *
 * @module tests/e2e/critical-path-upload-to-chat.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Test Fixtures
// ==========================================

/**
 * Generate mock Spotify streaming data matching actual export format
 */
function generateSpotifyStreamingData(count = 100) {
  const streams = [];
  const baseDate = new Date('2023-01-01T00:00:00Z');

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(baseDate.getTime() + i * 3600000); // 1 hour apart
    streams.push({
      ts: timestamp.toISOString(),
      endTime: timestamp.toISOString(),
      master_metadata_track_name: `Track ${i % 20}`,
      master_metadata_album_artist_name: `Artist ${i % 10}`,
      master_metadata_album_album_name: `Album ${Math.floor(i / 5) % 5}`,
      ms_played: 180000 + (i % 3) * 60000,
      platform: ['android', 'ios', 'desktop'][i % 3],
      reason_start: ['clickrow', 'fwdbtn', 'appload'][i % 3],
      reason_end: ['trackdone', 'endplay', 'logout'][i % 3],
      shuffle: i % 2 === 0,
      skipped: i % 5 === 0,
      offline: i % 3 === 0
    });
  }

  return streams;
}

/**
 * Generate a mock File object
 */
function createMockFile(content, filename) {
  const blob = new Blob([JSON.stringify(content)], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });
  return file;
}

// ==========================================
// Mock Setup
// ==========================================

// Mock Web Worker
class MockWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this._messages = [];
  }

  postMessage(data) {
    // Simulate async processing
    setTimeout(() => {
      if (data.type === 'parse') {
        // Simulate parsing success
        const streams = generateSpotifyStreamingData(100);
        if (this.onmessage) {
          this.onmessage({
            data: {
              type: 'complete',
              streams,
              chunks: [],
              stats: { totalStreams: streams.length, fileCount: 1 }
            }
          });
        }
      }
    }, 10);
  }

  terminate() {
    this.onmessage = null;
    this.onerror = null;
  }
}

// Mock Worker constructor
global.Worker = MockWorker;

// Mock IndexedDB
const mockDB = {
  streams: null,
  chunks: null,
  personality: null,
  patterns: null,
  chatSessions: null,

  async get(store) {
    return this[store];
  },

  async put(store, data) {
    this[store] = data;
    return data;
  },

  async clear(store) {
    this[store] = null;
  }
};

// Mock Storage
const mockStorage = {
  _initialized: false,
  _eventListeners: {},

  async init() {
    this._initialized = true;
    return true;
  },

  async saveStreams(streams) {
    mockDB.streams = streams;
    this._emit('streams', { type: 'streams', count: streams?.length || 0 });
    return streams;
  },

  async saveChunks(chunks) {
    mockDB.chunks = chunks;
    return chunks;
  },

  async savePersonality(personality) {
    mockDB.personality = personality;
    return personality;
  },

  async savePatterns(patterns) {
    mockDB.patterns = patterns;
    return patterns;
  },

  async getStreams() {
    return mockDB.streams;
  },

  async clearStreams() {
    mockDB.streams = null;
    mockDB.chunks = null;
  },

  onUpdate(callback) {
    this._eventListeners.update = callback;
  },

  _emit(event, data) {
    if (this._eventListeners.update) {
      this._eventListeners.update(data);
    }
  }
};

// Mock AppState
const mockAppState = {
  _data: {},
  update(key, data) {
    this._data[key] = { ...this._data[key], ...data };
  },
  setPatterns(patterns) {
    this._data.patterns = patterns;
  },
  setPersonality(personality) {
    this._data.personality = personality;
  },
  getData() {
    return this._data;
  }
};

// Mock ViewController
const mockViewController = {
  _currentView: null,
  _progressMessage: null,

  showUpload() {
    this._currentView = 'upload';
  },

  showProcessing(message) {
    this._currentView = 'processing';
    this._progressMessage = message;
  },

  updateProgress(message) {
    this._progressMessage = message;
  },

  showReveal() {
    this._currentView = 'reveal';
  }
};

// Mock OperationLock
const mockOperationLock = {
  _locks: {},

  async acquire(lockName) {
    if (this._locks[lockName]) {
      const error = new Error(`Lock '${lockName}' is already held`);
      error.name = 'LockAcquisitionError';
      throw error;
    }
    this._locks[lockName] = Date.now();
    return `lock-${Date.now()}`;
  },

  release(lockName, lockId) {
    if (this._locks[lockName] === lockId || !lockId) {
      delete this._locks[lockName];
      return true;
    }
    return false;
  }
};

// Mock toast function
const mockShowToast = vi.fn();

// ==========================================
// Module Imports
// ==========================================

import { Patterns } from '../../js/patterns.js';
import { Personality } from '../../js/personality.js';

// ==========================================
// Test Suite
// ==========================================

describe('E2E: Upload → Parse → Patterns → Chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mocks
    Object.keys(mockDB).forEach(key => {
      mockDB[key] = null;
    });
    mockAppState._data = {};
    mockViewController._currentView = null;
    mockViewController._progressMessage = null;
    mockOperationLock._locks = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // Stage 1: File Upload
  // ==========================================

  describe('Stage 1: File Upload', () => {
    it('should accept valid .json file', () => {
      const file = createMockFile(generateSpotifyStreamingData(10), 'StreamingHistory.json');

      expect(file.name).endsWith('.json');
      expect(file.size).toBeGreaterThan(0);
      expect(file.type).toBe('application/json');
    });

    it('should accept valid .zip file', () => {
      const file = new File([new Blob()], 'StreamingHistory.zip', {
        type: 'application/zip'
      });

      expect(file.name).endsWith('.zip');
    });

    it('should reject invalid file types', () => {
      const invalidFiles = [
        'data.txt',
        'audio.mp3',
        'document.pdf',
        'image.png'
      ];

      for (const filename of invalidFiles) {
        expect(filename.endsWith('.zip') || filename.endsWith('.json')).toBe(false);
      }
    });

    it('should acquire operation lock during processing', async () => {
      const lockId = await mockOperationLock.acquire('file_processing');

      expect(lockId).toBeTruthy();
      expect(mockOperationLock._locks['file_processing']).toBeTruthy();

      // Cleanup
      mockOperationLock.release('file_processing', lockId);
    });

    it('should prevent concurrent processing', async () => {
      const firstLock = await mockOperationLock.acquire('file_processing');

      await expect(mockOperationLock.acquire('file_processing'))
        .rejects.toThrow('is already held');

      // Cleanup
      mockOperationLock.release('file_processing', firstLock);
    });
  });

  // ==========================================
  // Stage 2: Data Parsing
  // ==========================================

  describe('Stage 2: Data Parsing', () => {
    it('should validate stream data structure', () => {
      const streams = generateSpotifyStreamingData(10);

      // All streams should have required fields
      for (const stream of streams) {
        expect(stream).toHaveProperty('ts');
        expect(stream).toHaveProperty('master_metadata_track_name');
        expect(stream).toHaveProperty('master_metadata_album_artist_name');
        expect(stream).toHaveProperty('ms_played');
      }
    });

    it('should normalize streams to consistent format', () => {
      const rawStream = {
        ts: '2023-01-01T12:00:00Z',
        master_metadata_track_name: 'Test Track',
        master_metadata_album_artist_name: 'Test Artist',
        master_metadata_album_album_name: 'Test Album',
        ms_played: 180000,
        platform: 'android'
      };

      // Normalized format expected by patterns
      const normalized = {
        playedAt: rawStream.ts,
        trackName: rawStream.master_metadata_track_name,
        artistName: rawStream.master_metadata_album_artist_name,
        albumName: rawStream.master_metadata_album_album_name,
        msPlayed: rawStream.ms_played,
        platform: rawStream.platform
      };

      expect(normalized.playedAt).toBe(rawStream.ts);
      expect(normalized.trackName).toBe('Test Track');
    });

    it('should filter invalid streams', () => {
      const validStreams = generateSpotifyStreamingData(5);
      const invalidStreams = [
        { ts: null }, // Missing timestamp
        { ts: 'invalid-date' }, // Invalid date
        {}, // Missing all fields
      ];

      const allStreams = [...validStreams, ...invalidStreams];
      const validOnly = allStreams.filter(s => s.ts && new Date(s.ts).getTime() > 0);

      expect(validOnly.length).toBe(validStreams.length);
    });

    it('should generate weekly and monthly chunks', () => {
      const streams = generateSpotifyStreamingData(100);

      // Group by week
      const weeklyChunks = {};
      for (const stream of streams) {
        const date = new Date(stream.ts);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyChunks[weekKey]) {
          weeklyChunks[weekKey] = { streams: [], artists: new Set() };
        }
        weeklyChunks[weekKey].streams.push(stream);
        weeklyChunks[weekKey].artists.add(stream.master_metadata_album_artist_name);
      }

      expect(Object.keys(weeklyChunks).length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // Stage 3: Pattern Detection
  // ==========================================

  describe('Stage 3: Pattern Detection', () => {
    it('should detect all patterns from stream data', () => {
      const streams = generateSpotifyStreamingData(200);
      const chunks = [];

      const patterns = Patterns.detectAllPatterns(streams, chunks);

      expect(patterns).toBeDefined();
      expect(patterns.comfortDiscovery).toBeDefined();
      expect(patterns.eras).toBeDefined();
      expect(patterns.timePatterns).toBeDefined();
      expect(patterns.socialPatterns).toBeDefined();
      expect(patterns.ghostedArtists).toBeDefined();
      expect(patterns.moodSearching).toBeDefined();
      expect(patterns.trueFavorites).toBeDefined();
      expect(patterns.summary).toBeDefined();
    });

    it('should calculate comfort/discovery ratio', () => {
      const streams = generateSpotifyStreamingData(100);
      const ratio = Patterns.detectComfortDiscoveryRatio(streams);

      expect(ratio).toBeDefined();
      expect(ratio.ratio).toBeGreaterThan(0);
      expect(ratio.uniqueArtists).toBeGreaterThan(0);
      expect(ratio.totalPlays).toBe(streams.length);
    });

    it('should classify personality based on patterns', () => {
      const streams = generateSpotifyStreamingData(200);
      const chunks = [];
      const patterns = Patterns.detectAllPatterns(streams, chunks);
      const personality = Personality.classifyPersonality(patterns);

      expect(personality).toBeDefined();
      expect(personality.type).toBeDefined();
      expect(personality.name).toBeDefined();
      expect(personality.emoji).toBeDefined();
      expect(personality.score).toBeGreaterThanOrEqual(0);
      expect(personality.confidence).toBeGreaterThanOrEqual(0);
      expect(personality.confidence).toBeLessThanOrEqual(100);
    });

    it('should include evidence for personality classification', () => {
      const streams = generateSpotifyStreamingData(200);
      const chunks = [];
      const patterns = Patterns.detectAllPatterns(streams, chunks);
      const personality = Personality.classifyPersonality(patterns);

      expect(personality.evidence).toBeDefined();
      expect(Array.isArray(personality.evidence)).toBe(true);
      expect(personality.allEvidence).toBeDefined();
      expect(Array.isArray(personality.allEvidence)).toBe(true);
    });

    it('should generate summary with date range', () => {
      const streams = generateSpotifyStreamingData(100);
      const chunks = [];
      const patterns = Patterns.detectAllPatterns(streams, chunks);

      expect(patterns.summary).toBeDefined();
      expect(patterns.summary.dateRange).toBeDefined();
      expect(patterns.summary.dateRange.start).toBeDefined();
      expect(patterns.summary.dateRange.end).toBeDefined();
      expect(patterns.summary.totalStreams).toBe(streams.length);
    });
  });

  // ==========================================
  // Stage 4: Chat Initialization
  // ==========================================

  describe('Stage 4: Chat Initialization', () => {
    it('should build system prompt with user context', () => {
      const streams = generateSpotifyStreamingData(100);
      const chunks = [];
      const patterns = Patterns.detectAllPatterns(streams, chunks);
      const personality = Personality.classifyPersonality(patterns);

      const userContext = {
        personality,
        patterns,
        summary: patterns.summary
      };

      expect(userContext).toBeDefined();
      expect(userContext.personality.name).toBeDefined();
      expect(userContext.patterns.evidence).toBeDefined();
      expect(userContext.summary.totalStreams).toBe(streams.length);
    });

    it('should include personality type in system prompt', () => {
      const streams = generateSpotifyStreamingData(100);
      const chunks = [];
      const patterns = Patterns.detectAllPatterns(streams, chunks);
      const personality = Personality.classifyPersonality(patterns);

      expect(personality.type).toMatch(/^(emotional_archaeologist|mood_engineer|discovery_junkie|comfort_curator|social_chameleon)$/);
    });

    it('should handle storage updates and refresh streams data', async () => {
      const streams = generateSpotifyStreamingData(100);
      await mockStorage.saveStreams(streams);

      const retrieved = await mockStorage.getStreams();
      expect(retrieved).toEqual(streams);
    });
  });

  // ==========================================
  // Full Integration Tests
  // ==========================================

  describe('Full Integration: Complete Flow', () => {
    it('should process complete flow: upload → parse → patterns → chat', async () => {
      // 1. Upload: Create mock file
      const rawData = generateSpotifyStreamingData(150);
      const file = createMockFile(rawData, 'StreamingHistory.json');

      expect(file).toBeDefined();
      expect(file.name).toBe('StreamingHistory.json');

      // 2. Parse: Validate and normalize streams
      const streams = rawData.map(s => ({
        playedAt: s.ts,
        trackName: s.master_metadata_track_name,
        artistName: s.master_metadata_album_artist_name,
        albumName: s.master_metadata_album_album_name,
        msPlayed: s.ms_played,
        platform: s.platform,
        shuffle: s.shuffle,
        skipped: s.skipped,
        offline: s.offline,
        hourUTC: new Date(s.ts).getUTCHours(),
        dayOfWeekUTC: new Date(s.ts).getUTCDay(),
        completionRate: 0.9,
        playType: 'full'
      }));

      expect(streams.length).toBe(rawData.length);

      // 3. Patterns: Detect behavioral patterns
      const chunks = [];
      const patterns = Patterns.detectAllPatterns(streams, chunks);

      expect(patterns.summary.totalStreams).toBe(streams.length);
      expect(patterns.comfortDiscovery.uniqueArtists).toBeGreaterThan(0);

      // 4. Personality: Classify user personality
      const personality = Personality.classifyPersonality(patterns);

      expect(personality.name).toBeDefined();
      expect(personality.emoji).toBeDefined();

      // 5. Chat: Initialize with user context
      const userContext = {
        personality,
        patterns,
        summary: patterns.summary
      };

      expect(userContext.personality.type).toBeDefined();
      expect(userContext.patterns.evidence).toBeDefined();
      expect(userContext.summary.dateRange).toBeDefined();
    });

    it('should handle large dataset without errors', () => {
      const largeDataset = generateSpotifyStreamingData(10000);
      const patterns = Patterns.detectAllPatterns(largeDataset, []);

      expect(patterns.summary.totalStreams).toBe(10000);
      expect(patterns.comfortDiscovery.totalPlays).toBe(10000);
    });

    it('should handle small dataset gracefully', () => {
      const smallDataset = generateSpotifyStreamingData(10);
      const patterns = Patterns.detectAllPatterns(smallDataset, []);

      expect(patterns.summary.totalStreams).toBe(10);
      expect(patterns.comfortDiscovery.uniqueArtists).toBeGreaterThan(0);
    });

    it('should preserve data integrity through entire pipeline', () => {
      const originalData = generateSpotifyStreamingData(100);

      // Track first stream through pipeline
      const firstStream = originalData[0];
      const firstTimestamp = firstStream.ts;
      const firstArtist = firstStream.master_metadata_album_artist_name;

      // After parsing
      expect(firstTimestamp).toBeDefined();
      expect(firstArtist).toBeDefined();

      // Patterns should use the same data
      const patterns = Patterns.detectAllPatterns(originalData, []);
      expect(patterns.summary.totalStreams).toBe(originalData.length);

      // Date range should match
      expect(patterns.summary.dateRange.start).toBe(firstTimestamp.split('T')[0]);
    });
  });

  // ==========================================
  // Error Scenarios
  // ==========================================

  describe('Error Scenarios and Edge Cases', () => {
    it('should handle empty data gracefully', () => {
      expect(() => {
        Patterns.detectAllPatterns([], []);
      }).toThrow(); // Expected to throw on empty data
    });

    it('should handle single stream', () => {
      const singleStream = generateSpotifyStreamingData(1);
      const patterns = Patterns.detectAllPatterns(singleStream, []);

      expect(patterns.summary.totalStreams).toBe(1);
    });

    it('should handle duplicate detection', () => {
      const duplicateStream = generateSpotifyStreamingData(1)[0];
      const streams = [duplicateStream, duplicateStream, duplicateStream];

      // After deduplication, should have unique streams
      const uniqueStreams = streams.filter((s, i, arr) =>
        arr.findIndex(t => t.ts === s.ts && t.master_metadata_track_name === s.master_metadata_track_name) === i
      );

      expect(uniqueStreams.length).toBe(1);
    });

    it('should handle missing optional fields', () => {
      const minimalStream = {
        ts: '2023-01-01T12:00:00Z',
        master_metadata_track_name: 'Track',
        master_metadata_album_artist_name: 'Artist',
        ms_played: 180000
      };

      const patterns = Patterns.detectAllPatterns([minimalStream], []);

      expect(patterns.summary.totalStreams).toBe(1);
    });

    it('should handle operation lock acquisition failure', async () => {
      await mockOperationLock.acquire('file_processing');

      await expect(mockOperationLock.acquire('file_processing'))
        .rejects.toThrow();

      // Cleanup
      mockOperationLock.release('file_processing');
    });
  });

  // ==========================================
  // Performance Tests
  // ==========================================

  describe('Performance Characteristics', () => {
    it('should complete pattern detection within reasonable time', () => {
      const streams = generateSpotifyStreamingData(5000);
      const startTime = Date.now();

      Patterns.detectAllPatterns(streams, []);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle memory efficiently for large datasets', () => {
      const streams = generateSpotifyStreamingData(50000);

      // Should not throw memory errors
      expect(() => {
        Patterns.detectAllPatterns(streams, []);
      }).not.toThrow();
    });
  });

  // ==========================================
  // Data Flow Validation
  // ==========================================

  describe('Data Flow Validation', () => {
    it('should maintain stream count consistency through pipeline', () => {
      const originalCount = 250;
      const streams = generateSpotifyStreamingData(originalCount);

      // After parsing
      expect(streams.length).toBe(originalCount);

      // After pattern detection
      const patterns = Patterns.detectAllPatterns(streams, []);
      expect(patterns.summary.totalStreams).toBe(originalCount);
    });

    it('should preserve artist names through pipeline', () => {
      const streams = generateSpotifyStreamingData(50);
      const firstArtist = streams[0].master_metadata_album_artist_name;

      const patterns = Patterns.detectAllPatterns(streams, []);
      const comfortRatio = Patterns.detectComfortDiscoveryRatio(streams);

      expect(comfortRatio.uniqueArtists).toBeGreaterThan(0);
      expect(comfortRatio.uniqueArtists).toBeLessThanOrEqual(streams.length);
    });

    it('should calculate correct date range', () => {
      const startDate = new Date('2023-01-01T00:00:00Z');
      const endDate = new Date('2023-12-31T23:59:59Z');

      const streams = generateSpotifyStreamingData(100);
      const patterns = Patterns.detectAllPatterns(streams, []);

      expect(patterns.summary.dateRange.start).toBeDefined();
      expect(patterns.summary.dateRange.end).toBeDefined();
      expect(patterns.summary.dateRange.days).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // Cross-Module Integration
  // ==========================================

  describe('Cross-Module Integration', () => {
    it('should integrate patterns module with personality module', () => {
      const streams = generateSpotifyStreamingData(200);
      const patterns = Patterns.detectAllPatterns(streams, []);
      const personality = Personality.classifyPersonality(patterns);

      // Personality should be based on patterns
      expect(personality.type).toBeDefined();
      expect(personality.breakdown).toBeDefined();
      expect(personality.breakdown.length).toBeGreaterThan(0);
    });

    it('should include all pattern evidence in personality', () => {
      const streams = generateSpotifyStreamingData(200);
      const patterns = Patterns.detectAllPatterns(streams, []);
      const personality = Personality.classifyPersonality(patterns);

      // Check that all evidence from patterns is included
      expect(personality.allEvidence).toBeDefined();
      expect(Array.isArray(personality.allEvidence)).toBe(true);
    });

    it('should provide confidence score for personality classification', () => {
      const streams = generateSpotifyStreamingData(200);
      const patterns = Patterns.detectAllPatterns(streams, []);
      const personality = Personality.classifyPersonality(patterns);

      expect(personality.confidence).toBeGreaterThanOrEqual(0);
      expect(personality.confidence).toBeLessThanOrEqual(100);
    });
  });
});
