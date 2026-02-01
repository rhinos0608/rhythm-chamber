/**
 * Data Version Service
 *
 * Generates version hashes based on current data state.
 * Messages store this version; regeneration compares to detect staleness.
 *
 * HNW Considerations:
 * - Hierarchy: Single source of data version truth
 * - Network: Enables stale data detection across components
 * - Wave: Tracks data changes over time
 *
 * @module services/data-version
 */

'use strict';

import { getVersionSource } from '../contracts/version-source.js';
import { AppState } from '../state/app-state.js';

// ==========================================
// Version Generation
// ==========================================

/**
 * Generate version info from current data state
 * @returns {{ streamCount: number, lastStreamDate: string|null, generatedAt: string, hash: string } | null}
 */
function generate() {
    // Get current data from AppState or VersionSource contract
    let data = null;

    // Try VersionSource contract first (implemented by DemoController)
    const versionSource = getVersionSource();
    if (versionSource && versionSource.getActiveData) {
        const activeData = versionSource.getActiveData();
        // Guard against falsy returns
        const safeActive = activeData || {};
        data = {
            streams: Array.isArray(safeActive.streams) ? safeActive.streams : [],
            patterns: safeActive.patterns || {},
            personality: safeActive.personality || {},
            isDemoMode: !!safeActive.isDemoMode,
        };
    } else if (AppState.get) {
        const state = AppState.get();
        const safeState = state || {};
        const isDemo = safeState.demo?.isDemoMode || false;

        if (isDemo) {
            data = {
                streams: Array.isArray(safeState.demo?.streams) ? safeState.demo.streams : [],
                patterns: safeState.demo?.patterns || {},
                personality: safeState.demo?.personality || {},
                isDemoMode: true,
            };
        } else {
            data = {
                streams: Array.isArray(safeState.data?.streams) ? safeState.data.streams : [],
                patterns: safeState.data?.patterns || {},
                personality: safeState.data?.personality || {},
                isDemoMode: false,
            };
        }
    }

    if (!data?.streams || !Array.isArray(data.streams) || data.streams.length === 0) {
        return null;
    }

    const streamCount = data.streams.length;
    const lastStream = data.streams[data.streams.length - 1];
    const lastStreamDate = lastStream?.endTime || lastStream?.ts || null;
    const personalityType = data.personality?.type || data.personality?.name || 'unknown';

    return {
        streamCount,
        lastStreamDate,
        personalityType,
        isDemoMode: data.isDemoMode || false,
        generatedAt: new Date().toISOString(),
        hash: computeHash(streamCount, lastStreamDate, personalityType, data.isDemoMode),
    };
}

/**
 * Compute a simple hash from data components
 * @param {number} streamCount
 * @param {string|null} lastStreamDate
 * @param {string} personalityType
 * @param {boolean} isDemoMode
 * @returns {string}
 */
function computeHash(streamCount, lastStreamDate, personalityType, isDemoMode) {
    // Simple deterministic hash
    const components = [
        String(streamCount),
        lastStreamDate || 'none',
        personalityType,
        isDemoMode ? 'demo' : 'real',
    ];

    // Simple string hash (not cryptographic, just for comparison)
    const str = components.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

// ==========================================
// Staleness Detection
// ==========================================

/**
 * Check if a message's data version is stale compared to current data
 * @param {{ hash: string, streamCount?: number, isDemoMode?: boolean }|null} messageVersion
 * @returns {{ isStale: boolean, reason?: string }}
 */
function isStale(messageVersion) {
    // No version = legacy message, assume not stale
    if (!messageVersion) {
        return { isStale: false, reason: 'no_version' };
    }

    const current = generate();

    // No current data = can't compare
    if (!current) {
        return { isStale: false, reason: 'no_current_data' };
    }

    // Hash mismatch = stale
    if (current.hash !== messageVersion.hash) {
        // Determine reason for staleness
        let reason = 'data_changed';

        if (messageVersion.isDemoMode !== current.isDemoMode) {
            reason = messageVersion.isDemoMode ? 'switched_from_demo' : 'switched_to_demo';
        } else if (messageVersion.streamCount !== current.streamCount) {
            reason = 'stream_count_changed';
        }

        return { isStale: true, reason };
    }

    return { isStale: false };
}

/**
 * Get a human-readable staleness message
 * @param {{ isStale: boolean, reason?: string }} result
 * @returns {string|null}
 */
function getStaleMessage(result) {
    if (!result.isStale) return null;

    switch (result.reason) {
        case 'switched_from_demo':
            return 'This response was generated with demo data, but you now have real data loaded.';
        case 'switched_to_demo':
            return 'This response was generated with your real data, but demo mode is now active.';
        case 'stream_count_changed':
            return 'New listening data has been uploaded since this response was generated.';
        default:
            return 'Your data has changed since this response was generated.';
    }
}

// ==========================================
// Message Integration
// ==========================================

/**
 * Add version to a message object
 * @param {Object} message - Message to tag
 * @returns {Object} Message with dataVersion added
 */
function tagMessage(message) {
    const version = generate();
    if (version) {
        message.dataVersion = version;
    }
    return message;
}

/**
 * Check if regenerating a message would use different data
 * @param {Object} message - Message to check
 * @returns {{ shouldWarn: boolean, message?: string }}
 */
function checkRegenerationContext(message) {
    const staleResult = isStale(message.dataVersion);

    if (staleResult.isStale) {
        return {
            shouldWarn: true,
            message: getStaleMessage(staleResult),
        };
    }

    return { shouldWarn: false };
}

// ==========================================
// Public API
// ==========================================

export const DataVersion = {
    // Core
    generate,
    isStale,

    // Helpers
    getStaleMessage,
    tagMessage,
    checkRegenerationContext,
};

console.log('[DataVersion] Module loaded');
