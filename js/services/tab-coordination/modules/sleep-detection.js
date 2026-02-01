/**
 * Tab Coordinator - Sleep Detection Module
 *
 * Handles wake from sleep detection:
 * - Monitors document visibility changes
 * - Detects long sleep periods (>30 seconds)
 * - Triggers re-election on wakeup if secondary
 *
 * @module tab-coordination/modules/sleep-detection
 */

import { TAB_ID } from '../constants.js';
import { initiateReElection } from './election.js';
import { getIsPrimaryTab } from './authority.js';

// ==========================================
// Sleep Detection Constants
// ==========================================

const SLEEP_DETECTION_THRESHOLD_MS = 30000;

// ==========================================
// Sleep Detection Setup
// ==========================================

/**
 * Setup wake from sleep detection
 * Monitors visibility changes to detect when tab wakes from sleep
 * @returns {Function} Cleanup function to remove event listener
 */
export function setupWakeFromSleepDetection() {
    if (typeof window === 'undefined' || !window.addEventListener) {
        return null;
    }

    let lastVisibilityCheckTime = Date.now();

    const handler = () => {
        const now = Date.now();
        const delta = now - lastVisibilityCheckTime;
        lastVisibilityCheckTime = now;

        if (delta > SLEEP_DETECTION_THRESHOLD_MS) {
            // Tab woke from sleep
            if (!getIsPrimaryTab()) {
                // Secondary tab woke from sleep, initiate re-election
                initiateReElection().catch(error => {
                    console.error(
                        '[TabCoordination] Re-election error after sleep detection:',
                        error,
                        {
                            sleepDurationMs: delta,
                            isPrimaryTab: getIsPrimaryTab(),
                            tabId: TAB_ID,
                        }
                    );
                });
            }
        }
    };

    document.addEventListener('visibilitychange', handler);

    // Return cleanup function
    return () => {
        document.removeEventListener('visibilitychange', handler);
    };
}
