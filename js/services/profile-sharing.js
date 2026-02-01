/**
 * Profile Sharing Service
 *
 * Handles encrypted export/import of music listening profiles for collaborative analysis.
 * Uses AES-GCM encryption with a user-provided passphrase for privacy.
 *
 * Privacy Model:
 * 1. User exports their profile with a passphrase
 * 2. Profile is encrypted client-side using AES-256-GCM
 * 3. Encrypted JSON can be shared via any channel (email, message, etc.)
 * 4. Recipient imports and decrypts with the same passphrase
 * 5. No server involved - fully client-side E2EE
 *
 * HNW Considerations:
 * - Hierarchy: Clear authority over own profile data
 * - Network: Decoupled from storage layer, uses DataProvider
 * - Wave: Async encryption/decryption with progress
 *
 * @module services/profile-sharing
 */

import { EventBus } from './event-bus.js';
import { DataProvider } from '../providers/data-provider-interface.js';
import { Storage } from '../storage.js';

// ==========================================
// Constants
// ==========================================

const PROFILE_VERSION = '1.0.0';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_ITERATIONS = 210000; // Strong protection while maintaining UX

// ==========================================
// Encryption Utilities
// ==========================================

/**
 * Derive an encryption key from a passphrase
 * @param {string} passphrase - User-provided passphrase
 * @param {Uint8Array} salt - Random salt
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(passphrase, salt) {
    const encoder = new TextEncoder();
    const passphraseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: KEY_ITERATIONS,
            hash: 'SHA-256',
        },
        passphraseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt data with AES-GCM
 * @param {Object} data - Data to encrypt
 * @param {string} passphrase - Passphrase for encryption
 * @returns {Promise<string>} Base64-encoded encrypted data
 */
async function encryptProfile(data, passphrase) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const key = await deriveKey(passphrase, salt);
    const plaintext = encoder.encode(JSON.stringify(data));

    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    // Combine salt + iv + ciphertext
    const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, SALT_LENGTH);
    combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

    // Encode as base64 in chunks to avoid stack overflow on large payloads
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < combined.length; i += chunkSize) {
        const chunk = combined.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
}

/**
 * Decrypt profile data
 * @param {string} encryptedBase64 - Base64-encoded encrypted data
 * @param {string} passphrase - Passphrase for decryption
 * @returns {Promise<Object>} Decrypted profile data
 */
async function decryptProfile(encryptedBase64, passphrase) {
    const decoder = new TextDecoder();

    // Decode base64
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

    // Extract salt, iv, ciphertext
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(passphrase, salt);

    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

    return JSON.parse(decoder.decode(plaintext));
}

// ==========================================
// Profile Export
// ==========================================

/**
 * Export current user's profile for sharing
 * @param {string} passphrase - Passphrase for encryption
 * @param {Object} [options] - Export options
 * @param {boolean} [options.includeStreams=false] - Include raw streams (large)
 * @param {string} [options.displayName] - Display name for the profile
 * @returns {Promise<{encrypted: string, metadata: Object}>}
 */
