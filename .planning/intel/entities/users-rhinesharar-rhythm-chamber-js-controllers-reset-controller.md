---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/reset-controller.js
type: controller
updated: 2026-01-21
status: active
---

# reset-controller.js

## Purpose

Handles data reset operations with proper worker cleanup. Extracted from app.js to separate reset concerns from main app flow.

## Exports

- **ResetController** - Main controller object containing reset operations and modal management

## Dependencies

- [[storage]] (Storage)
- [[app-state]] (AppState)
- [[spotify]] (Spotify)
- [[chat]] (Chat)
- [[operation-lock]] (OperationLock)
- [[view-controller]] (ViewController)
- [[file-upload-controller]] (FileUploadController)

## Used By

TBD

## Notes

Uses dependency injection pattern via `init()` function. Implements operation lock checks to prevent conflicts during file processing or embedding generation.