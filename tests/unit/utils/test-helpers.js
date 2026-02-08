/**
 * Test Helper Utilities
 *
 * Reusable utility functions for testing across all suites.
 * Provides memory monitoring, file generation, math operations, and mock helpers.
 *
 * @module tests/unit/utils/test-helpers
 */

// ==========================================
// Memory Monitoring Utilities
// ==========================================

/**
 * Get current memory usage from performance.memory API
 * @returns {Object} Memory usage statistics
 */
export function getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
        return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
            usedMB: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
            totalMB: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2),
            limitMB: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2),
        };
    }
    // Return mock values for environments without performance.memory
    return {
        usedJSHeapSize: 50 * 1024 * 1024,
        totalJSHeapSize: 100 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
        usedMB: '50.00',
        totalMB: '100.00',
        limitMB: '200.00',
    };
}

/**
 * Get memory limit based on device memory
 * @returns {number} Memory limit in bytes
 */
export function getMemoryLimit() {
    if (typeof navigator !== 'undefined' && navigator.deviceMemory) {
        return navigator.deviceMemory * 1024 * 1024 * 1024; // GB to bytes
    }
    return 8 * 1024 * 1024 * 1024; // Default 8GB
}

/**
 * Check if memory usage exceeds threshold
 * @param {number} threshold - Threshold percentage (0-1)
 * @returns {boolean} True if memory usage exceeds threshold
 */
export function isMemoryExceeded(threshold = 0.75) {
    const memory = getMemoryUsage();
    const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    return usageRatio > threshold;
}

/**
 * Create a memory snapshot for leak detection
 * @returns {Object} Memory snapshot
 */
export function createMemorySnapshot() {
    return {
        ...getMemoryUsage(),
        timestamp: Date.now(),
    };
}

/**
 * Compare two memory snapshots to detect leaks
 * @param {Object} before - Snapshot before operation
 * @param {Object} after - Snapshot after operation
 * @param {number} thresholdMB - Threshold in MB for leak detection
 * @returns {boolean} True if memory leak detected
 */
export function detectMemoryLeak(before, after, thresholdMB = 10) {
    const growth = after.usedJSHeapSize - before.usedJSHeapSize;
    const growthMB = growth / 1024 / 1024;
    return growthMB > thresholdMB;
}

// ==========================================
// Vector Math Utilities
// ==========================================

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vec1 - First vector
 * @param {number[]} vec2 - Second vector
 * @returns {number} Cosine similarity (-1 to 1)
 */
export function cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
        throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0) {
        return 0;
    }

    return dotProduct / denominator;
}

/**
 * Check if a vector is normalized (L2 norm = 1)
 * @param {number[]} vec - Vector to check
 * @param {number} epsilon - Tolerance for floating point errors
 * @returns {boolean} True if vector is normalized
 */
export function isNormalized(vec, epsilon = 0.0001) {
    let sumSquares = 0;
    for (let i = 0; i < vec.length; i++) {
        sumSquares += vec[i] * vec[i];
    }
    const norm = Math.sqrt(sumSquares);
    return Math.abs(norm - 1) < epsilon;
}

/**
 * Normalize a vector to unit length
 * @param {number[]} vec - Vector to normalize
 * @returns {number[]} Normalized vector
 */
export function normalizeVector(vec) {
    let sumSquares = 0;
    for (let i = 0; i < vec.length; i++) {
        sumSquares += vec[i] * vec[i];
    }
    const norm = Math.sqrt(sumSquares);

    if (norm === 0) {
        throw new Error('Cannot normalize zero vector');
    }

    return vec.map(v => v / norm);
}

/**
 * Calculate Euclidean distance between two vectors
 * @param {number[]} vec1 - First vector
 * @param {number[]} vec2 - Second vector
 * @returns {number} Euclidean distance
 */
