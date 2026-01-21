---
path: /Users/rhinesharar/rhythm-chamber/js/genre-enrichment.js
type: service
updated: 2026-01-21
status: active
---

# genre-enrichment.js

## Purpose

Fills missing genre data from Spotify exports using a static map of top artists plus MusicBrainz API fallback enrichment.

## Exports

- `GenreEnrichment` - Service class that provides instant genre lookups via static map and lazy API enrichment for unknown artists

## Dependencies

- [[storage.js]]
- [[utils/logger.js]]

## Used By

TBD

## Notes

Uses rate-limited queue for API calls and progressive enrichment that doesn't block UI.