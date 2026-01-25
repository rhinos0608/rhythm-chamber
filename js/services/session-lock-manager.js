/**
 * Session Lock Manager
 *
 * Handles concurrent access control for session operations, preventing
 * race conditions and deadlocks during message processing and session switches.
 *
 * Features:
 * - Mutex-based lock management
 * - Circular wait detection (reactive)
 * - Lock acquisition timeout
 * - Exponential backoff retry
 * - Wait-for graph for proactive detection (future)
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

const LOCK_ACQUISITION_TIMEOUT_MS = 5000;  // 5 second timeout for lock acquisition
const MAX_RETRY_ATTEMPTS = 3;  // Maximum retry attempts with exponential backoff
const BASE_RETRY_DELAY_MS = 100;  // Base delay for exponential backoff

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
        this._processingSessionId = null;  // Session ID currently being processed
        this._processingMutex = new Mutex();

        // Wait-for graph for proactive circular wait detection (future enhancement)
        this._waitForGraph = new Map();  // sessionId -> Set<sessionId>
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

        while (attemptCount < MAX_RETRY_ATTEMPTS) {
            attemptCount++;

            // Check timeout
            if (Date.now() - startTime > LOCK_ACQUISITION_TIMEOUT_MS) {
                console.warn('[SessionLockManager] Lock acquisition timeout after', LOCK_ACQUISITION_TIMEOUT_MS, 'ms');
                return {
                    locked: false,
                    currentSessionId: this._processingSessionId,
                    error: 'Lock acquisition timeout'
                };
            }

            // CIRCULAR WAIT DETECTION: Check if we're waiting for ourselves
            if (this._processingSessionId === expectedSessionId) {
                console.warn('[SessionLockManager] Circular wait detected - same session already holds lock');
                return {
                    locked: false,
                    currentSessionId: this._processingSessionId,
                    error: 'Circular wait detected'
                };
            }

            // Try to acquire lock using mutex with timeout
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Lock wait timeout')), LOCK_ACQUISITION_TIMEOUT_MS);
                });

                // Try to acquire the lock
                const lockPromise = this._processingMutex.runExclusive(async () => {
                    // If there's already a lock, verify it matches the expected session
                    if (this._processingSessionId !== null && this._processingSessionId !== expectedSessionId) {
                        throw new Error('Session switched during lock acquisition');
                    }

                    // Acquire the lock
                    this._processingSessionId = expectedSessionId;

                    // Return a release function
                    return () => {
                        this._processingSessionId = null;
                    };
                });

                const release = await Promise.race([lockPromise, timeoutPromise]);

                return {
                    locked: true,
                    currentSessionId: expectedSessionId,
                    release: release
                };

            } catch (error) {
                console.warn('[SessionLockManager] Lock acquisition attempt', attemptCount, 'failed:', error.message);

                // If session mismatch, don't retry
                if (error.message.includes('Session switched')) {
                    return {
                        locked: false,
                        currentSessionId: this._processingSessionId,
                        error: error.message
                    };
                }

                // Exponential backoff before retry
                if (attemptCount < MAX_RETRY_ATTEMPTS) {
                    const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attemptCount - 1);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }

        // All retries exhausted
        console.warn('[SessionLockManager] Lock acquisition failed after', MAX_RETRY_ATTEMPTS, 'attempts');
        return {
            locked: false,
            currentSessionId: this._processingSessionId,
            error: 'Max retry attempts exceeded'
        };
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
        console.warn('[SessionLockManager] Force releasing lock for session:', this._processingSessionId);
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
            mutexLocked: this._processingMutex.isLocked()
        };
    }
}

// Export singleton instance for module-level usage
const lockManager = new SessionLockManager();
export default lockManager;

console.log('[SessionLockManager] Module loaded');
