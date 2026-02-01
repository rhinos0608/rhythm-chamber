/**
 * Playlist Query Executors
 *
 * Premium feature: AI-generated playlists from listening history.
 * Integrates with PremiumQuota for usage tracking and upgrade prompts.
 *
 * HNW Considerations:
 * - Hierarchy: Each executor handles one playlist type
 * - Network: Returns consistent format for LLM consumption
 * - Wave: Handles premium gating gracefully
 */

import { PlaylistService } from '../../services/playlist-service.js';
import { PremiumQuota } from '../../services/premium-quota.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PlaylistExecutors');

// Premium feature flag (set to false to allow during MVP)
const PLAYLIST_PREMIUM_ENABLED = false;

/**
 * Check playlist quota before generation
 * @returns {Promise<{allowed: boolean, remaining: number, reason: string|null}>}
 */
async function checkPlaylistQuota() {
    if (!PLAYLIST_PREMIUM_ENABLED) {
        return { allowed: true, remaining: Infinity, reason: null };
    }

    return PremiumQuota.canCreatePlaylist();
}

/**
 * Parse flexible date input (YYYY-MM-DD, "March 2023", etc.)
 * @param {string} dateInput - Flexible date string
 * @returns {Date|null} Parsed date or null
 */
function parseFlexibleDate(dateInput) {
    if (!dateInput) return null;

    // Try YYYY-MM-DD format
    const isoMatch = dateInput.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
        return new Date(isoMatch[1], isoMatch[2] - 1, isoMatch[3]);
    }

    // Try "Month Year" format
    const monthYearMatch = dateInput.match(
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i
    );
    if (monthYearMatch) {
        const monthNames = [
            'jan',
            'feb',
            'mar',
            'apr',
            'may',
            'jun',
            'jul',
            'aug',
            'sep',
            'oct',
            'nov',
            'dec',
        ];
        const monthIndex = monthNames.findIndex(
            m => m === monthYearMatch[1].toLowerCase().substring(0, 3)
        );
        if (monthIndex >= 0) {
            return new Date(parseInt(monthYearMatch[2]), monthIndex, 1);
        }
    }

    // Try parsing naturally
    const parsed = new Date(dateInput);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    return null;
}

/**
 * Format playlist tracks for LLM response
 * @param {Array} tracks - Playlist tracks
 * @param {number} limit - Max tracks to show
 * @returns {string} Formatted track list
 */
function formatPlaylistTracks(tracks, limit = 20) {
    if (!tracks || tracks.length === 0) {
        return 'No tracks found.';
    }

    const toShow = tracks.slice(0, limit);
    const lines = toShow.map(
        (t, i) => `${i + 1}. ${t.name || t.trackName} by ${t.artist || t.artistName}`
    );

    let result = lines.join('\n');

    if (tracks.length > limit) {
        result += `\n...and ${tracks.length - limit} more tracks.`;
    }

    return result;
}

// ==========================================
// Playlist Executors
// ==========================================

/**
 * Create an era-based playlist
 */
async function executeCreateEraPlaylist(args, streams) {
    const { start_date, end_date, limit = 50, create_on_spotify = false } = args;

    // Check quota first
    const quota = await checkPlaylistQuota();
    if (!quota.allowed) {
        return {
            error: quota.reason || 'Playlist generation requires Premium.',
            premium_required: true,
            remaining: quota.remaining,
        };
    }

    if (!streams || streams.length === 0) {
        return { error: 'No streaming data available. Please upload your Spotify history first.' };
    }

    // Parse dates
    const startDate = parseFlexibleDate(start_date);
    const endDate = end_date ? parseFlexibleDate(end_date) : null;

    if (!startDate) {
        return {
            error: `Could not parse start date: "${start_date}". Try YYYY-MM-DD format like "2023-03-15" or "March 2023".`,
        };
    }

    // Create playlist via PlaylistService
    const result = await PlaylistService.createPlaylist(streams, {
        type: 'era',
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate ? endDate.toISOString().split('T')[0] : undefined,
        limit: Math.min(limit, 100),
    });

    if (result.gated) {
        return {
            error: "You've used your free playlist. Upgrade to Premium for unlimited playlist generation.",
            premium_required: true,
            remaining: result.remaining,
        };
    }

    const playlist = result.playlist;

    // Format response for LLM
    const response = {
        success: true,
        playlist_name: playlist.name,
        description: playlist.description,
        track_count: playlist.tracks.length,
        tracks: formatPlaylistTracks(playlist.tracks, 20),
        remaining_playlists: result.remaining,
    };

    // Add Spotify creation info if requested
    if (create_on_spotify) {
        const spotifyResult = await PlaylistService.createOnSpotify(streams, {
            type: 'era',
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate ? endDate.toISOString().split('T')[0] : undefined,
            limit: Math.min(limit, 100),
        });

        if (spotifyResult.gated) {
            response.spotify_notice = 'Spotify playlist creation requires Premium.';
        } else if (spotifyResult.spotifyPlaylist?.url) {
            response.spotify_url = spotifyResult.spotifyPlaylist.url;
            response.spotify_notice = `Created on Spotify: ${spotifyResult.spotifyPlaylist.url}`;
        }
    }

    return response;
}

/**
 * Create an energy-based playlist
 */
