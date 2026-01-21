---
path: /Users/rhinesharar/rhythm-chamber/js/storage/quota-monitor.js
type: service
updated: 2026-01-21
status: active
---

# quota-monitor.js

## Purpose

Provides storage quota estimation and monitoring for IndexedDB, displaying usage information like "Using 45MB of 120MB available" in settings and header components.

## Exports

- **QuotaMonitor**: Main module that monitors storage quota using StorageManager API with fallbacks for legacy browsers

## Dependencies

- [[html-escape.js]]

## Used By

TBD

## Notes

Uses caching and polling (30s intervals) to minimize API calls. Includes warning (80%) and critical (95%) thresholds with HTML escaping for safe display formatting.