export function euclideanDistance(vec1, vec2) {
    if (vec1.length !== vec2.length) {
        throw new Error('Vectors must have same length');
    }

    let sumSquares = 0;
    for (let i = 0; i < vec1.length; i++) {
        const diff = vec1[i] - vec2[i];
        sumSquares += diff * diff;
    }

    return Math.sqrt(sumSquares);
}

/**
 * Generate a deterministic vector for testing
 * @param {number} seed - Seed value for generation
 * @param {number} dimension - Vector dimension
 * @returns {number[]} Deterministic vector
 */
export function generateDeterministicVector(seed, dimension = 384) {
    const vec = [];
    for (let i = 0; i < dimension; i++) {
        // Simple deterministic pseudo-random based on seed and index
        const val = Math.sin(seed * (i + 1)) * 10000;
        vec.push(val - Math.floor(val)); // Keep in [0, 1]
    }
    return normalizeVector(vec);
}

// ==========================================
// File Generation Utilities
// ==========================================

/**
 * Create a mock file object for testing
 * @param {string|ArrayBuffer} content - File content
 * @param {string} filename - File name
 * @param {Object} options - Additional options
 * @returns {File} Mock file object
 */
export function createMockFile(content, filename, options = {}) {
    const {
        type = 'application/json',
        lastModified = Date.now(),
    } = options;

    let blob;
    if (typeof content === 'string') {
        blob = new Blob([content], { type });
    } else {
        blob = new Blob([content], { type });
    }

    return new File([blob], filename, { type, lastModified });
}

/**
 * Generate mock Spotify streaming data
 * @param {number} count - Number of streams to generate
 * @param {Object} options - Generation options
 * @returns {Array} Array of streaming data objects
 */
export function generateSpotifyStreamingData(count, options = {}) {
    const {
        startDate = new Date('2023-01-01'),
        endDate = new Date('2023-12-31'),
        uniqueTracks = 100,
        uniqueArtists = 50,
    } = options;

    const tracks = Array.from({ length: uniqueTracks }, (_, i) => ({
        trackName: `Track ${i}`,
        artistName: `Artist ${Math.floor(i / 2)}`,
        albumName: `Album ${Math.floor(i / 10)}`,
    }));

    const streams = [];
    const msPerDay = 24 * 60 * 60 * 1000;

    for (let i = 0; i < count; i++) {
        const track = tracks[i % uniqueTracks];
        const timestamp = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());

        streams.push({
            msPlayed: Math.floor(Math.random() * 180000) + 30000, // 30s to 3min
            endTime: new Date(timestamp).toISOString(),
            trackName: track.trackName,
            artistName: track.artistName,
            albumName: track.albumName,
        });
    }

    return streams.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));
}

/**
 * Create a mock ZIP file structure
 * @param {Object} files - Object with filename -> content mapping
 * @returns {Uint8Array} ZIP file bytes
 */
export function createMockZipFile(files) {
    // This is a simplified ZIP creator for testing
    // In real tests, you'd use a proper ZIP library
    const entries = Object.entries(files).map(([name, content]) => ({
        name,
        content: typeof content === 'string' ? content : JSON.stringify(content),
    }));

    // Return a mock structure that mimics JSZip interface
    return {
        files: entries.reduce((acc, entry) => {
            acc[entry.name] = {
                name: entry.name,
                async: async function() {
                    return {
                        name: entry.name,
                        async: function() {
                            return entry.content;
                        },
                    };
                },
            };
            return acc;
        }, {}),
    };
}

/**
 * Create a malicious file for security testing
 * @param {string} type - Type of malicious file
 * @returns {File} Malicious file object
 */
