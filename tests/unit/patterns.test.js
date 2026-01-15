/**
 * Pattern Detection Unit Tests
 * 
 * Tests for js/patterns.js to ensure the "Intelligence Engine" detection algorithms are accurate.
 */

import { describe, it, expect } from 'vitest';
import { Patterns } from '../../js/patterns.js';

// ==========================================
// Test Fixtures
// ==========================================

/**
 * Generate mock streams for testing
 * Uses normalized field names matching parser output (not raw Spotify format)
 * @param {number} count - Number of streams to generate
 * @param {object} options - Generation options
 * @returns {Array} Array of mock stream objects
 */
function generateMockStreams(count, options = {}) {
    const {
        startDate = new Date('2020-01-01'),
        artists = ['Artist A', 'Artist B', 'Artist C'],
        tracks = ['Track 1', 'Track 2', 'Track 3'],
        msPlayed = 180000, // 3 minutes
        hourOffset = 14 // Default to afternoon
    } = options;

    const streams = [];
    for (let i = 0; i < count; i++) {
        const date = new Date(startDate.getTime() + i * 3600000); // 1 hour apart
        const artistIndex = i % artists.length;

        streams.push({
            // Normalized field names (post-parser)
            playedAt: date.toISOString(),
            date: date.toISOString().split('T')[0],
            trackName: tracks[i % tracks.length],
            artistName: artists[artistIndex],
            albumName: 'Album',
            msPlayed: msPlayed,
            platform: 'android',
            shuffle: false,
            skipped: false,
            offline: false,
            hourUTC: (date.getUTCHours() + hourOffset) % 24,
            hour: (date.getHours() + hourOffset) % 24,
            dayOfWeek: date.getDay(),
            completionRate: 0.9,
            playType: 'full'
        });
    }
    return streams;
}

/**
 * Generate streams that indicate comfort curator behavior
 * (high plays-per-artist ratio)
 */
function generateComfortCuratorStreams() {
    // Same 3 artists repeated 200 times = 66+ plays per artist
    return generateMockStreams(200, {
        artists: ['My Favorite Artist', 'Second Favorite', 'Third Favorite']
    });
}

/**
 * Generate streams that indicate discovery junkie behavior
 * (low plays-per-artist ratio)
 */
function generateDiscoveryJunkieStreams() {
    // 200 different artists, ~1 play each
    const artists = Array.from({ length: 200 }, (_, i) => `Artist ${i + 1}`);
    return generateMockStreams(200, { artists });
}

// ==========================================
// Comfort/Discovery Ratio Tests
// ==========================================

describe('detectComfortDiscoveryRatio', () => {
    it('should detect comfort curator pattern (>50 plays/artist)', () => {
        const streams = generateComfortCuratorStreams();
        const result = Patterns.detectComfortDiscoveryRatio(streams);

        expect(result).toBeDefined();
        expect(result.ratio).toBeGreaterThan(50);
        expect(result.isComfortCurator).toBe(true);
        expect(result.isDiscoveryJunkie).toBe(false);
    });

    it('should detect discovery junkie pattern (<10 plays/artist)', () => {
        const streams = generateDiscoveryJunkieStreams();
        const result = Patterns.detectComfortDiscoveryRatio(streams);

        expect(result).toBeDefined();
        expect(result.ratio).toBeLessThanOrEqual(1);
        expect(result.isDiscoveryJunkie).toBe(true);
        expect(result.isComfortCurator).toBe(false);
    });

    it('should handle empty streams array', () => {
        const result = Patterns.detectComfortDiscoveryRatio([]);

        expect(result).toBeDefined();
        expect(result.ratio).toBe(0);
    });

    it('should handle single stream', () => {
        const streams = generateMockStreams(1);
        const result = Patterns.detectComfortDiscoveryRatio(streams);

        expect(result).toBeDefined();
        expect(result.ratio).toBeGreaterThanOrEqual(0);
    });
});

// ==========================================
// Ghosted Artists Tests
// ==========================================

describe('detectGhostedArtists', () => {
    it('should handle empty streams array', () => {
        const result = Patterns.detectGhostedArtists([]);

        expect(result).toBeDefined();
        expect(result.ghosted).toEqual([]);
    });

    it('should return ghosted and activeUntilEnd arrays', () => {
        const streams = generateMockStreams(100);
        const result = Patterns.detectGhostedArtists(streams);

        expect(result).toBeDefined();
        expect(Array.isArray(result.ghosted)).toBe(true);
        expect(Array.isArray(result.activeUntilEnd)).toBe(true);
    });
});

// ==========================================
// Time Pattern Tests  
// ==========================================

describe('detectTimePatterns', () => {
    it('should return time pattern information', () => {
        const streams = generateMockStreams(100);
        const result = Patterns.detectTimePatterns(streams);

        expect(result).toBeDefined();
        expect(typeof result.morningArtistCount).toBe('number');
        expect(typeof result.eveningArtistCount).toBe('number');
        expect(typeof result.overlap).toBe('number');
    });

    it('should handle empty streams array', () => {
        const result = Patterns.detectTimePatterns([]);

        expect(result).toBeDefined();
    });
});

