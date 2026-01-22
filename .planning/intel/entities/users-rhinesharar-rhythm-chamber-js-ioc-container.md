---
path: /Users/rhinesharar/rhythm-chamber/js/ioc-container.js
type: util
updated: 2026-01-22
status: active
---

# ioc-container.js

## Purpose

Lightweight dependency injection container managing service dependencies with auto-wiring and lazy initialization.

## Exports

- **Container**: IoC container with register/resolve/has/clear methods supporting singleton and transient lifecycles

## Dependencies

None

## Used By

TBD

## Notes

- Factory functions are lazy (only called on first resolve)
- Singleton lifecycle caches instances; transient creates new each time
- Auto-wires based on dependency array parameter names
- Prevents circular dependencies via resolution stack tracking