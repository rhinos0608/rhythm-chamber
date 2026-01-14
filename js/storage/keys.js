/**
 * Centralized Storage Keys
 * 
 * Single source of truth for all localStorage and IndexedDB key constants.
 * Import this module to avoid scattered magic strings across the codebase.
 * 
 * @module storage/keys
 */

const STORAGE_KEYS = {
    // ==========================================
    // RAG Module Keys
    // ==========================================
    RAG_CONFIG: 'rhythm_chamber_rag',
    RAG_CREDENTIAL: 'qdrant_credentials',
    RAG_CHECKPOINT: 'rhythm_chamber_rag_checkpoint',
    RAG_CHECKPOINT_CIPHER: 'rhythm_chamber_rag_checkpoint_cipher',
    RAG_EMBEDDING_MANIFEST: 'rhythm_chamber_embedding_manifest',

    // ==========================================
    // Session Keys
    // ==========================================
    SESSION_ID: 'rhythm_chamber_session_id',
    CONVERSATION: 'rhythm_chamber_conversation',
    EMERGENCY_BACKUP: 'rhythm_chamber_emergency_backup',
    PERSISTENCE_CONSENT: 'rhythm_chamber_persistence_consent',

    // ==========================================
    // Spotify OAuth Keys
    // ==========================================
    SPOTIFY_ACCESS_TOKEN: 'spotify_access_token',
    SPOTIFY_REFRESH_TOKEN: 'spotify_refresh_token',
    SPOTIFY_TOKEN_EXPIRY: 'spotify_token_expiry',
    SPOTIFY_CODE_VERIFIER: 'spotify_code_verifier',
    SPOTIFY_USER_PROFILE: 'spotify_user_profile',
    SPOTIFY_TOKEN_BINDING: 'spotify_token_binding',

    // ==========================================
    // UI State Keys
    // ==========================================
    SIDEBAR_COLLAPSED: 'rhythm_chamber_sidebar_collapsed',
    ACTIVE_SESSION_ID: 'rhythm_chamber_active_session_id',

    // ==========================================
    // Security Keys
    // ==========================================
    SECURITY_FAILED_ATTEMPTS: 'rhythm_chamber_security_failed_attempts',
    SECURITY_GEO_LOG: 'rhythm_chamber_security_geo_log',
    SECURITY_TRAVEL_OVERRIDE: 'rhythm_chamber_security_travel_override',

    // ==========================================
    // Migration Keys
    // ==========================================
    MIGRATION_COMPLETED: 'rhythm_chamber_migration_completed',
    MIGRATION_VERSION: 'rhythm_chamber_migration_version'
};

// Freeze to prevent accidental modification
Object.freeze(STORAGE_KEYS);

// Export for ES Module consumers
export { STORAGE_KEYS };

// Keep window global for backwards compatibility during migration
if (typeof window !== 'undefined') {
    window.STORAGE_KEYS = STORAGE_KEYS;
}

console.log('[Storage Keys] Centralized storage key constants loaded');

