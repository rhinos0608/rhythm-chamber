/**
 * Cascading Abort Controller
 * 
 * Hierarchical AbortController implementation for coordinated cancellation.
 * Parent timeouts automatically signal children, preventing zombie operations.
 * 
 * HNW Hierarchy: Parent operations can cancel all descendants in a single call.
 * 
 * @module services/cascading-abort-controller
 */

// ==========================================
// Constants
// ==========================================

const DEBUG = false;

// ==========================================
// Error Classes
// ==========================================

/**
 * Custom error for cascading abort operations
 */
export class CascadingAbortError extends Error {
    constructor(operation, reason, parentOperation = null) {
        super(`Operation "${operation}" aborted: ${reason}`);
        this.name = 'CascadingAbortError';
        this.operation = operation;
        this.reason = reason;
        this.parentOperation = parentOperation;
        this.timestamp = Date.now();
    }
}

// ==========================================
// CascadingController Class
// ==========================================

/**
 * A controller that supports parent-child abort relationships
 */
class CascadingController {
    /**
     * @param {string} operation - Name of this operation
     * @param {CascadingController|null} parent - Parent controller
     */
    constructor(operation, parent = null) {
        this.operation = operation;
        this.parent = parent;
        this.children = new Set();
        this.cleanupHandlers = [];
        this.abortReason = null;

        // Create native AbortController
        this._controller = new AbortController();

        // If parent exists, link to parent's abort
        if (parent) {
            parent.children.add(this);

            // Listen for parent abort
            parent.signal.addEventListener('abort', () => {
                if (!this._controller.signal.aborted) {
                    this._abort(parent.abortReason || 'Parent operation cancelled', true);
                }
            }, { once: true });
        }

        if (DEBUG) {
            console.log(`[CascadingAbort] Created controller: ${operation}${parent ? ` (child of ${parent.operation})` : ''}`);
        }
    }

    /**
     * Get the AbortSignal for this controller
     * @returns {AbortSignal}
     */
    get signal() {
        return this._controller.signal;
    }

    /**
     * Check if this controller has been aborted
     * @returns {boolean}
     */
    get aborted() {
        return this._controller.signal.aborted;
    }

    /**
     * Create a child controller
     * @param {string} childOperation - Name of the child operation
     * @returns {CascadingController}
     */
    child(childOperation) {
        if (this.aborted) {
            throw new CascadingAbortError(
                childOperation,
                'Cannot create child of aborted controller',
                this.operation
            );
        }
        return new CascadingController(childOperation, this);
    }

    /**
     * Register a cleanup handler to run on abort
     * @param {Function} handler - Cleanup function
     * @returns {Function} Remove handler function
     */
    onCleanup(handler) {
        if (this.aborted) {
            // Already aborted, run handler immediately
            try {
                handler(this.abortReason);
            } catch (e) {
                console.error(`[CascadingAbort] Cleanup handler error:`, e);
            }
            return () => { };
        }

        this.cleanupHandlers.push(handler);
        return () => {
            const index = this.cleanupHandlers.indexOf(handler);
            if (index > -1) {
                this.cleanupHandlers.splice(index, 1);
            }
        };
    }

    /**
     * Abort this controller and all children
     * @param {string} reason - Reason for abort
     */
    abort(reason = 'Operation cancelled') {
        this._abort(reason, false);
    }

    /**
     * Internal abort implementation
     * @param {string} reason - Abort reason
     * @param {boolean} fromParent - Whether abort originated from parent
     */
    _abort(reason, fromParent = false) {
        if (this.aborted) {
            return; // Already aborted
        }

        this.abortReason = reason;

        if (DEBUG) {
            console.log(`[CascadingAbort] Aborting: ${this.operation} - ${reason}${fromParent ? ' (from parent)' : ''}`);
        }

        // Abort children first (bottom-up cleanup)
        for (const child of this.children) {
            child._abort(`Parent "${this.operation}" aborted: ${reason}`, true);
        }

        // Run cleanup handlers
        for (const handler of this.cleanupHandlers) {
            try {
                handler(reason);
            } catch (e) {
                console.error(`[CascadingAbort] Cleanup handler error for ${this.operation}:`, e);
            }
        }
        this.cleanupHandlers = [];

        // Abort the native controller
        this._controller.abort(new CascadingAbortError(this.operation, reason, fromParent ? this.parent?.operation : null));

        // Remove from parent's children set
        if (this.parent) {
            this.parent.children.delete(this);
        }
    }

    /**
     * Set a timeout that auto-aborts this controller
     * @param {number} timeoutMs - Timeout in milliseconds
     * @param {string} [timeoutReason] - Custom reason for timeout abort
     * @returns {Function} Cancel timeout function
     */
    setTimeout(timeoutMs, timeoutReason = null) {
        const reason = timeoutReason || `Timeout after ${timeoutMs}ms`;
        const timeoutId = setTimeout(() => this.abort(reason), timeoutMs);

        // Register cleanup to clear timeout if aborted for other reason
        const removeHandler = this.onCleanup(() => {
            clearTimeout(timeoutId);
        });

        // Return function to cancel the timeout
        return () => {
            clearTimeout(timeoutId);
            removeHandler();
        };
    }

