---
path: /Users/rhinesharar/rhythm-chamber/js/services/provider-health-monitor.js
type: service
updated: 2026-01-22
status: active
---

# provider-health-monitor.js

## Purpose

Real-time provider health monitoring service that acts as a thin adapter delegating to ProviderHealthAuthority, providing UI-friendly health data formatting and periodic polling for UI updates.

## Exports

- `HealthStatus` - Health status levels for UI display (re-exported from ProviderHealthAuthority)
- `ProviderHealthMonitor` - Main class for monitoring and formatting provider health data
- `getProviderHealthMonitor` - Factory function that returns singleton instance
- `default` - Default export (ProviderHealthMonitor class)

## Dependencies

- [[event-bus.js]] - Event bus for subscribing to and emitting health-related events
- [[provider-health-authority.js]] - Single source of truth for provider health data

## Used By

TBD

## Notes

Refactored to be a thin adapter layer - all actual health tracking logic is in ProviderHealthAuthority. Does not start monitoring automatically - requires calling `initialize()` method explicitly. Update interval defaults to 2000ms.