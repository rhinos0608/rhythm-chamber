/**
 * Dependency Graph
 *
 * Defines module dependency layers and initialization order.
 * Enables lazy loading and topological sorting for bootstrap.
 *
 * HNW Pattern: Hierarchical Initialization
 * - Layer 0: Critical infrastructure (security, storage, state)
 * - Layer 1: Core services (event bus, coordination, providers)
 * - Layer 2: Business logic (chat, patterns, analysis)
 * - Layer 3: Controllers (UI layer, depends on all lower layers)
 *
 * @module bootstrap/dependency-graph
 */

'use strict';

// ==========================================
// Dependency Layers
// ==========================================

/**
 * Module dependency graph organized by initialization layer
 * Lower numbers = earlier initialization (fewer dependencies)
 */
const DEPENDENCY_LAYERS = {
    // Layer 0: Critical Infrastructure (no dependencies)
    // These modules MUST be loaded synchronously at startup
    LAYER_0_CRITICAL: [
        './utils/logger.js',
        './security/crypto.js',
        './services/config-loader.js',
        './utils.js',
        './module-registry.js',
        './storage/keys.js',
        './storage/indexeddb.js',
        './storage/config-api.js',
        './storage/migration.js',
        './storage/sync-strategy.js',
        './storage/profiles.js',
        './storage.js',
        './state/app-state.js',
        './operation-lock.js',
    ],

    // Layer 1: Core Services (depend only on Layer 0)
    // Can be lazy-loaded after critical infrastructure is ready
    LAYER_1_SERVICES: [
        './services/event-bus.js',
        './services/tab-coordination.js',
        './services/session-manager.js',
        './services/worker-coordinator.js',
        './storage/event-log-store.js',
        './services/wave-telemetry.js',
        './storage/quota-monitor.js',
        './services/circuit-breaker.js',
        './security/secure-token-store.js',
        './services/error-boundary.js',
    ],

    // Layer 2: Data Processing (depend on Layer 0-1)
    // Can be loaded on-demand when user interacts with features
    LAYER_2_PROCESSING: [
        './patterns.js',
        './personality.js',
        './data-query.js',
        './parser.js',
        './genre-enrichment.js',
        './token-counter.js',
        './providers/provider-interface.js',
        './providers/openrouter.js',
        './providers/lmstudio.js',
        './providers/gemini.js',
    ],

    // Layer 3: Business Logic (depend on Layer 0-2)
    // Loaded when specific features are used
    LAYER_3_BUSINESS_LOGIC: [
        './chat.js',
        './services/conversation-orchestrator.js',
        './services/message-operations.js',
        './services/message-lifecycle-coordinator.js',
        './cards.js',
        './functions/utils/retry.js',
        './functions/utils/validation.js',
        './functions/schemas/data-queries.js',
        './functions/schemas/template-queries.js',
        './functions/schemas/analytics-queries.js',
        './functions/executors/data-executors.js',
        './functions/executors/template-executors.js',
        './functions/executors/analytics-executors.js',
        './functions/index.js',
        './services/data-version.js',
        './services/function-calling-fallback.js',
        './services/profile-description-generator.js',
        './services/llm-provider-routing-service.js',
        './services/token-counting-service.js',
        './services/tool-call-handling-service.js',
        './services/fallback-response-service.js',
    ],

    // Layer 4: Controllers (UI layer, depend on all lower layers)
    // Only loaded when UI is actually rendered
    LAYER_4_CONTROLLERS: [
        './controllers/chat-ui-controller.js',
        './controllers/sidebar-controller.js',
        './controllers/view-controller.js',
        './controllers/file-upload-controller.js',
        './controllers/spotify-controller.js',
        './controllers/demo-controller.js',
        './controllers/reset-controller.js',
    ],

    // Layer 5: Optional Features (loaded on demand)
    // Heavy modules that should never block startup
    LAYER_5_OPTIONAL: [
        './ollama.js',
        './providers/ollama-adapter.js',
        './rag.js',
        './local-vector-store.js',
        './local-embeddings.js',
        './settings.js',
        './payments.js',
        './pricing.js',
    ],
};

