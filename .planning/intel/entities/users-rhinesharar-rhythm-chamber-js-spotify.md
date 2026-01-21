---
path: /Users/rhinesharar/rhythm-chamber/js/spotify.js
type: module
updated: 2026-01-21
status: active
---

# spotify.js

## Purpose

Spotify OAuth and API module that handles PKCE OAuth flow and Spotify Web API calls for the Quick Snapshot feature.

## Exports

- `Spotify` - IIFE module providing Spotify authentication and API interaction

## Dependencies

- [[js-security-security-coordinator]]
- [[js-services-config-loader]]
- [[js-security-secure-token-store]]

## Used By

TBD

## Notes

Implements secure token storage using SecureTokenStore with fallback handling for legacy sessions. Uses in-memory caching to reduce secure storage reads. Requires HTTPS or localhost for secure token vault availability.