/**
 * File Upload E2E Integration Tests
 *
 * End-to-end tests for complete file upload flows covering:
 * 1. Complete upload-to-storage flows (file selection → parsing → storage → patterns → personality)
 * 2. Worker communication (message passing, error handling, cleanup)
 * 3. Error recovery (parser failures, storage errors, network issues)
 * 4. Multi-file processing (ZIP with multiple JSON files)
 * 5. Full integration with all dependencies (Storage, AppState, Patterns, Personality, ViewController)
 *
 * @module tests/integration/file-upload-e2e.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileUploadController } from '../../js/controllers/file-upload-controller.js';

// ==========================================
// Mock Dependencies
// ==========================================

const mockStorage = {
    clearStreams: vi.fn().mockResolvedValue(undefined),
    appendStreams: vi.fn().mockResolvedValue(undefined),
    saveStreams: vi.fn().mockResolvedValue(undefined),
    saveChunks: vi.fn().mockResolvedValue(undefined),
    savePersonality: vi.fn().mockResolvedValue(undefined),
    getStreams: vi.fn().mockResolvedValue([]),
    getChunks: vi.fn().mockResolvedValue([]),
    getPersonality: vi.fn().mockResolvedValue(null),
};

const mockAppState = {
    update: vi.fn().mockResolvedValue(undefined),
    setPatterns: vi.fn().mockResolvedValue(undefined),
    setPersonality: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue(null),
};

const mockOperationLock = {
    acquire: vi.fn().mockResolvedValue('lock-123'),
    release: vi.fn().mockResolvedValue(undefined),
};

const mockPatterns = {
    detectAllPatterns: vi.fn().mockReturnValue({
        comfortDiscovery: { ratio: 25, description: 'Balanced' },
        eras: { hasEras: false },
        summary: 'Test patterns summary',
    }),
};

const mockPersonality = {
    classifyPersonality: vi.fn().mockReturnValue({
        type: 'discovery_junkie',
        name: 'The Discovery Junkie',
        emoji: '🔍',
        tagline: 'Always hunting for the next sound.',
        description: "You're constantly seeking new artists.",
        scores: {},
        evidence: {},
        breakdown: [],
    }),
};

const mockViewController = {
    showProcessing: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    showReveal: vi.fn().mockResolvedValue(undefined),
    showUpload: vi.fn().mockResolvedValue(undefined),
};

const mockSessionManager = {
    recoverEmergencyBackup: vi.fn().mockResolvedValue(undefined),
};

const mockWaveTelemetry = {
    recordError: vi.fn().mockResolvedValue(undefined),
    recordMetric: vi.fn().mockResolvedValue(undefined),
};

const mockShowToast = vi.fn().mockReturnValue(undefined);

// Mock Worker
class MockWorker {
    constructor(url) {
        this.url = url;
        this.onmessage = null;
        this.onerror = null;
        this.terminated = false;
    }

    postMessage(data) {
        // Simulate async worker response
        setTimeout(() => {
            if (this.terminated) return;

            if (this.onmessage) {
                const event = { data };
                this.onmessage(event);
            }
        }, 0);
    }

    terminate() {
        this.terminated = true;
        this.onmessage = null;
        this.onerror = null;
    }

    // Helper to simulate worker messages in tests
    simulateMessage(type, data) {
        if (this.onmessage && !this.terminated) {
            this.onmessage({ data: { type, ...data } });
        }
    }

    simulateError(error) {
        if (this.onerror && !this.terminated) {
            this.onerror({ message: error });
        }
    }
}

// ==========================================
// Test Setup
// ==========================================

describe('File Upload E2E Integration Tests', () => {
    let workerInstance = null;
    let originalWorker = null;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // Mock Worker constructor
        originalWorker = global.Worker;
        global.Worker = MockWorker;

        // Initialize FileUploadController with mocks
        FileUploadController.init({
            Storage: mockStorage,
            AppState: mockAppState,
            OperationLock: mockOperationLock,
            Patterns: mockPatterns,
            Personality: mockPersonality,
            ViewController: mockViewController,
            SessionManager: mockSessionManager,
            showToast: mockShowToast,
            WaveTelemetry: mockWaveTelemetry,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        global.Worker = originalWorker;
        workerInstance = null;
    });

    // ==========================================
    // Suite 1: Complete Upload-to-Storage Flows
    // ==========================================

    describe('Complete Upload-to-Storage Flows', () => {
        it('should process JSON file from selection to personality classification', async () => {
            const fileContent = [
                {
                    ts: '2026-02-01T13:12:57.841Z',
                    master_metadata_track_name: 'Test Song',
                    master_metadata_album_artist_name: 'Test Artist',
                    master_metadata_album_album_name: 'Test Album',
                    ms_played: 180000,
                    platform: 'android',
                    shuffle: true,
                    skipped: false,
                    offline: false,
                    reason_start: 'trackdone',
                    reason_end: 'trackdone',
                },
            ];

            const file = new File(
                [JSON.stringify(fileContent)],
                'StreamingHistory.json',
                { type: 'application/json' }
            );

            // Mock InputValidation
            const mockInputValidation = {
                validateFileUpload: vi.fn().mockResolvedValue({ valid: true }),
            };

            // Mock dynamic import
            vi.doMock('../../js/utils/input-validation.js', () => ({
                InputValidation: mockInputValidation,
            }));

            // Start upload
            const uploadPromise = FileUploadController.handleFileUpload(file);

            // Wait for worker creation
            await vi.runAllTimersAsync();

            // Simulate worker progress messages
            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('progress', { message: 'Reading JSON file...' });
            worker.simulateMessage('progress', { message: 'Found 1 streams, validating...' });
            worker.simulateMessage('progress', { message: 'Sorting and deduplicating...' });
            worker.simulateMessage('progress', { message: 'Enriching stream data...' });
            worker.simulateMessage('progress', { message: 'Generating chunks...' });

            // Simulate completion
            const mockStreams = [
                {
                    playedAt: '2026-02-01T13:12:57.841Z',
                    trackName: 'Test Song',
                    artistName: 'Test Artist',
                    albumName: 'Test Album',
                    msPlayed: 180000,
                    completionRate: 0.95,
                    playType: 'full',
                },
            ];

            const mockChunks = [
                {
                    id: 'week-2026-01-26',
                    type: 'weekly',
                    startDate: '2026-01-26',
                    streamCount: 1,
                    uniqueArtists: 1,
                    uniqueTracks: 1,
                },
            ];

            worker.simulateMessage('complete', {
                streams: mockStreams,
                chunks: mockChunks,
            });

            await uploadPromise;

            // Verify complete flow
            expect(mockOperationLock.acquire).toHaveBeenCalledWith('file_processing');
            expect(mockStorage.clearStreams).toHaveBeenCalled();
            expect(mockViewController.showProcessing).toHaveBeenCalledWith('Preparing to parse file...');
            expect(mockViewController.updateProgress).toHaveBeenCalledWith('Detecting behavioral patterns...');
            expect(mockPatterns.detectAllPatterns).toHaveBeenCalledWith(mockStreams, mockChunks);
            expect(mockAppState.setPatterns).toHaveBeenCalled();
            expect(mockViewController.updateProgress).toHaveBeenCalledWith('Classifying personality...');
            expect(mockPersonality.classifyPersonality).toHaveBeenCalled();
            expect(mockAppState.setPersonality).toHaveBeenCalled();
            expect(mockViewController.updateProgress).toHaveBeenCalledWith('Saving...');
            expect(mockStorage.saveStreams).toHaveBeenCalledWith(mockStreams);
            expect(mockStorage.saveChunks).toHaveBeenCalledWith(mockChunks);
            expect(mockStorage.savePersonality).toHaveBeenCalled();
            expect(mockViewController.showReveal).toHaveBeenCalled();
            expect(mockOperationLock.release).toHaveBeenCalledWith('file_processing', 'lock-123');
        });

        it('should process ZIP file with multiple JSON files', async () => {
            // Create mock ZIP file
            const zipContent = new Blob(['mock zip content'], {
                type: 'application/zip',
            });
            const file = new File([zipContent], 'spotify_data.zip', {
                type: 'application/zip',
            });

            // Mock ZIP signature validation
            const arrayBuffer = new ArrayBuffer(4);
            const view = new Uint8Array(arrayBuffer);
            view[0] = 0x50; // P
            view[1] = 0x4b; // K
            view[2] = 0x03;
            view[3] = 0x04;

            file.slice = vi.fn().mockReturnValue({
                arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            // Simulate multi-file processing
            worker.simulateMessage('progress', { message: 'Extracting archive...' });
            worker.simulateMessage('progress', { message: 'Found 3 history files...' });

            // Simulate partial saves for each file
            worker.simulateMessage('partial', {
                fileIndex: 1,
                totalFiles: 3,
                streamCount: 5000,
                ackId: 1,
            });

            worker.simulateMessage('partial', {
                fileIndex: 2,
                totalFiles: 3,
                streamCount: 10000,
                ackId: 2,
            });

            worker.simulateMessage('partial', {
                fileIndex: 3,
                totalFiles: 3,
                streamCount: 15000,
                ackId: 3,
            });

            // Simulate completion
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            // Verify multi-file handling
            expect(mockStorage.appendStreams).toHaveBeenCalledTimes(3);
            expect(mockViewController.updateProgress).toHaveBeenCalledWith(
                expect.stringContaining('Parsing file')
            );
        });

        it('should update AppState through all processing stages', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            // Verify AppState updates
            expect(mockAppState.update).toHaveBeenCalledWith('lite', { isLiteMode: false });
            expect(mockAppState.update).toHaveBeenCalledWith('data', {
                streams: expect.any(Array),
                chunks: expect.any(Array),
            });
            expect(mockAppState.setPatterns).toHaveBeenCalled();
            expect(mockAppState.setPersonality).toHaveBeenCalled();
        });
    });

    // ==========================================
    // Suite 2: Worker Communication
    // ==========================================

    describe('Worker Communication', () => {
        it('should handle worker progress messages', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            // Send multiple progress updates
            worker.simulateMessage('progress', { message: 'Processing...' });
            worker.simulateMessage('progress', { message: 'Still processing...' });
            worker.simulateMessage('progress', { message: 'Almost done...' });

            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            expect(mockViewController.updateProgress).toHaveBeenCalledTimes(5); // 3 progress + 2 for patterns/personality
        });

        it('should handle worker errors and cleanup', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('error', { error: 'Parse error: Invalid JSON' });

            await expect(uploadPromise).rejects.toThrow('Parse error: Invalid JSON');

            // Verify cleanup
            expect(mockViewController.showUpload).toHaveBeenCalled();
            expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Upload failed'));
            expect(mockOperationLock.release).toHaveBeenCalled();
        });

        it('should handle worker onerror callback', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateError('Worker crashed');

            await expect(uploadPromise).rejects.toThrow('Worker crashed');

            expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Upload failed'));
        });

        it('should implement backpressure with ACK messages', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            // Send multiple partial messages with ACK IDs
            worker.simulateMessage('partial', {
                fileIndex: 1,
                totalFiles: 5,
                streamCount: 5000,
                ackId: 1,
            });

            worker.simulateMessage('partial', {
                fileIndex: 2,
                totalFiles: 5,
                streamCount: 10000,
                ackId: 2,
            });

            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            // Verify ACKs were sent back to worker
            expect(worker.postMessage).toHaveBeenCalledWith({ type: 'ack', ackId: 1 });
            expect(worker.postMessage).toHaveBeenCalledWith({ type: 'ack', ackId: 2 });
        });

        it('should handle memory warning and resume signals', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            // Simulate memory pressure
            worker.simulateMessage('memory_warning', {
                usage: 0.85,
            });

            expect(mockViewController.updateProgress).toHaveBeenCalledWith(
                expect.stringContaining('Low on memory')
            );

            // Simulate memory resumed
            worker.simulateMessage('memory_resumed');

            expect(mockViewController.updateProgress).toHaveBeenCalledWith(
                'Resuming processing...'
            );

            // Complete the flow
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;
        });
    });

    // ==========================================
    // Suite 3: Error Recovery
    // ==========================================

    describe('Error Recovery', () => {
        it('should recover from parser failures and show upload view', async () => {
            const file = new File(['invalid json'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('error', { error: 'JSON.parse failed: Unexpected token' });

            await expect(uploadPromise).rejects.toThrow();

            // Verify error recovery
            expect(mockViewController.showUpload).toHaveBeenCalled();
            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('Upload failed')
            );
            expect(mockOperationLock.release).toHaveBeenCalled();
        });

        it('should handle storage errors during save', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            // Mock storage failure
            mockStorage.saveStreams.mockRejectedValueOnce(
                new Error('IndexedDB quota exceeded')
            );

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await expect(uploadPromise).rejects.toThrow();

            // Verify error was handled
            expect(mockWaveTelemetry.recordError).toHaveBeenCalled();
        });

        it('should handle operation lock acquisition failure', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            // Mock lock acquisition failure
            mockOperationLock.acquire.mockRejectedValueOnce(
                new Error('LockAcquisitionError: File already being processed')
            );

            await FileUploadController.handleFileUpload(file);

            // Should show toast and not proceed
            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('Cannot upload')
            );
            expect(mockViewController.showProcessing).not.toHaveBeenCalled();
        });

        it('should handle invalid file types gracefully', async () => {
            const file = new File(['content'], 'invalid.exe', {
                type: 'application/x-msdownload',
            });

            await FileUploadController.handleFileUpload(file);

            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('Invalid file type')
            );
            expect(mockOperationLock.acquire).not.toHaveBeenCalled();
        });

        it('should handle file size validation', async () => {
            // Create file larger than 500MB limit
            const largeContent = new Array(600 * 1024 * 1024).fill('x').join('');
            const file = new File([largeContent], 'large.json', {
                type: 'application/json',
            });

            await FileUploadController.handleFileUpload(file);

            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('File too large')
            );
            expect(mockOperationLock.acquire).not.toHaveBeenCalled();
        });

        it('should recover from pattern detection errors', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            // Mock pattern detection failure
            mockPatterns.detectAllPatterns.mockImplementationOnce(() => {
                throw new Error('Pattern detection failed');
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await expect(uploadPromise).rejects.toThrow();

            // Verify error boundary wrapped the operation
            expect(mockWaveTelemetry.recordError).toHaveBeenCalled();
        });

        it('should handle personality classification errors', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            // Mock personality classification failure
            mockPersonality.classifyPersonality.mockImplementationOnce(() => {
                throw new Error('Personality classification failed');
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await expect(uploadPromise).rejects.toThrow();

            expect(mockWaveTelemetry.recordError).toHaveBeenCalled();
        });
    });

    // ==========================================
    // Suite 4: Multi-File Processing (ZIP)
    // ==========================================

    describe('Multi-File Processing (ZIP)', () => {
        it('should process all JSON files in ZIP archive', async () => {
            const zipContent = new Blob(['PK...'], { type: 'application/zip' });
            const file = new File([zipContent], 'spotify_data.zip', {
                type: 'application/zip',
            });

            // Mock ZIP signature
            const arrayBuffer = new ArrayBuffer(4);
            const view = new Uint8Array(arrayBuffer);
            view[0] = 0x50;
            view[1] = 0x4b;
            view[2] = 0x03;
            view[3] = 0x04;

            file.slice = vi.fn().mockReturnValue({
                arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            // Simulate processing 5 files
            for (let i = 1; i <= 5; i++) {
                worker.simulateMessage('partial', {
                    fileIndex: i,
                    totalFiles: 5,
                    streamCount: i * 3000,
                    ackId: i,
                });
            }

            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            // Verify all files were processed
            expect(mockStorage.appendStreams).toHaveBeenCalledTimes(5);
        });

        it('should handle partial saves with backpressure for large ZIPs', async () => {
            const file = new File(['PK...'], 'large_spotify_data.zip', {
                type: 'application/zip',
            });

            // Mock ZIP signature
            const arrayBuffer = new ArrayBuffer(4);
            const view = new Uint8Array(arrayBuffer);
            view[0] = 0x50;
            view[1] = 0x4b;
            view[2] = 0x03;
            view[3] = 0x04;

            file.slice = vi.fn().mockReturnValue({
                arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            // Simulate many partial messages to test backpressure
            for (let i = 1; i <= 20; i++) {
                worker.simulateMessage('partial', {
                    fileIndex: Math.ceil(i / 4),
                    totalFiles: 5,
                    streamCount: i * 1000,
                    ackId: i,
                });
            }

            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            // Verify all ACKs were sent
            expect(mockStorage.appendStreams).toHaveBeenCalledTimes(20);
        });

        it('should detect temporal overlap in ZIP data', async () => {
            const file = new File(['PK...'], 'spotify_data.zip', {
                type: 'application/zip',
            });

            // Mock ZIP signature
            const arrayBuffer = new ArrayBuffer(4);
            const view = new Uint8Array(arrayBuffer);
            view[0] = 0x50;
            view[1] = 0x4b;
            view[2] = 0x03;
            view[3] = 0x04;

            file.slice = vi.fn().mockReturnValue({
                arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
            });

            // Mock existing streams
            mockStorage.getStreams.mockResolvedValueOnce([
                {
                    playedAt: '2026-01-01T00:00:00Z',
                    trackName: 'Existing Song',
                    artistName: 'Existing Artist',
                },
            ]);

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            // Simulate overlap detection
            worker.simulateMessage('overlap_detected', {
                overlap: {
                    hasOverlap: true,
                    overlapPeriod: {
                        start: '2026-01-01',
                        end: '2026-02-01',
                        days: 31,
                    },
                    stats: {
                        totalNew: 1000,
                        exactDuplicates: 100,
                        uniqueNew: 900,
                    },
                },
            });

            await vi.runAllTimersAsync();

            // Worker should pause and wait for user decision
            // In real scenario, user would choose merge/replace/keep
            // For now, just verify overlap was detected
            expect(mockStorage.getStreams).toHaveBeenCalled();
        });
    });

    // ==========================================
    // Suite 5: State Transitions
    // ==========================================

    describe('State Transitions', () => {
        it('should transition from upload to processing to reveal', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            // Start in upload state
            expect(mockViewController.showProcessing).not.toHaveBeenCalled();

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            // Should be in processing state
            expect(mockViewController.showProcessing).toHaveBeenCalled();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            // Should end in reveal state
            expect(mockViewController.showReveal).toHaveBeenCalled();
        });

        it('should return to upload state on error', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('error', { error: 'Processing failed' });

            await expect(uploadPromise).rejects.toThrow();

            // Should return to upload state
            expect(mockViewController.showUpload).toHaveBeenCalled();
        });

        it('should track processing state correctly', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            // Initially not processing
            expect(FileUploadController.getProcessingState().isProcessing).toBe(false);

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            // Should be processing
            expect(FileUploadController.getProcessingState().isProcessing).toBe(true);
            expect(FileUploadController.getProcessingState().hasLock).toBe(true);

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            // Should not be processing
            expect(FileUploadController.getProcessingState().isProcessing).toBe(false);
            expect(FileUploadController.getProcessingState().hasLock).toBe(false);
        });

        it('should handle cancel during processing', () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            FileUploadController.handleFileUpload(file);
            vi.runAllTimersAsync();

            // Cancel processing
            const cancelled = FileUploadController.cancelProcessing();

            expect(cancelled).toBe(true);
            expect(mockViewController.showUpload).toHaveBeenCalled();
            expect(mockOperationLock.release).toHaveBeenCalled();
        });

        it('should return false when canceling with no active worker', () => {
            const cancelled = FileUploadController.cancelProcessing();

            expect(cancelled).toBe(false);
        });
    });

    // ==========================================
    // Suite 6: Full Integration with All Dependencies
    // ==========================================

    describe('Full Integration with Dependencies', () => {
        it('should integrate with Storage layer throughout flow', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            // Verify storage was cleared at start
            expect(mockStorage.clearStreams).toHaveBeenCalled();

            const worker = MockWorker.mock.instances[0];

            // Simulate partial save
            worker.simulateMessage('partial', {
                fileIndex: 1,
                totalFiles: 1,
                streamCount: 5000,
                ackId: 1,
            });

            // Verify partial save
            expect(mockStorage.appendStreams).toHaveBeenCalled();

            // Complete
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            // Verify final saves
            expect(mockStorage.saveStreams).toHaveBeenCalled();
            expect(mockStorage.saveChunks).toHaveBeenCalled();
            expect(mockStorage.savePersonality).toHaveBeenCalled();
        });

        it('should integrate with Patterns and Personality detection', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            const mockStreams = [
                {
                    playedAt: '2026-02-01T00:00:00Z',
                    trackName: 'Song',
                    artistName: 'Artist',
                },
            ];

            const mockChunks = [{ id: 'week-1', type: 'weekly' }];

            worker.simulateMessage('complete', {
                streams: mockStreams,
                chunks: mockChunks,
            });

            await uploadPromise;

            // Verify pattern detection
            expect(mockPatterns.detectAllPatterns).toHaveBeenCalledWith(
                mockStreams,
                mockChunks
            );

            // Verify personality classification
            expect(mockPersonality.classifyPersonality).toHaveBeenCalled();
        });

        it('should integrate with ViewController for all UI updates', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            // Progress updates
            worker.simulateMessage('progress', { message: 'Processing...' });
            worker.simulateMessage('progress', { message: 'Almost done...' });

            // Complete
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            // Verify all view updates
            expect(mockViewController.showProcessing).toHaveBeenCalled();
            expect(mockViewController.updateProgress).toHaveBeenCalledWith('Processing...');
            expect(mockViewController.updateProgress).toHaveBeenCalledWith(
                'Detecting behavioral patterns...'
            );
            expect(mockViewController.updateProgress).toHaveBeenCalledWith(
                'Classifying personality...'
            );
            expect(mockViewController.updateProgress).toHaveBeenCalledWith('Saving...');
            expect(mockViewController.showReveal).toHaveBeenCalled();
        });

        it('should integrate with SessionManager for backup recovery', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            // Note: Backup recovery happens in processFile(), not handleFileUpload()
            // This is called after successful completion
            expect(mockSessionManager.recoverEmergencyBackup).not.toHaveBeenCalled();
        });

        it('should integrate with WaveTelemetry for error tracking', async () => {
            const file = new File(['[]'], 'StreamingHistory.json', {
                type: 'application/json',
            });

            // Mock an error during pattern detection
            mockPatterns.detectAllPatterns.mockImplementationOnce(() => {
                throw new Error('Pattern detection error');
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await expect(uploadPromise).rejects.toThrow();

            // Verify telemetry recorded the error
            expect(mockWaveTelemetry.recordError).toHaveBeenCalled();
        });

        it('should integrate with OperationLock for concurrent upload prevention', async () => {
            const file1 = new File(['[]'], 'file1.json', {
                type: 'application/json',
            });
            const file2 = new File(['[]'], 'file2.json', {
                type: 'application/json',
            });

            // First upload acquires lock
            mockOperationLock.acquire.mockResolvedValueOnce('lock-1');

            const upload1 = FileUploadController.handleFileUpload(file1);

            // Second upload should fail to acquire lock
            mockOperationLock.acquire.mockRejectedValueOnce(
                new Error('LockAcquisitionError: File already being processed')
            );

            await FileUploadController.handleFileUpload(file2);

            // Verify second upload was rejected
            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('Cannot upload')
            );

            // Complete first upload
            await vi.runAllTimersAsync();
            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await upload1;
        });
    });

    // ==========================================
    // Suite 7: Edge Cases and Corner Cases
    // ==========================================

    describe('Edge Cases and Corner Cases', () => {
        it('should handle empty JSON file', async () => {
            const file = new File(['[]'], 'empty.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            // Worker should handle empty array
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            await uploadPromise;

            expect(mockViewController.showReveal).toHaveBeenCalled();
        });

        it('should handle null file gracefully', async () => {
            await FileUploadController.handleFileUpload(null);

            expect(mockShowToast).toHaveBeenCalledWith('No file selected');
            expect(mockOperationLock.acquire).not.toHaveBeenCalled();
        });

        it('should handle undefined file gracefully', async () => {
            await FileUploadController.handleFileUpload(undefined);

            expect(mockShowToast).toHaveBeenCalledWith('No file selected');
        });

        it('should handle cleanup on abort', async () => {
            const file = new File(['[]'], 'test.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            // Simulate abort signal
            const worker = MockWorker.mock.instances[0];
            worker.terminate();

            await expect(uploadPromise).rejects.toThrow();
            expect(mockOperationLock.release).toHaveBeenCalled();
        });

        it('should handle worker cleanup errors gracefully', async () => {
            const file = new File(['[]'], 'test.json', {
                type: 'application/json',
            });

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];

            // Mock terminate to throw error
            worker.terminate = vi.fn().mockImplementation(() => {
                throw new Error('Worker already terminated');
            });

            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            // Should not throw despite terminate error
            await uploadPromise;

            expect(mockViewController.showReveal).toHaveBeenCalled();
        });

        it('should handle lock release errors without failing upload', async () => {
            const file = new File(['[]'], 'test.json', {
                type: 'application/json',
            });

            // Mock lock release to fail
            mockOperationLock.release.mockRejectedValueOnce(
                new Error('Lock not found')
            );

            const uploadPromise = FileUploadController.handleFileUpload(file);
            await vi.runAllTimersAsync();

            const worker = MockWorker.mock.instances[0];
            worker.simulateMessage('complete', {
                streams: [],
                chunks: [],
            });

            // Should complete successfully despite lock release error
            await uploadPromise;

            expect(mockViewController.showReveal).toHaveBeenCalled();
        });
    });
});
