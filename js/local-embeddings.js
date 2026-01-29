/**
 * Local Embeddings Module for Rhythm Chamber
 *
 * In-browser embedding generation using Transformers.js
 * 100% client-side semantic search (no external dependencies).
 *
 * Uses all-MiniLM-L6-v2 model with INT8 quantization:
 * - ~6MB download size (INT8) vs ~22MB (fp32)
 * - 384-dimensional embeddings
 * - WebGPU acceleration when available (100x faster)
 * - WASM SIMD fallback for broader compatibility
 * - Battery-aware mode selection for mobile devices
 *
 * HNW Considerations:
 * - Hierarchy: LocalEmbeddings is authority for local mode
 * - Network: No external API calls after model download
 * - Wave: Model loads once, subsequent calls are fast
 */

// ==========================================
// Imports
// ==========================================

import { EventBus } from './services/event-bus.js';
import PerformanceProfiler, { PerformanceCategory } from './services/performance-profiler.js';
import { OperationLock } from './operation-lock.js';
import { OPERATIONS } from './utils/concurrency/lock-manager.js';

// ==========================================
// Event Schemas (decentralized registration)
// ==========================================

/**
 * Embedding event schemas
 * Registered with EventBus during initialization for decentralized schema management
 */
const EMBEDDING_EVENT_SCHEMAS = {
    'embedding:model_loaded': {
        description: 'Embedding model fully loaded',
        payload: { model: 'string', backend: 'string', quantization: 'string?', loadTimeMs: 'number' }
    },
    'embedding:mode_change': {
        description: 'Embedding mode changed (battery-aware switching)',
        payload: { from: 'string', to: 'string', batteryLevel: 'number?', charging: 'boolean?' }
    },
    'embedding:generation_start': {
        description: 'Embedding generation started',
        payload: { count: 'number', mode: 'string' }
    },
    'embedding:generation_complete': {
        description: 'Embedding generation completed',
        payload: { count: 'number', durationMs: 'number', avgTimePerEmbedding: 'number' }
    },
    'embedding:error': {
        description: 'Embedding error occurred',
        payload: { error: 'string', context: 'string?' }
    }
};

// ==========================================
// Constants
// ==========================================

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

// Transformers.js is now vendored locally for CSP compliance
// The library is loaded via script tag in app.html and accessed via window.transformers
// This avoids dynamic imports from CDN which violate CSP policies

// ==========================================
// Quantization Configuration
// ==========================================

/**
 * INT8 quantization for WASM performance optimization
 * - Reduces model size from ~22MB to ~6MB
 * - 2-4x faster inference
 * - Minimal quality loss for semantic similarity tasks
 */
const QUANTIZATION_CONFIG = {
    enabled: true,
    dtype: 'q8',  // INT8 quantization
    fallbackToFp32: false
};

// ==========================================
// State
// ==========================================

let pipeline = null;
let isLoading = false;
let loadProgress = 0;
let loadError = null;
let isInitialized = false;
let currentBackend = null;  // 'webgpu' or 'wasm'

// Module-level cache for dynamically loaded Transformers.js library
let cachedTransformers = null;

// ==========================================
// Transformers.js Dynamic Loading
// ==========================================

/**
 * Load Transformers.js from vendored local copy
 *
 * Transformers.js is loaded via <script> tag in app.html for CSP compliance.
 * The library exposes itself on the global window.transformers object.
 *
 * This approach is necessary because:
 * 1. Dynamic imports from CDN violate strict CSP policies
 * 2. Transformers.js uses WebAssembly which requires 'unsafe-eval' in CSP
 * 3. Vendoring the library keeps everything self-contained and CSP-compliant
 */
/**
 * Load Transformers.js from CDN using dynamic import
 *
 * Uses import map in app.html to resolve @xenova/transformers to CDN URL.
 * Falls back to direct CDN URL if import map not available.
 *
 * CSP Requirements:
 * - script-src-elem must include https://cdn.jsdelivr.net
 * - connect-src must include https://cdn.jsdelivr.net, https://huggingface.co, https://*.hf.co
 */
async function loadTransformersJS() {
    // Return cached version if available
    if (cachedTransformers?.pipeline) {
        return cachedTransformers;
    }

    if (window?.transformers?.pipeline && window?.transformers?.env) {
        cachedTransformers = window.transformers;
        return cachedTransformers;
    }

    console.log('[LocalEmbeddings] Loading Transformers.js from CDN...');

    try {
        // Try importing via import map first (cleanest approach)
        let module;
        try {
            module = await import('@xenova/transformers');
            console.log('[LocalEmbeddings] Loaded via import map');
        } catch (importMapError) {
            // Fallback: direct CDN import
            console.warn('[LocalEmbeddings] Import map not available, using direct CDN URL:', importMapError);
            module = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
            console.log('[LocalEmbeddings] Loaded via direct CDN URL');
        }

        // Validate that we got the exports we need
        if (!module || typeof module.pipeline !== 'function') {
            throw new Error('Transformers.js loaded but pipeline function not available');
        }

        if (!module.env) {
            throw new Error('Transformers.js loaded but env object not available');
        }

        // Create a transformers object with the expected structure
        const transformers = {
            pipeline: module.pipeline,
            env: module.env
        };

        // Cache for subsequent calls
        cachedTransformers = transformers;

        console.log('[LocalEmbeddings] Transformers.js loaded successfully, pipeline type:', typeof transformers.pipeline);
        return transformers;

    } catch (e) {
        console.error('[LocalEmbeddings] Failed to load Transformers.js:', e);
        throw new Error('Failed to load Transformers.js from CDN: ' + e.message);
    }
}

