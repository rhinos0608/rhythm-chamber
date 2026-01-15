/**
 * Ollama Provider Adapter
 * 
 * Thin adapter that wraps the existing Ollama module to conform
 * to the unified provider interface.
 * 
 * The actual Ollama implementation is in js/ollama.js
 * This adapter just provides the consistent `call()` interface.
 * 
 * @module providers/ollama-adapter
 */

import { ModuleRegistry } from '../module-registry.js';

// ==========================================
// Provider Adapter
// ==========================================

/**
 * Call Ollama using the unified interface
 * @param {object} config - Provider config
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Function calling tools (optional)
 * @param {function} onProgress - Progress callback for streaming (optional)
 * @returns {Promise<object>} OpenAI-compatible response
 */
async function call(config, messages, tools, onProgress = null) {
    const Ollama = ModuleRegistry.getModuleSync('Ollama');
    if (!Ollama) {
        throw new Error('Ollama module not loaded. Ensure ollama.js is included before this adapter.');
    }

    // Check if Ollama is available
    const available = await Ollama.isAvailable();
    if (!available) {
        throw new Error('Ollama server not running. Start with: ollama serve');
    }

    // Use streaming if onProgress callback provided
    const useStreaming = typeof onProgress === 'function';

    // Delegate to the main Ollama module's chatCompletion
    return await Ollama.chatCompletion(messages, {
        ...config,
        stream: useStreaming,
        onToken: useStreaming ? (token, thinking) => {
            onProgress({ type: 'token', token, thinking });
        } : null
    }, tools);
}

// ==========================================
// Delegation to Main Ollama Module
// ==========================================

/**
 * Get the underlying Ollama module
 * @returns {object|null} Ollama module
 */
function getOllamaModule() {
    return ModuleRegistry.getModuleSync('Ollama') || null;
}

/**
 * Check if Ollama is available (delegates to main module)
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
    const Ollama = ModuleRegistry.getModuleSync('Ollama');
    if (!Ollama) return false;
    return Ollama.isAvailable();
}

/**
 * Detect Ollama server (delegates to main module)
 * @returns {Promise<object>}
 */
async function detectServer() {
    const Ollama = ModuleRegistry.getModuleSync('Ollama');
    if (!Ollama) {
        return { available: false, error: 'Ollama module not loaded' };
    }
    return Ollama.detectServer();
}

/**
 * List models (delegates to main module)
 * @returns {Promise<Array>}
 */
async function listModels() {
    const Ollama = ModuleRegistry.getModuleSync('Ollama');
    if (!Ollama) {
        throw new Error('Ollama module not loaded');
    }
    return Ollama.listModels();
}

/**
 * Get recommended models (delegates to main module)
 * @returns {Promise<Array>}
 */
async function getRecommendedModels() {
    const Ollama = ModuleRegistry.getModuleSync('Ollama');
    if (!Ollama) {
        throw new Error('Ollama module not loaded');
    }
    return Ollama.getRecommendedModels();
}

/**
 * Check if model supports tool calling (delegates to main module)
 * @param {string} modelName - Model name
 * @returns {boolean}
 */
function supportsToolCalling(modelName) {
    const Ollama = ModuleRegistry.getModuleSync('Ollama');
    if (!Ollama) return false;
    return Ollama.supportsToolCalling(modelName);
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const OllamaProvider = {
    // Core API (matches interface)
    call,

    // Server detection
    detectServer,
    isAvailable,
    listModels,

    // Ollama-specific
    getRecommendedModels,
    supportsToolCalling,
    getOllamaModule,

    // Provider info
    name: 'ollama',
    displayName: 'Ollama',
    type: 'local'
};

// ES Module export - use ModuleRegistry for access instead of window globals
console.log('[OllamaProvider] Provider adapter loaded');

