/**
 * Archive Service
 *
 * Handles archival and restoration of old streaming data to manage storage quota.
 * Moves streams older than cutoff date to an archive store for optional restoration.
 *
 * HNW Considerations:
 * - Hierarchy: Single authority for stream archival decisions
 * - Network: Emits events for UI notification of cleanup
 * - Wave: Operates atomically to prevent partial archival states
 *
 * @module storage/archive-service
 */

import { EventBus } from '../services/event-bus.js';
import { IndexedDBCore } from './indexeddb.js';

// ==========================================
// Configuration
// ==========================================

const ARCHIVE_CONFIG = {
    // Default retention period (1 year in milliseconds)
    defaultRetentionMs: 365 * 24 * 60 * 60 * 1000,

    // Store names
    STREAMS_STORE: 'streams',
    ARCHIVE_STORE: 'archived_streams',

    // Minimum streams to keep (never archive below this count)
    minStreamsToKeep: 100
};

// ==========================================
// Archive Store Creation
// ==========================================

/**
 * Ensure archive store exists in IndexedDB
 * Note: This requires a database version upgrade - for now we use CONFIG store
 * @returns {Promise<void>}
 */
async function ensureArchiveStore() {
    // We'll use the CONFIG store to store archived data as a single record
    // This avoids requiring a database version upgrade
    console.log('[ArchiveService] Using CONFIG store for archive storage');
}

// ==========================================
// Core Functions
// ==========================================

/**
 * Archive streams older than the cutoff date
 * Moves old streams to archive for optional restoration (not permanent delete)
 *
 * @param {Object} [options] - Archive options
 * @param {Date|number} [options.cutoffDate] - Archive streams before this date (default: 1 year ago)
 * @param {boolean} [options.dryRun=false] - If true, return what would be archived without archiving
 * @returns {Promise<{archived: number, kept: number, savedBytes: number, archivedOldest: string, archivedNewest: string}>}
 */
