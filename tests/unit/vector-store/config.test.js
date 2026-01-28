/**
 * Unit Tests for Vector Store Config
 *
 * @module vector-store/config
 */

import { describe, it, expect } from 'vitest';
import {
    DB_NAME,
    DB_VERSION,
    STORE_NAME,
    SETTINGS_KEY,
    RETRY_TIMEOUT,
    MAX_RETRIES,
    RETRY_COOLDOWN_MS,
    MAX_RETRIES_PER_UPSERT,
    WORKER_TIMEOUT_MS,
    SMALL_VECTOR_THRESHOLD,
    WORKER_INIT_TIMEOUT_MS,
    DEFAULT_VECTOR_DIMENSIONS,
    SHARED_MEMORY_AVAILABLE
} from '../../../js/vector-store/config.js';

describe('Vector Store Config', () => {
    describe('Database Configuration', () => {
        it('should export DB_NAME constant', () => {
            expect(DB_NAME).toBe('rhythm_chamber_vectors');
            expect(typeof DB_NAME).toBe('string');
        });

        it('should export DB_VERSION constant', () => {
            expect(DB_VERSION).toBe(1);
            expect(typeof DB_VERSION).toBe('number');
        });

        it('should export STORE_NAME constant', () => {
            expect(STORE_NAME).toBe('vectors');
            expect(typeof STORE_NAME).toBe('string');
        });

        it('should export SETTINGS_KEY constant', () => {
            expect(SETTINGS_KEY).toBe('vector_store_settings');
            expect(typeof SETTINGS_KEY).toBe('string');
        });
    });

    describe('Retry Configuration', () => {
        it('should export RETRY_TIMEOUT constant', () => {
            expect(RETRY_TIMEOUT).toBe(60000);
            expect(typeof RETRY_TIMEOUT).toBe('number');
        });

        it('should export MAX_RETRIES constant', () => {
            expect(MAX_RETRIES).toBe(3);
            expect(typeof MAX_RETRIES).toBe('number');
        });

        it('should export RETRY_COOLDOWN_MS constant', () => {
            expect(RETRY_COOLDOWN_MS).toBe(5000);
            expect(typeof RETRY_COOLDOWN_MS).toBe('number');
        });

        it('should export MAX_RETRIES_PER_UPSERT constant', () => {
            expect(MAX_RETRIES_PER_UPSERT).toBe(10);
            expect(typeof MAX_RETRIES_PER_UPSERT).toBe('number');
        });
    });

    describe('Worker Configuration', () => {
        it('should export WORKER_TIMEOUT_MS constant', () => {
            expect(WORKER_TIMEOUT_MS).toBe(30000);
            expect(typeof WORKER_TIMEOUT_MS).toBe('number');
        });

        it('should export SMALL_VECTOR_THRESHOLD constant', () => {
            expect(SMALL_VECTOR_THRESHOLD).toBe(500);
            expect(typeof SMALL_VECTOR_THRESHOLD).toBe('number');
        });

        it('should export WORKER_INIT_TIMEOUT_MS constant', () => {
            expect(WORKER_INIT_TIMEOUT_MS).toBe(5000);
            expect(typeof WORKER_INIT_TIMEOUT_MS).toBe('number');
        });
    });

    describe('Vector Configuration', () => {
        it('should export DEFAULT_VECTOR_DIMENSIONS constant', () => {
            expect(DEFAULT_VECTOR_DIMENSIONS).toBe(384);
            expect(typeof DEFAULT_VECTOR_DIMENSIONS).toBe('number');
        });
    });

    describe('Shared Memory Configuration', () => {
        it('should export SHARED_MEMORY_AVAILABLE constant', () => {
            expect(typeof SHARED_MEMORY_AVAILABLE).toBe('boolean');
        });

        it('should detect SharedArrayBuffer availability', () => {
            // In test environment, this should be either true or false
            expect(typeof SHARED_MEMORY_AVAILABLE).toBe('boolean');
        });
    });

    describe('Configuration Values', () => {
        it('should have reasonable retry timeout', () => {
            expect(RETRY_TIMEOUT).toBeGreaterThan(0);
            expect(RETRY_TIMEOUT).toBeLessThanOrEqual(300000); // Max 5 minutes
        });

        it('should have reasonable max retries', () => {
            expect(MAX_RETRIES).toBeGreaterThan(0);
            expect(MAX_RETRIES).toBeLessThanOrEqual(10);
        });

        it('should have reasonable cooldown period', () => {
            expect(RETRY_COOLDOWN_MS).toBeGreaterThan(0);
            expect(RETRY_COOLDOWN_MS).toBeLessThanOrEqual(60000); // Max 1 minute
        });

        it('should have reasonable worker timeout', () => {
            expect(WORKER_TIMEOUT_MS).toBeGreaterThan(0);
            expect(WORKER_TIMEOUT_MS).toBeLessThanOrEqual(60000); // Max 1 minute
        });

        it('should have reasonable vector threshold', () => {
            expect(SMALL_VECTOR_THRESHOLD).toBeGreaterThan(0);
            expect(SMALL_VECTOR_THRESHOLD).toBeLessThanOrEqual(1000);
        });
    });
});
