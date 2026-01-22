---
path: /Users/rhinesharar/rhythm-chamber/js/services/provider-fallback-chain.js
type: service
updated: 2026-01-22
status: active
---

# provider-fallback-chain.js

## Purpose

Prevents cascade failures by automatically trying alternative LLM providers when the primary provider fails, with health tracking, blacklisting, and circuit breaker coordination for resilient provider switching.

## Exports

- `ProviderPriority` - Enum defining provider priority order (tried in sequence)
- `ProviderHealth` - Provider health status (deprecated, re-exports HealthStatus)
- `ProviderFallbackChain` - Main class implementing automatic provider fallback system
- `default` - Default export of ProviderFallbackChain
- `new` - Constructor for creating new instances

## Dependencies

- [[event-bus.js]]
- [[provider-health-authority.js]]
- [[provider-interface.js]]

## Used By

TBD

## Notes

ProviderCircuitBreaker import is deprecated - use ProviderHealthAuthority instead. Legacy import kept for backwards compatibility during transition.