export function createMaliciousFile(type) {
    switch (type) {
        case 'zip-bomb':
            // File that claims to be small but expands to huge size
            return createMockFile(new Array(1000000).fill('a').join(''), 'bomb.zip', {
                type: 'application/zip',
            });

        case 'path-traversal':
            return createMockFile('{"../../../etc/passwd": "malicious"}', 'data.json');

        case 'fake-zip':
            // JSON file with .zip extension
            return createMockFile('{"not": "a zip"}', 'fake.zip', {
                type: 'application/json',
            });

        case 'polluted-json':
            return createMockFile('{"__proto__": {"polluted": true}}', 'polluted.json');

        case 'oversized':
            return createMockFile(new Array(600 * 1024 * 1024).fill('x').join(''), 'huge.json', {
                type: 'application/json',
            });

        default:
            throw new Error(`Unknown malicious file type: ${type}`);
    }
}

// ==========================================
// Mock Helpers
// ==========================================

/**
 * Mock WebGPU as unavailable
 * @param {Object} navigatorMock - Navigator object to mock
 */
export function mockWebGPUUnavailable(navigatorMock = global.navigator) {
    Object.defineProperty(navigatorMock, 'gpu', {
        value: undefined,
        writable: true,
        configurable: true,
    });
}

/**
 * Mock WebGPU as available
 * @param {Object} navigatorMock - Navigator object to mock
 */
export function mockWebGPUAvailable(navigatorMock = global.navigator) {
    Object.defineProperty(navigatorMock, 'gpu', {
        value: {
            requestAdapter: vi.fn().mockResolvedValue({
                requestDevice: vi.fn().mockResolvedValue({}),
            }),
        },
        writable: true,
        configurable: true,
    });
}

/**
 * Mock battery API level
 * @param {Object} navigatorMock - Navigator object to mock
 * @param {Object} battery - Battery status object
 */
export function mockBatteryLevel(navigatorMock = global.navigator, battery = {}) {
    const mockBattery = {
        level: battery.level || 1,
        charging: battery.charging || false,
        chargingTime: battery.chargingTime || Infinity,
        dischargingTime: battery.dischargingTime || Infinity,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };

    navigatorMock.getBattery = vi.fn().mockResolvedValue(mockBattery);
}

/**
 * Mock storage quota
 * @param {number} quotaBytes - Storage quota in bytes
 * @param {number} usageBytes - Current storage usage in bytes
 */
export function mockStorageQuota(quotaBytes = 100 * 1024 * 1024, usageBytes = 50 * 1024 * 1024) {
    if (typeof navigator !== 'undefined' && navigator.storage) {
        navigator.storage.estimate = vi.fn().mockResolvedValue({
            quota: quotaBytes,
            usage: usageBytes,
            usageDetails: {
                indexedDB: usageBytes * 0.6,
                serviceWorkers: usageBytes * 0.1,
                cacheStorage: usageBytes * 0.2,
                other: usageBytes * 0.1,
            },
        });
    }
}

/**
 * Mock device memory
 * @param {number} gb - Memory in GB
 * @param {Object} navigatorMock - Navigator object to mock
 */
export function mockDeviceMemory(gb = 8, navigatorMock = global.navigator) {
    Object.defineProperty(navigatorMock, 'deviceMemory', {
        value: gb,
        writable: true,
        configurable: true,
    });
}

/**
 * Mock network connection
 * @param {Object} connection - Connection properties
 * @param {Object} navigatorMock - Navigator object to mock
 */
export function mockNetworkConnection(
    connection = {
        effectiveType: '4g',
        rtt: 100,
        downlink: 10,
        saveData: false,
    },
    navigatorMock = global.navigator
) {
    const mockConnection = {
        ...connection,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };

    Object.defineProperty(navigatorMock, 'connection', {
        value: mockConnection,
        writable: true,
        configurable: true,
    });
}

/**
 * Create a mock Web Worker
 * @param {Object} options - Worker options
 * @returns {Object} Mock worker instance
 */
