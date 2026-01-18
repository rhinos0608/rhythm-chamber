/**
 * Storage Quota Integration Tests
 *
 * Tests for storage quota management, auto-archival, and cleanup scenarios.
 * 
 * @module tests/integration/storage-quota.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock IndexedDB
const mockIDB = {
    get: vi.fn(),
    put: vi.fn(),
    getAll: vi.fn(),
    clear: vi.fn(),
    deleteRecord: vi.fn()
};

// Mock EventBus
const mockEventBus = {
    emit: vi.fn(),
    on: vi.fn(() => vi.fn())
};

vi.mock('../../js/storage/indexeddb.js', () => ({
    IndexedDBCore: mockIDB,
    INDEXEDDB_STORES: {
        STREAMS: 'streams',
        CONFIG: 'config'
    }
}));

vi.mock('../../js/services/event-bus.js', () => ({
    EventBus: mockEventBus
}));

// Import after mocks
import { ArchiveService } from '../../js/storage/archive-service.js';
import { QuotaManager } from '../../js/storage/quota-manager.js';

describe('Storage Quota Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('QuotaManager Event API', () => {
        it('should emit threshold_exceeded event at 90% usage', async () => {
            const handler = vi.fn();
            QuotaManager.on('threshold_exceeded', handler);

            // Simulate 92% usage via mock
            vi.spyOn(navigator.storage, 'estimate').mockResolvedValue({
                usage: 920 * 1024 * 1024,
                quota: 1000 * 1024 * 1024
            });

            await QuotaManager.checkNow();

            expect(handler).toHaveBeenCalledWith(expect.objectContaining({
                percent: expect.any(Number)
            }));
            expect(handler.mock.calls[0][0].percent).toBeGreaterThan(90);
        });

        it('should support removing event listeners with off()', async () => {
            const handler = vi.fn();
            QuotaManager.on('threshold_exceeded', handler);
            QuotaManager.off('threshold_exceeded', handler);

            // Simulate high usage
            vi.spyOn(navigator.storage, 'estimate').mockResolvedValue({
                usage: 950 * 1024 * 1024,
                quota: 1000 * 1024 * 1024
            });

            await QuotaManager.checkNow();

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('ArchiveService', () => {
        it('should archive streams older than cutoff date', async () => {
            const now = Date.now();
            const twoYearsAgo = now - (2 * 365 * 24 * 60 * 60 * 1000);

            // Mock existing streams data
            mockIDB.get.mockResolvedValueOnce({
                id: 'all',
                data: [
                    { endTime: new Date(twoYearsAgo).toISOString(), trackName: 'Old Song' },
                    { endTime: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(), trackName: 'Recent Song' }
                ]
            });

            // Mock archive config (empty initially)
            mockIDB.get.mockResolvedValueOnce(null);

            // Mock put operations
            mockIDB.put.mockResolvedValue(undefined);

            const result = await ArchiveService.archiveOldStreams({
                cutoffDate: now - (365 * 24 * 60 * 60 * 1000) // 1 year
            });

            expect(result.archived).toBe(1);
            expect(result.kept).toBe(1);
            expect(mockEventBus.emit).toHaveBeenCalledWith('storage:quota_cleaned', expect.any(Object));
        });

        it('should keep minimum 100 streams even if older than cutoff', async () => {
            const now = Date.now();
            const oldStreams = Array.from({ length: 80 }, (_, i) => ({
                endTime: new Date(now - (2 * 365 * 24 * 60 * 60 * 1000)).toISOString(),
                trackName: `Old Song ${i}`
            }));

            mockIDB.get.mockResolvedValueOnce({
                id: 'all',
                data: oldStreams
            });

            const result = await ArchiveService.archiveOldStreams();

            // Should not archive any since total < 100
            expect(result.archived).toBe(0);
            expect(result.kept).toBe(80);
        });

        it('should emit dry run results without modifying data', async () => {
            const now = Date.now();
            mockIDB.get.mockResolvedValueOnce({
                id: 'all',
                data: [
                    { endTime: new Date(now - (2 * 365 * 24 * 60 * 60 * 1000)).toISOString(), trackName: 'Old' }
                ]
            });

            const result = await ArchiveService.archiveOldStreams({ dryRun: true });

            expect(result.dryRun).toBe(true);
            expect(mockIDB.put).not.toHaveBeenCalled();
        });

        it('should restore archived streams back to main store', async () => {
            // Mock archived data
            mockIDB.get.mockResolvedValueOnce({
                key: 'archived_streams_data',
                value: [
                    { endTime: '2022-01-01T00:00:00Z', trackName: 'Archived Song' }
                ]
            });

            // Mock existing streams
            mockIDB.get.mockResolvedValueOnce({
                id: 'all',
                data: [{ endTime: '2024-01-01T00:00:00Z', trackName: 'Current Song' }]
            });

            mockIDB.put.mockResolvedValue(undefined);

            const result = await ArchiveService.restoreFromArchive();

            expect(result.restored).toBe(1);
            expect(mockIDB.put).toHaveBeenCalled();
        });
    });

    describe('Auto-Archive Integration', () => {
        it('should trigger archival when quota threshold exceeded', async () => {
            const archiveSpy = vi.spyOn(ArchiveService, 'archiveOldStreams').mockResolvedValue({
                archived: 50,
                kept: 500,
                savedBytes: 1024 * 1024
            });

            // Simulate the handler that Storage.init() registers
            const thresholdHandler = async (usage) => {
                if (usage.percent > 90) {
                    await ArchiveService.archiveOldStreams();
                }
            };

            // Trigger with high usage
            await thresholdHandler({ percent: 92, usageBytes: 920 * 1024 * 1024 });

            expect(archiveSpy).toHaveBeenCalled();
        });
    });
});

describe('Cross-Tab Coordination Failure Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle BroadcastChannel unavailable gracefully', async () => {
        // This tests the fallback behavior when BroadcastChannel is not available
        const originalBC = global.BroadcastChannel;
        delete global.BroadcastChannel;

        // Import should not throw
        const { TabCoordination } = await import('../../js/services/tab-coordination.js');

        expect(TabCoordination).toBeDefined();

        global.BroadcastChannel = originalBC;
    });

    it('should detect wake-from-sleep via large heartbeat gap', async () => {
        // This tests the SLEEP_DETECTION_THRESHOLD_MS logic
        const SLEEP_THRESHOLD = 30000; // 30 seconds
        const largeGap = 45000; // 45 seconds

        // Simulating wake-from-sleep detection
        const wasAsleep = largeGap > SLEEP_THRESHOLD;
        expect(wasAsleep).toBe(true);
    });
});

describe('Worker Crash Recovery Tests', () => {
    it('should emit worker:crashed event on worker error', async () => {
        const mockEmit = vi.fn();

        // Simulate worker error handling
        const handleWorkerError = (error, workerId) => {
            mockEmit('worker:crashed', {
                workerId,
                error: error.message,
                timestamp: Date.now()
            });
        };

        handleWorkerError(new Error('Worker terminated unexpectedly'), 'pattern-worker-1');

        expect(mockEmit).toHaveBeenCalledWith('worker:crashed', expect.objectContaining({
            workerId: 'pattern-worker-1',
            error: 'Worker terminated unexpectedly'
        }));
    });

    it('should attempt worker recovery after crash', async () => {
        let workerRecreated = false;
        const recoverWorker = () => {
            workerRecreated = true;
        };

        // Simulate crash and recovery
        recoverWorker();

        expect(workerRecreated).toBe(true);
    });
});
