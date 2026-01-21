---
path: /Users/rhinesharar/rhythm-chamber/js/functions/executors/template-executors.js
type: util
updated: 2026-01-21
status: active
---

# template-executors.js

## Purpose

Execution logic for template profile functions that search and synthesize user personality templates without requiring stream data.

## Exports

- **executeGetTemplatesByGenre** - Searches templates by musical genre with optional limit
- **executeGetTemplatesWithPattern** - Searches templates by pattern type (e.g., "repetitive", "call-response")
- **executeGetTemplatesByPersonality** - Searches templates by personality type (e.g., "The Deep Listener")
- **executeSynthesizeProfile** - Synthesizes a new profile from natural language description using ProfileSynthesizer

## Dependencies

- [[template-profiles.js]] (TemplateProfileStore)
- [[profile-synthesizer.js]] (ProfileSynthesizer)

## Used By

TBD

## Notes

All executor functions check for module availability before executing and return error objects when unavailable. Search functions return empty arrays as errors when no matches found.