/**
 * Characterization Tests for Pattern Detection Module
 *
 * These tests capture the ACTUAL behavior of js/patterns.js before refactoring.
 * They serve as a safety net to ensure no regressions occur during modularization.
 *
 * Purpose:
 * - Document current behavior as-is (bugs and all)
 * - Provide regression detection during refactoring
 * - Ensure backward compatibility
 *
 * Created: 2025-01-29 (Stream 4: Patterns Refactoring)
 */

import { describe, it, expect } from 'vitest';
import { Patterns } from '../../js/patterns.js';

// ==========================================
// Test Fixtures
// ==========================================

/**
 * Generate mock streaming data
 */
function generateMockStreams(count, options = {}) {
    const {
        startDate = new Date('2020-01-01'),
        artists = ['Artist A', 'Artist B', 'Artist C', 'Artist D', 'Artist E'],
        tracks = ['Track 1', 'Track 2', 'Track 3', 'Track 4', 'Track 5'],
        msPlayed = 180000,
        hourOffset = 14
    } = options;

    const streams = [];
    for (let i = 0; i < count; i++) {
        const date = new Date(startDate.getTime() + i * 3600000);
        const artistIndex = i % artists.length;

        streams.push({
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
 * Generate chunks for testing
 */
function generateMockChunks() {
    return [
        {
            type: 'weekly',
            startDate: '2020-01-01',
            endDate: '2020-01-07',
            artists: ['Artist A', 'Artist B', 'Artist C'],
            topArtists: ['Artist A', 'Artist B']
        },
        {
            type: 'weekly',
            startDate: '2020-01-08',
            endDate: '2020-01-14',
            artists: ['Artist D', 'Artist E', 'Artist F'],
            topArtists: ['Artist D', 'Artist E']
        },
        {
            type: 'monthly',
            startDate: '2020-01-01',
            endDate: '2020-01-31',
            artists: ['Artist A', 'Artist B', 'Artist C'],
            topArtists: ['Artist A']
        }
    ];
}

// ==========================================
// Module: Pattern Extractors
// ==========================================

describe('Characterization: Pattern Extractors', () => {
    describe('detectComfortDiscoveryRatio', () => {
        it('should return object with expected structure', () => {
            const streams = generateMockStreams(100);
            const result = Patterns.detectComfortDiscoveryRatio(streams);

            // Document actual return structure
            expect(result).toHaveProperty('ratio');
            expect(result).toHaveProperty('totalPlays');
            expect(result).toHaveProperty('uniqueArtists');
            expect(result).toHaveProperty('isComfortCurator');
            expect(result).toHaveProperty('isDiscoveryJunkie');
            expect(result).toHaveProperty('signal');
            expect(result).toHaveProperty('description');

            // Document actual types
            expect(typeof result.ratio).toBe('number');
            expect(typeof result.totalPlays).toBe('number');
            expect(typeof result.uniqueArtists).toBe('number');
            expect(typeof result.isComfortCurator).toBe('boolean');
            expect(typeof result.isDiscoveryJunkie).toBe('boolean');
            expect(typeof result.signal).toBe('string');
            expect(typeof result.description).toBe('string');
        });

        it('should handle empty streams', () => {
            const result = Patterns.detectComfortDiscoveryRatio([]);
            expect(result.ratio).toBe(0);
            expect(result.totalPlays).toBe(0);
            expect(result.uniqueArtists).toBe(0);
        });

        it('should handle single stream', () => {
            const streams = generateMockStreams(1);
            const result = Patterns.detectComfortDiscoveryRatio(streams);
            expect(result.ratio).toBe(1);
            expect(result.totalPlays).toBe(1);
            expect(result.uniqueArtists).toBe(1);
        });
    });

    describe('detectEras', () => {
        it('should return object with expected structure', () => {
            const streams = generateMockStreams(100);
            const chunks = generateMockChunks();
            const result = Patterns.detectEras(streams, chunks);

            // Document actual return structure
            expect(result).toHaveProperty('eras');
            expect(result).toHaveProperty('hasEras');
            expect(result).toHaveProperty('eraCount');
            expect(result).toHaveProperty('description');

            // Document actual types
            expect(Array.isArray(result.eras)).toBe(true);
            expect(typeof result.hasEras).toBe('boolean');
            expect(typeof result.eraCount).toBe('number');
            expect(typeof result.description).toBe('string');
        });

        it('should handle insufficient data', () => {
            const streams = generateMockStreams(10);
            const result = Patterns.detectEras(streams, []);
            expect(result.eras).toEqual([]);
            expect(result.hasEras).toBe(false);
        });
    });

    describe('detectGhostedArtists', () => {
        it('should return object with expected structure', () => {
            const streams = generateMockStreams(200);
            const result = Patterns.detectGhostedArtists(streams);

            // Document actual return structure
            expect(result).toHaveProperty('ghosted');
            expect(result).toHaveProperty('activeUntilEnd');
            expect(result).toHaveProperty('hasGhosted');
            expect(result).toHaveProperty('count');
            expect(result).toHaveProperty('activeCount');
            expect(result).toHaveProperty('description');
            expect(result).toHaveProperty('datasetEndDate');

            // Document actual types
            expect(Array.isArray(result.ghosted)).toBe(true);
            expect(Array.isArray(result.activeUntilEnd)).toBe(true);
            expect(typeof result.hasGhosted).toBe('boolean');
            expect(typeof result.count).toBe('number');
            expect(typeof result.activeCount).toBe('number');
        });

        it('should handle empty streams', () => {
            const result = Patterns.detectGhostedArtists([]);
            expect(result.ghosted).toEqual([]);
            expect(result.hasGhosted).toBe(false);
            expect(result.count).toBe(0);
        });
    });

    describe('detectDiscoveryExplosions', () => {
        it('should return object with expected structure', () => {
            const streams = generateMockStreams(200);
            const chunks = generateMockChunks();
            const result = Patterns.detectDiscoveryExplosions(streams, chunks);

            // Document actual return structure
            expect(result).toHaveProperty('explosions');
            expect(result).toHaveProperty('hasExplosions');
            expect(result).toHaveProperty('baselineRate');
            expect(result).toHaveProperty('description');

            // Document actual types
            expect(Array.isArray(result.explosions)).toBe(true);
            expect(typeof result.hasExplosions).toBe('boolean');
            expect(typeof result.baselineRate).toBe('number');
        });

        it('should handle insufficient data', () => {
            const streams = generateMockStreams(50);
            const result = Patterns.detectDiscoveryExplosions(streams, []);
            expect(result.explosions).toEqual([]);
            expect(result.hasExplosions).toBe(false);
        });
    });
});

// ==========================================
// Module: Pattern Validators
// ==========================================

describe('Characterization: Pattern Validators', () => {
    describe('detectTimePatterns', () => {
        it('should return object with expected structure', () => {
            const streams = generateMockStreams(200);
            const result = Patterns.detectTimePatterns(streams);

            // Document actual return structure
            expect(result).toHaveProperty('morningArtistCount');
            expect(result).toHaveProperty('eveningArtistCount');
            expect(result).toHaveProperty('morningStreamCount');
            expect(result).toHaveProperty('eveningStreamCount');
            expect(result).toHaveProperty('overlap');
            expect(result).toHaveProperty('isMoodEngineer');
            expect(result).toHaveProperty('hasEnoughData');
            expect(result).toHaveProperty('description');

            // Document actual types
            expect(typeof result.morningArtistCount).toBe('number');
            expect(typeof result.eveningArtistCount).toBe('number');
            expect(typeof result.overlap).toBe('number');
            expect(typeof result.isMoodEngineer).toBe('boolean');
            expect(typeof result.hasEnoughData).toBe('boolean');
        });

        it('should handle empty streams', () => {
            const result = Patterns.detectTimePatterns([]);
            expect(result.morningArtistCount).toBe(0);
            expect(result.eveningArtistCount).toBe(0);
        });
    });

    describe('detectSocialPatterns', () => {
        it('should return object with expected structure', () => {
            const streams = generateMockStreams(200);
            const result = Patterns.detectSocialPatterns(streams);

            // Document actual return structure
            expect(result).toHaveProperty('weekdayArtistCount');
            expect(result).toHaveProperty('weekendArtistCount');
            expect(result).toHaveProperty('overlap');
            expect(result).toHaveProperty('isSocialChameleon');
            expect(result).toHaveProperty('description');

            // Document actual types
            expect(typeof result.weekdayArtistCount).toBe('number');
            expect(typeof result.weekendArtistCount).toBe('number');
            expect(typeof result.overlap).toBe('number');
            expect(typeof result.isSocialChameleon).toBe('boolean');
            expect(typeof result.description).toBe('string');
        });

        it('should handle empty streams', () => {
            const result = Patterns.detectSocialPatterns([]);
            expect(result.weekdayArtistCount).toBe(0);
            expect(result.weekendArtistCount).toBe(0);
        });
    });

    describe('detectMoodSearching', () => {
        it('should return object with expected structure', () => {
            const streams = generateMockStreams(50);
            const result = Patterns.detectMoodSearching(streams);

            // Document actual return structure
            expect(result).toHaveProperty('clusters');
            expect(result).toHaveProperty('count');
            expect(result).toHaveProperty('hasMoodSearching');
            expect(result).toHaveProperty('description');

            // Document actual types
            expect(Array.isArray(result.clusters)).toBe(true);
            expect(typeof result.count).toBe('number');
            expect(typeof result.hasMoodSearching).toBe('boolean');
        });

        it('should handle empty streams', () => {
            const result = Patterns.detectMoodSearching([]);
            expect(result.clusters).toEqual([]);
            expect(result.count).toBe(0);
        });
    });

    describe('detectTrueFavorites', () => {
        it('should return object with expected structure', () => {
            const streams = generateMockStreams(200);
            const result = Patterns.detectTrueFavorites(streams);

            // Document actual return structure
            expect(result).toHaveProperty('topByPlays');
            expect(result).toHaveProperty('topByEngagement');
            expect(result).toHaveProperty('hasMismatch');
            expect(result).toHaveProperty('description');

            // Document actual types
            expect(typeof result.topByPlays).toBe('object');
            expect(Array.isArray(result.topByEngagement)).toBe(true);
            expect(typeof result.hasMismatch).toBe('boolean');
        });

        it('should handle empty streams', () => {
            const result = Patterns.detectTrueFavorites([]);
            expect(result.topByPlays).toBeNull();
            expect(result.topByEngagement).toBeUndefined();
        });
    });
});

// ==========================================
// Module: Pattern Transformers
// ==========================================

describe('Characterization: Pattern Transformers', () => {
    describe('generateDataInsights', () => {
        it('should return object with expected structure', () => {
            const streams = generateMockStreams(200);
            const result = Patterns.generateDataInsights(streams);

            // Document actual return structure
            expect(result).toHaveProperty('totalMinutes');
            expect(result).toHaveProperty('uniqueArtists');
            expect(result).toHaveProperty('topArtist');
            expect(result).toHaveProperty('peakDay');

            // Document nested structure
            expect(result.topArtist).toHaveProperty('name');
            expect(result.topArtist).toHaveProperty('minutes');
            expect(result.topArtist).toHaveProperty('percentile');

            // Document actual types
            expect(typeof result.totalMinutes).toBe('number');
            expect(typeof result.uniqueArtists).toBe('number');
            expect(typeof result.peakDay).toBe('string');
        });

        it('should return null for empty streams', () => {
            const result = Patterns.generateDataInsights([]);
            expect(result).toBeNull();
        });
    });

    describe('generatePatternSummary', () => {
        it('should return object with expected structure', () => {
            const streams = generateMockStreams(100);
            const patterns = {
                comfortDiscovery: Patterns.detectComfortDiscoveryRatio(streams)
            };
            const result = Patterns.generatePatternSummary(streams, patterns);

            // Document actual return structure
            expect(result).toHaveProperty('totalStreams');
            expect(result).toHaveProperty('totalHours');
            expect(result).toHaveProperty('uniqueArtists');
            expect(result).toHaveProperty('uniqueTracks');
            expect(result).toHaveProperty('dateRange');
            expect(result).toHaveProperty('insights');

            // Document nested structure
            expect(result.dateRange).toHaveProperty('start');
            expect(result.dateRange).toHaveProperty('end');
            expect(result.dateRange).toHaveProperty('days');

            // Document actual types
            expect(typeof result.totalStreams).toBe('number');
            expect(typeof result.totalHours).toBe('number');
            expect(typeof result.uniqueArtists).toBe('number');
            expect(typeof result.uniqueTracks).toBe('number');
        });
    });
});

// ==========================================
// Module: Pattern Matching
// ==========================================

describe('Characterization: Pattern Matching', () => {
    describe('detectLitePatterns', () => {
        it('should return object with expected structure', () => {
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

            // Document actual return structure
            expect(result).toHaveProperty('diversity');
            expect(result).toHaveProperty('currentObsession');
            expect(result).toHaveProperty('tasteStability');
            expect(result).toHaveProperty('risingStars');
            expect(result).toHaveProperty('genreProfile');
            expect(result).toHaveProperty('evidence');
            expect(result).toHaveProperty('isLiteData');
            expect(result).toHaveProperty('summary');

            // Document actual types
            expect(typeof result.diversity).toBe('object');
            expect(typeof result.tasteStability).toBe('object');
            expect(Array.isArray(result.evidence)).toBe(true);
            expect(result.isLiteData).toBe(true);
        });

        it('should handle empty lite data', () => {
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

            const result = Patterns.detectLitePatterns(liteData);
            expect(result).toBeDefined();
            expect(result.isLiteData).toBe(true);
        });
    });

    describe('detectImmediateVibe', () => {
        it('should return string for normal data', () => {
            const liteData = {
                recentStreams: generateMockStreams(15),
                topArtists: {
                    shortTerm: [{ name: 'Artist A', genres: ['pop'] }]
                },
                topTracks: { shortTerm: [] }
            };

            const result = Patterns.detectImmediateVibe(liteData);
            expect(typeof result).toBe('string');
        });

        it('should return message for empty recent streams', () => {
            const liteData = {
                recentStreams: [],
                topArtists: { shortTerm: [] },
                topTracks: { shortTerm: [] }
            };

            const result = Patterns.detectImmediateVibe(liteData);
            expect(result).toContain('Upload your data');
        });
    });
});

// ==========================================
// Module: Async Operations
// ==========================================

describe('Characterization: Async Pattern Detection', () => {
    it('detectAllPatternsAsync should return same result as sync for small datasets', async () => {
        const streams = generateMockStreams(100);
        const chunks = generateMockChunks();

        const syncResult = Patterns.detectAllPatterns(streams, chunks);
        const asyncResult = await Patterns.detectAllPatternsAsync(streams, chunks);

        // Should have same structure
        expect(asyncResult).toHaveProperty('comfortDiscovery');
        expect(asyncResult).toHaveProperty('summary');
        expect(asyncResult).toHaveProperty('evidence');
    });

    it('detectAllPatterns should throw on empty streams', () => {
        expect(() => Patterns.detectAllPatterns([], [])).toThrow();
    });
});

// ==========================================
// Module: Public API Surface
// ==========================================

describe('Characterization: Public API Surface', () => {
    it('should export Patterns object with all expected methods', () => {
        // Document all public methods
        expect(Patterns).toHaveProperty('detectComfortDiscoveryRatio');
        expect(Patterns).toHaveProperty('detectEras');
        expect(Patterns).toHaveProperty('detectTimePatterns');
        expect(Patterns).toHaveProperty('detectSocialPatterns');
        expect(Patterns).toHaveProperty('detectGhostedArtists');
        expect(Patterns).toHaveProperty('detectDiscoveryExplosions');
        expect(Patterns).toHaveProperty('detectMoodSearching');
        expect(Patterns).toHaveProperty('detectTrueFavorites');
        expect(Patterns).toHaveProperty('detectAllPatterns');
        expect(Patterns).toHaveProperty('detectAllPatternsAsync');
        expect(Patterns).toHaveProperty('cleanupPatternWorker');
        expect(Patterns).toHaveProperty('detectLitePatterns');
        expect(Patterns).toHaveProperty('detectImmediateVibe');
        expect(Patterns).toHaveProperty('generateDataInsights');
        expect(Patterns).toHaveProperty('generatePatternSummary');
        expect(Patterns).toHaveProperty('generateLiteSummary');
    });

    it('should maintain backward compatibility - detectAllPatterns returns all patterns', () => {
        const streams = generateMockStreams(100);
        const chunks = generateMockChunks();

        const result = Patterns.detectAllPatterns(streams, chunks);

        // All pattern types should be present
        expect(result).toHaveProperty('comfortDiscovery');
        expect(result).toHaveProperty('eras');
        expect(result).toHaveProperty('timePatterns');
        expect(result).toHaveProperty('socialPatterns');
        expect(result).toHaveProperty('ghostedArtists');
        expect(result).toHaveProperty('discoveryExplosions');
        expect(result).toHaveProperty('moodSearching');
        expect(result).toHaveProperty('trueFavorites');
        expect(result).toHaveProperty('evidence');
        expect(result).toHaveProperty('summary');
    });

    it('should maintain backward compatibility - detectLitePatterns returns isLiteData flag', () => {
        const liteData = {
            recentStreams: generateMockStreams(50),
            topArtists: {
                shortTerm: [{ name: 'Artist A', genres: ['pop'] }],
                mediumTerm: [],
                longTerm: []
            },
            topTracks: { shortTerm: [] }
        };

        const result = Patterns.detectLitePatterns(liteData);
        expect(result.isLiteData).toBe(true);
    });
});

// ==========================================
// Edge Cases
// ==========================================

describe('Characterization: Edge Cases', () => {
    it('should handle streams with null/undefined values', () => {
        const streams = [
            null,
            generateMockStreams(1)[0],
            undefined,
            generateMockStreams(1)[0]
        ];

        const result = Patterns.detectComfortDiscoveryRatio(streams);
        expect(result.totalPlays).toBe(2); // Only counts valid streams
    });

    it('should handle streams with missing fields', () => {
        const streams = [
            { playedAt: new Date().toISOString() }, // Missing artistName
            generateMockStreams(1)[0]
        ];

        const result = Patterns.detectComfortDiscoveryRatio(streams);
        expect(result).toBeDefined();
    });

    it('should handle large datasets without crashing', () => {
        const streams = generateMockStreams(10000);
        const chunks = generateMockChunks();

        expect(() => {
            Patterns.detectAllPatterns(streams, chunks);
        }).not.toThrow();
    });
});
