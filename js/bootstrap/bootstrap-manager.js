/**
 * Bootstrap Manager
 *
 * Manages application startup with lazy loading and layer initialization.
 * Reduces main.js import count from 69 to ~15 critical modules.
 *
 * HNW Pattern: Hierarchical Bootstrap
 * - Phase 1: Load critical infrastructure (Layer 0)
 * - Phase 2: Initialize core services (Layer 1)
 * - Phase 3: Lazy load business logic (Layer 2-3) on demand
 * - Phase 4: Initialize controllers (Layer 4) when DOM ready
 *
 * @module bootstrap/bootstrap-manager
 */

'use strict';

import { DependencyGraph } from './dependency-graph.js';

// ==========================================
// Bootstrap State
// ==========================================

let bootstrapState = {
    phase: 'initializing', // initializing, critical_loaded, services_ready, complete
    criticalLoaded: false,
    servicesReady: false,
    layersLoaded: new Set(),
    errors: []
};

// ==========================================
// Phase 1: Critical Infrastructure
// ==========================================

/**
 * Phase 1: Load critical infrastructure modules
 * These are loaded synchronously in main.js for fail-fast behavior
 * @param {Object} criticalModules - Pre-loaded critical modules from main.js
 */
function loadCriticalPhase(criticalModules) {
    console.log('[Bootstrap] Phase 1: Loading critical infrastructure...');

    try {
        // Track critical modules
        for (const [path, module] of Object.entries(criticalModules)) {
            DependencyGraph.markModuleLoaded(path, module);
        }

        bootstrapState.criticalLoaded = true;
        bootstrapState.phase = 'critical_loaded';
        console.log('[Bootstrap] Phase 1 complete: Critical infrastructure ready');
    } catch (error) {
        console.error('[Bootstrap] Phase 1 failed:', error);
        bootstrapState.errors.push({ phase: 1, error });
        throw error;
    }
}

// ==========================================
// Phase 2: Core Services
// ==========================================

/**
 * Phase 2: Initialize core services
 * @returns {Promise<void>}
 */
async function loadServicesPhase() {
    if (bootstrapState.servicesReady) {
        console.log('[Bootstrap] Phase 2 already complete, skipping');
        return;
    }

    console.log('[Bootstrap] Phase 2: Initializing core services...');

    try {
        // Load Layer 1: Core Services
        const services = await DependencyGraph.loadLayer(
            DependencyGraph.DEPENDENCY_LAYERS.LAYER_1_SERVICES,
            import.meta.url
        );

        bootstrapState.layersLoaded.add('LAYER_1_SERVICES');
        bootstrapState.servicesReady = true;
        bootstrapState.phase = 'services_ready';

        console.log('[Bootstrap] Phase 2 complete: Core services initialized');

        // Initialize event bus first
        if (services['./services/event-bus.js']?.EventBus) {
            console.log('[Bootstrap] EventBus ready');
        }

        // Initialize tab coordination
        if (services['./services/tab-coordination.js']?.TabCoordinator) {
            await services['./services/tab-coordination.js'].TabCoordinator.initialize();
            console.log('[Bootstrap] TabCoordinator initialized');
        }

        // Initialize session management
        if (services['./services/session-manager.js']?.SessionManager) {
            await services['./services/session-manager.js'].SessionManager.initialize();
            console.log('[Bootstrap] SessionManager initialized');
        }
    } catch (error) {
        console.error('[Bootstrap] Phase 2 failed:', error);
        bootstrapState.errors.push({ phase: 2, error });
        throw error;
    }
}

// ==========================================
// Phase 3: Business Logic (Lazy)
// ==========================================

/**
 * Phase 3: Load business logic modules on demand
 * @param {string} featureName - Feature requiring business logic
 * @returns {Promise<void>}
 */
