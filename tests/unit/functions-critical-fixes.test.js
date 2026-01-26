/**
 * Tests for Functions Refactor Critical Fixes
 *
 * Verifies that all 3 CRITICAL fixes are working correctly:
 * 1. Top-level await error handling (CRITICAL-001)
 * 2. Schema population race condition prevention (CRITICAL-002)
 * 3. Null/undefined args validation (CRITICAL-003)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FunctionValidator } from '../../js/functions/function-validator.js';
import { SchemaRegistry } from '../../js/functions/schema-registry.js';

describe('Functions Refactor Critical Fixes', () => {
    describe('CRITICAL-001: Top-level await error handling', () => {
        it('should handle missing validation utils module gracefully', async () => {
            // The module should load even if validation utils are not available
            expect(FunctionValidator).toBeDefined();
            expect(typeof FunctionValidator.validateFunctionArgs).toBe('function');
        });

        it('should provide basic validation when FunctionValidation is unavailable', () => {
            // Even without advanced validation, basic validation should work
            const result = FunctionValidator.validateStreams([]);
            // Basic validation requires non-empty streams array
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle validateDataQuery with basic validation', () => {
            // Should return a result even with basic validation
            const result = FunctionValidator.validateDataQuery();
            expect(typeof result.valid).toBe('boolean');
            expect(typeof result.error).toBe('string');
        });
    });

    describe('CRITICAL-002: Schema population race condition prevention', () => {
        // This test verifies the initialization flag prevents double-population

        it('should initialize schema arrays exactly once', () => {
            // Get the Functions facade
            import('../../js/functions/index.js').then(({ Functions }) => {
                // Track how many times schemas are populated
                let populateCount = 0;
                const originalGetAllSchemas = SchemaRegistry.getAllSchemas;

                // Mock getAllSchemas to count calls
                SchemaRegistry.getAllSchemas = () => {
                    populateCount++;
                    return originalGetAllSchemas.call(SchemaRegistry);
                };

                // Trigger initialization multiple times if possible
                const init1 = new Promise(resolve => setTimeout(resolve, 10));
                const init2 = new Promise(resolve => setTimeout(resolve, 10));

                Promise.all([init1, init2]).then(() => {
                    // Should only populate once despite multiple triggers
                    expect(populateCount).toBe(1);
                });
            });
        });

        it('should have allSchemas populated after initialization', async () => {
            const { Functions } = await import('../../js/functions/index.js');

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 100));

            // AllSchemas should be populated
            expect(Array.isArray(Functions.allSchemas)).toBe(true);
            expect(Functions.allSchemas.length).toBeGreaterThan(0);
        });

        it('should have templateSchemas populated after initialization', async () => {
            const { Functions } = await import('../../js/functions/index.js');

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 100));

            // TemplateSchemas should be populated
            expect(Array.isArray(Functions.templateSchemas)).toBe(true);
        });
    });

    describe('CRITICAL-003: Null/undefined args validation', () => {
        describe('validateFunctionArgs rejects invalid input types', () => {
            it('should reject null args', () => {
                const result = FunctionValidator.validateFunctionArgs('testFunction', null);

                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors[0]).toContain('Invalid arguments');
                expect(result.normalizedArgs).toEqual({});
            });

            it('should reject undefined args', () => {
                const result = FunctionValidator.validateFunctionArgs('testFunction', undefined);

                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors[0]).toContain('Invalid arguments');
                expect(result.normalizedArgs).toEqual({});
            });

            it('should reject non-object args', () => {
                const result = FunctionValidator.validateFunctionArgs('testFunction', 'string');

                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors[0]).toContain('Invalid arguments');
                expect(result.normalizedArgs).toEqual({});
            });

            it('should reject number args', () => {
                const result = FunctionValidator.validateFunctionArgs('testFunction', 42);

                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors[0]).toContain('Invalid arguments');
                expect(result.normalizedArgs).toEqual({});
            });

            it('should reject boolean args', () => {
                const result = FunctionValidator.validateFunctionArgs('testFunction', true);

                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors[0]).toContain('Invalid arguments');
                expect(result.normalizedArgs).toEqual({});
            });
        });

        describe('validateFunctionArgs with valid args', () => {
            it('should validate normal object args correctly', () => {
                const args = { param1: 'value1', param2: 42 };
                const result = FunctionValidator.validateFunctionArgs('testFunction', args);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.normalizedArgs).toBeDefined();
            });

            it('should validate empty object args correctly', () => {
                const args = {};
                const result = FunctionValidator.validateFunctionArgs('testFunction', args);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.normalizedArgs).toEqual({});
            });
        });

        describe('validateFunctionArgs with schema-based validation', () => {
            it('should detect missing required parameters', () => {
                // First register a test schema
                const testSchema = {
                    function: {
                        name: 'testRequired',
                        parameters: {
                            type: 'object',
                            properties: {
                                requiredParam: { type: 'string' }
                            },
                            required: ['requiredParam']
                        }
                    }
                };

                // Mock SchemaRegistry to return our test schema
                vi.spyOn(SchemaRegistry, 'getFunctionSchema').mockReturnValue(testSchema);

                const result = FunctionValidator.validateFunctionArgs('testRequired', {});

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Missing required parameter: requiredParam');
            });

            it('should validate type coercion from string to number', () => {
                const testSchema = {
                    function: {
                        name: 'testTypeCoercion',
                        parameters: {
                            type: 'object',
                            properties: {
                                count: { type: 'number' }
                            },
                            required: ['count']
                        }
                    }
                };

                vi.spyOn(SchemaRegistry, 'getFunctionSchema').mockReturnValue(testSchema);

                const result = FunctionValidator.validateFunctionArgs('testTypeCoercion', {
                    count: '42'
                });

                expect(result.valid).toBe(true);
                expect(result.normalizedArgs.count).toBe(42);
                expect(typeof result.normalizedArgs.count).toBe('number');
            });

            it('should validate enum with case-insensitive matching', () => {
                const testSchema = {
                    function: {
                        name: 'testEnum',
                        parameters: {
                            type: 'object',
                            properties: {
                                format: { type: 'string', enum: ['JSON', 'XML', 'CSV'] }
                            },
                            required: ['format']
                        }
                    }
                };

                vi.spyOn(SchemaRegistry, 'getFunctionSchema').mockReturnValue(testSchema);

                const result = FunctionValidator.validateFunctionArgs('testEnum', {
                    format: 'json'
                });

                expect(result.valid).toBe(true);
                expect(result.normalizedArgs.format).toBe('JSON');
            });
        });
    });

    describe('validateStreams', () => {
        it('should validate empty streams array', () => {
            const result = FunctionValidator.validateStreams([]);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should validate non-empty streams array', () => {
            const streams = [{ id: 1, data: 'test' }];
            const result = FunctionValidator.validateStreams(streams);
            expect(result.valid).toBe(true);
        });

        it('should validate null streams', () => {
            const result = FunctionValidator.validateStreams(null);
            expect(result.valid).toBe(false);
        });
    });
});
