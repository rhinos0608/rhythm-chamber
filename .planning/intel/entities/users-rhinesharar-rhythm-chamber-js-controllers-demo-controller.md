---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/demo-controller.js
type: controller
updated: 2026-01-21
status: active
---

# demo-controller.js

## Purpose

Handles demo mode with isolated data sandbox, separating demo concerns from main app flow.

## Exports

- **DemoController**: Main controller class managing demo mode initialization, data isolation, and cleanup

## Dependencies

- [[patterns]]
- [[indexeddb]]
- [[chat]]

## Used By

TBD

## Notes

- Uses `demo_` prefix and separate IndexedDB stores for complete data isolation
- Provides in-memory caching with fallback to IndexedDB for large data
- Exports singleton instance accessed via `DemoController.instance`