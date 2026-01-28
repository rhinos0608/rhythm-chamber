/**
 * Fallback Config Module Tests
 */

import { describe, it, expect } from 'vitest';
import {
    ProviderPriority,
    ProviderHealth,
    createDefaultProviderConfigs,
    DEFAULT_CONFIG
} from '../../../js/services/fallback/config.js';

describe('fallback/config', () => {
    describe('ProviderPriority', () => {
        it('should have correct priority values', () => {
            expect(ProviderPriority.OPENROUTER).toBe(1);
            expect(ProviderPriority.LM_STUDIO).toBe(2);
            expect(ProviderPriority.OLLAMA).toBe(3);
            expect(ProviderPriority.FALLBACK).toBe(4);
        });

        it('should be frozen (immutable)', () => {
            // Object.freeze prevents assignment - should throw
            expect(() => {
                ProviderPriority.OPENROUTER = 999;
            }).toThrow();
            expect(ProviderPriority.OPENROUTER).toBe(1); // Still original value
        });
    });

    describe('ProviderHealth', () => {
        it('should export health status constants', () => {
            // Note: HealthStatus values are lowercase (from ProviderHealthAuthority)
            expect(ProviderHealth.HEALTHY).toBe('healthy');
            expect(ProviderHealth.DEGRADED).toBe('degraded');
            expect(ProviderHealth.UNKNOWN).toBe('unknown');
            expect(ProviderHealth.UNHEALTHY).toBe('unhealthy');
            expect(ProviderHealth.BLACKLISTED).toBe('blacklisted');
        });
    });

    describe('createDefaultProviderConfigs', () => {
        it('should create provider configurations map', () => {
            const configs = createDefaultProviderConfigs();

            expect(configs).toBeInstanceOf(Map);
            expect(configs.size).toBe(4);
        });

        it('should configure openrouter correctly', () => {
            const configs = createDefaultProviderConfigs();
            const openrouter = configs.get('openrouter');

            expect(openrouter).toBeDefined();
            expect(openrouter.name).toBe('openrouter');
            expect(openrouter.priority).toBe(ProviderPriority.OPENROUTER);
            expect(openrouter.timeoutMs).toBe(60000);
            expect(openrouter.isLocal).toBe(false);
            expect(openrouter.maxRetries).toBe(3);
        });

        it('should configure lmstudio correctly', () => {
            const configs = createDefaultProviderConfigs();
            const lmstudio = configs.get('lmstudio');

            expect(lmstudio).toBeDefined();
            expect(lmstudio.name).toBe('lmstudio');
            expect(lmstudio.priority).toBe(ProviderPriority.LM_STUDIO);
            expect(lmstudio.timeoutMs).toBe(90000);
            expect(lmstudio.isLocal).toBe(true);
            expect(lmstudio.maxRetries).toBe(2);
        });

        it('should configure ollama correctly', () => {
            const configs = createDefaultProviderConfigs();
            const ollama = configs.get('ollama');

            expect(ollama).toBeDefined();
            expect(ollama.name).toBe('ollama');
            expect(ollama.priority).toBe(ProviderPriority.OLLAMA);
            expect(ollama.timeoutMs).toBe(90000);
            expect(ollama.isLocal).toBe(true);
            expect(ollama.maxRetries).toBe(2);
        });

        it('should configure fallback correctly', () => {
            const configs = createDefaultProviderConfigs();
            const fallback = configs.get('fallback');

            expect(fallback).toBeDefined();
            expect(fallback.name).toBe('fallback');
            expect(fallback.priority).toBe(ProviderPriority.FALLBACK);
            expect(fallback.timeoutMs).toBe(0);
            expect(fallback.isLocal).toBe(true);
            expect(fallback.maxRetries).toBe(0);
        });
    });

    describe('DEFAULT_CONFIG', () => {
        it('should have default blacklist duration', () => {
            expect(DEFAULT_CONFIG.BLACKLIST_DURATION_MS).toBe(300000);
        });

        it('should have default health check interval', () => {
            expect(DEFAULT_CONFIG.HEALTH_CHECK_INTERVAL_MS).toBe(60000);
        });

        it('should be frozen (immutable)', () => {
            // Object.freeze prevents assignment - should throw
            expect(() => {
                DEFAULT_CONFIG.BLACKLIST_DURATION_MS = 999999;
            }).toThrow();
            expect(DEFAULT_CONFIG.BLACKLIST_DURATION_MS).toBe(300000);
        });
    });
});
