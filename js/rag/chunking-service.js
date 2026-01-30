/**
 * RAG Chunking Service
 *
 * Handles document splitting and chunk management for semantic search.
 * Extracted from RAG god object for focused responsibility.
 *
 * RESPONSIBILITIES:
 * - Document splitting/chunking from streaming data
 * - Chunk size management with adaptive batching
 * - Monthly summary chunks
 * - Artist profile chunks
 * - Pattern-based chunks
 * - Text preprocessing for chunking
 * - Chunk metadata generation
 *
 * @module rag/chunking-service
 */

import { Patterns } from '../patterns.js';

/**
 * Chunking configuration constants
 */
const CHUNKING_CONFIG = {
    INITIAL_BATCH_SIZE: 1000,
    TARGET_PROCESSING_TIME_MS: 16, // Target 60fps (16ms budget)
    MIN_BATCH_SIZE: 100,
    MAX_BATCH_SIZE: 5000,
    TOP_ARTISTS_COUNT: 50,
    TOP_ITEMS_PER_CHUNK: 10
};

/**
 * RAG Chunking Service
 *
 * Provides focused API for creating searchable chunks from streaming data.
 * Handles both main thread and worker-based chunking orchestration.
 */
export class RAGChunkingService {
    /**
     * Split streaming data into searchable chunks
     *
     * PERFORMANCE: This is an async function that yields to the event loop
     * between batches to prevent UI freezing when processing large histories
     * (100k+ streams).
     *
     * @param {Array} streams - Streaming history data
     * @param {Function} onProgress - Optional progress callback (current, total, message)
     * @returns {Promise<Array<Chunk>>} Array of chunks with metadata
     */
    async splitDocument(streams, onProgress = () => { }) {
        const chunks = [];

        // Phase 1: Group streams by month (with time-budget-aware yielding)
        const byMonth = {};
        await this._processWithBudget(
            streams,
            (stream) => {
                const date = new Date(stream.ts || stream.endTime);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!byMonth[monthKey]) byMonth[monthKey] = [];
                byMonth[monthKey].push(stream);
            },
            'Grouping by month...',
            30,
            0,
            onProgress
        );

        // Phase 2: Create monthly summary chunks
        const monthEntries = Object.entries(byMonth);
        for (let i = 0; i < monthEntries.length; i++) {
            const [month, monthStreams] = monthEntries[i];
            const chunk = this._createMonthlySummaryChunk(month, monthStreams);
            chunks.push(chunk);

            // Yield every 10 months
            if (i % 10 === 0 && i > 0) {
                onProgress(30 + Math.round((i / monthEntries.length) * 20), 100, 'Creating monthly summaries...');
                await new Promise(resolve => queueMicrotask(resolve));
            }
        }

        // Phase 3: Group streams by artist (with time-budget-aware yielding)
        const byArtist = {};
        await this._processWithBudget(
            streams,
            (stream) => {
                const artist = stream.master_metadata_album_artist_name || stream.artistName || 'Unknown';
                if (!byArtist[artist]) byArtist[artist] = [];
                byArtist[artist].push(stream);
            },
            'Grouping by artist...',
            20,
            50,
            onProgress
        );

