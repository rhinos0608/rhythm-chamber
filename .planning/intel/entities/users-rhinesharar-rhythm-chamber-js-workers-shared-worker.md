---
path: /Users/rhinesharar/rhythm-chamber/js/workers/shared-worker.js
type: module
updated: 2026-01-22
status: active
---

# shared-worker.js

## Purpose

Central message hub for cross-tab coordination when BroadcastChannel is unavailable. Maintains connections to all open tabs and routes messages between them with leader election support.

## Exports

None

## Dependencies

[[timeouts.js]]

## Used By

TBD

## Notes

Handles tab registration, message broadcasting, disconnect detection, and leader election coordination through MessagePort connections. Uses WORKER_TIMEOUTS from config.