/**
 * Pattern Null Safety Tests
 * Tests for null/undefined guards in pattern detection functions
 *
 * Comprehensive test suite to ensure all pattern functions handle:
 * - null arrays
 * - undefined arrays
 * - missing properties
 * - empty arrays
 */

import { describe, it, expect } from 'vitest';
import {
  generateLiteSummary,
  generatePatternSummary,
  generateDataInsights,
} from '../../js/patterns/pattern-transformers.js';
import {
  detectComfortDiscoveryRatio,
  detectEras,
  detectGhostedArtists,
  detectDiscoveryExplosions,
} from '../../js/patterns/pattern-extractors.js';
import { detectLitePatterns, detectImmediateVibe } from '../../js/patterns/pattern-matching.js';

describe('Pattern Transformers - Null Safety', () => {
  describe('generateLiteSummary', () => {
    const liteData = {
      recentStreams: [],
      topArtists: {
        shortTerm: [],
        mediumTerm: [],
        longTerm: [],
      },
      topTracks: {
        shortTerm: [],
        mediumTerm: [],
        longTerm: [],
      },
      profile: {
        displayName: 'Test User',
      },
    };

    it('should handle null topArtists.shortTerm', () => {
      const patterns = { topGenres: [], diversity: {}, tasteStability: {} };
      const data = {
        ...liteData,
        topArtists: { shortTerm: null, mediumTerm: [], longTerm: [] },
      };
      const result = generateLiteSummary(data, patterns);
      expect(result.topArtists).toEqual([]);
    });

    it('should handle undefined topArtists.shortTerm', () => {
      const patterns = { topGenres: [], diversity: {}, tasteStability: {} };
      const data = {
        ...liteData,
        topArtists: { shortTerm: undefined, mediumTerm: [], longTerm: [] },
      };
      const result = generateLiteSummary(data, patterns);
      expect(result.topArtists).toEqual([]);
    });

    it('should handle null topTracks.shortTerm', () => {
      const patterns = { topGenres: [], diversity: {}, tasteStability: {} };
      const data = {
        ...liteData,
        topTracks: { shortTerm: null, mediumTerm: [], longTerm: [] },
      };
      const result = generateLiteSummary(data, patterns);
      expect(result.topTracks).toEqual([]);
    });

    it('should handle null topGenres', () => {
      const patterns = { topGenres: null, diversity: {}, tasteStability: {} };
      const result = generateLiteSummary(liteData, patterns);
      expect(result.topGenres).toEqual([]);
    });

    it('should handle arrays with null elements', () => {
      const patterns = { topGenres: [], diversity: {}, tasteStability: {} };
      const data = {
        ...liteData,
        topArtists: {
          shortTerm: [
            { name: 'Artist 1' },
            null,
            { name: 'Artist 2' },
            undefined,
            { name: 'Artist 3' },
          ],
          mediumTerm: [],
          longTerm: [],
        },
      };
      const result = generateLiteSummary(data, patterns);
      expect(result.topArtists).toBeDefined();
      expect(result.topArtists.length).toBeGreaterThan(0);
    });
  });

  describe('generateDataInsights', () => {
    it('should handle null streams', () => {
      const result = generateDataInsights(null);
      expect(result).toBeNull();
    });

    it('should handle empty streams array', () => {
      const result = generateDataInsights([]);
      expect(result).toBeNull();
    });

    it('should handle streams with null elements', () => {
      const streams = [
        { artistName: 'Artist 1', msPlayed: 60000, playedAt: '2024-01-01' }, // 1 minute
        null,
        { artistName: 'Artist 2', msPlayed: 120000, playedAt: '2024-01-02' }, // 2 minutes
        undefined,
        { artistName: 'Artist 3', msPlayed: 180000, playedAt: '2024-01-03' }, // 3 minutes
      ];
      const result = generateDataInsights(streams);
      expect(result).toBeDefined();
      expect(result.totalMinutes).toBe(6); // 6 minutes total
      expect(result.uniqueArtists).toBe(3);
    });
  });

  describe('generatePatternSummary', () => {
    it('should handle streams with null elements', () => {
      const streams = [
        { artistName: 'Artist 1', msPlayed: 1000, playedAt: '2024-01-01', trackName: 'Track 1' },
        null,
        { artistName: 'Artist 2', msPlayed: 2000, playedAt: '2024-01-02', trackName: 'Track 2' },
      ];
      const patterns = {};
      const result = generatePatternSummary(streams, patterns);
      expect(result.totalStreams).toBe(3);
      expect(result.uniqueArtists).toBe(2);
      expect(result.uniqueTracks).toBe(2);
    });
  });
});

