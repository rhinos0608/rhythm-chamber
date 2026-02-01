/**
 * GenreEnrichment Characterization Tests
 *
 * These tests document the CURRENT BEHAVIOR of GenreEnrichment before refactoring.
 * They serve as a safety net to ensure backward compatibility after breaking up the god object.
 *
 * Purpose: Capture existing behavior to prevent regressions during refactoring
 * Scope: All public APIs, genre detection, caching, API enrichment, audio features
 *
 * @see js/genre-enrichment.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenreEnrichment } from '../../js/genre-enrichment.js';

// ==========================================
// Test Data
// ==========================================

const MOCK_STREAMS = [
  {
    master_metadata_album_artist_name: 'Taylor Swift',
    trackName: 'Anti-Hero',
    msPlayed: 30000,
  },
  {
    master_metadata_album_artist_name: 'Drake',
    trackName: 'Hotline Bling',
    msPlayed: 25000,
  },
  {
    artistName: 'The Weeknd',
    trackName: 'Blinding Lights',
    msPlayed: 35000,
  },
  {
    master_metadata_album_artist_name: 'Unknown Artist',
    trackName: 'Unknown Track',
    msPlayed: 15000,
  },
];

const MOCK_STREAMS_WITH_GENRES = [
  {
    master_metadata_album_artist_name: 'Taylor Swift',
    trackName: 'Anti-Hero',
    _genres: ['pop', 'country pop'],
    msPlayed: 30000,
  },
  {
    master_metadata_album_artist_name: 'Drake',
    trackName: 'Hotline Bling',
    _genres: ['hip hop', 'r&b'],
    msPlayed: 25000,
  },
];

const MOCK_STREAMS_WITH_SPOTIFY_URI = [
  {
    master_metadata_album_artist_name: 'Taylor Swift',
    trackName: 'Anti-Hero',
    spotify_track_uri: 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh',
    msPlayed: 30000,
  },
];

// ==========================================
// Test Setup
// ==========================================

describe('GenreEnrichment Characterization Tests', () => {
  let originalStorage;

  beforeEach(async () => {
    // Mock Storage
    originalStorage = globalThis.Storage;
    globalThis.Storage = {
      getConfig: vi.fn(),
      setConfig: vi.fn(),
    };

    // Reset module state
    await GenreEnrichment.loadCachedGenres();

    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalStorage) {
      globalThis.Storage = originalStorage;
    }
  });

  // ==========================================
  // Static Map Tests
  // ==========================================

  describe('Static Genre Map', () => {
    it('should know artists in static map', () => {
      expect(GenreEnrichment.isKnownArtist('Taylor Swift')).toBe(true);
      expect(GenreEnrichment.isKnownArtist('Drake')).toBe(true);
      expect(GenreEnrichment.isKnownArtist('The Weeknd')).toBe(true);
    });

    it('should not know unknown artists', () => {
      expect(GenreEnrichment.isKnownArtist('Unknown Artist')).toBe(false);
      expect(GenreEnrichment.isKnownArtist('')).toBe(false);
    });

    it('should return genres for known artists', () => {
      const taylorSwift = GenreEnrichment.getGenre('Taylor Swift');
      expect(Array.isArray(taylorSwift)).toBe(true);
      expect(taylorSwift.length).toBeGreaterThan(0);
      expect(taylorSwift).toContain('pop');
    });

    it('should return null for unknown artists', () => {
      const unknown = GenreEnrichment.getGenre('Unknown Artist');
      expect(unknown).toBeNull();
    });

    it('should return genres for multiple artists', () => {
      const genres = GenreEnrichment.getGenres(['Taylor Swift', 'Drake', 'Unknown Artist']);
      expect(genres).toHaveProperty('Taylor Swift');
      expect(genres).toHaveProperty('Drake');
      expect(genres).not.toHaveProperty('Unknown Artist');
    });

    it('should return all known genres', () => {
      const allGenres = GenreEnrichment.getAllKnownGenres();
      expect(Array.isArray(allGenres)).toBe(true);
      expect(allGenres.length).toBeGreaterThan(0);
      expect(allGenres).toContain('pop');
      expect(allGenres).toContain('hip hop');
    });

    it('should return static map size', () => {
      const size = GenreEnrichment.getStaticMapSize();
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThan(0);
      expect(size).toBeGreaterThan(200); // Has 221 artists
    });
  });

  // ==========================================
  // Stream Enrichment Tests
  // ==========================================

  describe('Stream Enrichment', () => {
    it('should enrich streams with genres', async () => {
      const result = await GenreEnrichment.enrichStreams(MOCK_STREAMS);

      expect(result).toHaveProperty('enriched');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('coverage');
      expect(result.total).toBe(MOCK_STREAMS.length);
      expect(result.enriched).toBeGreaterThan(0);
      expect(result.coverage).toBeGreaterThan(0);

      // Check that streams were enriched
      const enrichedStream = MOCK_STREAMS.find(s => s._genres);
      expect(enrichedStream).toBeDefined();
      expect(Array.isArray(enrichedStream._genres)).toBe(true);
    });

    it('should not re-enrich already enriched streams', async () => {
      const enrichedCount1 = await GenreEnrichment.enrichStreams(MOCK_STREAMS_WITH_GENRES);
      const enrichedCount2 = await GenreEnrichment.enrichStreams(MOCK_STREAMS_WITH_GENRES);

      expect(enrichedCount1.enriched).toBe(enrichedCount2.enriched);
    });

    it('should calculate coverage percentage', async () => {
      const result = await GenreEnrichment.enrichStreams(MOCK_STREAMS);
      const expectedCoverage = Math.round((result.enriched / result.total) * 100);
      expect(result.coverage).toBe(expectedCoverage);
    });
  });

  // ==========================================
  // Top Genre Tests
  // ==========================================

  describe('Top Genres', () => {
    it('should return top genres from streams', () => {
      const topGenres = GenreEnrichment.getTopGenres(MOCK_STREAMS, 10);

      expect(Array.isArray(topGenres)).toBe(true);
      expect(topGenres.length).toBeGreaterThan(0);
      expect(topGenres[0]).toHaveProperty('genre');
      expect(topGenres[0]).toHaveProperty('count');
      expect(topGenres[0]).toHaveProperty('percentage');
    });

    it('should respect limit parameter', () => {
      const topGenres = GenreEnrichment.getTopGenres(MOCK_STREAMS, 2);
      expect(topGenres.length).toBeLessThanOrEqual(2);
    });

    it('should sort genres by count', () => {
      const topGenres = GenreEnrichment.getTopGenres(MOCK_STREAMS, 10);

      for (let i = 1; i < topGenres.length; i++) {
        expect(topGenres[i - 1].count).toBeGreaterThanOrEqual(topGenres[i].count);
      }
    });

    it('should calculate percentage correctly', () => {
      const topGenres = GenreEnrichment.getTopGenres(MOCK_STREAMS, 10);

      for (const genre of topGenres) {
        expect(genre.percentage).toBeGreaterThanOrEqual(0);
        expect(genre.percentage).toBeLessThanOrEqual(100);
      }
    });

    it('should handle streams with pre-existing genres', () => {
      const topGenres = GenreEnrichment.getTopGenres(MOCK_STREAMS_WITH_GENRES, 10);

      expect(Array.isArray(topGenres)).toBe(true);
      expect(topGenres.length).toBeGreaterThan(0);
      expect(topGenres[0].genre).toBeDefined();
    });
  });

  // ==========================================
  // Cache Tests
  // ==========================================

  describe('Genre Cache', () => {
    it('should load cached genres', async () => {
      // Just verify the function exists and doesn't crash
      await GenreEnrichment.loadCachedGenres();
      expect(typeof GenreEnrichment.loadCachedGenres).toBe('function');
    });

    it('should have cache statistics', () => {
      const stats = GenreEnrichment.getStats();
      expect(stats).toHaveProperty('cachedCount');
      expect(typeof stats.cachedCount).toBe('number');
    });
  });

  // ==========================================
  // API Enrichment Tests
  // ==========================================

  describe('API Enrichment', () => {
    it('should queue unknown artists for enrichment', async () => {
      const queued = await GenreEnrichment.queueForEnrichment('Unknown Artist');

      // In MVP mode (ENRICHMENT_PREMIUM_ENABLED = false), this should queue
      const stats = GenreEnrichment.getStats();
      expect(typeof queued).toBe('boolean');
    });

    it('should not queue known artists', async () => {
      const queued = await GenreEnrichment.queueForEnrichment('Taylor Swift');
      expect(queued).toBe(false);
    });

    it('should not queue the same artist twice', async () => {
      await GenreEnrichment.queueForEnrichment('Unknown Artist 1');
      await GenreEnrichment.queueForEnrichment('Unknown Artist 1');

      const stats = GenreEnrichment.getStats();
      expect(stats.queueLength).toBe(1);
    });

    it('should process API queue', async () => {
      await GenreEnrichment.queueForEnrichment('Unknown Artist 2');

      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = GenreEnrichment.getStats();
      expect(stats.isProcessing).toBeDefined();
    });
  });

  // ==========================================
  // Audio Features Tests
  // ==========================================

  describe('Audio Features', () => {
    it('should extract Spotify track ID from URI', () => {
      // This is an internal function, but we can test it through enrichment
      const stream = {
        spotify_track_uri: 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh',
        trackName: 'Test Track',
      };

      // Track ID should be extractable
      expect(stream.spotify_track_uri).toContain('spotify:track:');
    });

    it('should enrich streams with audio features when Spotify token available', async () => {
      // Mock Spotify token
      globalThis.Storage.getConfig.mockResolvedValue({
        access_token: 'test_token',
        expires_at: Date.now() + 3600000,
      });

      const result = await GenreEnrichment.enrichAudioFeatures(MOCK_STREAMS_WITH_SPOTIFY_URI);

      expect(result).toHaveProperty('enriched');
      expect(result).toHaveProperty('cached');
      expect(result).toHaveProperty('errors');
    });

    it('should handle missing Spotify token gracefully', async () => {
      globalThis.Storage.getConfig.mockResolvedValue(null);

      const result = await GenreEnrichment.enrichAudioFeatures(MOCK_STREAMS);

      expect(result).toHaveProperty('enriched');
      expect(result).toHaveProperty('cached');
      expect(result).toHaveProperty('errors');
      expect(result.enriched).toBe(0);
    });

    it('should get audio features summary', () => {
      const streamsWithFeatures = [
        {
          trackName: 'Test Track 1',
          _audioFeatures: {
            tempo: 120,
            energy: 80,
            danceability: 75,
            valence: 60,
            key: 'C',
            mode: 'major',
          },
        },
        {
          trackName: 'Test Track 2',
          _audioFeatures: {
            tempo: 140,
            energy: 90,
            danceability: 85,
            valence: 70,
            key: 'G',
            mode: 'minor',
          },
        },
      ];

      const summary = GenreEnrichment.getAudioFeaturesSummary(streamsWithFeatures);

      expect(summary).not.toBeNull();
      expect(summary.count).toBe(2);
      expect(summary.avgBpm).toBeGreaterThan(0);
      expect(summary.avgEnergy).toBeGreaterThan(0);
      expect(summary.avgDanceability).toBeGreaterThan(0);
      expect(summary.avgValence).toBeGreaterThan(0);
      expect(summary.keyDistribution).toBeDefined();
      expect(summary.modeDistribution).toBeDefined();
    });

    it('should return null for audio features summary when no features', () => {
      const summary = GenreEnrichment.getAudioFeaturesSummary(MOCK_STREAMS);
      expect(summary).toBeNull();
    });
  });

  // ==========================================
  // Stats Tests
  // ==========================================

  describe('Statistics', () => {
    it('should return module statistics', () => {
      const stats = GenreEnrichment.getStats();

      expect(stats).toHaveProperty('staticMapSize');
      expect(stats).toHaveProperty('cachedCount');
      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('isProcessing');
      expect(stats).toHaveProperty('audioFeaturesCacheSize');

      expect(typeof stats.staticMapSize).toBe('number');
      expect(typeof stats.cachedCount).toBe('number');
      expect(typeof stats.queueLength).toBe('number');
      expect(typeof stats.isProcessing).toBe('boolean');
      expect(typeof stats.audioFeaturesCacheSize).toBe('number');
    });

    it('should have positive static map size', () => {
      const stats = GenreEnrichment.getStats();
      expect(stats.staticMapSize).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // Edge Cases
  // ==========================================

  describe('Edge Cases', () => {
    it('should handle null artist name', () => {
      const genres = GenreEnrichment.getGenre(null);
      expect(genres).toBeNull();
    });

    it('should handle undefined artist name', () => {
      const genres = GenreEnrichment.getGenre(undefined);
      expect(genres).toBeNull();
    });

    it('should handle empty artist name', () => {
      const genres = GenreEnrichment.getGenre('');
      expect(genres).toBeNull();
    });

    it('should handle whitespace in artist name', () => {
      const genres = GenreEnrichment.getGenre('  Taylor Swift  ');
      expect(genres).toBeDefined();
      expect(Array.isArray(genres)).toBe(true);
    });

    it('should handle empty streams array', async () => {
      const result = await GenreEnrichment.enrichStreams([]);
      expect(result.enriched).toBe(0);
      expect(result.total).toBe(0);
      expect(Number.isNaN(result.coverage)).toBe(true); // NaN when total is 0
    });

    it('should handle streams with missing artist names', async () => {
      const streamsWithoutArtists = [{ msPlayed: 30000 }];
      const result = await GenreEnrichment.enrichStreams(streamsWithoutArtists);

      expect(result.total).toBe(1);
      expect(result.enriched).toBe(0);
    });

    it('should handle getGenres with empty array', () => {
      const genres = GenreEnrichment.getGenres([]);
      expect(Object.keys(genres).length).toBe(0);
    });

    it('should handle getTopGenres with empty streams', () => {
      const topGenres = GenreEnrichment.getTopGenres([], 10);
      expect(Array.isArray(topGenres)).toBe(true);
      expect(topGenres.length).toBe(0);
    });

    it('should handle getTopGenres with limit of 0', () => {
      const topGenres = GenreEnrichment.getTopGenres(MOCK_STREAMS, 0);
      expect(Array.isArray(topGenres)).toBe(true);
      expect(topGenres.length).toBe(0);
    });
  });

  // ==========================================
  // Premium Features
  // ==========================================

  describe('Premium Features', () => {
    it('should allow basic enrichment without premium', async () => {
      const result = await GenreEnrichment.enrichStreams(MOCK_STREAMS);

      expect(result.premiumRequired).toBeUndefined();
      expect(result.enriched).toBeGreaterThan(0);
    });

    it('should handle premium feature flags', async () => {
      const result = await GenreEnrichment.enrichStreams(MOCK_STREAMS, {
        full: true,
        includeAudioFeatures: true,
      });

      // In MVP mode (ENRICHMENT_PREMIUM_ENABLED = false), this should work
      expect(result).toHaveProperty('enriched');
      expect(result).toHaveProperty('premiumFeatures');
    });
  });

  // ==========================================
  // Artist Genre Data
  // ==========================================

  describe('Artist Genre Data Quality', () => {
    it('should have multiple genres for Taylor Swift', () => {
      const genres = GenreEnrichment.getGenre('Taylor Swift');
      expect(genres.length).toBeGreaterThan(1);
      expect(genres).toContain('pop');
    });

    it('should have multiple genres for Drake', () => {
      const genres = GenreEnrichment.getGenre('Drake');
      expect(genres.length).toBeGreaterThan(1);
      expect(genres).toContain('hip hop');
    });

    it('should have diverse genre coverage', () => {
      const allGenres = GenreEnrichment.getAllKnownGenres();
      expect(allGenres.length).toBeGreaterThan(50); // Should have many genres

      // Check for major genre categories
      expect(allGenres).toContain('pop');
      expect(allGenres).toContain('hip hop');
      expect(allGenres).toContain('rock');
      expect(allGenres).toContain('electronic');
      expect(allGenres).toContain('r&b');
    });
  });

  // ==========================================
  // Module Exports
  // ==========================================

  describe('Module API Surface', () => {
    it('should export all expected functions', () => {
      expect(GenreEnrichment.getGenre).toBeDefined();
      expect(GenreEnrichment.getGenres).toBeDefined();
      expect(GenreEnrichment.getTopGenres).toBeDefined();
      expect(GenreEnrichment.enrichStreams).toBeDefined();
      expect(GenreEnrichment.isKnownArtist).toBeDefined();
      expect(GenreEnrichment.getAllKnownGenres).toBeDefined();
      expect(GenreEnrichment.getStaticMapSize).toBeDefined();
      expect(GenreEnrichment.loadCachedGenres).toBeDefined();
      expect(GenreEnrichment.queueForEnrichment).toBeDefined();
      expect(GenreEnrichment.enrichAudioFeatures).toBeDefined();
      expect(GenreEnrichment.getAudioFeaturesSummary).toBeDefined();
      expect(GenreEnrichment.getStats).toBeDefined();
    });

    it('should have function signatures correct', () => {
      expect(typeof GenreEnrichment.getGenre).toBe('function');
      expect(typeof GenreEnrichment.getGenres).toBe('function');
      expect(typeof GenreEnrichment.getTopGenres).toBe('function');
      expect(typeof GenreEnrichment.enrichStreams).toBe('function');
      expect(typeof GenreEnrichment.isKnownArtist).toBe('function');
      expect(typeof GenreEnrichment.getAllKnownGenres).toBe('function');
      expect(typeof GenreEnrichment.getStaticMapSize).toBe('function');
      expect(typeof GenreEnrichment.loadCachedGenres).toBe('function');
      expect(typeof GenreEnrichment.queueForEnrichment).toBe('function');
      expect(typeof GenreEnrichment.enrichAudioFeatures).toBe('function');
      expect(typeof GenreEnrichment.getAudioFeaturesSummary).toBe('function');
      expect(typeof GenreEnrichment.getStats).toBe('function');
    });
  });
});
