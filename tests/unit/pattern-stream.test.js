/**
 * Unit Tests for Pattern Stream Service
 * 
 * Tests for progressive pattern detection and streaming
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PatternStream } from '../../js/services/pattern-stream.js';
import { EventBus } from '../../js/services/event-bus.js';

// ==========================================
// Mock Setup
// ==========================================

beforeEach(() => {
    EventBus.clearAll();

    // Mock Patterns module on window
    global.window = {
        Patterns: {
            detectComfortVsDiscovery: vi.fn().mockResolvedValue({ ratio: 50 }),
            detectListeningEras: vi.fn().mockResolvedValue({ eras: [] }),
            detectTimeOfDayPatterns: vi.fn().mockResolvedValue({ peakHour: 21 }),
            detectWeekdayWeekendPatterns: vi.fn().mockResolvedValue({ weekendBias: 30 }),
            detectEmotionalJourney: vi.fn().mockResolvedValue({ dominant: 'melancholy' }),
            detectGhostedArtists: vi.fn().mockResolvedValue({ artists: [] }),
            detectArtistLoyalty: vi.fn().mockResolvedValue({ loyal: [] }),
            detectGenreEvolution: vi.fn().mockResolvedValue({ genres: [] }),
            detectSeasonalPatterns: vi.fn().mockResolvedValue({ seasons: {} }),
            detectBingeSessions: vi.fn().mockResolvedValue({ sessions: [] })
        }
    };
});

afterEach(() => {
    EventBus.clearAll();
    PatternStream.abort();
    delete global.window;
});

// ==========================================
// Streaming Tests
// ==========================================

describe('PatternStream startStream', () => {
    it('should detect patterns and return all results', async () => {
        const mockStreams = [{ ts: '2023-01-01' }];

        const result = await PatternStream.startStream(mockStreams, { delay: 0 });

        expect(result).toHaveProperty('comfortDiscovery');
        expect(result.comfortDiscovery).toEqual({ ratio: 50 });
    });

    it('should emit pattern:detected events for each pattern', async () => {
        const mockStreams = [{ ts: '2023-01-01' }];
        const patternHandler = vi.fn();

        EventBus.on('pattern:detected', patternHandler);

        await PatternStream.startStream(mockStreams, { delay: 0 });

        expect(patternHandler).toHaveBeenCalled();
        expect(patternHandler.mock.calls[0][0]).toHaveProperty('patternName');
        expect(patternHandler.mock.calls[0][0]).toHaveProperty('result');
    });

    it('should emit pattern:all_complete when done', async () => {
        const mockStreams = [{ ts: '2023-01-01' }];
        const completeHandler = vi.fn();

        EventBus.on('pattern:all_complete', completeHandler);

        await PatternStream.startStream(mockStreams, { delay: 0 });

        expect(completeHandler).toHaveBeenCalledWith(
            expect.objectContaining({
                patterns: expect.any(Object),
                duration: expect.any(Number)
            }),
            expect.any(Object)
        );
    });

    it('should call onPattern callback for each pattern', async () => {
        const mockStreams = [{ ts: '2023-01-01' }];
        const onPattern = vi.fn();

        await PatternStream.startStream(mockStreams, { delay: 0, onPattern });

        expect(onPattern).toHaveBeenCalled();
        expect(onPattern.mock.calls[0][0]).toBe('comfortDiscovery');
    });

    it('should call onComplete callback when finished', async () => {
        const mockStreams = [{ ts: '2023-01-01' }];
        const onComplete = vi.fn();

        await PatternStream.startStream(mockStreams, { delay: 0, onComplete });

        expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
            comfortDiscovery: expect.any(Object)
        }));
    });
});

// ==========================================
// State Tests
// ==========================================

describe('PatternStream State', () => {
    it('should track progress during streaming', async () => {
        const mockStreams = [{ ts: '2023-01-01' }];

        // Start streaming (no await)
        const promise = PatternStream.startStream(mockStreams, { delay: 10 });

        // Check initial state
        expect(PatternStream.isActive()).toBe(true);

        // Wait for completion
        await promise;

        expect(PatternStream.isActive()).toBe(false);
    });

    it('should return detected patterns', async () => {
        const mockStreams = [{ ts: '2023-01-01' }];

        await PatternStream.startStream(mockStreams, { delay: 0 });

        const detected = PatternStream.getDetected();
        expect(detected).toHaveProperty('comfortDiscovery');
    });

    it('should report progress', async () => {
        const mockStreams = [{ ts: '2023-01-01' }];

        await PatternStream.startStream(mockStreams, { delay: 0 });

        const progress = PatternStream.getProgress();
        expect(progress.detected).toBeGreaterThan(0);
        expect(progress.total).toBe(PatternStream.PATTERN_ORDER.length);
        expect(progress.percentage).toBeGreaterThan(0);
    });
});

// ==========================================
// Abort Tests
// ==========================================

describe('PatternStream Abort', () => {
    it('should abort streaming when abort() is called', async () => {
        const mockStreams = [{ ts: '2023-01-01' }];

        // Start streaming with long delay
        const promise = PatternStream.startStream(mockStreams, { delay: 100 });

        // Small delay to let first pattern start
        await new Promise(resolve => setTimeout(resolve, 50));

        // Abort
        PatternStream.abort();

        // Should resolve quickly after abort
        const result = await promise;

        // Should have fewer patterns than full run
        const patternCount = Object.keys(result).length;
        expect(patternCount).toBeLessThan(PatternStream.PATTERN_ORDER.length);
    });
});

// ==========================================
// Constants Tests
// ==========================================

describe('PatternStream Constants', () => {
    it('should expose pattern order', () => {
        expect(PatternStream.PATTERN_ORDER).toBeInstanceOf(Array);
        expect(PatternStream.PATTERN_ORDER.length).toBeGreaterThan(0);
        expect(PatternStream.PATTERN_ORDER).toContain('comfortDiscovery');
    });
});
