/**
 * Playlist Generator Service
 * 
 * Creates AI-powered playlists based on listening patterns and preferences.
 * Integrates with Spotify API for actual playlist creation.
 * 
 * Playlist Types:
 * - Era-based: Playlists from specific listening periods
 * - Energy-based: Mood/energy level playlists
 * - Discovery: New artist recommendations
 * - Nostalgia: Comfort favorites
 * - Time-machine: What you listened to on this date
 * 
 * @module services/playlist-generator
 */

import { EventBus } from './event-bus.js';

// ==========================================
// Playlist Types
// ==========================================

const PLAYLIST_TYPES = {
    ERA: 'era',              // Time period playlist
    ENERGY: 'energy',        // Mood/energy based
    DISCOVERY: 'discovery',  // New recommendations
    NOSTALGIA: 'nostalgia',  // Comfort favorites
    TIME_MACHINE: 'time_machine', // This day in history
    NIGHT_OWL: 'night_owl',  // Late night favorites
    MORNING: 'morning'       // Morning listening
};

// ==========================================
// Playlist Generation
// ==========================================

/**
 * Create an era-based playlist from a specific time period
 * 
 * @param {Array} streams - User streaming history
 * @param {Object} options - Playlist options
 * @param {string} options.startDate - Start date (YYYY-MM-DD)
 * @param {string} options.endDate - End date (YYYY-MM-DD)
 * @param {number} [options.limit=50] - Max tracks
 * @returns {Object} Playlist data
 */
