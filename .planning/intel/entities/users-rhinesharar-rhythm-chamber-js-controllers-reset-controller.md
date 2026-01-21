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

- `ResetController` - Main controller object containing all reset-related functions

## Dependencies

- [[focus-trap.js]]

## Used By

TBD

## Notes

Uses dependency injection pattern via init(). All dependencies (_Storage, _AppState, _Spotify, _Chat, _OperationLock, _ViewController, _showToast, _FileUploadController) injected externally. Manages focus trap cleanup for modals. Implements operation lock checking before reset.