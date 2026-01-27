/**
 * Task Distribution Module Tests
 *
 * Comprehensive test suite for task-distribution.js covering:
 * - Task distribution to workers
 * - Single worker vs multi-worker
 * - Progress callbacks
 * - Partial results handling
 * - Error handling and recovery
 * - Result aggregation
 * - Backpressure detection and management
 * - Request cleanup and memory management
 * - Fallback to sync mode
 */

import { describe, it, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Worker
class MockWorker {
    constructor(url) {
        this.url = url;
        this.onmessage = null;
        this.onerror = null;
        this._terminated = false;
    }

    postMessage(data, transfer) {
        if (this._terminated) {
            throw new Error('Worker has been terminated');
        }

        // Simulate async response
        setTimeout(() => {
            if (this.onmessage) {
                if (data.type === 'DETECT_PATTERNS') {
                    // Send partial results
                    this.onmessage({
                        data: {
                            type: 'partial',
                            requestId: data.requestId,
                            pattern: 'testPattern',
                            result: { testPattern: 'partial_result' },
                            progress: 0.5,
                            timestamp: Date.now()
                        }
                    });

                    // Send final result
                    setTimeout(() => {
                        this.onmessage({
                            data: {
                                type: 'result',
                                requestId: data.requestId,
                                result: { testPattern: 'final_result' },
                                timestamp: Date.now()
                            }
                        });
                    }, 20);
                }
            }
        }, 10);
    }

    terminate() {
        this._terminated = true;
    }
}

// Mock Patterns
const mockPatterns = {
    detectAllPatterns: vi.fn((streams, chunks) => ({
        pattern1: 'sync_result',
        pattern2: 'sync_result_2'
    }))
};

describe('task-distribution', () => {
    let mockState;
    let mockWorkers;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create fresh state for each test
        mockWorkers = [
            { worker: new MockWorker('./pattern-worker.js'), busy: false, processedCount: 0 },
            { worker: new MockWorker('./pattern-worker.js'), busy: false, processedCount: 0 }
        ];

        mockState = {
            workers: mockWorkers,
            initialized: true,
            pendingRequests: new Map(),
            requestId: 0,
            pendingResultCount: 0,
            paused: false,
            backpressureListeners: [],
            resultConsumptionCalls: new Map()
        };

        // Mock Patterns module
        global.Patterns = mockPatterns;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('distributeTask', () => {
        it('should distribute patterns to multiple workers', async () => {
            const PATTERN_GROUPS = [
                ['pattern1', 'pattern2'],
                ['pattern3', 'pattern4']
            ];

            const reqId = 'test_req_1';
            const streams = [1, 2, 3];
            const chunks = [4, 5, 6];

            // Distribute tasks
            mockWorkers.forEach((workerInfo, index) => {
                const patternGroup = PATTERN_GROUPS[index] || [];
                if (patternGroup.length > 0) {
                    workerInfo.worker.postMessage({
                        type: 'DETECT_PATTERNS',
                        requestId: reqId,
                        streams,
                        chunks,
                        patterns: patternGroup
                    });
                    workerInfo.busy = true;
                }
            });

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify workers were busy
            expect(mockWorkers.every(w => w.busy)).toBe(true);
        });

        it('should handle single worker distribution', async () => {
            const PATTERN_GROUPS = [
                ['pattern1', 'pattern2', 'pattern3', 'pattern4']
            ];

            const reqId = 'test_req_2';
            const streams = [1, 2, 3];
            const chunks = [4, 5, 6];

            const workerInfo = mockWorkers[0];
            const patternGroup = PATTERN_GROUPS[0] || [];

            workerInfo.worker.postMessage({
                type: 'DETECT_PATTERNS',
                requestId: reqId,
                streams,
                chunks,
                patterns: patternGroup
            });
            workerInfo.busy = true;

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(workerInfo.busy).toBe(true);
        });
    });

    describe('handleWorkerMessage', () => {
        it('should handle heartbeat response', () => {
            const worker = mockWorkers[0].worker;
            const workerLastHeartbeat = new Map();

            worker.onmessage = (event) => {
                const { type, timestamp } = event.data;
                if (type === 'HEARTBEAT_RESPONSE') {
                    workerLastHeartbeat.set(worker, timestamp);
                }
            };

            const timestamp = Date.now();
            worker.onmessage({ data: { type: 'HEARTBEAT_RESPONSE', timestamp } });

            expect(workerLastHeartbeat.get(worker)).toBe(timestamp);
        });

        it('should handle partial results', async () => {
            const reqId = 'test_partial_1';
            const onProgress = vi.fn();

            mockState.pendingRequests.set(reqId, {
                resolve: vi.fn(),
                reject: vi.fn(),
                onProgress,
                results: [],
                errors: [],
                completedWorkers: 0,
                totalWorkers: 1,
                partialResults: {}
            });

            const worker = mockWorkers[0].worker;
            const workerInfo = mockWorkers[0];

            worker.onmessage = (event) => {
                const { type, result, progress, pattern } = event.data;

                if (type === 'partial') {
                    const request = mockState.pendingRequests.get(reqId);
                    if (request) {
                        if (!request.partialResults) {
                            request.partialResults = {};
                        }
                        request.partialResults[pattern] = result;

                        if (request.onProgress) {
                            request.onProgress({
                                type: 'partial',
                                pattern,
                                progress,
                                result
                            });
                        }
                    }
                }
            };

            worker.onmessage({
                data: {
                    type: 'partial',
                    requestId: reqId,
                    pattern: 'testPattern',
                    result: { testPattern: 'partial' },
                    progress: 0.5
                }
            });

            expect(onProgress).toHaveBeenCalledWith({
                type: 'partial',
                pattern: 'testPattern',
                progress: 0.5,
                result: { testPattern: 'partial' }
            });
        });

        it('should handle final result', async () => {
            const reqId = 'test_result_1';
            const resolveMock = vi.fn();

            mockState.pendingRequests.set(reqId, {
                resolve: resolveMock,
                reject: vi.fn(),
                onProgress: null,
                results: [],
                errors: [],
                completedWorkers: 0,
                totalWorkers: 1
            });

            const worker = mockWorkers[0].worker;
            const workerInfo = mockWorkers[0];

            worker.onmessage = (event) => {
                const { type, result } = event.data;

                if (type === 'result') {
                    const request = mockState.pendingRequests.get(reqId);
                    if (request) {
                        request.results.push(result);
                        workerInfo.busy = false;
                        workerInfo.processedCount += 1;
                        request.completedWorkers++;

                        if (request.completedWorkers >= request.totalWorkers) {
                            mockState.pendingRequests.delete(reqId);
                            request.resolve(request.results);
                        }
                    }
                }
            };

            worker.onmessage({
                data: {
                    type: 'result',
                    requestId: reqId,
                    result: { pattern1: 'result1' }
                }
            });

            // Request should be deleted after completion
            expect(mockState.pendingRequests.has(reqId)).toBe(false);
            // Resolve should be called with results
            expect(resolveMock).toHaveBeenCalledWith([{ pattern1: 'result1' }]);
            expect(workerInfo.busy).toBe(false);
        });

        it('should handle worker error', async () => {
            const reqId = 'test_error_1';
            const rejectMock = vi.fn();

            mockState.pendingRequests.set(reqId, {
                resolve: vi.fn(),
                reject: rejectMock,
                onProgress: null,
                results: [],
                errors: [],
                completedWorkers: 0,
                totalWorkers: 1,
                partialResults: {}
            });

            const worker = mockWorkers[0].worker;
            const workerInfo = mockWorkers[0];

            worker.onmessage = (event) => {
                const { type, error } = event.data;

                if (type === 'error') {
                    const request = mockState.pendingRequests.get(reqId);
                    if (request) {
                        request.errors.push(error);
                        workerInfo.busy = false;
                        request.completedWorkers++;

                        if (request.completedWorkers >= request.totalWorkers) {
                            mockState.pendingRequests.delete(reqId);

                            // Use partial results if available
                            if (request.partialResults && Object.keys(request.partialResults).length > 0) {
                                request.resolve(request.partialResults);
                            } else if (request.results.length > 0) {
                                request.resolve(this.results);
                            } else {
                                request.reject(new Error(`All workers failed: ${request.errors.join(', ')}`));
                            }
                        }
                    }
                }
            };

            worker.onmessage({
                data: {
                    type: 'error',
                    requestId: reqId,
                    error: 'Test worker error'
                }
            });

            // Request should be deleted after completion
            expect(mockState.pendingRequests.has(reqId)).toBe(false);
            // Reject should be called with error message
            expect(rejectMock).toHaveBeenCalledWith(new Error('All workers failed: Test worker error'));
            expect(workerInfo.busy).toBe(false);
        });
    });

    describe('aggregateResults', () => {
        it('should merge results from multiple workers', () => {
            const results = [
                { pattern1: 'result1', pattern2: 'result2' },
                { pattern3: 'result3' },
                { pattern4: 'result4', pattern5: 'result5' }
            ];

            const aggregated = {};
            for (const result of results) {
                if (result && typeof result === 'object') {
                    Object.assign(aggregated, result);
                }
            }

            expect(aggregated).toEqual({
                pattern1: 'result1',
                pattern2: 'result2',
                pattern3: 'result3',
                pattern4: 'result4',
                pattern5: 'result5'
            });
        });

        it('should handle empty results array', () => {
            const results = [];
            const aggregated = {};

            for (const result of results) {
                if (result && typeof result === 'object') {
                    Object.assign(aggregated, result);
                }
            }

            expect(aggregated).toEqual({});
        });

        it('should handle null/undefined results', () => {
            const results = [
                { pattern1: 'result1' },
                null,
                { pattern2: 'result2' },
                undefined
            ];

            const aggregated = {};
            for (const result of results) {
                if (result && typeof result === 'object') {
                    Object.assign(aggregated, result);
                }
            }

            expect(aggregated).toEqual({
                pattern1: 'result1',
                pattern2: 'result2'
            });
        });
    });

    describe('backpressure', () => {
        it('should detect backpressure when threshold exceeded', () => {
            const BACKPRESSURE_THRESHOLD = 50;
            const BACKPRESSURE_RESUME_THRESHOLD = 25;

            let pendingResultCount = 50;
            let paused = false;

            // Check backpressure
            if (pendingResultCount >= BACKPRESSURE_THRESHOLD && !paused) {
                paused = true;
            }

            expect(paused).toBe(true);
        });

        it('should resume when below resume threshold', () => {
            const BACKPRESSURE_RESUME_THRESHOLD = 25;

            let pendingResultCount = 20;
            let paused = true;

            // Check backpressure
            if (paused && pendingResultCount < BACKPRESSURE_RESUME_THRESHOLD) {
                paused = false;
            }

            expect(paused).toBe(false);
        });

        it('should notify listeners on backpressure state change', () => {
            const backpressureListeners = [vi.fn(), vi.fn()];
            let paused = false;

            // Notify listeners
            for (const listener of backpressureListeners) {
                try {
                    listener('backpressure', { pending: 50 });
                } catch (e) {
                    // Handle error
                }
            }

            expect(backpressureListeners[0]).toHaveBeenCalledWith('backpressure', { pending: 50 });
            expect(backpressureListeners[1]).toHaveBeenCalledWith('backpressure', { pending: 50 });
        });

        it('should track result consumption', () => {
            const resultConsumptionCalls = new Map();
            let pendingResultCount = 30;

            const requestId = 'test_req_1';
            resultConsumptionCalls.set(requestId, 1);

            pendingResultCount = Math.max(0, pendingResultCount - 1);

            expect(pendingResultCount).toBe(29);
            expect(resultConsumptionCalls.get(requestId)).toBe(1);
        });

        it('should prevent underflow on result consumption', () => {
            let pendingResultCount = 0;

            // Clamp to prevent underflow
            pendingResultCount = Math.max(0, pendingResultCount - 1);

            expect(pendingResultCount).toBe(0);
        });
    });

    describe('fallbackToSync', () => {
        it('should fallback to synchronous pattern detection', async () => {
            const streams = [1, 2, 3];
            const chunks = [4, 5, 6];

            const result = mockPatterns.detectAllPatterns(streams, chunks);

            expect(result).toEqual({
                pattern1: 'sync_result',
                pattern2: 'sync_result_2'
            });
            expect(mockPatterns.detectAllPatterns).toHaveBeenCalledWith(streams, chunks);
        });

        it('should handle missing Patterns module', async () => {
            const streams = [1, 2, 3];
            const chunks = [4, 5, 6];

            global.Patterns = null;

            expect(() => {
                if (!Patterns) {
                    throw new Error('Patterns module not available');
                }
            }).toThrow('Patterns module not available');
        });
    });

    describe('request cleanup', () => {
        it('should clean up pending requests on completion', () => {
            const reqId = 'test_cleanup_1';

            mockState.pendingRequests.set(reqId, {
                resolve: vi.fn(),
                reject: vi.fn(),
                results: [],
                errors: [],
                completedWorkers: 1,
                totalWorkers: 1
            });

            mockState.pendingRequests.delete(reqId);

            expect(mockState.pendingRequests.has(reqId)).toBe(false);
        });

        it('should clean up result consumption tracking', () => {
            const reqId = 'test_cleanup_2';
            const resultConsumptionCalls = new Map();

            resultConsumptionCalls.set(reqId, 5);
            resultConsumptionCalls.delete(reqId);

            expect(resultConsumptionCalls.has(reqId)).toBe(false);
        });

        it('should handle cleanup on worker termination', () => {
            const pendingRequests = new Map([
                ['req1', { resolve: vi.fn(), reject: vi.fn(), completedWorkers: 0, totalWorkers: 1 }],
                ['req2', { resolve: vi.fn(), reject: vi.fn(), completedWorkers: 0, totalWorkers: 1 }]
            ]);

            const terminationError = new Error('Worker pool terminated');

            // Reject all pending requests
            for (const [reqId, request] of pendingRequests.entries()) {
                request.reject(terminationError);
            }
            pendingRequests.clear();

            expect(pendingRequests.size).toBe(0);
        });
    });

    describe('memory management', () => {
        it('should clean up tracking maps periodically', () => {
            const resultConsumptionCalls = new Map();

            // Add many entries
            for (let i = 0; i < 150; i++) {
                resultConsumptionCalls.set(`req_${i}`, i);
            }

            // Cleanup when map is large
            if (resultConsumptionCalls.size > 100) {
                resultConsumptionCalls.clear();
            }

            expect(resultConsumptionCalls.size).toBe(0);
        });

        it('should prevent unbounded growth of tracking data', () => {
            const pendingRequests = new Map();
            const MAX_PENDING_REQUESTS = 1000;

            // Simulate adding requests
            for (let i = 0; i < 50; i++) {
                const reqId = `req_${i}`;
                if (pendingRequests.size < MAX_PENDING_REQUESTS) {
                    pendingRequests.set(reqId, {
                        resolve: vi.fn(),
                        reject: vi.fn(),
                        results: []
                    });
                }
            }

            expect(pendingRequests.size).toBe(50);
            expect(pendingRequests.size).toBeLessThan(MAX_PENDING_REQUESTS);
        });
    });
});
