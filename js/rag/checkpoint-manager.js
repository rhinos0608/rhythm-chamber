/**
 * RAG Checkpoint Manager
 *
 * Handles checkpoint creation, persistence, and recovery for RAG operations.
 * Provides secure checkpoint storage with encryption support and rollback capabilities.
 *
 * SECURITY FEATURES:
 * - Checkpoints encrypted with session-derived keys
 * - Unified storage with localStorage fallback
 * - Automatic cleanup on completion
 *
 * @module RAG/CheckpointManager
 */

import { Storage } from '../storage.js';
import { Crypto } from '../security/crypto.js';

/**
 * Checkpoint Manager for RAG operations
 * Manages state persistence, recovery, and rollback
 */
export class RAGCheckpointManager {
    constructor() {
        this.storage = Storage;
        this.crypto = Crypto;
    }

    /**
     * Get checkpoint for resume
     * Decrypts dataHash if encrypted. Uses unified storage with fallback.
     *
     * @returns {Promise<Object|null>} Checkpoint data or null if not found
     */
    async getCheckpoint() {
        try {
            // Try unified storage first (IndexedDB)
            if (this.storage.getConfig) {
                const cipher = await this.storage.getConfig(RAG_CHECKPOINT_CIPHER_KEY);
                if (cipher && this.crypto.decryptData) {
                    try {
                        const sessionKey = await this.crypto.getSessionKey();
                        const decrypted = await this.crypto.decryptData(cipher, sessionKey);
                        if (decrypted) {
                            return JSON.parse(decrypted);
                        }
                    } catch (decryptErr) {
                        console.warn('[RAG] Checkpoint decryption failed (session changed?)');
                    }
                }

                // Check for unencrypted checkpoint in unified storage
                const plainCheckpoint = await this.storage.getConfig(RAG_CHECKPOINT_KEY);
                if (plainCheckpoint) {
                    return plainCheckpoint;
                }
            }

            // Fallback to localStorage
            const cipher = localStorage.getItem(RAG_CHECKPOINT_CIPHER_KEY);
            if (cipher && this.crypto.decryptData) {
                try {
                    const sessionKey = await this.crypto.getSessionKey();
                    const decrypted = await this.crypto.decryptData(cipher, sessionKey);
                    if (decrypted) {
                        return JSON.parse(decrypted);
                    }
                } catch (decryptErr) {
                    console.warn('[RAG] Checkpoint decryption failed (session changed?)');
                }
            }

            // Fallback to legacy unencrypted checkpoint in localStorage
            const stored = localStorage.getItem(RAG_CHECKPOINT_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            console.error('[RAG] Failed to get checkpoint:', e);
            return null;
        }
    }

    /**
     * Save checkpoint for resume
     * Encrypts with session key for security. Uses unified storage with fallback.
     *
     * @param {Object} data - Checkpoint data to save
     * @returns {Promise<void>}
     */
    async saveCheckpoint(data) {
        const checkpoint = {
            ...data,
            timestamp: Date.now()
        };

        // Try to encrypt checkpoint
        if (this.crypto.encryptData && this.crypto.getSessionKey) {
            try {
                const sessionKey = await this.crypto.getSessionKey();
                const encrypted = await this.crypto.encryptData(
                    JSON.stringify(checkpoint),
                    sessionKey
                );

                // Save to unified storage (IndexedDB)
                if (this.storage.setConfig) {
                    await this.storage.setConfig(RAG_CHECKPOINT_CIPHER_KEY, encrypted);
                    await this.storage.removeConfig(RAG_CHECKPOINT_KEY);
                }
                // Also save to localStorage as fallback
                localStorage.setItem(RAG_CHECKPOINT_CIPHER_KEY, encrypted);
                localStorage.removeItem(RAG_CHECKPOINT_KEY);
                return;
            } catch (encryptErr) {
                console.warn('[RAG] Checkpoint encryption failed, using plaintext fallback');
            }
        }

        // Fallback to unencrypted (if Security module not loaded)
        if (this.storage.setConfig) {
            await this.storage.setConfig(RAG_CHECKPOINT_KEY, checkpoint);
        }
        localStorage.setItem(RAG_CHECKPOINT_KEY, JSON.stringify(checkpoint));
    }

    /**
     * Clear checkpoint after completion
     * Clears from both unified storage and localStorage
     *
     * @returns {Promise<void>}
     */
    async clearCheckpoint() {
        // Clear from unified storage
        if (this.storage.removeConfig) {
            try {
                await this.storage.removeConfig(RAG_CHECKPOINT_KEY);
                await this.storage.removeConfig(RAG_CHECKPOINT_CIPHER_KEY);
            } catch (e) {
                console.warn('[RAG] Failed to clear checkpoint from unified storage:', e);
            }
        }
        // Also clear from localStorage
        localStorage.removeItem(RAG_CHECKPOINT_KEY);
        localStorage.removeItem(RAG_CHECKPOINT_CIPHER_KEY);
    }

    /**
     * Create checkpoint with specified ID
     *
     * @param {string} id - Checkpoint identifier
     * @param {Object} state - RAG state to save
     * @returns {Promise<Object>} Created checkpoint
     */
    async createCheckpoint(id, state) {
        const checkpoint = {
            id,
            state,
            timestamp: Date.now(),
            version: 1
        };

        await this.saveCheckpoint(checkpoint);
        return checkpoint;
    }

    /**
     * Restore from checkpoint by ID
     *
     * @param {string} id - Checkpoint ID to restore
     * @returns {Promise<Object>} Restored state
     * @throws {Error} If checkpoint not found
     */
    async restoreCheckpoint(id) {
        const checkpoint = await this.getCheckpoint();

        if (!checkpoint) {
            throw new Error(`Checkpoint ${id} not found`);
        }

        if (checkpoint.id !== id) {
            throw new Error(`Checkpoint ID mismatch: expected ${id}, got ${checkpoint.id}`);
        }

        return checkpoint.state;
    }

    /**
     * Rollback to checkpoint state
     *
     * @param {string} id - Checkpoint ID to rollback to
     * @returns {Promise<Object>} Rollback state
     * @throws {Error} If checkpoint not found or rollback fails
     */
    async rollback(id) {
        const state = await this.restoreCheckpoint(id);

        // Apply rollback logic - restore previous state
        // This is a semantic rollback - the caller decides what to do with the state
        return state;
    }

    /**
     * Check if checkpoint exists
     *
     * @returns {Promise<boolean>} True if checkpoint exists
     */
    async hasCheckpoint() {
        const checkpoint = await this.getCheckpoint();
        return checkpoint !== null;
    }

    /**
     * Get checkpoint age in milliseconds
     *
     * @returns {Promise<number|null>} Age in milliseconds or null if no checkpoint
     */
    async getCheckpointAge() {
        const checkpoint = await this.getCheckpoint();

        if (!checkpoint || !checkpoint.timestamp) {
            return null;
        }

        return Date.now() - checkpoint.timestamp;
    }

    /**
     * Validate checkpoint integrity
     * Checks if checkpoint has required fields and valid structure
     *
     * @param {Object} checkpoint - Checkpoint to validate
     * @returns {boolean} True if checkpoint is valid
     */
    validateCheckpoint(checkpoint) {
        if (!checkpoint || typeof checkpoint !== 'object') {
            return false;
        }

        // Check for timestamp
        if (!checkpoint.timestamp || typeof checkpoint.timestamp !== 'number') {
            return false;
        }

        // Check for version (optional but recommended)
        if (checkpoint.version !== undefined && typeof checkpoint.version !== 'number') {
            return false;
        }

        return true;
    }

    /**
     * Get checkpoint metadata without loading full state
     *
     * @returns {Promise<Object|null>} Checkpoint metadata
     */
    async getCheckpointMetadata() {
        const checkpoint = await this.getCheckpoint();

        if (!checkpoint) {
            return null;
        }

        return {
            id: checkpoint.id,
            timestamp: checkpoint.timestamp,
            version: checkpoint.version,
            hasState: !!checkpoint.state
        };
    }

    /**
     * List all available checkpoints
     * Returns array of checkpoint metadata (not full state)
     *
     * @returns {Promise<Array<Object>>} Array of checkpoint info
     */
    async listCheckpoints() {
        try {
            // Try to get checkpoint manifest from storage
            const MANIFEST_KEY = 'rhythm_chamber_rag_checkpoint_manifest';

            let manifest = null;
            if (this.storage.getConfig) {
                manifest = await this.storage.getConfig(MANIFEST_KEY);
            }

            if (!manifest) {
                const stored = localStorage.getItem(MANIFEST_KEY);
                manifest = stored ? JSON.parse(stored) : null;
            }

            if (!manifest || !Array.isArray(manifest.checkpoints)) {
                // Fallback: return current checkpoint if exists
                const current = await this.getCheckpointMetadata();
                return current ? [current] : [];
            }

            return manifest.checkpoints;
        } catch (e) {
            console.error('[RAG] Failed to list checkpoints:', e);
            return [];
        }
    }

    /**
     * Delete checkpoint by ID
     * Removes checkpoint from storage and updates manifest
     *
     * @param {string} id - Checkpoint ID to delete
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async deleteCheckpoint(id) {
        try {
            const MANIFEST_KEY = 'rhythm_chamber_rag_checkpoint_manifest';

            // Get current manifest
            let manifest = null;
            if (this.storage.getConfig) {
                manifest = await this.storage.getConfig(MANIFEST_KEY);
            }

            if (!manifest) {
                const stored = localStorage.getItem(MANIFEST_KEY);
                manifest = stored ? JSON.parse(stored) : { checkpoints: [] };
            }

            // Find and remove checkpoint from manifest
            const checkpoints = manifest.checkpoints || [];
            const index = checkpoints.findIndex(cp => cp.id === id);

            if (index === -1) {
                return false; // Checkpoint not found
            }

            checkpoints.splice(index, 1);
            manifest.checkpoints = checkpoints;
            manifest.updatedAt = Date.now();

            // Save updated manifest
            if (this.storage.setConfig) {
                await this.storage.setConfig(MANIFEST_KEY, manifest);
            }
            localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));

            // If deleting current checkpoint, clear it
            const current = await this.getCheckpoint();
            if (current && current.id === id) {
                await this.clearCheckpoint();
            }

            return true;
        } catch (e) {
            console.error('[RAG] Failed to delete checkpoint:', e);
            return false;
        }
    }

    /**
     * Recover from last known good state
     * Finds and loads the most recent valid checkpoint
     *
     * @returns {Promise<Object|null>} Recovered state or null if no valid checkpoint
     */
    async recover() {
        try {
            // List all checkpoints
            const checkpoints = await this.listCheckpoints();

            if (checkpoints.length === 0) {
                console.log('[RAG] No checkpoints found for recovery');
                return null;
            }

            // Sort by timestamp (most recent first)
            const sorted = checkpoints.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            // Try to load most recent checkpoint
            for (const checkpointInfo of sorted) {
                try {
                    const state = await this.restoreCheckpoint(checkpointInfo.id);
                    console.log(`[RAG] Recovered from checkpoint: ${checkpointInfo.id}`);
                    return state;
                } catch (err) {
                    console.warn(`[RAG] Failed to load checkpoint ${checkpointInfo.id}:`, err);
                    // Try next checkpoint
                    continue;
                }
            }

            console.log('[RAG] No valid checkpoints found for recovery');
            return null;
        } catch (e) {
            console.error('[RAG] Recovery failed:', e);
            return null;
        }
    }
}

// Storage keys (kept for backwards compatibility)
const RAG_CHECKPOINT_KEY = 'rhythm_chamber_rag_checkpoint';
const RAG_CHECKPOINT_CIPHER_KEY = 'rhythm_chamber_rag_checkpoint_cipher';

// Export singleton instance
export const ragCheckpointManager = new RAGCheckpointManager();
