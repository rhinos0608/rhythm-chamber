/**
 * Timeout Budget Manager
 *
 * Allocates timeout budget hierarchically. Prevents budget exhaustion
 * by subdividing time across nested operations.
 *
 * HNW Hierarchy: Provides structured timeout allocation where
 * parent operations subdivide budget to child operations.
 *
 * @module services/timeout-budget-manager
 */

// ==========================================
// Budget Exhausted Error
// ==========================================

/**
 * Error thrown when a timeout budget is exhausted
 */
class BudgetExhaustedError extends Error {
    constructor({ operation, allocated, consumed, parent, reason = null }) {
        const message = reason
            ? `Timeout budget exhausted for ${operation}: ${reason}`
            : `Timeout budget exhausted for ${operation}: allocated ${allocated}ms, consumed ${consumed}ms`;
        super(message);
        this.name = 'BudgetExhaustedError';
        this.operation = operation;
        this.allocated = allocated;
        this.consumed = consumed;
        this.parent = parent;
        this.reason = reason;
    }
}

// ==========================================
// Budget Class
// ==========================================

/**
 * Represents an allocated timeout budget with abort signal integration
 * HNW Hierarchy: Links timeout budgets to AbortControllers for cascading cleanup
 *
 * STRICT HIERARCHY RULES:
 * 1. Child budget cannot exceed parent's remaining time at creation
 * 2. Child's remaining() is always min(ownRemaining, parent.remaining())
 * 3. Parent abort cascades to all children
 * 4. Children cannot extend parent deadlines
 */
class TimeoutBudgetInstance {
    constructor(operation, budgetMs, parent = null, options = {}) {
        this.operation = operation;
        this.budgetMs = budgetMs;
        this.parent = parent;
        this.id = null;
        this.startTime = Date.now();
        this.children = [];
        this.consumed = 0;
        this.exhausted = false;

        // AbortController integration
        // If external signal provided, link to it; otherwise create our own
        this._abortController = new AbortController();
        this._externalSignal = options.signal || null;
        this._timeoutId = null;
        this._abortHandlers = [];

        // STRICT HIERARCHY: Validate child deadline against parent deadline
        if (parent) {
            const parentDeadline = parent.startTime + parent.budgetMs;
            const childDeadline = this.startTime + budgetMs;

            if (childDeadline > parentDeadline) {
                const parentRemaining = parent.remaining();
                throw new BudgetExhaustedError({
                    operation,
                    allocated: budgetMs,
                    consumed: 0,
                    parent: parent.operation,
                    reason: `Child deadline (${budgetMs}ms) exceeds parent remaining (${parentRemaining}ms)`,
                });
            }
        }

        // Link to external signal if provided
        if (this._externalSignal) {
            // Store bound handler for later removal
            this._onExternalSignalAbort = () => {
                this._abortController.abort(this._externalSignal.reason || 'Parent aborted');
                clearTimeout(this._timeoutId);
            };

            if (this._externalSignal.aborted) {
                this._abortController.abort(this._externalSignal.reason);
            } else {
                this._externalSignal.addEventListener('abort', this._onExternalSignalAbort);
            }
        }

        // Auto-abort when budget time expires
        this._timeoutId = setTimeout(() => {
            // Check if already aborted to prevent double execution
            if (this._abortController.signal.aborted) {
                return;
            }
            this.exhausted = true;
            this._abortController.abort(`Budget exhausted: ${operation}`);
            this._runAbortHandlers(`Budget exhausted after ${budgetMs}ms`);
        }, budgetMs);
    }

    /**
     * Get the abort signal for this budget
     * Use this signal in fetch(), Promise.race(), etc.
     * @returns {AbortSignal}
     */
    get signal() {
        return this._abortController.signal;
    }

    /**
     * Check if this budget has been aborted
     * @returns {boolean}
     */
    get aborted() {
        return this._abortController.signal.aborted;
    }

    /**
     * Get remaining budget in milliseconds
     * STRICT HIERARCHY: Returns minimum of own remaining and parent remaining
     * This ensures children cannot outlive parents
     * @returns {number}
     */
    remaining() {
        if (this.aborted) return 0;

        const ownRemaining = Math.max(0, this.budgetMs - this.elapsed());

        // STRICT HIERARCHY: Child remaining is capped by parent remaining
        if (this.parent) {
            const parentRemaining = this.parent.remaining();
            return Math.min(ownRemaining, parentRemaining);
        }

        return ownRemaining;
    }