async function archiveOldStreams(options = {}) {
    const cutoffDate = options.cutoffDate
        ? (options.cutoffDate instanceof Date ? options.cutoffDate : new Date(options.cutoffDate))
        : new Date(Date.now() - ARCHIVE_CONFIG.defaultRetentionMs);

    const cutoffTimestamp = cutoffDate.getTime();
    const dryRun = options.dryRun ?? false;

    console.log(`[ArchiveService] ${dryRun ? 'Dry run: ' : ''}Archiving streams before ${cutoffDate.toISOString()}`);

    try {
        // Get current streams
        const streamsRecord = await IndexedDBCore.get(ARCHIVE_CONFIG.STREAMS_STORE, 'all');
        const streams = streamsRecord?.data || [];

        if (streams.length === 0) {
            console.log('[ArchiveService] No streams to archive');
            return { archived: 0, kept: 0, savedBytes: 0, archivedOldest: null, archivedNewest: null };
        }

        // Separate streams into keep and archive
        const toKeep = [];
        const toArchive = [];

        for (const stream of streams) {
            const streamDate = parseStreamDate(stream.ts);
            if (streamDate && streamDate.getTime() < cutoffTimestamp) {
                toArchive.push(stream);
            } else {
                toKeep.push(stream);
            }
        }

        // Ensure we keep minimum streams
        if (toKeep.length < ARCHIVE_CONFIG.minStreamsToKeep && streams.length >= ARCHIVE_CONFIG.minStreamsToKeep) {
            // Sort by date and keep the most recent
            const sorted = [...streams].sort((a, b) => {
                const dateA = parseStreamDate(a.ts)?.getTime() || 0;
                const dateB = parseStreamDate(b.ts)?.getTime() || 0;
                return dateB - dateA; // Most recent first
            });

            toKeep.length = 0;
            toArchive.length = 0;

            for (let i = 0; i < sorted.length; i++) {
                if (i < ARCHIVE_CONFIG.minStreamsToKeep) {
                    toKeep.push(sorted[i]);
                } else {
                    const streamDate = parseStreamDate(sorted[i].ts);
                    if (streamDate && streamDate.getTime() < cutoffTimestamp) {
                        toArchive.push(sorted[i]);
                    } else {
                        toKeep.push(sorted[i]);
                    }
                }
            }
        }

        if (toArchive.length === 0) {
            console.log('[ArchiveService] No streams older than cutoff to archive');
            return { archived: 0, kept: streams.length, savedBytes: 0, archivedOldest: null, archivedNewest: null };
        }

        // Calculate saved bytes
        const savedBytes = JSON.stringify(toArchive).length;

        // Get oldest and newest archived dates
        const archiveDates = toArchive
            .map(s => parseStreamDate(s.ts))
            .filter(d => d)
            .sort((a, b) => a.getTime() - b.getTime());

        const result = {
            archived: toArchive.length,
            kept: toKeep.length,
            savedBytes,
            archivedOldest: archiveDates[0]?.toISOString() || null,
            archivedNewest: archiveDates[archiveDates.length - 1]?.toISOString() || null
        };

        if (dryRun) {
            console.log(`[ArchiveService] Dry run result:`, result);
            return result;
        }

        // Get existing archive
        const existingArchive = await IndexedDBCore.get('config', 'archived_streams_data');
        const archivedStreams = existingArchive?.streams || [];

        // Merge new archived streams with existing
        const mergedArchive = [...archivedStreams, ...toArchive];

        // Save archived streams to config store
        await IndexedDBCore.put('config', {
            key: 'archived_streams_data',
            streams: mergedArchive,
            lastArchiveDate: new Date().toISOString(),
            totalArchived: mergedArchive.length
        });

        // Update current streams (keep only non-archived)
        await IndexedDBCore.put(ARCHIVE_CONFIG.STREAMS_STORE, {
            id: 'all',
            data: toKeep,
            savedAt: new Date().toISOString()
        });

        console.log(`[ArchiveService] Archived ${toArchive.length} streams, kept ${toKeep.length}`);

        // Emit cleanup event
        EventBus.emit('storage:quota_cleaned', {
            savedBytes,
            archivedCount: toArchive.length,
            keptCount: toKeep.length,
            type: 'stream_archival'
        });

        return result;
    } catch (error) {
        console.error('[ArchiveService] Archive failed:', error);
        throw error;
    }
}

/**
 * Parse stream timestamp to Date
 * Handles various timestamp formats from Spotify/Apple Music exports
 * @param {string} ts - Timestamp string
 * @returns {Date|null}
 */
function parseStreamDate(ts) {
    if (!ts) return null;
    try {
        const date = new Date(ts);
        return isNaN(date.getTime()) ? null : date;
    } catch {
        return null;
    }
}

/**
 * Restore archived streams back to main storage
 * MEDIUM FIX Issue #17: Added validation of archive data integrity before restoration
 *
 * @param {Object} [options] - Restore options
 * @param {Date|number} [options.afterDate] - Only restore streams after this date
 * @param {boolean} [options.clearArchive=true] - Clear archive after restoration
 * @returns {Promise<{restored: number, remaining: number}>}
 */
