/**
 * Vector Store Business Logic Layer
 *
 * This layer defines WHAT data is valid for vector operations.
 * It contains NO implementation details - no IndexedDB, no SharedArrayBuffer,
 * no Worker references. Pure business rules only.
 *
 * Layer: Business Logic (WHAT)
 * Responsibilities:
 * - Define valid vector structure
 * - Define validation rules
 * - Define consistency requirements
 *
 * @module architecture/vector-store-business-layer
 */

// ==========================================
// Constants
// ==========================================

/**
 * Error codes for validation failures
 */
export const VALIDATION_ERRORS = {
    VECTOR_EMPTY: 'vector_empty',
    DIMENSION_MISMATCH: 'dimension_mismatch',
    INCONSISTENT_DIMENSIONS: 'inconsistent_dimensions',
    MISSING_VECTOR: 'missing_vector',
    CONTAINS_NAN: 'contains_nan',
    NON_NUMERIC: 'non_numeric',
    NOT_AN_ARRAY: 'not_an_array'
};

/**
 * Default vector dimensions for common models
 */
export const VECTOR_DIMENSIONS = {
    ALL_MINILM_L6_V2: 384,
    BERT_BASE: 768,
    GPT3: 12288
};

// ==========================================
// Dimension Validation
// ==========================================

/**
 * Validate that a vector has the expected dimensions
 *
 * Business Rule: Vectors must be non-empty arrays with exact dimension match
 *
 * @param {number[]} vector - The vector to validate
 * @param {number} expectedDimensions - Expected dimension count
 * @returns {{isValid: boolean, error?: string, actual?: number, expected?: number}}
 */
export function validateVectorDimensions(vector, expectedDimensions) {
    // Check if vector exists and is an array
    if (!vector || !Array.isArray(vector)) {
        return {
            isValid: false,
            error: VALIDATION_ERRORS.NOT_AN_ARRAY,
            expected: expectedDimensions,
            actual: 0
        };
    }

    // Check if vector is empty
    if (vector.length === 0) {
        return {
            isValid: false,
            error: VALIDATION_ERRORS.VECTOR_EMPTY,
            expected: expectedDimensions,
            actual: 0
        };
    }

    // Check dimensions match
    if (vector.length !== expectedDimensions) {
        return {
            isValid: false,
            error: VALIDATION_ERRORS.DIMENSION_MISMATCH,
            expected: expectedDimensions,
            actual: vector.length
        };
    }

    return {
        isValid: true
    };
}

// ==========================================
// Element Validation
// ==========================================

/**
 * Validate that all vector elements are valid numbers
 *
 * Business Rule: All elements must be finite numbers (no NaN, no Infinity)
 *
 * @param {number[]} vector - The vector to validate
 * @returns {{isValid: boolean, error?: string, invalidIndex?: number}}
 */
export function validateVectorElements(vector) {
    if (!vector || !Array.isArray(vector)) {
        return {
            isValid: false,
            error: VALIDATION_ERRORS.NOT_AN_ARRAY
        };
    }

    for (let i = 0; i < vector.length; i++) {
        const value = vector[i];

        // Check if value is a number
        if (typeof value !== 'number') {
            return {
                isValid: false,
                error: VALIDATION_ERRORS.NON_NUMERIC,
                invalidIndex: i,
                invalidValue: value
            };
        }

        // Check for NaN
        if (Number.isNaN(value)) {
            return {
                isValid: false,
                error: VALIDATION_ERRORS.CONTAINS_NAN,
                invalidIndex: i
            };
        }

        // Check for Infinity
        if (!Number.isFinite(value)) {
            return {
                isValid: false,
                error: VALIDATION_ERRORS.NON_NUMERIC,
                invalidIndex: i,
                invalidValue: value
            };
        }
    }

    return {
        isValid: true
    };
}

// ==========================================
// Collection Consistency Validation
// ==========================================

/**
 * Validate that all vectors in a collection have consistent dimensions
 *
 * Business Rule: All vectors must have the same dimensionality
 *
 * @param {Array<{id: string|number, vector: number[]}>} vectors - Vector collection
 * @returns {{isValid: boolean, dimensions?: number, error?: string, mismatchIds?: string[]}}
 */
