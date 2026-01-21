---
path: /Users/rhinesharar/rhythm-chamber/js/rag.js
type: module
updated: 2026-01-21
status: active
---

# rag.js

## Purpose

Handles semantic search using local browser embeddings (WASM) for retrieval-augmented generation. Provides 100% client-side embedding and chunking functionality with zero external dependencies.

## Exports

- **RAG** - Main RAG class providing semantic search, document chunking, and checkpoint management

## Dependencies

[[module-registry]], [[patterns]], [[storage]], [[security/index]], [[operation-lock]], [[utils/safe-json]]

## Used By

TBD

## Notes

- Uses Web Workers for off-thread embedding computation to avoid blocking main thread
- Checkpoints encrypted with session-derived keys for security
- Supports incremental embedding updates for efficient processing
- Falls back to main-thread processing if Web Workers unavailable