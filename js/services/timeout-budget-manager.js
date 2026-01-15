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
    constructor({ operation, allocated, consumed, parent }) {
        super(`Timeout budget exhausted for ${operation}: allocated ${allocated}ms, consumed ${consumed}ms`);
        this.name = 'BudgetExhaustedError';
        this.operation = operation;
        this.allocated = allocated;
        this.consumed = consumed;
        this.parent = parent;
    }
}

// ==========================================
// Budget Class
// ==========================================

/**
 * Represents an allocated timeout budget
 */
class TimeoutBudgetInstance {
    constructor(operation, budgetMs, parent = null) {
        this.operation = operation;
        this.budgetMs = budgetMs;
        this.parent = parent;
        this.id = null;
        this.startTime = Date.now();
        this.children = [];
        this.consumed = 0;
        this.exhausted = false;
    }

    /**
     * Get remaining budget in milliseconds
     * @returns {number}
     */
    remaining() {
        const elapsed = Date.now() - this.startTime;
        return Math.max(0, this.budgetMs - elapsed);
    }

    /**
     * Check if budget is exhausted
     * @returns {boolean}
     */
    isExhausted() {
        return this.remaining() <= 0;
    }

    /**
     * Subdivide budget for a child operation
     * 
     * @param {string} childOperation - Child operation name
     * @param {number} childBudgetMs - Budget for child (must fit within remaining)
     * @returns {TimeoutBudgetInstance}
     */
    subdivide(childOperation, childBudgetMs) {
        const available = this.remaining();

        if (childBudgetMs > available) {
            throw new BudgetExhaustedError({
                operation: childOperation,
                allocated: childBudgetMs,
                consumed: this.budgetMs - available,
                parent: this.operation
            });
        }

        const child = new TimeoutBudgetInstance(childOperation, childBudgetMs, this);
        this.children.push(child);

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
                parent: this.parent?.operation || null
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
            exhausted: this.isExhausted(),
            children: this.children.map(c => c.getAccounting())
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
    llm_call: 60000,            // 60 seconds for cloud LLM
    local_llm_call: 90000,      // 90 seconds for local LLM

    // Function calling
    function_call: 10000,       // 10 seconds per function call

    // Embedding operations
    embedding_generation: 30000, // 30 seconds
    vector_search: 5000,        // 5 seconds

    // Network operations
    network_latency: 5000,      // 5 second buffer

    // Parsing
    file_parse: 30000,          // 30 seconds for file parsing
    pattern_detection: 20000    // 20 seconds for pattern detection
};

/**
 * Default non-time-based limits
 */
const DEFAULT_LIMITS = {
    max_function_calls: 5       // Max 5 function calls per turn
};

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
 * @returns {TimeoutBudgetInstance}
 */
function allocate(operation, budgetMs = null) {
    const budget = budgetMs ?? DEFAULT_BUDGETS[operation] ?? 30000;
    const instance = new TimeoutBudgetInstance(operation, budget);

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
    const isInstance = operationOrInstance instanceof TimeoutBudgetInstance ||
        (operationOrInstance && typeof operationOrInstance === 'object' && 'operation' in operationOrInstance);

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
        console.log(`[TimeoutBudget] Released ${budget.operation}: elapsed ${budget.elapsed()}ms of ${budget.budgetMs}ms (id: ${budget.id})`);
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
    const timeoutDelay = Number.isFinite(budgetMs)
        ? budgetMs
        : (budget?.budgetMs ?? 0);

    try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutDelay);

        try {
            const result = await Promise.race([
                fn(budget),
                new Promise((_, reject) => {
                    controller.signal.addEventListener('abort', () => {
                        reject(new BudgetExhaustedError({
                            operation,
                            allocated: timeoutDelay,
                            consumed: budget.elapsed(),
                            parent: null
                        }));
                    });
                })
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

    // Constants
    DEFAULT_BUDGETS,
    DEFAULT_LIMITS
};

// ES Module export
export { TimeoutBudget, BudgetExhaustedError, DEFAULT_LIMITS };

console.log('[TimeoutBudget] Timeout Budget Manager loaded');