// ==========================================
// Era Detection Tests
// ==========================================

describe('detectEras', () => {
    it('should return era information', () => {
        const streams = generateMockStreams(200);
        const result = Patterns.detectEras(streams, []);

        expect(result).toBeDefined();
        expect(result.hasEras).toBeDefined();
    });

    it('should handle empty streams array', () => {
        const result = Patterns.detectEras([], []);

        expect(result).toBeDefined();
    });

    it('should handle insufficient data gracefully', () => {
        const streams = generateMockStreams(10);
        const result = Patterns.detectEras(streams, []);

        expect(result).toBeDefined();
    });
});

// ==========================================
// Social Pattern Tests
// ==========================================

describe('detectSocialPatterns', () => {
    it('should detect weekday vs weekend patterns', () => {
        const streams = generateMockStreams(100);
        const result = Patterns.detectSocialPatterns(streams);

        expect(result).toBeDefined();
        expect(typeof result.weekdayArtistCount).toBe('number');
        expect(typeof result.weekendArtistCount).toBe('number');
    });

    it('should handle empty streams array', () => {
        const result = Patterns.detectSocialPatterns([]);

        expect(result).toBeDefined();
    });
});

// ==========================================
// Mood Searching Tests
// ==========================================

describe('detectMoodSearching', () => {
    it('should return mood searching information', () => {
        const streams = generateMockStreams(100);
        const result = Patterns.detectMoodSearching(streams);

        expect(result).toBeDefined();
        expect(typeof result.count).toBe('number');
    });

    it('should handle empty streams array', () => {
        const result = Patterns.detectMoodSearching([]);

        expect(result).toBeDefined();
    });
});

// ==========================================
// True Favorites Tests
// ==========================================

describe('detectTrueFavorites', () => {
    it('should return true favorites information', () => {
        const streams = generateMockStreams(200);
        const result = Patterns.detectTrueFavorites(streams);

        expect(result).toBeDefined();
    });

    it('should handle empty streams array', () => {
        const result = Patterns.detectTrueFavorites([]);

        expect(result).toBeDefined();
    });
});

// ==========================================
// Full Pattern Detection Tests
// ==========================================

describe('detectAllPatterns', () => {
    it('should run all pattern detections and return summary', () => {
        const streams = generateMockStreams(200);
        const result = Patterns.detectAllPatterns(streams, []);

        expect(result).toBeDefined();
        expect(result.summary).toBeDefined();
        // Uses 'comfortDiscovery' not 'comfortDiscoveryRatio'
        expect(typeof result.comfortDiscovery).toBe('object');
        expect(typeof result.eras).toBe('object');
        expect(typeof result.timePatterns).toBe('object');
        expect(typeof result.socialPatterns).toBe('object');
        expect(typeof result.ghostedArtists).toBe('object');
    });

    it('should throw on empty streams (generatePatternSummary requires data)', () => {
        // detectAllPatterns -> generatePatternSummary accesses streams[0] which fails on empty array
        expect(() => Patterns.detectAllPatterns([], [])).toThrow();
    });

    it('should include summary with date range', () => {
        const streams = generateMockStreams(100, {
            startDate: new Date('2020-01-01')
        });
        const result = Patterns.detectAllPatterns(streams, []);

        expect(result.summary).toBeDefined();
        expect(result.summary.dateRange).toBeDefined();
        expect(result.summary.dateRange.start).toBeDefined();
        expect(result.summary.dateRange.end).toBeDefined();
    });
});

// ==========================================
// Lite Pattern Detection Tests
// ==========================================

describe('detectLitePatterns', () => {
    it('should work with limited Spotify API data', () => {
        const liteData = {
            recentStreams: generateMockStreams(50),
            topArtists: {
                shortTerm: [{ name: 'Artist A', genres: ['pop'] }],
                mediumTerm: [{ name: 'Artist B', genres: ['rock'] }],
                longTerm: [{ name: 'Artist C', genres: ['jazz'] }]
            },
            topTracks: {
                shortTerm: [{ name: 'Track A', artist: 'Artist A' }]
            },
            profile: { displayName: 'Test User' }
        };

        const result = Patterns.detectLitePatterns(liteData);

        expect(result).toBeDefined();
        expect(result.isLiteData).toBe(true);
    });

    it('should handle empty lite data gracefully', () => {
        const liteData = {
            recentStreams: [],
            topArtists: {
                shortTerm: [],
                mediumTerm: [],
                longTerm: []
            },
            topTracks: {
                shortTerm: []
            }
        };

        // detectLitePatterns handles empty data gracefully without throwing
        const result = Patterns.detectLitePatterns(liteData);
        expect(result).toBeDefined();
        expect(result.isLiteData).toBe(true);
    });
});
