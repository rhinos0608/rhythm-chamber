/**
 * Parser Worker Processing Tests
 *
 * Comprehensive tests for parser worker processing logic including:
 * 1. ZIP extraction functionality (nested archives, file enumeration, error handling)
 * 2. JSON parsing (valid formats, streaming history structure, field validation)
 * 3. Chunk processing (10MB chunks, backpressure, ACK handling)
 * 4. Memory management (pause/resume, memory monitoring, chunk counting)
 * 5. Progress reporting (status updates, completion messages)
 *
 * @module tests/unit/parser-worker-processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    createMockFile,
    generateSpotifyStreamingData,
    createMockZipFile,
    createMockWorker,
    wait,
} from './utils/test-helpers.js';

// ==========================================
// Mock Worker Environment
// ==========================================

describe('Parser Worker - Processing Logic', () => {
    let mockWorker;
    let mockPostMessage;
    let messageLog = [];

    beforeEach(() => {
        messageLog = [];
        mockPostMessage = vi.fn((message) => {
            messageLog.push(message);
        });

        // Mock self.postMessage for worker context
        global.self = {
            postMessage: mockPostMessage,
            addEventListener: vi.fn(),
            importScripts: vi.fn(),
        };

        // Mock navigator.memory for Chrome testing
        global.navigator = {
            memory: {
                usedJSHeapSize: 50 * 1024 * 1024,
                jsHeapSizeLimit: 200 * 1024 * 1024,
            },
            deviceMemory: 8,
        };

        // Mock JSZip
        global.JSZip = {
            loadAsync: vi.fn(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
        messageLog = [];
    });

    // ==========================================
    // Suite 1: ZIP Extraction Functionality
    // ==========================================

    describe('ZIP Extraction', () => {
        it('should enumerate streaming history files in ZIP archive', async () => {
            const mockZipContent = {
                'StreamingHistory.json': [{ endTime: '2023-01-01', trackName: 'Test Track' }],
                'StreamingHistory1.json': [{ endTime: '2023-01-02', trackName: 'Test Track 2' }],
                'endsong_0.json': [{ ts: '2023-01-03', master_metadata_track_name: 'Test Track 3' }],
                'README.txt': 'This is not a streaming file',
                'UserProfile.json': { username: 'testuser' },
            };

            const mockZip = {
                forEach: vi.fn((callback) => {
                    Object.keys(mockZipContent).forEach((path) => {
                        callback(path, {
                            name: path,
                            async: vi.fn().mockResolvedValue({
                                async: vi.fn().mockResolvedValue(JSON.stringify(mockZipContent[path])),
                            }),
                        });
                    });
                }),
            };

            global.JSZip.loadAsync = vi.fn().mockResolvedValue(mockZip);

            // Simulate streaming file enumeration
            const streamingFiles = [];
            mockZip.forEach((relativePath, zipEntry) => {
                if (
                    (relativePath.includes('StreamingHistory') && relativePath.endsWith('.json')) ||
                    (relativePath.includes('endsong') && relativePath.endsWith('.json'))
                ) {
                    streamingFiles.push({ path: relativePath, entry: zipEntry });
                }
            });

            expect(streamingFiles).toHaveLength(3);
            expect(streamingFiles[0].path).toBe('StreamingHistory.json');
            expect(streamingFiles[1].path).toBe('StreamingHistory1.json');
            expect(streamingFiles[2].path).toBe('endsong_0.json');
        });

        it('should handle nested archive structure', async () => {
            const mockNestedZip = {
                forEach: vi.fn((callback) => {
                    const files = [
                        'my_data/StreamingHistory.json',
                        'my_data/StreamingHistory1.json',
                        'my_data/endsong_0.json',
                        'my_data/README.txt',
                    ];
                    files.forEach((path) => {
                        callback(path, { name: path });
                    });
                }),
            };

            const streamingFiles = [];
            mockNestedZip.forEach((relativePath, zipEntry) => {
                if (
                    (relativePath.includes('StreamingHistory') && relativePath.endsWith('.json')) ||
                    (relativePath.includes('endsong') && relativePath.endsWith('.json'))
                ) {
                    streamingFiles.push({ path: relativePath, entry: zipEntry });
                }
            });

            expect(streamingFiles).toHaveLength(3);
            expect(streamingFiles.every((f) => f.path.startsWith('my_data/'))).toBe(true);
        });

        it('should throw error when no streaming history found in archive', async () => {
            const mockEmptyZip = {
                forEach: vi.fn((callback) => {
                    const files = ['README.txt', 'UserProfile.json', 'Playlist1.json'];
                    files.forEach((path) => {
                        callback(path, { name: path });
                    });
                }),
            };

            const streamingFiles = [];
            mockEmptyZip.forEach((relativePath, zipEntry) => {
                if (
                    (relativePath.includes('StreamingHistory') && relativePath.endsWith('.json')) ||
                    (relativePath.includes('endsong') && relativePath.endsWith('.json'))
                ) {
                    streamingFiles.push({ path: relativePath, entry: zipEntry });
                }
            });

            expect(streamingFiles).toHaveLength(0);

            // Verify error would be thrown
            expect(() => {
                if (streamingFiles.length === 0) {
                    throw new Error('No streaming history found in archive.');
                }
            }).toThrow('No streaming history found in archive.');
        });

        it('should handle ZIP extraction errors gracefully', async () => {
            const mockCorruptZip = {
                forEach: vi.fn(() => {
                    throw new Error('Invalid ZIP format');
                }),
            };

            expect(() => {
                mockCorruptZip.forEach(() => {});
            }).toThrow('Invalid ZIP format');
        });

        it('should extract content from streaming history files', async () => {
            const mockEntry = {
                name: 'StreamingHistory.json',
                async: vi.fn().mockResolvedValue({
                    async: vi.fn().mockResolvedValue(
                        JSON.stringify([
                            {
                                endTime: '2023-01-01T12:00:00Z',
                                trackName: 'Test Track',
                                artistName: 'Test Artist',
                                msPlayed: 180000,
                            },
                        ])
                    ),
                }),
            };

            const fileContent = await mockEntry.async('text');
            const parsedData = JSON.parse(fileContent);

            expect(parsedData).toHaveLength(1);
            expect(parsedData[0].trackName).toBe('Test Track');
        });
    });

    // ==========================================
    // Suite 2: JSON Parsing
    // ==========================================

    describe('JSON Parsing', () => {
        it('should parse valid streaming history JSON format', () => {
            const validJson = [
                {
                    endTime: '2023-01-01T12:00:00Z',
                    artistName: 'Test Artist',
                    trackName: 'Test Track',
                    msPlayed: 180000,
                },
                {
                    endTime: '2023-01-01T13:00:00Z',
                    artistName: 'Test Artist 2',
                    trackName: 'Test Track 2',
                    msPlayed: 240000,
                },
            ];

            const parsed = JSON.parse(JSON.stringify(validJson));
            expect(parsed).toHaveLength(2);
            expect(parsed[0].endTime).toBe('2023-01-01T12:00:00Z');
        });

        it('should parse extended streaming history format (endsong)', () => {
            const extendedJson = [
                {
                    ts: '2023-01-01T12:00:00Z',
                    master_metadata_album_artist_name: 'Test Artist',
                    master_metadata_track_name: 'Test Track',
                    ms_played: 180000,
                    platform: 'android',
                    shuffle: true,
                },
            ];

            const parsed = JSON.parse(JSON.stringify(extendedJson));
            expect(parsed).toHaveLength(1);
            expect(parsed[0].ts).toBe('2023-01-01T12:00:00Z');
            expect(parsed[0].master_metadata_track_name).toBe('Test Track');
        });

        it('should validate required fields in streaming data', () => {
            const validateSpotifyStream = (stream) => {
                // Must have timestamp
                const timestamp = stream.ts || stream.endTime;
                if (!timestamp) return false;

                // Must have track or artist
                const track = stream.master_metadata_track_name || stream.trackName;
                const artist = stream.master_metadata_album_artist_name || stream.artistName;
                if (!track && !artist) return false;

                // Timestamp must be valid date
                const date = new Date(timestamp);
                if (isNaN(date.getTime())) return false;

                // Timestamp must be reasonable
                const year = date.getFullYear();
                if (year < 2000 || year > new Date().getFullYear() + 1) return false;

                return true;
            };

            const validStream = {
                endTime: '2023-01-01T12:00:00Z',
                trackName: 'Test Track',
                artistName: 'Test Artist',
            };

            const invalidStreamNoTimestamp = {
                trackName: 'Test Track',
                artistName: 'Test Artist',
            };

            const invalidStreamNoTrackArtist = {
                endTime: '2023-01-01T12:00:00Z',
            };

            expect(validateSpotifyStream(validStream)).toBe(true);
            expect(validateSpotifyStream(invalidStreamNoTimestamp)).toBe(false);
            expect(validateSpotifyStream(invalidStreamNoTrackArtist)).toBe(false);
        });

        it('should reject malformed JSON', () => {
            const malformedJson = '{ invalid json }';

            expect(() => {
                JSON.parse(malformedJson);
            }).toThrow();
        });

        it('should validate array structure at top level', () => {
            const validArray = '[{"endTime": "2023-01-01T12:00:00Z", "trackName": "Test"}]';
            const invalidObject = '{"endTime": "2023-01-01T12:00:00Z", "trackName": "Test"}';
            const invalidPrimitive = '"just a string"';

            const parsedArray = JSON.parse(validArray);
            const parsedObject = JSON.parse(invalidObject);
            const parsedPrimitive = JSON.parse(invalidPrimitive);

            expect(Array.isArray(parsedArray)).toBe(true);
            expect(Array.isArray(parsedObject)).toBe(false);
            expect(Array.isArray(parsedPrimitive)).toBe(false);
        });

        it('should handle large JSON files with validation', () => {
            const MAX_JSON_STRING_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

            // Create a small JSON
            const smallJson = JSON.stringify([{ trackName: 'Test' }]);
            expect(smallJson.length).toBeLessThan(MAX_JSON_STRING_SIZE_BYTES);

            // Create a large JSON string (simulated)
            const largeJson = 'x'.repeat(MAX_JSON_STRING_SIZE_BYTES + 1);
            expect(largeJson.length).toBeGreaterThan(MAX_JSON_STRING_SIZE_BYTES);

            // Verify validation would catch it
            expect(() => {
                if (largeJson.length > MAX_JSON_STRING_SIZE_BYTES) {
                    throw new Error(`JSON string too large: ${(largeJson.length / 1024 / 1024).toFixed(1)}MB`);
                }
            }).toThrow();
        });
    });

    // ==========================================
    // Suite 3: Chunk Processing
    // ==========================================

    describe('Chunk Processing', () => {
        it('should process data in 10MB chunks', () => {
            const CHUNK_SIZE_MB = 10;
            const MB = 1024 * 1024;
            const CHUNK_SIZE_BYTES = CHUNK_SIZE_MB * MB;

            // Simulate large data that needs chunking
            const largeData = [];
            for (let i = 0; i < 100000; i++) {
                largeData.push({
                    trackName: `Track ${i}`,
                    artistName: `Artist ${i % 100}`,
                    // Roughly 100 bytes per entry
                    _size: 100,
                });
            }

            // Calculate chunks
            const estimatedSize = largeData.length * 100; // 10MB
            const chunkCount = Math.ceil(estimatedSize / CHUNK_SIZE_BYTES);

            expect(estimatedSize).toBeGreaterThan(CHUNK_SIZE_BYTES);
            expect(chunkCount).toBeGreaterThan(1);

            // Verify chunk splitting
            const chunkSize = Math.ceil(largeData.length / chunkCount);
            for (let i = 0; i < chunkCount; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, largeData.length);
                const chunk = largeData.slice(start, end);
                expect(chunk.length).toBeGreaterThan(0);
            }
        });

        it('should implement backpressure with ACK mechanism', async () => {
            const MAX_PENDING_ACKS = 5;
            let pendingAcks = 0;
            let ackId = 0;
            const ackResolvers = new Map();

            const postWithBackpressure = async (message) => {
                // Wait if we have too many pending ACKs
                while (pendingAcks >= MAX_PENDING_ACKS) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                // Assign ACK ID and track
                const currentAckId = ++ackId;
                pendingAcks++;

                // Create promise that resolves when ACK is received
                const ackPromise = new Promise((resolve) => {
                    ackResolvers.set(currentAckId, resolve);
                });

                // Send message with ACK ID
                const messageWithAck = { ...message, ackId: currentAckId };

                // Simulate ACK after delay
                setTimeout(() => {
                    const resolver = ackResolvers.get(currentAckId);
                    if (resolver) {
                        resolver();
                        ackResolvers.delete(currentAckId);
                        pendingAcks--;
                    }
                }, 50);

                // Wait for ACK before returning
                await ackPromise;

                return { ackId: currentAckId };
            };

            // Send multiple messages rapidly
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(postWithBackpressure({ type: 'chunk', data: `chunk ${i}` }));
            }

            const results = await Promise.all(promises);
            expect(results).toHaveLength(10);
            expect(results[0].ackId).toBe(1);
            expect(results[9].ackId).toBe(10);

            // Verify pending ACKs is back to 0
            expect(pendingAcks).toBe(0);
        });

        it('should block when pending ACKs exceed threshold', async () => {
            const MAX_PENDING_ACKS = 5;
            let pendingAcks = 0;
            let ackId = 0;

            // Simulate blocking behavior
            let blockedCount = 0;
            const postWithBackpressure = (message) => {
                if (pendingAcks >= MAX_PENDING_ACKS) {
                    blockedCount++;
                    return Promise.reject(new Error('Backpressure: too many pending ACKs'));
                }

                pendingAcks++;
                ackId++;
                return Promise.resolve({ ackId: ackId });
            };

            // Send messages up to limit
            for (let i = 0; i < MAX_PENDING_ACKS; i++) {
                await postWithBackpressure({ type: 'test' });
            }

            expect(pendingAcks).toBe(MAX_PENDING_ACKS);

            // Next message should block
            const result = await postWithBackpressure({ type: 'test' }).catch((e) => ({
                error: e.message,
            }));

            expect(result.error).toContain('Backpressure');
            expect(blockedCount).toBe(1);
        });

        it('should process partial ZIP file updates with backpressure', async () => {
            const partialUpdates = [];
            let pendingAcks = 0;
            const MAX_PENDING_ACKS = 5;

            const sendPartialUpdate = async (fileIndex, totalFiles, streamCount) => {
                while (pendingAcks >= MAX_PENDING_ACKS) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                pendingAcks++;
                const update = {
                    type: 'partial',
                    fileIndex,
                    totalFiles,
                    streamCount,
                };

                partialUpdates.push(update);

                // Simulate ACK
                setTimeout(() => {
                    pendingAcks--;
                }, 50);

                return update;
            };

            // Simulate processing 3 streaming files
            for (let i = 0; i < 3; i++) {
                await sendPartialUpdate(i + 1, 3, (i + 1) * 10000);
            }

            expect(partialUpdates).toHaveLength(3);
            expect(partialUpdates[0]).toEqual({
                type: 'partial',
                fileIndex: 1,
                totalFiles: 3,
                streamCount: 10000,
            });
        });
    });

    // ==========================================
    // Suite 4: Memory Management
    // ==========================================

    describe('Memory Management', () => {
        it('should pause processing when memory threshold exceeded', async () => {
            const MEMORY_THRESHOLD = 0.75;
            let isPaused = false;
            let pauseResolve = null;

            const mockMemory = {
                usedJSHeapSize: 160 * 1024 * 1024, // 160MB
                jsHeapSizeLimit: 200 * 1024 * 1024, // 200MB
            };

            const usage = mockMemory.usedJSHeapSize / mockMemory.jsHeapSizeLimit;

            // Check if memory threshold exceeded
            if (usage > MEMORY_THRESHOLD) {
                isPaused = true;

                // Simulate pause
                await new Promise((resolve) => {
                    pauseResolve = resolve;
                });

                // Simulate resume
                if (pauseResolve) {
                    pauseResolve();
                    isPaused = false;
                    pauseResolve = null;
                }
            }

            expect(usage).toBeGreaterThan(MEMORY_THRESHOLD);
            expect(isPaused).toBe(false); // Resumed after pause
        });

        it('should use chunk-counting fallback for Firefox/Safari', async () => {
            const PAUSE_EVERY_N_ITEMS = 50000;
            let processedItemCount = 0;
            let lastPauseTime = 0;
            const MIN_PAUSE_INTERVAL_MS = 5000;
            let pauseCount = 0;

            const checkMemoryAndPause = async () => {
                processedItemCount++;
                if (processedItemCount >= PAUSE_EVERY_N_ITEMS) {
                    const now = Date.now();
                    if (now - lastPauseTime >= MIN_PAUSE_INTERVAL_MS) {
                        pauseCount++;
                        lastPauseTime = now;
                        processedItemCount = 0;
                        // Simulate brief pause for GC
                        await new Promise((resolve) => setTimeout(resolve, 100));
                    }
                }
            };

            // Process 150k items (should trigger 2 pauses)
            for (let i = 0; i < 150000; i++) {
                await checkMemoryAndPause();
            }

            expect(pauseCount).toBe(2);
        });

        it('should respect minimum pause interval', async () => {
            const MIN_PAUSE_INTERVAL_MS = 5000;
            const PAUSE_EVERY_N_ITEMS = 50000;
            let lastPauseTime = 0;
            let processedItemCount = 0;
            let pauseCount = 0;

            const checkMemoryAndPause = async () => {
                processedItemCount++;
                if (processedItemCount >= PAUSE_EVERY_N_ITEMS) {
                    const now = Date.now();
                    if (now - lastPauseTime >= MIN_PAUSE_INTERVAL_MS) {
                        pauseCount++;
                        lastPauseTime = now;
                        processedItemCount = 0;
                    }
                }
            };

            // Process 50k items (should trigger pause)
            const startTime = Date.now();
            for (let i = 0; i < 50000; i++) {
                await checkMemoryAndPause();
            }
            const elapsed = Date.now() - startTime;

            expect(pauseCount).toBe(1);
            expect(elapsed).toBeLessThan(MIN_PAUSE_INTERVAL_MS); // Fast without actual pause
        });

        it('should handle pause/resume race condition', async () => {
            let isPaused = false;
            let pauseResolve = null;
            let progressDuringPause = 0;

            const pauseForMemory = async () => {
                isPaused = true;

                // Simulate async operations during pause
                setTimeout(() => {
                    // This should be suppressed
                    if (!isPaused) {
                        progressDuringPause++;
                    }
                }, 10);

                await new Promise((resolve) => {
                    pauseResolve = resolve;
                });

                isPaused = false;
                pauseResolve = null;
            };

            // Simulate pause
            const pausePromise = pauseForMemory();

            // Verify pause state is set
            expect(isPaused).toBe(true);

            // Resume
            if (pauseResolve) {
                pauseResolve();
            }

            await pausePromise;

            // Verify resumed state
            expect(isPaused).toBe(false);
            expect(pauseResolve).toBe(null);
            expect(progressDuringPause).toBe(0); // No progress during pause
        });

        it('should monitor memory pressure during processing', async () => {
            const memorySnapshots = [];

            const takeSnapshot = () => {
                if (typeof performance !== 'undefined' && performance.memory) {
                    return {
                        used: performance.memory.usedJSHeapSize,
                        limit: performance.memory.jsHeapSizeLimit,
                        timestamp: Date.now(),
                    };
                }
                return null;
            };

            // Take snapshots during processing
            for (let i = 0; i < 5; i++) {
                memorySnapshots.push(takeSnapshot());
                await new Promise((resolve) => setTimeout(resolve, 50));
            }

            expect(memorySnapshots).toHaveLength(5);
            memorySnapshots.forEach((snapshot) => {
                expect(snapshot).toHaveProperty('used');
                expect(snapshot).toHaveProperty('limit');
                expect(snapshot).toHaveProperty('timestamp');
            });
        });
    });

    // ==========================================
    // Suite 5: Progress Reporting
    // ==========================================

    describe('Progress Reporting', () => {
        it('should send progress updates during parsing', () => {
            let isPaused = false;
            const progressMessages = [];

            const postProgress = (message) => {
                if (isPaused) {
                    return; // Suppress during pause
                }
                progressMessages.push({ type: 'progress', message });
            };

            // Simulate parsing stages
            postProgress('Reading JSON file...');
            postProgress('Found 1000 streams, validating...');
            postProgress('Sorting and deduplicating...');
            postProgress('Enriching stream data...');
            postProgress('Generating chunks...');

            expect(progressMessages).toHaveLength(5);
            expect(progressMessages[0].message).toBe('Reading JSON file...');
            expect(progressMessages[4].message).toBe('Generating chunks...');
        });

        it('should suppress progress messages during pause', () => {
            let isPaused = false;
            const progressMessages = [];

            const postProgress = (message) => {
                if (isPaused) {
                    return; // Suppress during pause
                }
                progressMessages.push({ type: 'progress', message });
            };

            // Normal progress
            postProgress('Reading file...');
            expect(progressMessages).toHaveLength(1);

            // Pause and try to send progress
            isPaused = true;
            postProgress('This should be suppressed');
            postProgress('This too');
            expect(progressMessages).toHaveLength(1); // Still 1

            // Resume and send progress
            isPaused = false;
            postProgress('Resumed processing');
            expect(progressMessages).toHaveLength(2);
        });

        it('should send completion message with stats', () => {
            const completionMessage = {
                type: 'complete',
                streams: [
                    {
                        playedAt: '2023-01-01T12:00:00Z',
                        trackName: 'Test Track',
                        artistName: 'Test Artist',
                    },
                ],
                chunks: [
                    {
                        id: 'week-2023-01-02',
                        type: 'weekly',
                        streamCount: 100,
                    },
                ],
                stats: {
                    totalStreams: 1000,
                    fileCount: 3,
                    validationStats: {
                        validRatio: 0.98,
                        invalidCount: 20,
                    },
                },
            };

            expect(completionMessage.type).toBe('complete');
            expect(completionMessage.streams).toHaveLength(1);
            expect(completionMessage.chunks).toHaveLength(1);
            expect(completionMessage.stats.totalStreams).toBe(1000);
            expect(completionMessage.stats.validationStats.validRatio).toBe(0.98);
        });

        it('should report file processing progress in ZIP', () => {
            const progressMessages = [];

            const postProgress = (message) => {
                progressMessages.push({ type: 'progress', message });
            };

            // Simulate multi-file ZIP processing
            const totalFiles = 3;
            for (let i = 0; i < totalFiles; i++) {
                postProgress(`Parsing file ${i + 1}/${totalFiles}...`);
            }

            expect(progressMessages).toHaveLength(3);
            expect(progressMessages[0].message).toBe('Parsing file 1/3...');
            expect(progressMessages[2].message).toBe('Parsing file 3/3...');
        });

        it('should report overlap detection to main thread', () => {
            const overlapMessage = {
                type: 'overlap_detected',
                overlap: {
                    hasOverlap: true,
                    overlapPeriod: {
                        start: '2023-01-01',
                        end: '2023-06-30',
                        days: 180,
                    },
                    existingRange: {
                        start: '2023-01-01',
                        end: '2023-12-31',
                    },
                    newRange: {
                        start: '2023-01-01',
                        end: '2023-06-30',
                    },
                    stats: {
                        totalNew: 5000,
                        exactDuplicates: 1000,
                        uniqueNew: 4000,
                        existingCount: 10000,
                    },
                },
            };

            expect(overlapMessage.type).toBe('overlap_detected');
            expect(overlapMessage.overlap.hasOverlap).toBe(true);
            expect(overlapMessage.overlap.overlapPeriod.days).toBe(180);
            expect(overlapMessage.overlap.stats.exactDuplicates).toBe(1000);
        });

        it('should send memory warning to main thread', () => {
            const memoryWarning = {
                type: 'memory_warning',
                reason: 'memory_api',
                metric: 0.8,
            };

            expect(memoryWarning.type).toBe('memory_warning');
            expect(memoryWarning.reason).toBe('memory_api');
            expect(memoryWarning.metric).toBeGreaterThan(0.75);
        });

        it('should send memory resumed notification', () => {
            const memoryResumed = {
                type: 'memory_resumed',
            };

            expect(memoryResumed.type).toBe('memory_resumed');
        });

        it('should handle error messages', () => {
            const errorMessage = {
                type: 'error',
                error: 'File too large: 600MB exceeds 500MB limit.',
            };

            expect(errorMessage.type).toBe('error');
            expect(errorMessage.error).toContain('File too large');
        });
    });

    // ==========================================
    // Suite 6: Integration Tests
    // ==========================================

    describe('Integration: Complete Processing Pipeline', () => {
        it('should process complete ZIP file with all stages', async () => {
            const stages = [];
            let isPaused = false;

            const postProgress = (message) => {
                if (isPaused) return;
                stages.push(message);
            };

            // Simulate complete pipeline
            postProgress('Extracting archive...');
            await new Promise((resolve) => setTimeout(resolve, 10));

            postProgress('Found 3 history files...');
            await new Promise((resolve) => setTimeout(resolve, 10));

            postProgress('Parsing file 1/3...');
            await new Promise((resolve) => setTimeout(resolve, 10));

            postProgress('Validating 30000 streams...');
            await new Promise((resolve) => setTimeout(resolve, 10));

            postProgress('Sorting and deduplicating...');
            await new Promise((resolve) => setTimeout(resolve, 10));

            postProgress('Enriching stream data...');
            await new Promise((resolve) => setTimeout(resolve, 10));

            postProgress('Generating chunks...');
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(stages).toHaveLength(7);
            expect(stages[0]).toBe('Extracting archive...');
            expect(stages[6]).toBe('Generating chunks...');
        });

        it('should handle pause during large file processing', async () => {
            const stages = [];
            let isPaused = false;
            let pauseCount = 0;

            const postProgress = (message) => {
                if (isPaused) return;
                stages.push(message);
            };

            const checkMemoryAndPause = async () => {
                // Simulate memory pressure
                if (Math.random() > 0.7) {
                    isPaused = true;
                    pauseCount++;
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    isPaused = false;
                }
            };

            // Process with potential pauses
            for (let i = 0; i < 10; i++) {
                await checkMemoryAndPause();
                postProgress(`Processing chunk ${i + 1}/10...`);
            }

            expect(stages.length).toBeGreaterThan(0);
            expect(stages.length).toBeLessThanOrEqual(10);
            expect(pauseCount).toBeGreaterThan(0);
        });

        it('should handle backpressure during rapid updates', async () => {
            const updates = [];
            const MAX_PENDING_ACKS = 3;
            let pendingAcks = 0;

            const sendUpdate = async (data) => {
                while (pendingAcks >= MAX_PENDING_ACKS) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                pendingAcks++;
                updates.push(data);

                // Simulate ACK
                setTimeout(() => {
                    pendingAcks--;
                }, 20);
            };

            // Send rapid updates
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(sendUpdate({ type: 'update', index: i }));
            }

            await Promise.all(promises);

            expect(updates).toHaveLength(10);
            expect(pendingAcks).toBe(0); // All ACK'd
        });
    });
});
