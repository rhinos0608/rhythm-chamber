---
path: /Users/rhinesharar/rhythm-chamber/js/providers/openrouter.js
type: service
updated: 2026-01-21
status: active
---

# openrouter.js

## Purpose

Handles API calls to OpenRouter for cloud-based LLM inference. Provides OpenAI-compatible interface with timeout support and error handling for music recommendation chat functionality.

## Exports

- `OpenRouterProvider` - OpenRouter provider service
- `call(apiKey, config, messages, tools, onProgress)` - Make API call to OpenRouter
- `callStreaming(apiKey, config, messages, onToken)` - Streaming API call (not yet implemented)
- `validateApiKey(apiKey)` - Lightweight API key validation
- `listModels(apiKey)` - Get available models from OpenRouter
- `TIMEOUT_MS` - 60 second timeout constant
- `name` - 'openrouter'
- `displayName` - 'OpenRouter'
- `type` - 'cloud'

## Dependencies

- fetch - HTTP requests to OpenRouter API
- AbortController - Request timeout handling

## Used By

TBD

## Notes

60-second timeout for cloud API requests. Streaming not yet implemented - falls back to non-streaming. Includes app referer and title headers for OpenRouter analytics. Supports function calling with tools parameter.