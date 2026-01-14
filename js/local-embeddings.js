/**
 * Local Embeddings Module for Rhythm Chamber
 * 
 * In-browser embedding generation using Transformers.js
 * Removes the need for Qdrant Cloud for semantic search.
 * 
 * Uses all-MiniLM-L6-v2 model:
 * - ~22MB download size
 * - 384-dimensional embeddings
 * - WebGPU acceleration when available (100x faster)
 * - WASM fallback for broader compatibility
 * 
 * HNW Considerations:
 * - Hierarchy: LocalEmbeddings is authority for local mode
 * - Network: No external API calls after model download
 * - Wave: Model loads once, subsequent calls are fast
 */

// ==========================================
// Constants
// ==========================================

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const CDN_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// ==========================================
// State
// ==========================================

let pipeline = null;
let isLoading = false;
let loadProgress = 0;
let loadError = null;
let isInitialized = false;

// ==========================================
// Transformers.js Dynamic Loading
// ==========================================

/**
 * Dynamically import Transformers.js from CDN
 * This avoids bundling the large library
 */
async function loadTransformersJS() {
    if (window.transformers?.pipeline) {
        return window.transformers;
    }

    // Check if already loaded via script tag
    if (window.Transformers) {
        return window.Transformers;
    }

    // Dynamic import from CDN
    try {
        const transformers = await import(CDN_URL);
        window.transformers = transformers;
        return transformers;
    } catch (e) {
        console.error('[LocalEmbeddings] Failed to load Transformers.js:', e);
        throw new Error('Failed to load Transformers.js. Check your internet connection.');
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
    if (isInitialized && pipeline) {
        onProgress(100);
        return true;
    }

    if (isLoading) {
        // Already loading, wait for it
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!isLoading) {
                    clearInterval(checkInterval);
                    resolve(isInitialized);
                }
            }, 100);
        });
    }

    isLoading = true;
    loadProgress = 0;
    loadError = null;

    try {
        onProgress(5);

        // Load Transformers.js
        const transformers = await loadTransformersJS();
        onProgress(15);

        // Check for WebGPU (faster) or fall back to WASM
        const webGPUCheck = await checkWebGPUSupport();
        const device = webGPUCheck.supported ? 'webgpu' : 'wasm';

        console.log(`[LocalEmbeddings] Using ${device} backend`);
        onProgress(20);

        // Create feature extraction pipeline
        // This downloads the model on first use (~22MB)
        pipeline = await transformers.pipeline('feature-extraction', MODEL_NAME, {
            device,
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

        console.log('[LocalEmbeddings] Model loaded successfully');
        return true;

    } catch (e) {
        console.error('[LocalEmbeddings] Initialization failed:', e);
        loadError = e.message;
        isLoading = false;
        isInitialized = false;
        throw e;
    }
}

// ==========================================
// Embedding Generation
// ==========================================

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} 384-dimensional embedding vector
 */
async function getEmbedding(text) {
    if (!isInitialized || !pipeline) {
        throw new Error('LocalEmbeddings not initialized. Call initialize() first.');
    }

    if (!text || typeof text !== 'string') {
        throw new Error('Invalid input: text must be a non-empty string');
    }

    // Generate embedding
    const output = await pipeline(text, { pooling: 'mean', normalize: true });

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

    const embeddings = [];

    for (let i = 0; i < texts.length; i++) {
        const text = texts[i];

        if (!text || typeof text !== 'string') {
            embeddings.push(null);
            continue;
        }

        const output = await pipeline(text, { pooling: 'mean', normalize: true });
        embeddings.push(Array.from(output.data));

        onProgress(i + 1, texts.length);
    }

    return embeddings;
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

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.LocalEmbeddings = LocalEmbeddings;
}

console.log('[LocalEmbeddings] Module loaded. Call LocalEmbeddings.isSupported() to check compatibility.');