    /**
     * Get the hierarchy of operations from root to this controller
     * @returns {string[]}
     */
    getHierarchy() {
        const hierarchy = [this.operation];
        let current = this.parent;
        while (current) {
            hierarchy.unshift(current.operation);
            current = current.parent;
        }
        return hierarchy;
    }

    /**
     * Get status information
     * @returns {Object}
     */
    getStatus() {
        return {
            operation: this.operation,
            aborted: this.aborted,
            abortReason: this.abortReason,
            childCount: this.children.size,
            cleanupHandlerCount: this.cleanupHandlers.length,
            hierarchy: this.getHierarchy()
        };
    }
}

// ==========================================
// Active Controllers Registry
// ==========================================

/** @type {Map<string, CascadingController>} */
const activeControllers = new Map();

// ==========================================
// Public API
// ==========================================

/**
 * Create a new root cascading controller
 * @param {string} operation - Operation name (also serves as ID)
 * @returns {CascadingController}
 */
function create(operation) {
    // Clean up any existing controller with same name
    if (activeControllers.has(operation)) {
        const existing = activeControllers.get(operation);
        if (!existing.aborted) {
            existing.abort('Replaced by new operation');
        }
    }

    const controller = new CascadingController(operation);
    activeControllers.set(operation, controller);

    // Auto-cleanup when aborted
    controller.onCleanup(() => {
        activeControllers.delete(operation);
    });

    return controller;
}

/**
 * Get an active controller by operation name
 * @param {string} operation - Operation name
 * @returns {CascadingController|null}
 */
function get(operation) {
    return activeControllers.get(operation) || null;
}

/**
 * Abort a controller by operation name
 * @param {string} operation - Operation name
 * @param {string} [reason] - Abort reason
 * @returns {boolean} True if controller existed and was aborted
 */
function abort(operation, reason = 'Cancelled') {
    const controller = activeControllers.get(operation);
    if (controller && !controller.aborted) {
        controller.abort(reason);
        return true;
    }
    return false;
}

/**
 * Abort all active controllers
 * @param {string} [reason] - Abort reason
 */
function abortAll(reason = 'All operations cancelled') {
    for (const [, controller] of activeControllers) {
        if (!controller.aborted) {
            controller.abort(reason);
        }
    }
    activeControllers.clear();
}

/**
 * Get count of active controllers
 * @returns {number}
 */
function getActiveCount() {
    return activeControllers.size;
}

/**
 * Get status of all active controllers
 * @returns {Object[]}
 */
function getActiveStatus() {
    return Array.from(activeControllers.values()).map(c => c.getStatus());
}

/**
 * Extract a useful message from signal.reason
 * @param {*} reason - The abort reason
 * @param {string} defaultMessage - Default message if reason is invalid
 * @returns {string}
 */
function extractAbortReason(reason, defaultMessage = 'Operation aborted') {
    if (reason === null || reason === undefined) {
        return defaultMessage;
    }
    
    // If reason is an object with a .reason string property, use that
    if (typeof reason === 'object' && reason !== null && typeof reason.reason === 'string') {
        return reason.reason;
    }
    
    // If reason is an Error, use its message
    if (reason instanceof Error) {
        return reason.message;
    }
    
    // If reason is a string, use it
    if (typeof reason === 'string') {
        return reason;
    }
    
    // Otherwise, convert to string
    return String(reason);
}

/**
 * Wrap a promise to be abortable
 * @param {Promise} promise - Promise to wrap
 * @param {AbortSignal} signal - Abort signal
 * @param {string} [operation='promise'] - Operation name for error
 * @returns {Promise}
 */
function wrapPromise(promise, signal, operation = 'promise') {
    if (signal.aborted) {
        const reason = extractAbortReason(signal.reason, 'Already aborted');
        return Promise.reject(new CascadingAbortError(operation, reason));
    }

    return new Promise((resolve, reject) => {
        const abortHandler = () => {
            const reason = extractAbortReason(signal.reason, 'Operation aborted');
            reject(new CascadingAbortError(operation, reason));
        };

        signal.addEventListener('abort', abortHandler, { once: true });

        promise
            .then(result => {
                signal.removeEventListener('abort', abortHandler);
                resolve(result);
            })
            .catch(error => {
                signal.removeEventListener('abort', abortHandler);
                reject(error);
            });
    });
}

// ==========================================
// Exports
// ==========================================

export const CascadingAbort = {
    // Core operations
    create,
    get,
    abort,
    abortAll,

    // Promise utilities
    wrapPromise,

    // Diagnostics
    getActiveCount,
    getActiveStatus,

    // Class export for instanceof checks
    CascadingController,
    CascadingAbortError
};


console.log('[CascadingAbort] Cascading Abort Controller loaded');
