/**
 * Tab Coordination - Message Ordering Tests
 *
 * Tests for message ordering, sequence tracking, and out-of-order handling
 * in the tab coordination system.
 *
 * @module tests/unit/tab-coordination-message-ordering
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkAndTrackSequence, resetOutOfOrderCount, resetSequenceTracking } from '../../js/services/tab-coordination/message-guards.js';
import {
    getPendingCount,
    getAllPendingCounts,
    clearPendingMessages,
    checkForMessageGaps
} from '../../js/services/tab-coordination/modules/message-sender.js';

describe('TabCoordination Message Ordering', () => {
    const LOCAL_TAB_ID = 'local_tab_123';
    const REMOTE_TAB_1 = 'remote_tab_1';
    const REMOTE_TAB_2 = 'remote_tab_2';

    beforeEach(() => {
        // Reset state before each test
        resetOutOfOrderCount();
        resetSequenceTracking();
        clearPendingMessages();
    });

    afterEach(() => {
        // Cleanup after each test
        clearPendingMessages();
        resetSequenceTracking();
    });

    describe('Sequence Tracking', () => {
        it('should accept first message from a sender', () => {
            const result = checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            expect(result.shouldProcess).toBe(true);
            expect(result.isDuplicate).toBe(false);
            expect(result.isOutOfOrder).toBe(false);
            expect(result.shouldQueue).toBe(false);
        });

        it('should accept messages in order', () => {
            // First message
            let result = checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });
            expect(result.shouldProcess).toBe(true);

            // Second message
            result = checkAndTrackSequence({
                seq: 2,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });
            expect(result.shouldProcess).toBe(true);
            expect(result.isOutOfOrder).toBe(false);
        });

        it('should reject duplicate messages', () => {
            // First message
            checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Duplicate message
            const result = checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            expect(result.shouldProcess).toBe(false);
            expect(result.isDuplicate).toBe(true);
            expect(result.isOutOfOrder).toBe(false);
        });

        it('should reject old messages', () => {
            // Process messages 1-3
            checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });
            checkAndTrackSequence({
                seq: 2,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });
            checkAndTrackSequence({
                seq: 3,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Old message (seq 1 again)
            const result = checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            expect(result.shouldProcess).toBe(false);
            expect(result.isDuplicate).toBe(true);
        });
    });

    describe('Out-of-Order Detection', () => {
        it('should detect out-of-order messages', () => {
            // First message
            checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Third message (missing seq 2)
            const result = checkAndTrackSequence({
                seq: 3,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false,
                message: { type: 'TEST', data: 'test' }
            });

            expect(result.isOutOfOrder).toBe(true);
            expect(result.gapSize).toBe(1);
            expect(result.shouldQueue).toBe(true);
            expect(result.expectedSeq).toBe(2); // Next expected is 2
        });

        it('should detect large gaps', () => {
            // First message
            checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_2, // Use different sender to avoid state conflicts
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Tenth message (missing seq 2-9, gap of 8)
            const result = checkAndTrackSequence({
                seq: 10,
                senderId: REMOTE_TAB_2,
                localTabId: LOCAL_TAB_ID,
                debugMode: false,
                message: { type: 'TEST', data: 'test' }
            });

            expect(result.isOutOfOrder).toBe(true);
            expect(result.gapSize).toBe(8);
            // Gap of 8 is <= 10, so it will be queued
            expect(result.shouldQueue).toBe(true);
            expect(result.shouldProcess).toBe(false);
        });

        it('should queue small gaps but process large gaps', () => {
            // First message
            checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Small gap (should queue)
            let result = checkAndTrackSequence({
                seq: 3,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false,
                message: { type: 'TEST', data: 'test' }
            });

            expect(result.shouldQueue).toBe(true);

            // Large gap without message object (should process anyway)
            result = checkAndTrackSequence({
                seq: 20,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false,
                message: null
            });

            expect(result.shouldProcess).toBe(true);
            expect(result.isOutOfOrder).toBe(true);
        });
    });

    describe('Multiple Senders', () => {
        it('should track sequences independently for each sender', () => {
            // Sender 1, message 1
            let result1 = checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });
            expect(result1.shouldProcess).toBe(true);

            // Sender 2, message 1
            let result2 = checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_2,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });
            expect(result2.shouldProcess).toBe(true);

            // Sender 1, message 2
            result1 = checkAndTrackSequence({
                seq: 2,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });
            expect(result1.shouldProcess).toBe(true);

            // Sender 2, message 2
            result2 = checkAndTrackSequence({
                seq: 2,
                senderId: REMOTE_TAB_2,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });
            expect(result2.shouldProcess).toBe(true);
        });

        it('should handle out-of-order from one sender while others are in order', () => {
            // Sender 1: messages 1, 2, 3
            checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });
            checkAndTrackSequence({
                seq: 2,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });
            checkAndTrackSequence({
                seq: 3,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Sender 2: message 1
            checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_2,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Sender 2: message 3 (out of order)
            const result = checkAndTrackSequence({
                seq: 3,
                senderId: REMOTE_TAB_2,
                localTabId: LOCAL_TAB_ID,
                debugMode: false,
                message: { type: 'TEST', data: 'test' }
            });

            expect(result.isOutOfOrder).toBe(true);
        });
    });

    describe('Message Filtering', () => {
        it('should ignore messages without sequence numbers', () => {
            const result = checkAndTrackSequence({
                seq: undefined,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            expect(result.shouldProcess).toBe(true);
            expect(result.isDuplicate).toBe(false);
            expect(result.isOutOfOrder).toBe(false);
        });

        it('should ignore messages from self', () => {
            const result = checkAndTrackSequence({
                seq: 1,
                senderId: LOCAL_TAB_ID,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            expect(result.shouldProcess).toBe(true);
            expect(result.isDuplicate).toBe(false);
            expect(result.isOutOfOrder).toBe(false);
        });

        it('should ignore messages without sender ID', () => {
            const result = checkAndTrackSequence({
                seq: 1,
                senderId: undefined,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            expect(result.shouldProcess).toBe(true);
            expect(result.isDuplicate).toBe(false);
            expect(result.isOutOfOrder).toBe(false);
        });
    });

    describe('Pending Message Queue API', () => {
        it('should report zero pending messages initially', () => {
            const count = getPendingCount(REMOTE_TAB_1);
            expect(count).toBe(0);
        });

        it('should report all pending counts', () => {
            const counts = getAllPendingCounts();
            expect(counts).toBeInstanceOf(Object);
            expect(Object.keys(counts).length).toBe(0);
        });

        it('should clear all pending messages', () => {
            const cleared = clearPendingMessages();
            expect(cleared).toBe(0); // No messages to clear
        });
    });

    describe('Gap Detection', () => {
        it('should detect message gaps', () => {
            const gapSize = checkForMessageGaps(REMOTE_TAB_1, 1, 3);
            expect(gapSize).toBe(1); // Missing seq 2
        });

        it('should detect no gap for sequential messages', () => {
            const gapSize = checkForMessageGaps(REMOTE_TAB_1, 1, 2);
            expect(gapSize).toBe(0);
        });

        it('should detect large gaps', () => {
            const gapSize = checkForMessageGaps(REMOTE_TAB_1, 1, 10);
            expect(gapSize).toBe(8); // Missing seq 2-9
        });

        it('should handle no previous messages', () => {
            const gapSize = checkForMessageGaps(REMOTE_TAB_1, 0, 1);
            expect(gapSize).toBe(0);
        });
    });

    describe('Expected Sequence Tracking', () => {
        it('should return expected next sequence', () => {
            // Process message 1
            const result1 = checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_2,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            expect(result1.expectedSeq).toBe(2);

            // Process message 2
            const result2 = checkAndTrackSequence({
                seq: 2,
                senderId: REMOTE_TAB_2,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            expect(result2.expectedSeq).toBe(3);
        });

        it('should indicate expected sequence for out-of-order messages', () => {
            // Process message 1
            checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_2,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Process message 3 (out of order, small gap)
            const result = checkAndTrackSequence({
                seq: 3,
                senderId: REMOTE_TAB_2,
                localTabId: LOCAL_TAB_ID,
                debugMode: false,
                message: { type: 'TEST', data: 'test' }
            });

            expect(result.expectedSeq).toBe(2); // Should expect seq 2
            expect(result.isOutOfOrder).toBe(true);
            expect(result.shouldQueue).toBe(true);
            expect(result.gapSize).toBe(1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle sequence number overflow gracefully', () => {
            // Simulate very high sequence number
            const result = checkAndTrackSequence({
                seq: Number.MAX_SAFE_INTEGER,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Should process as it's the first message from this sender
            expect(result.shouldProcess).toBe(true);
        });

        it('should handle zero sequence number', () => {
            // Zero sequence is less than or equal to the initial state (0)
            // so it will be treated as a duplicate
            const result = checkAndTrackSequence({
                seq: 0,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Zero is <= 0 (initial state), so it's a duplicate
            expect(result.shouldProcess).toBe(false);
            expect(result.isDuplicate).toBe(true);
        });

        it('should handle negative sequence numbers', () => {
            // Negative sequence is less than or equal to the initial state (0)
            // so it will be treated as a duplicate
            const result = checkAndTrackSequence({
                seq: -1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            // Negative is <= 0 (initial state), so it's a duplicate
            expect(result.shouldProcess).toBe(false);
            expect(result.isDuplicate).toBe(true);
        });

        it('should handle sequence starting from 1', () => {
            // First message with seq 1 from a new sender
            const result = checkAndTrackSequence({
                seq: 1,
                senderId: 'remote_tab_3',
                localTabId: LOCAL_TAB_ID,
                debugMode: false
            });

            expect(result.shouldProcess).toBe(true);
            expect(result.isDuplicate).toBe(false);
            expect(result.expectedSeq).toBe(2);
        });
    });

    describe('Debug Mode', () => {
        it('should provide additional information in debug mode', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            // First message
            checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: true
            });

            // Duplicate in debug mode
            const result = checkAndTrackSequence({
                seq: 1,
                senderId: REMOTE_TAB_1,
                localTabId: LOCAL_TAB_ID,
                debugMode: true
            });

            expect(result.isDuplicate).toBe(true);
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });
});
