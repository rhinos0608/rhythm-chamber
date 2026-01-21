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

- `DemoController` - Main controller class managing demo mode with isolated storage

## Dependencies

- [[patterns.js]]
- [[indexeddb.js]]
- [[chat.js]]

## Used By

TBD

## Notes

Uses complete isolation from user data through separate IndexedDB stores with `demo_` prefix. Includes in-memory cache and sessionStorage fallback for session flags.