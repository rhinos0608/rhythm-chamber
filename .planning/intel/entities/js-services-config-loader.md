---
path: /Users/rhinesharar/rhythm-chamber/js/services/config-loader.js
type: service
updated: 2026-01-21
status: active
---

# config-loader.js

## Purpose

Configuration loading service that provides unified access to application configuration from multiple sources (config.js, localStorage, environment). Handles encryption settings, API keys, and LLM provider configuration.

## Exports

- `ConfigLoader` - Configuration loader service
- `get(key, defaultValue)` - Get configuration value
- `set(key, value)` - Set configuration value
- `has(key)` - Check if configuration key exists
- `getAll()` - Get all configuration values
- `reload()` - Reload configuration from sources

## Dependencies

- [[js-config-example]] - Default configuration template
- localStorage - User configuration storage
- ConfigAPI for encrypted config storage

## Used By

TBD

## Notes

Implements fallback chain: localStorage → config.js → defaults. Supports encrypted storage for sensitive values like API keys. Provides reactive updates when configuration changes.