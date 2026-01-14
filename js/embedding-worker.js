/**
 * Embedding Worker for Rhythm Chamber
 * 
 * Offloads heavy chunk creation from the main UI thread to prevent jank.
 * 
 * Message Interface:
 * - Input: { type: 'createChunks', streams: Array }
 * - Output: { type: 'progress', current: number, total: number, message: string }
 * - Output: { type: 'complete', chunks: Array }
 * - Output: { type: 'error', message: string }
 * 
 * Note: Qdrant API calls remain on main thread (requires fetch + auth headers).
 */

'use strict';

/**
 * Handle incoming messages from main thread
 */
self.onmessage = function (event) {
    const { type, streams } = event.data;

    switch (type) {
        case 'createChunks':
            try {
                const chunks = createChunks(streams);
                self.postMessage({ type: 'complete', chunks });
            } catch (error) {
                self.postMessage({ type: 'error', message: error.message });
            }
            break;

        default:
            self.postMessage({ type: 'error', message: `Unknown message type: ${type}` });
    }
};

/**
 * Create searchable chunks from streaming data
 * Moved from rag.js to run off the main thread
 * 
 * @param {Array} streams - Spotify streaming history
 * @returns {Array} Chunks for embedding
 */
function createChunks(streams) {
    const chunks = [];
    const totalStreams = streams.length;

    // Report initial progress
    self.postMessage({ type: 'progress', current: 0, total: 100, message: 'Grouping streams by month...' });

    // Group streams by month
    const byMonth = {};
    streams.forEach((stream, idx) => {
        const date = new Date(stream.ts || stream.endTime);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonth[monthKey]) byMonth[monthKey] = [];
        byMonth[monthKey].push(stream);

        // Report progress every 10000 streams
        if (idx > 0 && idx % 10000 === 0) {
            const percent = Math.round((idx / totalStreams) * 30);
            self.postMessage({ type: 'progress', current: percent, total: 100, message: `Grouped ${idx.toLocaleString()} streams...` });
        }
    });

    self.postMessage({ type: 'progress', current: 30, total: 100, message: 'Creating monthly summaries...' });

    // Create monthly summary chunks
    const monthKeys = Object.keys(byMonth);
    monthKeys.forEach((month, monthIdx) => {
        const monthStreams = byMonth[month];
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
            .slice(0, 10)
            .map(([name, count]) => `${name} (${count} plays)`);

        const topTracks = Object.entries(tracks)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => `${name} (${count} plays)`);

        const hours = Math.round(totalMs / 3600000 * 10) / 10;
        const [year, monthNum] = month.split('-');
        const monthName = getMonthName(parseInt(year), parseInt(monthNum));

        chunks.push({
            type: 'monthly_summary',
            text: `In ${monthName}, user listened for ${hours} hours with ${monthStreams.length} plays. Top artists: ${topArtists.join(', ')}. Top tracks: ${topTracks.join(', ')}.`,
            metadata: { month, plays: monthStreams.length, hours }
        });

        // Report progress
        const monthProgress = 30 + Math.round((monthIdx / monthKeys.length) * 30);
        self.postMessage({ type: 'progress', current: monthProgress, total: 100, message: `Processed month ${monthIdx + 1}/${monthKeys.length}` });
    });

    self.postMessage({ type: 'progress', current: 60, total: 100, message: 'Creating artist profiles...' });

    // Group by artist for artist profiles
    const byArtist = {};
    streams.forEach(stream => {
        const artist = stream.master_metadata_album_artist_name || stream.artistName || 'Unknown';
        if (!byArtist[artist]) byArtist[artist] = [];
        byArtist[artist].push(stream);
    });

    // Top 50 artists get individual chunks
    const topArtistEntries = Object.entries(byArtist)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 50);

    topArtistEntries.forEach(([artist, artistStreams], artistIdx) => {
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

        chunks.push({
            type: 'artist_profile',
            text: `Artist: ${artist}. Total plays: ${artistStreams.length}. Listening time: ${hours} hours. First listened: ${formatDate(firstListen)}. Last listened: ${formatDate(lastListen)}. Top tracks: ${topTracks.join(', ')}.`,
            metadata: { artist, plays: artistStreams.length, hours }
        });

        // Report progress
        const artistProgress = 60 + Math.round((artistIdx / topArtistEntries.length) * 40);
        self.postMessage({ type: 'progress', current: artistProgress, total: 100, message: `Processed artist ${artistIdx + 1}/${topArtistEntries.length}` });
    });

    self.postMessage({ type: 'progress', current: 100, total: 100, message: `Created ${chunks.length} chunks` });

    return chunks;
}

/**
 * Get month name without relying on Intl (for worker compatibility)
 */
function getMonthName(year, month) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[month - 1]} ${year}`;
}

/**
 * Format date without relying on locale methods
 */
function formatDate(date) {
    if (!date) return 'Unknown';
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

console.log('[EmbeddingWorker] Worker initialized');
