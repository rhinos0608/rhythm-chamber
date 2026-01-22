---
path: /Users/rhinesharar/rhythm-chamber/js/storage/event-log-store.js
type: module
updated: 2026-01-22
status: active
---

# event-log-store.js

## Purpose

Persistent event log with IndexedDB backing for event replay and causality tracking using VectorClock-based ordering for distributed event coordination.

## Exports

- **EventLogStore** - Main event log store class with persistence, replay, and compaction capabilities
- **closeEventLogStore()** - Closes cached database connection
- **initEventLogStores()** - Initializes event log stores with retry logic and connection caching
- **createEventCheckpoint()** - Creates checkpoint for rapid replay
- **replayFromCheckpoint()** - Replays events from checkpoint
- **compactEventLog()** - Compacts event log based on configuration

## Dependencies

- [[vector-clock]]
- [[event-bus]]
- [[indexeddb]]

## Used By

TBD

## Notes

Implements HNW (Hierarchy/Network/Wave) considerations for event persistence with automatic compaction and checkpointing. Connection is cached and reused with retry logic for blocked connections.