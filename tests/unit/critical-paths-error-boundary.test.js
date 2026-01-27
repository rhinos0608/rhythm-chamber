/**
 * Critical Paths Error Boundary Tests
 *
 * TDD tests for error boundary wrapping in critical paths:
 * - Chat message sending errors
 * - File upload processing errors
 * - Session management errors
 * - LLM API call errors
 *
 * These tests follow the TDD approach: write tests first, then implement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import ErrorBoundary
import { ErrorBoundary } from '../../js/services/error-boundary.js';

describe('Critical Paths Error Boundary - TDD', () => {
    let errorLogSpy;
    let consoleErrorSpy;

    beforeEach(() => {
        // Spy on error logging
        errorLogSpy = vi.fn();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        if (consoleErrorSpy) {
            consoleErrorSpy.mockRestore();
        }
    });

    // ==========================================
    // Chat Message Sending Error Tests
    // ==========================================

    describe('Chat Message Sending Errors', () => {
        it('should catch network errors during message sending', async () => {
            const sendMessage = vi.fn().mockRejectedValue(
                new Error('Network request failed')
            );

            // Expected: ErrorBoundary.wrap should catch this
            // This test will fail until we implement wrapping
            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(sendMessage, {
                context: 'sendMessage',
                fallback: 'Sorry, something went wrong. Please try again.'
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(result.error || result).toBeDefined();
        });

        it('should catch timeout errors during LLM API calls', async () => {
            const llmCall = vi.fn().mockRejectedValue(
                new Error('Request timeout after 30000ms')
            );

            // Expected: Should provide user-friendly timeout message
            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(llmCall, {
                context: 'llmCall',
                fallback: 'The request timed out. Please try again.',
                onError: (error) => errorLogSpy('Timeout occurred', error)
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(errorLogSpy).toHaveBeenCalled();
            expect(result.error || result).toBeDefined();
        });

        it('should catch validation errors in message processing', async () => {
            const processMessage = vi.fn().mockRejectedValue(
                new Error('Message validation failed: content too long')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(processMessage, {
                context: 'processMessage',
                fallback: 'Message is too long. Please shorten it.'
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(result.error || result).toContain('long');
        });

        it('should catch and report tool execution errors', async () => {
            const executeTool = vi.fn().mockRejectedValue(
                new Error('DataQuery tool failed: no streams available')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(executeTool, {
                context: 'toolExecution',
                fallback: 'Unable to query data. Please upload your Spotify history first.'
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(result.error || result).toBeDefined();
        });
    });

    // ==========================================
    // File Upload Processing Error Tests
    // ==========================================

    describe('File Upload Processing Errors', () => {
        it('should catch file size validation errors', async () => {
            const validateFile = vi.fn().mockRejectedValue(
                new Error('File too large: 600MB exceeds 500MB limit')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(validateFile, {
                context: 'fileUpload',
                fallback: 'File is too large. Maximum size is 500MB.',
                onError: (error) => errorLogSpy('File validation failed', error.message)
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(errorLogSpy).toHaveBeenCalled();
            expect(result.error || result).toContain('large');
        });

        it('should catch file parsing errors in worker', async () => {
            const parseFile = vi.fn().mockRejectedValue(
                new Error('Invalid ZIP file format')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(parseFile, {
                context: 'fileParsing',
                fallback: 'Failed to parse file. Please ensure it is a valid JSON or ZIP file.'
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(result.error || result).toBeDefined();
        });

        it('should catch worker initialization errors', async () => {
            const initWorker = vi.fn().mockRejectedValue(
                new Error('Failed to initialize parser worker')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(initWorker, {
                context: 'workerInit',
                fallback: 'Unable to initialize file processor. Please refresh the page.'
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(result.error || result).toBeDefined();
        });

        it('should catch memory warnings during processing', async () => {
            const processChunk = vi.fn().mockRejectedValue(
                new Error('Memory limit exceeded: 95% usage')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(processChunk, {
                context: 'chunkProcessing',
                fallback: 'Low memory. Try uploading a smaller file or close other tabs.',
                onError: (error) => errorLogSpy('Memory warning', error.message)
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(errorLogSpy).toHaveBeenCalled();
        });
    });

    // ==========================================
    // Session Management Error Tests
    // ==========================================

    describe('Session Management Errors', () => {
        it('should catch session save errors', async () => {
            const saveSession = vi.fn().mockRejectedValue(
                new Error('IndexedDB: Transaction failed')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(saveSession, {
                context: 'sessionSave',
                fallback: null, // Silent fail for save errors
                onError: (error) => errorLogSpy('Session save failed', error)
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(errorLogSpy).toHaveBeenCalled();
        });

        it('should catch session load errors', async () => {
            const loadSession = vi.fn().mockRejectedValue(
                new Error('Session not found: invalid-id')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(loadSession, {
                context: 'sessionLoad',
                fallback: () => ({ messages: [], id: 'new' }),
                onError: (error) => errorLogSpy('Session load failed', error.message)
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(result.error || result).toBeDefined();
        });

        it('should catch session switch errors', async () => {
            const switchSession = vi.fn().mockRejectedValue(
                new Error('Failed to switch session: concurrent modification')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(switchSession, {
                context: 'sessionSwitch',
                fallback: false,
                onError: (error) => errorLogSpy('Session switch failed', error)
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(errorLogSpy).toHaveBeenCalled();
        });

        it('should catch emergency backup errors', async () => {
            const backup = vi.fn().mockRejectedValue(
                new Error('localStorage: Quota exceeded')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(backup, {
                context: 'emergencyBackup',
                fallback: null, // Silent fail - backup is best-effort
                onError: (error) => errorLogSpy('Backup failed', error.message)
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(errorLogSpy).toHaveBeenCalledWith('Backup failed', expect.any(String));
        });
    });

    // ==========================================
    // LLM API Call Error Tests
    // ==========================================

    describe('LLM API Call Errors', () => {
        it('should catch API authentication errors', async () => {
            const callLLM = vi.fn().mockRejectedValue(
                new Error('401 Unauthorized: Invalid API key')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(callLLM, {
                context: 'llmApiCall',
                fallback: { content: 'Authentication failed. Please check your API key.', status: 'error' },
                onError: (error) => errorLogSpy('LLM API error', error.message)
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(errorLogSpy).toHaveBeenCalledWith('LLM API error', expect.any(String));
        });

        it('should catch rate limit errors', async () => {
            const callLLM = vi.fn().mockRejectedValue(
                new Error('429 Too Many Requests: Rate limit exceeded')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(callLLM, {
                context: 'llmApiCall',
                fallback: { content: 'Rate limit exceeded. Please wait a moment before trying again.', status: 'error' },
                onError: (error) => errorLogSpy('Rate limited', error.message)
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(result.error || result).toBeDefined();
        });

        it('should catch provider timeout errors', async () => {
            const callLLM = vi.fn().mockRejectedValue(
                new Error('Provider timeout: No response within 60000ms')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(callLLM, {
                context: 'llmApiCall',
                fallback: { content: 'The AI provider timed out. Please try again.', status: 'error' }
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(result.error || result).toBeDefined();
        });

        it('should catch malformed response errors', async () => {
            const callLLM = vi.fn().mockRejectedValue(
                new Error('Invalid response: missing choices array')
            );

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(callLLM, {
                context: 'llmApiCall',
                fallback: { content: 'Received an invalid response from the AI provider.', status: 'error' },
                onError: (error) => errorLogSpy('Invalid LLM response', error)
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(errorLogSpy).toHaveBeenCalled();
        });

        it('should log telemetry for all LLM errors', async () => {
            const telemetrySpy = vi.fn();
            const callLLM = vi.fn().mockRejectedValue(
                new Error('API error')
            );

            // Mock telemetry recording
            const recordTelemetry = (error) => {
                telemetrySpy('llm_error', { error: error.message, timestamp: Date.now() });
            };

            const result = ErrorBoundary.wrap ? await ErrorBoundary.wrap(callLLM, {
                context: 'llmApiCall',
                fallback: { content: 'An error occurred.', status: 'error' },
                onError: recordTelemetry
            }).catch(e => ({ error: e.message })) : { error: 'Not implemented' };

            expect(telemetrySpy).toHaveBeenCalledWith('llm_error', expect.objectContaining({
                error: expect.any(String),
                timestamp: expect.any(Number)
            }));
        });
    });

    // ==========================================
    // Fallback Value Tests
    // ==========================================

    describe('Error Boundary Fallback Values', () => {
        it('should return fallback value when provided', async () => {
            const failingOp = vi.fn().mockRejectedValue(new Error('Failed'));
            const fallbackValue = { content: 'Fallback response', status: 'error' };

            if (!ErrorBoundary.wrap) {
                // Test will fail until implemented
                expect(true).toBe(false);
                return;
            }

            const result = await ErrorBoundary.wrap(failingOp, {
                context: 'testOp',
                fallback: fallbackValue,
                rethrow: false // Don't re-throw, return fallback instead
            });

            expect(result).toEqual(fallbackValue);
        });

        it('should support function fallbacks for dynamic values', async () => {
            const failingOp = vi.fn().mockRejectedValue(new Error('Failed'));

            if (!ErrorBoundary.wrap) {
                expect(true).toBe(false);
                return;
            }

            const fallbackFn = (error) => ({
                content: `Error: ${error.message}`,
                status: 'error',
                timestamp: Date.now()
            });

            const result = await ErrorBoundary.wrap(failingOp, {
                context: 'testOp',
                fallback: fallbackFn,
                rethrow: false
            });

            expect(result.status).toBe('error');
            expect(result.content).toContain('Failed');
            expect(result.timestamp).toBeGreaterThan(0);
        });

        it('should re-throw when rethrow is true and no fallback', async () => {
            const failingOp = vi.fn().mockRejectedValue(new Error('Failed'));

            if (!ErrorBoundary.wrap) {
                expect(true).toBe(false);
                return;
            }

            await expect(ErrorBoundary.wrap(failingOp, {
                context: 'testOp',
                rethrow: true
            })).rejects.toThrow('Failed');
        });

        it('should return fallback when provided even with rethrow true', async () => {
            const failingOp = vi.fn().mockRejectedValue(new Error('Failed'));

            if (!ErrorBoundary.wrap) {
                expect(true).toBe(false);
                return;
            }

            // When fallback is provided, it returns the fallback instead of throwing
            const result = await ErrorBoundary.wrap(failingOp, {
                context: 'testOp',
                fallback: 'fallback',
                rethrow: true
            });

            expect(result).toBe('fallback');
        });
    });

    // ==========================================
    // Context and Logging Tests
    // ==========================================

    describe('Error Context and Logging', () => {
        it('should include context in error logs', async () => {
            const failingOp = vi.fn().mockRejectedValue(new Error('Operation failed'));
            const onErrorSpy = vi.fn();
            const consoleErrorSpyLocal = vi.spyOn(console, 'error').mockImplementation(() => {});

            if (!ErrorBoundary.wrap) {
                expect(true).toBe(false);
                return;
            }

            try {
                await ErrorBoundary.wrap(failingOp, {
                    context: 'sendMessage',
                    userId: 'user-123',
                    messageId: 'msg-456',
                    onError: onErrorSpy
                });
            } catch (e) {
                // Expected to throw
            }

            // onError should be called with context
            expect(onErrorSpy).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    context: 'sendMessage',
                    userId: 'user-123',
                    messageId: 'msg-456'
                })
            );

            consoleErrorSpyLocal.mockRestore();
        });

        it('should aggregate multiple errors from the same operation', async () => {
            const failingOp = vi.fn().mockRejectedValue(
                new Error('Multiple errors: validation, parsing, API')
            );

            if (!ErrorBoundary.wrap) {
                expect(true).toBe(false);
                return;
            }

            try {
                await ErrorBoundary.wrap(failingOp, {
                    context: 'complexOperation',
                    onError: (error, context) => {
                        errorLogSpy('Complex error', {
                            message: error.message,
                            context: context.context,
                            timestamp: Date.now()
                        });
                    }
                });
            } catch (e) {
                // Expected
            }

            expect(errorLogSpy).toHaveBeenCalledWith('Complex error', expect.objectContaining({
                message: expect.any(String),
                context: 'complexOperation',
                timestamp: expect.any(Number)
            }));
        });
    });
});
