/**
 * Config Module Unit Tests
 *
 * Tests for the provider interface configuration module.
 */

import { describe, it, expect } from 'vitest';
import { PROVIDER_TIMEOUTS, RETRY_CONFIG, HEALTH_CHECK_TIMEOUT } from '../../../../js/providers/interface/config.js';

describe('Provider Interface Config', () => {
    describe('PROVIDER_TIMEOUTS', () => {
        it('should have cloud timeout of 60 seconds', () => {
            expect(PROVIDER_TIMEOUTS.cloud).toBe(60000);
        });

        it('should have local timeout of 90 seconds', () => {
            expect(PROVIDER_TIMEOUTS.local).toBe(90000);
        });

        it('should have longer timeout for local than cloud', () => {
            expect(PROVIDER_TIMEOUTS.local).toBeGreaterThan(PROVIDER_TIMEOUTS.cloud);
        });
    });

    describe('RETRY_CONFIG', () => {
        it('should have max retries of 3', () => {
            expect(RETRY_CONFIG.MAX_RETRIES).toBe(3);
        });

        it('should have base delay of 1 second', () => {
            expect(RETRY_CONFIG.BASE_DELAY_MS).toBe(1000);
        });

        it('should have max delay of 10 seconds', () => {
            expect(RETRY_CONFIG.MAX_DELAY_MS).toBe(10000);
        });

        it('should have jitter of 100ms', () => {
            expect(RETRY_CONFIG.JITTER_MS).toBe(100);
        });
    });

    describe('HEALTH_CHECK_TIMEOUT', () => {
        it('should have timeout of 5 seconds', () => {
            expect(HEALTH_CHECK_TIMEOUT).toBe(5000);
        });
    });
});
