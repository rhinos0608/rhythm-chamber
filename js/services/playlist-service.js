/**
 * Playlist Service (Premium-Gated)
 *
 * Wraps the PlaylistGenerator with premium quota checks.
 * Free users get 1 playlist, then see upgrade modal.
 *
 * Usage:
 *   const result = await PlaylistService.createPlaylist(streams, options);
 *   if (result.gated) {
 *     // User hit quota limit, upgrade was shown
 *   } else {
 *     // Use result.playlist
 *   }
 *
 * @module services/playlist-service
 */

import { PlaylistGenerator } from './playlist-generator.js';
import { PremiumQuota } from './premium-quota.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PlaylistService');

// ==========================================
// Playlist Creation (with Premium Gating)
// ==========================================

/**
 * Create a playlist with quota checking
 *
 * @param {Array} streams - User streaming history
 * @param {Object} options - Playlist options
 * @param {string} [options.type] - Playlist type (era, energy, discovery, etc.)
 * @param {string} [options.startDate] - Start date for era playlists
 * @param {string} [options.endDate] - End date for era playlists
 * @param {string} [options.energy] - Energy level for energy playlists
 * @param {number} [options.limit=50] - Max tracks
 * @returns {Promise<Object>} Result with playlist or gated status
 */
async function createPlaylist(streams, options = {}) {
    // Check quota first
    const { allowed, remaining } = await PremiumQuota.canCreatePlaylist();

    if (!allowed) {
        logger.info('Playlist quota exceeded, showing upgrade modal');

        // Dynamically import PremiumController to avoid circular dependencies
        const { PremiumController } = await import('../controllers/premium-controller.js');
        PremiumController.showPlaylistUpgradeModal(remaining);

        return {
            gated: true,
            playlist: null,
            remaining
        };
    }

    // Quota available - create the playlist
    logger.info(`Creating playlist (quota remaining: ${remaining})`);

    let playlist;
    const { type = 'era' } = options;

    switch (type) {
        case 'era':
            playlist = PlaylistGenerator.createPlaylistFromEra(streams, options);
            break;
        case 'energy':
            playlist = PlaylistGenerator.createEnergyPlaylist(streams, options);
            break;
        case 'discovery':
            playlist = PlaylistGenerator.suggestNewArtists(streams, options);
            break;
        case 'time_machine':
            playlist = PlaylistGenerator.createTimeMachinePlaylist(streams, new Date(), options);
            break;
        default:
            playlist = PlaylistGenerator.createPlaylistFromEra(streams, options);
    }

    // Record the usage after successful creation
    const newRemaining = await PremiumQuota.recordPlaylistCreation();
    logger.info(`Playlist created successfully. New quota remaining: ${newRemaining}`);

    return {
        gated: false,
        playlist,
        remaining: newRemaining
    };
}

/**
 * Get current quota status for playlists
 * @returns {Promise<Object>} Quota status
 */
async function getQuotaStatus() {
    return PremiumQuota.getQuotaStatus();
}

/**
 * Create playlist on Spotify (also checks quota)
 *
 * @param {Array} streams - User streaming history
 * @param {Object} options - Playlist options
 * @returns {Promise<Object>} Result with spotify playlist or gated status
 */
async function createOnSpotify(streams, options = {}) {
    // Check quota first
    const { allowed, remaining } = await PremiumQuota.canCreatePlaylist();

    if (!allowed) {
        logger.info('Spotify playlist quota exceeded, showing upgrade modal');

        const { PremiumController } = await import('../controllers/premium-controller.js');
        PremiumController.showPlaylistUpgradeModal(remaining);

        return {
            gated: true,
            spotifyPlaylist: null,
            remaining
        };
    }

    // First generate the playlist data
    const { type = 'era' } = options;
    let playlist;

    switch (type) {
        case 'era':
            playlist = PlaylistGenerator.createPlaylistFromEra(streams, options);
            break;
        case 'energy':
            playlist = PlaylistGenerator.createEnergyPlaylist(streams, options);
            break;
        case 'time_machine':
            playlist = PlaylistGenerator.createTimeMachinePlaylist(streams, new Date(), options);
            break;
        default:
            playlist = PlaylistGenerator.createPlaylistFromEra(streams, options);
    }

    // Then create on Spotify
    const spotifyPlaylist = await PlaylistGenerator.createOnSpotify(playlist, options);

    // Record usage
    await PremiumQuota.recordPlaylistCreation();

    return {
        gated: false,
        spotifyPlaylist,
        playlist
    };
}

// ==========================================
// Public API
// ==========================================

export const PlaylistService = {
    createPlaylist,
    createOnSpotify,
    getQuotaStatus,

    // Re-export types from PlaylistGenerator
    PLAYLIST_TYPES: PlaylistGenerator.PLAYLIST_TYPES
};


logger.info('Module loaded - Premium-gated playlist service');