export function validateVectorConsistency(vectors) {
    if (!vectors || !Array.isArray(vectors) || vectors.length === 0) {
        return {
            isValid: false,
            error: VALIDATION_ERRORS.VECTOR_EMPTY
        };
    }

    let expectedDimensions = null;
    const mismatchIds = [];

    for (const item of vectors) {
        // Check if item has a vector property
        if (!item || !item.vector || !Array.isArray(item.vector)) {
            return {
                isValid: false,
                error: VALIDATION_ERRORS.MISSING_VECTOR,
                itemId: item?.id
            };
        }

        const currentDimensions = item.vector.length;

        // Skip empty vectors
        if (currentDimensions === 0) {
            return {
                isValid: false,
                error: VALIDATION_ERRORS.VECTOR_EMPTY,
                itemId: item?.id
            };
        }

        // Set expected dimensions from first vector
        if (expectedDimensions === null) {
            expectedDimensions = currentDimensions;
        } else if (currentDimensions !== expectedDimensions) {
            // Track mismatched IDs
            mismatchIds.push(String(item.id));
        }
    }

    // Report if any mismatches found
    if (mismatchIds.length > 0) {
        return {
            isValid: false,
            error: VALIDATION_ERRORS.INCONSISTENT_DIMENSIONS,
            expectedDimensions,
            mismatchIds
        };
    }

    return {
        isValid: true,
        dimensions: expectedDimensions
    };
}

// ==========================================
// Aggregate Validation Report
// ==========================================

/**
 * Build a comprehensive validation report for a vector collection
 *
 * Business Rule: All vectors must pass all validation checks
 *
 * @param {Array<{id: string|number, vector: number[]}>} vectors - Vector collection
 * @param {number} [expectedDimensions] - Expected dimensions (optional, auto-detected if not provided)
 * @returns {{isValid: boolean, vectorCount: number, dimensions: number, totalElements: number, errors: Array<{type: string, itemId?: string}>}}
 */
export function buildVectorValidationReport(vectors, expectedDimensions) {
    const errors = [];

    if (!vectors || !Array.isArray(vectors)) {
        return {
            isValid: false,
            vectorCount: 0,
            dimensions: 0,
            totalElements: 0,
            errors: [{ type: VALIDATION_ERRORS.NOT_AN_ARRAY }]
        };
    }

    const vectorCount = vectors.length;
    let dimensions = expectedDimensions;
    let totalElements = 0;

    // First pass: check consistency and get dimensions
    const consistencyResult = validateVectorConsistency(vectors);
    if (!consistencyResult.isValid) {
        errors.push({
            type: consistencyResult.error,
            itemId: consistencyResult.itemId,
            mismatchIds: consistencyResult.mismatchIds
        });
    } else if (!dimensions) {
        dimensions = consistencyResult.dimensions;
    }

    // Second pass: validate each vector individually
    for (const item of vectors) {
        if (!item.vector) continue;

        totalElements += item.vector.length;

        // Validate dimensions
        const dimResult = validateVectorDimensions(item.vector, dimensions);
        if (!dimResult.isValid) {
            errors.push({
                type: dimResult.error,
                itemId: String(item.id),
                expected: dimResult.expected,
                actual: dimResult.actual
            });
        }

        // Validate elements
        const elemResult = validateVectorElements(item.vector);
        if (!elemResult.isValid) {
            errors.push({
                type: elemResult.error,
                itemId: String(item.id),
                invalidIndex: elemResult.invalidIndex
            });
        }
    }

    return {
        isValid: errors.length === 0,
        vectorCount,
        dimensions: dimensions || 0,
        totalElements,
        errors
    };
}

// ==========================================
// Export
// ==========================================

export default {
    VALIDATION_ERRORS,
    VECTOR_DIMENSIONS,
    validateVectorDimensions,
    validateVectorElements,
    validateVectorConsistency,
    buildVectorValidationReport
};