export function createMockWorker(options = {}) {
    const {
        scriptURL = '/worker.js',
        autoTerminate = true,
        messageDelay = 0,
    } = options;

    let messageHandler = null;
    let errorHandler = null;
    let terminated = false;

    const worker = {
        scriptURL,
        postMessage: vi.fn((message, transferList) => {
            if (terminated) {
                throw new Error('Worker has been terminated');
            }

            setTimeout(() => {
                if (messageHandler) {
                    messageHandler({ data: message, type: 'message' });
                }
            }, messageDelay);
        }),
        terminate: vi.fn(() => {
            terminated = true;
        }),
        addEventListener: vi.fn((type, handler) => {
            if (type === 'message') messageHandler = handler;
            if (type === 'error') errorHandler = handler;
        }),
        removeEventListener: vi.fn((type, handler) => {
            if (type === 'message' && messageHandler === handler) {
                messageHandler = null;
            }
            if (type === 'error' && errorHandler === handler) {
                errorHandler = null;
            }
        }),
        set onmessage(handler) {
            messageHandler = handler;
        },
        get onmessage() {
            return messageHandler;
        },
        set onerror(handler) {
            errorHandler = handler;
        },
        get onerror() {
            return errorHandler;
        },
        get terminated() {
            return terminated;
        },
        _setMessageDelay: (delay) => {
            messageDelay = delay;
        },
        _setMessageHandler: (handler) => {
            messageHandler = handler;
        },
    };

    return worker;
}

/**
 * Create a mock BroadcastChannel
 * @param {string} name - Channel name
 * @returns {Object} Mock BroadcastChannel
 */
