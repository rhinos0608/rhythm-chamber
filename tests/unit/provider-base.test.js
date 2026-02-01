/**
 * Provider Base Tests
 *
 * Comprehensive test coverage for ProviderBase class methods
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { ProviderBase } from '../../js/providers/provider-base.js';
import { EventBus } from '../../js/services/event-bus.js';

// Mock console methods to avoid test output pollution
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

describe('ProviderBase', () => {
  let provider;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Mock console methods
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();

    // Create a new provider instance for each test
    provider = new ProviderBase('test');
  });

  afterAll(() => {
    // Restore original console methods
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  describe('constructor', () => {
    it('should set provider type', () => {
      expect(provider.providerType).toBe('test');
    });

    it('should initialize with event bus', () => {
      expect(provider.eventBus).toBe(EventBus);
    });

    it('should accept different provider types', () => {
      const userProvider = new ProviderBase('user');
      expect(userProvider.providerType).toBe('user');

      const demoProvider = new ProviderBase('demo');
      expect(demoProvider.providerType).toBe('demo');

      const sharedProvider = new ProviderBase('shared');
      expect(sharedProvider.providerType).toBe('shared');
    });
  });

  describe('getType', () => {
    it('should return provider type', () => {
      expect(provider.getType()).toBe('test');
    });
  });

  describe('validateReadiness', () => {
    it('should return true for non-null data', () => {
      expect(provider.validateReadiness({})).toBe(true);
      expect(provider.validateReadiness([])).toBe(true);
      expect(provider.validateReadiness('data')).toBe(true);
      expect(provider.validateReadiness(123)).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(provider.validateReadiness(null)).toBe(false);
      expect(provider.validateReadiness(undefined)).toBe(false);
    });
  });

  describe('normalizeStreams', () => {
    it('should return empty array for non-array input', () => {
      expect(provider.normalizeStreams(null)).toEqual([]);
      expect(provider.normalizeStreams(undefined)).toEqual([]);
      expect(provider.normalizeStreams('not array')).toEqual([]);
      expect(provider.normalizeStreams(123)).toEqual([]);
      expect(provider.normalizeStreams({})).toEqual([]);
    });

    it('should filter out invalid stream entries', () => {
      const streams = [
        null,
        undefined,
        'not object',
        123,
        {},
        { ts: null },
        { ts: 123 },
        {
          ts: 123456,
          master_metadata_track_name: 'Song Name',
          master_metadata_album_artist_name: 'Artist Name',
        },
      ];

      const result = provider.normalizeStreams(streams);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        ts: 123456,
        master_metadata_track_name: 'Song Name',
        master_metadata_album_artist_name: 'Artist Name',
      });
    });

    it('should keep valid streams and skip invalid ones', () => {
      const validStream = {
        ts: 1234567890,
        master_metadata_track_name: 'Bohemian Rhapsody',
        master_metadata_album_artist_name: 'Queen',
      };

      const invalidStream = {
        ts: 1234567890,
        master_metadata_track_name: 'Song',
        // missing artist name
      };

      const streams = [validStream, invalidStream];
      const result = provider.normalizeStreams(streams);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(validStream);
      expect(console.warn).toHaveBeenCalledWith(
        '[ProviderBase] Skipping invalid stream entry:',
        invalidStream
      );
    });

    it('should return empty array for empty input', () => {
      expect(provider.normalizeStreams([])).toEqual([]);
    });
  });

  describe('normalizePatterns', () => {
    it('should return null for invalid input', () => {
      expect(provider.normalizePatterns(null)).toBeNull();
      expect(provider.normalizePatterns(undefined)).toBeNull();
      expect(provider.normalizePatterns('not object')).toBeNull();
      expect(provider.normalizePatterns(123)).toBeNull();
    });

    it('should normalize valid patterns object', () => {
      const patterns = {
        comfortDiscovery: { data: 'comfort' },
        timePatterns: { data: 'time' },
        socialPatterns: { data: 'social' },
        ghostedArtists: { data: 'ghosted' },
      };

      const result = provider.normalizePatterns(patterns);
      expect(result).toEqual(patterns);
    });

    it('should handle partial patterns data', () => {
      const patterns = {
        comfortDiscovery: { data: 'comfort' },
        // timePatterns missing
        socialPatterns: null,
        ghostedArtists: undefined,
      };

      const result = provider.normalizePatterns(patterns);
      expect(result).toEqual({
        comfortDiscovery: { data: 'comfort' },
      });
    });

    it('should return null for empty object after normalization', () => {
      const patterns = {
        comfortDiscovery: null,
        timePatterns: undefined,
        socialPatterns: null,
        ghostedArtists: undefined,
      };

      const result = provider.normalizePatterns(patterns);
      expect(result).toBeNull();
    });

    it('should handle empty object', () => {
      expect(provider.normalizePatterns({})).toBeNull();
    });
  });

  describe('normalizePersonality', () => {
    it('should return null for invalid input', () => {
      expect(provider.normalizePersonality(null)).toBeNull();
      expect(provider.normalizePersonality(undefined)).toBeNull();
      expect(provider.normalizePersonality('not object')).toBeNull();
      expect(provider.normalizePersonality(123)).toBeNull();
    });

    it('should normalize valid personality', () => {
      const personality = {
        type: 'explorer',
        name: 'Music Explorer',
        emoji: '🧭',
        tagline: 'Discovering new sounds',
        insights: ['insight1', 'insight2'],
      };

      const result = provider.normalizePersonality(personality);
      expect(result).toEqual(personality);
    });

    it('should handle personality without insights', () => {
      const personality = {
        type: 'curator',
        name: 'Playlist Curator',
        emoji: '📝',
        tagline: 'Crafting perfect playlists',
      };

      const result = provider.normalizePersonality(personality);
      expect(result).toEqual({
        ...personality,
        insights: [],
      });
    });

    it('should return null for missing required fields', () => {
      const invalidPersonality = {
        type: 'explorer',
        name: 'Music Explorer',
        // emoji missing
        tagline: 'Discovering new sounds',
      };

      const result = provider.normalizePersonality(invalidPersonality);
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        '[ProviderBase] Invalid personality data:',
        invalidPersonality
      );
    });

    it('should return null for non-string required fields', () => {
      const invalidPersonality = {
        type: 123,
        name: null,
        emoji: true,
        tagline: undefined,
      };

      const result = provider.normalizePersonality(invalidPersonality);
      expect(result).toBeNull();
    });
  });

  describe('normalizeSummary', () => {
    it('should return default summary for invalid input', () => {
      const result = provider.normalizeSummary(null);
      expect(result).toEqual({
        totalStreams: 0,
        uniqueArtists: 0,
        listeningHours: 0,
        yearsActive: 0,
      });
    });

    it('should normalize numeric fields', () => {
      const summary = {
        totalStreams: '1000',
        uniqueArtists: 500,
        listeningHours: '250.5',
        yearsActive: 3.7,
      };

      const result = provider.normalizeSummary(summary);
      expect(result).toEqual({
        totalStreams: 1000,
        uniqueArtists: 500,
        listeningHours: 250.5,
        yearsActive: 3.7,
      });
    });

    it('should handle missing fields with defaults', () => {
      const summary = {
        totalStreams: 1000,
        // uniqueArtists missing
        listeningHours: 250,
      };

      const result = provider.normalizeSummary(summary);
      expect(result).toEqual({
        totalStreams: 1000,
        uniqueArtists: 0,
        listeningHours: 250,
        yearsActive: 0,
      });
    });

    it('should handle non-numeric values with defaults', () => {
      const summary = {
        totalStreams: 'invalid',
        uniqueArtists: null,
        listeningHours: undefined,
        yearsActive: 'not a number',
      };

      const result = provider.normalizeSummary(summary);
      expect(result).toEqual({
        totalStreams: 0,
        uniqueArtists: 0,
        listeningHours: 0,
        yearsActive: 0,
      });
    });
  });

  describe('getDefaultSummary', () => {
    it('should return default summary values', () => {
      const result = provider.getDefaultSummary();
      expect(result).toEqual({
        totalStreams: 0,
        uniqueArtists: 0,
        listeningHours: 0,
        yearsActive: 0,
      });
    });
  });

  describe('emitDataLoaded', () => {
    it('should emit event with correct name', () => {
      const emitSpy = vi.spyOn(EventBus, 'emit');

      provider.emitDataLoaded('streams', { count: 100 });

      expect(emitSpy).toHaveBeenCalledWith('data:streams_loaded', {
        source: 'test',
        count: 100,
      });
    });

    it('should emit event without metadata', () => {
      const emitSpy = vi.spyOn(EventBus, 'emit');

      provider.emitDataLoaded('patterns');

      expect(emitSpy).toHaveBeenCalledWith('data:patterns_loaded', {
        source: 'test',
      });
    });
  });

  describe('validateStreamCount', () => {
    it('should validate positive numbers', () => {
      expect(provider.validateStreamCount(100)).toBe(100);
      expect(provider.validateStreamCount('250')).toBe(250);
    });

    it('should handle negative numbers', () => {
      expect(provider.validateStreamCount(-50)).toBe(0);
    });

    it('should handle non-numeric values', () => {
      expect(provider.validateStreamCount('invalid')).toBe(0);
      expect(provider.validateStreamCount(null)).toBe(0);
      expect(provider.validateStreamCount(undefined)).toBe(0);
    });

    it('should handle decimal numbers', () => {
      expect(provider.validateStreamCount(123.7)).toBe(123.7);
    });
  });

  describe('hasValidData', () => {
    it('should return true for non-empty arrays', () => {
      expect(provider.hasValidData([1, 2, 3])).toBe(true);
      expect(provider.hasValidData(['item'])).toBe(true);
    });

    it('should return false for empty arrays', () => {
      expect(provider.hasValidData([])).toBe(false);
    });

    it('should return true for non-null/non-undefined values', () => {
      expect(provider.hasValidData({})).toBe(true);
      expect(provider.hasValidData('data')).toBe(true);
      expect(provider.hasValidData(123)).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(provider.hasValidData(null)).toBe(false);
      expect(provider.hasValidData(undefined)).toBe(false);
    });
  });

  describe('getValidationError', () => {
    it('should format validation error message', () => {
      const result = provider.getValidationError('fieldName', 'badValue');
      expect(result).toBe('[test] Invalid fieldName: "badValue"');
    });

    it('should handle object values', () => {
      const result = provider.getValidationError('config', { key: 'value' });
      expect(result).toBe('[test] Invalid config: {"key":"value"}');
    });

    it('should handle array values', () => {
      const result = provider.getValidationError('items', [1, 2, 3]);
      expect(result).toBe('[test] Invalid items: [1,2,3]');
    });
  });

  describe('logging methods', () => {
    it('should log operations', () => {
      provider.logOperation('load_data', { count: 100 });
      expect(console.log).toHaveBeenCalledWith('[test] load_data', { count: 100 });
    });

    it('should log warnings', () => {
      provider.logWarning('Data incomplete', { missing: 'fields' });
      expect(console.warn).toHaveBeenCalledWith('[test] Data incomplete', { missing: 'fields' });
    });

    it('should log errors', () => {
      const error = new Error('Network failure');
      provider.logError('Failed to load', error);
      expect(console.error).toHaveBeenCalledWith('[test] Failed to load', error);
    });

    it('should handle logging without context', () => {
      provider.logWarning('Simple warning');
      expect(console.warn).toHaveBeenCalledWith('[test] Simple warning', null);

      provider.logError('Simple error');
      expect(console.error).toHaveBeenCalledWith('[test] Simple error', null);
    });
  });
});
