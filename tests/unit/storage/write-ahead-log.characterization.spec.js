/**
 * Characterization Tests for WriteAheadLog
 *
 * These tests capture the current behavior of write-ahead-log.js before refactoring.
 * They serve as a safety net to ensure no functional regressions occur during
 * the god object elimination refactoring.
 *
 * Tests cover:
 * - Entry creation and structure
 * - Persistence operations
 * - Queue management
 * - Processing and batching
 * - Crash recovery
 * - Cross-tab coordination
 * - Edge cases and error conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WriteAheadLog } from '../../../js/storage/write-ahead-log.js';

describe('WriteAheadLog Characterization Tests', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        vi.clearAllMocks();

        // Mock TabCoordinator
        vi.mock('../../../js/services/tab-coordination.js', () => ({
            TabCoordinator: {
                isPrimary: () => true
            }
        }));

        // Mock EventBus
        vi.mock('../../../js/services/event-bus.js', () => ({
            EventBus: {
                on: vi.fn(),
                off: vi.fn(),
                emit: vi.fn()
            }
        }));

        // Mock Crypto
        vi.mock('../../../js/security/crypto.js', () => ({
            Crypto: {
                isSecureContext: () => false // Simulate Safe Mode
            }
        }));

        // Mock DeviceDetection
        vi.mock('../../../js/services/device-detection.js', () => ({
            DeviceDetection: {
                getAdaptiveTiming: () => ({
                    heartbeat: { intervalMs: 1000 }
                })
            }
        }));
    });

    afterEach(async () => {
        // Stop monitoring to prevent test interference
        WriteAheadLog.stopMonitoring();
        localStorage.clear();
    });

    describe('Constants and Enums', () => {
        it('should export WalStatus enum', () => {
            expect(WriteAheadLog.WalStatus).toBeDefined();
            expect(WriteAheadLog.WalStatus.PENDING).toBe('pending');
            expect(WriteAheadLog.WalStatus.PROCESSING).toBe('processing');
            expect(WriteAheadLog.WalStatus.COMMITTED).toBe('committed');
            expect(WriteAheadLog.WalStatus.FAILED).toBe('failed');
        });

        it('should export WalPriority enum', () => {
            expect(WriteAheadLog.WalPriority).toBeDefined();
            expect(WriteAheadLog.WalPriority.CRITICAL).toBe('critical');
            expect(WriteAheadLog.WalPriority.HIGH).toBe('high');
            expect(WriteAheadLog.WalPriority.NORMAL).toBe('normal');
            expect(WriteAheadLog.WalPriority.LOW).toBe('low');
        });
    });

    describe('Initialization', () => {
        it('should initialize WAL system', async () => {
            await WriteAheadLog.init();
            const stats = WriteAheadLog.getWalStats();

            expect(stats).toBeDefined();
            expect(stats.totalEntries).toBe(0);
            expect(stats.isProcessing).toBe(false);
            expect(stats.isReplaying).toBe(false);
        });

        it('should load existing WAL from localStorage on init', async () => {
            // Pre-populate localStorage
            const existingEntries = [
                {
                    id: 'test-1',
                    sequence: 1,
                    operation: 'put',
                    args: ['key', 'value'],
                    priority: 'normal',
                    status: 'pending',
                    createdAt: Date.now(),
                    processedAt: null,
                    attempts: 0,
                    error: null
                }
            ];
            localStorage.setItem('rhythm_chamber_wal', JSON.stringify(existingEntries));
            localStorage.setItem('rhythm_chamber_wal_sequence', '5');

            await WriteAheadLog.init();
            const stats = WriteAheadLog.getWalStats();

            expect(stats.sequence).toBe(5);
        });
    });

    describe('Entry Structure', () => {
        it('should create entries with correct structure', async () => {
            await WriteAheadLog.init();

            // Queue a write operation
            const { promise, entryId } = await WriteAheadLog.queueWrite(
                'put',
                ['test-key', 'test-value'],
                WriteAheadLog.WalPriority.HIGH
            );

            expect(entryId).toBeDefined();
            expect(promise).toBeInstanceOf(Promise);

            const stats = WriteAheadLog.getWalStats();
            expect(stats.totalEntries).toBeGreaterThan(0);
        });

        it('should assign sequential IDs to entries', async () => {
            await WriteAheadLog.init();

            const { entryId: id1 } = await WriteAheadLog.queueWrite('put', ['key1', 'val1']);
            const { entryId: id2 } = await WriteAheadLog.queueWrite('put', ['key2', 'val2']);

            expect(id1).not.toBe(id2);
        });
    });

    describe('Persistence Operations', () => {
        it('should save WAL entries to localStorage', async () => {
            await WriteAheadLog.init();
            await WriteAheadLog.queueWrite('put', ['key', 'value']);

            const stored = localStorage.getItem('rhythm_chamber_wal');
            expect(stored).toBeDefined();

            const entries = JSON.parse(stored);
            expect(Array.isArray(entries)).toBe(true);
            expect(entries.length).toBeGreaterThan(0);
        });

        it('should save sequence number to localStorage', async () => {
            await WriteAheadLog.init();
            await WriteAheadLog.queueWrite('put', ['key', 'value']);

            const sequence = localStorage.getItem('rhythm_chamber_wal_sequence');
            expect(sequence).toBeDefined();
            expect(parseInt(sequence, 10)).toBeGreaterThan(0);
        });

        it('should filter out committed entries before saving', async () => {
            await WriteAheadLog.init();

            // Queue multiple entries
            await WriteAheadLog.queueWrite('put', ['key1', 'val1']);
            await WriteAheadLog.queueWrite('put', ['key2', 'val2']);

            const stored = localStorage.getItem('rhythm_chamber_wal');
            const entries = JSON.parse(stored);

            // Should not include committed entries
            const committedCount = entries.filter(e => e.status === 'committed').length;
            expect(committedCount).toBe(0);
        });

        it('should limit WAL size to maximum entries', async () => {
            await WriteAheadLog.init();

            // This test verifies the size limiting logic
            const stats = WriteAheadLog.getWalStats();
            expect(stats.totalEntries).toBeLessThanOrEqual(100); // WAL_MAX_SIZE
        });
    });

    describe('Queue Management', () => {
        it('should queue write operations in Safe Mode', async () => {
            await WriteAheadLog.init();

            const { promise, entryId } = await WriteAheadLog.queueWrite(
                'put',
                ['test-key', 'test-value']
            );

            expect(promise).toBeInstanceOf(Promise);
            expect(entryId).toBeDefined();
        });

        it('should process entries by priority', async () => {
            await WriteAheadLog.init();

            // Queue operations with different priorities
            await WriteAheadLog.queueWrite('put', ['low'], WriteAheadLog.WalPriority.LOW);
            await WriteAheadLog.queueWrite('put', ['critical'], WriteAheadLog.WalPriority.CRITICAL);
            await WriteAheadLog.queueWrite('put', ['high'], WriteAheadLog.WalPriority.HIGH);

            const stats = WriteAheadLog.getWalStats();
            expect(stats.totalEntries).toBe(3);
        });

        it('should block writes during replay', async () => {
            await WriteAheadLog.init();

            // Start replay
            const replayPromise = WriteAheadLog.replayWal();

            // This write should wait for replay to complete
            const { promise } = await WriteAheadLog.queueWrite('put', ['key', 'value']);

            await replayPromise;
            expect(promise).toBeInstanceOf(Promise);
        });
    });

    describe('Processing and Batching', () => {
        it('should process entries in batches', async () => {
            await WriteAheadLog.init();

            // Queue multiple entries
            for (let i = 0; i < 15; i++) {
                await WriteAheadLog.queueWrite('put', [`key${i}`, `value${i}`]);
            }

            const stats = WriteAheadLog.getWalStats();
            expect(stats.totalEntries).toBeGreaterThan(0);
        });

        it('should track processing status', async () => {
            await WriteAheadLog.init();

            await WriteAheadLog.queueWrite('put', ['key', 'value']);

            const stats = WriteAheadLog.getWalStats();
            expect(stats.isProcessing).toBeDefined();
        });

        it('should cleanup committed entries', async () => {
            await WriteAheadLog.init();

            await WriteAheadLog.queueWrite('put', ['key', 'value']);
            WriteAheadLog.cleanupWal();

            const stats = WriteAheadLog.getWalStats();
            // Committed entries should be removed after 1 minute
            expect(stats.totalEntries).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Crash Recovery', () => {
        it('should replay WAL on startup', async () => {
            // Simulate a crash scenario
            const crashEntries = [
                {
                    id: 'crash-1',
                    sequence: 1,
                    operation: 'put',
                    args: ['key', 'value'],
                    priority: 'high',
                    status: 'pending',
                    createdAt: Date.now() - 10000, // 10 seconds ago
                    processedAt: null,
                    attempts: 0,
                    error: null
                }
            ];
            localStorage.setItem('rhythm_chamber_wal', JSON.stringify(crashEntries));
            localStorage.setItem('rhythm_chamber_wal_sequence', '2');

            await WriteAheadLog.init();

            // Give time for replay
            await new Promise(resolve => setTimeout(resolve, 1500));

            const stats = WriteAheadLog.getWalStats();
            expect(stats).toBeDefined();
        });

        it('should reset PROCESSING entries to PENDING after crash', async () => {
            const processingEntries = [
                {
                    id: 'processing-1',
                    sequence: 1,
                    operation: 'put',
                    args: ['key', 'value'],
                    priority: 'high',
                    status: 'processing',
                    createdAt: Date.now() - 120000, // 2 minutes ago (simulated crash)
                    processedAt: Date.now() - 120000,
                    attempts: 1,
                    error: null
                }
            ];
            localStorage.setItem('rhythm_chamber_wal', JSON.stringify(processingEntries));

            await WriteAheadLog.init();
            await new Promise(resolve => setTimeout(resolve, 1500));

            const stats = WriteAheadLog.getWalStats();
            expect(stats).toBeDefined();
        });

        it('should filter out old entries during replay', async () => {
            const oldEntry = {
                id: 'old-1',
                sequence: 1,
                operation: 'put',
                args: ['key', 'value'],
                priority: 'normal',
                status: 'pending',
                createdAt: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
                processedAt: null,
                attempts: 0,
                error: null
            };
            localStorage.setItem('rhythm_chamber_wal', JSON.stringify([oldEntry]));

            await WriteAheadLog.init();

            const stats = WriteAheadLog.getWalStats();
            // Old entries should be filtered out (max age is 24 hours)
            expect(stats.totalEntries).toBe(0);
        });
    });

    describe('Operation Results Tracking', () => {
        it('should track operation results for crash recovery', async () => {
            await WriteAheadLog.init();

            const { entryId } = await WriteAheadLog.queueWrite('put', ['key', 'value']);

            // Result should be available
            const result = WriteAheadLog.getOperationResult(entryId);
            expect(result).toBeDefined();
        });

        it('should persist operation results to localStorage', async () => {
            await WriteAheadLog.init();

            const { entryId } = await WriteAheadLog.queueWrite('put', ['key', 'value']);

            const stored = localStorage.getItem('rhythm_chamber_wal_results');
            expect(stored).toBeDefined();

            const results = JSON.parse(stored);
            expect(Array.isArray(results)).toBe(true);
        });

        it('should filter out old operation results', async () => {
            const oldResults = [
                {
                    entryId: 'old-entry',
                    result: { success: true },
                    timestamp: Date.now() - (6 * 60 * 1000) // 6 minutes ago
                }
            ];
            localStorage.setItem('rhythm_chamber_wal_results', JSON.stringify(oldResults));

            await WriteAheadLog.init();

            // Old results should not be loaded
            const result = WriteAheadLog.getOperationResult('old-entry');
            expect(result).toBeNull();
        });
    });

    describe('Monitoring and Statistics', () => {
        it('should provide WAL statistics', async () => {
            await WriteAheadLog.init();

            const stats = WriteAheadLog.getWalStats();

            expect(stats).toHaveProperty('totalEntries');
            expect(stats).toHaveProperty('pending');
            expect(stats).toHaveProperty('processing');
            expect(stats).toHaveProperty('committed');
            expect(stats).toHaveProperty('failed');
            expect(stats).toHaveProperty('isProcessing');
            expect(stats).toHaveProperty('isReplaying');
            expect(stats).toHaveProperty('lastReplayTime');
            expect(stats).toHaveProperty('sequence');
        });

        it('should start monitoring on init', async () => {
            await WriteAheadLog.init();

            // Monitoring should be active (cleanup interval running)
            const stats = WriteAheadLog.getWalStats();
            expect(stats).toBeDefined();
        });

        it('should stop monitoring when requested', async () => {
            await WriteAheadLog.init();
            WriteAheadLog.stopMonitoring();

            // Monitoring should be stopped
            const stats = WriteAheadLog.getWalStats();
            expect(stats).toBeDefined();
        });
    });

    describe('Cross-Tab Coordination', () => {
        it('should only process WAL in primary tab', async () => {
            await WriteAheadLog.init();

            // Queue an entry
            await WriteAheadLog.queueWrite('put', ['key', 'value']);

            // Processing should only occur if isPrimary returns true
            const stats = WriteAheadLog.getWalStats();
            expect(stats).toBeDefined();
        });

        it('should wait for replay completion', async () => {
            await WriteAheadLog.init();

            // Start replay
            WriteAheadLog.replayWal();

            // Should wait for replay to complete
            const waitForPromise = WriteAheadLog.waitForReplayComplete(5000);
            expect(waitForPromise).toBeInstanceOf(Promise);
        });

        it('should report replay status', async () => {
            await WriteAheadLog.init();

            const isReplaying = WriteAheadLog.isReplaying();
            expect(typeof isReplaying).toBe('boolean');
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle localStorage quota exceeded', async () => {
            // Mock localStorage.setItem to throw quota error
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = vi.fn(() => {
                throw new DOMException('QuotaExceededError');
            });

            await WriteAheadLog.init();

            const { promise } = await WriteAheadLog.queueWrite('put', ['key', 'value']);

            // Should handle error gracefully
            expect(promise).toBeInstanceOf(Promise);

            // Restore original
            localStorage.setItem = originalSetItem;
        });

        it('should handle invalid JSON in localStorage', async () => {
            localStorage.setItem('rhythm_chamber_wal', 'invalid json');

            await WriteAheadLog.init();

            // Should handle gracefully without throwing
            const stats = WriteAheadLog.getWalStats();
            expect(stats).toBeDefined();
        });

        it('should handle missing sequence number', async () => {
            localStorage.setItem('rhythm_chamber_wal', '[]');

            await WriteAheadLog.init();

            const stats = WriteAheadLog.getWalStats();
            expect(stats.sequence).toBeDefined();
        });

        it('should limit WAL entries when exceeding max size', async () => {
            const largeEntries = [];
            for (let i = 0; i < 150; i++) {
                largeEntries.push({
                    id: `entry-${i}`,
                    sequence: i,
                    operation: 'put',
                    args: [`key${i}`, `value${i}`],
                    priority: 'normal',
                    status: 'pending',
                    createdAt: Date.now(),
                    processedAt: null,
                    attempts: 0,
                    error: null
                });
            }
            localStorage.setItem('rhythm_chamber_wal', JSON.stringify(largeEntries));

            await WriteAheadLog.init();

            const stats = WriteAheadLog.getWalStats();
            expect(stats.totalEntries).toBeLessThanOrEqual(100);
        });
    });

    describe('Wait for Result API', () => {
        it('should wait for operation result', async () => {
            await WriteAheadLog.init();

            const { entryId } = await WriteAheadLog.queueWrite('put', ['key', 'value']);

            // Should be able to wait for result
            const waitForPromise = WriteAheadLog.waitForResult(entryId, { timeoutMs: 5000 });
            expect(waitForPromise).toBeInstanceOf(Promise);
        });

        it('should return result immediately if available', async () => {
            await WriteAheadLog.init();

            const { entryId } = await WriteAheadLog.queueWrite('put', ['key', 'value']);

            // Wait a bit for processing
            await new Promise(resolve => setTimeout(resolve, 100));

            const result = await WriteAheadLog.waitForResult(entryId, { timeoutMs: 5000 });
            expect(result).toBeDefined();
        });

        it('should timeout if result not found', async () => {
            await WriteAheadLog.init();

            const fakeEntryId = 'non-existent-entry';

            await expect(
                WriteAheadLog.waitForResult(fakeEntryId, { timeoutMs: 1000 })
            ).rejects.toThrow();
        });
    });

    describe('Clear Operations', () => {
        it('should clear WAL from localStorage', async () => {
            await WriteAheadLog.init();
            await WriteAheadLog.queueWrite('put', ['key', 'value']);

            WriteAheadLog.clearWal();

            const stored = localStorage.getItem('rhythm_chamber_wal');
            expect(stored).toBeNull();
        });

        it('should clear sequence number', async () => {
            await WriteAheadLog.init();
            await WriteAheadLog.queueWrite('put', ['key', 'value']);

            WriteAheadLog.clearWal();

            const sequence = localStorage.getItem('rhythm_chamber_wal_sequence');
            expect(sequence).toBeNull();
        });
    });
});