export function createMockBroadcastChannel(name) {
    const listeners = [];
    let closed = false;

    return {
        name,
        postMessage: vi.fn((message) => {
            if (closed) {
                throw new Error('BroadcastChannel is closed');
            }
            setTimeout(() => {
                listeners.forEach((listener) => {
                    try {
                        listener({ data: message, type: 'message', target: this });
                    } catch (error) {
                        console.error('[MockBroadcastChannel] Error in listener:', error);
                    }
                });
            }, 0);
        }),
        addEventListener: vi.fn((type, listener) => {
            if (closed) {
                console.warn('[MockBroadcastChannel] Cannot add listener to closed channel');
                return;
            }
            if (type === 'message') {
                listeners.push(listener);
            }
        }),
        removeEventListener: vi.fn((type, listener) => {
            if (type === 'message') {
                const index = listeners.indexOf(listener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        }),
        close: vi.fn(() => {
            closed = true;
            listeners.length = 0;
        }),
        get closed() {
            return closed;
        },
        get listenerCount() {
            return listeners.length;
        },
    };
}

// ==========================================
// Test Data Generators
// ==========================================

/**
 * Generate a random API key for testing
 * @param {string} provider - Provider name
 * @returns {string} Mock API key
 */
export function generateMockApiKey(provider = 'openrouter') {
    const patterns = {
        openrouter: () => `sk-or-v1-${Math.random().toString(36).substring(2, 34)}`,
        gemini: () => `AIza${Math.random().toString(36).substring(2, 35)}`,
        claude: () => `sk-ant-${Math.random().toString(36).substring(2, 42)}`,
        openai: () => `sk-${Math.random().toString(36).substring(2, 46)}`,
        spotify: () => Math.random().toString(36).substring(2, 80),
    };

    return patterns[provider] ? patterns[provider]() : patterns.openrouter();
}

/**
 * Generate mock chat messages
 * @param {number} count - Number of messages
 * @param {Object} options - Message options
 * @returns {Array} Array of message objects
 */
export function generateMockChatMessages(count, options = {}) {
    const {
        userMessage = 'Hello',
        assistantMessage = 'Hi there!',
        includeToolCalls = false,
        toolName = 'get_weather',
    } = options;

    const messages = [];

    for (let i = 0; i < count; i++) {
        messages.push({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: i % 2 === 0 ? userMessage : assistantMessage,
            timestamp: Date.now() - (count - i) * 60000,
        });

        if (includeToolCalls && i % 4 === 1) {
            messages.push({
                role: 'assistant',
                content: null,
                toolCalls: [
                    {
                        id: `call_${i}`,
                        type: 'function',
                        function: {
                            name: toolName,
                            arguments: JSON.stringify({ location: 'NYC' }),
                        },
                    },
                ],
            });

            messages.push({
                role: 'tool',
                toolCallId: `call_${i}`,
                content: '22°C, sunny',
            });
        }
    }

    return messages;
}

/**
 * Generate mock embeddings
 * @param {number} count - Number of embeddings
 * @param {number} dimension - Embedding dimension
 * @returns {Array} Array of embedding vectors
 */
export function generateMockEmbeddings(count, dimension = 384) {
    return Array.from({ length: count }, (_, i) => generateDeterministicVector(i, dimension));
}

// ==========================================
// Assertion Helpers
// ==========================================

/**
 * Assert that a vector is normalized
 * @param {number[]} vec - Vector to check
 * @param {number} epsilon - Tolerance
 */
export function assertNormalized(vec, epsilon = 0.0001) {
    if (!isNormalized(vec, epsilon)) {
        const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
        throw new Error(`Vector is not normalized. Norm = ${norm}, expected 1`);
    }
}

/**
 * Assert that a value is within range
 * @param {number} value - Value to check
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} message - Error message
 */
export function assertInRange(value, min, max, message = '') {
    if (value < min || value > max) {
        throw new Error(
            message || `Value ${value} is not in range [${min}, ${max}]`
        );
    }
}

/**
 * Assert that an array has unique elements
 * @param {Array} arr - Array to check
 * @param {string} message - Error message
 */
export function assertUnique(arr, message = '') {
    const unique = new Set(arr);
    if (unique.size !== arr.length) {
        throw new Error(message || `Array has duplicate elements. Length: ${arr.length}, Unique: ${unique.size}`);
    }
}

// ==========================================
// Async Utilities
// ==========================================

/**
 * Wait for a specified amount of time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after delay
 */
export function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to become true
 * @param {Function} condition - Condition function
 * @param {Object} options - Options
 * @returns {Promise} Promise that resolves when condition is true
 */
export function waitFor(condition, options = {}) {
    const {
        timeout = 5000,
        interval = 50,
        timeoutMessage = 'Condition not met within timeout',
    } = options;

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const check = () => {
            if (condition()) {
                resolve();
            } else if (Date.now() - startTime > timeout) {
                reject(new Error(timeoutMessage));
            } else {
                setTimeout(check, interval);
            }
        };
        check();
    });
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Promise that resolves when function succeeds
 */
export async function retry(fn, options = {}) {
    const {
        maxAttempts = 3,
        baseDelay = 100,
        maxDelay = 1000,
    } = options;

    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxAttempts - 1) {
                const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
                await wait(delay);
            }
        }
    }

    throw lastError;
}

// ==========================================
// Performance Utilities
// ==========================================

/**
 * Measure execution time of a function
 * @param {Function} fn - Function to measure
 * @returns {Promise<{result: any, time: number}>} Result and execution time
 */
export async function measureTime(fn) {
    const start = performance.now();
    const result = await fn();
    const time = performance.now() - start;
    return { result, time };
}

/**
 * Benchmark a function multiple times
 * @param {Function} fn - Function to benchmark
 * @param {Object} options - Benchmark options
 * @returns {Promise<Object>} Benchmark statistics
 */
export async function benchmark(fn, options = {}) {
    const {
        iterations = 100,
        warmupIterations = 10,
    } = options;

    // Warmup
    for (let i = 0; i < warmupIterations; i++) {
        await fn();
    }

    const times = [];
    for (let i = 0; i < iterations; i++) {
        const { time } = await measureTime(fn);
        times.push(time);
    }

    const sorted = times.slice().sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    const mean = sum / times.length;
    const median = sorted[Math.floor(times.length / 2)];
    const min = sorted[0];
    const max = sorted[times.length - 1];

    return {
        iterations,
        mean,
        median,
        min,
        max,
        sum,
        times,
    };
}

console.log('[Test Helpers] Test helper utilities loaded');
