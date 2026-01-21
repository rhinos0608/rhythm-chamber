---
path: /Users/rhinesharar/rhythm-chamber/js/providers/lmstudio.js
type: module
updated: 2026-01-21
status: active
---

# lmstudio.js

## Purpose

Handles API calls to LM Studio (OpenAI-compatible local server) with streaming support and thinking block detection for local AI model inference.

## Exports

- `LMStudioProvider` - Provider class for LM Studio API integration
- `call()` - Main async function for making API calls with optional streaming
- `handleStreamingResponse()` - Processes SSE streaming responses with thinking block detection
- `mergeThinkingBlocks()` - Merges split thinking blocks in streaming content

## Dependencies

- [[safe-json.js]] - Safe JSON parsing utilities
- External: None (uses browser fetch API)

## Used By

TBD

## Notes

Implements OpenAI-compatible API protocol for local inference. Requires LM Studio running locally with a model loaded. Supports 90-second timeout for local model inference and includes tool/function calling with auto choice mode.