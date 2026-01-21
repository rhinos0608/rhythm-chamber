---
path: /Users/rhinesharar/rhythm-chamber/js/providers/provider-interface.js
type: module
updated: 2026-01-21
status: active
---

# provider-interface.js

## Purpose

Unified abstraction layer for all LLM providers (OpenRouter, Ollama, LM Studio, Gemini) that handles configuration building and request routing with support for both local and cloud AI infrastructure.

## Exports

- `ProviderInterface` - Main interface class for managing LLM provider configurations and routing requests

## Dependencies

- [[module-registry]]
- [[timeout-wrapper]]
- [[provider-health-authority]]
- [[config-loader]]
- [[settings]]
- [[openrouter]]
- [[lmstudio]]
- [[gemini]]

## Used By

TBD

## Notes

- Supports "Bring Your Own AI" philosophy allowing users to choose local or cloud AI infrastructure
- Local providers (Ollama, LM Studio) flagged with `isLocal: true` and `privacyLevel: 'maximum'`
- Different timeout values: 60s for cloud APIs, 90s for local LLMs