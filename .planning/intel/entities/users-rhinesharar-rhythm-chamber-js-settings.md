---
path: /Users/rhinesharar/rhythm-chamber/js/settings.js
type: module
updated: 2026-01-22
status: active
---

# settings.js

## Purpose

Handles in-app configuration display and management for AI and Spotify settings, providing a UI to view and optionally override config.js settings via localStorage.

## Exports

- **Settings** - Main settings module class that manages UI display and user configuration overrides

## Dependencies

- [[module-registry]]
- [[storage-breakdown-ui]]
- [[config-loader]]
- [[storage]]
- [[security/index]]
- [[secure-token-store]]
- [[data-queries]]
- [[functions/index]]
- [[spotify]]
- [[analytics-queries]]
- [[template-queries]]
- [[input-validation]]
- [[safe-json]]
- [[html-escape]]
- [[storage/keys]]
- [[event-bus]]
- [[settings-schema]]
- [[focus-trap]]

## Used By

TBD

## Notes

- Source of truth is config.js - this module provides UI layer for viewing and overriding settings
- Manages modal focus traps for settings and tools modals
- Defines provider configurations for Ollama, LM Studio, Gemini, and OpenRouter
- Contains LLM parameter bounds and UI configuration constants