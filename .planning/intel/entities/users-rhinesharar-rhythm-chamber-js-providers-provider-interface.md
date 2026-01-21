---
path: /Users/rhinesharar/rhythm-chamber/js/providers/provider-interface.js
type: module
updated: 2026-01-21
status: active
---

# provider-interface.js

## Purpose

Unified abstraction layer for all LLM providers (OpenRouter, Ollama, LM Studio, Gemini) handling configuration building and request routing with support for both local and cloud AI infrastructure.

## Exports

- `ProviderInterface` - Main interface class for LLM provider management and request routing
- `buildProviderConfig()` - Builds provider-specific configuration objects
- `getProviderTimeout()` - Returns timeout values for cloud vs local providers

## Dependencies

- [[js-module-registry]]
- [[js-utils-timeout-wrapper]]
- [[js-services-provider-circuit-breaker]]
- [[js-services-config-loader]]
- [[js-settings]]
- [[js-providers-openrouter]]
- [[js-providers-lmstudio]]
- [[js-providers-gemini]]

## Used By

TBD

## Notes

Implements "Bring Your Own AI" philosophy allowing users to choose between local (maximum privacy) or cloud AI infrastructure. Includes 90s timeout for local providers and 60s for cloud APIs. Privacy metadata flags (`isLocal`, `privacyLevel`) included in configs for UI consumption.