function createPlaylistFromEra(streams, options = {}) {
    const { startDate, endDate, limit = 50 } = options;

    if (!startDate || !endDate) {
        throw new Error('Start and end dates required for era playlist');
    }

    // Filter streams to date range
    const eraStreams = streams.filter(s => {
        const date = s.ts?.slice(0, 10);
        return date && date >= startDate && date <= endDate;
    });

    // Get top tracks from era
    const trackCounts = {};
    for (const s of eraStreams) {
        const name = s.master_metadata_track_name;
        const artist = s.master_metadata_album_artist_name;
        const key = s.spotify_track_uri || (artist && name ? `${artist} - ${name}` : name);
        if (key) {
            if (!trackCounts[key]) {
                trackCounts[key] = {
                    name,
                    artist,
                    uri: s.spotify_track_uri || null,
                    count: 0
                };
            }
            trackCounts[key].count++;
        }
    }

    const tracks = Object.values(trackCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

    return {
        type: PLAYLIST_TYPES.ERA,
        name: `${formatDate(startDate)} - ${formatDate(endDate)} Era`,
        description: `Your top tracks from ${formatDate(startDate)} to ${formatDate(endDate)}`,
        tracks,
        metadata: {
            startDate,
            endDate,
            totalStreamsInEra: eraStreams.length,
            generatedAt: new Date().toISOString()
        }
    };
}

/**
 * Create an energy-based playlist
 * 
 * @param {Array} streams - User streaming history
 * @param {Object} options - Playlist options
 * @param {'high' | 'medium' | 'low'} options.energy - Energy level
 * @param {number} [options.limit=50] - Max tracks
 * @returns {Object} Playlist data
 */
function createEnergyPlaylist(streams, options = {}) {
    const { energy = 'high', limit = 50 } = options;

    // Infer energy from time of day (proxy without audio features)
    const timeRanges = {
        high: { start: 9, end: 18 },    // Daytime
        medium: { start: 18, end: 22 }, // Evening
        low: { start: 22, end: 6 }      // Night/Early morning
    };

    const range = timeRanges[energy] || timeRanges.medium;

    // Filter streams by time of day
    const filteredStreams = streams.filter(s => {
        if (!s.ts) return false;
        const hour = parseInt(s.ts.slice(11, 13));
        if (range.start < range.end) {
            return hour >= range.start && hour < range.end;
        } else {
            return hour >= range.start || hour < range.end;
        }
    });

    // Get top tracks from filtered streams
    const trackCounts = {};
    for (const s of filteredStreams) {
        const key = s.spotify_track_uri ||
            `${s.master_metadata_album_artist_name} - ${s.master_metadata_track_name}`;
        if (key) {
            if (!trackCounts[key]) {
                trackCounts[key] = {
                    name: s.master_metadata_track_name,
                    artist: s.master_metadata_album_artist_name,
                    uri: s.spotify_track_uri,
                    count: 0
                };
            }
            trackCounts[key].count++;
        }
    }

    const tracks = Object.values(trackCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

    const energyNames = { high: 'High Energy', medium: 'Chill', low: 'Late Night' };

    return {
        type: PLAYLIST_TYPES.ENERGY,
        name: `${energyNames[energy]} Vibes`,
        description: `Your ${energyNames[energy].toLowerCase()} favorites`,
        tracks,
        metadata: {
            energy,
            totalStreamsMatched: filteredStreams.length,
            generatedAt: new Date().toISOString()
        }
    };
}

/**
 * Suggest new artists based on listening history
 * 
 * @param {Array} streams - User streaming history
 * @param {Object} options - Options
 * @param {number} [options.limit=20] - Max suggestions
 * @returns {Object} Artist suggestions
 */
function suggestNewArtists(streams, options = {}) {
    const { limit = 20 } = options;

    // Get all artists and their popularity
    const artistCounts = {};
    for (const s of streams) {
        const artist = s.master_metadata_album_artist_name;
        if (artist) {
            artistCounts[artist] = (artistCounts[artist] || 0) + 1;
        }
    }

    // Find artists listened to only once or twice (potential discoveries)
    const rareArtists = Object.entries(artistCounts)
        .filter(([_, count]) => count >= 1 && count <= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([artist, count]) => ({
            artist,
            playCount: count,
            reason: 'You\'ve only listened a few times - give them another chance!'
        }));

    // Find artists similar to favorites (based on listening patterns)
    // This would ideally use Spotify API for real recommendations
    const topArtists = Object.entries(artistCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([artist]) => artist);

    return {
        type: PLAYLIST_TYPES.DISCOVERY,
        rareArtists,
        basedOnFavorites: topArtists,
        suggestions: rareArtists,
        metadata: {
            totalArtistsInHistory: Object.keys(artistCounts).length,
            generatedAt: new Date().toISOString()
        }
    };
}

/**
 * Create a "this day in history" playlist
 * 
 * @param {Array} streams - User streaming history
 * @param {Date} [date=today] - Date to look up
 * @param {Object} [options] - Options
 * @returns {Object} Time machine playlist
 */
function createTimeMachinePlaylist(streams, date = new Date(), options = {}) {
    const { limit = 50 } = options;
    const targetMonth = String(date.getMonth() + 1).padStart(2, '0');
    const targetDay = String(date.getDate()).padStart(2, '0');
    const monthDay = `-${targetMonth}-${targetDay}`;

    // Find all streams on this day across all years
    const matchingStreams = streams.filter(s => {
        return s.ts?.includes(monthDay);
    });

    // Group by year
    const byYear = {};
    for (const s of matchingStreams) {
        const year = s.ts?.slice(0, 4);
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(s);
    }

    // Get top tracks overall
    const trackCounts = {};
    for (const s of matchingStreams) {
        const key = `${s.master_metadata_album_artist_name} - ${s.master_metadata_track_name}`;
        if (!trackCounts[key]) {
            trackCounts[key] = {
                name: s.master_metadata_track_name,
                artist: s.master_metadata_album_artist_name,
                uri: s.spotify_track_uri,
                count: 0,
                years: new Set()
            };
        }
        trackCounts[key].count++;
        trackCounts[key].years.add(s.ts?.slice(0, 4));
    }

    const tracks = Object.values(trackCounts)
        .map(t => ({ ...t, years: [...t.years] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

    return {
        type: PLAYLIST_TYPES.TIME_MACHINE,
        name: `${formatMonthDay(targetMonth, targetDay)} Through the Years`,
        description: `What you listened to on ${formatMonthDay(targetMonth, targetDay)} across all years`,
        tracks,
        byYear: Object.fromEntries(
            Object.entries(byYear).map(([year, streams]) => [
                year,
                streams.slice(0, 5).map(s => ({
                    name: s.master_metadata_track_name,
                    artist: s.master_metadata_album_artist_name
                }))
            ])
        ),
        metadata: {
            date: `${targetMonth}-${targetDay}`,
            yearsWithData: Object.keys(byYear),
            totalMatches: matchingStreams.length,
            generatedAt: new Date().toISOString()
        }
    };
}

// ==========================================
// Spotify Integration
// ==========================================

/**
 * Create playlist on Spotify
 * Requires user to be authenticated with playlist-modify scope
 * 
 * @param {Object} playlist - Playlist data from generation
 * @param {Object} [options] - Creation options
 * @returns {Promise<Object>} Created Spotify playlist
 */
async function createOnSpotify(playlist, options = {}) {
    const { isPublic = false } = options;

    const spotify = window.Spotify;
    if (!spotify?.authenticatedFetch) {
        throw new Error('Spotify not connected. Please connect your account.');
    }

    // Check if we have the required scope
    const requiredScope = isPublic ? 'playlist-modify-public' : 'playlist-modify-private';
    const hasScope = await spotify.hasScope?.(requiredScope);
    if (!hasScope) {
        throw new Error('Playlist creation permission not granted. Please re-connect Spotify.');
    }

    // Get user ID
    const meResponse = await spotify.authenticatedFetch('https://api.spotify.com/v1/me');
    if (!meResponse.ok) {
        throw new Error('Failed to get Spotify user info');
    }
    const me = await meResponse.json();

    // Create playlist
    const createResponse = await spotify.authenticatedFetch(
        `https://api.spotify.com/v1/users/${me.id}/playlists`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: playlist.name,
                description: playlist.description,
                public: isPublic
            })
        }
    );

    if (!createResponse.ok) {
        throw new Error('Failed to create Spotify playlist');
    }

    const createdPlaylist = await createResponse.json();

    // Add tracks (only those with Spotify URIs)
    const uris = playlist.tracks
        .filter(t => t.uri?.startsWith('spotify:track:'))
        .map(t => t.uri);

    if (uris.length > 0) {
        // Spotify limits to 100 tracks per request
        for (let i = 0; i < uris.length; i += 100) {
            const batch = uris.slice(i, i + 100);
            await spotify.authenticatedFetch(
                `https://api.spotify.com/v1/playlists/${createdPlaylist.id}/tracks`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uris: batch })
                }
            );
        }
    }

    EventBus.emit('playlist:created', {
        playlistId: createdPlaylist.id,
        trackCount: uris.length,
        name: playlist.name
    });

    return {
        ...createdPlaylist,
        tracksAdded: uris.length,
        tracksSkipped: playlist.tracks.length - uris.length
    };
}

// ==========================================
// Helpers
// ==========================================

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatMonthDay(month, day) {
    const d = new Date(2000, parseInt(month) - 1, parseInt(day));
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// ==========================================
// Public API
// ==========================================

export const PlaylistGenerator = {
    // Generation
    createPlaylistFromEra,
    createEnergyPlaylist,
    suggestNewArtists,
    createTimeMachinePlaylist,

    // Spotify Integration
    createOnSpotify,

    // Types
    PLAYLIST_TYPES
};

// Expose on window for debugging
if (typeof window !== 'undefined') {
    window.PlaylistGenerator = PlaylistGenerator;
}

console.log('[PlaylistGenerator] Playlist generation service loaded');
