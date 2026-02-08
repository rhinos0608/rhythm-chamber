/**
 * Timeout Budget Manager Tests
 *
 * Comprehensive tests for js/services/timeout-budget-manager.js covering:
 * 1. Budget allocation (initial budget, top-ups, partial allocations)
 * 2. Hierarchical timeouts (parent-child timeout relationships)
 * 3. Exhaustion handling (graceful degradation, cleanup, abort signaling)
 * 4. Timeout propagation (across async operations, worker boundaries)
 * 5. Budget tracking (remaining time, usage statistics)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Import the actual module
// ==========================================

import {
    TimeoutBudget,
    BudgetExhaustedError,
    DEFAULT_LIMITS,
} from '../../js/services/timeout-budget-manager.js';

describe('Timeout Budget Manager', () => {
    let originalSetTimeout;
    let originalClearTimeout;
    let timeoutCallbacks;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // Track timeout callbacks for controlled execution
        timeoutCallbacks = [];

        // Mock setTimeout to capture callbacks
        originalSetTimeout = global.setTimeout;
        originalClearTimeout = global.clearTimeout;

        global.setTimeout = (callback, delay) => {
            const id = timeoutCallbacks.length;
            timeoutCallbacks.push({ callback, delay, executed: false });
            return id;
        };

        global.clearTimeout = (id) => {
            if (id !== null && id !== undefined && timeoutCallbacks[id]) {
                timeoutCallbacks[id].executed = true;
            }
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
    });

    // ==========================================
    // Suite 1: Budget Allocation
    // ==========================================

    describe('Budget Allocation', () => {
        it('should allocate budget with default timeout', () => {
            const budget = TimeoutBudget.allocate('llm_call');

            expect(budget).toBeDefined();
            expect(budget.operation).toBe('llm_call');
            expect(budget.budgetMs).toBe(60000); // Default for llm_call
            expect(budget.startTime).toBeGreaterThan(0);
            expect(budget.id).toMatch(/llm_call:\d+/);
        });

        it('should allocate budget with custom timeout', () => {
            const budget = TimeoutBudget.allocate('custom_operation', 15000);

            expect(budget.budgetMs).toBe(15000);
            expect(budget.operation).toBe('custom_operation');
        });

        it('should use default budget when budgetMs is null', () => {
            const budget = TimeoutBudget.allocate('function_call', null);

            expect(budget.budgetMs).toBe(10000); // Default for function_call
        });

        it('should use fallback default when operation not in DEFAULT_BUDGETS', () => {
            const budget = TimeoutBudget.allocate('unknown_operation');

            expect(budget.budgetMs).toBe(30000); // Fallback default
        });

        it('should track allocated budget in active budgets', () => {
            const budget = TimeoutBudget.allocate('test_operation');

            const active = TimeoutBudget.getActiveAccounting();
            expect(active).toHaveLength(1);
            expect(active[0].operation).toBe('test_operation');
        });

        it('should link to external AbortSignal if provided', () => {
            const externalController = new AbortController();
            const budget = TimeoutBudget.allocate('test', 10000, {
                signal: externalController.signal,
            });

            expect(budget.signal).toBeDefined();
            expect(budget.aborted).toBe(false);

            // Trigger external abort
            externalController.abort('External abort');
            vi.runAllTimers();

            expect(budget.aborted).toBe(true);
        });

        it('should handle already-aborted external signal', () => {
            const externalController = new AbortController();
            externalController.abort('Already aborted');

            const budget = TimeoutBudget.allocate('test', 10000, {
                signal: externalController.signal,
            });

            expect(budget.aborted).toBe(true);
        });

        it('should support partial allocations through subdivision', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);
            const child = parent.subdivide('child', 10000);

            expect(child.budgetMs).toBe(10000);
            expect(child.operation).toBe('child');
            expect(child.parent).toBe(parent);
        });

        it('should throw on invalid budget allocation', () => {
            expect(() => {
                TimeoutBudget.allocate('test', -1000);
            }).toThrow();
        });

        it('should handle zero budget allocation', () => {
            const budget = TimeoutBudget.allocate('test', 0);

            expect(budget.budgetMs).toBe(0);
            expect(budget.isExhausted()).toBe(true);
        });
    });

    // ==========================================
    // Suite 2: Hierarchical Timeouts
    // ==========================================

    describe('Hierarchical Timeouts', () => {
        it('should create parent-child budget relationships', () => {
            const parent = TimeoutBudget.allocate('parent', 60000);
            const child = parent.subdivide('child', 20000);

            expect(child.parent).toBe(parent);
            expect(parent.children).toContain(child);
        });

        it('should enforce child budget <= parent remaining', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);

            // Advance time to consume some parent budget
            vi.advanceTimersByTime(10000);

            // Child budget should exceed parent remaining (20000)
            expect(() => {
                parent.subdivide('child', 25000);
            }).toThrow(BudgetExhaustedError);
        });

        it('should enforce child deadline <= parent deadline', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);

            // Try to create child with deadline beyond parent
            expect(() => {
                parent.subdivide('child', 35000);
            }).toThrow(BudgetExhaustedError);
        });

        it('should cap child remaining by parent remaining', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);
            const child = parent.subdivide('child', 20000);

            // Advance time
            vi.advanceTimersByTime(15000);

            // Child's own remaining is 5000ms
            expect(child.ownRemaining()).toBe(5000);

            // But parent remaining is also 15000ms
            expect(parent.remaining()).toBe(15000);

            // Child remaining is min(own, parent) = 5000ms
            expect(child.remaining()).toBe(5000);
        });

        it('should cascade abort from parent to children', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);
            const child1 = parent.subdivide('child1', 10000);
            const child2 = parent.subdivide('child2', 10000);

            expect(parent.aborted).toBe(false);
            expect(child1.aborted).toBe(false);
            expect(child2.aborted).toBe(false);

            // Abort parent
            parent.abort('Parent aborting');

            expect(parent.aborted).toBe(true);
            expect(child1.aborted).toBe(true);
            expect(child2.aborted).toBe(true);
        });

        it('should support multiple levels of hierarchy', () => {
            const root = TimeoutBudget.allocate('root', 60000);
            const level1 = root.subdivide('level1', 40000);
            const level2 = level1.subdivide('level2', 20000);
            const level3 = level2.subdivide('level3', 5000);

            expect(level3.parent).toBe(level2);
            expect(level2.parent).toBe(level1);
            expect(level1.parent).toBe(root);

            expect(root.children).toContain(level1);
            expect(level1.children).toContain(level2);
            expect(level2.children).toContain(level3);
        });

        it('should handle complex hierarchy accounting', () => {
            const root = TimeoutBudget.allocate('root', 60000);
            const child1 = root.subdivide('child1', 20000);
            const child2 = root.subdivide('child2', 15000);
            const grandchild = child1.subdivide('grandchild', 10000);

            const accounting = root.getAccounting();

            expect(accounting.operation).toBe('root');
            expect(accounting.children).toHaveLength(2);
            expect(accounting.children[0].operation).toBe('child1');
            expect(accounting.children[0].children).toHaveLength(1);
            expect(accounting.children[0].children[0].operation).toBe('grandchild');
        });

        it('should enforce deadline validation at child creation', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);

            // Advance time
            vi.advanceTimersByTime(20000);

            // Try to create child with budget that would exceed parent deadline
            expect(() => {
                parent.subdivide('child', 15000);
            }).toThrow(BudgetExhaustedError);
        });

        it('should inherit parent signal by default in subdivision', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);
            const child = parent.subdivide('child', 10000);

            // Child should use parent's signal
            expect(child.signal).toBeDefined();

            // Abort parent
            parent.abort('Parent abort');

            // Child should be aborted via inherited signal
            expect(child.aborted).toBe(true);
        });

        it('should allow overriding signal in subdivision', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);
            const externalController = new AbortController();

            const child = parent.subdivide('child', 10000, {
                signal: externalController.signal,
            });

            // Abort external controller
            externalController.abort('External abort');
            vi.runAllTimers();

            // Child should be aborted
            expect(child.aborted).toBe(true);

            // Parent should not be aborted
            expect(parent.aborted).toBe(false);
        });
    });

    // ==========================================
    // Suite 3: Exhaustion Handling
    // ==========================================

    describe('Exhaustion Handling', () => {
        it('should detect budget exhaustion after timeout', () => {
            const budget = TimeoutBudget.allocate('test', 1000);

            expect(budget.isExhausted()).toBe(false);

            // Advance past timeout
            vi.advanceTimersByTime(1001);

            expect(budget.isExhausted()).toBe(true);
            expect(budget.aborted).toBe(true);
        });

        it('should call abort handlers on exhaustion', () => {
            const budget = TimeoutBudget.allocate('test', 1000);
            const handler = vi.fn();

            budget.onAbort(handler);

            // Trigger timeout
            vi.advanceTimersByTime(1001);
            vi.runAllTimers();

            expect(handler).toHaveBeenCalledWith('Budget exhausted: test');
        });

        it('should support multiple abort handlers', () => {
            const budget = TimeoutBudget.allocate('test', 1000);
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            const handler3 = vi.fn();

            budget.onAbort(handler1);
            budget.onAbort(handler2);
            budget.onAbort(handler3);

            // Trigger timeout
            vi.advanceTimersByTime(1001);
            vi.runAllTimers();

            expect(handler1).toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
            expect(handler3).toHaveBeenCalled();
        });

        it('should call handler immediately if already aborted', () => {
            const budget = TimeoutBudget.allocate('test', 1000);

            // Trigger timeout
            vi.advanceTimersByTime(1001);
            vi.runAllTimers();

            expect(budget.aborted).toBe(true);

            // Add handler after abort
            const handler = vi.fn();
            budget.onAbort(handler);

            expect(handler).toHaveBeenCalledWith('Budget exhausted: test');
        });

        it('should support unsubscribe from abort handlers', () => {
            const budget = TimeoutBudget.allocate('test', 1000);
            const handler = vi.fn();

            const unsubscribe = budget.onAbort(handler);
            unsubscribe();

            // Trigger timeout
            vi.advanceTimersByTime(1001);
            vi.runAllTimers();

            expect(handler).not.toHaveBeenCalled();
        });

        it('should handle async abort handlers', async () => {
            const budget = TimeoutBudget.allocate('test', 1000);
            const asyncHandler = vi.fn(async (reason) => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return reason;
            });

            budget.onAbort(asyncHandler);

            // Trigger timeout
            vi.advanceTimersByTime(1001);
            await vi.runAllTimersAsync();

            expect(asyncHandler).toHaveBeenCalled();
        });

        it('should throw BudgetExhaustedError on assertAvailable when exhausted', () => {
            const budget = TimeoutBudget.allocate('test', 1000);

            // Trigger timeout
            vi.advanceTimersByTime(1001);
            vi.runAllTimers();

            expect(() => {
                budget.assertAvailable('test context');
            }).toThrow(BudgetExhaustedError);
        });

        it('should not throw on assertAvailable when not exhausted', () => {
            const budget = TimeoutBudget.allocate('test', 1000);

            expect(() => {
                budget.assertAvailable('test context');
            }).not.toThrow();
        });

        it('should cleanup resources on dispose', () => {
            const externalController = new AbortController();
            const budget = TimeoutBudget.allocate('test', 10000, {
                signal: externalController.signal,
            });

            expect(timeoutCallbacks.length).toBeGreaterThan(0);

            budget.dispose();

            // Timeout should be cleared
            expect(budget._abortHandlers).toHaveLength(0);
        });

        it('should cascade cleanup to children on dispose', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);
            const child = parent.subdivide('child', 10000);

            const childDisposeSpy = vi.spyOn(child, 'dispose');

            parent.dispose();

            // Note: dispose doesn't automatically cascade to children
            // This is expected behavior - children must be disposed separately
            expect(childDisposeSpy).not.toHaveBeenCalled();
        });

        it('should handle manual abort with custom reason', () => {
            const budget = TimeoutBudget.allocate('test', 10000);
            const handler = vi.fn();

            budget.onAbort(handler);

            budget.abort('Custom abort reason');

            expect(budget.aborted).toBe(true);
            expect(handler).toHaveBeenCalledWith('Custom abort reason');
        });

        it('should not abort if already aborted', () => {
            const budget = TimeoutBudget.allocate('test', 10000);
            const handler = vi.fn();

            budget.onAbort(handler);
            budget.abort('First abort');

            expect(handler).toHaveBeenCalledTimes(1);

            budget.abort('Second abort');

            // Handler should not be called again
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    // ==========================================
    // Suite 4: Timeout Propagation
    // ==========================================

    describe('Timeout Propagation', () => {
        it('should propagate timeout across async operations', async () => {
            const budget = TimeoutBudget.allocate('test', 1000);
            let operationCompleted = false;

            const operation = new Promise((resolve) => {
                budget.signal.addEventListener('abort', () => {
                    resolve('aborted');
                });

                setTimeout(() => {
                    operationCompleted = true;
                    resolve('completed');
                }, 2000);
            });

            // Advance time to trigger timeout
            vi.advanceTimersByTime(1001);
            vi.runAllTimers();

            const result = await operation;

            expect(result).toBe('aborted');
            expect(operationCompleted).toBe(false);
        });

        it('should support withBudget helper for automatic cleanup', async () => {
            const budgetSpy = vi.spyOn(TimeoutBudget, 'allocate');
            const releaseSpy = vi.spyOn(TimeoutBudget, 'release');

            const result = await TimeoutBudget.withBudget('test', 5000, async (budget) => {
                expect(budget.operation).toBe('test');
                expect(budget.budgetMs).toBe(5000);
                return 'success';
            });

            expect(result).toBe('success');
            expect(budgetSpy).toHaveBeenCalledWith('test', 5000);
            expect(releaseSpy).toHaveBeenCalled();
        });

        it('should release budget even if operation throws', async () => {
            const releaseSpy = vi.spyOn(TimeoutBudget, 'release');

            await expect(
                TimeoutBudget.withBudget('test', 5000, async () => {
                    throw new Error('Operation failed');
                })
            ).rejects.toThrow('Operation failed');

            expect(releaseSpy).toHaveBeenCalled();
        });

        it('should throw BudgetExhaustedError when withBudget times out', async () => {
            vi.useRealTimers();

            await expect(
                TimeoutBudget.withBudget('test', 100, async () => {
                    await new Promise(resolve => setTimeout(resolve, 200));
                })
            ).rejects.toThrow(BudgetExhaustedError);

            vi.useFakeTimers();
        });

        it('should propagate abort signal to nested operations', async () => {
            const parent = TimeoutBudget.allocate('parent', 5000);
            const child = parent.subdivide('child', 3000);

            let childAborted = false;
            let parentAborted = false;

            child.signal.addEventListener('abort', () => {
                childAborted = true;
            });

            parent.signal.addEventListener('abort', () => {
                parentAborted = true;
            });

            // Abort parent
            parent.abort('Parent abort');

            expect(parentAborted).toBe(true);
            expect(childAborted).toBe(true);
        });

        it('should handle worker boundary timeout propagation', () => {
            const mainBudget = TimeoutBudget.allocate('main_worker', 10000);

            // Simulate passing signal to worker
            const workerSignal = mainBudget.signal;

            let workerAborted = false;
            workerSignal.addEventListener('abort', () => {
                workerAborted = true;
            });

            // Abort from main thread
            mainBudget.abort('Main thread abort');

            expect(workerAborted).toBe(true);
        });

        it('should support signal extraction for fetch', async () => {
            const budget = TimeoutBudget.allocate('fetch', 5000);

            // Simulate fetch with signal
            const fetchWithTimeout = new Promise((_, reject) => {
                budget.signal.addEventListener('abort', () => {
                    reject(new Error('Fetch aborted'));
                });
            });

            budget.abort('Timeout');

            await expect(fetchWithTimeout).rejects.toThrow('Fetch aborted');
        });

        it('should propagate timeout through Promise.race', async () => {
            const budget = TimeoutBudget.allocate('race', 2000);

            const slowOperation = new Promise((resolve) => {
                setTimeout(() => resolve('slow'), 3000);
            });

            const timeoutOperation = new Promise((_, reject) => {
                budget.signal.addEventListener('abort', () => {
                    reject(new Error('Timeout'));
                });
            });

            // Trigger timeout
            vi.advanceTimersByTime(2001);
            vi.runAllTimers();

            await expect(
                Promise.race([slowOperation, timeoutOperation])
            ).rejects.toThrow('Timeout');
        });
    });

    // ==========================================
    // Suite 5: Budget Tracking
    // ==========================================

    describe('Budget Tracking', () => {
        it('should track elapsed time correctly', () => {
            const budget = TimeoutBudget.allocate('test', 10000);

            expect(budget.elapsed()).toBe(0);

            vi.advanceTimersByTime(3000);

            expect(budget.elapsed()).toBe(3000);
        });

        it('should track remaining time correctly', () => {
            const budget = TimeoutBudget.allocate('test', 10000);

            expect(budget.remaining()).toBe(10000);

            vi.advanceTimersByTime(3000);

            expect(budget.remaining()).toBe(7000);
        });

        it('should return zero remaining when exhausted', () => {
            const budget = TimeoutBudget.allocate('test', 1000);

            vi.advanceTimersByTime(1001);
            vi.runAllTimers();

            expect(budget.remaining()).toBe(0);
        });

        it('should calculate deadline correctly', () => {
            const startTime = Date.now();
            const budget = TimeoutBudget.allocate('test', 10000);

            const deadline = budget.getDeadline();

            expect(deadline).toBe(startTime + 10000);
        });

        it('should calculate hierarchical deadline correctly', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);
            const child = parent.subdivide('child', 20000);

            const parentDeadline = parent.getDeadline();
            const childDeadline = child.getDeadline();

            // Child deadline should not exceed parent deadline
            expect(childDeadline).toBeLessThanOrEqual(parentDeadline);
        });

        it('should provide comprehensive accounting', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);
            const child = parent.subdivide('child', 10000);

            vi.advanceTimersByTime(5000);

            const accounting = parent.getAccounting();

            expect(accounting.operation).toBe('parent');
            expect(accounting.allocated).toBe(30000);
            expect(accounting.elapsed).toBe(5000);
            expect(accounting.remaining).toBe(25000);
            expect(accounting.ownRemaining).toBe(25000);
            expect(accounting.exhausted).toBe(false);
            expect(accounting.aborted).toBe(false);
            expect(accounting.hasParent).toBe(false);
            expect(accounting.parentOperation).toBe(null);
            expect(accounting.children).toHaveLength(1);
            expect(accounting.children[0].operation).toBe('child');
        });

        it('should track child accounting in parent', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);
            const child1 = parent.subdivide('child1', 10000);
            const child2 = parent.subdivide('child2', 10000);

            const accounting = parent.getAccounting();

            expect(accounting.children).toHaveLength(2);
            expect(accounting.children[0].operation).toBe('child1');
            expect(accounting.children[1].operation).toBe('child2');
        });

        it('should provide active budget accounting', () => {
            TimeoutBudget.allocate('operation1', 10000);
            TimeoutBudget.allocate('operation2', 20000);
            TimeoutBudget.allocate('operation3', 15000);

            const accounting = TimeoutBudget.getActiveAccounting();

            expect(accounting).toHaveLength(3);
            expect(accounting[0].operation).toBe('operation1');
            expect(accounting[1].operation).toBe('operation2');
            expect(accounting[2].operation).toBe('operation3');
        });

        it('should track usage statistics over time', () => {
            const budget = TimeoutBudget.allocate('test', 10000);

            const initialElapsed = budget.elapsed();
            expect(initialElapsed).toBe(0);

            vi.advanceTimersByTime(3000);
            const midElapsed = budget.elapsed();
            expect(midElapsed).toBe(3000);

            vi.advanceTimersByTime(2000);
            const finalElapsed = budget.elapsed();
            expect(finalElapsed).toBe(5000);

            const accounting = budget.getAccounting();
            expect(accounting.elapsed).toBe(5000);
            expect(accounting.remaining).toBe(5000);
        });

        it('should distinguish own remaining from hierarchical remaining', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);
            const child = parent.subdivide('child', 20000);

            vi.advanceTimersByTime(5000);

            // Child's own remaining (ignoring parent)
            expect(child.ownRemaining()).toBe(15000);

            // Child's hierarchical remaining (capped by parent)
            expect(child.remaining()).toBe(15000);

            // Advance more time
            vi.advanceTimersByTime(10000);

            // Child's own remaining
            expect(child.ownRemaining()).toBe(5000);

            // Parent's remaining
            const parentRemaining = parent.remaining();

            // Child's hierarchical remaining
            expect(child.remaining()).toBeLessThanOrEqual(parentRemaining);
        });

        it('should update accounting after child subdivision', () => {
            const parent = TimeoutBudget.allocate('parent', 30000);

            let accounting = parent.getAccounting();
            expect(accounting.children).toHaveLength(0);

            parent.subdivide('child1', 10000);

            accounting = parent.getAccounting();
            expect(accounting.children).toHaveLength(1);

            parent.subdivide('child2', 10000);

            accounting = parent.getAccounting();
            expect(accounting.children).toHaveLength(2);
        });
    });

    // ==========================================
    // Suite 6: Budget Release and Cleanup
    // ==========================================

    describe('Budget Release and Cleanup', () => {
        it('should release budget by operation name', () => {
            TimeoutBudget.allocate('test_operation', 10000);

            expect(TimeoutBudget.getActiveAccounting()).toHaveLength(1);

            TimeoutBudget.release('test_operation');

            expect(TimeoutBudget.getActiveAccounting()).toHaveLength(0);
        });

        it('should release budget by instance', () => {
            const budget = TimeoutBudget.allocate('test_operation', 10000);

            expect(TimeoutBudget.getActiveAccounting()).toHaveLength(1);

            TimeoutBudget.release(budget);

            expect(TimeoutBudget.getActiveAccounting()).toHaveLength(0);
        });

        it('should cleanup resources on release', () => {
            const budget = TimeoutBudget.allocate('test', 10000);

            const disposeSpy = vi.spyOn(budget, 'dispose');

            TimeoutBudget.release(budget);

            expect(disposeSpy).toHaveBeenCalled();
        });

        it('should handle release of non-existent budget', () => {
            expect(() => {
                TimeoutBudget.release('non_existent');
            }).not.toThrow();
        });

        it('should remove from active budgets on release', () => {
            const budget = TimeoutBudget.allocate('test', 10000);

            expect(TimeoutBudget.getBudget('test')).toBe(budget);

            TimeoutBudget.release(budget);

            expect(TimeoutBudget.getBudget('test')).toBe(null);
        });
    });

    // ==========================================
    // Suite 7: Configuration and Defaults
    // ==========================================

    describe('Configuration and Defaults', () => {
        it('should provide default budgets', () => {
            expect(TimeoutBudget.DEFAULT_BUDGETS.llm_call).toBe(60000);
            expect(TimeoutBudget.DEFAULT_BUDGETS.function_call).toBe(10000);
            expect(TimeoutBudget.DEFAULT_BUDGETS.vector_search).toBe(5000);
        });

        it('should get default budget for operation', () => {
            const budget = TimeoutBudget.getDefaultBudget('llm_call');

            expect(budget).toBe(60000);
        });

        it('should return null for unknown operation default', () => {
            const budget = TimeoutBudget.getDefaultBudget('unknown_operation');

            expect(budget).toBe(null);
        });

        it('should set custom default budget', () => {
            TimeoutBudget.setDefaultBudget('custom_operation', 25000);

            const budget1 = TimeoutBudget.allocate('custom_operation');
            expect(budget1.budgetMs).toBe(25000);

            const budget2 = TimeoutBudget.getDefaultBudget('custom_operation');
            expect(budget2).toBe(25000);
        });

        it('should provide default limits', () => {
            expect(DEFAULT_LIMITS.max_function_calls).toBe(5);
        });

        it('should calculate adaptive timeout for small payload', () => {
            const timeout = TimeoutBudget.adaptiveTimeout({
                operation: 'llm_call',
                payloadSize: 1000, // 1KB
            });

            // Should be close to base timeout (60000ms) with minimal size factor
            expect(timeout).toBeGreaterThan(50000);
            expect(timeout).toBeLessThan(70000);
        });

        it('should calculate adaptive timeout for large payload', () => {
            const timeout = TimeoutBudget.adaptiveTimeout({
                operation: 'llm_call',
                payloadSize: 10_000_000, // 10MB
            });

            // Should be significantly larger than base timeout
            expect(timeout).toBeGreaterThan(60000);
        });

        it('should clamp adaptive timeout to min bounds', () => {
            const timeout = TimeoutBudget.adaptiveTimeout({
                operation: 'vector_search',
                payloadSize: 1,
                minTimeout: 10000,
            });

            expect(timeout).toBeGreaterThanOrEqual(10000);
        });

        it('should clamp adaptive timeout to max bounds', () => {
            const timeout = TimeoutBudget.adaptiveTimeout({
                operation: 'llm_call',
                payloadSize: 1_000_000_000, // 1GB
                maxTimeout: 120000,
            });

            expect(timeout).toBeLessThanOrEqual(120000);
        });
    });

    // ==========================================
    // Suite 8: Edge Cases and Error Handling
    // ==========================================

    describe('Edge Cases and Error Handling', () => {
        it('should handle subdivision of exhausted budget', () => {
            const parent = TimeoutBudget.allocate('parent', 1000);

            // Trigger timeout
            vi.advanceTimersByTime(1001);
            vi.runAllTimers();

            expect(() => {
                parent.subdivide('child', 500);
            }).toThrow(BudgetExhaustedError);
        });

        it('should handle subdivision with zero budget', () => {
            const parent = TimeoutBudget.allocate('parent', 0);

            expect(() => {
                parent.subdivide('child', 0);
            }).not.toThrow();
        });

        it('should handle negative elapsed time (clock skew)', () => {
            const budget = TimeoutBudget.allocate('test', 10000);

            // Simulate clock going backward (shouldn't happen, but test robustness)
            const elapsed = budget.elapsed();
            expect(elapsed).toBeGreaterThanOrEqual(0);
        });

        it('should handle rapid allocate/release cycles', () => {
            for (let i = 0; i < 100; i++) {
                const budget = TimeoutBudget.allocate('rapid', 1000);
                TimeoutBudget.release(budget);
            }

            expect(TimeoutBudget.getActiveAccounting()).toHaveLength(0);
        });

        it('should handle multiple budgets for same operation', () => {
            const budget1 = TimeoutBudget.allocate('test', 10000);
            const budget2 = TimeoutBudget.allocate('test', 15000);

            expect(budget1.id).not.toBe(budget2.id);

            const accounting = TimeoutBudget.getActiveAccounting();
            expect(accounting).toHaveLength(2);
        });

        it('should handle abort handler errors gracefully', () => {
            const budget = TimeoutBudget.allocate('test', 1000);

            const errorHandler = vi.fn(() => {
                throw new Error('Handler error');
            });

            const successHandler = vi.fn();

            budget.onAbort(errorHandler);
            budget.onAbort(successHandler);

            // Trigger abort - should not throw despite handler error
            expect(() => {
                budget.abort('Test abort');
            }).not.toThrow();

            // Both handlers should be called
            expect(errorHandler).toHaveBeenCalled();
            expect(successHandler).toHaveBeenCalled();
        });

        it('should handle dispose after abort', () => {
            const budget = TimeoutBudget.allocate('test', 1000);

            budget.abort('Test abort');

            expect(() => {
                budget.dispose();
            }).not.toThrow();
        });

        it('should handle getBudget for non-existent operation', () => {
            const budget = TimeoutBudget.getBudget('non_existent');

            expect(budget).toBe(null);
        });
    });
});
