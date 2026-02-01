/**
 * Write-Ahead Log Crash Recovery
 *
 * Handles crash recovery and WAL replay on startup.
 * Ensures data consistency after browser crashes or reloads.
 *
 * @module storage/write-ahead-log/recovery
 */

import { TabCoordinator } from '../../services/tab-coordination.js';
import { EventBus } from '../../services/event-bus.js';
import { walState } from './state.js';
import { CONFIG, WalStatus } from './config.js';
import { loadWal } from './persistence.js';
import { processWal } from './batch-processor.js';

/**
 * Replay WAL on startup
 * Called when app initializes to recover from crashes
 */
export async function replayWal() {
    // Only primary tab should replay WAL
    if (TabCoordinator.isPrimary && !TabCoordinator.isPrimary()) {
        console.log('[WAL] Skipping WAL replay - not primary tab');
        return;
    }

    // Don't replay if recently replayed
    const timeSinceLastReplay = Date.now() - walState.lastReplayTime;
    if (timeSinceLastReplay < CONFIG.REPLAY_DELAY_MS) {
        console.log('[WAL] Skipping WAL replay - too soon since last replay');
        return;
    }

    if (walState.isReplaying) {
        console.log('[WAL] Already replaying WAL');
        return;
    }

    walState.isReplaying = true;
    walState.lastReplayTime = Date.now();

    let entriesReplayedCount = 0;

    try {
        console.log('[WAL] Starting crash recovery replay...');

        // Load WAL from storage
        loadWal();

        // Check if there are entries to replay
        const pendingEntries = walState.entries.filter(
            entry =>
                entry.status === WalStatus.PENDING ||
                entry.status === WalStatus.FAILED ||
                (entry.status === WalStatus.PROCESSING && Date.now() - entry.processedAt > 60000) // Assume crashed if processing for > 1 min
        );

        if (pendingEntries.length === 0) {
            console.log('[WAL] No entries to replay');
            return;
        }

        console.log(`[WAL] Replaying ${pendingEntries.length} entries`);
        entriesReplayedCount = pendingEntries.length;

        // Reset PROCESSING entries to PENDING
        walState.entries.forEach(entry => {
            if (entry.status === WalStatus.PROCESSING) {
                entry.status = WalStatus.PENDING;
                entry.error = 'Reset after crash';
            }
        });

        // Process WAL
        await processWal();

        console.log('[WAL] Crash recovery replay complete');
    } catch (error) {
        console.error('[WAL] Error replaying WAL:', error);
    } finally {
        walState.isReplaying = false;

        // Emit event for any blocked writes waiting on replay
        EventBus.emit('wal:replay_complete', {
            timestamp: Date.now(),
            entriesReplayed: entriesReplayedCount,
        });
    }
}
