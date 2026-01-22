/**
 * Centralized Timeout Configuration
 *
 * Single source of truth for all timeout, interval, and delay constants
 * across the application. This makes configuration changes easier and
 * prevents inconsistent values across modules.
 *
 * @module config/timeouts
 */

// ==========================================
// LLM Provider Timeouts
// ==========================================

export const LLM_TIMEOUTS = {
    // Cloud API timeouts
    CHAT_API_MS: 60000,           // 60 seconds for cloud API calls (OpenRouter, etc.)
    GEMINI_MS: 60000,             // 60 seconds for Gemini API
    OPENROUTER_MS: 60000,         // 60 seconds for OpenRouter API

    // Local LLM timeouts (longer due to local inference)
    LOCAL_LLM_MS: 90000,          // 90 seconds for local LLM providers
    LMSTUDIO_MS: 90000,           // 90 seconds for LM Studio
    OLLAMA_GENERATION_MS: 120000, // 2 minutes for Ollama generation
    OLLAMA_CONNECTION_MS: 5000,   // 5 seconds for Ollama connection

    // Function/tool execution
    FUNCTION_MS: 30000,           // 30 seconds for function execution
    TOOL_CALL_MS: 30000,          // 30 seconds for tool call handling

    // Model listing
    MODEL_LIST_MS: 10000,         // 10 seconds for model listing requests
};

// ==========================================
// Network & API Timeouts
// ==========================================

export const NETWORK_TIMEOUTS = {
    DEFAULT_MS: 30000,            // 30 seconds default for fetch requests
    HEALTH_CHECK_MS: 5000,        // 5 seconds for provider health checks
};

// ==========================================
// Worker & Coordination Timeouts
// ==========================================

export const WORKER_TIMEOUTS = {
    HEARTBEAT_INTERVAL_MS: 5000,      // 5 seconds between heartbeats
    RECONNECT_DELAY_MS: 1000,         // 1 second delay before reconnection
    MAX_RECONNECT_ATTEMPTS: 3,        // Maximum reconnection attempts
    STALE_WORKER_TIMEOUT_MS: 15000,   // 15 seconds before worker considered stale
    CLAIM_ACK_TIMEOUT_MS: 3000,       // 3 seconds to wait for leadership claim ACK
    STALE_CONNECTION_THRESHOLD_MS: 30000, // 30 seconds without heartbeat before cleanup
};

// ==========================================
// Operation & Lock Timeouts
// ==========================================

export const OPERATION_TIMEOUTS = {
    DEFAULT_LOCK_MS: 30000,       // 30 seconds default for operation locks
    DEADLOCK_DETECTION_MS: 30000, // 30 seconds for deadlock detection
    SPOT_LOCK_TIMEOUT_MS: 10000,  // 10 seconds for Spotify spot locks
};

// ==========================================
// Retry & Backoff Timeouts
// ==========================================

export const RETRY_TIMEOUTS = {
    BASE_DELAY_MS: 300,           // 300ms base delay for retries (tool calls)
    CONFIG_RETRY_MS: 500,         // 500ms base delay for config loading
    MAX_DELAY_MS: 10000,          // 10 seconds max delay per retry attempt
};

// ==========================================
// Storage Timeouts
// ==========================================

export const STORAGE_TIMEOUTS = {
    INDEXEDDB_REQUEST_MS: 5000,        // 5 seconds for IndexedDB requests
    QUOTA_UPDATE_INTERVAL_MS: 30000,   // 30 seconds between quota checks
    WAL_REPLAY_DELAY_MS: 1000,         // 1 second delay before WAL replay
    MIGRATION_CHECKPOINT_INTERVAL: 100, // Save checkpoint every 100 records
};

// ==========================================
// Coordination & Election Timeouts
// ==========================================

export const COORDINATION_TIMEOUTS = {
    CALIBRATION_MS: 5000,        // 5 seconds max wait for tab calibration
    HEARTBEAT_CHECK_INTERVAL_MS: 100, // 100ms between heartbeat checks during operations
    PROVIDER_BLACKLIST_MS: 300000,    // 5 minutes to blacklist failed provider
    PROVIDER_HEALTH_CHECK_MS: 60000,  // 60 seconds between provider health checks
    STORAGE_DEGRADATION_CHECK_MS: 30000, // 30 seconds between storage degradation checks
};

// ==========================================
// Observability Timeouts
// ==========================================

export const OBSERVABILITY_TIMEOUTS = {
    UPDATE_INTERVAL_MS: 5000,    // 5 seconds between performance updates
};

// ==========================================
// Circuit Breaker Timeouts
// ==========================================

export const CIRCUIT_BREAKER_TIMEOUTS = {
    FUNCTION_MS: 5000,           // 5 seconds timeout for circuit breaker function calls
};

// ==========================================
// Pattern Worker Timeouts
// ==========================================

export const PATTERN_TIMEOUTS = {
    MIN_PAUSE_INTERVAL_MS: 5000,  // At least 5 seconds between pauses
};

// ==========================================
// Consolidated Export (Default)
// ==========================================

const Timeouts = {
    LLM: LLM_TIMEOUTS,
    NETWORK: NETWORK_TIMEOUTS,
    WORKER: WORKER_TIMEOUTS,
    OPERATION: OPERATION_TIMEOUTS,
    RETRY: RETRY_TIMEOUTS,
    STORAGE: STORAGE_TIMEOUTS,
    COORDINATION: COORDINATION_TIMEOUTS,
    OBSERVABILITY: OBSERVABILITY_TIMEOUTS,
    CIRCUIT_BREAKER: CIRCUIT_BREAKER_TIMEOUTS,
    PATTERN: PATTERN_TIMEOUTS,
};

export default Timeouts;

console.log('[TimeoutConfig] Centralized timeout configuration loaded');
