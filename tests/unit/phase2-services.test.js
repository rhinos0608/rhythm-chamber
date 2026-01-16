/**
 * Unit Tests for Phase 2 Services
 * 
 * Tests for Collaborative Analysis, Temporal Analysis, and Playlist Generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../js/services/event-bus.js';
import { PatternComparison } from '../../js/services/pattern-comparison.js';
import { TemporalAnalysis } from '../../js/services/temporal-analysis.js';
import { PlaylistGenerator } from '../../js/services/playlist-generator.js';

// ==========================================
// Mock Data
// ==========================================

const mockStreams = [
    { ts: '2023-01-15T09:30:00Z', master_metadata_track_name: 'Song A', master_metadata_album_artist_name: 'Artist 1', ms_played: 180000 },
    { ts: '2023-01-15T10:00:00Z', master_metadata_track_name: 'Song B', master_metadata_album_artist_name: 'Artist 2', ms_played: 200000 },
    { ts: '2023-06-15T21:00:00Z', master_metadata_track_name: 'Song C', master_metadata_album_artist_name: 'Artist 1', ms_played: 180000 },
    { ts: '2024-01-15T14:00:00Z', master_metadata_track_name: 'Song D', master_metadata_album_artist_name: 'Artist 3', ms_played: 220000 },
    { ts: '2024-01-15T23:30:00Z', master_metadata_track_name: 'Song E', master_metadata_album_artist_name: 'Artist 1', ms_played: 180000 },
];

const mockProfile1 = {
    personality: { type: 'emotional_archaeologist', name: 'Emotional Archaeologist', traits: { nostalgia: 80, discovery: 40 } },
    patterns: { timeOfDay: { peakHour: 21 }, comfortDiscovery: { ratio: 60 } },
    summary: { totalStreams: 5000 },
    streams: mockStreams
};

const mockProfile2 = {
    personality: { type: 'genre_tourist', name: 'Genre Tourist', traits: { nostalgia: 30, discovery: 90 } },
    patterns: { timeOfDay: { peakHour: 14 }, comfortDiscovery: { ratio: 25 } },
    summary: { totalStreams: 8000 },
    streams: [
        { ts: '2023-01-15', master_metadata_album_artist_name: 'Artist 1' },
        { ts: '2023-02-15', master_metadata_album_artist_name: 'Artist 4' },
    ]
};

// ==========================================
// Setup
// ==========================================

beforeEach(() => {
    EventBus.clearAll();
});

afterEach(() => {
    EventBus.clearAll();
});

// ==========================================
// Pattern Comparison Tests
// ==========================================

describe('PatternComparison', () => {
    it('should compare two profiles and return compatibility', () => {
        const result = PatternComparison.compareProfiles(mockProfile1, mockProfile2);

        expect(result.overallCompatibility).toBeGreaterThanOrEqual(0);
        expect(result.overallCompatibility).toBeLessThanOrEqual(100);
        expect(result.breakdown).toHaveProperty('personality');
        expect(result.breakdown).toHaveProperty('patterns');
    });

    it('should find shared artists between profiles', () => {
        const shared = PatternComparison.getSharedArtists(mockProfile1, mockProfile2);

        expect(Array.isArray(shared)).toBe(true);
        expect(shared).toContain('Artist 1');
    });

    it('should compare personalities correctly', () => {
        const result = PatternComparison.comparePersonalities(
            mockProfile1.personality,
            mockProfile2.personality
        );

        expect(result.sameType).toBe(false);
        expect(result.profile1Type).toBe('Emotional Archaeologist');
        expect(result.profile2Type).toBe('Genre Tourist');
        expect(result.insight).toBeTruthy();
    });

    it('should compare patterns correctly', () => {
        const result = PatternComparison.comparePatterns(
            mockProfile1.patterns,
            mockProfile2.patterns
        );

        expect(result.timeOfDay).toHaveProperty('similarity');
        expect(result.comfortDiscovery).toHaveProperty('similarity');
        expect(result.overallSimilarity).toBeGreaterThanOrEqual(0);
    });

    it('should throw when profiles are missing', () => {
        expect(() => PatternComparison.compareProfiles(null, mockProfile2))
            .toThrow('Both profiles required');
    });
});

// ==========================================
// Temporal Analysis Tests
// ==========================================

describe('TemporalAnalysis', () => {
    it('should calculate taste evolution over years', () => {
        const result = TemporalAnalysis.getTasteEvolution(mockStreams);

        expect(result.years).toBeDefined();
        expect(result.evolution).toBeDefined();
        expect(result.evolution.length).toBeGreaterThan(0);
        expect(result.evolution[0]).toHaveProperty('year');
        expect(result.evolution[0]).toHaveProperty('totalStreams');
        expect(result.evolution[0]).toHaveProperty('uniqueArtists');
    });

    it('should calculate diversity trend', () => {
        const result = TemporalAnalysis.getDiversityTrend(mockStreams);

        expect(result.trend).toBeDefined();
        expect(result.averageDiversity).toBeGreaterThanOrEqual(0);
        expect(result.trendDirection).toMatch(/increasing|decreasing|stable/);
        expect(result.insight).toBeTruthy();
    });

    it('should predict future discoveries', () => {
        const result = TemporalAnalysis.getDiscoveryPrediction(mockStreams);

        expect(result.prediction).toBeDefined();
        expect(result.prediction.length).toBe(3); // 3 months prediction
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.totalArtistsDiscovered).toBeGreaterThan(0);
    });

    it('should compare years', () => {
        const result = TemporalAnalysis.getYearComparison(mockStreams, 2023, 2024);

        expect(result.year1.year).toBe(2023);
        expect(result.year2.year).toBe(2024);
        expect(result.changes).toHaveProperty('streamsChange');
    });

    it('should handle empty streams gracefully', () => {
        const result = TemporalAnalysis.getTasteEvolution([]);

        expect(result.years).toEqual([]);
        expect(result.evolution).toEqual([]);
    });

    it('should group by year correctly', () => {
        const byYear = TemporalAnalysis.groupByYear(mockStreams);

        expect(byYear['2023']).toBeDefined();
        expect(byYear['2024']).toBeDefined();
        expect(byYear['2023'].length).toBe(3);
        expect(byYear['2024'].length).toBe(2);
    });
});

// ==========================================
// Playlist Generator Tests
// ==========================================

describe('PlaylistGenerator', () => {
    it('should create era-based playlist', () => {
        const result = PlaylistGenerator.createPlaylistFromEra(mockStreams, {
            startDate: '2023-01-01',
            endDate: '2023-12-31'
        });

        expect(result.type).toBe('era');
        expect(result.name).toContain('Era');
        expect(result.tracks).toBeDefined();
        expect(result.tracks.length).toBeGreaterThan(0);
        expect(result.metadata.startDate).toBe('2023-01-01');
    });

    it('should create energy-based playlist', () => {
        const result = PlaylistGenerator.createEnergyPlaylist(mockStreams, {
            energy: 'high'
        });

        expect(result.type).toBe('energy');
        expect(result.name).toContain('High Energy');
        expect(result.tracks).toBeDefined();
    });

    it('should suggest new artists', () => {
        const result = PlaylistGenerator.suggestNewArtists(mockStreams);

        expect(result.type).toBe('discovery');
        expect(result.rareArtists).toBeDefined();
        expect(result.basedOnFavorites).toBeDefined();
        expect(result.metadata.totalArtistsInHistory).toBeGreaterThan(0);
    });

    it('should create time machine playlist', () => {
        // Use January 15 since we have data for that
        const testDate = new Date('2023-01-15');
        const result = PlaylistGenerator.createTimeMachinePlaylist(mockStreams, testDate);

        expect(result.type).toBe('time_machine');
        expect(result.name).toContain('January 15');
        expect(result.byYear).toBeDefined();
    });

    it('should throw when era dates are missing', () => {
        expect(() => PlaylistGenerator.createPlaylistFromEra(mockStreams, {}))
            .toThrow('Start and end dates required');
    });

    it('should expose playlist types', () => {
        expect(PlaylistGenerator.PLAYLIST_TYPES).toHaveProperty('ERA');
        expect(PlaylistGenerator.PLAYLIST_TYPES).toHaveProperty('ENERGY');
        expect(PlaylistGenerator.PLAYLIST_TYPES).toHaveProperty('DISCOVERY');
    });
});