// ==========================================
// Capability Detection
// ==========================================

/**
 * Check if WebGPU is available for acceleration
 */
async function checkWebGPUSupport() {
    if (!navigator.gpu) {
        return { supported: false, reason: 'WebGPU not available' };
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            return { supported: false, reason: 'No GPU adapter available' };
        }

        const device = await adapter.requestDevice();
        const isSupported = !!device;

        return {
            supported: isSupported,
            adapterInfo: adapter.info || {},
            reason: isSupported ? 'WebGPU available' : 'Device request failed'
        };
    } catch (e) {
        return { supported: false, reason: e.message };
    }
}

/**
 * Check if WASM is available (fallback)
 */
function checkWASMSupport() {
    try {
        if (typeof WebAssembly === 'object' &&
            typeof WebAssembly.instantiate === 'function') {
            const module = new WebAssembly.Module(
                Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
            );
            return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
        }
    } catch (e) {
        return false;
    }
    return false;
}

// ==========================================
// Model Loading
// ==========================================

/**
 * Initialize the embedding model
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<boolean>} True if initialization successful
 */
async function initialize(onProgress = () => { }) {
    // Register embedding event schemas with EventBus (decentralized schema management)
    EventBus.registerSchemas(EMBEDDING_EVENT_SCHEMAS);

    // Fast path: already initialized
    if (isInitialized && pipeline) {
        onProgress(100);
        return true;
    }

    // Acquire lock to prevent concurrent initialization
    // Use acquireWithTimeout to avoid indefinite blocking with proper error handling
    let lockId;
    try {
        lockId = await OperationLock.acquireWithTimeout(OPERATIONS.EMBEDDING_GENERATION, 60000);
    } catch (lockError) {
        if (lockError.code === 'LOCK_TIMEOUT') {
            console.warn('[LocalEmbeddings] Timeout acquiring initialization lock, another initialization may be in progress');
            // Wait a bit and check if initialization completed
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (isInitialized && pipeline) {
                onProgress(100);
                return true;
            }
            throw new Error('Embedding initialization timeout - another initialization may be in progress');
        }
        throw lockError;
    }

    try {
        // Double-check after acquiring lock (another call may have initialized)
        if (isInitialized && pipeline) {
            onProgress(100);
            return true;
        }

        isLoading = true;
        loadProgress = 0;
        loadError = null;

        // Start performance tracking
        const stopInitTimer = PerformanceProfiler.startOperation('embedding_initialize', {
            category: PerformanceCategory.EMBEDDING_INITIALIZATION
        });
        const startTime = performance.now();

        try {
            onProgress(5);

            // Load Transformers.js (now protected by lock)
            const transformers = await loadTransformersJS();
            onProgress(15);

            // Configure WASM path to use local files (CSP compliance)
            // This prevents Transformers.js from fetching WASM from jsDelivr CDN
            transformers.env.backends.onnx.wasm.wasmPaths = './js/vendor/';
            console.log('[LocalEmbeddings] Configured local WASM path: ./js/vendor/');

            // Check for WebGPU (faster) or fall back to WASM
            const webGPUCheck = await checkWebGPUSupport();
            const device = webGPUCheck.supported ? 'webgpu' : 'wasm';
            currentBackend = device;

            console.log(`[LocalEmbeddings] Using ${device} backend`);
            onProgress(20);

            // Create feature extraction pipeline
            // With INT8 quantization: ~6MB download (was ~22MB with fp32)
            pipeline = await transformers.pipeline('feature-extraction', MODEL_NAME, {
                device,
                quantized: QUANTIZATION_CONFIG.enabled,
                dtype: QUANTIZATION_CONFIG.dtype,
                progress_callback: (progress) => {
                    if (progress.status === 'progress') {
                        // Model download progress (20-90%)
                        const pct = 20 + Math.round(progress.progress * 0.7);
                        loadProgress = pct;
                        onProgress(pct);
                    } else if (progress.status === 'done') {
                        onProgress(95);
                    }
                }
            });

            onProgress(100);
            isInitialized = true;
            isLoading = false;

            // Stop performance timer
            const measurement = stopInitTimer();
            const loadTimeMs = performance.now() - startTime;

            // Emit model loaded event
            EventBus.emit('embedding:model_loaded', {
                model: MODEL_NAME,
                backend: device,
                quantization: QUANTIZATION_CONFIG.dtype,
                loadTimeMs: Math.round(loadTimeMs)
            });

            console.log(`[LocalEmbeddings] Model loaded successfully in ${Math.round(loadTimeMs)}ms`);
            return true;

        } catch (e) {
            console.error('[LocalEmbeddings] Initialization failed:', e);
            loadError = e.message;
            isLoading = false;
            isInitialized = false;

            // Emit error event
            EventBus.emit('embedding:error', {
                error: e.message,
                context: 'initialization'
            });

            // Stop timer even on failure
            stopInitTimer();
            throw e;
        }
    } finally {
        // Always release the lock
        OperationLock.release(OPERATIONS.EMBEDDING_GENERATION, lockId);
    }
}

