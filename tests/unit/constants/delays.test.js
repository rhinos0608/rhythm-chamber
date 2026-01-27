/**
 * Tests for delays.js constants
 *
 * These tests verify that all delay/interval constants are properly defined.
 * Following TDD approach - tests written before implementation.
 */

import { describe, it, expect } from 'vitest';
import { DELAYS, POLL_INTERVALS, RATE_LIMITS } from '../../../js/constants/delays.js';

describe('constants/delays.js', () => {
    describe('DELAYS', () => {
        it('should define BASE_RETRY_DELAY_MS', () => {
            expect(DELAYS.BASE_RETRY_DELAY_MS).toBeDefined();
            expect(typeof DELAYS.BASE_RETRY_DELAY_MS).toBe('number');
            expect(DELAYS.BASE_RETRY_DELAY_MS).toBeGreaterThan(0);
        });

        it('should define MAX_RETRY_DELAY_MS', () => {
            expect(DELAYS.MAX_RETRY_DELAY_MS).toBeDefined();
            expect(typeof DELAYS.MAX_RETRY_DELAY_MS).toBe('number');
            expect(DELAYS.MAX_RETRY_DELAY_MS).toBeGreaterThan(0);
        });

        it('should define RECONNECT_DELAY_MS', () => {
            expect(DELAYS.RECONNECT_DELAY_MS).toBeDefined();
            expect(typeof DELAYS.RECONNECT_DELAY_MS).toBe('number');
            expect(DELAYS.RECONNECT_DELAY_MS).toBeGreaterThan(0);
        });

        it('should define WAL_REPLAY_DELAY_MS', () => {
            expect(DELAYS.WAL_REPLAY_DELAY_MS).toBeDefined();
            expect(typeof DELAYS.WAL_REPLAY_DELAY_MS).toBe('number');
            expect(DELAYS.WAL_REPLAY_DELAY_MS).toBeGreaterThanOrEqual(0);
        });

        it('should define COOLDOWN_MS for circuit breaker', () => {
            expect(DELAYS.COOLDOWN_MS).toBeDefined();
            expect(typeof DELAYS.COOLDOWN_MS).toBe('number');
            expect(DELAYS.COOLDOWN_MS).toBeGreaterThan(0);
        });

        it('should define HALF_OPEN_TIMEOUT_MS', () => {
            expect(DELAYS.HALF_OPEN_TIMEOUT_MS).toBeDefined();
            expect(typeof DELAYS.HALF_OPEN_TIMEOUT_MS).toBe('number');
            expect(DELAYS.HALF_OPEN_TIMEOUT_MS).toBeGreaterThan(0);
        });

        it('should define JITTER_MS', () => {
            expect(DELAYS.JITTER_MS).toBeDefined();
            expect(typeof DELAYS.JITTER_MS).toBe('number');
            expect(DELAYS.JITTER_MS).toBeGreaterThan(0);
        });

        it('should define TOAST_SHORT_MS', () => {
            expect(DELAYS.TOAST_SHORT_MS).toBeDefined();
            expect(typeof DELAYS.TOAST_SHORT_MS).toBe('number');
            expect(DELAYS.TOAST_SHORT_MS).toBeGreaterThan(0);
        });

        it('should define TOAST_LONG_MS', () => {
            expect(DELAYS.TOAST_LONG_MS).toBeDefined();
            expect(typeof DELAYS.TOAST_LONG_MS).toBe('number');
            expect(DELAYS.TOAST_LONG_MS).toBeGreaterThan(0);
        });

        it('should have max delay greater than base delay', () => {
            expect(DELAYS.MAX_RETRY_DELAY_MS).toBeGreaterThan(DELAYS.BASE_RETRY_DELAY_MS);
        });

        it('should have documented values', () => {
            expect(DELAYS.BASE_RETRY_DELAY_MS).toBe(1000);
            expect(DELAYS.MAX_RETRY_DELAY_MS).toBe(30000);
            expect(DELAYS.RECONNECT_DELAY_MS).toBe(1000);
            expect(DELAYS.WAL_REPLAY_DELAY_MS).toBe(1000);
            expect(DELAYS.COOLDOWN_MS).toBe(30000);
            expect(DELAYS.HALF_OPEN_TIMEOUT_MS).toBe(5000);
            expect(DELAYS.JITTER_MS).toBe(100);
            expect(DELAYS.TOAST_SHORT_MS).toBe(3000);
            expect(DELAYS.TOAST_LONG_MS).toBe(6000);
        });
    });

    describe('POLL_INTERVALS', () => {
        it('should define QUOTA_CHECK_MS', () => {
            expect(POLL_INTERVALS.QUOTA_CHECK_MS).toBeDefined();
            expect(typeof POLL_INTERVALS.QUOTA_CHECK_MS).toBe('number');
            expect(POLL_INTERVALS.QUOTA_CHECK_MS).toBeGreaterThan(0);
        });

        it('should define HEALTH_CHECK_MS', () => {
            expect(POLL_INTERVALS.HEALTH_CHECK_MS).toBeDefined();
            expect(typeof POLL_INTERVALS.HEALTH_CHECK_MS).toBe('number');
            expect(POLL_INTERVALS.HEALTH_CHECK_MS).toBeGreaterThan(0);
        });

        it('should define STORAGE_DEGRADATION_CHECK_MS', () => {
            expect(POLL_INTERVALS.STORAGE_DEGRADATION_CHECK_MS).toBeDefined();
            expect(typeof POLL_INTERVALS.STORAGE_DEGRADATION_CHECK_MS).toBe('number');
            expect(POLL_INTERVALS.STORAGE_DEGRADATION_CHECK_MS).toBeGreaterThan(0);
        });

        it('should define OBSERVABILITY_UPDATE_MS', () => {
            expect(POLL_INTERVALS.OBSERVABILITY_UPDATE_MS).toBeDefined();
            expect(typeof POLL_INTERVALS.OBSERVABILITY_UPDATE_MS).toBe('number');
            expect(POLL_INTERVALS.OBSERVABILITY_UPDATE_MS).toBeGreaterThan(0);
        });

        it('should define HEARTBEAT_INTERVAL_MS', () => {
            expect(POLL_INTERVALS.HEARTBEAT_INTERVAL_MS).toBeDefined();
            expect(typeof POLL_INTERVALS.HEARTBEAT_INTERVAL_MS).toBe('number');
            expect(POLL_INTERVALS.HEARTBEAT_INTERVAL_MS).toBeGreaterThan(0);
        });

        it('should define HEARTBEAT_CHECK_INTERVAL_MS', () => {
            expect(POLL_INTERVALS.HEARTBEAT_CHECK_INTERVAL_MS).toBeDefined();
            expect(typeof POLL_INTERVALS.HEARTBEAT_CHECK_INTERVAL_MS).toBe('number');
            expect(POLL_INTERVALS.HEARTBEAT_CHECK_INTERVAL_MS).toBeGreaterThan(0);
        });

        it('should define CALIBRATION_MS', () => {
            expect(POLL_INTERVALS.CALIBRATION_MS).toBeDefined();
            expect(typeof POLL_INTERVALS.CALIBRATION_MS).toBe('number');
            expect(POLL_INTERVALS.CALIBRATION_MS).toBeGreaterThan(0);
        });

        it('should have heartbeat check shorter than heartbeat interval', () => {
            expect(POLL_INTERVALS.HEARTBEAT_CHECK_INTERVAL_MS).toBeLessThan(
                POLL_INTERVALS.HEARTBEAT_INTERVAL_MS
            );
        });

        it('should have documented values', () => {
            expect(POLL_INTERVALS.QUOTA_CHECK_MS).toBe(60000);
            expect(POLL_INTERVALS.HEALTH_CHECK_MS).toBe(60000);
            expect(POLL_INTERVALS.STORAGE_DEGRADATION_CHECK_MS).toBe(30000);
            expect(POLL_INTERVALS.OBSERVABILITY_UPDATE_MS).toBe(5000);
            expect(POLL_INTERVALS.HEARTBEAT_INTERVAL_MS).toBe(5000);
            expect(POLL_INTERVALS.HEARTBEAT_CHECK_INTERVAL_MS).toBe(100);
            expect(POLL_INTERVALS.CALIBRATION_MS).toBe(5000);
        });
    });

    describe('RATE_LIMITS', () => {
        it('should define API_RATE_LIMIT_MS', () => {
            expect(RATE_LIMITS.API_RATE_LIMIT_MS).toBeDefined();
            expect(typeof RATE_LIMITS.API_RATE_LIMIT_MS).toBe('number');
            expect(RATE_LIMITS.API_RATE_LIMIT_MS).toBeGreaterThan(0);
        });

        it('should define PROVIDER_BLACKLIST_MS', () => {
            expect(RATE_LIMITS.PROVIDER_BLACKLIST_MS).toBeDefined();
            expect(typeof RATE_LIMITS.PROVIDER_BLACKLIST_MS).toBe('number');
            expect(RATE_LIMITS.PROVIDER_BLACKLIST_MS).toBeGreaterThan(0);
        });

        it('should define MIN_PAUSE_INTERVAL_MS', () => {
            expect(RATE_LIMITS.MIN_PAUSE_INTERVAL_MS).toBeDefined();
            expect(typeof RATE_LIMITS.MIN_PAUSE_INTERVAL_MS).toBe('number');
            expect(RATE_LIMITS.MIN_PAUSE_INTERVAL_MS).toBeGreaterThan(0);
        });

        it('should have documented values', () => {
            // API_RATE_LIMIT_MS: Slightly over 1 second for MusicBrainz
            expect(RATE_LIMITS.API_RATE_LIMIT_MS).toBe(1100);

            // PROVIDER_BLACKLIST_MS: 5 minutes
            expect(RATE_LIMITS.PROVIDER_BLACKLIST_MS).toBe(300000);

            // MIN_PAUSE_INTERVAL_MS: Pattern worker min pause
            expect(RATE_LIMITS.MIN_PAUSE_INTERVAL_MS).toBe(5000);
        });
    });
});
