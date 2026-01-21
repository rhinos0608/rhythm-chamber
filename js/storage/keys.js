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
    // Storage Degradation Manager Keys
    // ==========================================
    PERSONALITY_RESULT: 'rhythm_chamber_personality_result',
    USER_SETTINGS: 'rhythm_chamber_user_settings',
    EMBEDDING_CACHE: 'rhythm_chamber_embedding_cache',
    CHAT_SESSIONS: 'rhythm_chamber_chat_sessions',
    AGGREGATED_CHUNKS: 'rhythm_chamber_aggregated_chunks',
    RAW_STREAMS: 'rhythm_chamber_raw_streams',

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
    MIGRATION_VERSION: 'rhythm_chamber_migration_version',

    // ==========================================
    // SecureTokenStore Keys
    // ==========================================
    SECURE_TOKEN_BINDING: 'rhythm_chamber_secure_binding',
    SECURE_TOKEN_AUDIT: 'rhythm_chamber_token_audit',
    SECURE_TOKEN_SALT: 'rhythm_chamber_token_salt'
};

// Freeze to prevent accidental modification
Object.freeze(STORAGE_KEYS);

// Export for ES Module consumers
export { STORAGE_KEYS };

console.log('[Storage Keys] Centralized storage key constants loaded');

