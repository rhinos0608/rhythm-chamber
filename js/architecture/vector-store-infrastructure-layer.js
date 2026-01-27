/**
 * Vector Store Infrastructure Layer
 *
 * This layer defines HOW TO IMPLEMENT low-level vector storage operations.
 * It handles SharedArrayBuffer construction and data copying.
 *
 * Layer: Infrastructure (HOW TO IMPLEMENT)
 * Responsibilities:
 * - Create SharedArrayBuffer for zero-copy transfer
 * - Copy vectors into shared memory
 * - Handle low-level data operations
 * - No business logic (no validation rules)
 *
 * @module architecture/vector-store-infrastructure-layer
 */

// ==========================================
// Constants
// ==========================================

/**
 * Error codes for infrastructure failures
 */
export const INFRASTRUCTURE_ERRORS = {
    SHARED_ARRAY_BUFFER_UNAVAILABLE: 'shared_array_buffer_unavailable',
    BUFFER_ALLOCATION_FAILED: 'buffer_allocation_failed',
    NO_VECTORS: 'no_vectors',
    INVALID_DIMENSIONS: 'invalid_dimensions'
};

/**
 * Bytes per Float32 element
 */
export const BYTES_PER_FLOAT32 = 4;

// ==========================================
// Infrastructure Error Class
// ==========================================

/**
 * Custom error for infrastructure failures
 * Includes error code and details for debugging
 */
export class InfrastructureError extends Error {
    /**
     * @param {string} code - Error code from INFRASTRUCTURE_ERRORS
     * @param {Object} [details] - Additional error details
     */
    constructor(code, details = {}) {
        super(`InfrastructureError: ${code}`);
        this.name = 'InfrastructureError';
        this.code = code;
        this.details = details;
    }
}

// ==========================================
// SharedArrayBuffer Detection
// ==========================================

/**
 * Check if SharedArrayBuffer is available in current environment
 * Requires COOP/COEP headers for cross-origin isolation
 *
 * @returns {boolean} True if SharedArrayBuffer can be used
 */
export function isSharedArrayBufferAvailable() {
    try {
        if (typeof SharedArrayBuffer === 'undefined') return false;
        const test = new SharedArrayBuffer(8);
        return test.byteLength === 8;
    } catch {
        return false;
    }
}

// ==========================================
// SharedArrayBuffer Creation
// ==========================================

/**
 * Create a SharedArrayBuffer for vector storage
 *
 * Infrastructure operation only - no validation of vector business rules
 *
 * @param {number} dimensions - Vector dimensions
 * @param {number} count - Number of vectors
 * @returns {{success: boolean, buffer: SharedArrayBuffer|null, byteLength: number, error?: string}}
 */
export function createSharedVectorBuffer(dimensions, count) {
    // Check availability
    if (!isSharedArrayBufferAvailable()) {
        return {
            success: false,
            buffer: null,
            byteLength: 0,
            error: INFRASTRUCTURE_ERRORS.SHARED_ARRAY_BUFFER_UNAVAILABLE
        };
    }

    // Validate dimensions (infrastructure-level: must be positive number)
    if (typeof dimensions !== 'number' || dimensions < 0 || !Number.isFinite(dimensions)) {
        return {
            success: false,
            buffer: null,
            byteLength: 0,
            error: INFRASTRUCTURE_ERRORS.INVALID_DIMENSIONS
        };
    }

    // Validate count (infrastructure-level: must be non-negative number)
    if (typeof count !== 'number' || count < 0 || !Number.isFinite(count)) {
        return {
            success: false,
            buffer: null,
            byteLength: 0,
            error: INFRASTRUCTURE_ERRORS.INVALID_DIMENSIONS
        };
    }

    const totalFloats = dimensions * count;
    const byteLength = totalFloats * BYTES_PER_FLOAT32;

    try {
        const buffer = new SharedArrayBuffer(byteLength);
        return {
            success: true,
            buffer,
            byteLength
        };
    } catch (e) {
        return {
            success: false,
            buffer: null,
            byteLength: 0,
            error: INFRASTRUCTURE_ERRORS.BUFFER_ALLOCATION_FAILED,
            details: { message: e?.message || String(e) }
        };
    }
}

// ==========================================
// Vector Payload Building
// ==========================================

/**
 * Build a shared vector payload for worker transfer
 *
 * Infrastructure operation: copies validated vectors into SharedArrayBuffer
 * Assumes vectors were already validated by the business layer.
 *
 * @param {Array<{id: string|number, vector: number[], payload: any}>} vectors - Pre-validated vectors
 * @param {number} dimensions - Expected dimensions
 * @returns {{success: boolean, payload?: {sharedVectors: SharedArrayBuffer, payloads: Array, dimensions: number}, error?: string}}
 */
export function buildSharedVectorPayload(vectors, dimensions) {
    // Check availability
    if (!isSharedArrayBufferAvailable()) {
        return {
            success: false,
            error: INFRASTRUCTURE_ERRORS.SHARED_ARRAY_BUFFER_UNAVAILABLE
        };
    }

    // Check for empty input
    if (!vectors || !Array.isArray(vectors) || vectors.length === 0) {
        return {
            success: false,
            error: INFRASTRUCTURE_ERRORS.NO_VECTORS
        };
    }

    const count = vectors.length;

    // Create buffer
    const bufferResult = createSharedVectorBuffer(dimensions, count);
    if (!bufferResult.success) {
        return {
            success: false,
            error: bufferResult.error
        };
    }

    const { buffer } = bufferResult;
    const floatView = new Float32Array(buffer);

    // Copy vectors into shared buffer (pure data operation)
    for (let i = 0; i < count; i++) {
        const item = vectors[i];
        const vector = item.vector || [];

        // Copy element by element
        for (let j = 0; j < dimensions && j < vector.length; j++) {
            floatView[i * dimensions + j] = vector[j];
        }

        // Fill remaining with zeros if vector is shorter
        for (let j = vector.length; j < dimensions; j++) {
            floatView[i * dimensions + j] = 0;
        }
    }

    // Build payloads array (id + metadata, not the actual vectors)
    const payloads = vectors.map(v => ({
        id: v.id,
        payload: v.payload || {}
    }));

    return {
        success: true,
        payload: {
            sharedVectors: buffer,
            payloads,
            dimensions
        }
    };
}

// ==========================================
// Export
// ==========================================

export default {
    INFRASTRUCTURE_ERRORS,
    BYTES_PER_FLOAT32,
    InfrastructureError,
    isSharedArrayBufferAvailable,
    createSharedVectorBuffer,
    buildSharedVectorPayload
};
