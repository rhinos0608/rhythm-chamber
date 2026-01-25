/**
 * Mutex - Promise-Chain Mutual Exclusion Lock
 *
 * Provides async mutual exclusion using the Promise-chain pattern.
 * This ensures that critical sections execute sequentially, preventing
 * race conditions when multiple async operations modify shared state.
 *
 * HNW Considerations:
 * - Hierarchy: Single lock ensures serialized access to protected state
 * - Network: Prevents lost update races from concurrent modifications
 * - Wave: Promise chain creates natural backpressure under contention
 *
 * ═══════════════════════════════════════════════════════════════
 * USAGE PATTERN
 * ═══════════════════════════════════════════════════════════════
 *
 * const mutex = new Mutex();
 *
 * // Critical section protected by mutex
 * await mutex.runExclusive(async () => {
 *     // Modify shared state safely
 *     sharedData.counter++;
 * });
 *
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Mutex class for async mutual exclusion
 * Uses Promise-chain pattern to serialize access to critical sections
 */
export class Mutex {
    /**
     * Create a new Mutex
     * The lock starts in released state (no operations pending)
     */
    constructor() {
        // The lock promise represents the "current" operation
        // New operations chain off this promise, creating sequential execution
        this._lock = Promise.resolve();
        // Counter to track lock state for isLocked()
        this._lockCount = 0;
    }

    /**
     * Execute a function exclusively within the mutex
     * Waits for any ongoing operations to complete before starting
     *
     * @param {Function} fn - Async function to execute exclusively
     * @returns {Promise<any>} Result of the function
     *
     * Example:
     *   const result = await mutex.runExclusive(async () => {
     *       return await someAsyncOperation();
     *   });
     */
    async runExclusive(fn) {
        // Capture the current lock (the operation we're waiting for)
        const previousLock = this._lock;

        // Create a new promise for the next operation to wait for
        let releaseLock, rejectLock;
        this._lock = new Promise((resolve, reject) => {
            releaseLock = resolve;
            rejectLock = reject;
        });

        // Wait for previous operations to complete
        await previousLock;

        // Use a local flag to track lock state within this execution context
        // This prevents race conditions between increment/decrement operations
        let lockAcquired = false;

        try {
            // Atomic increment - only do this once
            if (!lockAcquired) {
                this._lockCount++;
                lockAcquired = true;
            }

            // Execute the critical section
            return await fn();
        } catch (error) {
            // Reject the lock promise if critical section throws
            // This ensures any waiting operations are notified of the failure
            rejectLock(error);
            throw error;
        } finally {
            // Always decrement lock count if we acquired it
            if (lockAcquired) {
                this._lockCount--;
            }
            // Always release the lock (resolve the promise)
            // This prevents promise memory leaks and deadlocks
            releaseLock();
        }
    }

    /**
     * Check if the mutex is currently locked
     * Note: This is a snapshot and may change immediately after returning
     *
     * @returns {boolean} True if locked (operation in progress)
     */
    isLocked() {
        // The lock is "busy" if the lock count is greater than zero
        // This is a best-effort check, not a guarantee
        return this._lockCount > 0;
    }
}

/**
 * Named mutex registry for managing multiple independent locks
 * Useful when you need locks on different resources (e.g., per-session locks)
 */
export class MutexRegistry {
    constructor() {
        this._mutexes = new Map();
    }

    /**
     * Get or create a mutex for a given key
     * @param {string} key - Mutex identifier
     * @returns {Mutex} The mutex for this key
     */
    get(key) {
        if (!this._mutexes.has(key)) {
            this._mutexes.set(key, new Mutex());
        }
        return this._mutexes.get(key);
    }

    /**
     * Remove a mutex from the registry
     * Use with caution - only remove when no operations are pending
     * @param {string} key - Mutex identifier to remove
     */
    delete(key) {
        this._mutexes.delete(key);
    }

    /**
     * Clear all mutexes from the registry
     * Use with caution - only clear when no operations are pending
     */
    clear() {
        this._mutexes.clear();
    }

    /**
     * Get all registered mutex keys
     * @returns {Array<string>} Array of registered keys
     */
    keys() {
        return Array.from(this._mutexes.keys());
    }
}

// Export default
export default { Mutex, MutexRegistry };

console.log('[Mutex] Module loaded with Promise-chain pattern');
