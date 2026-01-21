---
path: /Users/rhinesharar/rhythm-chamber/js/providers/openrouter.js
type: service
updated: 2026-01-21
status: active
---

# openrouter.js

## Purpose

Handles API calls to OpenRouter for cloud-based LLM inference with timeout support and error handling.

## Exports

- `call()` - Main async function to make chat completion API calls to OpenRouter with message history and optional tools

## Dependencies

None (uses browser fetch API)

## Used By

TBD

## Notes

- 60-second default timeout (configurable)
- Supports function calling via tools parameter
- Requires API key and model configuration
- OpenAI-compatible response format