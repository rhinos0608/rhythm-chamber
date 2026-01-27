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

/**
 * Generate or retrieve encryption key configuration for metrics exporter
 * This provides basic protection for stored credentials using Web Crypto API
 *
 * NOTE: For production use, you should provide your own encryption config with:
 * - password: A strong, unique passphrase
 * - salt: A random salt string (store securely, don't commit to git)
 * - iterations: PBKDF2 iteration count (minimum 100000)
 *
 * @returns {Object|null} Encryption configuration or null if not available
 */
function getOrCreateEncryptionConfig() {
    // SECURITY: Never read encryption keys from localStorage - vulnerable to XSS attacks
    // Return null immediately to prevent insecure credential storage
    console.warn('[ObservabilityInit] SECURITY WARNING: Metrics encryption not configured. ' +
        'External service credentials will be stored in plain text in localStorage. ' +
        'CRITICAL: Reading encryption secrets from localStorage is insecure and vulnerable to XSS attacks. ' +
        'For production use, consider safer alternatives: ' +
        '(1) Prompt for password at runtime, ' +
        '(2) Use a session-derived key, ' +
        '(3) Derive/store key server-side. ' +
        'Do NOT attempt to provide encryption config via localStorage for security reasons.');

    return null;
}
import { MetricsExporter } from './metrics-exporter.js';
import { ObservabilityController } from '../controllers/observability-controller.js';

// Singleton instances
let coreWebVitals = null;
let metricsExporter = null;
let observabilityController = null;
let isInitialized = false;

// EventBus unsubscribe functions
let eventBusUnsubscribers = [];

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
            // Get encryption configuration for securing external service credentials
            const encryptionConfig = getOrCreateEncryptionConfig();
            metricsExporter = await MetricsExporter.create({
                enabled: options.enabled,
                encryptionConfig: encryptionConfig
            });
            console.log('[ObservabilityInit] Metrics Exporter initialized' + (encryptionConfig ? ' with encryption' : ' (encryption not configured)'));
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
    // Store unsubscribe functions for cleanup
    eventBusUnsubscribers = [
        EventBus.on('data:streams_loaded', handleDataStreamsLoaded),
        // Note: chat:message_sent is defined in schema but not currently emitted
        // EventBus.on('chat:message_sent', handleChatMessageSent),
        EventBus.on('pattern:all_complete', handlePatternDetectionComplete),
        EventBus.on('embedding:generation_complete', handleEmbeddingGenerated)
    ];

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

    // Embedding generation budget
    PerformanceProfiler.setPerformanceBudget(PerformanceCategory.EMBEDDING_GENERATION, {
        threshold: 500, // 500ms for embedding generation
        action: 'warn',
        degradationThreshold: 50
    });

    console.log('[ObservabilityInit] Performance budgets configured');
}

// Event handlers for EventBus integration
// Note: These handlers currently record minimal timing information (~0ms)
// For accurate profiling, events should include timing data in payloads:
// - payload.startTime / payload.endTime
// - payload.duration
// Or implement START/COMPLETE event patterns with operationId tracking

function handleDataStreamsLoaded(payload) {
    if (!PerformanceProfiler) return;

    const stopOperation = PerformanceProfiler.startOperation('data_streams_load', {
        category: PerformanceCategory.STORAGE,
        metadata: {
            streamCount: payload.streams?.length || 0,
            timingNote: 'Actual timing should be provided in payload.duration'
        }
    });

    // If actual timing is available in payload, use it
    if (payload.duration) {
        // Stop with duration metadata for reference
        stopOperation({ metadata: { actualDuration: payload.duration } });
    } else {
        // Record completion (will show minimal timing)
        setTimeout(() => stopOperation(), 0);
    }
}

function handleChatMessageSent(payload) {
    if (!PerformanceProfiler) return;

    const stopOperation = PerformanceProfiler.startOperation('chat_message_send', {
        category: PerformanceCategory.CHAT,
        metadata: {
            messageLength: payload.message?.length || 0,
            hasFunctionCalls: payload.functionCalls?.length > 0,
            timingNote: 'Actual timing should be provided in payload.duration'
        }
    });

    // If actual timing is available in payload, use it
    if (payload.duration) {
        // Stop with duration metadata for reference
        stopOperation({ metadata: { actualDuration: payload.duration } });
    } else {
        // Record completion (will show minimal timing)
        setTimeout(() => stopOperation(), 0);
    }
}

function handlePatternDetectionComplete(payload) {
    if (!PerformanceProfiler) return;

    const stopOperation = PerformanceProfiler.startOperation('pattern_detection', {
        category: PerformanceCategory.PATTERN_DETECTION,
        metadata: {
            patternCount: Object.keys(payload.patterns || {}).length,
            streamCount: payload.streamCount || 0,
            timingNote: 'Actual timing should be provided in payload.duration'
        }
    });

    // If actual timing is available in payload, use it
    if (payload.duration) {
        // Stop with duration metadata for reference
        stopOperation({ metadata: { actualDuration: payload.duration } });
    } else {
        // Record completion (will show minimal timing)
        setTimeout(() => stopOperation(), 0);
    }
}

function handleEmbeddingGenerated(payload) {
    if (!PerformanceProfiler) return;

    const stopOperation = PerformanceProfiler.startOperation('embedding_generation', {
        category: PerformanceCategory.EMBEDDING_GENERATION,
        metadata: {
            embeddingCount: payload.count || 1,
            dimension: payload.dimension || 384,
            timingNote: 'Actual timing should be provided in payload.duration'
        }
    });

    // If actual timing is available in payload, use it
    if (payload.duration) {
        // Stop with duration metadata for reference
        stopOperation({ metadata: { actualDuration: payload.duration } });
    } else {
        // Record completion (will show minimal timing)
        setTimeout(() => stopOperation(), 0);
    }
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
    // Cleanup EventBus subscriptions
    eventBusUnsubscribers.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    eventBusUnsubscribers = [];

    // Disable individual components
    if (coreWebVitals) {
        coreWebVitals.disable();
    }
    if (metricsExporter) {
        metricsExporter.disable();
    }
    if (observabilityController) {
        observabilityController.hideDashboard();
    }

    // Null out singleton references to allow reinitialization
    coreWebVitals = null;
    metricsExporter = null;
    observabilityController = null;
    isInitialized = false;

    console.log('[ObservabilityInit] Observability system disabled');
}

// ObservabilityInit functions are exported as ES modules - no global window assignment
// Use: import { initObservability, getObservability, isObservabilityInitialized, disableObservability } from './js/observability/init-observability.js'

console.log('[ObservabilityInit] Module loaded');