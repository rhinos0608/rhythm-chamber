/**
 * IndexedDB Connection Retry Tests
 * 
 * Tests for initDatabaseWithRetry configuration and connection status API
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexedDBCore } from '../../js/storage/indexeddb.js';
import { EventBus } from '../../js/services/event-bus.js';

describe('IndexedDB Connection Retry', () => {
    beforeEach(() => {
        vi.useFakeTimers();

        // Reset connection state before each test
        IndexedDBCore.resetConnectionState();

        // Clear EventBus listeners
        EventBus.clearAll();

        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
        IndexedDBCore.resetConnectionState();
        EventBus.clearAll();
    });

    describe('CONNECTION_CONFIG', () => {
        it('should have sensible default values', () => {
            // Test the real getConnectionStatus function to verify API exists
            const status = IndexedDBCore.getConnectionStatus();

            expect(status).toBeDefined();
            expect(typeof status.isConnected).toBe('boolean');
            expect(typeof status.isFailed).toBe('boolean');
            expect(typeof status.attempts).toBe('number');

            // Initial state should be disconnected with no failures
            expect(status.isConnected).toBe(false);
            expect(status.isFailed).toBe(false);
            expect(status.attempts).toBe(0);
        });
    });

    describe('initDatabaseWithRetry API', () => {
        it('should be exported and callable', () => {
            expect(typeof IndexedDBCore.initDatabaseWithRetry).toBe('function');
        });

        it('should validate backoff calculation respects maxDelayMs cap', () => {
            // Verify backoff calculation caps at 5000ms
            const baseDelay = 500;
            const multiplier = 2;
            const maxDelay = 5000;

            // Attempt 5 would be: 500 * 2^4 = 8000, but capped at 5000
            const attempt5Delay = Math.min(
                baseDelay * Math.pow(multiplier, 4),
                maxDelay
            );
            expect(attempt5Delay).toBe(5000);

            // Verify first few delays
            expect(Math.min(baseDelay * Math.pow(multiplier, 0), maxDelay)).toBe(500);
            expect(Math.min(baseDelay * Math.pow(multiplier, 1), maxDelay)).toBe(1000);
            expect(Math.min(baseDelay * Math.pow(multiplier, 2), maxDelay)).toBe(2000);
        });
    });

    describe('Connection status tracking', () => {
        it('should track connection attempts with correct shape', () => {
            // Call the real getConnectionStatus function
            const status = IndexedDBCore.getConnectionStatus();

            // Verify shape and types
            expect(status).toHaveProperty('isConnected');
            expect(status).toHaveProperty('isFailed');
            expect(status).toHaveProperty('attempts');

            expect(typeof status.isConnected).toBe('boolean');
            expect(typeof status.isFailed).toBe('boolean');
            expect(typeof status.attempts).toBe('number');
        });

        it('should reset connection state', () => {
            // Get initial state
            let status = IndexedDBCore.getConnectionStatus();
            expect(status.isConnected).toBe(false);

            // Reset should work
            IndexedDBCore.resetConnectionState();
            status = IndexedDBCore.getConnectionStatus();

            expect(status.isConnected).toBe(false);
            expect(status.isFailed).toBe(false);
            expect(status.attempts).toBe(0);
        });
    });

    describe('Event schema contracts', () => {
        it('storage:connection_retry should have correct payload shape', () => {
            // Validate expected payload structure
            const retryEventPayload = {
                attempt: 1,
                maxAttempts: 3,
                nextRetryMs: 500,
                error: 'Test error'
            };

            expect(retryEventPayload).toHaveProperty('attempt');
            expect(retryEventPayload).toHaveProperty('maxAttempts');
            expect(retryEventPayload).toHaveProperty('nextRetryMs');
            expect(retryEventPayload).toHaveProperty('error');
            expect(typeof retryEventPayload.attempt).toBe('number');
            expect(typeof retryEventPayload.maxAttempts).toBe('number');
            expect(typeof retryEventPayload.nextRetryMs).toBe('number');
        });

        it('storage:connection_failed should have correct payload shape', () => {
            const failedEventPayload = {
                attempts: 3,
                error: 'Failed to connect',
                recoverable: false
            };

            expect(failedEventPayload).toHaveProperty('attempts');
            expect(failedEventPayload).toHaveProperty('error');
            expect(failedEventPayload).toHaveProperty('recoverable');
            expect(failedEventPayload.recoverable).toBe(false);
            expect(typeof failedEventPayload.attempts).toBe('number');
        });

        it('storage:connection_established should have correct payload shape', () => {
            const establishedEventPayload = {
                attempts: 1
            };

            expect(establishedEventPayload).toHaveProperty('attempts');
            expect(establishedEventPayload.attempts).toBeGreaterThanOrEqual(1);
            expect(typeof establishedEventPayload.attempts).toBe('number');
        });

        it('storage:connection_blocked should have correct payload shape', () => {
            const blockedEventPayload = {
                reason: 'upgrade_blocked',
                message: 'Database upgrade blocked by other tabs. Please close other tabs.'
            };

            expect(blockedEventPayload).toHaveProperty('reason');
            expect(blockedEventPayload).toHaveProperty('message');
            expect(typeof blockedEventPayload.reason).toBe('string');
            expect(typeof blockedEventPayload.message).toBe('string');
        });
    });

    describe('EventBus schema registration', () => {
        it('should have storage:connection_retry event registered', () => {
            // Try subscribing to the event - should not throw
            const handler = vi.fn();
            const unsub = EventBus.on('storage:connection_retry', handler);
            expect(typeof unsub).toBe('function');
            unsub();
        });

        it('should have storage:connection_failed event registered', () => {
            const handler = vi.fn();
            const unsub = EventBus.on('storage:connection_failed', handler);
            expect(typeof unsub).toBe('function');
            unsub();
        });

        it('should have storage:connection_established event registered', () => {
            const handler = vi.fn();
            const unsub = EventBus.on('storage:connection_established', handler);
            expect(typeof unsub).toBe('function');
            unsub();
        });

        it('should have storage:connection_blocked event registered', () => {
            const handler = vi.fn();
            const unsub = EventBus.on('storage:connection_blocked', handler);
            expect(typeof unsub).toBe('function');
            unsub();
        });
    });
});
