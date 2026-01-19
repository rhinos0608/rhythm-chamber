/**
 * ConfigLoader Unit Tests
 * 
 * Tests for the configuration loading service with retry logic and fallbacks.
 * 
 * @module tests/unit/config-loader.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch before importing the module
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
    store: {},
    getItem: vi.fn((key) => localStorageMock.store[key] || null),
    setItem: vi.fn((key, value) => { localStorageMock.store[key] = value; }),
    removeItem: vi.fn((key) => { delete localStorageMock.store[key]; }),
    clear: vi.fn(() => { localStorageMock.store = {}; })
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock window
global.window = {
    location: { origin: 'http://localhost:3000' },
    dispatchEvent: vi.fn(),
    CustomEvent: class CustomEvent {
        constructor(type, options) {
            this.type = type;
            this.detail = options?.detail;
        }
    }
};

describe('ConfigLoader', () => {
    let ConfigLoader;

    beforeEach(async () => {
        // Reset mocks
        mockFetch.mockReset();
        localStorageMock.clear();
        vi.useFakeTimers();

        // Fresh import for each test
        vi.resetModules();
        const module = await import('../../js/services/config-loader.js');
        ConfigLoader = module.ConfigLoader;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('load()', () => {
        it('should load config successfully from network', async () => {
            const mockConfig = {
                openrouter: {
                    apiKey: 'test-key',
                    apiUrl: 'https://api.example.com',
                    model: 'test-model',
                    maxTokens: 1000,
                    temperature: 0.5
                },
                spotify: { clientId: 'spotify-id' },
                app: { name: 'Test App' }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockConfig)
            });

            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            const config = await loadPromise;

            expect(config.openrouter.apiKey).toBe('test-key');
            expect(config.openrouter.model).toBe('test-model');
            expect(ConfigLoader.isReady()).toBe(true);
        });

        it('should retry on network failure with exponential backoff', async () => {
            // First two attempts fail, third succeeds
            mockFetch
                .mockRejectedValueOnce(new Error('Network error 1'))
                .mockRejectedValueOnce(new Error('Network error 2'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({
                        openrouter: { apiKey: 'success' }
                    })
                });

            const loadPromise = ConfigLoader.load();

            // Run through all timers for retries
            await vi.runAllTimersAsync();
            const config = await loadPromise;

            expect(mockFetch).toHaveBeenCalledTimes(3);
            expect(config.openrouter.apiKey).toBe('success');
        });

        it('should fall back to cached config after all retries fail', async () => {
            // Set up cache
            localStorageMock.store['rhythm_chamber_config_cache'] = JSON.stringify({
                config: { openrouter: { model: 'cached-model' } },
                timestamp: Date.now()
            });

            // All attempts fail
            mockFetch.mockRejectedValue(new Error('Network error'));

            const loadPromise = ConfigLoader.load({ forceRefresh: true });
            await vi.runAllTimersAsync();
            const config = await loadPromise;

            expect(config.openrouter.model).toBe('cached-model');
        });

        it('should use critical defaults when network and cache both fail', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            const config = await loadPromise;

            expect(config.openrouter.apiUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
            expect(config.openrouter.model).toBe('xiaomi/mimo-v2-flash:free');
            expect(ConfigLoader.getLoadStatus().failed).toBe(true);
            expect(ConfigLoader.getLoadStatus().usingDefaults).toBe(true);
        });

        it('should return cached config on subsequent calls', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ openrouter: { apiKey: 'first-load' } })
            });

            const loadPromise1 = ConfigLoader.load();
            await vi.runAllTimersAsync();
            await loadPromise1;

            // Reset mock to verify it's not called again
            mockFetch.mockReset();

            const config2 = await ConfigLoader.load();
            expect(mockFetch).not.toHaveBeenCalled();
            expect(config2.openrouter.apiKey).toBe('first-load');
        });

        it('should force refresh when option is set', async () => {
            // First load
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ openrouter: { apiKey: 'first' } })
            });

            const loadPromise1 = ConfigLoader.load();
            await vi.runAllTimersAsync();
            await loadPromise1;

            // Force refresh
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ openrouter: { apiKey: 'second' } })
            });

            const loadPromise2 = ConfigLoader.load({ forceRefresh: true });
            await vi.runAllTimersAsync();
            const config = await loadPromise2;

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(config.openrouter.apiKey).toBe('second');
        });
    });

    describe('get()', () => {
        beforeEach(async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    openrouter: {
                        apiKey: 'test-key',
                        nested: { deep: { value: 'found' } }
                    }
                })
            });
            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            await loadPromise;
        });

        it('should get value by dot notation path', () => {
            expect(ConfigLoader.get('openrouter.apiKey')).toBe('test-key');
        });

        it('should get deeply nested values', () => {
            expect(ConfigLoader.get('openrouter.nested.deep.value')).toBe('found');
        });

        it('should return default value for missing paths', () => {
            expect(ConfigLoader.get('nonexistent.path', 'default')).toBe('default');
        });

        it('should throw when accessing before load without default', async () => {
            vi.resetModules();
            const freshModule = await import('../../js/services/config-loader.js');
            const FreshConfigLoader = freshModule.ConfigLoader;

            expect(() => FreshConfigLoader.get('nonexistent.path')).toThrow();
        });
    });

    describe('set()', () => {
        beforeEach(async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    openrouter: { apiKey: 'original' }
                })
            });
            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            await loadPromise;
        });

        it('should set value at path', () => {
            ConfigLoader.set('openrouter.apiKey', 'updated');
            expect(ConfigLoader.get('openrouter.apiKey')).toBe('updated');
        });

        it('should create nested path if it does not exist', () => {
            ConfigLoader.set('new.nested.path', 'value');
            expect(ConfigLoader.get('new.nested.path')).toBe('value');
        });
    });

    describe('getLoadStatus()', () => {
        it('should report success status after successful load', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({})
            });

            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            await loadPromise;

            const status = ConfigLoader.getLoadStatus();
            expect(status.failed).toBe(false);
            expect(status.error).toBeNull();
            expect(status.usingDefaults).toBe(false);
        });

        it('should report failure status when using defaults', async () => {
            mockFetch.mockRejectedValue(new Error('Failed'));

            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            await loadPromise;

            const status = ConfigLoader.getLoadStatus();
            expect(status.failed).toBe(true);
            expect(status.error).toBe('Failed');
            expect(status.usingDefaults).toBe(true);
        });
    });

    describe('Cache', () => {
        it('should cache config to localStorage on successful load', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    openrouter: { model: 'cached-model' }
                })
            });

            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            await loadPromise;

            expect(localStorageMock.setItem).toHaveBeenCalled();
            const cached = JSON.parse(localStorageMock.store['rhythm_chamber_config_cache']);
            expect(cached.config.openrouter.model).toBe('cached-model');
        });

        it('should not cache sensitive data (API keys)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    openrouter: { apiKey: 'secret-key', model: 'test' }
                })
            });

            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            await loadPromise;

            const cached = JSON.parse(localStorageMock.store['rhythm_chamber_config_cache']);
            expect(cached.config.openrouter.apiKey).toBe('');
            expect(cached.config.openrouter.model).toBe('test');
        });

        it('should clear cache when requested', async () => {
            localStorageMock.store['rhythm_chamber_config_cache'] = 'cached';

            ConfigLoader.clearCache();

            expect(localStorageMock.removeItem).toHaveBeenCalledWith('rhythm_chamber_config_cache');
        });

        it('should reject expired cache (>7 days old)', async () => {
            const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
            localStorageMock.store['rhythm_chamber_config_cache'] = JSON.stringify({
                config: { openrouter: { model: 'expired' } },
                timestamp: eightDaysAgo
            });

            mockFetch.mockRejectedValue(new Error('Network error'));

            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            const config = await loadPromise;

            // Should use defaults, not expired cache
            expect(config.openrouter.model).toBe('xiaomi/mimo-v2-flash:free');
        });
    });

    describe('Validation', () => {
        it('should warn about missing required sections', async () => {
            const consoleSpy = vi.spyOn(console, 'warn');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    // Missing openrouter, spotify, app sections
                })
            });

            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            await loadPromise;

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ConfigLoader] Config validation warnings'),
                expect.any(Array)
            );
        });
    });

    describe('Backward Compatibility', () => {
        it('should install window.Config proxy', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    openrouter: { apiKey: 'proxy-test' }
                })
            });

            const loadPromise = ConfigLoader.load();
            await vi.runAllTimersAsync();
            await loadPromise;

            ConfigLoader.installWindowProxy();

            // window.Config should now return the loaded config
            expect(window.Config.openrouter.apiKey).toBe('proxy-test');
        });
    });
});
