/**
 * Operation Lock Error Classes
 * 
 * Standardized error types for lock acquisition failures across the hierarchy.
 * Provides structured error information for better recovery and debugging.
 */

/**
 * Error thrown when lock acquisition fails due to conflicting operations
 */
class LockAcquisitionError extends Error {
    /**
     * @param {string} operationName - The operation that failed to acquire lock
     * @param {string[]} blockedBy - Array of operation names blocking acquisition
     * @param {string} [message] - Custom error message (optional)
     */
    constructor(operationName, blockedBy, message = null) {
        const defaultMsg = `Operation '${operationName}' blocked by: ${blockedBy.join(', ')}`;
        super(message || defaultMsg);

        this.name = 'LockAcquisitionError';
        this.operationName = operationName;
        this.blockedBy = blockedBy;
        this.timestamp = Date.now();
        this.recoverable = true; // Can be retried later

        // For stack trace clarity
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LockAcquisitionError);
        }
    }

    /**
     * Get human-readable recovery suggestion
     * @returns {string}
     */
    getRecoverySuggestion() {
        const blockingOps = this.blockedBy.join(', ');
        return `Wait for ${blockingOps} to complete, then retry ${this.operationName}`;
    }

    /**
     * Check if this error is blocking a specific operation
     * @param {string} operationName
     * @returns {boolean}
     */
    isBlocking(operationName) {
        return this.blockedBy.includes(operationName);
    }
}

/**
 * Error thrown when lock acquisition times out
 */
class LockTimeoutError extends Error {
    /**
     * @param {string} operationName - The operation that timed out
     * @param {number} timeoutMs - Timeout duration in milliseconds
     */
    constructor(operationName, timeoutMs) {
        super(`Lock acquisition for '${operationName}' timed out after ${timeoutMs}ms`);

        this.name = 'LockTimeoutError';
        this.operationName = operationName;
        this.timeoutMs = timeoutMs;
        this.timestamp = Date.now();
        this.recoverable = false; // Timeout suggests deeper issue

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LockTimeoutError);
        }
    }
}

/**
 * Error thrown when lock release fails (owner mismatch or not found)
 */
class LockReleaseError extends Error {
    /**
     * @param {string} operationName - The operation that failed to release
     * @param {string} expectedOwner - Expected owner ID
     * @param {string} actualOwner - Actual owner ID (or null if not found)
     */
    constructor(operationName, expectedOwner, actualOwner) {
        const message = actualOwner
            ? `Lock release failed for '${operationName}': owner mismatch (expected ${expectedOwner}, got ${actualOwner})`
            : `Lock release failed for '${operationName}': no active lock found`;

        super(message);

        this.name = 'LockReleaseError';
        this.operationName = operationName;
        this.expectedOwner = expectedOwner;
        this.actualOwner = actualOwner;
        this.timestamp = Date.now();
        this.recoverable = false; // Indicates programming error

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LockReleaseError);
        }
    }
}

/**
 * Error thrown when emergency lock release is requested
 */
class LockForceReleaseError extends Error {
    /**
     * @param {string[]} releasedOperations - Operations that were force-released
     * @param {string} reason - Reason for force release
     */
    constructor(releasedOperations, reason) {
        super(`Emergency lock release executed: ${releasedOperations.join(', ')} - Reason: ${reason}`);

        this.name = 'LockForceReleaseError';
        this.releasedOperations = releasedOperations;
        this.reason = reason;
        this.timestamp = Date.now();
        this.recoverable = false; // Emergency measure

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LockForceReleaseError);
        }
    }
}

// Export for use in operation-lock.js and other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LockAcquisitionError,
        LockTimeoutError,
        LockReleaseError,
        LockForceReleaseError
    };
}

// Also attach to window for browser compatibility
if (typeof window !== 'undefined') {
    window.LockAcquisitionError = LockAcquisitionError;
    window.LockTimeoutError = LockTimeoutError;
    window.LockReleaseError = LockReleaseError;
    window.LockForceReleaseError = LockForceReleaseError;
}