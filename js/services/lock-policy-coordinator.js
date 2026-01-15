/**
 * Lock Policy Coordinator
 * 
 * Centralizes conflict matrix logic for operation locks.
 * Provides a single point of truth for which operations can run concurrently.
 * 
 * HNW Hierarchy: Controllers ask LockPolicy before acquiring locks,
 * enabling consistent conflict resolution across the application.
 * 
 * @module services/lock-policy-coordinator
 */

// ==========================================
// Conflict Matrix
// ==========================================

/**
 * Conflict definitions:
 * - Key: operation name
 * - Value: array of conflicting operations ('*' = conflicts with everything)
 */
const CONFLICT_MATRIX = {
    // File processing conflicts with embedding and privacy operations
    'file_processing': ['embedding_generation', 'privacy_clear'],

    // Embedding generation conflicts with file and privacy operations
    'embedding_generation': ['file_processing', 'privacy_clear'],

    // Privacy clear is exclusive - conflicts with everything
    'privacy_clear': ['*'],

    // Spotify fetch conflicts with chat save (session data integrity)
    'spotify_fetch': ['chat_save'],

    // Chat save conflicts with spotify fetch
    'chat_save': ['spotify_fetch']
};

/**
 * Resolution strategies for conflicts
 */
const RESOLUTION_STRATEGIES = {
    // Abort: Stop the new operation, keep existing
    ABORT: 'abort',

    // Queue: Wait for existing operation to complete
    QUEUE: 'queue',

    // Force: Cancel existing operation (dangerous, use sparingly)
    FORCE: 'force'
};

/**
 * Default resolution strategy per operation
 */
const DEFAULT_RESOLUTIONS = {
    'file_processing': RESOLUTION_STRATEGIES.QUEUE,
    'embedding_generation': RESOLUTION_STRATEGIES.QUEUE,
    'privacy_clear': RESOLUTION_STRATEGIES.ABORT, // Never queue privacy operations
    'spotify_fetch': RESOLUTION_STRATEGIES.ABORT,
    'chat_save': RESOLUTION_STRATEGIES.QUEUE
};

// ==========================================
// Core Functions
// ==========================================

/**
 * Check if operations can be acquired together
 * 
 * @param {string|string[]} requestedOperations - Operation(s) to check
 * @param {string[]} [activeOperations] - Currently active operations (auto-detected if not provided)
 * @returns {{
 *   allowed: boolean,
 *   conflicts: string[],
 *   resolution: 'abort'|'queue'|'force',
 *   reason: string
 * }}
 */
function canAcquire(requestedOperations, activeOperations = null) {
    // Normalize to array
    const requested = Array.isArray(requestedOperations)
        ? requestedOperations
        : [requestedOperations];

    // Get active operations from OperationLock if not provided
    const active = activeOperations ?? getActiveOperations();

    // No active operations = no conflicts
    if (active.length === 0) {
        return {
            allowed: true,
            conflicts: [],
            resolution: null,
            reason: 'No active operations'
        };
    }

    // Find all conflicts
    const conflicts = findConflicts(requested, active);

    if (conflicts.length === 0) {
        return {
            allowed: true,
            conflicts: [],
            resolution: null,
            reason: 'No conflicts detected'
        };
    }

    // Determine resolution strategy
    const resolution = determineResolution(requested, conflicts);

    return {
        allowed: false,
        conflicts,
        resolution,
        reason: `Blocked by: ${conflicts.join(', ')}`
    };
}

/**
 * Find all conflicts between requested and active operations
 * 
 * @param {string[]} requested - Requested operations
 * @param {string[]} active - Currently active operations
 * @returns {string[]} Array of conflicting operation names
 */
function findConflicts(requested, active) {
    const conflicts = new Set();

    for (const reqOp of requested) {
        const conflictList = CONFLICT_MATRIX[reqOp] || [];

        // Check if this operation conflicts with any active operation
        for (const activeOp of active) {
            // Check direct conflict
            if (conflictList.includes(activeOp)) {
                conflicts.add(activeOp);
            }

            // Check wildcard conflict (conflicts with everything)
            if (conflictList.includes('*')) {
                conflicts.add(activeOp);
            }

            // Check reverse conflict (active operation conflicts with requested)
            const reverseConflicts = CONFLICT_MATRIX[activeOp] || [];
            if (reverseConflicts.includes(reqOp) || reverseConflicts.includes('*')) {
                conflicts.add(activeOp);
            }
        }
    }

    return Array.from(conflicts);
}

/**
 * Determine the resolution strategy for conflicts
 * 
 * @param {string[]} requested - Requested operations
 * @param {string[]} conflicts - Conflicting operations
 * @returns {'abort'|'queue'|'force'}
 */
function determineResolution(requested, conflicts) {
    // If any conflict is privacy_clear, always abort
    if (conflicts.includes('privacy_clear')) {
        return RESOLUTION_STRATEGIES.ABORT;
    }

    // Use the first requested operation's default resolution
    const primaryOp = requested[0];
    return DEFAULT_RESOLUTIONS[primaryOp] || RESOLUTION_STRATEGIES.ABORT;
}

/**
 * Get currently active operations from OperationLock
 * 
 * @returns {string[]}
 */
function getActiveOperations() {
    if (typeof window !== 'undefined' && window.OperationLock) {
        return window.OperationLock.getActiveLocks();
    }
    return [];
}

/**
 * Get the full conflict matrix (for debugging/testing)
 * 
 * @returns {Object}
 */
function getConflictMatrix() {
    return { ...CONFLICT_MATRIX };
}

/**
 * Check if two specific operations conflict
 * 
 * @param {string} op1 - First operation
 * @param {string} op2 - Second operation
 * @returns {boolean}
 */
function operationsConflict(op1, op2) {
    if (op1 === op2) return true;

    const conflicts1 = CONFLICT_MATRIX[op1] || [];
    const conflicts2 = CONFLICT_MATRIX[op2] || [];

    return conflicts1.includes(op2) ||
        conflicts1.includes('*') ||
        conflicts2.includes(op1) ||
        conflicts2.includes('*');
}

/**
 * Register a custom conflict rule (for extensibility)
 * 
 * @param {string} operation - Operation name
 * @param {string[]} conflictsWith - Operations it conflicts with
 */
function registerConflict(operation, conflictsWith) {
    CONFLICT_MATRIX[operation] = conflictsWith;
}

/**
 * Set default resolution for an operation
 * 
 * @param {string} operation - Operation name
 * @param {'abort'|'queue'|'force'} resolution - Resolution strategy
 */
function setDefaultResolution(operation, resolution) {
    if (!Object.values(RESOLUTION_STRATEGIES).includes(resolution)) {
        throw new Error(`Invalid resolution: ${resolution}`);
    }
    DEFAULT_RESOLUTIONS[operation] = resolution;
}

// ==========================================
// Public API
// ==========================================

const LockPolicy = {
    // Core operations
    canAcquire,
    findConflicts,
    operationsConflict,

    // Configuration
    registerConflict,
    setDefaultResolution,
    getConflictMatrix,

    // Constants
    RESOLUTION_STRATEGIES,

    // For testing
    _getActiveOperations: getActiveOperations
};

// ES Module export
export { LockPolicy };

console.log('[LockPolicy] Lock Policy Coordinator loaded');
