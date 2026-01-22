---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/spotify-controller.js
type: controller
updated: 2026-01-22
status: active
---

# spotify-controller.js

## Purpose

Handles Spotify OAuth flow, token management, and data fetching. Extracted from app.js to separate Spotify concerns from main app flow.

## Exports

- `SpotifyController` - Main controller object with initialization, OAuth handling, and data fetching methods

## Dependencies

[[Storage]] [[AppState]] [[Spotify]] [[Patterns]] [[Personality]] [[ViewController]] showToast

## Used By

TBD

## Notes

Dependency injection pattern via `init()` function. Manages background token refresh for long operations.