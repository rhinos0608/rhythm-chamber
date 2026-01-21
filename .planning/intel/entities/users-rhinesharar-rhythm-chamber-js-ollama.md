---
path: /Users/rhinesharar/rhythm-chamber/js/ollama.js
type: module
updated: 2026-01-21
status: active
---

# ollama.js

## Purpose

Provides local LLM support via Ollama with zero data sent to cloud. This is the differentiating feature that allows users to run AI models on their own hardware for maximum privacy.

## Exports

- **Ollama** - Main class for Ollama API integration with methods for model management, chat completion, and tool calling

## Dependencies

- [[module-registry]]
- [[safe-json]]

## Used By

TBD

## Notes

- Default endpoint: `http://localhost:11434`
- Recommended models include llama3.2, mistral, deepseek-r1:8b, qwen2.5:7b, and gemma2:9b
- Tool calling support for llama3.x, mistral, qwen2.5, deepseek, command-r, granite3, hermes3, nemotron, and functionary models
- Connection timeout: 5 seconds, Generation timeout: 2 minutes