async function executeCreateEnergyPlaylist(args, streams) {
    const { energy, limit = 50, create_on_spotify = false } = args;

    // Check quota first
    const quota = await checkPlaylistQuota();
    if (!quota.allowed) {
        return {
            error: quota.reason || 'Playlist generation requires Premium.',
            premium_required: true,
            remaining: quota.remaining,
        };
    }

    if (!streams || streams.length === 0) {
        return { error: 'No streaming data available.' };
    }

    // Create playlist via PlaylistService
    const result = await PlaylistService.createPlaylist(streams, {
        type: 'energy',
        energy,
        limit: Math.min(limit, 100),
    });

    if (result.gated) {
        return {
            error: "You've used your free playlist. Upgrade to Premium for unlimited playlist generation.",
            premium_required: true,
            remaining: result.remaining,
        };
    }

    const playlist = result.playlist;

    return {
        success: true,
        playlist_name: playlist.name,
        description: playlist.description,
        track_count: playlist.tracks.length,
        tracks: formatPlaylistTracks(playlist.tracks, 20),
        remaining_playlists: result.remaining,
    };
}

/**
 * Create a "time machine" playlist from this day in history
 */
async function executeCreateTimeMachinePlaylist(args, streams) {
    const { years_back = 3, limit = 10, create_on_spotify = false } = args;

    // Check quota first
    const quota = await checkPlaylistQuota();
    if (!quota.allowed) {
        return {
            error: quota.reason || 'Playlist generation requires Premium.',
            premium_required: true,
            remaining: quota.remaining,
        };
    }

    if (!streams || streams.length === 0) {
        return { error: 'No streaming data available.' };
    }

    // Create playlist via PlaylistService
    const result = await PlaylistService.createPlaylist(streams, {
        type: 'time_machine',
        yearsBack: years_back,
        limit: Math.min(limit, 20),
    });

    if (result.gated) {
        return {
            error: "You've used your free playlist. Upgrade to Premium for unlimited playlist generation.",
            premium_required: true,
            remaining: result.remaining,
        };
    }

    const playlist = result.playlist;

    return {
        success: true,
        playlist_name: playlist.name,
        description: playlist.description,
        track_count: playlist.tracks.length,
        tracks: formatPlaylistTracks(playlist.tracks, 30),
        remaining_playlists: result.remaining,
    };
}

/**
 * Suggest new artists to discover
 */
async function executeDiscoverNewArtists(args, streams) {
    const { limit = 10 } = args;

    if (!streams || streams.length === 0) {
        return { error: 'No streaming data available.' };
    }

    // This uses the PlaylistService but doesn't consume quota (discovery is free)
    const result = await PlaylistService.createPlaylist(streams, {
        type: 'discovery',
        limit: Math.min(limit, 25),
    });

    // Skip quota check for discovery - it's a free feature
    const playlist = result.playlist || result;

    if (!playlist || !playlist.artists) {
        return { error: 'Could not generate artist recommendations.' };
    }

    const artistLines = playlist.artists.map(
        (a, i) => `${i + 1}. ${a.name} - ${a.reason || 'Discovered during ' + a.period}`
    );

    return {
        success: true,
        artist_count: playlist.artists.length,
        artists: artistLines.join('\n'),
    };
}

/**
 * Create a vibe-based playlist using semantic search
 */
async function executeCreateVibePlaylist(args, streams) {
    const { vibe, limit = 30, create_on_spotify = false } = args;

    // Check quota first (vibe playlists are premium)
    const quota = await checkPlaylistQuota();
    if (!quota.allowed) {
        return {
            error: quota.reason || 'Vibe-based playlists require Premium.',
            premium_required: true,
            remaining: quota.remaining,
        };
    }

    if (!streams || streams.length === 0) {
        return { error: 'No streaming data available.' };
    }

    // Check if embeddings are available
    const { RAG } = await import('../../rag.js');
    if (!RAG.isConfigured()) {
        return {
            error: 'Semantic search is not set up. Please generate embeddings first to use vibe-based playlists.',
            embeddings_required: true,
        };
    }

    // Use RAG to find matching tracks based on vibe
    try {
        const searchResults = await RAG.search(vibe, Math.min(limit * 2, 100));
        const tracks = searchResults
            .filter(r => r.payload?.metadata?.trackName)
            .map(r => ({
                name: r.payload.metadata.trackName,
                artist: r.payload.metadata.artistName,
                score: r.score,
            }))
            .slice(0, limit);

        if (tracks.length === 0) {
            return {
                success: true,
                notice: `No tracks found matching vibe: "${vibe}". Try a different description.`,
                suggestions:
                    'Try describing a mood (melancholy, energetic), time (late night, morning), or feeling (nostalgic, hopeful).',
            };
        }

        // Record usage
        await PlaylistService.recordPlaylistCreation();

        return {
            success: true,
            playlist_name: `${vibe.substring(0, 30)}${vibe.length > 30 ? '...' : ''}`,
            description: `Tracks matching the vibe: "${vibe}"`,
            track_count: tracks.length,
            tracks: formatPlaylistTracks(tracks, 20),
        };
    } catch (error) {
        if (error.message === 'SEMANTIC_SEARCH_REQUIRED') {
            return {
                error: 'Vibe-based playlists require Premium.',
                premium_required: true,
            };
        }
        throw error;
    }
}

// ==========================================
// Executors Export
// ==========================================

export const PlaylistExecutors = {
    create_era_playlist: executeCreateEraPlaylist,
    create_energy_playlist: executeCreateEnergyPlaylist,
    create_time_machine_playlist: executeCreateTimeMachinePlaylist,
    discover_new_artists: executeDiscoverNewArtists,
    create_vibe_playlist: executeCreateVibePlaylist,
};

logger.info('Module loaded - Playlist executors initialized');
