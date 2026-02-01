/**
 * Write-Ahead Log Initialization
 *
 * Handles initialization and lifecycle management of the WAL system.
 * Sets up cross-tab coordination and automatic replay.
 *
 * @module storage/write-ahead-log/initialization
 */

import { TabCoordinator } from '../../services/tab-coordination.js';
import { walState } from './state.js';
import { CONFIG } from './config.js';
import { loadWal, loadOperationResults } from './persistence.js';
import { startMonitoring } from './monitoring.js';
import { replayWal } from './recovery.js';
import { scheduleProcessing } from './batch-processor.js';
import { stopProcessing } from './batch-processor.js';

/**
 * Initialize WAL system
 * @returns {Promise<void>}
 */
export async function init() {
    console.log('[WAL] Initializing Write-Ahead Log...');

    // Load existing WAL
    loadWal();

    // Load operation results for crash recovery
    loadOperationResults();

    // Start monitoring
    startMonitoring();

    // Schedule replay after a delay to avoid conflicts with other tabs
    setTimeout(async () => {
        await replayWal();
    }, CONFIG.REPLAY_DELAY_MS);

    // Listen for tab coordination changes
    if (TabCoordinator.onAuthorityChange) {
        TabCoordinator.onAuthorityChange(authority => {
            if (authority.canWrite) {
                // Became primary - start processing WAL
                console.log('[WAL] Became primary tab, starting WAL processing');
                scheduleProcessing();
            } else {
                // Became secondary - stop processing WAL
                console.log('[WAL] Became secondary tab, stopping WAL processing');
                stopProcessing();
            }
        });
    }

    console.log('[WAL] Write-Ahead Log initialized');
}
