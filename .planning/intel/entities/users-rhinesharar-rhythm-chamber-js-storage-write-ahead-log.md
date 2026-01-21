---
path: /Users/rhinesharar/rhythm-chamber/js/storage/write-ahead-log.js
type: service
updated: 2026-01-21
status: active
---

# write-ahead-log.js

## Purpose

Provides durable write queue and crash recovery for critical storage operations when encryption is unavailable (Safe Mode), with cross-tab coordination and adaptive batching.

## Exports

- **WalStatus**: Enum for WAL entry status (pending, processing, committed, failed)
- **WalPriority**: Enum for priority levels (critical, high, normal, low)
- **WriteAheadLog**: Main class implementing WAL functionality
- **default**: Default export (WriteAheadLog)

## Dependencies

- [[tab-coordination]]
- [[device-detection]]
- [[safe-mode]]
- [[event-bus]]

## Used By

TBD

## Notes

Implements HNW Network (cross-tab coordination) and HNW Wave (async write processing with adaptive batching). Entries persist to localStorage with 24-hour retention and automatic replay on startup.