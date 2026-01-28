/**
 * Conflict Detection (VectorClock)
 *
 * Provides write conflict detection using VectorClock timestamps.
 * Enables true concurrent conflict detection vs Lamport's total ordering.
 *
 * @module storage/indexeddb/conflict
 */

import { VectorClock } from '../../services/vector-clock.js';

/**
 * Detect write conflicts between two records using VectorClock timestamps
 * VectorClock provides true concurrent conflict detection vs Lamport's total ordering
 *
 * @param {Object} existing - Existing record with _writeEpoch
 * @param {Object} incoming - Incoming record with _writeEpoch
 * @returns {{ hasConflict: boolean, winner: 'existing' | 'incoming', reason: string, isConcurrent: boolean }}
 */
export function detectWriteConflict(existing, incoming) {
    // No existing record - no conflict
    if (!existing) {
        return { hasConflict: false, winner: 'incoming', reason: 'new_record', isConcurrent: false };
    }

    // Neither has epoch - legacy data, treat as no conflict
    if (!existing._writeEpoch && !incoming._writeEpoch) {
        return { hasConflict: false, winner: 'incoming', reason: 'legacy_data', isConcurrent: false };
    }

    // Only one has epoch - prefer the one with epoch
    if (!existing._writeEpoch) {
        return { hasConflict: false, winner: 'incoming', reason: 'existing_legacy', isConcurrent: false };
    }
    if (!incoming._writeEpoch) {
        return { hasConflict: true, winner: 'existing', reason: 'incoming_legacy', isConcurrent: false };
    }

    // Both have epochs - use VectorClock comparison
    // Create temporary VectorClock to compare states
    const existingClock = VectorClock.fromState(existing._writeEpoch, existing._writerId);
    const comparison = existingClock.compare(incoming._writeEpoch);

    switch (comparison) {
        case 'equal':
            return { hasConflict: false, winner: 'incoming', reason: 'same_epoch', isConcurrent: false };

        case 'before':
            // Existing happened before incoming - incoming is newer
            return { hasConflict: false, winner: 'incoming', reason: 'incoming_newer', isConcurrent: false };

        case 'after':
            // Existing happened after incoming - existing is newer
            return { hasConflict: true, winner: 'existing', reason: 'existing_newer', isConcurrent: false };

        case 'concurrent':
            // True concurrent update detected - needs conflict resolution
            // Use writerId as tiebreaker (consistent ordering)
            const winnerByTiebreaker = (existing._writerId || '') < (incoming._writerId || '')
                ? 'existing'
                : 'incoming';
            return {
                hasConflict: true,
                winner: winnerByTiebreaker,
                reason: 'concurrent_update',
                isConcurrent: true
            };

        default:
            // Fallback to incoming for unknown comparison result
            return { hasConflict: false, winner: 'incoming', reason: 'unknown_comparison', isConcurrent: false };
    }
}
