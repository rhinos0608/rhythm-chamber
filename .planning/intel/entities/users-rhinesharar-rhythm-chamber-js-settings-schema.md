---
path: /Users/rhinesharar/rhythm-chamber/js/settings-schema.js
type: config
updated: 2026-01-21
status: active
---

# settings-schema.js

## Purpose

Centralized schema definition, validation, and migration system for application settings with type checking, range validation, and defaults.

## Exports

- `SETTINGS_SCHEMA_VERSION` - Current schema version for migration tracking
- `SETTINGS_SCHEMA` - Complete schema definition with validation rules for all settings
- `validateSettings(settings, schema)` - Validates settings against schema, returns {valid, errors}
- `getDefaultSettings()` - Returns default settings object from schema
- `mergeWithDefaults(settings)` - Merges partial settings with defaults
- `SETTINGS_MIGRATIONS` - Migration handlers for schema version changes
- `migrateSettings(settings)` - Migrates settings to current schema version
- `needsMigration(settings)` - Checks if settings require migration
- `SettingsSchema` - Class-based API for schema validation and migration

## Dependencies

None

## Used By

TBD

## Notes

Supports nested object schemas with type checking (string, number, boolean, enum, url), range validation (min/max), regex patterns, and sensitive field marking for API keys. Includes migration system for breaking changes.