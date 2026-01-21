---
path: /Users/rhinesharar/rhythm-chamber/js/settings.js
type: module
updated: 2026-01-21
status: active
---

# settings.js

## Purpose

Handles in-app configuration display and management for AI and Spotify settings, providing a UI to view and optionally override config.js settings via localStorage.

## Exports

- **Settings** - Main settings module class that manages configuration UI, provider selection, and user preferences

## Dependencies

- [[module-registry]]
- [[storage-breakdown-ui]]
- [[config-loader]]
- [[storage]]
- [[security-index]]
- [[secure-token-store]]
- [[data-queries]]
- [[functions-index]]
- [[spotify]]
- [[analytics-queries]]
- [[template-queries]]
- [[input-validation]]
- [[safe-json]]
- [[storage-keys]]
- [[event-bus]]
- [[settings-schema]]
- [[focus-trap]]

## Used By

TBD

## Notes

- Source of truth is config.js - this module provides UI layer for viewing/overriding settings
- Manages multiple LLM providers (Ollama, LM Studio, Gemini, OpenRouter)
- Implements modal focus traps for accessibility
- Uses localStorage for user setting overrides