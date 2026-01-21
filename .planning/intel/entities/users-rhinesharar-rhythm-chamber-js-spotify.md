---
path: /Users/rhinesharar/rhythm-chamber/js/spotify.js
type: service
updated: 2026-01-21
status: active
---

# spotify.js

## Purpose

Handles Spotify OAuth 2.0 PKCE authentication flow and Spotify Web API integration for the Quick Snapshot feature, providing secure token management and API calls.

## Exports

- `Spotify` - Main module providing authentication (login/logout), token management (refresh/getAccessToken), and API methods (fetchRecentlyPlayed, fetchTopArtists, fetchTopTracks, fetchUserProfile)

## Dependencies

- [[security/index.js]]
- [[services/config-loader.js]]
- [[security/secure-token-store.js]]
- [[utils/logger.js]]

## Used By

TBD

## Notes

Implements PKCE (Proof Key for Code Exchange) OAuth flow with secure token vault storage using SecureTokenStore. Includes in-memory token caching to reduce secure storage reads. Falls back to localStorage for legacy sessions but requires HTTPS/localhost for secure vault operations.