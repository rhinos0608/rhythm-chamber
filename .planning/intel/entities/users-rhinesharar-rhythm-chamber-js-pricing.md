---
path: /Users/rhinesharar/rhythm-chamber/js/pricing.js
type: config
updated: 2026-01-21
status: active
---

# pricing.js

## Purpose

Defines pricing tier structure and feature management for the three-pillar pricing model (Sovereign/Curator/Chamber).

## Exports

- **Pricing**: Main pricing module with tier definitions, feature mappings, and feature-checking utilities

## Dependencies

- [[logger.js]]

## Used By

TBD

## Notes

Implements three-tier pricing: free tier (Sovereign), one-time purchase (Curator), and subscription (Chamber). All features are client-side checkable via hasFeature() utility.