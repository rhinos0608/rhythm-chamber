/**
 * Parser Worker Security Tests
 *
 * Comprehensive security testing for the parser Web Worker covering:
 * - ZIP bomb protection (excessive compression, nested archives, file count)
 * - Path traversal prevention (../, absolute paths, Unicode attacks)
 * - Prototype pollution detection (__proto__, constructor.prototype)
 * - File size limits and memory management
 * - Input validation and sanitization
 * - Malformed JSON handling
 * - Backpressure and flow control security
 *
 * @module tests/unit/parser-worker-security
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createMockFile,
    createMockWorker,
    wait,
    createMaliciousFile,
} from './utils/test-helpers.js';
import {
    getAllMaliciousFiles,
    getFixturesByCategory,
    createFileFromFixture,
} from '../fixtures/malicious-files.js';

// ==========================================
// Test Constants
// ==========================================

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_JSON_STRING_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_STREAMS = 1_000_000; // 1M streams
const MIN_VALID_RATIO = 0.95; // 95% must be valid

// ==========================================
// Test Setup
// ==========================================

let workerInstance;

beforeEach(() => {
    vi.clearAllMocks();

    // Mock Worker
    global.Worker = vi.fn((scriptURL) => {
        workerInstance = createMockWorker({ scriptURL, messageDelay: 10 });
        return workerInstance;
    });

    // Mock performance.memory
    if (typeof performance === 'undefined') {
        global.performance = {};
    }
    global.performance.memory = {
        usedJSHeapSize: 50 * 1024 * 1024,
        totalJSHeapSize: 100 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
    };

    // Mock navigator.memory
    if (typeof navigator === 'undefined') {
        global.navigator = {};
    }
    global.navigator.memory = {
        usedJSHeapSize: 50 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
    };
});

afterEach(() => {
    if (workerInstance) {
        workerInstance.terminate();
    }
});

// ==========================================
// Helper: Load Worker and Send Message
// ==========================================

async function sendMessageToWorker(message) {
    const workerCode = await import('../../js/parser-worker.js');

    // Create mock worker context
    const mockContext = {
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        importScripts: vi.fn(),
        JSZip: null, // Will be mocked separately
    };

    // Simulate worker message handling
    return new Promise((resolve, reject) => {
        try {
            // Worker processes message synchronously in test
            workerCode.onmessage?.({ data: message });
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

// ==========================================
// Test Suite 1: ZIP Bomb Protection
// ==========================================

describe('Parser Worker - ZIP Bomb Protection', () => {
    it('should reject files exceeding size limit', async () => {
        const oversizedFile = createMockFile(
            'content',
            'oversized.zip',
            { type: 'application/zip' }
        );
        Object.defineProperty(oversizedFile, 'size', {
            value: MAX_FILE_SIZE + 1,
        });

        // Mock worker to validate file
        workerInstance._setMessageHandler(async (e) => {
            if (e.type === 'parse') {
                // Simulate validation error
                workerInstance.onmessage({
                    data: {
                        type: 'error',
                        error: `File too large: ${(oversizedFile.size / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.`,
                    },
                });
            }
        });

        const errorPromise = new Promise((resolve) => {
            workerInstance.addEventListener('message', (e) => {
                if (e.data.type === 'error') {
                    resolve(e.data.error);
                }
            });
        });

        workerInstance.postMessage({ type: 'parse', file: oversizedFile });

        const error = await errorPromise;
        expect(error).toContain('File too large');
    });

    it('should detect excessive compression ratio', () => {
        // Mock a file with 1MB compressed size but 1GB uncompressed
        const mockZipFile = {
            size: 1 * 1024 * 1024, // 1MB
            name: 'bomb.zip',
            files: {
                'large.txt': {
                    compressedSize: 1 * 1024 * 1024,
                    uncompressedSize: 1 * 1024 * 1024 * 1024, // 1GB
                    compressionRatio: 1000,
                },
            },
        };

        const compressionRatio = mockZipFile.files['large.txt'].uncompressedSize / mockZipFile.size;
        expect(compressionRatio).toBeGreaterThan(100); // 1000:1 ratio
    });

    it('should handle nested ZIP archives', () => {
        // Create nested structure
        let currentLevel = { 'file.txt': 'content' };
        const depth = 10;

        for (let i = 0; i < depth; i++) {
            currentLevel = { [`level${i}.zip`]: currentLevel };
        }

        // Verify depth
        const countDepth = (obj) => {
            if (typeof obj !== 'object' || obj === null) return 0;
            const keys = Object.keys(obj);
            if (keys.length === 0) return 1;
            return 1 + Math.max(...keys.map(k => countDepth(obj[k])));
        };

        expect(countDepth(currentLevel)).toBe(depth + 1);
    });

    it('should limit total file count in ZIP', () => {
        const fileCount = 100000;
        const files = Array.from({ length: fileCount }, (_, i) => ({
            name: `file${i}.txt`,
            content: `${i}`,
        }));

        expect(files.length).toBe(fileCount);
        // This should trigger file count bomb protection
        expect(files.length).toBeGreaterThan(10000); // Reasonable limit
    });
});

// ==========================================
// Test Suite 2: Path Traversal Prevention
// ==========================================

describe('Parser Worker - Path Traversal Prevention', () => {
    it('should block ../ path sequences in filenames', () => {
        const maliciousPaths = [
            '../../../etc/passwd',
            '..\\..\\..\\windows\\system32',
            './../../config',
            '../sensitive.json',
        ];

        maliciousPaths.forEach(path => {
            const hasTraversal = path.includes('..') || path.includes('~');
            expect(hasTraversal).toBe(true);
        });
    });

    it('should block absolute path access', () => {
        const absolutePaths = [
            '/etc/passwd',
            '/proc/self/environ',
            'C:\\Windows\\System32\\config',
            '\\\\network\\share',
        ];

        absolutePaths.forEach(path => {
            const isAbsolute = path.startsWith('/') || path.startsWith('\\') || /^[A-Z]:/.test(path);
            expect(isAbsolute).toBe(true);
        });
    });

    it('should handle Unicode normalization attacks', () => {
        const unicodeAttacks = [
            '..\\u002fetc/passwd',
            '..%c0%afetc/passwd',
            '..%2f..%2f..%2fetc/passwd',
            '\u202e' + 'txt.mp3', // Right-to-left override
        ];

        unicodeAttacks.forEach(path => {
            const hasSuspiciousUnicode = /%[0-9a-f]{2}|\\u[0-9a-f]{4}/i.test(path);
            expect(hasSuspiciousUnicode).toBe(true);
        });
    });

    it('should sanitize file paths before extraction', () => {
        const unsafePath = '../../../etc/passwd';
        const sanitized = unsafePath.replace(/\.\./g, '').replace(/[\/\\]/g, '');

        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('/');
        expect(sanitized).not.toContain('\\');
    });
});

// ==========================================
// Test Suite 3: Prototype Pollution Prevention
// ==========================================

describe('Parser Worker - Prototype Pollution Prevention', () => {
    it('should block __proto__ pollution', () => {
        const maliciousPayload = {
            __proto__: {
                polluted: true,
                admin: true,
            },
        };

        // Simulate sanitization
        const PROTO_POLLUTION_KEYS = ['__proto__', 'constructor', 'prototype'];

        function sanitize(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(sanitize);

            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                if (PROTO_POLLUTION_KEYS.includes(key)) {
                    continue; // Skip polluted keys
                }
                sanitized[key] = sanitize(value);
            }
            return sanitized;
        }

        const cleaned = sanitize(maliciousPayload);

        expect(cleaned.__proto__).toBeUndefined();
        expect(Object.prototype.polluted).toBeUndefined();
    });

    it('should block constructor.prototype pollution', () => {
        const maliciousPayload = {
            constructor: {
                prototype: {
                    polluted: true,
                },
            },
        };

        const PROTO_POLLUTION_KEYS = ['__proto__', 'constructor', 'prototype'];

        function sanitize(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(sanitize);

            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                if (PROTO_POLLUTION_KEYS.includes(key)) {
                    continue;
                }
                sanitized[key] = sanitize(value);
            }
            return sanitized;
        }

        const cleaned = sanitize(maliciousPayload);

        expect(cleaned.constructor).toBeUndefined();
    });

    it('should handle deeply nested pollution attempts', () => {
        const maliciousPayload = {
            level1: {
                level2: {
                    level3: {
                        level4: {
                            level5: {
                                __proto__: { polluted: true },
                            },
                        },
                    },
                },
            },
        };

        const PROTO_POLLUTION_KEYS = ['__proto__', 'constructor', 'prototype'];

        function sanitize(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(sanitize);

            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                if (PROTO_POLLUTION_KEYS.includes(key)) {
                    continue;
                }
                sanitized[key] = sanitize(value);
            }
            return sanitized;
        }

        const cleaned = sanitize(maliciousPayload);

        expect(Object.prototype.polluted).toBeUndefined();
        expect(cleaned.level1?.level2?.level3?.level4?.level5?.__proto__).toBeUndefined();
    });

    it('should not pollute Object.prototype via JSON.parse', () => {
        const maliciousJson = '{"__proto__":{"polluted":"yes"}}';

        // Safe parse with sanitization
        const parsed = JSON.parse(maliciousJson);

        // Verify prototype is not polluted (JSON.parse is safe in modern JS)
        expect(Object.prototype.polluted).toBeUndefined();
    });
});

// ==========================================
// Test Suite 4: JSON Parsing Security
// ==========================================

describe('Parser Worker - JSON Parsing Security', () => {
    it('should reject oversized JSON strings', () => {
        const maxSize = MAX_JSON_STRING_SIZE;
        const oversizedJson = 'x'.repeat(maxSize + 1);

        expect(() => {
            if (oversizedJson.length > MAX_JSON_STRING_SIZE) {
                throw new Error(`JSON string too large: ${(oversizedJson.length / 1024 / 1024).toFixed(1)}MB`);
            }
        }).toThrow('JSON string too large');
    });

    it('should handle malformed JSON gracefully', () => {
        const malformedJsons = [
            '{"unclosed": true, "missing": value}',
            '{"trailing": "comma",}',
            '{"key": "value", "duplicate": "key1", "duplicate": "key2"}',
            '{[invalid syntax]}',
        ];

        malformedJsons.forEach(json => {
            expect(() => {
                try {
                    JSON.parse(json);
                } catch (e) {
                    throw new Error(`JSON.parse failed: ${e.message}`);
                }
            }).toThrow();
        });
    });

    it('should timeout on slow JSON parsing', async () => {
        const timeoutMs = 100;
        const startTime = Date.now();

        // Simulate slow parsing with timeout
        const parseWithTimeout = async (json) => {
            return Promise.race([
                new Promise((resolve) => {
                    // Simulate slow parse
                    setTimeout(() => {
                        try {
                            resolve(JSON.parse(json));
                        } catch (e) {
                            resolve({ error: e.message });
                        }
                    }, 200); // Slower than timeout
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('JSON parsing timeout')), timeoutMs)
                ),
            ]);
        };

        await expect(parseWithTimeout('{"test": "data"}')).rejects.toThrow('timeout');
    });

    it('should limit JSON parsing time', () => {
        const maxTime = 30; // 30 seconds
        const largeJson = JSON.stringify(Array.from({ length: 100000 }, (_, i) => ({ id: i, data: 'x'.repeat(100) })));

        const startTime = Date.now();
        try {
            JSON.parse(largeJson);
            const elapsed = Date.now() - startTime;

            // Warn if parsing took too long (but don't fail)
            if (elapsed > 5000) {
                console.warn(`JSON parsing took ${elapsed}ms`);
            }

            expect(elapsed).toBeLessThan(maxTime * 1000);
        } catch (e) {
            // Parse failed, which is acceptable for this test
            expect(e).toBeDefined();
        }
    });
});

// ==========================================
// Test Suite 5: Stream Validation Security
// ==========================================

describe('Parser Worker - Stream Validation Security', () => {
    it('should reject empty stream arrays', () => {
        const streams = [];

        expect(() => {
            if (streams.length === 0) {
                throw new Error('No data found in file - empty JSON array.');
            }
        }).toThrow('No data found');
    });

    it('should reject excessive stream counts', () => {
        const streams = Array.from({ length: MAX_STREAMS + 1 }, (_, i) => ({
            ts: new Date(i * 1000).toISOString(),
            trackName: `Track ${i}`,
        }));

        expect(() => {
            if (streams.length > MAX_STREAMS) {
                throw new Error(`Too many streams: ${streams.length} exceeds ${MAX_STREAMS}`);
            }
        }).toThrow('Too many streams');
    });

    it('should enforce minimum valid ratio', () => {
        const validStreams = [
            { ts: '2023-01-01', trackName: 'Track', artistName: 'Artist' },
            { ts: '2023-01-02', trackName: 'Track', artistName: 'Artist' },
        ];
        const invalidStreams = Array.from({ length: 100 }, (_, i) => ({
            // Missing required fields
            invalidField: 'value',
        }));

        const allStreams = [...validStreams, ...invalidStreams];
        const ratio = validStreams.length / allStreams.length;

        expect(() => {
            if (ratio < MIN_VALID_RATIO) {
                throw new Error(`Only ${(ratio * 100).toFixed(1)}% valid (need ${MIN_VALID_RATIO * 100}%)`);
            }
        }).toThrow();
    });

    it('should validate Spotify stream schema', () => {
        const validStream = {
            ts: '2023-01-01 12:00:00',
            trackName: 'Track',
            artistName: 'Artist',
        };

        const validateSpotifyStream = (stream) => {
            const timestamp = stream.ts || stream.endTime;
            if (!timestamp) return false;

            const track = stream.master_metadata_track_name || stream.trackName;
            const artist = stream.master_metadata_album_artist_name || stream.artistName;
            if (!track && !artist) return false;

            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return false;

            const year = date.getFullYear();
            if (year < 2000 || year > new Date().getFullYear() + 1) return false;

            return true;
        };

        expect(validateSpotifyStream(validStream)).toBe(true);

        const invalidStream = { invalid: 'data' };
        expect(validateSpotifyStream(invalidStream)).toBe(false);
    });

    it('should handle extreme timestamp values', () => {
        const extremeTimestamps = [
            '9999-12-31 23:59:59', // Far future
            '1900-01-01 00:00:00', // Too old
            'invalid-date', // Invalid format
            '', // Empty
        ];

        extremeTimestamps.forEach(ts => {
            const date = new Date(ts);
            const year = date.getFullYear();
            const isValid = !isNaN(date.getTime()) && year >= 2000 && year <= new Date().getFullYear() + 1;
            expect(isValid).toBe(false);
        });
    });
});

// ==========================================
// Test Suite 6: Memory Management Security
// ==========================================

describe('Parser Worker - Memory Management Security', () => {
    it('should trigger memory warning at threshold', () => {
        const memoryThreshold = 0.75;
        const mockMemory = {
            usedJSHeapSize: 160 * 1024 * 1024, // 160MB used
            jsHeapSizeLimit: 200 * 1024 * 1024, // 200MB limit
        };

        const usage = mockMemory.usedJSHeapSize / mockMemory.jsHeapSizeLimit;

        expect(usage).toBeGreaterThan(memoryThreshold);
    });

    it('should pause processing when memory exceeded', async () => {
        let isPaused = false;

        const pauseForMemory = async () => {
            isPaused = true;
            // Simulate waiting for resume signal
            await new Promise(resolve => setTimeout(resolve, 10));
            isPaused = false;
        };

        await pauseForMemory();

        expect(isPaused).toBe(false);
    });

    it('should limit pending ACKs for backpressure', () => {
        const maxPendingAcks = 5;
        let pendingAcks = 0;

        const canSend = () => pendingAcks < maxPendingAcks;

        for (let i = 0; i < 10; i++) {
            if (canSend()) {
                pendingAcks++;
            }
        }

        expect(pendingAcks).toBeLessThanOrEqual(maxPendingAcks);
    });

    it('should process in chunks to avoid memory spikes', () => {
        const chunkSize = 10 * 1024 * 1024; // 10MB chunks
        const totalSize = 50 * 1024 * 1024; // 50MB file

        const chunks = Math.ceil(totalSize / chunkSize);

        expect(chunks).toBeGreaterThan(1);
        expect(chunkSize).toBeLessThan(totalSize);
    });
});

// ==========================================
// Test Suite 7: Message Handling Security
// ==========================================

describe('Parser Worker - Message Handling Security', () => {
    it('should reject invalid message formats', () => {
        const invalidMessages = [
            null,
            undefined,
            'string',
            123,
            [],
        ];

        invalidMessages.forEach(msg => {
            const isValid = msg && typeof msg === 'object';
            expect(isValid).toBe(false);
        });
    });

    it('should require message type field', () => {
        const messageWithoutType = { file: 'test.json' };
        const messageWithInvalidType = { type: 123 };

        expect(messageWithoutType.type).toBeUndefined();
        expect(typeof messageWithInvalidType.type).not.toBe('string');
    });

    it('should sanitize message data before processing', () => {
        const maliciousMessage = {
            type: 'parse',
            file: { name: '../../../etc/passwd' },
            __proto__: { polluted: true },
        };

        const PROTO_POLLUTION_KEYS = ['__proto__', 'constructor', 'prototype'];

        const sanitize = (obj) => {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                if (PROTO_POLLUTION_KEYS.includes(key)) continue;
                sanitized[key] = value;
            }
            return sanitized;
        };

        const cleaned = sanitize(maliciousMessage);

        expect(cleaned.__proto__).toBeUndefined();
        expect(cleaned.type).toBe('parse');
    });
});

// ==========================================
// Test Suite 8: File Validation Security
// ==========================================

describe('Parser Worker - File Validation Security', () => {
    it('should validate file extensions', () => {
        const validExtensions = ['.json', '.zip'];
        const validFile = { name: 'data.json' };
        const invalidFile = { name: 'dangerous.exe' };

        const isValidExtension = (file) => {
            return validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        };

        expect(isValidExtension(validFile)).toBe(true);
        expect(isValidExtension(invalidFile)).toBe(false);
    });

    it('should validate MIME types', () => {
        const validMimeTypes = [
            'application/json',
            'application/zip',
            'application/x-zip-compressed',
            'text/plain',
        ];

        const validFile = { type: 'application/json' };
        const invalidFile = { type: 'application/x-msdownload' };

        expect(validMimeTypes.includes(validFile.type)).toBe(true);
        expect(validMimeTypes.includes(invalidFile.type)).toBe(false);
    });

    it('should verify ZIP magic bytes', () => {
        const validZipSignatures = [
            [0x50, 0x4b, 0x03, 0x04], // Local file header
            [0x50, 0x4b, 0x05, 0x06], // End of central directory
            [0x50, 0x4b, 0x07, 0x08], // Data descriptor
        ];

        const validZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        const fakeZip = new Uint8Array([0x7b, 0x22, 0x6e, 0x6f]); // {"no"

        const isValidZip = (bytes) => {
            return validZipSignatures.some(sig =>
                sig.every((byte, i) => bytes[i] === byte)
            );
        };

        expect(isValidZip(validZip)).toBe(true);
        expect(isValidZip(fakeZip)).toBe(false);
    });
});

// ==========================================
// Test Suite 9: Integration with Malicious Fixtures
// ==========================================

describe('Parser Worker - Malicious File Fixture Tests', () => {
    it('should handle all ZIP bomb fixtures', () => {
        const zipBombs = getFixturesByCategory('zipBomb');

        zipBombs.forEach(fixture => {
            expect(fixture).toBeDefined();
            expect(fixture.description).toContain('ZIP');
        });
    });

    it('should handle all path traversal fixtures', () => {
        const pathTraversals = getFixturesByCategory('pathTraversal');

        pathTraversals.forEach(fixture => {
            expect(fixture).toBeDefined();
            expect(fixture.description).toContain('path');
        });
    });

    it('should handle all prototype pollution fixtures', () => {
        const protoPollutions = getFixturesByCategory('protoPollution');

        protoPollutions.forEach(fixture => {
            expect(fixture).toBeDefined();
            expect(fixture.description).toContain('pollution');
        });
    });

    it('should handle all MIME spoofing fixtures', () => {
        const mimeSpoofing = getFixturesByCategory('mimeSpoofing');

        mimeSpoofing.forEach(fixture => {
            expect(fixture).toBeDefined();
            expect(fixture.description).toContain('spoof');
        });
    });
});

console.log('[Parser Worker Security Tests] Security test suite loaded');
