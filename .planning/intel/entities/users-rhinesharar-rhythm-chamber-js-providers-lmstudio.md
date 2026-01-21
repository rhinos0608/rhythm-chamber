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

- `LMStudioProvider` - Provider interface for LM Studio API calls with streaming and tool calling support

## Dependencies

None

## Used By

TBD

## Notes

Bring Your Own AI (BYOAI) implementation - users run AI models on their own hardware for maximum privacy. Supports 90-second timeout for local models and thinking block detection in streaming responses.