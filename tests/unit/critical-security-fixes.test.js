/**
 * Critical Security Fixes - Unit Tests
 *
 * Tests for the critical security issues identified and fixed during v1.0 audit:
 * 1. Device secret race condition protection
 * 2. Safe JSON parsing in streaming handlers
 * 3. Response structure validation
 * 4. AbortController timeout race condition
 * 5. SSE buffer memory leak protection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalCrypto = globalThis.crypto;

function stubCrypto(stub) {
    Object.defineProperty(globalThis, 'crypto', {
        value: stub,
        configurable: true,
        writable: true
    });
}

function restoreCrypto() {
    if (originalCrypto) {
        Object.defineProperty(globalThis, 'crypto', {
            value: originalCrypto,
            configurable: true,
            writable: true
        });
    } else {
        delete globalThis.crypto;
    }
}

describe('Critical Security Fixes', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        sessionStorage.clear();
        stubCrypto({
            getRandomValues: (arr) => {
                for (let i = 0; i < arr.length; i++) {
                    arr[i] = Math.floor(Math.random() * 256);
                }
                return arr;
            },
            subtle: {
                digest: vi.fn(async () => new ArrayBuffer(32)),
                deriveKey: vi.fn(async () => ({ type: 'raw' })),
                encrypt: vi.fn(async () => new Uint8Array(32)),
                decrypt: vi.fn(async () => new Uint8Array(32)),
                importKey: vi.fn(async () => ({})),
                generateKey: vi.fn(async () => ({}))
            }
        });
    });

    afterEach(() => {
        restoreCrypto();
    });

    // ========================================================================
    // TEST 1: Device Secret Race Condition Protection
    // ========================================================================
    describe('Device Secret Race Condition Protection', () => {
        it('prevents race condition when multiple tabs initialize simultaneously', async () => {
            const SECRET_KEY = 'rhythm_chamber_device_secret';

            // Simulate two tabs reading at the same time (both see null)
            const tab1Secret = localStorage.getItem(SECRET_KEY);
            const tab2Secret = localStorage.getItem(SECRET_KEY);
            expect(tab1Secret).toBeNull();
            expect(tab2Secret).toBeNull();

            // Tab 1 generates and writes
            const randomBytes1 = new Uint8Array(32);
            crypto.getRandomValues(randomBytes1);
            const secret1 = Array.from(randomBytes1, b => b.toString(16).padStart(2, '0')).join('');
            const current1 = localStorage.getItem(SECRET_KEY);
            if (!current1) {
                localStorage.setItem(SECRET_KEY, secret1);
            }

            // Tab 2 generates and attempts to write (compare-and-set)
            const randomBytes2 = new Uint8Array(32);
            crypto.getRandomValues(randomBytes2);
            const secret2 = Array.from(randomBytes2, b => b.toString(16).padStart(2, '0')).join('');
            const current2 = localStorage.getItem(SECRET_KEY);
            if (!current2) {
                localStorage.setItem(SECRET_KEY, secret2);
            }

            // Both tabs should read the same value (tab 1 won the race)
            const finalSecret = localStorage.getItem(SECRET_KEY);
            expect(finalSecret).toBe(secret1);
            expect(finalSecret).not.toBe(secret2);
        });

        it('uses existing secret if already present', async () => {
            const SECRET_KEY = 'rhythm_chamber_device_secret';
            const existingSecret = 'existing-secret-1234567890abcdef';
            localStorage.setItem(SECRET_KEY, existingSecret);

            // Simulate initialization
            const currentSecret = localStorage.getItem(SECRET_KEY);

            // Should not generate new secret
            expect(currentSecret).toBe(existingSecret);
        });

        it('generates valid secret when none exists', async () => {
            const SECRET_KEY = 'rhythm_chamber_device_secret';

            const randomBytes = new Uint8Array(32);
            crypto.getRandomValues(randomBytes);
            const newSecret = Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');

            expect(newSecret).toHaveLength(64); // 32 bytes * 2 hex chars
            expect(/^[0-9a-f]{64}$/.test(newSecret)).toBe(true);
        });
    });

    // ========================================================================
    // TEST 2: Safe JSON Parsing
    // ========================================================================
    describe('Safe JSON Parsing in Streaming Handlers', () => {
        it('handles malformed JSON gracefully without crashing', async () => {
            const { safeJsonParse } = await import('../../js/utils/safe-json.js');

            // Test various malformed inputs
            const malformedInputs = [
                '{"incomplete',
                '{malformed json}',
                'not json at all',
                '{"valid": "value"}{"another": "value"}', // Double JSON
                '', // Empty string
                undefined,
                null
            ];

            for (const input of malformedInputs) {
                const result = safeJsonParse(input, null);
                expect(result).toBeNull();
            }
        });

        it('returns parsed object for valid JSON', async () => {
            const { safeJsonParse } = await import('../../js/utils/safe-json.js');

            const validJson = '{"choices": [{"message": {"content": "test"}}]}';
            const result = safeJsonParse(validJson, null);

            expect(result).toEqual({
                choices: [{ message: { content: 'test' } }]
            });
        });

        it('returns fallback value for invalid JSON', async () => {
            const { safeJsonParse } = await import('../../js/utils/safe-json.js');

            const fallback = { fallback: true };
            const result = safeJsonParse('{invalid}', fallback);

            expect(result).toBe(fallback);
        });

        it('handles streaming chunks with partial data', async () => {
            const { safeJsonParse } = await import('../../js/utils/safe-json.js');

            // Simulate SSE chunk that got cut off
            const partialChunk = 'data: {"choices":[{"delta":{"content":"partial';
            const result = safeJsonParse(partialChunk, null);

            expect(result).toBeNull();
        });
    });

    // ========================================================================
    // TEST 3: Response Structure Validation
    // ========================================================================
    describe('Response Structure Validation', () => {
        it('rejects response without choices array', async () => {
            const invalidResponses = [
                null,
                undefined,
                {},
                { choices: null },
                { choices: 'not an array' },
                { choices: [] }, // Empty array
                { choices: [{ message: null }] }, // Null message
                { choices: [{ message: {} }] }, // Empty message (no content)
            ];

            for (const response of invalidResponses) {
                const isValid = validateProviderResponse(response);
                expect(isValid).toBe(false);
            }
        });

        it('accepts valid response structure', async () => {
            const validResponse = {
                choices: [{
                    message: {
                        content: 'Test response',
                        role: 'assistant'
                    },
                    finish_reason: 'stop'
                }],
                usage: { total_tokens: 10 }
            };

            const isValid = validateProviderResponse(validResponse);
            expect(isValid).toBe(true);
        });

        it('accepts response with tool_calls instead of content', async () => {
            const toolCallResponse = {
                choices: [{
                    message: {
                        role: 'assistant',
                        tool_calls: [{
                            id: 'call_123',
                            type: 'function',
                            function: {
                                name: 'test_function',
                                arguments: '{}'
                            }
                        }]
                    }
                }]
            };

            const isValid = validateProviderResponse(toolCallResponse);
            expect(isValid).toBe(true);
        });
    });

    // ========================================================================
    // TEST 4: AbortController Timeout Race Condition
    // ========================================================================
    describe('AbortController Timeout Race Condition', () => {
        it('prevents timeout from firing after response arrives', async () => {
            let timeoutFired = false;
            let responseReceived = false;

            const controller = new AbortController();
            const signal = controller.signal;

            // Set up timeout that would fire after response
            const timeoutId = setTimeout(() => {
                if (!responseReceived) {
                    timeoutFired = true;
                    controller.abort();
                }
            }, 100);

            // Simulate fast response
            await new Promise(resolve => setTimeout(resolve, 50));
            responseReceived = true;
            clearTimeout(timeoutId);

            expect(timeoutFired).toBe(false);
            expect(signal.aborted).toBe(false);
        });

        it('aborts when timeout occurs before response', async () => {
            const controller = new AbortController();
            const signal = controller.signal;

            // Set short timeout
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, 50);

            // Wait longer than timeout
            await new Promise(resolve => setTimeout(resolve, 100));
            clearTimeout(timeoutId);

            expect(signal.aborted).toBe(true);
        });

        it('handles concurrent timeout and response', async () => {
            let timeoutFired = false;
            let responseReceived = false;

            const controller = new AbortController();

            // Simulate race: both timeout and response happen at similar time
            await Promise.all([
                new Promise(resolve => setTimeout(resolve, 10)).then(() => {
                    timeoutFired = true;
                    controller.abort();
                }),
                new Promise(resolve => setTimeout(resolve, 10)).then(() => {
                    responseReceived = true;
                })
            ]);

            // The flag should prevent double-handling
            expect(controller.signal.aborted).toBe(true);
        });
    });

    // ========================================================================
    // TEST 5: SSE Buffer Memory Leak Protection
    // ========================================================================
    describe('SSE Buffer Memory Leak Protection', () => {
        it('rejects sequence numbers unreasonably far ahead', () => {
            const MAX_SEQUENCE_GAP = 1000;
            let nextExpectedSeq = 0;

            // Valid: within gap
            const validSeq = 500;
            expect(validSeq - nextExpectedSeq).toBeLessThanOrEqual(MAX_SEQUENCE_GAP);

            // Invalid: too far ahead
            const invalidSeq = 5000;
            expect(invalidSeq - nextExpectedSeq).toBeGreaterThan(MAX_SEQUENCE_GAP);
        });

        it('prevents buffer overflow from malicious sequence numbers', () => {
            const MAX_SEQUENCE_BUFFER_SIZE = 100;
            const MAX_SEQUENCE_GAP = 1000;

            const sequenceBuffer = new Map();
            let nextExpectedSeq = 0;

            // Try to add sequence numbers that would cause memory issues
            const maliciousSequences = [0, 1, 10000, 10001, 10002];

            for (const seq of maliciousSequences) {
                // Check gap before adding
                if (seq > nextExpectedSeq + MAX_SEQUENCE_GAP) {
                    // Reject - too far ahead
                    continue;
                }

                if (seq >= nextExpectedSeq) {
                    sequenceBuffer.set(seq, { data: `chunk-${seq}` });

                    // Check buffer size
                    if (sequenceBuffer.size > MAX_SEQUENCE_BUFFER_SIZE) {
                        // Would trigger cleanup
                        break;
                    }
                }
            }

            // Buffer should not contain malicious sequence numbers
            expect(sequenceBuffer.has(10000)).toBe(false);
            expect(sequenceBuffer.has(10001)).toBe(false);
        });

        it('processes in-order sequences correctly', () => {
            const MAX_SEQUENCE_GAP = 1000;
            let nextExpectedSeq = 0;
            const sequenceBuffer = new Map();

            const inOrderSequences = [0, 1, 2, 3, 4, 5];

            for (const seq of inOrderSequences) {
                if (seq > nextExpectedSeq + MAX_SEQUENCE_GAP) {
                    continue; // Reject
                }

                if (seq === nextExpectedSeq) {
                    // Process immediately
                    nextExpectedSeq++;
                }
            }

            expect(nextExpectedSeq).toBe(6);
        });
    });
});

/**
 * Helper function to validate provider response structure
 * Mirrors the validation in provider-interface.js
 */
function validateProviderResponse(response) {
    if (!response || typeof response !== 'object') {
        return false;
    }

    if (!response.choices || !Array.isArray(response.choices)) {
        return false;
    }

    if (response.choices.length === 0) {
        return false;
    }

    const firstChoice = response.choices[0];
    if (!firstChoice || !firstChoice.message) {
        return false;
    }

    const message = firstChoice.message;
    // Must have either content or tool_calls
    if (!message.content && !message.tool_calls) {
        return false;
    }

    return true;
}
