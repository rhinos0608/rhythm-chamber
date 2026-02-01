/**
 * Session Lock Manager
 *
 * Handles concurrent access control for session operations, preventing
 * race conditions and deadlocks during message processing and session switches.
 *
 * Features:
 * - Mutex-based lock management
 * - Proactive circular wait detection using wait-for graph
 * - Lock acquisition timeout
 * - Exponential backoff retry
 *
 * HNW Considerations:
 * - Hierarchy: Prevents lost update races from concurrent session operations
 * - Wave: Exponential backoff prevents thundering herd under contention
 * - Network: Timeout ensures responsive UX even under high load
 *
 * @module services/session-lock-manager
 */

import { Mutex } from '../utils/concurrency/mutex.js';

// ==========================================
// Constants
// ==========================================

const LOCK_ACQUISITION_TIMEOUT_MS = 5000; // 5 second timeout for lock acquisition
const MAX_RETRY_ATTEMPTS = 3; // Maximum retry attempts with exponential backoff
const BASE_RETRY_DELAY_MS = 100; // Base delay for exponential backoff

/**
 * Session Lock Manager
 * Manages concurrent access to session data and prevents race conditions
 */
export class SessionLockManager {
    /**
     * Create a new SessionLockManager
     */
    constructor() {
        // Lock for preventing session switches during message processing
        this._processingSessionId = null; // Session ID currently being processed
        this._processingMutex = new Mutex();

        // Wait-for graph for proactive circular wait detection
        // Key: sessionId (waiting session)
        // Value: Set of sessionIds that this session is waiting for
        this._waitForGraph = new Map();

        // Track which sessions are currently waiting (not yet acquired)
        // Key: sessionId
        // Value: true if waiting
        this._waitingSessions = new Set();
    }

    /**
     * Detect if adding a wait-for edge would create a cycle in the wait-for graph
     * Uses depth-first search (DFS) to detect cycles
     *
     * @param {string} waitingSession - Session that wants to acquire lock
     * @param {string} blockingSession - Session that currently holds lock
     * @returns {boolean} True if a cycle would be created
     * @private
     */
    _wouldCreateCycle(waitingSession, blockingSession) {
        // If waitingSession is already holding the lock, it's a self-wait (cycle)
        if (this._processingSessionId === waitingSession) {
            return true;
        }

        // If the waiting session is not already in the wait-for graph, no cycle possible
        if (!this._waitingSessions.has(waitingSession)) {
            return false;
        }

        // Check if blockingSession can reach waitingSession in the current wait-for graph
        // If so, adding waitingSession -> blockingSession would create a cycle
        const visited = new Set();
        const hasPathTo = (from, to) => {
            if (from === to) {
                return true;
            }
            if (visited.has(from)) {
                return false;
            }
            visited.add(from);

            const waitingFor = this._waitForGraph.get(from);
            if (waitingFor) {
                for (const nextSession of waitingFor) {
                    if (hasPathTo(nextSession, to)) {
                        return true;
                    }
                }
            }
            return false;
        };

        // Check if blockingSession has a path to waitingSession
        // If blockingSession -> ... -> waitingSession exists, then
        // adding waitingSession -> blockingSession creates a cycle
        return hasPathTo(blockingSession, waitingSession);
    }

    /**
     * Register a session as waiting for another session in the wait-for graph
     *
     * @param {string} waitingSession - Session that is waiting
     * @param {string} blockingSession - Session that is being waited for
     * @private
     */
    _registerWait(waitingSession, blockingSession) {
        // Add to wait-for graph
        if (!this._waitForGraph.has(waitingSession)) {
            this._waitForGraph.set(waitingSession, new Set());
        }
        this._waitForGraph.get(waitingSession).add(blockingSession);

        // Mark as waiting
        this._waitingSessions.add(waitingSession);

        console.debug(
            '[SessionLockManager] Registered wait:',
            waitingSession,
            '->',
            blockingSession
        );
    }

    /**
     * Remove a session from the wait-for graph when it acquires the lock or gives up
     *
     * @param {string} sessionId - Session to remove from graph
     * @private
     */
    _unregisterWait(sessionId) {
        this._waitForGraph.delete(sessionId);
        this._waitingSessions.delete(sessionId);

        // Also remove any edges pointing to this session
        for (const [waitingSession, waitingFor] of this._waitForGraph.entries()) {
            waitingFor.delete(sessionId);
            if (waitingFor.size === 0) {
                this._waitForGraph.delete(waitingSession);
                this._waitingSessions.delete(waitingSession);
            }
        }

        console.debug('[SessionLockManager] Unregistered wait for:', sessionId);
    }

