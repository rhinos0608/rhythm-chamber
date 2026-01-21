---
path: /Users/rhinesharar/rhythm-chamber/js/security/security-coordinator.js
type: service
updated: 2026-01-21
status: active
---

# security-coordinator.js

## Purpose

Single authority for security module initialization, orchestrating all security modules in correct order and providing centralized "is security ready" status.

## Exports

- **SecurityCoordinatorClass** - Main coordinator class managing security initialization lifecycle
- **InitState** - Enum for initialization states (NOT_STARTED, IN_PROGRESS, READY, FAILED, DEGRADED)
- **SecurityCoordinator** - Singleton instance of SecurityCoordinatorClass

## Dependencies

- [[encryption]]
- [[token-binding]]
- [[anomaly]]
- [[key-manager]]
- [[storage-encryption]]
- [[safe-mode]]

## Used By

TBD

## Notes

- Initialization order is critical: secure context → KeyManager → Encryption → TokenBinding → Anomaly detection → prototype pollution protection
- Supports degraded mode where core security features remain available even if some modules fail
- All initialization through singleton pattern via `SecurityCoordinator.getInstance()`