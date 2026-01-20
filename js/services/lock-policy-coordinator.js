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

import { OperationLock } from '../operation-lock.js';

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
 * Operation levels for lock hierarchy (prevents deadlock)
 * Lower levels should be acquired before higher levels
 *
 * Level 0: System operations (highest priority)
 * Level 1: Data operations (medium priority)
 * Level 2: User operations (lowest priority)
 */
const OPERATION_LEVELS = {
    // Level 0: System operations (highest priority)
    'privacy_clear': 0,
    'file_processing': 0,
    'embedding_generation': 0,

    // Level 1: Data operations (medium priority)
    'chat_save': 1,
    'spotify_fetch': 1,

    // Level 2: User operations (lowest priority)
    'user_message': 2,
    'user_query': 2
};

/**
 * Default level for operations not explicitly defined
 */
const DEFAULT_LEVEL = 2;

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
    if (OperationLock) {
        return OperationLock.getActiveLocks();
    }
    return [];
}

/**
 * Get the full conflict matrix (for debugging/testing)
 * 
 * @returns {Object}
 */
function getConflictMatrix() {
    if (typeof structuredClone === 'function') {
        return structuredClone(CONFLICT_MATRIX);
    }

    return Object.fromEntries(
        Object.entries(CONFLICT_MATRIX).map(([operation, conflicts]) => ([
            operation,
            Array.isArray(conflicts) ? [...conflicts] : { ...conflicts }
        ]))
    );
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

/**
 * Get the level of an operation
 *
 * @param {string} operation - Operation name
 * @returns {number} Operation level (0-2)
 */
function getOperationLevel(operation) {
    return OPERATION_LEVELS[operation] ?? DEFAULT_LEVEL;
}

/**
 * Check if operations can be acquired in the given order (prevents deadlock)
 *
 * @param {string[]} requestedOperations - Operations to acquire
 * @param {string[]} [activeOperations] - Currently active operations
 * @returns {{
 *   allowed: boolean,
 *   conflicts: string[],
 *   resolution: 'abort'|'queue'|'force',
 *   reason: string
 * }}
 */
function canAcquireInOrder(requestedOperations, activeOperations = null) {
    // Normalize to array
    const requested = Array.isArray(requestedOperations)
        ? requestedOperations
        : [requestedOperations];

    // Get active operations from OperationLock if not provided
    const active = activeOperations ?? getActiveOperations();

    // Check for conflicts
    const conflictResult = canAcquire(requested, active);
    if (!conflictResult.allowed) {
        return conflictResult;
    }

    // Check lock hierarchy (prevent deadlock)
    // Operations should be acquired in order of increasing level
    // Lower levels should be acquired before higher levels
    const requestedLevels = requested.map(op => getOperationLevel(op));
    const activeLevels = active.map(op => getOperationLevel(op));

    // Check if any requested operation has a lower level than an active operation
    // This would violate the lock hierarchy and could cause deadlock
    for (const reqOp of requested) {
        const reqLevel = getOperationLevel(reqOp);
        for (const actOp of active) {
            const actLevel = getOperationLevel(actOp);
            if (reqLevel < actLevel) {
                return {
                    allowed: false,
                    conflicts: [actOp],
                    resolution: RESOLUTION_STRATEGIES.ABORT,
                    reason: `Lock hierarchy violation: ${reqOp} (level ${reqLevel}) cannot be acquired after ${actOp} (level ${actLevel})`
                };
            }
        }
    }

    return {
        allowed: true,
        conflicts: [],
        resolution: null,
        reason: 'No conflicts and lock hierarchy satisfied'
    };
}

/**
 * Get the level of an operation
 *
 * @param {string} operation - Operation name
 * @returns {number} Operation level (0-2)
 */
function getLevel(operation) {
    return getOperationLevel(operation);
}

/**
 * Get all operations at a specific level
 *
 * @param {number} level - Operation level (0-2)
 * @returns {string[]} Array of operation names
 */
function getOperationsByLevel(level) {
    return Object.entries(OPERATION_LEVELS)
        .filter(([_, opLevel]) => opLevel === level)
        .map(([operation, _]) => operation);
}

/**
 * Get the maximum level among operations
 *
 * @param {string[]} operations - Array of operation names
 * @returns {number} Maximum level
 */
function getMaxLevel(operations) {
    if (operations.length === 0) return DEFAULT_LEVEL;
    return Math.max(...operations.map(op => getOperationLevel(op)));
}

/**
 * Get the minimum level among operations
 *
 * @param {string[]} operations - Array of operation names
 * @returns {number} Minimum level
 */
function getMinLevel(operations) {
    if (operations.length === 0) return DEFAULT_LEVEL;
    return Math.min(...operations.map(op => getOperationLevel(op)));
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

    // Level-based operations
    canAcquireInOrder,
    getLevel,
    getOperationsByLevel,
    getMaxLevel,
    getMinLevel,

    // Constants
    RESOLUTION_STRATEGIES,

    // For testing
    _getActiveOperations: getActiveOperations
};

// ES Module export
export { LockPolicy };

console.log('[LockPolicy] Lock Policy Coordinator loaded');