    /**
     * Acquire session processing lock to prevent session switches during message processing
     * This prevents race conditions where a session switch happens mid-message processing
     *
     * @param {string} expectedSessionId - The session ID expected to be active
     * @returns {Promise<{ locked: boolean, currentSessionId: string|null, release?: Function, error?: string }>} Lock result
     */
    async acquireProcessingLock(expectedSessionId) {
        const startTime = Date.now();
        let attemptCount = 0;
        let registeredWait = false;

        // Register this session as waiting if lock is held by different session
        if (this._processingSessionId !== null && this._processingSessionId !== expectedSessionId) {
            this._registerWait(expectedSessionId, this._processingSessionId);
            registeredWait = true;
        }

        try {
            while (attemptCount < MAX_RETRY_ATTEMPTS) {
                attemptCount++;

                // Check timeout
                if (Date.now() - startTime > LOCK_ACQUISITION_TIMEOUT_MS) {
                    console.warn(
                        '[SessionLockManager] Lock acquisition timeout after',
                        LOCK_ACQUISITION_TIMEOUT_MS,
                        'ms'
                    );
                    return {
                        locked: false,
                        currentSessionId: this._processingSessionId,
                        error: 'Lock acquisition timeout',
                    };
                }

                // PROACTIVE CIRCULAR WAIT DETECTION: Check if acquiring would create a cycle
                // Only check if we would be waiting for a different session
                if (
                    this._processingSessionId !== null &&
                    this._processingSessionId !== expectedSessionId
                ) {
                    // Check if this acquisition would create a cycle
                    if (this._wouldCreateCycle(expectedSessionId, this._processingSessionId)) {
                        console.warn(
                            '[SessionLockManager] Circular wait detected - would create deadlock'
                        );
                        return {
                            locked: false,
                            currentSessionId: this._processingSessionId,
                            error: 'Circular wait detected',
                        };
                    }
                }

                // CIRCULAR WAIT DETECTION: Check if we're waiting for ourselves
                if (this._processingSessionId === expectedSessionId && !registeredWait) {
                    console.warn(
                        '[SessionLockManager] Circular wait detected - same session already holds lock'
                    );
                    return {
                        locked: false,
                        currentSessionId: this._processingSessionId,
                        error: 'Circular wait detected',
                    };
                }

                // Try to acquire lock using mutex with timeout
                try {
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(
                            () => reject(new Error('Lock wait timeout')),
                            LOCK_ACQUISITION_TIMEOUT_MS
                        );
                    });

                    // Try to acquire the lock
                    const lockPromise = this._processingMutex.runExclusive(async () => {
                        // If there's already a lock by a different session
                        if (
                            this._processingSessionId !== null &&
                            this._processingSessionId !== expectedSessionId
                        ) {
                            // If this session was registered as waiting, it means the lock holder changed
                            // This is expected behavior - allow acquisition
                            if (!registeredWait) {
                                throw new Error('Session switched during lock acquisition');
                            }
                            // If registered as waiting, the lock might have been released - continue to acquire
                        }

                        // Acquire the lock
                        this._processingSessionId = expectedSessionId;

                        // Return a release function that also cleans up the wait-for graph
                        return () => {
                            this._processingSessionId = null;
                            this._unregisterWait(expectedSessionId);
                        };
                    });

                    const release = await Promise.race([lockPromise, timeoutPromise]);

                    // Successfully acquired - remove from wait-for graph
                    if (registeredWait) {
                        this._unregisterWait(expectedSessionId);
                        registeredWait = false;
                    }

                    return {
                        locked: true,
                        currentSessionId: expectedSessionId,
                        release: release,
                    };
                } catch (error) {
                    console.warn(
                        '[SessionLockManager] Lock acquisition attempt',
                        attemptCount,
                        'failed:',
                        error.message
                    );

                    // If it's a timeout or session switch, return failure immediately
                    if (
                        error.message.includes('Lock wait timeout') ||
                        error.message.includes('Session switched')
                    ) {
                        return {
                            locked: false,
                            currentSessionId: this._processingSessionId,
                            error: error.message,
                        };
                    }

                    // Other errors - retry with backoff
                    if (attemptCount < MAX_RETRY_ATTEMPTS) {
                        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attemptCount - 1);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                }
            }

            // All retries exhausted
            console.warn(
                '[SessionLockManager] Lock acquisition failed after',
                MAX_RETRY_ATTEMPTS,
                'attempts'
            );
            return {
                locked: false,
                currentSessionId: this._processingSessionId,
                error: 'Max retry attempts exceeded',
            };
        } finally {
            // Clean up wait-for graph registration on failure
            if (registeredWait) {
                this._unregisterWait(expectedSessionId);
            }
        }
    }

    /**
     * Check if a session currently holds the processing lock
     * @param {string} sessionId - Session ID to check
     * @returns {boolean} True if session holds the lock
     */
    isSessionLocked(sessionId) {
        return this._processingSessionId === sessionId;
    }

    /**
     * Get the current session holding the lock
     * @returns {string|null} Session ID or null if no lock is held
     */
    get currentSessionLock() {
        return this._processingSessionId;
    }

    /**
     * Force release any held lock (emergency use only)
     * @returns {void}
     */
    forceReleaseLock() {
        console.warn(
            '[SessionLockManager] Force releasing lock for session:',
            this._processingSessionId
        );
        this._processingSessionId = null;
    }

    /**
     * Get lock statistics for monitoring
     * @returns {Object} Lock statistics
     */
    getStats() {
        return {
            currentLock: this._processingSessionId,
            isLocked: this._processingSessionId !== null,
            mutexLocked: this._processingMutex.isLocked(),
        };
    }
}

// Export singleton instance for module-level usage
const lockManager = new SessionLockManager();
export default lockManager;

console.log('[SessionLockManager] Module loaded');