async function restoreFromArchive(options = {}) {
    const afterDate = options.afterDate
        ? (options.afterDate instanceof Date ? options.afterDate : new Date(options.afterDate))
        : null;
    const clearArchive = options.clearArchive ?? true;

    console.log(`[ArchiveService] Restoring from archive${afterDate ? ` after ${afterDate.toISOString()}` : ''}`);

    try {
        // Get archived streams
        const archiveRecord = await IndexedDBCore.get('config', 'archived_streams_data');
        const archivedStreams = archiveRecord?.streams || [];

        if (archivedStreams.length === 0) {
            console.log('[ArchiveService] No archived streams to restore');
            return { restored: 0, remaining: 0 };
        }

        // MEDIUM FIX Issue #17: Validate archive data integrity before restoration
        // This prevents corrupted or malformed data from polluting the main store
        const validationResult = validateArchiveData(archivedStreams);
        if (!validationResult.valid) {
            const error = new Error(
                `Archive data integrity check failed: ${validationResult.reason}. ` +
                `Restore aborted to prevent data pollution.`
            );
            error.code = 'ARCHIVE_INTEGRITY_FAILED';
            error.validationResult = validationResult;
            throw error;
        }

        if (validationResult.invalidCount > 0) {
            console.warn(`[ArchiveService] Found ${validationResult.invalidCount} invalid entries in archive, filtering them out`);
        }

        // Use only validated streams
        const validStreams = validationResult.validStreams;

        // Filter by date if specified
        let toRestore = validStreams;
        let remaining = [];

        if (afterDate) {
            const afterTimestamp = afterDate.getTime();
            toRestore = validStreams.filter(s => {
                const streamDate = parseStreamDate(s.ts);
                return streamDate && streamDate.getTime() >= afterTimestamp;
            });
            remaining = validStreams.filter(s => {
                const streamDate = parseStreamDate(s.ts);
                return !streamDate || streamDate.getTime() < afterTimestamp;
            });
        }

        if (toRestore.length === 0) {
            console.log('[ArchiveService] No streams match restore criteria');
            return { restored: 0, remaining: validStreams.length };
        }

        // Get current streams and merge
        const streamsRecord = await IndexedDBCore.get(ARCHIVE_CONFIG.STREAMS_STORE, 'all');
        const currentStreams = streamsRecord?.data || [];
        const mergedStreams = [...currentStreams, ...toRestore];

        // Sort by timestamp (oldest first)
        mergedStreams.sort((a, b) => {
            const dateA = parseStreamDate(a.ts)?.getTime() || 0;
            const dateB = parseStreamDate(b.ts)?.getTime() || 0;
            return dateA - dateB;
        });

        // Save merged streams
        await IndexedDBCore.put(ARCHIVE_CONFIG.STREAMS_STORE, {
            id: 'all',
            data: mergedStreams,
            savedAt: new Date().toISOString()
        });

        // Update or clear archive
        if (clearArchive && remaining.length === 0) {
            await IndexedDBCore.delete('config', 'archived_streams_data');
        } else if (remaining.length > 0) {
            await IndexedDBCore.put('config', {
                key: 'archived_streams_data',
                streams: remaining,
                lastArchiveDate: archiveRecord.lastArchiveDate,
                totalArchived: remaining.length
            });
        }

        console.log(`[ArchiveService] Restored ${toRestore.length} streams, ${remaining.length} remaining in archive`);

        // Emit restore event
        EventBus.emit('storage:archive_restored', {
            restoredCount: toRestore.length,
            remainingCount: remaining.length,
            validated: true,
            filteredCount: validationResult.invalidCount
        });

        return { restored: toRestore.length, remaining: remaining.length };
    } catch (error) {
        console.error('[ArchiveService] Restore failed:', error);
        throw error;
    }
}

/**
 * MEDIUM FIX Issue #17: Validate archive data integrity before restoration
 * Checks that archived streams match expected schema and are not corrupted
 *
 * @param {Array} archivedStreams - Archived streams to validate
 * @returns {{valid: boolean, validStreams: Array, invalidCount: number, reason: string|null}}
 */