// ==========================================
// Module Registry
// ==========================================

/**
 * Registry of loaded modules
 * Prevents duplicate loading and enables lazy initialization
 */
const loadedModules = new Map();

/**
 * Check if a module is already loaded
 * @param {string} modulePath - Module path
 * @returns {boolean}
 */
function isModuleLoaded(modulePath) {
    return loadedModules.has(modulePath);
}

/**
 * Mark a module as loaded
 * @param {string} modulePath - Module path
 * @param {*} moduleExports - Module exports
 */
function markModuleLoaded(modulePath, moduleExports) {
    loadedModules.set(modulePath, moduleExports);
}

/**
 * Get a loaded module
 * @param {string} modulePath - Module path
 * @returns {*|null} Module exports or null if not loaded
 */
function getLoadedModule(modulePath) {
    return loadedModules.get(modulePath) || null;
}

// ==========================================
// Layer Loading
// ==========================================

/**
 * Load all modules in a specific layer
 * @param {string[]} layerModules - Array of module paths
 * @param {Object} importContext - Context for dynamic imports (usually 'import.meta.url')
 * @returns {Promise<Object>} Map of module path to exports
 */
async function loadLayer(layerModules, importContext) {
    const loaded = {};

    for (const modulePath of layerModules) {
        if (isModuleLoaded(modulePath)) {
            loaded[modulePath] = getLoadedModule(modulePath);
            continue;
        }

        try {
            const resolvedPath = importContext ? new URL(modulePath, importContext).href : modulePath;
            const module = await import(resolvedPath);
            markModuleLoaded(modulePath, module);
            loaded[modulePath] = module;
        } catch (error) {
            console.error(`[DependencyGraph] Failed to load ${modulePath}:`, error);
            // Continue loading other modules
        }
    }

    return loaded;
}

/**
 * Load critical modules synchronously (Layer 0)
 * These should be imported normally in main.js
 * @param {string[]} criticalModules - Array of critical module paths
 * @returns {Object} Object mapping module paths to exports
 */
function loadCriticalModules(criticalModules) {
    const loaded = {};

    for (const modulePath of criticalModules) {
        if (isModuleLoaded(modulePath)) {
            loaded[modulePath] = getLoadedModule(modulePath);
        }
        // Note: Critical modules should be imported normally in main.js
        // This function just tracks them
    }

    return loaded;
}

// ==========================================
// Topological Sort
// ==========================================

/**
 * Get initialization order for all layers
 * @returns {string[]} Array of layer keys in topological order
 */
function getInitializationOrder() {
    return [
        'LAYER_0_CRITICAL',
        'LAYER_1_SERVICES',
        'LAYER_2_PROCESSING',
        'LAYER_3_BUSINESS_LOGIC',
        'LAYER_4_CONTROLLERS',
        'LAYER_5_OPTIONAL',
    ];
}

/**
 * Get all modules in initialization order
 * @returns {string[]} Flat array of all module paths
 */
function getAllModulesOrdered() {
    const order = getInitializationOrder();
    const allModules = [];

    for (const layerKey of order) {
        allModules.push(...DEPENDENCY_LAYERS[layerKey]);
    }

    return allModules;
}

// ==========================================
// Public API
// ==========================================

export const DependencyGraph = {
    // Layer definitions
    DEPENDENCY_LAYERS,

    // Module tracking
    isModuleLoaded,
    markModuleLoaded,
    getLoadedModule,

    // Layer loading
    loadLayer,
    loadCriticalModules,

    // Initialization order
    getInitializationOrder,
    getAllModulesOrdered,
};

console.log('[DependencyGraph] Module loaded');
