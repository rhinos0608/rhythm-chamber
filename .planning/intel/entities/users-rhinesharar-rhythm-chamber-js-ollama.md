---
path: /Users/rhinesharar/rhythm-chamber/js/ollama.js
type: module
updated: 2026-01-21
status: active
---

# ollama.js

## Purpose

Provides local LLM integration via Ollama API for zero-cloud privacy. Enables music analysis and generation using user-hosted AI models.

## Exports

- **Ollama** - Main class for Ollama API communication with model management, chat completion, and tool calling support

## Dependencies

- [[module-registry]]

## Used By

TBD

## Notes

Default endpoint: `http://localhost:11434`. Recommended models include Llama 3.2, Mistral, DeepSeek R1, and Qwen 2.5. Tool calling supported on llama3.2+, mistral, qwen2.5, deepseek-r1, command-r, granite3-dense, hermes3, nemotron, and functionary models.