    /**
     * Get own remaining time (ignoring parent)
     * Useful for debugging and accounting
     * @returns {number}
     */
    ownRemaining() {
        if (this.aborted) return 0;
        return Math.max(0, this.budgetMs - this.elapsed());
    }

    /**
     * Get the deadline timestamp for this budget
     * @returns {number} Timestamp when this budget expires
     */
    getDeadline() {
        if (this.parent) {
            const parentDeadline = this.parent.getDeadline();
            const ownDeadline = this.startTime + this.budgetMs;
            return Math.min(ownDeadline, parentDeadline);
        }
        return this.startTime + this.budgetMs;
    }

    /**
     * Check if budget is exhausted
     * @returns {boolean}
     */
    isExhausted() {
        return this.aborted || this.remaining() <= 0;
    }

    /**
     * Register handler to run when budget is aborted
     * @param {Function} handler - Callback receiving abort reason
     * @returns {Function} Unsubscribe function
     */
    onAbort(handler) {
        this._abortHandlers.push(handler);

        // If already aborted, call immediately
        if (this.aborted) {
            try {
                handler(this._abortController.signal.reason);
            } catch (e) {
                console.error('[TimeoutBudget] Abort handler error:', e);
            }
        }

        return () => {
            const idx = this._abortHandlers.indexOf(handler);
            if (idx >= 0) this._abortHandlers.splice(idx, 1);
        };
    }

    /**
     * Abort this budget manually
     * @param {string} [reason] - Abort reason
     */
    abort(reason = 'Manual abort') {
        if (this.aborted) return;

        clearTimeout(this._timeoutId);
        this._abortController.abort(reason);
        this._runAbortHandlers(reason);

        // Cascade to children
        for (const child of this.children) {
            child.abort(`Parent aborted: ${reason}`);
        }
    }

    /**
     * Run all abort handlers
     * FIX: Now properly awaits async handlers
     * @private
     * @returns {Promise<void>}
     */
    async _runAbortHandlers(reason) {
        const results = [];
        for (const handler of this._abortHandlers) {
            try {
                const result = handler(reason);
                // FIX: If handler returns a Promise, track it for proper await
                if (result && typeof result.then === 'function') {
                    results.push(
                        result.catch(e => {
                            console.error('[TimeoutBudget] Async abort handler error:', e);
                        })
                    );
                }
            } catch (e) {
                console.error('[TimeoutBudget] Sync abort handler error:', e);
            }
        }
        // FIX: Wait for all async handlers to complete
        if (results.length > 0) {
            await Promise.all(results);
        }
    }

    /**
     * Cleanup resources (call when done with budget)
     */
    dispose() {
        clearTimeout(this._timeoutId);
        this._abortHandlers = [];

        // Remove external signal event listener to prevent memory leak
        if (this._externalSignal && this._onExternalSignalAbort) {
            this._externalSignal.removeEventListener('abort', this._onExternalSignalAbort);
        }
    }

    /**
     * Subdivide budget for a child operation
     *
     * STRICT HIERARCHY RULES:
     * 1. Child budget cannot exceed parent's remaining time
     * 2. Child deadline cannot exceed parent deadline
     * 3. Child inherits parent's abort signal (cascade)
     *
     * @param {string} childOperation - Child operation name
     * @param {number} childBudgetMs - Budget for child (must fit within remaining)
     * @param {Object} [options] - Options including signal
     * @returns {TimeoutBudgetInstance}
     * @throws {BudgetExhaustedError} If child budget exceeds available time
     */
    subdivide(childOperation, childBudgetMs, options = {}) {
        const available = this.remaining();

        // STRICT HIERARCHY: Child cannot exceed parent's remaining time
        if (childBudgetMs > available) {
            throw new BudgetExhaustedError({
                operation: childOperation,
                allocated: childBudgetMs,
                consumed: this.budgetMs - available,
                parent: this.operation,
                reason: `Requested ${childBudgetMs}ms but only ${available}ms available from parent "${this.operation}"`,
            });
        }

        // Child inherits parent's signal by default (ensures cascade abort)
        const childOptions = {
            ...options,
            signal: options.signal ?? this.signal,
        };

        // Create child with this as parent (triggers deadline validation in constructor)
        const child = new TimeoutBudgetInstance(childOperation, childBudgetMs, this, childOptions);
        this.children.push(child);

        console.log(
            `[TimeoutBudget] Subdivided ${this.operation} → ${childOperation}: ${childBudgetMs}ms of ${available}ms available`
        );

        return child;
    }

