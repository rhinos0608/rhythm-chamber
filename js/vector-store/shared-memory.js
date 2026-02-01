/**
 * Shared Memory Operations
 *
 * SharedArrayBuffer support for zero-copy vector transfer to workers
 *
 * @module vector-store/shared-memory
 */

import { SHARED_MEMORY_AVAILABLE } from './config.js';

/**
 * Check if SharedArrayBuffer is available (exported for stats/debugging)
 * @returns {boolean} True if SharedArrayBuffer can be used
 */
export function isSharedArrayBufferAvailable() {
    return SHARED_MEMORY_AVAILABLE;
}

/**
 * Build shared vector data for zero-copy worker transfer
 * Prepares vectors in SharedArrayBuffer format for efficient worker transfer
 *
 * @param {Map} vectorsMap - Map of vectors to prepare
 * @returns {{sharedVectors: SharedArrayBuffer, payloads: Array, dimensions: number}|null}
 */
export function buildSharedVectorData(vectorsMap) {
    if (!SHARED_MEMORY_AVAILABLE || !vectorsMap || vectorsMap.size === 0) {
        return null;
    }

    const vectorArray = Array.from(vectorsMap.values());
    if (vectorArray.length === 0) {
        return null;
    }

    // Defensive validation: verify all vectors have consistent dimensionality
    let expectedDimensions = null;

    for (let i = 0; i < vectorArray.length; i++) {
        const item = vectorArray[i];

        // Check if vector exists and is an array
        if (!item.vector || !Array.isArray(item.vector)) {
            console.warn(`[VectorStore] Invalid vector at index ${i}: missing or not an array`);
            return null;
        }

        // Check vector dimensions
        const currentDimensions = item.vector.length;
        if (currentDimensions === 0) {
            console.warn(`[VectorStore] Empty vector at index ${i}`);
            return null;
        }

        // Validate consistent dimensions across all vectors
        if (expectedDimensions === null) {
            expectedDimensions = currentDimensions;
        } else if (currentDimensions !== expectedDimensions) {
            // Log a more prominent warning for dimension mismatch
            console.warn(
                `[VectorStore] DIMENSION MISMATCH DETECTED at index ${i}: expected ${expectedDimensions}, got ${currentDimensions}. Vector ID: ${item.id}`
            );
            console.warn(
                '[VectorStore] Falling back to slower search path. Consider cleaning up mismatched vectors.'
            );
            return null;
        }

        // Validate all elements are numbers
        for (let j = 0; j < currentDimensions; j++) {
            if (typeof item.vector[j] !== 'number' || isNaN(item.vector[j])) {
                console.warn(`[VectorStore] Non-numeric value at vector ${i}, index ${j}`);
                return null;
            }
        }
    }

    const dimensions = expectedDimensions;
    const totalFloats = vectorArray.length * dimensions;

    try {
        const sharedBuffer = new SharedArrayBuffer(totalFloats * 4); // Float32 = 4 bytes
        const sharedView = new Float32Array(sharedBuffer);

        // Copy vectors into shared buffer (one-time cost)
        for (let i = 0; i < vectorArray.length; i++) {
            sharedView.set(vectorArray[i].vector, i * dimensions);
        }

        // Payloads still use structured clone (small relative to vectors)
        const payloads = vectorArray.map(v => ({ id: v.id, payload: v.payload }));

        return { sharedVectors: sharedBuffer, payloads, dimensions };
    } catch (e) {
        console.warn('[VectorStore] SharedArrayBuffer build failed:', e.message);
        return null;
    }
}
