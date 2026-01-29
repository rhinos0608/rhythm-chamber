/**
 * Batch 1 Critical Fixes Verification Tests
 * Tests for P0-1 (null guard) and P0-2 (missing exports) fixes
 */

import { describe, it, expect } from 'vitest';
import { generateLiteSummary, generateDataInsights, generatePatternSummary } from '../../js/patterns/pattern-transformers.js';
import { Patterns } from '../../js/patterns/index.js';

describe('Batch 1 - Critical P0 Fixes', () => {

    describe('P0-1: Runtime Crash in generateLiteSummary', () => {
        it('should handle undefined topGenres without crashing', () => {
            const liteData = {
                recentStreams: [{ msPlayed: 1000 }],
                topArtists: { shortTerm: [{ name: 'Artist 1' }] },
                topTracks: { shortTerm: [{ name: 'Track 1', artist: 'Artist 1' }] },
                profile: { displayName: 'Test User' },
                fetchedAt: new Date().toISOString()
            };

            const patterns = {
                diversity: { signal: 'high' },
                tasteStability: { signal: 'stable' }
                // NOTE: topGenres is MISSING - this is the bug scenario
            };

            // This should NOT throw TypeError
            expect(() => {
                const result = generateLiteSummary(liteData, patterns);
            }).not.toThrow();
        });

        it('should return empty array for missing topGenres', () => {
            const liteData = {
                recentStreams: [{ msPlayed: 1000 }],
                topArtists: { shortTerm: [{ name: 'Artist 1' }] },
                topTracks: { shortTerm: [{ name: 'Track 1', artist: 'Artist 1' }] },
                profile: { displayName: 'Test User' },
                fetchedAt: new Date().toISOString()
            };

            const patterns = {
                diversity: { signal: 'high' },
                tasteStability: { signal: 'stable' }
            };

            const result = generateLiteSummary(liteData, patterns);
            expect(result.topGenres).toEqual([]);
        });

        it('should handle null topGenres gracefully', () => {
            const liteData = {
                recentStreams: [{ msPlayed: 1000 }],
                topArtists: { shortTerm: [{ name: 'Artist 1' }] },
                topTracks: { shortTerm: [{ name: 'Track 1', artist: 'Artist 1' }] },
                profile: { displayName: 'Test User' },
                fetchedAt: new Date().toISOString()
            };

            const patterns = {
                diversity: { signal: 'high' },
                tasteStability: { signal: 'stable' },
                topGenres: null
            };

            const result = generateLiteSummary(liteData, patterns);
            expect(result.topGenres).toEqual([]);
        });

        it('should work correctly when topGenres exists', () => {
            const liteData = {
                recentStreams: [{ msPlayed: 1000 }],
                topArtists: { shortTerm: [{ name: 'Artist 1' }] },
                topTracks: { shortTerm: [{ name: 'Track 1', artist: 'Artist 1' }] },
                profile: { displayName: 'Test User' },
                fetchedAt: new Date().toISOString()
            };

            const patterns = {
                diversity: { signal: 'high' },
                tasteStability: { signal: 'stable' },
                topGenres: [
                    { genre: 'Rock', count: 10 },
                    { genre: 'Pop', count: 8 },
                    { genre: 'Jazz', count: 5 }
                ]
            };

            const result = generateLiteSummary(liteData, patterns);
            expect(result.topGenres).toEqual(['Rock', 'Pop', 'Jazz']);
        });
    });

    describe('P0-2: Breaking Change - Missing Exports', () => {
        it('should export generateLiteSummary from facade', () => {
            expect(Patterns.generateLiteSummary).toBeDefined();
            expect(typeof Patterns.generateLiteSummary).toBe('function');
        });

        it('should export generateDataInsights from facade', () => {
            expect(Patterns.generateDataInsights).toBeDefined();
            expect(typeof Patterns.generateDataInsights).toBe('function');
        });

        it('should export generatePatternSummary from facade', () => {
            expect(Patterns.generatePatternSummary).toBeDefined();
            expect(typeof Patterns.generatePatternSummary).toBe('function');
        });

        it('should verify generateLiteSummary is callable through facade', () => {
            const liteData = {
                recentStreams: [],
                topArtists: { shortTerm: [] },
                topTracks: { shortTerm: [] },
                profile: { displayName: 'Test' },
                fetchedAt: new Date().toISOString()
            };

            const patterns = {
                diversity: { signal: 'low' },
                tasteStability: { signal: 'stable' }
            };

            expect(() => {
                Patterns.generateLiteSummary(liteData, patterns);
            }).not.toThrow();
        });

        it('should verify generateDataInsights is callable through facade', () => {
            const streams = [
                { msPlayed: 30000, artistName: 'Artist 1', playedAt: '2024-01-01T10:00:00Z' }
            ];

            expect(() => {
                const result = Patterns.generateDataInsights(streams);
                expect(result).toBeDefined();
            }).not.toThrow();
        });

        it('should verify generatePatternSummary is callable through facade', () => {
            const streams = [
                { msPlayed: 30000, artistName: 'Artist 1', trackName: 'Track 1', playedAt: '2024-01-01T10:00:00Z' }
            ];

            const patterns = {};

            expect(() => {
                const result = Patterns.generatePatternSummary(streams, patterns);
                expect(result).toBeDefined();
            }).not.toThrow();
        });

        it('should export all 15 original functions', () => {
            const expectedExports = [
                // Extractors (4)
                'detectComfortDiscoveryRatio',
                'detectEras',
                'detectGhostedArtists',
                'detectDiscoveryExplosions',
                // Validators (4)
                'detectTimePatterns',
                'detectSocialPatterns',
                'detectMoodSearching',
                'detectTrueFavorites',
                // Transformers (3) - these were the missing ones
                'generateLiteSummary',
                'generateDataInsights',
                'generatePatternSummary',
                // Matching (2)
                'detectLitePatterns',
                'detectImmediateVibe',
                // Cache & Async (2)
                'detectAllPatterns',
                'detectAllPatternsAsync'
            ];

            expectedExports.forEach(exportName => {
                expect(Patterns[exportName]).toBeDefined();
                expect(typeof Patterns[exportName]).toBe('function');
            });
        });
    });

    describe('Integration: Combined Fix Verification', () => {
        it('should work end-to-end: detectLitePatterns with missing topGenres', () => {
            const liteData = {
                recentStreams: [{ msPlayed: 1000 }],
                topArtists: { shortTerm: [] },
                topTracks: { shortTerm: [] },
                profile: { displayName: 'Test User' }
            };

            // This internally uses generateLiteSummary
            expect(() => {
                const patterns = Patterns.detectLitePatterns(liteData);
                expect(patterns).toBeDefined();
            }).not.toThrow();
        });

        it('should handle all three transformer functions without errors', () => {
            const streams = [
                { msPlayed: 30000, artistName: 'Artist 1', trackName: 'Track 1', playedAt: '2024-01-01T10:00:00Z', dayOfWeek: 1 }
            ];

            const liteData = {
                recentStreams: [],
                topArtists: { shortTerm: [] },
                topTracks: { shortTerm: [] },
                profile: { displayName: 'Test' },
                fetchedAt: new Date().toISOString()
            };

            const patterns = {
                diversity: { signal: 'low' },
                tasteStability: { signal: 'stable' }
            };

            // Test all three functions
            expect(() => {
                const insights = Patterns.generateDataInsights(streams);
                const summary = Patterns.generatePatternSummary(streams, patterns);
                const lite = Patterns.generateLiteSummary(liteData, patterns);
            }).not.toThrow();
        });
    });
});
