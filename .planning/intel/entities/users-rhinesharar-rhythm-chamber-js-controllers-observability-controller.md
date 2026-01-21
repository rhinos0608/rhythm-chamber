---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/observability-controller.js
type: controller
updated: 2026-01-21
status: active
---

# observability-controller.js

## Purpose

Manages the observability dashboard UI, including real-time metrics display, performance charts, memory usage graphs, and export controls.

## Exports

- `ObservabilityController` - Main controller class for observability dashboard
- `default` - Default export of ObservabilityController
- `ObservabilityControllerSingleton` - Singleton instance of the controller

## Dependencies

- [[performance-profiler]]
- [[core-web-vitals]]
- [[metrics-exporter]]
- [[html-escape]]

## Used By

TBD

## Notes

Uses bound event handlers for proper cleanup, supports configurable update intervals (default 5000ms), manages dashboard visibility state.