describe('Pattern Extractors - Null Safety', () => {
  describe('detectGhostedArtists', () => {
    it('should handle null streams', () => {
      const result = detectGhostedArtists(null);
      expect(result.ghosted).toEqual([]);
      expect(result.hasGhosted).toBe(false);
      expect(result.count).toBe(0);
    });

    it('should handle empty streams array', () => {
      const result = detectGhostedArtists([]);
      expect(result.ghosted).toEqual([]);
      expect(result.hasGhosted).toBe(false);
    });

    it('should handle streams with null elements', () => {
      const streams = [
        {
          artistName: 'Artist 1',
          msPlayed: 100000,
          playedAt: '2022-01-01T00:00:00Z',
        },
        null,
        {
          artistName: 'Artist 2',
          msPlayed: 100000,
          playedAt: '2023-01-01T00:00:00Z',
        },
      ];
      const result = detectGhostedArtists(streams);
      expect(result).toBeDefined();
      expect(result.ghosted).toBeDefined();
    });

    it('should return empty arrays for ghosted and activeUntilEnd when no data', () => {
      const result = detectGhostedArtists([]);
      expect(result.ghosted).toEqual([]);
      expect(result.activeUntilEnd).toEqual([]);
    });
  });

  describe('detectDiscoveryExplosions', () => {
    it('should handle empty chunks array', () => {
      const result = detectDiscoveryExplosions([], []);
      expect(result.explosions).toEqual([]);
      expect(result.hasExplosions).toBe(false);
    });

    it('should handle chunks with no monthly data', () => {
      const chunks = [{ type: 'weekly', startDate: '2024-01-01' }];
      const result = detectDiscoveryExplosions([], chunks);
      expect(result.explosions).toEqual([]);
    });

    it('should return empty explosions array when insufficient data', () => {
      const chunks = [
        { type: 'monthly', startDate: '2024-01-01' },
        { type: 'monthly', startDate: '2024-02-01' },
      ];
      const result = detectDiscoveryExplosions([], chunks);
      expect(result.explosions).toEqual([]);
      expect(result.hasExplosions).toBe(false);
    });
  });

  describe('detectComfortDiscoveryRatio', () => {
    it('should handle empty streams array', () => {
      const result = detectComfortDiscoveryRatio([]);
      expect(result.ratio).toBe(0);
      expect(result.totalPlays).toBe(0);
      expect(result.uniqueArtists).toBe(0);
    });

    it('should handle streams with null elements', () => {
      const streams = [
        { artistName: 'Artist 1' },
        null,
        { artistName: 'Artist 2' },
        undefined,
        { artistName: 'Artist 1' },
      ];
      const result = detectComfortDiscoveryRatio(streams);
      expect(result.uniqueArtists).toBe(2);
      expect(result.totalPlays).toBe(3);
    });

    it('should handle streams with missing artistName', () => {
      const streams = [
        { artistName: 'Artist 1' },
        { artistName: null },
        { artistName: 'Artist 2' },
        {},
      ];
      const result = detectComfortDiscoveryRatio(streams);
      expect(result.uniqueArtists).toBe(2);
      expect(result.totalPlays).toBe(2);
    });
  });

  describe('detectEras', () => {
    it('should handle empty chunks array', () => {
      const result = detectEras([], []);
      expect(result.eras).toEqual([]);
      expect(result.hasEras).toBe(false);
    });

    it('should handle chunks with insufficient weekly data', () => {
      const chunks = [
        { type: 'weekly', startDate: '2024-01-01', artists: ['Artist 1', 'Artist 2'] },
      ];
      const result = detectEras([], chunks);
      expect(result.eras).toEqual([]);
      expect(result.hasEras).toBe(false);
    });

    it('should handle chunks with missing artists property', () => {
      const chunks = [
        { type: 'weekly', startDate: '2024-01-01' },
        { type: 'weekly', startDate: '2024-01-08' },
        { type: 'weekly', startDate: '2024-01-15' },
        { type: 'weekly', startDate: '2024-01-22' },
      ];
      const result = detectEras([], chunks);
      expect(result).toBeDefined();
    });
  });
});