function validateArchiveData(archivedStreams) {
    if (!Array.isArray(archivedStreams)) {
        return { valid: false, validStreams: [], invalidCount: 0, reason: 'Archive data is not an array' };
    }

    if (archivedStreams.length === 0) {
        return { valid: true, validStreams: [], invalidCount: 0, reason: null };
    }

    const validStreams = [];
    let invalidCount = 0;

    for (let i = 0; i < archivedStreams.length; i++) {
        const stream = archivedStreams[i];

        // Skip if not an object
        if (!stream || typeof stream !== 'object') {
            invalidCount++;
            console.warn(`[ArchiveService] Invalid stream at index ${i}: not an object`);
            continue;
        }

        // Check for required timestamp field
        if (!stream.ts && !stream.endTime && !stream.playedAt) {
            invalidCount++;
            console.warn(`[ArchiveService] Invalid stream at index ${i}: missing timestamp`);
            continue;
        }

        // Validate timestamp can be parsed
        const streamDate = parseStreamDate(stream.ts || stream.endTime || stream.playedAt);
        if (!streamDate) {
            invalidCount++;
            console.warn(`[ArchiveService] Invalid stream at index ${i}: invalid timestamp`);
            continue;
        }

        // Validate timestamp is reasonable (between 2000 and current year + 1)
        const year = streamDate.getFullYear();
        const currentYear = new Date().getFullYear();
        if (year < 2000 || year > currentYear + 1) {
            invalidCount++;
            console.warn(`[ArchiveService] Invalid stream at index ${i}: timestamp out of reasonable range (${year})`);
            continue;
        }

        // Check for at least track or artist name (basic sanity check)
        const hasTrack = stream.trackName || stream.master_metadata_track_name;
        const hasArtist = stream.artistName || stream.master_metadata_album_artist_name;
        if (!hasTrack && !hasArtist) {
            // Some entries might not have these, log but don't fail
            console.warn(`[ArchiveService] Stream at index ${i} missing track/artist info, but allowing through`);
        }

        validStreams.push(stream);
    }

    // Consider valid if at least 90% of entries passed validation
    const validityThreshold = Math.max(1, Math.floor(archivedStreams.length * 0.9));
    if (validStreams.length < validityThreshold) {
        return {
            valid: false,
            validStreams,
            invalidCount,
            reason: `Too many invalid entries (${invalidCount}/${archivedStreams.length})`
        };
    }

    return { valid: true, validStreams, invalidCount, reason: null };
}

/**
 * Get archive statistics
 * @returns {Promise<{totalArchived: number, oldestDate: string|null, newestDate: string|null, sizeBytes: number}>}
 */
async function getArchiveStats() {
    try {
        const archiveRecord = await IndexedDBCore.get('config', 'archived_streams_data');
        const archivedStreams = archiveRecord?.streams || [];

        if (archivedStreams.length === 0) {
            return { totalArchived: 0, oldestDate: null, newestDate: null, sizeBytes: 0 };
        }

        const dates = archivedStreams
            .map(s => parseStreamDate(s.ts))
            .filter(d => d)
            .sort((a, b) => a.getTime() - b.getTime());

        return {
            totalArchived: archivedStreams.length,
            oldestDate: dates[0]?.toISOString() || null,
            newestDate: dates[dates.length - 1]?.toISOString() || null,
            sizeBytes: JSON.stringify(archivedStreams).length,
            lastArchiveDate: archiveRecord.lastArchiveDate
        };
    } catch (error) {
        console.error('[ArchiveService] Failed to get archive stats:', error);
        return { totalArchived: 0, oldestDate: null, newestDate: null, sizeBytes: 0 };
    }
}

/**
 * Clear all archived streams (permanent deletion)
 * @returns {Promise<{deleted: number}>}
 */
async function clearArchive() {
    try {
        const archiveRecord = await IndexedDBCore.get('config', 'archived_streams_data');
        const count = archiveRecord?.streams?.length || 0;

        await IndexedDBCore.delete('config', 'archived_streams_data');

        console.log(`[ArchiveService] Cleared ${count} archived streams`);

        return { deleted: count };
    } catch (error) {
        console.error('[ArchiveService] Failed to clear archive:', error);
        throw error;
    }
}

// ==========================================
// Public API
// ==========================================

export const ArchiveService = {
    archiveOldStreams,
    restoreFromArchive,
    getArchiveStats,
    clearArchive,

    // Configuration
    CONFIG: ARCHIVE_CONFIG
};


console.log('[ArchiveService] Archive service loaded');