    /**
     * Get elapsed time
     * @returns {number}
     */
    elapsed() {
        return Date.now() - this.startTime;
    }

    /**
     * Assert budget is available, throw if exhausted
     *
     * @param {string} [context] - Context for error message
     */
    assertAvailable(context = null) {
        if (this.isExhausted()) {
            throw new BudgetExhaustedError({
                operation: context || this.operation,
                allocated: this.budgetMs,
                consumed: this.elapsed(),
                parent: this.parent?.operation || null,
            });
        }
    }

    /**
     * Get budget accounting summary
     * @returns {Object}
     */
    getAccounting() {
        return {
            operation: this.operation,
            allocated: this.budgetMs,
            elapsed: this.elapsed(),
            remaining: this.remaining(),
            ownRemaining: this.ownRemaining(),
            deadline: this.getDeadline(),
            exhausted: this.isExhausted(),
            aborted: this.aborted,
            hasParent: !!this.parent,
            parentOperation: this.parent?.operation || null,
            children: this.children.map(c => c.getAccounting()),
        };
    }
}

// ==========================================
// Default Budgets
// ==========================================

/**
 * Default budget allocations for common operations
 */
const DEFAULT_BUDGETS = {
    // LLM operations
    llm_call: 60000, // 60 seconds for cloud LLM
    local_llm_call: 90000, // 90 seconds for local LLM

    // Function calling
    function_call: 10000, // 10 seconds per function call

    // Embedding operations
    embedding_generation: 30000, // 30 seconds
    vector_search: 5000, // 5 seconds

    // Network operations
    network_latency: 5000, // 5 second buffer

    // Parsing
    file_parse: 30000, // 30 seconds for file parsing
    pattern_detection: 20000, // 20 seconds for pattern detection
};

/**
 * Default non-time-based limits
 */
const DEFAULT_LIMITS = {
    max_function_calls: 5, // Max 5 function calls per turn
};

/**
 * Operation complexity categories for adaptive timeouts
 * Maps operation types to complexity multipliers
 */
const OPERATION_COMPLEXITY = {
    // Simple operations (1x)
    vector_search: 1.0,
    network_latency: 1.0,

    // Medium operations (1.5x)
    function_call: 1.5,
    file_parse: 1.5,
    pattern_detection: 1.5,

    // Complex operations (2x)
    llm_call: 2.0,
    local_llm_call: 2.5,
    embedding_generation: 2.0,
};

/**
 * Calculate adaptive timeout based on operation type and payload size
 *
 * Formula: baseTimeout * (1 + log10(max(1, payloadSize / 1MB))) * complexityMultiplier
 *
 * @param {Object} options
 * @param {string} options.operation - Operation type
 * @param {number} [options.payloadSize=0] - Payload size in bytes
 * @param {number} [options.minTimeout=5000] - Minimum timeout (default 5s)
 * @param {number} [options.maxTimeout=300000] - Maximum timeout (default 5 min)
 * @returns {number} Timeout in milliseconds
 */
function adaptiveTimeout({ operation, payloadSize = 0, minTimeout = 5000, maxTimeout = 300000 }) {
    // Get base timeout for operation or use default
    const baseTimeout = DEFAULT_BUDGETS[operation] || 30000;

    // Get complexity multiplier (default 1.0)
    const complexity = OPERATION_COMPLEXITY[operation] || 1.0;

    // Scale based on payload size (1MB = ~2x timeout)
    // Using log10 for diminishing returns on very large payloads
    const MB = 1_000_000;
    const sizeFactor = 1 + Math.log10(Math.max(1, payloadSize / MB));

    // Calculate adaptive timeout
    const adaptedMs = Math.round(baseTimeout * sizeFactor * complexity);

    // Clamp to min/max bounds
    const result = Math.max(minTimeout, Math.min(adaptedMs, maxTimeout));

    console.log(
        `[TimeoutBudget] Adaptive timeout for ${operation}: base=${baseTimeout}ms, size=${payloadSize}b, complexity=${complexity}x → ${result}ms`
    );

    return result;
}

// ==========================================
// Active Budgets Tracking
// ==========================================

const activeBudgets = new Map();
let budgetCounter = 0;

function createBudgetId(operation) {
    budgetCounter += 1;
    return `${operation}:${budgetCounter}`;
}

// ==========================================
// Core Functions
// ==========================================

/**
 * Allocate a timeout budget for an operation
 *
 * @param {string} operation - Operation name
 * @param {number} [budgetMs] - Budget in milliseconds (uses default if not specified)
 * @param {Object} [options] - Options including signal for external AbortController
 * @param {AbortSignal} [options.signal] - External abort signal to link to
 * @returns {TimeoutBudgetInstance}
 */
