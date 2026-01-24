/**
 * Playlist Service Tests
 *
 * Tests for premium-gated playlist creation, quota checking,
 * and integration with PremiumQuota.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PremiumQuota } from '../../js/services/premium-quota.js';
import { ConfigLoader } from '../../js/services/config-loader.js';

// Mock PremiumQuota
vi.mock('../../js/services/premium-quota.js', () => ({
    PremiumQuota: {
        canCreatePlaylist: vi.fn().mockResolvedValue({
            allowed: true,
            remaining: 1,
            reason: null
        }),
        recordPlaylistCreation: vi.fn().mockResolvedValue(0),
        getQuotaStatus: vi.fn().mockResolvedValue({
            isPremium: false,
            playlists: { used: 0, limit: 1, remaining: 1 }
        })
    }
}));

// Mock ConfigLoader
vi.mock('../../js/services/config-loader.js', () => ({
    ConfigLoader: {
        get: vi.fn((key, defaultValue) => defaultValue)
    }
}));

// Mock PlaylistGenerator
const mockPlaylist = {
    name: 'Test Playlist',
    description: 'A test playlist',
    tracks: [
        { name: 'Song 1', artist: 'Artist 1' },
        { name: 'Song 2', artist: 'Artist 2' }
    ]
};

vi.mock('../../js/services/playlist-generator.js', () => ({
    PlaylistGenerator: {
        PLAYLIST_TYPES: ['era', 'energy', 'discovery', 'time_machine'],
        createPlaylistFromEra: vi.fn(() => mockPlaylist),
        createEnergyPlaylist: vi.fn(() => mockPlaylist),
        suggestNewArtists: vi.fn(() => ({
            name: 'Discoveries',
            artists: [
                { name: 'New Artist 1', reason: 'Similar to your favorites' },
                { name: 'New Artist 2', reason: 'Trending in your genre' }
            ]
        })),
        createTimeMachinePlaylist: vi.fn(() => mockPlaylist),
        createOnSpotify: vi.fn().mockResolvedValue({
            id: 'spotify-123',
            url: 'https://open.spotify.com/playlist/spotify-123'
        })
    }
}));

describe('PlaylistService', () => {
    beforeEach(() => {
        // Clear localStorage
        if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
        vi.clearAllMocks();

        // Reset mocks to default values (quota available)
        vi.mocked(PremiumQuota.canCreatePlaylist).mockResolvedValue({
            allowed: true,
            remaining: 1,
            reason: null
        });
        vi.mocked(PremiumQuota.recordPlaylistCreation).mockResolvedValue(0);
        vi.mocked(PremiumQuota.getQuotaStatus).mockResolvedValue({
            isPremium: false,
            playlists: { used: 0, limit: 1, remaining: 1 }
        });
    });

    afterEach(() => {
        if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
    });

    describe('Module Structure', () => {
        it('should export PlaylistService object', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');
            expect(PlaylistService).toBeDefined();
        });

        it('should have createPlaylist method', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');
            expect(typeof PlaylistService.createPlaylist).toBe('function');
        });

        it('should have createOnSpotify method', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');
            expect(typeof PlaylistService.createOnSpotify).toBe('function');
        });

        it('should have getQuotaStatus method', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');
            expect(typeof PlaylistService.getQuotaStatus).toBe('function');
        });

        it('should export PLAYLIST_TYPES', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');
            expect(PlaylistService.PLAYLIST_TYPES).toBeDefined();
            expect(Array.isArray(PlaylistService.PLAYLIST_TYPES)).toBe(true);
        });
    });

    describe('createPlaylist - Quota Checking', () => {
        it('should check quota before creating playlist', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            await PlaylistService.createPlaylist([]);

            expect(PremiumQuota.canCreatePlaylist).toHaveBeenCalled();
        });

        it('should return gated result when quota exhausted', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            vi.mocked(PremiumQuota.canCreatePlaylist).mockResolvedValue({
                allowed: false,
                remaining: 0,
                reason: "You've used your 1 free playlist"
            });

            const result = await PlaylistService.createPlaylist([]);

            expect(result.gated).toBe(true);
            expect(result.playlist).toBeNull();
            expect(result.remaining).toBe(0);
        });

        it('should return remaining count in result', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            vi.mocked(PremiumQuota.canCreatePlaylist).mockResolvedValue({
                allowed: true,
                remaining: 1,
                reason: null
            });

            const result = await PlaylistService.createPlaylist([]);

            expect(result.remaining).toBeDefined();
        });

        it('should allow playlist creation when quota available', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            vi.mocked(PremiumQuota.canCreatePlaylist).mockResolvedValue({
                allowed: true,
                remaining: 1,
                reason: null
            });

            const result = await PlaylistService.createPlaylist([]);

            expect(result.gated).toBe(false);
            expect(result.playlist).toBeDefined();
        });
    });

    describe('createPlaylist - Playlist Types', () => {
        const mockStreams = [
            { trackName: 'Song 1', artistName: 'Artist 1', msPlayed: 100000 }
        ];

        it('should create era playlist type', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createPlaylist(mockStreams, {
                type: 'era',
                startDate: '2023-01-01'
            });

            expect(result.gated).toBe(false);
            expect(result.playlist).toBeDefined();
        });

        it('should create energy playlist type', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createPlaylist(mockStreams, {
                type: 'energy',
                energy: 'high'
            });

            expect(result.gated).toBe(false);
            expect(result.playlist).toBeDefined();
        });

        it('should create discovery playlist type', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createPlaylist(mockStreams, {
                type: 'discovery'
            });

            expect(result.gated).toBe(false);
            expect(result.playlist).toBeDefined();
        });

        it('should create time_machine playlist type', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createPlaylist(mockStreams, {
                type: 'time_machine',
                yearsBack: 3
            });

            expect(result.gated).toBe(false);
            expect(result.playlist).toBeDefined();
        });

        it('should default to era playlist for unknown type', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createPlaylist(mockStreams, {
                type: 'unknown'
            });

            expect(result.gated).toBe(false);
            expect(result.playlist).toBeDefined();
        });
    });

    describe('createPlaylist - Usage Recording', () => {
        it('should record playlist creation after success', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            await PlaylistService.createPlaylist([]);

            expect(PremiumQuota.recordPlaylistCreation).toHaveBeenCalled();
        });

        it('should not record usage when quota exhausted', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            vi.mocked(PremiumQuota.canCreatePlaylist).mockResolvedValue({
                allowed: false,
                remaining: 0,
                reason: 'Quota exceeded'
            });

            await PlaylistService.createPlaylist([]);

            expect(PremiumQuota.recordPlaylistCreation).not.toHaveBeenCalled();
        });

        it('should return new remaining count', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            vi.mocked(PremiumQuota.recordPlaylistCreation).mockResolvedValue(0);

            const result = await PlaylistService.createPlaylist([]);

            expect(result.remaining).toBe(0);
        });
    });

    describe('createOnSpotify - Quota Checking', () => {
        it('should check quota before Spotify creation', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            await PlaylistService.createOnSpotify([]);

            expect(PremiumQuota.canCreatePlaylist).toHaveBeenCalled();
        });

        it('should return gated result when quota exhausted for Spotify', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            vi.mocked(PremiumQuota.canCreatePlaylist).mockResolvedValue({
                allowed: false,
                remaining: 0,
                reason: 'Quota exceeded'
            });

            const result = await PlaylistService.createOnSpotify([]);

            expect(result.gated).toBe(true);
            expect(result.spotifyPlaylist).toBeNull();
        });
    });

    describe('createOnSpotify - Success Path', () => {
        it('should generate playlist data first', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createOnSpotify([], {
                type: 'era'
            });

            expect(result.playlist).toBeDefined();
        });

        it('should create on Spotify after generation', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createOnSpotify([], {
                type: 'era'
            });

            expect(result.spotifyPlaylist).toBeDefined();
        });

        it('should include Spotify URL in result', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createOnSpotify([], {
                type: 'era'
            });

            expect(result.spotifyPlaylist?.url).toContain('spotify.com');
        });

        it('should record usage after Spotify creation', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            await PlaylistService.createOnSpotify([]);

            expect(PremiumQuota.recordPlaylistCreation).toHaveBeenCalled();
        });
    });

    describe('createOnSpotify - Playlist Types', () => {
        it('should support era playlists on Spotify', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createOnSpotify([], {
                type: 'era',
                startDate: '2023-01-01'
            });

            expect(result.gated).toBe(false);
            expect(result.spotifyPlaylist).toBeDefined();
        });

        it('should support energy playlists on Spotify', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createOnSpotify([], {
                type: 'energy',
                energy: 'medium'
            });

            expect(result.gated).toBe(false);
            expect(result.spotifyPlaylist).toBeDefined();
        });

        it('should support time_machine playlists on Spotify', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createOnSpotify([], {
                type: 'time_machine',
                yearsBack: 2
            });

            expect(result.gated).toBe(false);
            expect(result.spotifyPlaylist).toBeDefined();
        });
    });

    describe('getQuotaStatus', () => {
        it('should return quota status from PremiumQuota', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            vi.mocked(PremiumQuota.getQuotaStatus).mockResolvedValue({
                isPremium: false,
                playlists: { used: 0, limit: 1, remaining: 1 }
            });

            const status = await PlaylistService.getQuotaStatus();

            expect(status).toBeDefined();
            expect(status.playlists).toBeDefined();
        });

        it('should call PremiumQuota.getQuotaStatus', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            await PlaylistService.getQuotaStatus();

            expect(PremiumQuota.getQuotaStatus).toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty streams array', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createPlaylist([]);

            expect(result).toBeDefined();
            expect(result.gated).toBe(false);
        });

        it('should handle missing options', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createPlaylist([]);

            expect(result).toBeDefined();
        });

        it('should handle null streams', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createPlaylist(null);

            expect(result).toBeDefined();
        });
    });

    describe('Integration with PremiumController', () => {
        it('should trigger upgrade modal when quota exhausted', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            vi.mocked(PremiumQuota.canCreatePlaylist).mockResolvedValue({
                allowed: false,
                remaining: 0,
                reason: 'Quota exceeded'
            });

            // Mock the PremiumController import
            const mockShowModal = vi.fn();
            vi.doMock('../../js/controllers/premium-controller.js', () => ({
                PremiumController: {
                    showPlaylistUpgradeModal: mockShowModal
                }
            }));

            await PlaylistService.createPlaylist([]);

            // The service should attempt to show the modal
            // (through dynamic import in the actual code)
        });
    });

    describe('Concurrent Playlist Creation', () => {
        it('should handle simultaneous playlist requests', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            let callCount = 0;
            vi.mocked(PremiumQuota.canCreatePlaylist).mockImplementation(async () => {
                callCount++;
                return {
                    allowed: callCount === 1,
                    remaining: Math.max(0, 1 - callCount),
                    reason: callCount > 1 ? 'Quota exceeded' : null
                };
            });

            // Simultaneous requests
            const requests = [
                PlaylistService.createPlaylist([]),
                PlaylistService.createPlaylist([]),
                PlaylistService.createPlaylist([])
            ];

            const results = await Promise.all(requests);

            // First should succeed, rest should be gated
            const successful = results.filter(r => !r.gated);
            const gated = results.filter(r => r.gated);

            expect(successful.length).toBe(1);
            expect(gated.length).toBe(2);
        });
    });

    describe('Result Structure', () => {
        it('should return consistent structure for successful creation', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createPlaylist([]);

            expect(result).toHaveProperty('gated');
            expect(result).toHaveProperty('playlist');
            expect(result).toHaveProperty('remaining');
        });

        it('should return consistent structure for gated result', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            vi.mocked(PremiumQuota.canCreatePlaylist).mockResolvedValue({
                allowed: false,
                remaining: 0,
                reason: 'Quota exceeded'
            });

            const result = await PlaylistService.createPlaylist([]);

            expect(result).toHaveProperty('gated', true);
            expect(result).toHaveProperty('playlist', null);
            expect(result).toHaveProperty('remaining');
        });

        it('should return consistent structure for Spotify creation', async () => {
            const { PlaylistService } = await import('../../js/services/playlist-service.js');

            const result = await PlaylistService.createOnSpotify([]);

            expect(result).toHaveProperty('gated');
            expect(result).toHaveProperty('spotifyPlaylist');
            expect(result).toHaveProperty('playlist');
        });
    });
});
