---
path: /Users/rhinesharar/rhythm-chamber/js/local-vector-store.js
type: service
updated: 2026-01-22
status: active
---

# local-vector-store.js

## Purpose

In-memory + IndexedDB vector storage for local semantic search without Qdrant Cloud dependency. Provides LRU eviction, configurable max vectors, and Web Worker for non-blocking search.

## Exports

- `LocalVectorStore` - Main vector store class with LRU eviction and IndexedDB persistence
- `isSharedArrayBufferAvailable()` - Checks SharedArrayBuffer availability for zero-copy worker transfers
- `buildSharedVectorData()` - Prepares vectors in SharedArrayBuffer format for worker

## Dependencies

- [[lru-cache.js]]

## Used By

TBD

## Notes

HNW pattern: LocalVectorStore is authority for local mode, isolated from cloud Qdrant. Async persistence, sync search for responsiveness. Requires COOP/COEP headers for SharedArrayBuffer zero-copy transfers.