        // Phase 4: Top 50 artists get individual chunks
        const topArtistEntries = Object.entries(byArtist)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, CHUNKING_CONFIG.TOP_ARTISTS_COUNT);

        for (let i = 0; i < topArtistEntries.length; i++) {
            const [artist, artistStreams] = topArtistEntries[i];
            const chunk = this._createArtistProfileChunk(artist, artistStreams);
            chunks.push(chunk);

            // Yield every 10 artists
            if (i % 10 === 0 && i > 0) {
                onProgress(70 + Math.round((i / topArtistEntries.length) * 25), 100, 'Creating artist profiles...');
                await new Promise(resolve => queueMicrotask(resolve));
            }
        }

        // Phase 5: Create pattern chunks for semantic search
        onProgress(95, 100, 'Creating pattern embeddings...');
        try {
            const patternChunks = await this.createPatternChunks(streams);
            chunks.push(...patternChunks);
            console.log(`[RAG Chunking] Added ${patternChunks.length} pattern chunks`);
        } catch (patternError) {
            console.warn('[RAG Chunking] Pattern chunk creation failed, continuing without:', patternError.message);
        }

        onProgress(100, 100, 'Chunks created');
        return chunks;
    }

    /**
     * Create searchable chunks from detected patterns
     * Phase 5: RAG-Pattern Integration - enables semantic search over listening patterns
     *
     * Note: Pattern detection yields to event loop to prevent UI blocking for large
     * streaming histories.
     *
     * @param {Array} streams - Streaming history data
     * @returns {Promise<Array<Chunk>>} Pattern chunks for embedding
     */
    async createPatternChunks(streams) {
        const chunks = [];

        // Yield to event loop before heavy pattern detection
        await new Promise(resolve => queueMicrotask(resolve));

        // Run pattern detection with proper error handling
        let patterns;
        try {
            patterns = Patterns.detectAllPatterns(streams, []);
        } catch (e) {
            console.warn('[RAG Chunking] Pattern detection failed:', e.message);
            patterns = {}; // Return empty patterns on failure
        }

        // Comfort/Discovery Pattern
        if (patterns.comfortDiscovery?.description) {
            chunks.push({
                type: 'pattern_result',
                text: `Listening Pattern: Comfort vs Discovery. ${patterns.comfortDiscovery.description}. ` +
                    `Comfort ratio: ${(patterns.comfortDiscovery.comfortRatio * 100).toFixed(1)}%. ` +
                    `Discovery ratio: ${(patterns.comfortDiscovery.discoveryRatio * 100).toFixed(1)}%.`,
                metadata: {
                    patternType: 'comfort_discovery',
                    comfortRatio: patterns.comfortDiscovery.comfortRatio,
                    discoveryRatio: patterns.comfortDiscovery.discoveryRatio
                }
            });
        }

        // Ghosted Artists Pattern
        if (patterns.ghostedArtists?.ghosted?.length > 0) {
            const topGhosted = patterns.ghostedArtists.ghosted.slice(0, 10)
                .map(a => `${a.artist} (${a.plays} plays, gone since ${a.lastPlayed?.getFullYear() || 'unknown'})`)
                .join(', ');
            chunks.push({
                type: 'pattern_result',
                text: `Listening Pattern: Ghosted Artists. ${patterns.ghostedArtists.description}. ` +
                    `Artists you used to play frequently but stopped: ${topGhosted}.`,
                metadata: {
                    patternType: 'ghosted_artists',
                    count: patterns.ghostedArtists.ghosted.length,
                    artists: patterns.ghostedArtists.ghosted.slice(0, 10).map(a => a.artist)
                }
            });
        }

        // Era Detection Pattern
        if (patterns.eras?.hasEras && patterns.eras?.periods?.length > 0) {
            const erasText = patterns.eras.periods.slice(0, 5)
                .map(e => `${e.genre || 'Mixed'} era (${e.startMonth} to ${e.endMonth})`)
                .join(', ');
            chunks.push({
                type: 'pattern_result',
                text: `Listening Pattern: Musical Eras. ${patterns.eras.description}. ` +
                    `Distinct listening eras detected: ${erasText}.`,
                metadata: {
                    patternType: 'eras',
                    eraCount: patterns.eras.periods.length,
                    periods: patterns.eras.periods.slice(0, 5)
                }
            });
        }

        // Time Patterns (Mood Engineer)
        if (patterns.timePatterns?.isMoodEngineer) {
            chunks.push({
                type: 'pattern_result',
                text: `Listening Pattern: Time-Based Habits. ${patterns.timePatterns.description}. ` +
                    `You are a Mood Engineer who strategically chooses music based on time of day.`,
                metadata: {
                    patternType: 'time_patterns',
                    isMoodEngineer: true,
                    hourBreakdown: patterns.timePatterns.hourBreakdown || {}
                }
            });
        }

        // Social Patterns
        if (patterns.socialPatterns?.isSocialChameleon) {
            chunks.push({
                type: 'pattern_result',
                text: `Listening Pattern: Social Listening. ${patterns.socialPatterns.description}. ` +
                    `Your listening habits adapt based on social context.`,
                metadata: {
                    patternType: 'social_patterns',
                    isSocialChameleon: true
                }
            });
        }

        // Discovery Explosions
        if (patterns.discoveryExplosions?.explosions?.length > 0) {
            const explosionsText = patterns.discoveryExplosions.explosions.slice(0, 5)
                .map(e => `${e.month} (${e.newArtistCount} new artists)`)
                .join(', ');
            chunks.push({
                type: 'pattern_result',
                text: `Listening Pattern: Discovery Explosions. ${patterns.discoveryExplosions.description}. ` +
                    `Months with unusual spikes in new artist discovery: ${explosionsText}.`,
                metadata: {
                    patternType: 'discovery_explosions',
                    count: patterns.discoveryExplosions.explosions.length,
                    months: patterns.discoveryExplosions.explosions.slice(0, 5).map(e => e.month)
                }
            });
        }

        // True Favorites
        if (patterns.trueFavorites?.favorites?.length > 0) {
            const favText = patterns.trueFavorites.favorites.slice(0, 10)
                .map(f => `${f.artist} (${f.plays} plays over ${f.months} months)`)
                .join(', ');
            chunks.push({
                type: 'pattern_result',
                text: `Listening Pattern: True Favorites. ${patterns.trueFavorites.description}. ` +
                    `Artists you consistently return to month after month: ${favText}.`,
                metadata: {
                    patternType: 'true_favorites',
                    count: patterns.trueFavorites.favorites.length,
                    artists: patterns.trueFavorites.favorites.slice(0, 10).map(f => f.artist)
                }
            });
        }

        // Mood Searching Pattern
        if (patterns.moodSearching?.description) {
            chunks.push({
                type: 'pattern_result',
                text: `Listening Pattern: Mood Searching. ${patterns.moodSearching.description}. ` +
                    `You sometimes search for music to match or alter your mood.`,
                metadata: {
                    patternType: 'mood_searching',
                    isActive: patterns.moodSearching.isActive || false
                }
            });
        }

        // Overall summary as a searchable chunk
        if (patterns.summary) {
            chunks.push({
                type: 'pattern_summary',
                text: `Overall Listening Patterns Summary: ${patterns.summary}`,
                metadata: {
                    patternType: 'summary',
                    evidenceCount: patterns.evidence?.length || 0
                }
            });
        }

        return chunks;
    }

    /**
     * Get month name from year and month numbers
     * @param {number} year - Year (e.g., 2024)
     * @param {number} month - Month (1-12)
     * @returns {string} Formatted month name (e.g., "January 2024")
     */
    getMonthName(year, month) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return `${months[month - 1]} ${year}`;
    }

    /**
     * Format date for display
     * @param {Date|string} date - Date to format
     * @returns {string} Formatted date (e.g., "1/26/2026")
     */
    formatDate(date) {
        if (!date) return 'Unknown';
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }

    /**
     * Create a monthly summary chunk
     * @private
     * @param {string} month - Month key (YYYY-MM)
     * @param {Array} monthStreams - Streams for this month
     * @returns {Chunk} Monthly summary chunk
     */
    _createMonthlySummaryChunk(month, monthStreams) {
        const artists = {};
        const tracks = {};
        let totalMs = 0;

        monthStreams.forEach(s => {
            const artist = s.master_metadata_album_artist_name || s.artistName || 'Unknown';
            const track = s.master_metadata_track_name || s.trackName || 'Unknown';
            const ms = s.ms_played || s.msPlayed || 0;

            artists[artist] = (artists[artist] || 0) + 1;
            tracks[`${track} by ${artist}`] = (tracks[`${track} by ${artist}`] || 0) + 1;
            totalMs += ms;
        });

        const topArtists = Object.entries(artists)
            .sort((a, b) => b[1] - a[1])
            .slice(0, CHUNKING_CONFIG.TOP_ITEMS_PER_CHUNK)
            .map(([name, count]) => `${name} (${count} plays)`);

        const topTracks = Object.entries(tracks)
            .sort((a, b) => b[1] - a[1])
            .slice(0, CHUNKING_CONFIG.TOP_ITEMS_PER_CHUNK)
            .map(([name, count]) => `${name} (${count} plays)`);

        const hours = Math.round(totalMs / 3600000 * 10) / 10;
        const [year, monthNum] = month.split('-');
        const monthName = this.getMonthName(parseInt(year, 10), parseInt(monthNum, 10));

        return {
            type: 'monthly_summary',
            text: `In ${monthName}, user listened for ${hours} hours with ${monthStreams.length} plays. Top artists: ${topArtists.join(', ')}. Top tracks: ${topTracks.join(', ')}.`,
            metadata: { month, plays: monthStreams.length, hours }
        };
    }

    /**
     * Create an artist profile chunk
     * @private
     * @param {string} artist - Artist name
     * @param {Array} artistStreams - Streams for this artist
     * @returns {Chunk} Artist profile chunk
     */
    _createArtistProfileChunk(artist, artistStreams) {
        const tracks = {};
        let totalMs = 0;
        let firstListen = null;
        let lastListen = null;

        artistStreams.forEach(s => {
            const track = s.master_metadata_track_name || s.trackName || 'Unknown';
            const ms = s.ms_played || s.msPlayed || 0;
            const date = new Date(s.ts || s.endTime);

            tracks[track] = (tracks[track] || 0) + 1;
            totalMs += ms;

            if (!firstListen || date < firstListen) firstListen = date;
            if (!lastListen || date > lastListen) lastListen = date;
        });

        const topTracks = Object.entries(tracks)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => `${name} (${count})`);

        const hours = Math.round(totalMs / 3600000 * 10) / 10;

        return {
            type: 'artist_profile',
            text: `Artist: ${artist}. Total plays: ${artistStreams.length}. Listening time: ${hours} hours. First listened: ${this.formatDate(firstListen)}. Last listened: ${this.formatDate(lastListen)}. Top tracks: ${topTracks.join(', ')}.`,
            metadata: { artist, plays: artistStreams.length, hours }
        };
    }

    /**
     * Process items with time-budget-aware batching to prevent UI freezing
     * @private
     * @param {Array} items - Items to process
     * @param {Function} processor - Processing function for each item
     * @param {string} phaseName - Name of processing phase for progress
     * @param {number} progressMultiplier - Progress multiplier (0-100)
     * @param {number} baseProgress - Base progress value
     * @param {Function} onProgress - Progress callback
     */
    async _processWithBudget(items, processor, phaseName, progressMultiplier, baseProgress = 0, onProgress) {
        let processed = 0;
        const total = items.length;
        let adaptiveBatchSize = CHUNKING_CONFIG.INITIAL_BATCH_SIZE;

        while (processed < total) {
            const batchStartTime = performance.now();
            const batchEnd = Math.min(processed + adaptiveBatchSize, total);
            const batch = items.slice(processed, batchEnd);

            // Process the batch
            batch.forEach(item => processor(item));

            const batchProcessingTime = performance.now() - batchStartTime;
            processed = batchEnd;

            // Adjust batch size based on actual processing time
            if (batchProcessingTime > CHUNKING_CONFIG.TARGET_PROCESSING_TIME_MS) {
                // Processing took too long, reduce batch size
                adaptiveBatchSize = Math.max(
                    CHUNKING_CONFIG.MIN_BATCH_SIZE,
                    Math.floor(adaptiveBatchSize * 0.7)
                );
            } else if (batchProcessingTime < CHUNKING_CONFIG.TARGET_PROCESSING_TIME_MS * 0.5) {
                // Processing was quick, could increase batch size
                adaptiveBatchSize = Math.min(
                    CHUNKING_CONFIG.MAX_BATCH_SIZE,
                    Math.floor(adaptiveBatchSize * 1.3)
                );
            }

            // Yield to event loop to maintain UI responsiveness
            if (processed < total) {
                onProgress(baseProgress + Math.round((processed / total) * progressMultiplier), 100, phaseName);
                await new Promise(resolve => queueMicrotask(resolve));
            }
        }
    }
}

// Export singleton instance
export const ragChunkingService = new RAGChunkingService();

/**
 * @typedef {Object} Chunk
 * @property {string} type - Chunk type (monthly_summary, artist_profile, pattern_result, pattern_summary)
 * @property {string} text - Chunk text content
 * @property {Object} metadata - Chunk metadata
 */
