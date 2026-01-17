/**
 * Observability Initialization
 *
 * Main integration point for all observability components.
 * Initializes Core Web Vitals tracking, Performance Profiler,
 * Metrics Exporter, and Observability Controller with EventBus integration.
 *
 * @module ObservabilityInit
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

import { EventBus } from '../services/event-bus.js';
import { CoreWebVitalsTracker } from './core-web-vitals.js';
import { PerformanceProfiler, PerformanceCategory } from '../services/performance-profiler.js';
import { MetricsExporter } from './metrics-exporter.js';
import { ObservabilityController } from '../controllers/observability-controller.js';

// Singleton instances
let coreWebVitals = null;
let metricsExporter = null;
let observabilityController = null;
let isInitialized = false;

/**
 * Initialize observability system with all components
 */
export async function initObservability(userOptions = {}) {
    // Return early if already initialized
    if (isInitialized && coreWebVitals && metricsExporter) {
        return {
            coreWebVitals,
            metricsExporter,
            observabilityController,
            isInitialized: true
        };
    }

    const defaultOptions = {
        enabled: true,
        webVitalsEnabled: true,
        profilingEnabled: true,
        exportEnabled: true,
        dashboardEnabled: true
    };

    const options = { ...defaultOptions, ...userOptions };

    try {
        // Initialize Core Web Vitals Tracker
        if (options.webVitalsEnabled) {
            coreWebVitals = new CoreWebVitalsTracker({
                enabled: options.enabled,
                maxMetrics: 100
            });
            console.log('[ObservabilityInit] Core Web Vitals Tracker initialized');
        }

        // Initialize Metrics Exporter
        if (options.exportEnabled) {
            metricsExporter = new MetricsExporter({
                enabled: options.enabled
            });
            console.log('[ObservabilityInit] Metrics Exporter initialized');
        }

        // Initialize Observability Controller
        if (options.dashboardEnabled && typeof window !== 'undefined') {
            observabilityController = new ObservabilityController({
                coreWebVitals,
                metricsExporter,
                updateInterval: 5000
            });
            console.log('[ObservabilityInit] Observability Controller initialized');
        }

        // Setup EventBus integration
        setupEventBusIntegration();

        // Setup performance budgets
        setupPerformanceBudgets();

        isInitialized = true;

        return {
            coreWebVitals,
            metricsExporter,
            observabilityController,
            isInitialized: true
        };

    } catch (error) {
        console.error('[ObservabilityInit] Failed to initialize observability:', error);
        return {
            coreWebVitals: null,
            metricsExporter: null,
            observabilityController: null,
            isInitialized: false,
            error
        };
    }
}

/**
 * Setup EventBus integration for observability events
 */
function setupEventBusIntegration() {
    if (!EventBus) {
        console.warn('[ObservabilityInit] EventBus not available');
        return;
    }

    // Subscribe to existing application events for tracking
    EventBus.on('DATA_STREAMS_LOADED', handleDataStreamsLoaded);
    EventBus.on('CHAT_MESSAGE_SENT', handleChatMessageSent);
    EventBus.on('PATTERN_DETECTION_COMPLETE', handlePatternDetectionComplete);
    EventBus.on('EMBEDDING_GENERATED', handleEmbeddingGenerated);

    console.log('[ObservabilityInit] EventBus integration setup complete');
}

/**
 * Setup performance budgets for different categories
 */
function setupPerformanceBudgets() {
    if (!PerformanceProfiler) {
        return;
    }

    // Chat performance budget
    PerformanceProfiler.setPerformanceBudget(PerformanceCategory.CHAT, {
        threshold: 5000, // 5 seconds for LLM calls
        action: 'warn',
        degradationThreshold: 50 // 50% increase triggers alert
    });

    // Storage performance budget
    PerformanceProfiler.setPerformanceBudget(PerformanceCategory.STORAGE, {
        threshold: 100, // 100ms for storage operations
        action: 'warn',
        degradationThreshold: 50
    });

    // Pattern detection budget
    PerformanceProfiler.setPerformanceBudget(PerformanceCategory.PATTERN_DETECTION, {
        threshold: 300, // 300ms for pattern algorithms
        action: 'warn',
        degradationThreshold: 50
    });

    // Semantic search budget
    PerformanceProfiler.setPerformanceBudget(PerformanceCategory.SEMANTIC_SEARCH, {
        threshold: 200, // 200ms for vector search
        action: 'warn',
        degradationThreshold: 50
    });

    console.log('[ObservabilityInit] Performance budgets configured');
}

// Event handlers for EventBus integration

function handleDataStreamsLoaded(payload) {
    if (!PerformanceProfiler) return;

    const stopOperation = PerformanceProfiler.startOperation('data_streams_load', {
        category: PerformanceCategory.STORAGE,
        metadata: {
            streamCount: payload.streams?.length || 0
        }
    });

    // Record completion
    setTimeout(() => stopOperation(), 0);
}

function handleChatMessageSent(payload) {
    if (!PerformanceProfiler) return;

    const stopOperation = PerformanceProfiler.startOperation('chat_message_send', {
        category: PerformanceCategory.CHAT,
        metadata: {
            messageLength: payload.message?.length || 0,
            hasFunctionCalls: payload.functionCalls?.length > 0
        }
    });

    // Record completion
    setTimeout(() => stopOperation(), 0);
}

function handlePatternDetectionComplete(payload) {
    if (!PerformanceProfiler) return;

    const stopOperation = PerformanceProfiler.startOperation('pattern_detection', {
        category: PerformanceCategory.PATTERN_DETECTION,
        metadata: {
            patternCount: Object.keys(payload.patterns || {}).length,
            streamCount: payload.streamCount || 0
        }
    });

    // Record completion
    setTimeout(() => stopOperation(), 0);
}

function handleEmbeddingGenerated(payload) {
    if (!PerformanceProfiler) return;

    const stopOperation = PerformanceProfiler.startOperation('embedding_generation', {
        category: PerformanceCategory.EMBEDDING_GENERATION,
        metadata: {
            embeddingCount: payload.count || 1,
            dimension: payload.dimension || 384
        }
    });

    // Record completion
    setTimeout(() => stopOperation(), 0);
}

/**
 * Get observability instances
 */
export function getObservability() {
    return {
        coreWebVitals,
        metricsExporter,
        observabilityController,
        isInitialized
    };
}

/**
 * Check if observability is initialized
 */
export function isObservabilityInitialized() {
    return isInitialized;
}

/**
 * Disable observability system
 */
export function disableObservability() {
    if (coreWebVitals) {
        coreWebVitals.disable();
    }
    if (metricsExporter) {
        metricsExporter.disable();
    }
    if (observabilityController) {
        observabilityController.hideDashboard();
    }
    isInitialized = false;
    console.log('[ObservabilityInit] Observability system disabled');
}

// Export for global access (if needed)
if (typeof window !== 'undefined') {
    window.ObservabilityInit = {
        initObservability,
        getObservability,
        isObservabilityInitialized,
        disableObservability
    };
}

console.log('[ObservabilityInit] Module loaded');