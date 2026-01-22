---
path: /Users/rhinesharar/rhythm-chamber/js/observability/init-observability.js
type: module
updated: 2026-01-22
status: active
---

# init-observability.js

## Purpose

Main integration point for all observability components, initializing Core Web Vitals tracking, Performance Profiler, Metrics Exporter, and Observability Controller with EventBus integration.

## Exports

- `initObservability(userOptions)` - Initialize observability system with all components
- `getObservability()` - Get current observability instances
- `isObservabilityInitialized()` - Check if observability has been initialized
- `disableObservability()` - Disable and cleanup observability components

## Dependencies

- [[event-bus]]
- [[core-web-vitals]]
- [[performance-profiler]]
- [[metrics-exporter]]
- [[observability-controller]]

## Used By

TBD

## Notes

Contains security warning about metrics encryption configuration - deliberately prevents reading encryption keys from localStorage due to XSS vulnerabilities. Singleton pattern with eventBus unsubscribe tracking for cleanup.