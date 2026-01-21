---
path: js/security/anomaly.js
type: service
updated: 2026-01-21
status: active
---

# anomaly.js

## Purpose

Behavioral detection and rate limiting for Rhythm Chamber security. Provides rate limiting, failed attempt tracking, geographic anomaly detection, suspicious activity checks, and adaptive lockout thresholds with travel override support.

## Exports

- `isRateLimited(key, maxPerMinute)` - Client-side rate limiting check (defense in depth only)
- `recordFailedAttempt(operation, reason)` - Track failed API attempts with geographic fingerprinting
- `checkSuspiciousActivity(operation, threshold)` - Check for suspicious activity patterns
- `clearSecurityLockout()` - Clear security lockout (user-initiated reset)
- `calculateAdaptiveThreshold(baseThreshold, operation)` - Adaptive lockout threshold calculation
- `setTravelOverride(hours, reason)` - Set travel/VPN override mode
- `clearTravelOverride()` - Clear travel override
- `getTravelOverrideStatus()` - Get travel override status

## Dependencies

- crypto.subtle - For geographic fingerprinting
- localStorage - Failed attempt storage
- sessionStorage - Session salt storage

## Used By

TBD

## Notes

Client-side rate limiting can be bypassed - real protection comes from server-side limits. Geographic anomaly detection tracks connection hashes to detect proxy/VPN attacks. Travel mode increases thresholds by 50% to reduce false positives during travel.