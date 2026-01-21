---
path: /Users/rhinesharar/rhythm-chamber/js/template-profiles.js
type: module
updated: 2026-01-21
status: active
---

# template-profiles.js

## Purpose

Manages curated template profiles that users can browse and explore. Templates are read-only, real listening patterns (anonymized) from consenting users, bundled synchronously with the app.

## Exports

- **TemplateProfileStore** - Singleton instance providing access to template profiles
- **TemplateProfileStoreClass** - Class managing template lifecycle, validation, and lazy loading

## Dependencies

- [[demo-data.js]]
- [[logger.js]]

## Used By

TBD

## Notes

Templates load synchronously and are never modified by app logic (read-only network). Stream data is lazy-loaded from DemoData module. Template structure requires id, name, description, emoji, and metadata fields.