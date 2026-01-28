/**
 * Provider Config Module Unit Tests
 *
 * Tests for the provider configuration builder module.
 */

import { describe, it, expect } from 'vitest';
import { buildProviderConfig } from '../../../../js/providers/interface/provider-config.js';

describe('Provider Configuration Builder', () => {
    const baseConfig = {
        model: 'base-model',
        temperature: 0.5
    };

    describe('buildProviderConfig', () => {
        it('should build openrouter config', () => {
            const settings = {
                openrouter: {
                    apiKey: 'test-key',
                    model: 'gpt-4',
                    temperature: 0.8,
                    maxTokens: 3000
                }
            };

            const config = buildProviderConfig('openrouter', settings, baseConfig);

            expect(config.provider).toBe('openrouter');
            expect(config.model).toBe('gpt-4');
            expect(config.temperature).toBe(0.8);
            expect(config.maxTokens).toBe(3000);
            expect(config.timeout).toBe(60000);
            expect(config.isLocal).toBe(false);
            expect(config.privacyLevel).toBe('cloud');
        });

        it('should build ollama config', () => {
            const settings = {
                ollama: {
                    model: 'llama3.2',
                    temperature: 0.7
                },
                llm: {
                    ollamaEndpoint: 'http://localhost:11434'
                }
            };

            const config = buildProviderConfig('ollama', settings, {});

            expect(config.provider).toBe('ollama');
            expect(config.endpoint).toBe('http://localhost:11434');
            expect(config.model).toBe('llama3.2');
            expect(config.temperature).toBe(0.7);
            expect(config.maxTokens).toBe(2000);
            expect(config.timeout).toBe(90000);
            expect(config.isLocal).toBe(true);
            expect(config.privacyLevel).toBe('maximum');
        });

        it('should use default ollama endpoint', () => {
            const settings = {
                ollama: { model: 'llama3.2' }
            };

            const config = buildProviderConfig('ollama', settings, {});

            expect(config.endpoint).toBe('http://localhost:11434');
        });

        it('should build lmstudio config', () => {
            const settings = {
                lmstudio: {
                    model: 'local-model',
                    temperature: 0.6
                },
                llm: {
                    lmstudioEndpoint: 'http://localhost:1234/v1'
                }
            };

            const config = buildProviderConfig('lmstudio', settings, {});

            expect(config.provider).toBe('lmstudio');
            expect(config.endpoint).toBe('http://localhost:1234/v1');
            expect(config.model).toBe('local-model');
            expect(config.temperature).toBe(0.6);
            expect(config.isLocal).toBe(true);
        });

        it('should use default lmstudio endpoint', () => {
            const settings = {
                lmstudio: { model: 'local-model' }
            };

            const config = buildProviderConfig('lmstudio', settings, {});

            expect(config.endpoint).toBe('http://localhost:1234/v1');
        });

        it('should build gemini config', () => {
            const settings = {
                gemini: {
                    apiKey: 'gemini-key',
                    model: 'gemini-2.5-flash'
                }
            };

            const config = buildProviderConfig('gemini', settings, {});

            expect(config.provider).toBe('gemini');
            expect(config.endpoint).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
            expect(config.model).toBe('gemini-2.5-flash');
            expect(config.isLocal).toBe(false);
        });

        it('should build openai-compatible config', () => {
            const settings = {
                openaiCompatible: {
                    apiUrl: 'http://localhost:8080/v1/chat/completions',
                    apiKey: 'oa-key',
                    model: 'gpt-3.5-turbo'
                }
            };

            const config = buildProviderConfig('openai-compatible', settings, {});

            expect(config.provider).toBe('openai-compatible');
            expect(config.apiUrl).toBe('http://localhost:8080/v1/chat/completions');
            expect(config.model).toBe('gpt-3.5-turbo');
            expect(config.isLocal).toBe(false);
        });

        it('should use defaults for missing settings', () => {
            const settings = {};

            const config = buildProviderConfig('openrouter', settings, baseConfig);

            expect(config.temperature).toBe(0.7); // Default
            expect(config.topP).toBe(0.9); // Default
        });

        it('should fallback to openrouter for unknown provider', () => {
            const settings = {
                openrouter: { model: 'default-model' }
            };

            const config = buildProviderConfig('unknown', settings, {});

            expect(config.provider).toBe('openrouter');
        });

        it('should inherit temperature from openrouter for other providers', () => {
            const settings = {
                openrouter: { temperature: 0.5 },
                ollama: { model: 'llama3.2' }
            };

            const config = buildProviderConfig('ollama', settings, {});

            expect(config.temperature).toBe(0.5);
        });

        it('should prefer provider-specific temperature over openrouter', () => {
            const settings = {
                openrouter: { temperature: 0.5 },
                ollama: {
                    model: 'llama3.2',
                    temperature: 0.8
                }
            };

            const config = buildProviderConfig('ollama', settings, {});

            expect(config.temperature).toBe(0.8);
        });
    });
});
