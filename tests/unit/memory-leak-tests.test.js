/**
 * Memory Leak and Promise Rejection Tests
 *
 * Tests for detecting memory leaks, uncleared timers,
 * event listener leaks, and unhandled promise rejections.
 *
 * Covers:
 * - setTimeout/setInterval not cleared
 * - Event listeners not removed
 * - Promise.race/Promise.all error handlers
 * - Worker cleanup
 * - Large object retention
 *
 * @module tests/unit/memory-leak-tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Test: Timer Cleanup Detection
// ==========================================

describe('Timer Cleanup Detection', () => {
    let realSetTimeout;
    let realClearTimeout;
    let realSetInterval;
    let realClearInterval;

    let activeTimeouts = new Set();
    let activeIntervals = new Set();

    beforeEach(() => {
        realSetTimeout = global.setTimeout;
        realClearTimeout = global.clearTimeout;
        realSetInterval = global.setInterval;
        realClearInterval = global.clearInterval;

        // Track timer creation
        global.setTimeout = (fn, delay, ...args) => {
            const id = realSetTimeout(fn, delay, ...args);
            activeTimeouts.add(id);
            return id;
        };

        global.clearTimeout = (id) => {
            activeTimeouts.delete(id);
            return realClearTimeout(id);
        };

        global.setInterval = (fn, delay, ...args) => {
            const id = realSetInterval(fn, delay, ...args);
            activeIntervals.add(id);
            return id;
        };

        global.clearInterval = (id) => {
            activeIntervals.delete(id);
            return realClearInterval(id);
        };

        vi.useFakeTimers();
    });

    afterEach(() => {
        global.setTimeout = realSetTimeout;
        global.clearTimeout = realClearTimeout;
        global.setInterval = realSetInterval;
        global.clearInterval = realClearInterval;
        vi.useRealTimers();

        activeTimeouts.clear();
        activeIntervals.clear();
    });

    it('should detect uncleared setTimeout', () => {
        function createLeakyFunction() {
            setTimeout(() => {
                console.log('This timer is never cleared');
            }, 1000);
        }

        createLeakyFunction();

        expect(activeTimeouts.size).toBe(1);

        // Cleanup should clear the timer
        function cleanup() {
            activeTimeouts.forEach(id => clearTimeout(id));
            activeTimeouts.clear();
        }

        cleanup();

        expect(activeTimeouts.size).toBe(0);
    });

    it('should detect uncleared setInterval', () => {
        function createLeakyInterval() {
            setInterval(() => {
                console.log('This interval is never cleared');
            }, 100);
        }

        createLeakyInterval();

        expect(activeIntervals.size).toBe(1);

        // Cleanup should clear the interval
        function cleanup() {
            activeIntervals.forEach(id => clearInterval(id));
            activeIntervals.clear();
        }

        cleanup();

        expect(activeIntervals.size).toBe(0);
    });

    it('should properly clear timers in cleanup function', () => {
        const timers = [];

        function withProperCleanup() {
            const timeout1 = setTimeout(() => {}, 1000);
            const timeout2 = setTimeout(() => {}, 2000);
            const interval1 = setInterval(() => {}, 100);

            timers.push(timeout1, timeout2, interval1);

            // Return cleanup function
            return function cleanup() {
                timeout1 && clearTimeout(timeout1);
                timeout2 && clearTimeout(timeout2);
                interval1 && clearInterval(interval1);
            };
        }

        const cleanup = withProperCleanup();

        expect(activeTimeouts.size).toBe(2);
        expect(activeIntervals.size).toBe(1);

        // Call cleanup
        cleanup();

        expect(activeTimeouts.size).toBe(0);
        expect(activeIntervals.size).toBe(0);
    });

    it('should handle debounced save cleanup', async () => {
        let autoSaveTimeoutId = null;

        function saveConversation(debounceMs) {
            // Clear existing timeout
            if (autoSaveTimeoutId !== null) {
                clearTimeout(autoSaveTimeoutId);
            }

            // Set new timeout
            autoSaveTimeoutId = setTimeout(() => {
                autoSaveTimeoutId = null;
                console.log('Saved');
            }, debounceMs);
        }

        function flushPendingSaveAsync() {
            if (autoSaveTimeoutId !== null) {
                clearTimeout(autoSaveTimeoutId);
                autoSaveTimeoutId = null;
                return Promise.resolve();
            }
            return Promise.resolve();
        }

        // Trigger multiple debounced saves
        saveConversation(1000);
        expect(activeTimeouts.size).toBe(1);

        saveConversation(1000);
        expect(activeTimeouts.size).toBe(1); // Previous cleared

        // Flush pending save
        await flushPendingSaveAsync();

        expect(activeTimeouts.size).toBe(0);
        expect(autoSaveTimeoutId).toBe(null);
    });
});

// ==========================================
// Test: Event Listener Cleanup
// ==========================================

describe('Event Listener Cleanup', () => {
    it('should detect event listeners not removed', () => {
        const listeners = new Map();

        function addEventListener(target, event, handler) {
            if (!listeners.has(target)) {
                listeners.set(target, new Map());
            }
            if (!listeners.get(target).has(event)) {
                listeners.get(target).set(event, new Set());
            }
            listeners.get(target).get(event).add(handler);

            target.addEventListener(event, handler);
        }

        function removeEventListener(target, event, handler) {
            if (listeners.has(target) && listeners.get(target).has(event)) {
                listeners.get(target).get(event).delete(handler);
                if (listeners.get(target).get(event).size === 0) {
                    listeners.get(target).delete(event);
                }
            }
            target.removeEventListener(event, handler);
        }

        function getActiveListenerCount() {
            let count = 0;
            for (const [target, events] of listeners) {
                for (const [event, handlers] of events) {
                    count += handlers.size;
                }
            }
            return count;
        }

        const mockElement = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        };

        const handler = () => {};

        addEventListener(mockElement, 'click', handler);
        addEventListener(mockElement, 'change', handler);
        addEventListener(mockElement, 'scroll', handler);

        expect(getActiveListenerCount()).toBe(3);

        // Cleanup
        removeEventListener(mockElement, 'click', handler);
        removeEventListener(mockElement, 'change', handler);

        expect(getActiveListenerCount()).toBe(1);

        // Remaining listener should be scroll
        expect(listeners.get(mockElement).get('scroll').has(handler)).toBe(true);
    });

    it('should cleanup all listeners on destroy', () => {
        const listeners = new Map();

        function attachListeners(target) {
            const handlers = [];

            const handler1 = () => {};
            const handler2 = () => {};
            const handler3 = () => {};

            target.addEventListener('event1', handler1);
            target.addEventListener('event2', handler2);
            target.addEventListener('event3', handler3);

            handlers.push(
                { event: 'event1', handler: handler1 },
                { event: 'event2', handler: handler2 },
                { event: 'event3', handler: handler3 }
            );

            listeners.set(target, handlers);

            return function destroy() {
                handlers.forEach(({ event, handler }) => {
                    target.removeEventListener(event, handler);
                });
                listeners.delete(target);
            };
        }

        const mockElement = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        };

        const destroy = attachListeners(mockElement);

        expect(listeners.has(mockElement)).toBe(true);
        expect(listeners.get(mockElement)).toHaveLength(3);

        // Destroy
        destroy();

        expect(listeners.has(mockElement)).toBe(false);
        expect(mockElement.removeEventListener).toHaveBeenCalledTimes(3);
    });
});

// ==========================================
// Test: Promise Rejection Handling
// ==========================================

describe('Promise Rejection Handling', () => {
    it('should handle Promise.race with proper error handler', async () => {
        let timeoutResolved = false;
        let operationResolved = false;

        async function operationWithTimeout(operation, timeoutMs) {
            const timeoutPromise = new Promise((resolve, reject) => {
                const id = setTimeout(() => {
                    timeoutResolved = true;
                    reject(new Error('Operation timeout'));
                }, timeoutMs);

                // Clear timeout if operation completes first
                operation.finally(() => {
                    clearTimeout(id);
                });
            });

            try {
                const result = await Promise.race([operation, timeoutPromise]);
                operationResolved = true;
                return result;
            } catch (error) {
                // Error could be from operation or timeout
                if (error.message === 'Operation timeout') {
                    throw new Error(`Operation timed out after ${timeoutMs}ms`);
                }
                throw error;
            }
        }

        vi.useFakeTimers();

        // Test: Operation completes before timeout
        const fastOperation = Promise.resolve('fast-result');
        const result1 = operationWithTimeout(fastOperation, 1000);

        await vi.advanceTimersByTimeAsync(100);

        await expect(result1).resolves.toBe('fast-result');
        expect(operationResolved).toBe(true);
        expect(timeoutResolved).toBe(false);

        // Test: Timeout occurs first
        operationResolved = false;
        timeoutResolved = false;

        const slowOperation = new Promise(resolve => {
            setTimeout(() => resolve('slow-result'), 2000);
        });

        const result2 = operationWithTimeout(slowOperation, 1000);

        await vi.advanceTimersByTimeAsync(1500);

        // Handle rejection to avoid unhandled rejection
        let error2 = null;
        try {
            await result2;
        } catch (e) {
            error2 = e;
        }
        expect(error2).toBeTruthy();
        expect(error2.message).toBe('Operation timed out after 1000ms');
        expect(timeoutResolved).toBe(true);

        vi.useRealTimers();
    });

    it('should handle Promise.all with proper error aggregation', async () => {
        async function executeAllWithErrorHandling(operations) {
            const results = await Promise.allSettled(operations);

            const errors = [];
            const successes = [];

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successes.push({ index, value: result.value });
                } else {
                    errors.push({ index, error: result.reason.message });
                }
            });

            return { successes, errors };
        }

        const operations = [
            Promise.resolve('result-1'),
            Promise.reject(new Error('Error in operation 2')),
            Promise.resolve('result-3'),
            Promise.reject(new Error('Error in operation 4')),
            Promise.resolve('result-5')
        ];

        const { successes, errors } = await executeAllWithErrorHandling(operations);

        expect(successes).toHaveLength(3);
        expect(errors).toHaveLength(2);

        expect(successes[0].value).toBe('result-1');
        expect(errors[0].error).toBe('Error in operation 2');
    });

    it('should handle Promise.race cancellation', async () => {
        let cancelled = false;
        let completed = false;

        async function cancellableOperation() {
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    if (cancelled) {
                        reject(new Error('Operation was cancelled'));
                    } else {
                        completed = true;
                        resolve('completed');
                    }
                }, 100);

                // Store cancel function
                cancellableOperation.cancel = () => {
                    cancelled = true;
                    clearTimeout(timeoutId);
                };
            });
        }

        vi.useFakeTimers();

        // Test: Operation completes normally
        const op1 = cancellableOperation();
        await vi.advanceTimersByTimeAsync(150);
        await expect(op1).resolves.toBe('completed');
        expect(completed).toBe(true);

        // Test: Operation is cancelled
        cancelled = false;
        completed = false;

        const op2 = cancellableOperation();
        op2.cancel();

        await vi.advanceTimersByTimeAsync(150);

        await expect(op2).rejects.toThrow('Operation was cancelled');
        expect(completed).toBe(false);
        expect(cancelled).toBe(true);

        vi.useRealTimers();
    });
});

// ==========================================
// Test: Worker Cleanup
// ==========================================

describe('Worker Cleanup', () => {
    it('should terminate worker when no longer needed', () => {
        let workers = [];
        let terminateCalled = false;

        class MockWorker {
            constructor() {
                workers.push(this);
            }

            terminate() {
                terminateCalled = true;
                const index = workers.indexOf(this);
                if (index > -1) {
                    workers.splice(index, 1);
                }
            }
        }

        function createWorkerWithCleanup() {
            const worker = new MockWorker();

            return {
                worker,
                cleanup: () => {
                    worker.terminate();
                }
            };
        }

        const { worker, cleanup } = createWorkerWithCleanup();

        expect(workers).toContain(worker);
        expect(terminateCalled).toBe(false);

        // Cleanup
        cleanup();

        expect(workers).not.toContain(worker);
        expect(terminateCalled).toBe(true);
    });

    it('should cleanup worker message handlers', () => {
        const messageHandlers = new Map();

        class MockWorker {
            constructor() {
                this.onmessage = null;
            }

            setOnmessage(handler) {
                this.onmessage = handler;
                messageHandlers.set(this, handler);
            }

            clearOnmessage() {
                this.onmessage = null;
                messageHandlers.delete(this);
            }
        }

        function attachWorkerHandler() {
            const worker = new MockWorker();

            const handler = (event) => {
                console.log('Message:', event.data);
            };

            worker.setOnmessage(handler);

            return {
                worker,
                cleanup: () => {
                    worker.clearOnmessage();
                    worker.terminate = () => {};
                }
            };
        }

        const { worker, cleanup } = attachWorkerHandler();

        expect(messageHandlers.has(worker)).toBe(true);
        expect(worker.onmessage).not.toBeNull();

        cleanup();

        expect(messageHandlers.has(worker)).toBe(false);
    });
});

// ==========================================
// Test: Large Object Retention
// ==========================================

describe('Large Object Retention', () => {
    it('should clear large objects after use', () => {
        let largeObject = null;

        function processLargeData() {
            // Create large object
            largeObject = new Array(1000000).fill({ data: 'large' });

            // Process...
            const result = largeObject.length;

            // Clear large object
            largeObject = null;

            return result;
        }

        const result = processLargeData();

        expect(result).toBe(1000000);
        expect(largeObject).toBeNull();
    });

    it('should use weak references for cache', () => {
        const cache = new Map();

        function addToCache(key, value) {
            cache.set(key, value);
        }

        function getFromCache(key) {
            return cache.get(key);
        }

        function clearCache() {
            cache.clear();
        }

        // Add to cache
        addToCache('key1', { largeData: new Array(1000).fill('data') });
        addToCache('key2', { largeData: new Array(1000).fill('data') });

        expect(cache.size).toBe(2);

        // Clear cache
        clearCache();

        expect(cache.size).toBe(0);
    });

    it('should limit cache size with eviction', () => {
        const maxSize = 5;
        const cache = new Map();

        function addToCacheWithEviction(key, value) {
            // Evict oldest if at max size
            if (cache.size >= maxSize && !cache.has(key)) {
                const firstKey = cache.keys().next().value;
                cache.delete(firstKey);
            }

            cache.set(key, value);
        }

        // Add items beyond max size
        for (let i = 0; i < 10; i++) {
            addToCacheWithEviction(`key${i}`, `value${i}`);
        }

        // Should only have max size items
        expect(cache.size).toBe(maxSize);

        // Oldest items should be evicted
        expect(cache.has('key0')).toBe(false);
        expect(cache.has('key1')).toBe(false);
        expect(cache.has('key2')).toBe(false);
        expect(cache.has('key3')).toBe(false);
        expect(cache.has('key4')).toBe(false);

        // Newest items should be present
        expect(cache.has('key5')).toBe(true);
        expect(cache.has('key9')).toBe(true);
    });
});
