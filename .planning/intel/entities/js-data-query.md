---
path: /Users/rhinesharar/rhythm-chamber/js/data-query.js
type: util
updated: 2026-01-21
status: active
---

# data-query.js

## Purpose

Provides query utilities for chat to access actual streaming data. Enables AI to answer specific questions about listening history by time period, artist, track, and comparisons. Parses natural language date queries like "March 2023" or "last month".

## Exports

- `DataQuery` - Data query service
- `queryByTimePeriod(streams, options)` - Query streaming data by time period (year, month, date range)
- `queryByArtist(streams, artistName)` - Query streaming data by artist
- `queryByTrack(streams, trackName)` - Query streaming data by track
- `getTopArtistsForPeriod(streams, options)` - Get top artists for time period
- `getTopTracksForPeriod(streams, options)` - Get top tracks for time period
- `comparePeriods(streams, period1, period2)` - Compare listening stats between two periods
- `findPeakListeningPeriod(streams, artistName)` - Find when an artist was most listened to
- `parseDateQuery(query)` - Parse natural language date query into structured params
- `extractEntityFromQuery(query, streams)` - Detect artist or track mentions in query

## Dependencies

- None (pure data transformation utilities)

## Used By

TBD

## Notes

Key feature: Enables "data-driven conversations" where AI can answer specific questions like "What did I listen to in March 2023?" or "Compare my 2022 vs 2023 listening." Summarizes streams with total plays, hours, unique artists/tracks, and top items.