// ==========================================
// Embedding Generation
// ==========================================

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @param {number} [timeoutMs=30000] - Timeout in milliseconds (default: 30s)
 * @returns {Promise<number[]>} 384-dimensional embedding vector
 */
async function getEmbedding(text, timeoutMs = 30000) {
    if (!isInitialized || !pipeline) {
        throw new Error('LocalEmbeddings not initialized. Call initialize() first.');
    }

    if (!text || typeof text !== 'string') {
        throw new Error('Invalid input: text must be a non-empty string');
    }

    // Generate embedding with timeout protection
    const output = await Promise.race([
        pipeline(text, { pooling: 'mean', normalize: true }),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Embedding generation timeout after ${timeoutMs}ms`)), timeoutMs)
        )
    ]);

    // Convert to regular array
    return Array.from(output.data);
}

/**
 * Generate embeddings for multiple texts (batch)
 * @param {string[]} texts - Array of texts to embed
 * @param {Function} onProgress - Progress callback (processed, total)
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function getBatchEmbeddings(texts, onProgress = () => { }) {
    if (!isInitialized || !pipeline) {
        throw new Error('LocalEmbeddings not initialized. Call initialize() first.');
    }

    // Start performance tracking
    const stopGenTimer = PerformanceProfiler.startOperation('embedding_batch_generate', {
        category: PerformanceCategory.EMBEDDING_GENERATION,
        metadata: { count: texts.length }
    });
    const startTime = performance.now();

    // Emit generation start event
    EventBus.emit('embedding:generation_start', {
        count: texts.length,
        mode: currentBackend || 'unknown'
    });

    const embeddings = [];
    let validCount = 0;  // Track successfully generated embeddings

    try {
        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];

            if (!text || typeof text !== 'string') {
                embeddings.push(null);
                continue;
            }

            const output = await pipeline(text, { pooling: 'mean', normalize: true });
            embeddings.push(Array.from(output.data));
            validCount++;  // Increment only for successful embeddings

            onProgress(i + 1, texts.length);
        }

        // Stop performance timer
        stopGenTimer();
        const durationMs = performance.now() - startTime;
        const avgTimePerEmbedding = validCount > 0 ? durationMs / validCount : 0;

        // Emit generation complete event with both total and successful counts
        EventBus.emit('embedding:generation_complete', {
            totalCount: texts.length,
            successCount: validCount,
            skippedCount: texts.length - validCount,
            durationMs: Math.round(durationMs),
            avgTimePerEmbedding: Math.round(avgTimePerEmbedding)
        });

        return embeddings;
    } catch (e) {
        stopGenTimer();
        EventBus.emit('embedding:error', {
            error: e.message,
            context: 'batch_generation'
        });
        throw e;
    }
}

// ==========================================
// Public API
// ==========================================

const LocalEmbeddings = {
    /**
     * Check if local embeddings are supported in this browser
     */
    async isSupported() {
        const wasmSupported = checkWASMSupport();
        const webGPU = await checkWebGPUSupport();

        return {
            supported: wasmSupported || webGPU.supported,
            webgpu: webGPU,
            wasm: wasmSupported,
            recommendedBackend: webGPU.supported ? 'webgpu' : (wasmSupported ? 'wasm' : null)
        };
    },

    /**
     * Initialize the embedding model
     * Downloads ~22MB on first use
     * @param {Function} onProgress - Progress callback (0-100)
     */
    initialize,

    /**
     * Generate embedding for a single text
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} 384-dimensional embedding
     */
    getEmbedding,

    /**
     * Generate embeddings for multiple texts
     * @param {string[]} texts - Array of texts
     * @param {Function} onProgress - Progress callback
     */
    getBatchEmbeddings,

    /**
     * Get current status
     */
    getStatus() {
        return {
            isInitialized,
            isLoading,
            loadProgress,
            loadError,
            modelName: MODEL_NAME
        };
    },

    /**
     * Check if model is ready for embedding generation
     */
    isReady() {
        return isInitialized && pipeline !== null;
    },

    /**
     * Get model info
     */
    getModelInfo() {
        return {
            name: MODEL_NAME,
            dimensions: 384,
            downloadSize: '~22MB',
            description: 'Sentence embeddings for semantic similarity'
        };
    }
};

// ES Module export
export { LocalEmbeddings };

// ES Module export - use ModuleRegistry for access instead of window globals
console.log('[LocalEmbeddings] Module loaded. Call LocalEmbeddings.isSupported() to check compatibility.');

