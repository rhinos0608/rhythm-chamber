---
path: /Users/rhinesharar/rhythm-chamber/js/data-query.js
type: util
updated: 2026-01-21
status: active
---

# data-query.js

## Purpose

Provides query utilities for filtering and analyzing streaming data by time period, artist, or track to enable AI chat interactions with listening history.

## Exports

- `DataQuery` - Main export providing query functions for streaming data analysis
  - `queryByTimePeriod(streams, options)` - Filter streams by year, month, or date range
  - `queryByArtist(streams, artistName)` - Search streams by artist name with insights
  - `queryByTrack(streams, trackName)` - Search streams by track name
  - `getTopArtistsForPeriod(streams, options)` - Get top artists for a time period
  - Additional helper functions for stream summarization and top items

## Dependencies

- [[logger.js]] - Logging utilities

## Used By

TBD

## Notes

All query functions are case-insensitive and support partial matching. Month parameter is 1-indexed for user convenience but converted to 0-indexed internally. Returns summary objects with `found` boolean flag and relevant insights.