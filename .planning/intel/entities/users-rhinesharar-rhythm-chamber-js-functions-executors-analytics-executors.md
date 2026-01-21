---
path: /Users/rhinesharar/rhythm-chamber/js/functions/executors/analytics-executors.js
type: util
updated: 2026-01-21
status: active
---

# analytics-executors.js

## Purpose

Provides analytics query executors for stats.fm and Spotify Wrapped-style music listening analytics, handling date-range filtering, aggregation, and ranking operations.

## Exports

- `AnalyticsExecutors` - Collection of executor functions for various analytics queries

## Dependencies

- [[js-utils-validation]]

## Used By

TBD

## Notes

Follows HNW (Hierarchy, Network, Wave) architecture principles. All executors return consistent format with error handling and date-range filtering. Supports bottom tracks/artists queries, top tracks/artists queries, and listening patterns analysis.