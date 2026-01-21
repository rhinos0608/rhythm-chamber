---
path: /Users/rhinesharar/rhythm-chamber/js/functions/executors/data-executors.js
type: module
updated: 2026-01-21
status: active
---

# data-executors.js

## Purpose

Core execution logic for data query functions, providing validated and date-filtered analytics operations with HNW compliance through retry utilities and input validation.

## Exports

- **DataExecutors**: Collection of executor functions for data query operations including `executeGetTopArtists` and related streaming data aggregators

## Dependencies

- [[data-query]]
- [[validation]]

## Used By

TBD

## Notes

Implements HNW compliance through validation utilities with retry logic. Supports flexible date range filtering (year/month/quarter/season) and sorting by multiple metrics (plays/time). Returns ranked results with period metadata.