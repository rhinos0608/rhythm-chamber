---
path: /Users/rhinesharar/rhythm-chamber/js/parser-worker.js
type: service
updated: 2026-01-22
status: active
---

# parser-worker.js

## Purpose

Web Worker that handles heavy file parsing operations off the main thread, including ZIP extraction and validation with memory management and backpressure controls.

## Exports

None (Worker message handler)

## Dependencies

- ./vendor/jszip.min.js

## Used By

TBD

## Notes

- Implements sliding window backpressure with ACK-based flow control to prevent message queue overflow
- Uses chunked processing (10MB chunks) with memory pressure monitoring
- Includes prototype pollution guards for security
- Supports pause/resume for memory relief and graceful cancellation
- Validates parsed data with 95% validity threshold and 500MB file size limit