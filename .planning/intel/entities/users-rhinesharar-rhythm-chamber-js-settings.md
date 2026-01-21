---
path: /Users/rhinesharar/rhythm-chamber/js/settings.js
type: module
updated: 2026-01-21
status: active
---

# settings.js

## Purpose

Handles in-app configuration display for AI and Spotify settings, providing a UI to view and optionally override config.js settings via localStorage.

## Exports

- `Settings`: Main settings UI controller class that manages display and modification of AI provider and Spotify configuration settings

## Dependencies

- [[js-module-registry]]
- [[js-storage-breakdown-ui]]
- [[js-services-config-loader]]
- [[js-storage]]
- [[js-security-index]]
- [[js-functions-schemas-data-queries]]
- [[js-functions-index]]
- [[js-spotify]]
- [[js-functions-schemas-analytics-queries]]
- [[js-functions-schemas-template-queries]]

## Used By

TBD

## Notes

- Source of truth is config.js; this module provides UI layer with localStorage override capability
- Manages multiple LLM providers (Ollama, LM Studio, Gemini, OpenRouter)
- Includes abort controller for embedding cancellation operations
- Contains settings migration state management