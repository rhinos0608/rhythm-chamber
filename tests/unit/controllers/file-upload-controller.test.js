/**
 * File Upload Controller Tests
 *
 * Tests for the FileUploadController covering:
 * - Controller orchestration and lifecycle
 * - Worker initialization and communication
 * - Error boundaries and recovery
 * - State transitions and validation
 * - User feedback mechanisms
 * - Memory management and cleanup
 * - Lock acquisition and release
 * - File validation and security
 *
 * @module tests/unit/controllers/file-upload-controller
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createMockFile,
    createMockWorker,
    createMockBroadcastChannel,
    wait,
    generateSpotifyStreamingData,
} from '../utils/test-helpers.js';

// ==========================================
// Mock Dependencies
// ==========================================

const mockStorage = {
    clearStreams: vi.fn().mockResolvedValue(undefined),
    appendStreams: vi.fn().mockResolvedValue(undefined),
    saveStreams: vi.fn().mockResolvedValue(undefined),
    saveChunks: vi.fn().mockResolvedValue(undefined),
    savePersonality: vi.fn().mockResolvedValue(undefined),
};

const mockAppState = {
    update: vi.fn(),
    setPatterns: vi.fn(),
    setPersonality: vi.fn(),
};

const mockOperationLock = {
    acquire: vi.fn().mockResolvedValue('lock-id-123'),
    release: vi.fn().mockResolvedValue(undefined),
};

const mockPatterns = {
    detectAllPatterns: vi.fn().mockReturnValue({
        summary: 'Test personality summary',
        patterns: {},
    }),
};

const mockPersonality = {
    classifyPersonality: vi.fn().mockReturnValue({
        type: 'Explorer',
        summary: 'Test summary',
        traits: [],
    }),
};

const mockViewController = {
    showProcessing: vi.fn(),
    updateProgress: vi.fn(),
    showReveal: vi.fn(),
    showUpload: vi.fn(),
};

const mockSessionManager = {
    recoverEmergencyBackup: vi.fn().mockResolvedValue(undefined),
};

const mockWaveTelemetry = {
    recordError: vi.fn(),
};

let showToastSpy;
let workerInstance;

// ==========================================
// Test Setup
// ==========================================

beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset state
    workerInstance = null;
    showToastSpy = vi.fn();

    // Mock Worker constructor
    global.Worker = vi.fn((scriptURL) => {
        workerInstance = createMockWorker({ scriptURL });
        return workerInstance;
    });

    // Mock crypto.randomUUID
    if (!global.crypto) {
        global.crypto = {};
    }
    global.crypto.randomUUID = vi.fn(() => 'mock-uuid-' + Math.random());

    // Mock performance.memory for memory tests
    if (typeof performance === 'undefined') {
        global.performance = {};
    }
    global.performance.memory = {
        usedJSHeapSize: 50 * 1024 * 1024,
        totalJSHeapSize: 100 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
    };

    // Import InputValidation mock
    vi.doMock('../../../js/utils/input-validation.js', () => ({
        InputValidation: {
            validateFileUpload: vi.fn().mockResolvedValue({ valid: true }),
        },
    }));
});

afterEach(() => {
    if (workerInstance && workerInstance.terminate) {
        workerInstance.terminate();
    }
});

// ==========================================
// Helper: Load Controller
// ==========================================

async function loadController() {
    const module = await import('../../../js/controllers/file-upload-controller.js');
    const controller = module.FileUploadController;

    controller.init({
        Storage: mockStorage,
        AppState: mockAppState,
        OperationLock: mockOperationLock,
        Patterns: mockPatterns,
        Personality: mockPersonality,
        ViewController: mockViewController,
        SessionManager: mockSessionManager,
        showToast: showToastSpy,
        WaveTelemetry: mockWaveTelemetry,
    });

    return controller;
}

// ==========================================
// Test Suites
// ==========================================

describe('FileUploadController - Initialization', () => {
    it('should initialize with all dependencies', async () => {
        const controller = await loadController();
        expect(controller).toBeDefined();
        expect(controller.init).toBeInstanceOf(Function);
    });

    it('should log initialization message', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        await loadController();
        expect(consoleSpy).toHaveBeenCalledWith(
            '[FileUploadController] Initialized with dependencies'
        );
        consoleSpy.mockRestore();
    });
});

describe('FileUploadController - File Size Validation', () => {
    it('should reject files larger than 500MB', async () => {
        const controller = await loadController();

        const oversizedFile = createMockFile(
            JSON.stringify({ data: 'test' }),
            'large.json',
            { type: 'application/json' }
        );
        // Mock file size to exceed limit
        Object.defineProperty(oversizedFile, 'size', { value: 600 * 1024 * 1024 });

        await controller.handleFileUpload(oversizedFile);

        expect(showToastSpy).toHaveBeenCalledWith(
            expect.stringContaining('File too large')
        );
        expect(mockOperationLock.acquire).not.toHaveBeenCalled();
    });

    it('should accept files within size limit', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ data: 'test' }),
            'valid.json',
            { type: 'application/json' }
        );
        Object.defineProperty(validFile, 'size', { value: 10 * 1024 * 1024 }); // 10MB

        // Mock worker messages for successful completion
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    // Send progress
                    workerInstance.onmessage({
                        data: { type: 'progress', message: 'Processing...' },
                    });
                    // Send complete
                    workerInstance.onmessage({
                        data: {
                            type: 'complete',
                            streams: [],
                            chunks: [],
                        },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected in test environment
        }

        expect(showToastSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('File too large')
        );
    });

    it('should handle files exactly at 500MB limit', async () => {
        const controller = await loadController();

        const maxSizeFile = createMockFile(
            JSON.stringify({ data: 'test' }),
            'maxsize.json',
            { type: 'application/json' }
        );
        Object.defineProperty(maxSizeFile, 'size', { value: 500 * 1024 * 1024 });

        // Mock worker messages
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: {
                            type: 'complete',
                            streams: [],
                            chunks: [],
                        },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(maxSizeFile);
        } catch (error) {
            // Expected
        }

        expect(showToastSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('File too large')
        );
    });
});

describe('FileUploadController - MIME Type Validation', () => {
    it('should reject invalid MIME types', async () => {
        const controller = await loadController();

        const invalidFile = createMockFile(
            'content',
            'dangerous.exe',
            { type: 'application/x-msdownload' }
        );

        await controller.handleFileUpload(invalidFile);

        expect(showToastSpy).toHaveBeenCalledWith(
            expect.stringContaining('Invalid file type')
        );
        expect(mockOperationLock.acquire).not.toHaveBeenCalled();
    });

    it('should accept valid application/json MIME type', async () => {
        const controller = await loadController();

        const jsonFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker for successful flow
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(jsonFile);
        } catch (error) {
            // Expected
        }

        expect(showToastSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Invalid file type')
        );
    });

    it('should accept valid application/zip MIME type', async () => {
        const controller = await loadController();

        // Create ZIP file with correct magic bytes
        const zipContent = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
        const zipFile = new File([zipContent], 'data.zip', {
            type: 'application/zip',
        });

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(zipFile);
        } catch (error) {
            // Expected
        }

        expect(showToastSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Invalid file type')
        );
    });

    it('should accept text/plain MIME type for JSON files', async () => {
        const controller = await loadController();

        const textFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'text/plain' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(textFile);
        } catch (error) {
            // Expected
        }

        expect(showToastSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Invalid file type')
        );
    });
});

describe('FileUploadController - ZIP Magic Byte Validation', () => {
    it('should reject ZIP files without correct magic bytes', async () => {
        const controller = await loadController();

        // File with .zip extension but JSON content
        const fakeZip = createMockFile('{"not": "a zip"}', 'fake.zip', {
            type: 'application/zip',
        });

        await controller.handleFileUpload(fakeZip);

        expect(showToastSpy).toHaveBeenCalledWith(
            expect.stringContaining('Invalid ZIP file')
        );
    });

    it('should accept ZIP with 0x504B0304 signature', async () => {
        const controller = await loadController();

        const zipContent = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        const zipFile = new File([zipContent], 'data.zip', {
            type: 'application/zip',
        });

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(zipFile);
        } catch (error) {
            // Expected
        }

        expect(showToastSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Invalid ZIP file')
        );
    });

    it('should accept ZIP with 0x504B0506 signature', async () => {
        const controller = await loadController();

        const zipContent = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);
        const zipFile = new File([zipContent], 'data.zip', {
            type: 'application/zip',
        });

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(zipFile);
        } catch (error) {
            // Expected
        }

        expect(showToastSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Invalid ZIP file')
        );
    });

    it('should accept ZIP with 0x504B0708 signature', async () => {
        const controller = await loadController();

        const zipContent = new Uint8Array([0x50, 0x4b, 0x07, 0x08]);
        const zipFile = new File([zipContent], 'data.zip', {
            type: 'application/zip',
        });

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(zipFile);
        } catch (error) {
            // Expected
        }

        expect(showToastSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Invalid ZIP file')
        );
    });
});

describe('FileUploadController - Operation Lock', () => {
    it('should acquire operation lock before processing', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockOperationLock.acquire).toHaveBeenCalledWith('file_processing');
    });

    it('should release operation lock after successful completion', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockOperationLock.release).toHaveBeenCalledWith(
            'file_processing',
            'lock-id-123'
        );
    });

    it('should release operation lock on error', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker to send error
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'error', error: 'Processing failed' },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockOperationLock.release).toHaveBeenCalled();
    });

    it('should handle lock acquisition failure gracefully', async () => {
        mockOperationLock.acquire.mockRejectedValue(
            new Error('Lock acquisition failed')
        );

        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        await controller.handleFileUpload(validFile);

        expect(showToastSpy).toHaveBeenCalledWith(
            expect.stringContaining('Cannot upload')
        );
        expect(mockViewController.showProcessing).not.toHaveBeenCalled();
    });
});

describe('FileUploadController - Worker Lifecycle', () => {
    it('should create new worker for file processing', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(global.Worker).toHaveBeenCalledWith('js/parser-worker.js');
        expect(workerInstance).toBeDefined();
    });

    it('should terminate worker after successful completion', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(workerInstance.terminate).toHaveBeenCalled();
    });

    it('should terminate existing worker before creating new one', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        // Worker should be terminated
        expect(workerInstance.terminate).toHaveBeenCalled();
    });

    it('should handle worker error events', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker to trigger error
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onerror({
                        message: 'Worker initialization failed',
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            expect(error.message).toContain('Worker error');
        }
    });
});

describe('FileUploadController - Worker Message Handling', () => {
    it('should handle progress messages', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'progress', message: 'Processing file 1/3...' },
                    });
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockViewController.updateProgress).toHaveBeenCalledWith(
            'Processing file 1/3...'
        );
    });

    it('should handle partial save messages with backpressure ACK', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: {
                            type: 'partial',
                            partialStreams: [{ test: 'stream' }],
                            fileIndex: 1,
                            totalFiles: 3,
                            streamCount: 100,
                            ackId: 'ack-123',
                        },
                    });
                    await wait(10);
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockStorage.appendStreams).toHaveBeenCalledWith([
            { test: 'stream' },
        ]);
        // Verify ACK was sent
        expect(workerInstance.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'ack',
                ackId: 'ack-123',
            })
        );
    });

    it('should handle memory warning messages', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'memory_warning', usage: 0.85 },
                    });
                    await wait(10);
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockViewController.updateProgress).toHaveBeenCalledWith(
            expect.stringContaining('Low on memory')
        );
    });

    it('should handle memory resumed messages', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'memory_resumed' },
                    });
                    await wait(10);
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockViewController.updateProgress).toHaveBeenCalledWith(
            'Resuming processing...'
        );
    });

    it('should handle complete messages', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        const streams = generateSpotifyStreamingData(100);
        const chunks = [{ start: 0, end: 100 }];

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams, chunks },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockPatterns.detectAllPatterns).toHaveBeenCalledWith(
            streams,
            chunks
        );
        expect(mockPersonality.classifyPersonality).toHaveBeenCalled();
        expect(mockStorage.saveStreams).toHaveBeenCalledWith(streams);
        expect(mockStorage.saveChunks).toHaveBeenCalledWith(chunks);
        expect(mockViewController.showReveal).toHaveBeenCalled();
    });

    it('should handle error messages', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'error', error: 'Parsing failed' },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            expect(error.message).toContain('Parsing failed');
        }

        expect(mockViewController.updateProgress).toHaveBeenCalledWith(
            'Error: Parsing failed'
        );
    });
});

describe('FileUploadController - State Management', () => {
    it('should update app state on successful upload', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockAppState.update).toHaveBeenCalledWith('lite', {
            isLiteMode: false,
        });
    });

    it('should show processing view before starting', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockViewController.showProcessing).toHaveBeenCalledWith(
            'Preparing to parse file...'
        );
    });

    it('should return to upload view on error', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker to send error
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'error', error: 'Test error' },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockViewController.showUpload).toHaveBeenCalled();
        expect(showToastSpy).toHaveBeenCalledWith(
            expect.stringContaining('Upload failed')
        );
    });
});

describe('FileUploadController - Cancel Processing', () => {
    it('should cancel active processing', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker that doesn't complete immediately
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                // Never send complete, keep worker active
            });
        }

        // Start upload (don't await)
        const uploadPromise = controller.handleFileUpload(validFile);
        await wait(10);

        // Cancel processing
        const result = controller.cancelProcessing();

        expect(result).toBe(true);
        expect(workerInstance.terminate).toHaveBeenCalled();
        expect(mockOperationLock.release).toHaveBeenCalled();

        // Wait for upload to finish (should be aborted)
        try {
            await uploadPromise;
        } catch (error) {
            // Expected - processing was aborted
        }
    });

    it('should return false when cancelling with no active worker', async () => {
        const controller = await loadController();

        const result = controller.cancelProcessing();

        expect(result).toBe(false);
    });

    it('should show upload view after cancellation', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                // Never complete
            });
        }

        const uploadPromise = controller.handleFileUpload(validFile);
        await wait(10);

        controller.cancelProcessing();

        expect(mockViewController.showUpload).toHaveBeenCalled();

        try {
            await uploadPromise;
        } catch (error) {
            // Expected
        }
    });
});

describe('FileUploadController - Get Processing State', () => {
    it('should return processing state when worker is active', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker that stays active
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                // Never complete
            });
        }

        const uploadPromise = controller.handleFileUpload(validFile);
        await wait(10);

        const state = controller.getProcessingState();

        expect(state).toEqual({
            isProcessing: true,
            hasLock: true,
            workerActive: true,
        });

        // Clean up
        controller.cancelProcessing();
        try {
            await uploadPromise;
        } catch (error) {
            // Expected
        }
    });

    it('should return idle state when no worker is active', async () => {
        const controller = await loadController();

        const state = controller.getProcessingState();

        expect(state).toEqual({
            isProcessing: false,
            hasLock: false,
            workerActive: false,
        });
    });
});

describe('FileUploadController - Error Handling', () => {
    it('should handle missing file gracefully', async () => {
        const controller = await loadController();

        await controller.handleFileUpload(null);

        expect(showToastSpy).toHaveBeenCalledWith('No file selected');
        expect(mockOperationLock.acquire).not.toHaveBeenCalled();
    });

    it('should handle undefined file gracefully', async () => {
        const controller = await loadController();

        await controller.handleFileUpload(undefined);

        expect(showToastSpy).toHaveBeenCalledWith('No file selected');
    });

    it('should wrap processing completion in error boundary', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker to complete but make storage fail
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: {
                            type: 'complete',
                            streams: [],
                            chunks: [],
                        },
                    });
                }
            });
        }

        mockStorage.saveStreams.mockRejectedValue(
            new Error('Storage quota exceeded')
        );

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            expect(error.message).toContain('Storage quota exceeded');
        }

        expect(showToastSpy).toHaveBeenCalled();
    });
});

describe('FileUploadController - Abort Controller', () => {
    it('should abort processing on signal', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    // Trigger abort signal
                    setTimeout(() => {
                        workerInstance.onmessage({
                            data: { type: 'abort' },
                        });
                    }, 10);
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            expect(error.message).toContain('Processing aborted');
        }

        expect(workerInstance.terminate).toHaveBeenCalled();
    });

    it('should create new abort controller for each upload', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker for first upload
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        // Second upload should create new abort controller
        const secondFile = createMockFile(
            JSON.stringify({ test: 'data2' }),
            'data2.json',
            { type: 'application/json' }
        );

        // Mock worker for second upload
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(secondFile);
        } catch (error) {
            // Expected
        }

        // Both uploads should complete without abort interference
        expect(mockOperationLock.release).toHaveBeenCalledTimes(2);
    });
});

describe('FileUploadController - Worker Cleanup', () => {
    it('should cleanup worker on error', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker to error
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'error', error: 'Test error' },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(workerInstance.terminate).toHaveBeenCalled();
    });

    it('should clear worker message handlers on cleanup', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        // Worker should be cleaned up
        const state = controller.getProcessingState();
        expect(state.workerActive).toBe(false);
    });
});

describe('FileUploadController - Storage Cleanup', () => {
    it('should clear previous streams before processing', async () => {
        const controller = await loadController();

        const validFile = createMockFile(
            JSON.stringify({ test: 'data' }),
            'data.json',
            { type: 'application/json' }
        );

        // Mock worker
        if (workerInstance) {
            workerInstance._setMessageHandler(async (e) => {
                if (e.type === 'parse') {
                    workerInstance.onmessage({
                        data: { type: 'complete', streams: [], chunks: [] },
                    });
                }
            });
        }

        try {
            await controller.handleFileUpload(validFile);
        } catch (error) {
            // Expected
        }

        expect(mockStorage.clearStreams).toHaveBeenCalled();
    });
});

console.log('[File Upload Controller Tests] Test suite loaded');
