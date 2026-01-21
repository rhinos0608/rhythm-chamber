---
path: /Users/rhinesharar/rhythm-chamber/js/services/event-bus.js
type: service
updated: 2026-01-21
status: active
---

# event-bus.js

## Purpose

Centralized pub/sub event system providing typed events, priority dispatch, debugging, and cross-tab coordination. Replaces scattered event patterns with unified event management.

## Exports

- **EventBus** - Main event bus class with typed events, priority queues, circuit breaker per handler, async emit, and cross-tab sync

## Dependencies

- [[vector-clock]]
- [[event-log-store]]
- [[tab-coordination]]

## Used By

TBD

## Notes

Event schemas defined for type safety; supports priority ordering (errors/state changes first); includes circuit breaker pattern for fault tolerance; coordinates events across browser tabs via TabCoordinator.