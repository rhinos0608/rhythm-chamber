/**
 * Provider Interface Configuration
 *
 * Timeout and retry configuration for provider requests.
 * Part of the refactored ProviderInterface module.
 *
 * @module providers/interface/config
 */

// ==========================================
// Timeout Constants
// ==========================================

export const PROVIDER_TIMEOUTS = {
    cloud: 60000,    // 60s for cloud APIs (OpenRouter, Gemini, OpenAI-Compatible)
    local: 90000     // 90s for local LLMs (Ollama, LM Studio)
};

// ==========================================
// Retry Configuration
// ==========================================

export const RETRY_CONFIG = {
    MAX_RETRIES: 3,           // Maximum number of retry attempts
    BASE_DELAY_MS: 1000,      // Base delay for exponential backoff (1s)
    MAX_DELAY_MS: 10000,      // Maximum delay between retries (10s)
    JITTER_MS: 100            // Random jitter to avoid thundering herd
};

// ==========================================
// Health Check Configuration
// ==========================================

export const HEALTH_CHECK_TIMEOUT = 5000; // 5s timeout for health checks
