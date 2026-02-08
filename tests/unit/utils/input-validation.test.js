/**
 * Unit Tests: Input Validation Utilities
 *
 * Comprehensive security tests for input validation following OWASP standards
 * Tests cover:
 * - API key validation for all providers
 * - URL validation with protocol whitelisting (block javascript:, data:, file:)
 * - File upload validation with magic byte verification
 * - URL parameter XSS prevention
 * - Placeholder detection
 *
 * @see /workspaces/rhythm-chamber/js/utils/input-validation.js
 * @module tests/unit/utils/input-validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InputValidation } from '../../../js/utils/input-validation.js';

describe('InputValidation - API Key Validation', () => {
    describe('validateApiKey', () => {
        describe('OpenRouter API Keys', () => {
            it('should accept valid OpenRouter API key', () => {
                const result = InputValidation.validateApiKey(
                    'openrouter',
                    'sk-or-v1-abcdefghijklmno1234567890pqrstuvwx'
                );

                expect(result.valid).toBe(true);
                expect(result.value).toBe('sk-or-v1-abcdefghijklmno1234567890pqrstuvwx');
            });

            it('should reject OpenRouter key with wrong prefix', () => {
                const result = InputValidation.validateApiKey(
                    'openrouter',
                    'sk-ant-abcdefghijklmno1234567890pqrstuvwx'
                );

                expect(result.valid).toBe(false);
                expect(result.error).toContain('OpenRouter API key');
            });

            it('should reject OpenRouter key that is too short', () => {
                const result = InputValidation.validateApiKey(
                    'openrouter',
                    'sk-or-v1-short'
                );

                expect(result.valid).toBe(false);
                expect(result.error).toContain('at least 40 characters');
            });

            it('should trim whitespace from OpenRouter key', () => {
                const result = InputValidation.validateApiKey(
                    'openrouter',
                    '  sk-or-v1-abcdefghijklmno1234567890pqrstuvwx  '
                );

                expect(result.valid).toBe(true);
                expect(result.value).toBe('sk-or-v1-abcdefghijklmno1234567890pqrstuvwx');
            });
        });

        describe('Gemini API Keys', () => {
            it('should accept valid Gemini API key', () => {
                const result = InputValidation.validateApiKey(
                    'gemini',
                    'AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe'
                );

                expect(result.valid).toBe(true);
            });

            it('should reject Gemini key with wrong format', () => {
                const result = InputValidation.validateApiKey(
                    'gemini',
                    'sk-or-v1-abcdefghijklmno1234567890pqrstuvwx'
                );

                expect(result.valid).toBe(false);
                expect(result.error).toContain('Google AI Studio API key');
            });
        });

        describe('Claude API Keys', () => {
            it('should accept valid Claude API key', () => {
                const result = InputValidation.validateApiKey(
                    'claude',
                    'sk-ant-api03-1234567890abcdefghijklmnopqrstuv'
                );

                expect(result.valid).toBe(true);
            });

            it('should reject Claude key with wrong prefix', () => {
                const result = InputValidation.validateApiKey(
                    'claude',
                    'sk-or-v1-abcdefghijklmno1234567890pqrstuvwx'
                );

                expect(result.valid).toBe(false);
                expect(result.error).toContain('Anthropic API key');
            });
        });

        describe('OpenAI API Keys', () => {
            it('should accept valid OpenAI API key', () => {
                const result = InputValidation.validateApiKey(
                    'openai',
                    'sk-1234567890abcdefghijklmnopqrstuv1234567890ABCDE'
                );

                expect(result.valid).toBe(true);
            });

            it('should reject OpenAI key that is too short', () => {
                const result = InputValidation.validateApiKey(
                    'openai',
                    'sk-short'
                );

                expect(result.valid).toBe(false);
                expect(result.error).toContain('at least 51 characters');
            });
        });

        describe('Spotify Client IDs', () => {
            it('should accept valid Spotify Client ID', () => {
                const result = InputValidation.validateApiKey(
                    'spotify',
                    'abcdefghijklmnopqrstuvwxyz123456'
                );

                expect(result.valid).toBe(true);
            });

            it('should reject Spotify Client ID with special characters', () => {
                const result = InputValidation.validateApiKey(
                    'spotify',
                    'abc-def-ghi'
                );

                expect(result.valid).toBe(false);
            });
        });

        describe('Placeholder Detection', () => {
            it('should reject your-api-key-here placeholder', () => {
                const result = InputValidation.validateApiKey(
                    'openrouter',
                    'your-api-key-here'
                );

                expect(result.valid).toBe(false);
                expect(result.error).toContain('not a placeholder');
            });

            it('should reject your-spotify-client-id placeholder', () => {
                const result = InputValidation.validateApiKey(
                    'spotify',
                    'your-spotify-client-id'
                );

                expect(result.valid).toBe(false);
                expect(result.error).toContain('not a placeholder');
            });

            it('should reject enter-api-key placeholder', () => {
                const result = InputValidation.validateApiKey(
                    'claude',
                    'enter-api-key'
                );

                expect(result.valid).toBe(false);
                expect(result.error).toContain('not a placeholder');
            });

            it('should be case-insensitive when detecting placeholders', () => {
                const result = InputValidation.validateApiKey(
                    'openrouter',
                    'YOUR-API-KEY-HERE'
                );

                expect(result.valid).toBe(false);
            });
        });

        describe('Empty and Null Values', () => {
            it('should reject empty string', () => {
                const result = InputValidation.validateApiKey('openrouter', '');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('required');
            });

            it('should reject null', () => {
                const result = InputValidation.validateApiKey('openrouter', null);

                expect(result.valid).toBe(false);
                expect(result.error).toContain('required');
            });

            it('should reject undefined', () => {
                const result = InputValidation.validateApiKey('openrouter', undefined);

                expect(result.valid).toBe(false);
                expect(result.error).toContain('required');
            });

            it('should reject non-string values', () => {
                const result = InputValidation.validateApiKey('openrouter', 12345);

                expect(result.valid).toBe(false);
                expect(result.error).toContain('required');
            });
        });

        describe('Unknown Providers', () => {
            it('should apply basic validation for unknown provider', () => {
                const result = InputValidation.validateApiKey(
                    'unknown-provider',
                    'sufficiently-long-api-key-123456789012345'
                );

                expect(result.valid).toBe(true);
            });

            it('should reject short key for unknown provider', () => {
                const result = InputValidation.validateApiKey('unknown-provider', 'short');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('too short');
            });
        });
    });
});

describe('InputValidation - URL Validation', () => {
    describe('validateUrl', () => {
        describe('Valid URLs', () => {
            it('should accept valid HTTPS URL', () => {
                const result = InputValidation.validateUrl('https://example.com');

                expect(result.valid).toBe(true);
                expect(result.value).toBe('https://example.com/');
            });

            it('should accept valid HTTP URL', () => {
                const result = InputValidation.validateUrl('http://example.com');

                expect(result.valid).toBe(true);
                expect(result.value).toBe('http://example.com/');
            });

            it('should accept HTTPS URL with path and query', () => {
                const result = InputValidation.validateUrl(
                    'https://example.com/path?query=value'
                );

                expect(result.valid).toBe(true);
            });

            it('should accept localhost HTTP without warning', () => {
                const consoleWarnSpy = vi.spyOn(console, 'warn');

                const result = InputValidation.validateUrl('http://localhost:8080');

                expect(result.valid).toBe(true);
                expect(consoleWarnSpy).not.toHaveBeenCalled();
            });

            it('should accept 127.0.0.1 HTTP without warning', () => {
                const consoleWarnSpy = vi.spyOn(console, 'warn');

                const result = InputValidation.validateUrl('http://127.0.0.1:8080');

                expect(result.valid).toBe(true);
                expect(consoleWarnSpy).not.toHaveBeenCalled();
            });

            it('should accept [::1] IPv6 HTTP without warning', () => {
                const consoleWarnSpy = vi.spyOn(console, 'warn');

                const result = InputValidation.validateUrl('http://[::1]:8080');

                expect(result.valid).toBe(true);
                expect(consoleWarnSpy).not.toHaveBeenCalled();
            });
        });

        describe('Protocol Whitelisting - Security', () => {
            it('should REJECT javascript: protocol', () => {
                const result = InputValidation.validateUrl('javascript:alert(1)');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('http or https scheme');
            });

            it('should REJECT data: protocol', () => {
                const result = InputValidation.validateUrl(
                    'data:text/html,<script>alert(document.domain)</script>'
                );

                expect(result.valid).toBe(false);
                expect(result.error).toContain('http or https scheme');
            });

            it('should REJECT file: protocol', () => {
                const result = InputValidation.validateUrl('file:///etc/passwd');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('http or https scheme');
            });

            it('should REJECT vbscript: protocol', () => {
                const result = InputValidation.validateUrl('vbscript:msgbox(1)');

                expect(result.valid).toBe(false);
            });

            it('should REJECT ftp: protocol (not in default whitelist)', () => {
                const result = InputValidation.validateUrl('ftp://example.com');

                expect(result.valid).toBe(false);
            });

            it('should warn about HTTP for non-localhost URLs', () => {
                const consoleWarnSpy = vi.spyOn(console, 'warn');

                const result = InputValidation.validateUrl('http://example.com');

                expect(result.valid).toBe(true);
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    expect.stringContaining('HTTP instead of HTTPS is insecure')
                );
            });

            it('should allow custom protocol whitelist', () => {
                const result = InputValidation.validateUrl('ftp://example.com', [
                    'http',
                    'https',
                    'ftp',
                ]);

                expect(result.valid).toBe(true);
            });
        });

        describe('Protocol Obfuscation Attempts', () => {
            it('should reject mixed case javascript: protocol', () => {
                const result = InputValidation.validateUrl('javAsCriPt:alert(1)');

                expect(result.valid).toBe(false);
            });

            it('should reject javascript: with null byte', () => {
                // JavaScript URL encoding won't parse this, but test anyway
                const result = InputValidation.validateUrl('java\u0000script:alert(1)');

                // Should either reject as invalid URL or reject protocol
                expect(result.valid).toBe(false);
            });

            it('should handle URL-encoded javascript:', () => {
                const result = InputValidation.validateUrl(
                    'javascript%3Aalert(1)'
                );

                // This parses as a regular URL with scheme "javascript%3A"
                // which is not in whitelist
                expect(result.valid).toBe(false);
            });
        });

        describe('Invalid URLs', () => {
            it('should reject empty string', () => {
                const result = InputValidation.validateUrl('');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('required');
            });

            it('should reject null', () => {
                const result = InputValidation.validateUrl(null);

                expect(result.valid).toBe(false);
                expect(result.error).toContain('required');
            });

            it('should reject malformed URL', () => {
                const result = InputValidation.validateUrl('not-a-url');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('Invalid URL format');
            });

            it('should reject URL without protocol', () => {
                const result = InputValidation.validateUrl('example.com');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('Invalid URL format');
            });
        });

        describe('Whitespace Handling', () => {
            it('should trim whitespace from URL', () => {
                const result = InputValidation.validateUrl('  https://example.com  ');

                expect(result.valid).toBe(true);
                expect(result.value).toBe('https://example.com/');
            });
        });
    });
});

describe('InputValidation - Numeric Validation', () => {
    describe('validateNumber', () => {
        it('should accept valid number within range', () => {
            const result = InputValidation.validateNumber(50, 0, 100);

            expect(result.valid).toBe(true);
            expect(result.value).toBe(50);
        });

        it('should accept number at min boundary', () => {
            const result = InputValidation.validateNumber(0, 0, 100);

            expect(result.valid).toBe(true);
            expect(result.value).toBe(0);
        });

        it('should accept number at max boundary', () => {
            const result = InputValidation.validateNumber(100, 0, 100);

            expect(result.valid).toBe(true);
            expect(result.value).toBe(100);
        });

        it('should clamp number below min', () => {
            const result = InputValidation.validateNumber(-10, 0, 100);

            expect(result.valid).toBe(false);
            expect(result.value).toBe(0); // Clamped to min
            expect(result.error).toContain('between 0 and 100');
        });

        it('should clamp number above max', () => {
            const result = InputValidation.validateNumber(150, 0, 100);

            expect(result.valid).toBe(false);
            expect(result.value).toBe(100); // Clamped to max
            expect(result.error).toContain('between 0 and 100');
        });

        it('should reject NaN', () => {
            const result = InputValidation.validateNumber(NaN, 0, 100);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('must be a number');
        });

        it('should return default for undefined', () => {
            const result = InputValidation.validateNumber(undefined, 0, 100, 42);

            expect(result.valid).toBe(true);
            expect(result.value).toBe(42);
        });

        it('should return default for null', () => {
            const result = InputValidation.validateNumber(null, 0, 100, 42);

            expect(result.valid).toBe(true);
            expect(result.value).toBe(42);
        });

        it('should convert string numbers', () => {
            const result = InputValidation.validateNumber('50', 0, 100);

            expect(result.valid).toBe(true);
            expect(result.value).toBe(50);
        });
    });
});

describe('InputValidation - String Length Validation', () => {
    describe('validateStringLength', () => {
        it('should accept string within range', () => {
            const result = InputValidation.validateStringLength('hello', 1, 10);

            expect(result.valid).toBe(true);
            expect(result.value).toBe('hello');
        });

        it('should accept string at min length', () => {
            const result = InputValidation.validateStringLength('hi', 2, 10);

            expect(result.valid).toBe(true);
            expect(result.value).toBe('hi');
        });

        it('should accept string at max length', () => {
            const result = InputValidation.validateStringLength('hello', 1, 5);

            expect(result.valid).toBe(true);
            expect(result.value).toBe('hello');
        });

        it('should reject string too short', () => {
            const result = InputValidation.validateStringLength('hi', 5, 10);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('at least 5 characters');
        });

        it('should truncate string too long', () => {
            const result = InputValidation.validateStringLength(
                'hello world',
                1,
                5
            );

            expect(result.valid).toBe(false);
            expect(result.value).toBe('hello');
            expect(result.error).toContain('maximum length of 5 characters');
        });

        it('should trim whitespace', () => {
            const result = InputValidation.validateStringLength('  hello  ', 1, 10);

            expect(result.valid).toBe(true);
            expect(result.value).toBe('hello');
        });

        it('should return empty string for undefined', () => {
            const result = InputValidation.validateStringLength(undefined, 0, 10);

            expect(result.valid).toBe(true);
            expect(result.value).toBe('');
        });

        it('should convert non-string values', () => {
            const result = InputValidation.validateStringLength(12345, 1, 10);

            expect(result.valid).toBe(true);
            expect(result.value).toBe('12345');
        });
    });
});

describe('InputValidation - File Upload Validation', () => {
    describe('validateFileUpload - JSON Files', () => {
        it('should accept valid JSON file', async () => {
            const file = new File(['{"key": "value"}'], 'test.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(file, 'json');

            expect(result.valid).toBe(true);
        });

        it('should accept JSON array', async () => {
            const file = new File(['[1, 2, 3]'], 'test.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(file, 'json');

            expect(result.valid).toBe(true);
        });

        it('should reject file with wrong extension', async () => {
            const file = new File(['{"key": "value"}'], 'test.txt', {
                type: 'text/plain',
            });

            const result = await InputValidation.validateFileUpload(file, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('.json extension');
        });

        it('should reject file exceeding size limit', async () => {
            const largeContent = '{"key": "' + 'x'.repeat(600 * 1024 * 1024) + '"}';
            const file = new File([largeContent], 'test.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(file, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('too large');
        });

        it('should verify magic bytes for JSON (opening brace)', async () => {
            // Create a file with .json extension but non-JSON content
            const file = new File(['NOT JSON'], 'test.json', {
                type: 'application/json',
            });

            const result = await InputValidation.validateFileUpload(file, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });
    });

    describe('validateFileUpload - ZIP Files', () => {
        it('should accept valid ZIP file', async () => {
            // Create a file with ZIP magic bytes: PK..
            const zipBytes = [0x50, 0x4b, 0x03, 0x04]; // "PK.."
            const buffer = new Uint8Array(zipBytes);
            const blob = new Blob([buffer], { type: 'application/zip' });
            const file = new File([blob], 'test.zip', {
                type: 'application/zip',
            });

            const result = await InputValidation.validateFileUpload(file, 'zip');

            expect(result.valid).toBe(true);
        });

        it('should reject ZIP file with wrong magic bytes', async () => {
            // Create a file with .zip extension but wrong content
            const file = new File(['NOT ZIP'], 'test.zip', {
                type: 'application/zip',
            });

            const result = await InputValidation.validateFileUpload(file, 'zip');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match ZIP format');
        });

        it('should reject file exceeding ZIP size limit', async () => {
            const largeContent = new Array(101 * 1024 * 1024).fill('x').join('');
            const file = new File([largeContent], 'test.zip', {
                type: 'application/zip',
            });

            const result = await InputValidation.validateFileUpload(file, 'zip');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('too large');
        });
    });

    describe('Magic Byte Security', () => {
        it('should verify JSON magic byte at offset 0', async () => {
            // Test opening brace { (0x7b)
            const file = new File(
                [new Uint8Array([0x7b])],
                'test.json',
                { type: 'application/json' }
            );

            const result = await InputValidation.validateFileUpload(file, 'json');

            expect(result.valid).toBe(true);
        });

        it('should verify JSON array magic byte at offset 0', async () => {
            // Test opening bracket [ (0x5b)
            const file = new File(
                [new Uint8Array([0x5b])],
                'test.json',
                { type: 'application/json' }
            );

            const result = await InputValidation.validateFileUpload(file, 'json');

            expect(result.valid).toBe(true);
        });

        it('should verify ZIP magic bytes at correct offsets', async () => {
            // PK.. signature
            const zipBytes = [0x50, 0x4b, 0x03, 0x04];
            const file = new File(
                [new Uint8Array(zipBytes)],
                'test.zip',
                { type: 'application/zip' }
            );

            const result = await InputValidation.validateFileUpload(file, 'zip');

            expect(result.valid).toBe(true);
        });

        it('should fail magic byte check for mismatched content', async () => {
            // Create file named .json but with ZIP magic bytes
            const zipBytes = [0x50, 0x4b, 0x03, 0x04];
            const file = new File(
                [new Uint8Array(zipBytes)],
                'test.json',
                { type: 'application/json' }
            );

            const result = await InputValidation.validateFileUpload(file, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match JSON format');
        });
    });

    describe('File Upload Edge Cases', () => {
        it('should reject null file', async () => {
            const result = await InputValidation.validateFileUpload(null, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('No file selected');
        });

        it('should reject undefined file', async () => {
            const result = await InputValidation.validateFileUpload(undefined, 'json');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('No file selected');
        });

        it('should handle unknown file type', async () => {
            const file = new File(['content'], 'test.unknown');

            const result = await InputValidation.validateFileUpload(file, 'unknown');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('Unknown file type');
        });

        it('should handle magic byte read errors gracefully', async () => {
            // Create a file that will cause read errors
            const problematicFile = {
                name: 'test.json',
                size: 100,
                slice: () => {
                    throw new Error('Read error');
                },
            };

            const result = await InputValidation.validateFileUpload(
                problematicFile,
                'json'
            );

            // Should not throw, but may fail validation
            expect(result).toBeDefined();
        });
    });
});

describe('InputValidation - URL Parameter Validation', () => {
    describe('validateUrlParam', () => {
        it('should accept valid string parameter', () => {
            const result = InputValidation.validateUrlParam('sort', 'date');

            expect(result.valid).toBe(true);
            expect(result.value).toBe('date');
        });

        it('should sanitize dangerous characters', () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn');

            const result = InputValidation.validateUrlParam('search', '<script>alert(1)</script>');

            expect(result.valid).toBe(true);
            expect(result.value).toBe('scriptalert(1)/script');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Sanitized dangerous characters')
            );
        });

        it('should enforce whitelist when provided', () => {
            const result = InputValidation.validateUrlParam(
                'sort',
                'invalid',
                ['date', 'name', 'size']
            );

            expect(result.valid).toBe(false);
            expect(result.error).toContain('Allowed: date, name, size');
        });

        it('should allow whitelisted values', () => {
            const result = InputValidation.validateUrlParam(
                'sort',
                'date',
                ['date', 'name', 'size']
            );

            expect(result.valid).toBe(true);
            expect(result.value).toBe('date');
        });

        it('should handle null values', () => {
            const result = InputValidation.validateUrlParam('param', null);

            expect(result.valid).toBe(true);
            expect(result.value).toBe('');
        });

        it('should handle undefined values', () => {
            const result = InputValidation.validateUrlParam('param', undefined);

            expect(result.valid).toBe(true);
            expect(result.value).toBe('');
        });

        it('should sanitize quotes', () => {
            const result = InputValidation.validateUrlParam('param', '"test"');

            expect(result.valid).toBe(true);
            expect(result.value).toBe('test');
        });

        it('should sanitize angle brackets', () => {
            const result = InputValidation.validateUrlParam('param', '<test>');

            expect(result.valid).toBe(true);
            expect(result.value).toBe('test');
        });
    });
});

describe('InputValidation - Model ID Validation', () => {
    describe('validateModelId', () => {
        it('should accept standard model format', () => {
            const result = InputValidation.validateModelId('anthropic/claude-3.5-sonnet');

            expect(result.valid).toBe(true);
            expect(result.value).toBe('anthropic/claude-3.5-sonnet');
        });

        it('should accept model format with tag', () => {
            const result = InputValidation.validateModelId('xiaomi/mimo-v2-flash:free');

            expect(result.valid).toBe(true);
        });

        it('should accept simple model format', () => {
            const result = InputValidation.validateModelId('claude-3-5-sonnet');

            expect(result.valid).toBe(true);
        });

        it('should reject model ID with invalid characters', () => {
            const result = InputValidation.validateModelId('anthropic/claude@3.5');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid model ID format');
        });

        it('should reject empty string', () => {
            const result = InputValidation.validateModelId('');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('required');
        });

        it('should reject null', () => {
            const result = InputValidation.validateModelId(null);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('required');
        });

        it('should reject model ID with uppercase letters', () => {
            const result = InputValidation.validateModelId('Anthropic/Claude');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid model ID format');
        });

        it('should trim whitespace', () => {
            const result = InputValidation.validateModelId(
                '  anthropic/claude-3.5-sonnet  '
            );

            expect(result.valid).toBe(true);
            expect(result.value).toBe('anthropic/claude-3.5-sonnet');
        });
    });
});