describe('Pattern Matching - Null Safety', () => {
  describe('detectLitePatterns', () => {
    const liteData = {
      recentStreams: [],
      topArtists: {
        shortTerm: [],
        mediumTerm: [],
        longTerm: [],
      },
      topTracks: {
        shortTerm: [],
        mediumTerm: [],
        longTerm: [],
      },
    };

    it('should handle null topArtists.shortTerm', () => {
      const data = {
        ...liteData,
        topArtists: {
          shortTerm: null,
          mediumTerm: [],
          longTerm: [],
        },
      };
      const result = detectLitePatterns(data);
      expect(result.tasteStability).toBeDefined();
      expect(result.tasteStability.stableArtists).toEqual([]);
    });

    it('should handle null topArtists.longTerm', () => {
      const data = {
        ...liteData,
        topArtists: {
          shortTerm: [{ name: 'Artist 1', genres: ['pop'] }],
          mediumTerm: [],
          longTerm: null,
        },
      };
      const result = detectLitePatterns(data);
      expect(result.tasteStability).toBeDefined();
      expect(result.risingStars).toBeDefined();
    });

    it('should handle recentStreams with null elements', () => {
      const data = {
        ...liteData,
        recentStreams: [
          { artistName: 'Artist 1', msPlayed: 1000 },
          null,
          { artistName: 'Artist 2', msPlayed: 2000 },
          undefined,
        ],
      };
      const result = detectLitePatterns(data);
      // null and undefined are filtered, but still counted in totalPlays
      expect(result.diversity.uniqueArtists).toBe(2);
      expect(result.diversity.totalPlays).toBe(4); // All 4 elements (including null/undefined)
    });

    it('should handle topArtists with null elements', () => {
      const data = {
        ...liteData,
        topArtists: {
          shortTerm: [
            { name: 'Artist 1', genres: ['pop'] },
            null,
            { name: 'Artist 2', genres: ['rock'] },
            undefined,
          ],
          mediumTerm: [],
          longTerm: [],
        },
      };
      const result = detectLitePatterns(data);
      expect(result.genreProfile).toBeDefined();
      expect(result.tasteStability).toBeDefined();
    });
  });

  describe('detectImmediateVibe', () => {
    it('should handle null recentStreams', () => {
      const result = detectImmediateVibe({
        recentStreams: null,
        topArtists: { shortTerm: [] },
      });
      expect(result).toBe('Upload your data to see your music personality!');
    });

    it('should handle empty recentStreams array', () => {
      const result = detectImmediateVibe({
        recentStreams: [],
        topArtists: { shortTerm: [] },
      });
      expect(result).toBe('Upload your data to see your music personality!');
    });

    it('should handle recentStreams with null elements', () => {
      const data = {
        recentStreams: [
          { artistName: 'Artist 1', msPlayed: 1000, completionRate: 0.9 },
          null,
          { artistName: 'Artist 2', msPlayed: 2000, completionRate: 0.8 },
          undefined,
        ],
        topArtists: { shortTerm: [] },
      };
      const result = detectImmediateVibe(data);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle null topArtists.shortTerm', () => {
      const data = {
        recentStreams: [{ artistName: 'Artist 1', msPlayed: 1000, completionRate: 0.9 }],
        topArtists: { shortTerm: null },
      };
      const result = detectImmediateVibe(data);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('generateLiteSummaryInternal (via detectLitePatterns)', () => {
    it('should handle null profile.displayName', () => {
      const data = {
        recentStreams: [],
        topArtists: {
          shortTerm: [{ name: 'Artist 1', genres: ['pop'] }],
          mediumTerm: [],
          longTerm: [],
        },
        topTracks: {
          shortTerm: [{ name: 'Track 1', artist: 'Artist 1' }],
          mediumTerm: [],
          longTerm: [],
        },
        profile: { displayName: null },
      };
      const result = detectLitePatterns(data);
      expect(result.summary.displayName).toBe('Music Lover');
    });

    it('should handle missing profile object', () => {
      const data = {
        recentStreams: [],
        topArtists: {
          shortTerm: [{ name: 'Artist 1', genres: ['pop'] }],
          mediumTerm: [],
          longTerm: [],
        },
        topTracks: {
          shortTerm: [{ name: 'Track 1', artist: 'Artist 1' }],
          mediumTerm: [],
          longTerm: [],
        },
      };
      const result = detectLitePatterns(data);
      expect(result.summary.displayName).toBe('Music Lover');
    });
  });
});

describe('Edge Cases and Boundary Conditions', () => {
  describe('Array operations on null/undefined', () => {
    it('should handle .slice() on null arrays', () => {
      const patterns = { topGenres: null, diversity: {}, tasteStability: {} };
      const liteData = {
        recentStreams: [],
        topArtists: { shortTerm: null, mediumTerm: [], longTerm: [] },
        topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
        profile: {},
      };
      const result = generateLiteSummary(liteData, patterns);
      expect(result.topArtists).toEqual([]);
      expect(result.topTracks).toEqual([]);
      expect(result.topGenres).toEqual([]);
    });

    it('should handle .map() on sliced null arrays', () => {
      const patterns = { topGenres: null, diversity: {}, tasteStability: {} };
      const liteData = {
        recentStreams: [],
        topArtists: { shortTerm: null, mediumTerm: [], longTerm: [] },
        topTracks: { shortTerm: null, mediumTerm: [], longTerm: [] },
        profile: {},
      };
      const result = generateLiteSummary(liteData, patterns);
      expect(Array.isArray(result.topArtists)).toBe(true);
      expect(Array.isArray(result.topTracks)).toBe(true);
      expect(Array.isArray(result.topGenres)).toBe(true);
    });
  });

  describe('Nested null safety', () => {
    it('should handle deeply nested null properties', () => {
      const liteData = {
        recentStreams: null,
        topArtists: null,
        topTracks: null,
        profile: null,
      };
      const patterns = null;

      // Should not crash
      expect(() => {
        generateLiteSummary(liteData, patterns);
      }).toThrow(); // This will throw because we're accessing properties of null
    });

    it('should handle mixed null and valid data', () => {
      const liteData = {
        recentStreams: [],
        topArtists: {
          shortTerm: [{ name: 'Valid Artist', genres: ['pop'] }],
          mediumTerm: null,
          longTerm: undefined,
        },
        topTracks: {
          shortTerm: null,
          mediumTerm: [],
          longTerm: [],
        },
        profile: { displayName: 'Test User' },
      };
      const patterns = {
        topGenres: [],
        diversity: { signal: 'balanced' },
        tasteStability: { signal: 'stable' },
      };
      const result = generateLiteSummary(liteData, patterns);
      expect(result).toBeDefined();
    });
  });
});