function allocate(operation, budgetMs = null, options = {}) {
    const budget = budgetMs ?? DEFAULT_BUDGETS[operation] ?? 30000;
    const instance = new TimeoutBudgetInstance(operation, budget, null, options);

    instance.id = createBudgetId(operation);
    activeBudgets.set(instance.id, instance);

    console.log(`[TimeoutBudget] Allocated ${budget}ms for ${operation} (id: ${instance.id})`);

    return instance;
}

/**
 * Get an active budget by operation name
 *
 * @param {string} operation - Operation name
 * @returns {TimeoutBudgetInstance|null}
 */
function getBudget(operation) {
    let found = null;
    for (const budget of activeBudgets.values()) {
        if (budget.operation === operation) {
            found = budget;
        }
    }
    return found;
}

/**
 * Release a budget (cleanup)
 *
 * @param {string|TimeoutBudgetInstance} operationOrInstance - Operation name or budget instance
 */
function release(operationOrInstance) {
    const isInstance =
        operationOrInstance instanceof TimeoutBudgetInstance ||
        (operationOrInstance &&
            typeof operationOrInstance === 'object' &&
            'operation' in operationOrInstance);

    let budgetId = isInstance ? operationOrInstance.id : null;
    const operation = isInstance ? operationOrInstance.operation : operationOrInstance;

    if (!budgetId && operation) {
        for (const [id, budget] of activeBudgets.entries()) {
            if (budget.operation === operation) {
                budgetId = id;
            }
        }
    }

    const budget = budgetId ? activeBudgets.get(budgetId) : null;
    if (budget) {
        console.log(
            `[TimeoutBudget] Released ${budget.operation}: elapsed ${budget.elapsed()}ms of ${budget.budgetMs}ms (id: ${budget.id})`
        );
        // CRITICAL: Call dispose to clean up AbortController resources and event listeners
        budget.dispose();
        activeBudgets.delete(budgetId);
    }
}

/**
 * Execute a function with timeout budget
 *
 * @param {string} operation - Operation name
 * @param {number} budgetMs - Budget in milliseconds
 * @param {function(TimeoutBudgetInstance): Promise<*>} fn - Function to execute
 * @returns {Promise<*>}
 */
async function withBudget(operation, budgetMs, fn) {
    const budget = allocate(operation, budgetMs);
    const timeoutDelay = Number.isFinite(budgetMs) ? budgetMs : (budget?.budgetMs ?? 0);

    try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutDelay);

        try {
            const result = await Promise.race([
                fn(budget),
                new Promise((_, reject) => {
                    controller.signal.addEventListener('abort', () => {
                        reject(
                            new BudgetExhaustedError({
                                operation,
                                allocated: timeoutDelay,
                                consumed: budget.elapsed(),
                                parent: null,
                            })
                        );
                    });
                }),
            ]);

            clearTimeout(timeoutId);
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    } finally {
        release(budget);
    }
}

/**
 * Get accounting for all active budgets
 *
 * @returns {Object[]}
 */
function getActiveAccounting() {
    return Array.from(activeBudgets.values()).map(b => b.getAccounting());
}

/**
 * Get default budget for an operation
 *
 * @param {string} operation - Operation name
 * @returns {number|null}
 */
function getDefaultBudget(operation) {
    return DEFAULT_BUDGETS[operation] || null;
}

/**
 * Set custom default budget
 *
 * @param {string} operation - Operation name
 * @param {number} budgetMs - Budget in milliseconds
 */
function setDefaultBudget(operation, budgetMs) {
    DEFAULT_BUDGETS[operation] = budgetMs;
}

// ==========================================
// Public API
// ==========================================

const TimeoutBudget = {
    // Core operations
    allocate,
    getBudget,
    release,
    withBudget,

    // Configuration
    getDefaultBudget,
    setDefaultBudget,

    // Diagnostics
    getActiveAccounting,

    // Classes
    TimeoutBudgetInstance,
    BudgetExhaustedError,

    // Adaptive timeout
    adaptiveTimeout,

    // Constants
    DEFAULT_BUDGETS,
    DEFAULT_LIMITS,
    OPERATION_COMPLEXITY,
};

// ES Module export
export { TimeoutBudget, BudgetExhaustedError, DEFAULT_LIMITS };

console.log('[TimeoutBudget] Timeout Budget Manager loaded');
