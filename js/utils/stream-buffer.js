/**
 * Stream Buffer Utility
 *
 * Manages SSE (Server-Sent Events) stream buffering with sequence validation.
 * Handles out-of-order chunks and prevents memory leaks from unbounded buffer growth.
 * Extracted from ChatUIController to improve code organization and testability.
 *
 * @module utils/stream-buffer
 */

// ==========================================
// Constants
// ==========================================

/** Maximum buffer size to prevent unbounded memory growth */
const MAX_SEQUENCE_BUFFER_SIZE = 100;

/** Maximum sequence gap to prevent malicious/buggy servers from causing memory issues */
const MAX_SEQUENCE_GAP = 1000;

// ==========================================
// StreamBuffer Class
// ==========================================

/**
 * StreamBuffer class for managing SSE sequence validation
 *
 * This class implements the HNW (Holes No Waiting) wave pattern for handling
 * out-of-order chunks in server-sent events. It provides several critical protections:
 *
 * 1. **Memory Leak Prevention**: Enforces maximum buffer size and sequence gap limits
 * 2. **Duplicate Detection**: Rejects stale or duplicate sequence numbers
 * 3. **Gap Handling**: Buffers out-of-order chunks and processes them in sequence
 * 4. **Edge Case Protection**: Handles malicious servers sending extremely high sequence numbers
 *
 * @class StreamBuffer
 *
 * @example
 *   const buffer = new StreamBuffer();
 *   buffer.process(0, 'first');
 *   buffer.process(2, 'third');  // Buffered
 *   buffer.process(1, 'second'); // Triggers processing of 1, then 2
 */
export class StreamBuffer {
    #sequenceBuffer = new Map();
    #nextExpectedSeq = 0;
    #gapDetected = false;

    /**
     * Process a chunk with sequence validation
     * Buffers out-of-order chunks and processes in-order chunks immediately
     *
     * @param {number} seq - Sequence number of the chunk
     * @param {string} data - Chunk data to process
     * @param {function(string)} handler - Function to call with in-order data
     * @returns {boolean} True if processed immediately, false if buffered
     *
     * @example
     *   const processed = buffer.process(5, 'hello', (data) => {
     *     console.log('Processing:', data);
     *   });
     */
    process(seq, data, handler) {
        // Edge case: Reject sequence numbers that are unreasonably far ahead (MEMORY LEAK FIX)
        // This prevents malicious or buggy servers from sending extremely high sequence numbers
        // that would bypass the buffer size check while still causing memory issues
        if (seq > this.#nextExpectedSeq + MAX_SEQUENCE_GAP) {
            console.warn(`[StreamBuffer] Rejecting sequence ${seq} - too far ahead of expected ${this.#nextExpectedSeq} (gap: ${seq - this.#nextExpectedSeq})`);
            return false;
        }

        // Edge case: Reject duplicate or old sequence numbers
        if (seq < this.#nextExpectedSeq) {
            console.warn(`[StreamBuffer] Rejecting stale sequence ${seq} - already processed (expecting ${this.#nextExpectedSeq})`);
            return false;
        }

        // Edge case: Prevent unbounded buffer growth - but be careful not to drop expected data
        if (this.#sequenceBuffer.size >= MAX_SEQUENCE_BUFFER_SIZE) {
            // EFFICIENCY: Iterate to find oldest key instead of spreading (O(n) vs O(n) + memory)
            let oldestSeq = null;
            for (const key of this.#sequenceBuffer.keys()) {
                if (oldestSeq === null || key < oldestSeq) {
                    oldestSeq = key;
                }
            }
            // oldestSeq will always be non-null here since size > 0
            // CRITICAL: Before dropping, check if we're about to drop expected data
            if (oldestSeq === this.#nextExpectedSeq) {
                // We're about to drop the sequence we're waiting for - process all possible first
                // Use while-loop to handle consecutive sequences correctly
                while (this.#sequenceBuffer.has(this.#nextExpectedSeq)) {
                    handler(this.#sequenceBuffer.get(this.#nextExpectedSeq));
                    this.#sequenceBuffer.delete(this.#nextExpectedSeq);
                    this.#nextExpectedSeq++;
                }
                // Now check if we still need to drop
                if (this.#sequenceBuffer.size >= MAX_SEQUENCE_BUFFER_SIZE) {
                    // EFFICIENCY: Iterate to find oldest key instead of spreading
                    let newOldest = null;
                    for (const key of this.#sequenceBuffer.keys()) {
                        if (newOldest === null || key < newOldest) {
                            newOldest = key;
                        }
                    }
                    this.#sequenceBuffer.delete(newOldest);
                    console.warn(`[StreamBuffer] Sequence buffer full (${MAX_SEQUENCE_BUFFER_SIZE}), dropped seq ${newOldest}`);
                }
            } else {
                this.#sequenceBuffer.delete(oldestSeq);
                console.warn(`[StreamBuffer] Sequence buffer full (${MAX_SEQUENCE_BUFFER_SIZE}), dropped seq ${oldestSeq}`);
            }
        }

        // Add to buffer
        this.#sequenceBuffer.set(seq, data);

        // Process any buffered chunks that are now in-order
        let processed = false;
        while (this.#sequenceBuffer.has(this.#nextExpectedSeq)) {
            handler(this.#sequenceBuffer.get(this.#nextExpectedSeq));
            this.#sequenceBuffer.delete(this.#nextExpectedSeq);
            this.#nextExpectedSeq++;
            processed = true;
        }

        // Detect gaps (for debugging)
        if (!processed && this.#sequenceBuffer.size > 5) {
            if (!this.#gapDetected) {
                this.#gapDetected = true;
                console.warn(`[StreamBuffer] SSE sequence gap detected: expecting ${this.#nextExpectedSeq}, got ${seq}, buffered ${this.#sequenceBuffer.size}`);
            }
        }

        return processed;
    }

    /**
     * Reset the sequence buffer (call at stream start)
     *
     * @example
     *   buffer.reset(); // Prepare for new stream
     */
    reset() {
        this.#sequenceBuffer.clear();
        this.#nextExpectedSeq = 0;
        this.#gapDetected = false;
    }

    /**
     * Get buffered chunks that haven't been processed
     *
     * @returns {{ pending: number, nextExpected: number, gaps: number[] }} Status object
     *
     * @example
     *   const status = buffer.getStatus();
     *   console.log(`Pending: ${status.pending}, Next: ${status.nextExpected}`);
     */
    getStatus() {
        const bufferedSeqs = Array.from(this.#sequenceBuffer.keys()).sort((a, b) => a - b);
        const gaps = [];

        for (let i = this.#nextExpectedSeq; i < Math.max(...bufferedSeqs, this.#nextExpectedSeq); i++) {
            if (!this.#sequenceBuffer.has(i)) {
                gaps.push(i);
            }
        }

        return {
            pending: this.#sequenceBuffer.size,
            nextExpected: this.#nextExpectedSeq,
            gaps
        };
    }
}

// ==========================================
// Convenience Functions (for backward compatibility)
// ==========================================

/**
 * Create a new StreamBuffer instance
 * This function provides a convenient factory method for creating StreamBuffer instances
 *
 * @returns {StreamBuffer} A new StreamBuffer instance
 *
 * @example
 *   const buffer = createStreamBuffer();
 *   buffer.process(0, 'data', console.log);
 */
export function createStreamBuffer() {
    return new StreamBuffer();
}

// Export a default for convenience
export default {
    StreamBuffer,
    createStreamBuffer
};

console.log('[StreamBuffer] Stream buffer utility loaded');
