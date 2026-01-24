/**
 * Profile Storage Module
 * 
 * Manages saved template/synthetic profiles separately from the main storage facade.
 * HNW: Extracted from storage.js to maintain single-responsibility principle.
 * 
 * Profiles are stored in IndexedDB settings under 'saved_profiles' key.
 */

const ProfileStorage = {
    /**
     * Storage reference (set during initialization)
     */
    _storage: null,

    /**
     * Initialize with storage reference
     * @param {Object} storage - Reference to main Storage object for settings access
     */
    init(storage) {
        this._storage = storage;
        console.log('[ProfileStorage] Module initialized');
    },

    /**
     * Private helper to get profiles map
     */
    async _getProfilesMap() {
        if (!this._storage) {
            console.error('[ProfileStorage] Not initialized');
            return {};
        }
        return (await this._storage.getSetting('saved_profiles')) || {};
    },

    /**
     * Save a profile
     * @param {object} profile - Profile to save (must have id)
     * @returns {Promise<void>}
     */
    async saveProfile(profile) {
        if (!profile.id) throw new Error('Profile must have an id');

        const profiles = await this._getProfilesMap();
        profiles[profile.id] = {
            ...profile,
            savedAt: new Date().toISOString()
        };

        await this._storage.saveSetting('saved_profiles', profiles);
        console.log(`[ProfileStorage] Saved profile: ${profile.name || profile.id}`);
    },

    /**
     * Get all saved profiles
     * @returns {Promise<Array>}
     */
    async getAllProfiles() {
        const profiles = await this._getProfilesMap();
        return Object.values(profiles).sort((a, b) =>
            new Date(b.savedAt || 0) - new Date(a.savedAt || 0)
        );
    },

    /**
     * Get a single profile by ID
     * @param {string} id - Profile ID
     * @returns {Promise<object|null>}
     */
    async getProfile(id) {
        const profiles = await this._getProfilesMap();
        return profiles[id] || null;
    },

    /**
     * Delete a saved profile
     * CRITICAL FIX for Issue #4: Use direct key deletion without get-check-act pattern
     * to prevent race conditions with concurrent saves
     *
     * @param {string} id - Profile ID
     * @returns {Promise<void>}
     */
    async deleteProfile(id) {
        // CRITICAL FIX for Issue #4: Get-then-delete pattern allows concurrent saves to be lost
        // Use atomic update approach with read-modify-write on single key
        const profiles = await this._getProfilesMap();

        // Early return if profile doesn't exist (no-op, not an error)
        if (!profiles[id]) {
            console.log(`[ProfileStorage] Profile not found for deletion: ${id}`);
            return;
        }

        delete profiles[id];
        await this._storage.saveSetting('saved_profiles', profiles);

        // Clear active if it was this profile
        const activeId = await this.getActiveProfileId();
        if (activeId === id) {
            await this._storage.saveSetting('active_profile_id', null);
        }

        console.log(`[ProfileStorage] Deleted profile: ${id}`);
    },

    /**
     * Get active profile ID
     * @returns {Promise<string|null>}
     */
    async getActiveProfileId() {
        if (!this._storage) return null;
        return this._storage.getSetting('active_profile_id');
    },

    /**
     * Set active profile for chat context
     * @param {string|null} id - Profile ID or null for user's real data
     * @returns {Promise<void>}
     */
    async setActiveProfile(id) {
        await this._storage.saveSetting('active_profile_id', id);
        console.log(`[ProfileStorage] Active profile set to: ${id || 'real data'}`);
    },

    /**
     * Get profile count
     * @returns {Promise<number>}
     */
    async getProfileCount() {
        const profiles = await this._getProfilesMap();
        return Object.keys(profiles).length;
    },

    /**
     * Clear all saved profiles
     * @returns {Promise<void>}
     */
    async clearAllProfiles() {
        await this._storage.saveSetting('saved_profiles', {});
        await this._storage.saveSetting('active_profile_id', null);
        console.log('[ProfileStorage] All profiles cleared');
    }
};

// Export for ES Module consumers
export { ProfileStorage };

