---
path: /Users/rhinesharar/rhythm-chamber/js/services/config-loader.js
type: service
updated: 2026-01-21
status: active
---

# config-loader.js

## Purpose

Loads configuration from JSON file with retry logic, validation, and fallback defaults to replace the fragile `<script src="config.js">` pattern with a resilient async loader.

## Exports

- **ConfigLoader** - Main configuration loader service with load, get, validate, and clear cache methods

## Dependencies

None

## Used By

TBD

## Notes

Features exponential backoff retry (3 attempts), inline critical defaults for app functionality, LocalStorage caching for offline resilience, config validation against required fields, and event emission on config load/failure for UI awareness.