async function loadBusinessLogicPhase(featureName) {
    console.log(`[Bootstrap] Phase 3: Loading business logic for ${featureName}...`);

    try {
        // Load Layer 2: Data Processing
        await DependencyGraph.loadLayer(
            DependencyGraph.DEPENDENCY_LAYERS.LAYER_2_PROCESSING,
            import.meta.url
        );
        bootstrapState.layersLoaded.add('LAYER_2_PROCESSING');

        // Load Layer 3: Business Logic
        await DependencyGraph.loadLayer(
            DependencyGraph.DEPENDENCY_LAYERS.LAYER_3_BUSINESS_LOGIC,
            import.meta.url
        );
        bootstrapState.layersLoaded.add('LAYER_3_BUSINESS_LOGIC');

        console.log(`[Bootstrap] Phase 3 complete: Business logic loaded for ${featureName}`);
    } catch (error) {
        console.error(`[Bootstrap] Phase 3 failed for ${featureName}:`, error);
        bootstrapState.errors.push({ phase: 3, feature: featureName, error });
        throw error;
    }
}

// ==========================================
// Phase 4: Controllers (Lazy)
// ==========================================

/**
 * Phase 4: Load controllers when DOM is ready
 * @returns {Promise<void>}
 */
async function loadControllersPhase() {
    if (bootstrapState.layersLoaded.has('LAYER_4_CONTROLLERS')) {
        console.log('[Bootstrap] Phase 4 already complete, skipping');
        return;
    }

    console.log('[Bootstrap] Phase 4: Loading controllers...');

    try {
        // Load Layer 4: Controllers
        await DependencyGraph.loadLayer(
            DependencyGraph.DEPENDENCY_LAYERS.LAYER_4_CONTROLLERS,
            import.meta.url
        );
        bootstrapState.layersLoaded.add('LAYER_4_CONTROLLERS');

        console.log('[Bootstrap] Phase 4 complete: Controllers loaded');
    } catch (error) {
        console.error('[Bootstrap] Phase 4 failed:', error);
        bootstrapState.errors.push({ phase: 4, error });
        throw error;
    }
}

// ==========================================
// Optional Features (On Demand)
// ==========================================

/**
 * Load optional features (Ollama, RAG, etc.) on demand
 * @param {string} featureName - Feature to load
 * @returns {Promise<void>}
 */
async function loadOptionalFeature(featureName) {
    console.log(`[Bootstrap] Loading optional feature: ${featureName}...`);

    try {
        await DependencyGraph.loadLayer(
            DependencyGraph.DEPENDENCY_LAYERS.LAYER_5_OPTIONAL,
            import.meta.url
        );
        bootstrapState.layersLoaded.add('LAYER_5_OPTIONAL');

        console.log(`[Bootstrap] Optional feature loaded: ${featureName}`);
    } catch (error) {
        console.error(`[Bootstrap] Failed to load optional feature ${featureName}:`, error);
        bootstrapState.errors.push({ phase: 5, feature: featureName, error });
        throw error;
    }
}

// ==========================================
// Bootstrap Orchestration
// ==========================================

/**
 * Complete bootstrap sequence
 * @param {Object} criticalModules - Pre-loaded critical modules
 * @returns {Promise<void>}
 */
async function bootstrap(criticalModules) {
    console.log('[Bootstrap] Starting application bootstrap...');

    // Phase 1: Critical (synchronous)
    loadCriticalPhase(criticalModules);

    // Phase 2: Services (asynchronous)
    await loadServicesPhase();

    // Phases 3-5: Loaded on demand

    bootstrapState.phase = 'complete';
    console.log('[Bootstrap] Bootstrap sequence complete');
}

// ==========================================
// State Queries
// ==========================================

/**
 * Get current bootstrap state
 * @returns {Object} Bootstrap state
 */
function getBootstrapState() {
    return { ...bootstrapState };
}

/**
 * Check if bootstrap is complete
 * @returns {boolean}
 */
function isBootstrapComplete() {
    return bootstrapState.phase === 'complete';
}

/**
 * Check if specific layer is loaded
 * @param {string} layerKey - Layer key (e.g., 'LAYER_1_SERVICES')
 * @returns {boolean}
 */
function isLayerLoaded(layerKey) {
    return bootstrapState.layersLoaded.has(layerKey);
}

// ==========================================
// Public API
// ==========================================

export const BootstrapManager = {
    // Bootstrap orchestration
    bootstrap,

    // Phase loading
    loadCriticalPhase,
    loadServicesPhase,
    loadBusinessLogicPhase,
    loadControllersPhase,
    loadOptionalFeature,

    // State queries
    getBootstrapState,
    isBootstrapComplete,
    isLayerLoaded
};

console.log('[BootstrapManager] Module loaded');
