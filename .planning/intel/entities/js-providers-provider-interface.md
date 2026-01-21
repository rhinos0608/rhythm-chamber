---
path: /Users/rhinesharar/rhythm-chamber/js/providers/provider-interface.js
type: service
updated: 2026-01-21
status: active
---

# provider-interface.js

## Purpose

Unified abstraction layer for all LLM providers (OpenRouter, Ollama, LM Studio, Gemini). Handles configuration building, request routing, provider health checks, and error normalization. Implements "Bring Your Own AI" - users choose local or cloud infrastructure.

## Exports

- `ProviderInterface` - LLM provider abstraction service
- `buildProviderConfig(provider, settings, baseConfig)` - Build provider-specific configuration
- `callProvider(config, apiKey, messages, tools, onProgress)` - Route LLM calls to appropriate provider
- `isProviderAvailable(provider)` - Check if provider is available
- `getAvailableProviders()` - Get list of available providers
- `checkHealth()` - Comprehensive health check for all providers
- `checkOpenRouterHealth()` - Check OpenRouter health and API key validity
- `checkOllamaHealth()` - Check Ollama health and available models
- `checkLMStudioHealth()` - Check LM Studio health and loaded models
- `checkGeminiHealth()` - Check Gemini health and API key validity
- `normalizeProviderError(error, provider)` - Normalize provider errors to consistent format

## Dependencies

- [[js-module-registry]] - Module registry for dynamic provider loading
- [[js-utils-timeout-wrapper]] - Timeout protection with TimeoutError
- [[js-services-provider-circuit-breaker]] - Circuit breaker for provider calls
- [[js-services-config-loader]] - Configuration loading
- [[js-settings]] - User settings
- [[js-providers-openrouter]] - OpenRouter provider
- [[js-providers-lmstudio]] - LM Studio provider
- [[js-providers-gemini]] - Gemini provider
- [[js-providers-ollama]] - Ollama provider

## Used By

TBD

## Notes

Local providers (Ollama, LM Studio) get 90s timeout vs 60s for cloud. Health checks return model lists, latency, and status (ready, no_key, not_running, invalid_key, timeout). Circuit breaker prevents cascade failures.