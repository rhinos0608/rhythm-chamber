---
path: /Users/rhinesharar/rhythm-chamber/js/providers/gemini.js
type: module
updated: 2026-01-21
status: active
---

# gemini.js

## Purpose

Provides the Gemini provider implementation for Google AI Studio API integration using OpenAI-compatible endpoints with support for multiple Gemini models.

## Exports

- `GeminiProvider` - Main provider class for Google AI Studio API calls

## Dependencies

- [[safe-json]]

## Used By

TBD

## Notes

- Supports 60-second timeout with configurable abort controller
- Function calling via OpenAI-compatible tool format
- Free tier models available for Gemini 2.5 Flash/Lite and 2.0 Flash series
- Maximum 1M-2M token context window depending on model