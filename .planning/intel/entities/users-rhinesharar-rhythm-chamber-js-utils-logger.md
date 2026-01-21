---
path: /Users/rhinesharar/rhythm-chamber/js/utils/logger.js
type: util
updated: 2026-01-21
status: active
---

# logger.js

## Purpose

Centralized logging utility with level filtering, sensitive data redaction, and environment-aware defaults for development and production modes.

## Exports

- `LOG_LEVELS` - Constants defining log level hierarchy (TRACE, DEBUG, INFO, WARN, ERROR, NONE)
- `configureLogger(options)` - Configure logger with level and release stage
- `getLogLevel()` - Get current log level as number
- `getLogLevelName()` - Get current log level name as string
- `isLevelEnabled(level)` - Check if a given log level would output
- `createLogger(module)` - Create module-specific logger with consistent formatting
- `logger` - Default logger instance
- `trace`, `debug`, `info`, `warn`, `error` - Convenience logging functions

## Dependencies

None

## Used By

TBD

## Notes

- Automatically detects development vs production environment
- Redacts sensitive data (tokens, keys, passwords, secrets) from log output
- Performance optimized with no-op functions for disabled levels
- Supports module-specific loggers for better traceability