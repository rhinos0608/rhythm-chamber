---
path: /Users/rhinesharar/rhythm-chamber/js/storage/indexeddb.js
type: module
updated: 2026-01-21
status: active
---

# indexeddb.js

## Purpose

Low-level IndexedDB operations for the Storage layer, providing primitive operations with automatic fallback to localStorage/memory-based storage when IndexedDB is unavailable.

## Exports

- **STORES**: Object containing all IndexedDB store names (STREAMS, CHUNKS, EMBEDDINGS, PERSONALITY, SETTINGS, CHAT_SESSIONS, CONFIG, TOKENS, MIGRATION, EVENT_LOG, EVENT_CHECKPOINT, DEMO_STREAMS, DEMO_PATTERNS, DEMO_PERSONALITY)
- **DB_NAME**: Database name constant ('rhythm-chamber')
- **DB_VERSION**: Database version constant (5)
- **IndexedDBCore**: Class providing core IndexedDB operations (init, get, put, getAll, clear, delete, close) with write authority enforcement and fallback support

## Dependencies

- [[js-services-tab-coordination]]
- [[js-services-vector-clock]]
- [[js-services-event-bus]]
- [[js-storage-fallback-backend]]

## Used By

TBD

## Notes

Implements HNW (Hierarchical Namespace Write) hierarchy with TabCoordinator write authority for multi-tab safety. Includes connection retry logic with exponential backoff and configurable write authority enforcement.