/**
 * Event Log Store Tests
 *
 * Tests for persistent event log with IndexedDB backing.
 * Covers event storage, retrieval, compaction, and checkpointing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventLogStore } from '../../js/storage/event-log-store.js';

describe('EventLogStore', () => {
    beforeEach(async () => {
        // Clear any existing event log before each test
        await EventLogStore.clearEventLog();
    });

    afterEach(async () => {
        // Clean up after each test
        await EventLogStore.clearEventLog();
    });

    describe('Event Storage', () => {
        it('should append event to log', async () => {
            const vectorClock = {
                tab_1: 1,
                tab_2: 0
            };

            const event = await EventLogStore.appendEvent(
                'test_event',
                { data: 'test' },
                vectorClock,
                'tab_1'
            );

            expect(event).toBeDefined();
            expect(event.type).toBe('test_event');
            expect(event.payload.data).toBe('test');
            expect(event.sequenceNumber).toBe(0);
            expect(event.sourceTab).toBe('tab_1');
        });

        it('should increment sequence numbers', async () => {
            const vectorClock = { tab_1: 1 };

            const event1 = await EventLogStore.appendEvent('event1', {}, vectorClock, 'tab_1');
            const event2 = await EventLogStore.appendEvent('event2', {}, vectorClock, 'tab_1');
            const event3 = await EventLogStore.appendEvent('event3', {}, vectorClock, 'tab_1');

            expect(event1.sequenceNumber).toBe(0);
            expect(event2.sequenceNumber).toBe(1);
            expect(event3.sequenceNumber).toBe(2);
        });

        it('should store vector clock with event', async () => {
            const vectorClock = {
                tab_1: 5,
                tab_2: 3
            };

            const event = await EventLogStore.appendEvent(
                'test_event',
                { data: 'test' },
                vectorClock,
                'tab_1'
            );

            expect(event.vectorClock).toEqual(vectorClock);
        });

        it('should store high-resolution timestamp', async () => {
            const vectorClock = { tab_1: 1 };
            const beforeTime = performance.now();

            const event = await EventLogStore.appendEvent(
                'test_event',
                {},
                vectorClock,
                'tab_1'
            );

            const afterTime = performance.now();

            expect(event.timestamp).toBeGreaterThanOrEqual(beforeTime);
            expect(event.timestamp).toBeLessThanOrEqual(afterTime);
        });
    });

    describe('Event Retrieval', () => {
        beforeEach(async () => {
            // Add test events
            const vectorClock = { tab_1: 1 };
            await EventLogStore.appendEvent('event1', { value: 1 }, vectorClock, 'tab_1');
            await EventLogStore.appendEvent('event2', { value: 2 }, vectorClock, 'tab_1');
            await EventLogStore.appendEvent('event3', { value: 3 }, vectorClock, 'tab_1');
        });

        it('should get all events', async () => {
            const events = await EventLogStore.getEvents();

            expect(events).toHaveLength(3);
            expect(events[0].payload.value).toBe(1);
            expect(events[1].payload.value).toBe(2);
            expect(events[2].payload.value).toBe(3);
        });

        it('should get events after sequence number', async () => {
            const events = await EventLogStore.getEvents(1); // After sequence 1

            expect(events).toHaveLength(1);
            expect(events[0].sequenceNumber).toBe(2);
        });

        it('should respect limit parameter', async () => {
            const events = await EventLogStore.getEvents(-1, 2);

            expect(events).toHaveLength(2);
        });

        it('should get event by ID', async () => {
            const allEvents = await EventLogStore.getEvents();
            const eventId = allEvents[0].id;

            const event = await EventLogStore.getEventById(eventId);

            expect(event).toBeDefined();
            expect(event.id).toBe(eventId);
        });

        it('should return null for non-existent event', async () => {
            const event = await EventLogStore.getEventById('non_existent_id');

            expect(event).toBeNull();
        });
    });

    describe('Checkpointing', () => {
        it('should create checkpoint', async () => {
            const checkpoint = await EventLogStore.createCheckpoint(
                5,
                { test: 'metadata' }
            );

            expect(checkpoint).toBeDefined();
            expect(checkpoint.sequenceNumber).toBe(5);
            expect(checkpoint.metadata.test).toBe('metadata');
        });

        it('should get latest checkpoint', async () => {
            await EventLogStore.createCheckpoint(1, {});
            await EventLogStore.createCheckpoint(5, {});
            await EventLogStore.createCheckpoint(10, {});

            const checkpoint = await EventLogStore.getLatestCheckpoint();

            expect(checkpoint.sequenceNumber).toBe(10);
        });

        it('should return null when no checkpoints exist', async () => {
            const checkpoint = await EventLogStore.getLatestCheckpoint();

            expect(checkpoint).toBeNull();
        });

        it('should get events since checkpoint', async () => {
            const vectorClock = { tab_1: 1 };

            // Add events
            await EventLogStore.appendEvent('event1', {}, vectorClock, 'tab_1');
            await EventLogStore.appendEvent('event2', {}, vectorClock, 'tab_1');
            await EventLogStore.appendEvent('event3', {}, vectorClock, 'tab_1');

            // Create checkpoint at sequence 1
            await EventLogStore.createCheckpoint(1, {});

            // Get events since checkpoint
            const events = await EventLogStore.getEventsSinceCheckpoint(1);

            expect(events.length).toBeGreaterThan(0);
            expect(events[0].sequenceNumber).toBeGreaterThan(1);
        });
    });

    describe('Compaction', () => {
        it('should count events', async () => {
            const vectorClock = { tab_1: 1 };

            await EventLogStore.appendEvent('event1', {}, vectorClock, 'tab_1');
            await EventLogStore.appendEvent('event2', {}, vectorClock, 'tab_1');
            await EventLogStore.appendEvent('event3', {}, vectorClock, 'tab_1');

            const count = await EventLogStore.countEvents();

            expect(count).toBe(3);
        });

        it('should compact event log when threshold exceeded', async () => {
            // Create checkpoint first
            await EventLogStore.createCheckpoint(0, {});

            // Add events up to threshold
            const vectorClock = { tab_1: 1 };
            for (let i = 0; i < 10; i++) {
                await EventLogStore.appendEvent(`event${i}`, {}, vectorClock, 'tab_1');
            }

            // Manually trigger compaction with low threshold for testing
            const originalMaxEvents = EventLogStore.COMPACTION_CONFIG.maxEvents;
            EventLogStore.COMPACTION_CONFIG.maxEvents = 5;

            const result = await EventLogStore.compactEventLog();

            expect(result.deleted).toBeGreaterThan(0);
            expect(result.kept).toBeGreaterThan(0);

            // Restore original threshold
            EventLogStore.COMPACTION_CONFIG.maxEvents = originalMaxEvents;
        });

        it('should not compact when below threshold', async () => {
            const vectorClock = { tab_1: 1 };
            await EventLogStore.appendEvent('event1', {}, vectorClock, 'tab_1');

            const result = await EventLogStore.compactEventLog();

            expect(result.deleted).toBe(0);
            expect(result.kept).toBe(1);
        });
    });

    describe('Statistics', () => {
        it('should get event log stats', async () => {
            const vectorClock = { tab_1: 1 };

            await EventLogStore.appendEvent('event1', {}, vectorClock, 'tab_1');
            await EventLogStore.createCheckpoint(0, { test: 'metadata' });

            const stats = await EventLogStore.getEventLogStats();

            expect(stats.totalEvents).toBe(1);
            expect(stats.latestCheckpointSequence).toBe(0);
            expect(stats.latestCheckpointTimestamp).toBeDefined();
            expect(stats.compactionThreshold).toBeDefined();
        });
    });

    describe('Clear Operations', () => {
        it('should clear event log', async () => {
            const vectorClock = { tab_1: 1 };

            await EventLogStore.appendEvent('event1', {}, vectorClock, 'tab_1');
            await EventLogStore.createCheckpoint(0, {});

            await EventLogStore.clearEventLog();

            const count = await EventLogStore.countEvents();
            expect(count).toBe(0);

            const checkpoint = await EventLogStore.getLatestCheckpoint();
            expect(checkpoint).toBeNull();
        });
    });

    describe('Edge Cases', () => {
        it('should handle concurrent event appends', async () => {
            const vectorClock = { tab_1: 1 };

            // Append events concurrently
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(
                    EventLogStore.appendEvent(`event${i}`, { index: i }, vectorClock, 'tab_1')
                );
            }

            const events = await Promise.all(promises);

            expect(events).toHaveLength(10);

            // Check all sequence numbers are unique
            const sequenceNumbers = events.map(e => e.sequenceNumber);
            const uniqueSequenceNumbers = new Set(sequenceNumbers);
            expect(uniqueSequenceNumbers.size).toBe(10);
        });

        it('should handle empty payload', async () => {
            const vectorClock = { tab_1: 1 };

            const event = await EventLogStore.appendEvent(
                'test_event',
                {},
                vectorClock,
                'tab_1'
            );

            expect(event.payload).toEqual({});
        });

        it('should handle complex payload objects', async () => {
            const vectorClock = { tab_1: 1 };
            const complexPayload = {
                nested: {
                    object: {
                        with: ['arrays', 'and', 'numbers']
                    }
                },
                number: 42,
                string: 'test',
                boolean: true
            };

            const event = await EventLogStore.appendEvent(
                'test_event',
                complexPayload,
                vectorClock,
                'tab_1'
            );

            expect(event.payload).toEqual(complexPayload);
        });
    });
});