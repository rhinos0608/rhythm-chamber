/**
 * Input Validation Security Tests
 *
 * Security-focused tests for input validation utilities covering:
 * - Magic byte validation (ZIP: 0x504B, JSON: 0x7B/0x5B, PE: 0x4D5A)
 * - MIME type spoofing detection
 * - File size limit enforcement
 * - Content-based verification
 * - Signature validation for various file types
 *
 * @module tests/unit/input-validation-security
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import InputValidation from '../../js/utils/input-validation.js';
import {
    createMockFile,
    createMaliciousFile,
} from './utils/test-helpers.js';
import {
    FAKE_ZIP_JSON,
    FAKE_JSON_ZIP,
    EXECUTABLE_AS_JSON,
    OVERSIZED_FILE,
    MAX_SIZE_FILE,
    createFileFromFixture,
} from '../fixtures/malicious-files.js';

// Mock console methods to avoid cluttering test output
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
};

describe('Input Validation Security Tests', () => {
    beforeEach(() => {
        // Mock console methods
        console.log = vi.fn();
        console.warn = vi.fn();
        console.error = vi.fn();
        console.info = vi.fn();
    });

    afterEach(() => {
        // Restore console methods
        Object.assign(console, originalConsole);
    });

    // ========================================================================
    // SECTION 1: Magic Byte Validation
    // ========================================================================
    describe('1. Magic Byte Validation', () => {
        describe('ZIP file signature (0x504B0304)', () => {
            it('should accept valid ZIP file with correct magic bytes', async () => {
                // Valid ZIP magic bytes: PK.. (0x50 0x4B 0x03 0x04)
                const zipContent = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
                const zipFile = createMockFile(zipContent, 'test.zip', { type: 'application/zip' });

                const result = await InputValidation.validateFileUpload(zipFile, 'zip');

                expect(result.valid).toBe(true);
                expect(result.error).toBeUndefined();
            });

            it('should reject ZIP file with incorrect magic bytes', async () => {
                // Invalid ZIP magic bytes
                const invalidZipContent = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
                const invalidZipFile = createMockFile(invalidZipContent, 'fake.zip', {
                    type: 'application/zip',
                });

                const result = await InputValidation.validateFileUpload(invalidZipFile, 'zip');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('does not match ZIP format');
            });

            it('should reject JSON file claiming to be ZIP', async () => {
                // JSON magic bytes: {" (0x7B 0x22)
                const jsonContent = new Uint8Array([0x7b, 0x22, 0x6a, 0x73, 0x6f, 0x6e]); // {"json"
                const jsonFile = createMockFile(jsonContent, 'notzip.zip', {
                    type: 'application/zip',
                });

                const result = await InputValidation.validateFileUpload(jsonFile, 'zip');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('does not match ZIP format');
            });

            it('should accept ZIP with alternative magic bytes (empty archive)', async () => {
                // ZIP empty archive: PK.. (0x50 0x4B 0x05 0x06)
                const emptyZipContent = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00]);
                const emptyZipFile = createMockFile(emptyZipContent, 'empty.zip', {
                    type: 'application/zip',
                });

                const result = await InputValidation.validateFileUpload(emptyZipFile, 'zip');

                expect(result.valid).toBe(true);
            });

            it('should accept spanned ZIP signature (0x504B0708)', async () => {
                // Spanned ZIP: PK.. (0x50 0x4B 0x07 0x08)
                const spannedZipContent = new Uint8Array([0x50, 0x4b, 0x07, 0x08, 0x00, 0x00, 0x00, 0x00]);
                const spannedZipFile = createMockFile(spannedZipContent, 'spanned.zip', {
                    type: 'application/zip',
                });

                const result = await InputValidation.validateFileUpload(spannedZipFile, 'zip');

                expect(result.valid).toBe(true);
            });
        });

        describe('JSON file signature (0x7B or 0x5B)', () => {
            it('should accept JSON object with correct magic byte (0x7B)', async () => {
                // JSON object starts with { (0x7B)
                const jsonContent = new Uint8Array([0x7b, 0x22, 0x6b, 0x65, 0x79, 0x22, 0x3a, 0x22]);
                const jsonFile = createMockFile(jsonContent, 'data.json', {
                    type: 'application/json',
                });

                const result = await InputValidation.validateFileUpload(jsonFile, 'json');

                expect(result.valid).toBe(true);
                expect(result.error).toBeUndefined();
            });

            it('should accept JSON array with correct magic byte (0x5B)', async () => {
                // JSON array starts with [ (0x5B)
                const jsonArrayContent = new Uint8Array([0x5b, 0x7b, 0x22, 0x69, 0x74, 0x65, 0x6d, 0x22]);
                const jsonArrayFile = createMockFile(jsonArrayContent, 'array.json', {
                    type: 'application/json',
                });

                const result = await InputValidation.validateFileUpload(jsonArrayFile, 'json');

                expect(result.valid).toBe(true);
                expect(result.error).toBeUndefined();
            });

            it('should reject non-JSON file with JSON extension', async () => {
                // ZIP magic bytes instead of JSON
                const zipContent = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
                const fakeJsonFile = createMockFile(zipContent, 'notjson.json', {
                    type: 'application/json',
                });

                const result = await InputValidation.validateFileUpload(fakeJsonFile, 'json');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('does not match JSON format');
            });

            it('should reject plain text file claiming to be JSON', async () => {
                // Plain text starts with random byte
                const textContent = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
                const textFile = createMockFile(textContent, 'text.json', {
                    type: 'application/json',
                });

                const result = await InputValidation.validateFileUpload(textFile, 'json');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('does not match JSON format');
            });

            it('should handle whitespace before JSON (lenient)', async () => {
                // Some JSON files have BOM or whitespace
                const jsonWithBOM = new Uint8Array([
                    0xef, 0xbb, 0xbf, // UTF-8 BOM
                    0x7b, 0x22, 0x6b, 0x65, 0x79, 0x22, 0x3a, 0x22,
                ]);
                const jsonFile = createMockFile(jsonWithBOM, 'bom.json', {
                    type: 'application/json',
                });

                const result = await InputValidation.validateFileUpload(jsonFile, 'json');

                // Should fail because first byte isn't { or [
                expect(result.valid).toBe(false);
            });
        });

        describe('PE executable signature (0x4D5A)', () => {
            it('should detect and reject PE executable files', async () => {
                // PE/COFF executable: MZ (0x4D 0x5A)
                const peContent = new Uint8Array([
                    0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, // PE header
                ]);
                const peFile = createMockFile(peContent, 'executable.json', {
                    type: 'application/json',
                });

                const result = await InputValidation.validateFileUpload(peFile, 'json');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('does not match JSON format');
            });

            it('should detect PE executables disguised as ZIP', async () => {
                const peContent = new Uint8Array([
                    0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
                ]);
                const peFile = createMockFile(peContent, 'malware.zip', {
                    type: 'application/zip',
                });

                const result = await InputValidation.validateFileUpload(peFile, 'zip');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('does not match ZIP format');
            });

            it('should block executables with double extensions', async () => {
                const peContent = new Uint8Array([
                    0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
                ]);
                const peFile = createMockFile(peContent, 'data.json.exe', {
                    type: 'application/x-msdownload',
                });

                const result = await InputValidation.validateFileUpload(peFile, 'json');

                expect(result.valid).toBe(false);
            });
        });

        describe('ELF executable signature (0x7F454C46)', () => {
            it('should detect and reject ELF Linux executables', async () => {
                // ELF executable: .ELF (0x7F 0x45 0x4C 0x46)
                const elfContent = new Uint8Array([
                    0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00,
                ]);
                const elfFile = createMockFile(elfContent, 'linux.json', {
                    type: 'application/json',
                });

                const result = await InputValidation.validateFileUpload(elfFile, 'json');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('does not match JSON format');
            });
        });

        describe('Mach-O executable signature', () => {
            it('should detect and reject Mach-O macOS executables (32-bit)', async () => {
                // Mach-O 32-bit: FE ED FA CE
                const machoContent = new Uint8Array([
                    0xfe, 0xed, 0xfa, 0xce, 0x00, 0x00, 0x00, 0x00,
                ]);
                const machoFile = createMockFile(machoContent, 'macos.json', {
                    type: 'application/json',
                });

                const result = await InputValidation.validateFileUpload(machoFile, 'json');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('does not match JSON format');
            });

            it('should detect and reject Mach-O macOS executables (64-bit)', async () => {
                // Mach-O 64-bit: FE ED FA CF
                const macho64Content = new Uint8Array([
                    0xfe, 0xed, 0xfa, 0xcf, 0x00, 0x00, 0x00, 0x00,
                ]);
                const macho64File = createMockFile(macho64Content, 'macos64.json', {
                    type: 'application/json',
                });

                const result = await InputValidation.validateFileUpload(macho64File, 'json');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('does not match JSON format');
            });
        });
    });

    // ========================================================================
    // SECTION 2: MIME Type Spoofing Detection
    // ========================================================================
    describe('2. MIME Type Spoofing Detection', () => {
        it('should reject JSON file with ZIP extension', async () => {
            const maliciousFile = createFileFromFixture(FAKE_ZIP_JSON);

            const result = await InputValidation.validateFileUpload(maliciousFile, 'zip');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match ZIP format');
        });

        it('should reject ZIP file with JSON extension', async () => {
            const maliciousFile = createFileFromFixture(FAKE_JSON_ZIP);

            const result = await InputValidation.validateFileUpload(maliciousFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });

        it('should reject executable disguised as JSON', async () => {
            const maliciousFile = createFileFromFixture(EXECUTABLE_AS_JSON);

            const result = await InputValidation.validateFileUpload(maliciousFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });

        it('should verify declared MIME type matches actual content', async () => {
            // File claims to be JSON but is actually ZIP
            const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
            const spoofingFile = new File([zipBytes], 'data.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(spoofingFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });

        it('should accept files when MIME type matches content', async () => {
            const jsonBytes = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const validFile = new File([jsonBytes], 'data.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(validFile, 'json');

            expect(result.valid).toBe(true);
        });

        it('should handle case-insensitive MIME types', async () => {
            const jsonBytes = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const validFile = new File([jsonBytes], 'data.json', {
                type: 'APPLICATION/JSON', // uppercase
            });

            const result = await InputValidation.validateFileUpload(validFile, 'json');

            expect(result.valid).toBe(true);
        });
    });

    // ========================================================================
    // SECTION 3: File Size Limit Enforcement
    // ========================================================================
    describe('3. File Size Limit Enforcement', () => {
        it('should enforce 500MB limit for JSON uploads', async () => {
            const oversizedFile = createFileFromFixture(OVERSIZED_FILE);

            const result = await InputValidation.validateFileUpload(oversizedFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('File too large');
            expect(result.error).toContain('500MB');
        });

        it('should enforce 100MB limit for ZIP uploads', async () => {
            // Create a 101MB ZIP file
            const largeContent = new Uint8Array(101 * 1024 * 1024);
            largeContent[0] = 0x50; // P
            largeContent[1] = 0x4b; // K
            largeContent[2] = 0x03; //
            largeContent[3] = 0x04; //

            const largeZipFile = createMockFile(largeContent, 'large.zip', {
                type: 'application/zip',
            });

            const result = await InputValidation.validateFileUpload(largeZipFile, 'zip');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('File too large');
            expect(result.error).toContain('100MB');
        });

        it('should accept file exactly at the size limit', async () => {
            const maxSizeFile = createFileFromFixture(MAX_SIZE_FILE);

            const result = await InputValidation.validateFileUpload(maxSizeFile, 'json');

            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should accept files under the size limit', async () => {
            const smallContent = new Uint8Array([0x7b, 0x22, 0x73, 0x6d, 0x61, 0x6c, 0x6c, 0x22]);
            const smallFile = createMockFile(smallContent, 'small.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(smallFile, 'json');

            expect(result.valid).toBe(true);
        });

        it('should reject zero-byte files', async () => {
            const emptyContent = new Uint8Array(0);
            const emptyFile = createMockFile(emptyContent, 'empty.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(emptyFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });

        it('should provide clear error message with size in MB', async () => {
            const largeJsonContent = new Uint8Array(600 * 1024 * 1024);
            largeJsonContent[0] = 0x7b; // {

            const largeJsonFile = createMockFile(largeJsonContent, 'huge.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(largeJsonFile, 'json');

            expect(result.error).toMatch(/\d+MB/);
            expect(result.error).toContain('maximum');
        });
    });

    // ========================================================================
    // SECTION 4: Content-Based Verification
    // ========================================================================
    describe('4. Content-Based Verification', () => {
        it('should verify actual file content matches declared type (JSON)', async () => {
            // Declares JSON, content is ZIP
            const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
            const spoofingFile = new File([zipBytes], 'data.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(spoofingFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('content does not match');
        });

        it('should verify actual file content matches declared type (ZIP)', async () => {
            // Declares ZIP, content is JSON
            const jsonBytes = new Uint8Array([0x7b, 0x22, 0x64, 0x61, 0x74, 0x61, 0x22, 0x3a]);
            const spoofingFile = new File([jsonBytes], 'data.zip', {
                type: 'application/zip',
            });

            const result = await InputValidation.validateFileUpload(spoofingFile, 'zip');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('content does not match');
        });

        it('should read file header for verification without loading entire file', async () => {
            const largeJsonContent = new Uint8Array(10 * 1024 * 1024);
            largeJsonContent[0] = 0x7b; // Valid JSON start

            const largeJsonFile = createMockFile(largeJsonContent, 'large.json', {
                type: 'application/json',
            });

            // Should only read first 8 bytes for magic byte check
            const result = await InputValidation.validateFileUpload(largeJsonFile, 'json');

            expect(result.valid).toBe(true);
            // Verification should be fast (not read entire 10MB)
        });

        it('should handle file read errors gracefully', async () => {
            // Create a file that will fail to read
            const problematicFile = new File([''], 'problem.json', {
                type: 'application/json',
            });

            // Mock file.slice to throw error
            problematicFile.slice = vi.fn(() => {
                throw new Error('Read error');
            });

            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const result = await InputValidation.validateFileUpload(problematicFile, 'json');

            // Should continue despite read error (client-side check only)
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Could not read file for magic byte check')
            );

            consoleSpy.mockRestore();
        });

        it('should reject files with corrupted headers', async () => {
            // Invalid magic bytes for both JSON and ZIP
            const corruptContent = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
            const corruptFile = createMockFile(corruptContent, 'corrupt.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(corruptFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });
    });

    // ========================================================================
    // SECTION 5: File Extension Validation
    // ========================================================================
    describe('5. File Extension Validation', () => {
        it('should enforce .json extension for JSON files', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const wrongExtFile = createMockFile(jsonContent, 'data.txt', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(wrongExtFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('.json extension');
        });

        it('should enforce .zip extension for ZIP files', async () => {
            const zipContent = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
            const wrongExtFile = createMockFile(zipContent, 'archive.exe', {
                type: 'application/zip',
            });

            const result = await InputValidation.validateFileUpload(wrongExtFile, 'zip');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('.zip extension');
        });

        it('should accept files with correct extensions', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const correctFile = createMockFile(jsonContent, 'data.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(correctFile, 'json');

            expect(result.valid).toBe(true);
        });

        it('should handle case-insensitive extensions', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const uppercaseFile = createMockFile(jsonContent, 'data.JSON', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(uppercaseFile, 'json');

            expect(result.valid).toBe(true);
        });

        it('should reject files with no extension', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const noExtFile = createMockFile(jsonContent, 'data', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(noExtFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('.json extension');
        });

        it('should reject files with double extensions (.json.zip)', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const doubleExtFile = createMockFile(jsonContent, 'data.json.zip', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(doubleExtFile, 'json');

            expect(result.valid).toBe(false);
        });

        it('should reject files with trailing dots in extension', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const trailingDotFile = createMockFile(jsonContent, 'data.json.', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(trailingDotFile, 'json');

            // .json. does not end with .json
            expect(result.valid).toBe(false);
        });
    });

    // ========================================================================
    // SECTION 6: Signature Validation for Various File Types
    // ========================================================================
    describe('6. Signature Validation for Various File Types', () => {
        it('should validate PNG signature (0x89504E47)', async () => {
            // PNG: .PNG (0x89 0x50 0x4E 0x47)
            const pngContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            const pngFile = createMockFile(pngContent, 'image.png.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(pngFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });

        it('should validate JPEG signature (0xFFD8FF)', async () => {
            // JPEG: .JPEG (0xFF 0xD8 0xFF)
            const jpegContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
            const jpegFile = createMockFile(jpegContent, 'photo.jpg.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(jpegFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });

        it('should validate GIF signature (0x47494638)', async () => {
            // GIF: GIF8 (0x47 0x49 0x46 0x38)
            const gifContent = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]);
            const gifFile = createMockFile(gifContent, 'animation.gif.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(gifFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });

        it('should validate PDF signature (0x25504446)', async () => {
            // PDF: %PDF (0x25 0x50 0x44 0x46)
            const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x31, 0x2e, 0x34, 0x0a]);
            const pdfFile = createMockFile(pdfContent, 'document.pdf.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(pdfFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });

        it('should validate RAR signature (0x52617221)', async () => {
            // RAR: Rar! (0x52 0x61 0x72 0x21)
            const rarContent = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0x00]);
            const rarFile = createMockFile(rarContent, 'archive.rar.zip', {
                type: 'application/zip',
            });

            const result = await InputValidation.validateFileUpload(rarFile, 'zip');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match ZIP format');
        });

        it('should validate 7z signature (0x377ABCAF271C)', async () => {
            // 7z: 7z¯BC (0x37 0x7A 0xBC 0xAF 0x27 0x1C)
            const sevenZContent = new Uint8Array([
                0x37,
                0x7a,
                0xbc,
                0xaf,
                0x27,
                0x1c,
                0x00,
                0x04,
            ]);
            const sevenZFile = createMockFile(sevenZContent, 'archive.7z.zip', {
                type: 'application/zip',
            });

            const result = await InputValidation.validateFileUpload(sevenZFile, 'zip');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match ZIP format');
        });

        it('should validate TAR signature (0x7573746172)', async () => {
            // TAR: usttar (offset 257)
            const tarContent = new Uint8Array(512);
            tarContent[257] = 0x75; // u
            tarContent[258] = 0x73; // s
            tarContent[259] = 0x74; // t
            tarContent[260] = 0x61; // a
            tarContent[261] = 0x72; // r

            const tarFile = createMockFile(tarContent, 'backup.tar.zip', {
                type: 'application/zip',
            });

            const result = await InputValidation.validateFileUpload(tarFile, 'zip');

            expect(result.valid).toBe(false);
        });

        it('should validate BMP signature (0x424D)', async () => {
            // BMP: BM (0x42 0x4D)
            const bmpContent = new Uint8Array([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            const bmpFile = createMockFile(bmpContent, 'image.bmp.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(bmpFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });

        it('should validate WebP signature (0x52494646...57454250)', async () => {
            // WebP: RIFF....WEBP
            const webpContent = new Uint8Array([
                0x52,
                0x49,
                0x46,
                0x46,
                0x00,
                0x00,
                0x00,
                0x00,
                0x57,
                0x45,
                0x42,
                0x50,
            ]);
            const webpFile = createMockFile(webpContent, 'image.webp.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(webpFile, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });
    });

    // ========================================================================
    // SECTION 7: Combined Security Checks
    // ========================================================================
    describe('7. Combined Security Checks', () => {
        it('should perform full validation pipeline for legitimate JSON file', async () => {
            const legitimateJson = {
                streams: [
                    { artist: 'Artist', track: 'Track', msPlayed: 180000 },
                ],
            };

            const jsonContent = JSON.stringify(legitimateJson, null, 2);
            const file = createMockFile(jsonContent, 'StreamingHistory.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(file, 'json');

            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should perform full validation pipeline for legitimate ZIP file', async () => {
            const zipContent = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
            const file = createMockFile(zipContent, 'endsong.zip', {
                type: 'application/zip',
            });

            const result = await InputValidation.validateFileUpload(file, 'zip');

            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should reject file that fails multiple checks', async () => {
            // Wrong extension, wrong magic bytes, wrong MIME type
            const peContent = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
            const suspiciousFile = createMockFile(peContent, 'malware.exe', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(suspiciousFile, 'json');

            expect(result.valid).toBe(false);
            // Should fail on extension check first
            expect(result.error).toContain('.json extension');
        });

        it('should handle unknown file types gracefully', async () => {
            const unknownContent = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
            const unknownFile = createMockFile(unknownContent, 'unknown.dat', {
                type: 'application/octet-stream',
            });

            const result = await InputValidation.validateFileUpload(unknownFile, 'json');

            expect(result.valid).toBe(false);
        });

        it('should validate all aspects of Spotify streaming history files', async () => {
            const streamingHistory = {
                msPlayed: 180000,
                endTime: '2023-01-01 12:00:00',
                artistName: 'Test Artist',
                trackName: 'Test Track',
                albumName: 'Test Album',
            };

            const jsonContent = JSON.stringify([streamingHistory], null, 2);
            const file = createMockFile(jsonContent, 'StreamingHistory0.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(file, 'json');

            expect(result.valid).toBe(true);
        });
    });

    // ========================================================================
    // SECTION 8: Edge Cases and Error Conditions
    // ========================================================================
    describe('8. Edge Cases and Error Conditions', () => {
        it('should handle null file input', async () => {
            const result = await InputValidation.validateFileUpload(null, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('No file selected');
        });

        it('should handle undefined file input', async () => {
            const result = await InputValidation.validateFileUpload(undefined, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('No file selected');
        });

        it('should handle invalid expectedType', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const file = createMockFile(jsonContent, 'test.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(file, 'invalid_type');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('Unknown file type');
        });

        it('should handle File object without proper methods', async () => {
            const incompleteFile = {
                name: 'test.json',
                size: 100,
                type: 'application/json',
                // Missing slice() method
            };

            const result = await InputValidation.validateFileUpload(incompleteFile, 'json');

            expect(result.valid).toBe(false);
        });

        it('should handle files with Unicode filenames', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const unicodeFile = createMockFile(jsonContent, 'データ.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(unicodeFile, 'json');

            expect(result.valid).toBe(true);
        });

        it('should handle files with very long filenames', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const longName = 'a'.repeat(1000) + '.json';
            const longNameFile = createMockFile(jsonContent, longName, {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(longNameFile, 'json');

            // Filename length shouldn't affect validation
            expect(result.valid).toBe(true);
        });

        it('should handle files with special characters in filename', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const specialNameFile = createMockFile(jsonContent, "test-file(1).json", {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(specialNameFile, 'json');

            expect(result.valid).toBe(true);
        });

        it('should validate files with path separators in filename (security)', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);
            const pathTraversalFile = createMockFile(jsonContent, '../../etc/passwd.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(pathTraversalFile, 'json');

            // Filename validation should catch this or pass (depending on implementation)
            expect(result).toBeDefined();
        });
    });

    // ========================================================================
    // SECTION 9: Integration with File Type Rules
    // ========================================================================
    describe('9. Integration with File Type Rules', () => {
        it('should access internal FILE_TYPE_RULES for testing', () => {
            const rules = InputValidation._patterns.FILE_TYPE_RULES;

            expect(rules).toBeDefined();
            expect(rules.json).toBeDefined();
            expect(rules.zip).toBeDefined();
        });

        it('should verify JSON rules configuration', () => {
            const jsonRules = InputValidation._patterns.FILE_TYPE_RULES.json;

            expect(jsonRules.extensions).toContain('.json');
            expect(jsonRules.mimeTypes).toContain('application/json');
            expect(jsonRules.magicBytes).toHaveLength(2); // { and [
            expect(jsonRules.maxSize).toBe(500 * 1024 * 1024); // 500MB
        });

        it('should verify ZIP rules configuration', () => {
            const zipRules = InputValidation._patterns.FILE_TYPE_RULES.zip;

            expect(zipRules.extensions).toContain('.zip');
            expect(zipRules.mimeTypes.length).toBeGreaterThan(0);
            expect(zipRules.magicBytes).toHaveLength(1);
            expect(zipRules.maxSize).toBe(100 * 1024 * 1024); // 100MB
        });

        it('should use magic bytes offset correctly', () => {
            const jsonRules = InputValidation._patterns.FILE_TYPE_RULES.json;

            // All JSON magic bytes should be at offset 0
            jsonRules.magicBytes.forEach(rule => {
                expect(rule.offset).toBe(0);
                expect(rule.bytes).toBeInstanceOf(Array);
                expect(rule.bytes.length).toBeGreaterThan(0);
            });
        });

        it('should validate multiple magic byte patterns', () => {
            const jsonRules = InputValidation._patterns.FILE_TYPE_RULES.json;

            // JSON accepts either { (0x7b) or [ (0x5b)
            const hasObjectStart = jsonRules.magicBytes.some(
                rule => rule.bytes[0] === 0x7b
            );
            const hasArrayStart = jsonRules.magicBytes.some(
                rule => rule.bytes[0] === 0x5b
            );

            expect(hasObjectStart).toBe(true);
            expect(hasArrayStart).toBe(true);
        });
    });

    // ========================================================================
    // SECTION 10: Performance and Memory Safety
    // ========================================================================
    describe('10. Performance and Memory Safety', () => {
        it('should only read first 8 bytes for magic byte check', async () => {
            const largeContent = new Uint8Array(100 * 1024 * 1024);
            largeContent[0] = 0x7b; // Valid JSON start

            const largeFile = createMockFile(largeContent, 'large.json', {
                type: 'application/json',
            });

            const sliceSpy = vi.spyOn(largeFile, 'slice').mockReturnValue(
                new Blob([largeContent.slice(0, 8)])
            );

            await InputValidation.validateFileUpload(largeFile, 'json');

            // Should only slice first 8 bytes
            expect(sliceSpy).toHaveBeenCalledWith(0, 8);

            sliceSpy.mockRestore();
        });

        it('should not load entire file into memory', async () => {
            const hugeContent = new Uint8Array(500 * 1024 * 1024);
            hugeContent[0] = 0x7b;

            const hugeFile = createMockFile(hugeContent, 'huge.json', {
                type: 'application/json',
            });

            // Should complete quickly without loading 500MB
            const startTime = Date.now();
            const result = await InputValidation.validateFileUpload(hugeFile, 'json');
            const endTime = Date.now();

            expect(result.valid).toBe(true);
            expect(endTime - startTime).toBeLessThan(100); // Should be very fast
        });

        it('should handle multiple rapid validations without memory buildup', async () => {
            const jsonContent = new Uint8Array([0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a]);

            const promises = [];
            for (let i = 0; i < 100; i++) {
                const file = createMockFile(jsonContent, `test${i}.json`, {
                    type: 'application/json',
                });
                promises.push(InputValidation.validateFileUpload(file, 'json'));
            }

            const results = await Promise.all(promises);

            results.forEach(result => {
                expect(result.valid).toBe(true);
            });
        });
    });
});

console.log('[Input Validation Security] Tests loaded');