async function exportProfile(passphrase, options = {}) {
    const { includeStreams = false, displayName = 'Anonymous' } = options;

    if (!passphrase || passphrase.length < 6) {
        throw new Error('Passphrase must be at least 6 characters');
    }

    // Get data from DataProvider or Storage
    // Check if modules are actually usable before calling methods
    const dataProviderAvailable =
        DataProvider &&
        typeof DataProvider.getPersonality === 'function' &&
        typeof DataProvider.getPatterns === 'function' &&
        typeof DataProvider.getSummary === 'function' &&
        typeof DataProvider.getStreams === 'function' &&
        typeof DataProvider.getStreamCount === 'function';

    const storageAvailable =
        Storage &&
        typeof Storage.getPersonality === 'function' &&
        typeof Storage.getStreams === 'function';

    const personality = dataProviderAvailable
        ? await DataProvider.getPersonality()
        : storageAvailable
            ? await Storage.getPersonality()
            : null;

    const patterns = dataProviderAvailable
        ? await DataProvider.getPatterns()
        : personality?.patterns;

    const summary = dataProviderAvailable ? await DataProvider.getSummary() : personality?.summary;

    let streams = null;
    if (includeStreams) {
        streams = dataProviderAvailable
            ? await DataProvider.getStreams()
            : storageAvailable
                ? await Storage.getStreams()
                : null;
    }

    const streamCount =
        streams?.length ?? (dataProviderAvailable ? await DataProvider.getStreamCount() : 0);

    // Build profile object
    const profile = {
        version: PROFILE_VERSION,
        exportedAt: new Date().toISOString(),
        displayName,
        personality: personality
            ? {
                type: personality.type,
                name: personality.name,
                emoji: personality.emoji,
                tagline: personality.tagline,
                traits: personality.traits,
            }
            : null,
        patterns,
        summary,
        streamCount,
        streams: includeStreams ? streams : null,
    };

    // Encrypt
    const encrypted = await encryptProfile(profile, passphrase);

    // Metadata (unencrypted, for display before decryption)
    const metadata = {
        displayName,
        exportedAt: profile.exportedAt,
        personalityType: personality?.name || 'Unknown',
        streamCount,
        version: PROFILE_VERSION,
        encrypted: true,
    };

    EventBus.emit('data:profile_exported', { displayName, streamCount });

    return { encrypted, metadata };
}

/**
 * Import a shared profile
 * @param {string} encryptedData - Encrypted profile data
 * @param {string} passphrase - Passphrase for decryption
 * @returns {Promise<Object>} Decrypted profile
 */
async function importProfile(encryptedData, passphrase) {
    if (!encryptedData || !passphrase) {
        throw new Error('Encrypted data and passphrase required');
    }

    try {
        const profile = await decryptProfile(encryptedData, passphrase);

        // Validate profile structure
        if (!profile.version || !profile.exportedAt) {
            throw new Error('Invalid profile format');
        }

        EventBus.emit('data:profile_imported', {
            displayName: profile.displayName,
            personalityType: profile.personality?.name,
        });

        return profile;
    } catch (error) {
        if (error.name === 'OperationError') {
            throw new Error('Invalid passphrase or corrupted data');
        }
        throw error;
    }
}

// ==========================================
// Profile Storage (for loaded friend profiles)
// ==========================================

/** @type {Map<string, Object>} */
const loadedProfiles = new Map();

/**
 * Store an imported profile for comparison
 * @param {string} id - Profile ID
 * @param {Object} profile - Profile data
 */
function storeProfile(id, profile) {
    loadedProfiles.set(id, {
        ...profile,
        loadedAt: new Date().toISOString(),
    });
}

/**
 * Get a stored profile
 * @param {string} id - Profile ID
 * @returns {Object|null}
 */
function getStoredProfile(id) {
    return loadedProfiles.get(id) || null;
}

/**
 * Get all stored profiles
 * @returns {Object[]}
 */
function getAllStoredProfiles() {
    return Array.from(loadedProfiles.values());
}

/**
 * Remove a stored profile
 * @param {string} id - Profile ID
 */
function removeStoredProfile(id) {
    loadedProfiles.delete(id);
}

/**
 * Clear all stored profiles
 */
function clearAllProfiles() {
    loadedProfiles.clear();
}

// ==========================================
// Public API
// ==========================================

export const ProfileSharing = {
    // Export/Import
    exportProfile,
    importProfile,

    // Profile Storage
    storeProfile,
    getStoredProfile,
    getAllStoredProfiles,
    removeStoredProfile,
    clearAllProfiles,

    // Constants
    VERSION: PROFILE_VERSION,
};

console.log('[ProfileSharing] Profile sharing service loaded with E2E encryption');
