---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/demo-controller.js
type: controller
updated: 2026-01-22
status: active
---

# demo-controller.js

## Purpose

Handles demo mode with isolated data sandbox, separating demo concerns from main app flow.

## Exports

- **DemoController** - Manages demo mode operations with isolated storage sandbox

## Dependencies

- [[../patterns.js]]
- [[../storage/indexeddb.js]]
- [[../chat.js]]
- [[../operation-lock.js]]

## Used By

TBD

## Notes

Uses IndexedDB for demo data storage to avoid SessionStorage size limitations. Complete isolation from user data through separate stores with `DEMO_STORAGE_PREFIX` namespace.