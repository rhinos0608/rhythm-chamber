# External Integrations

**Analysis Date:** 2025-01-21

## APIs & External Services

**AI Providers:**
- Google AI Studio (Gemini) - Cloud-based LLM inference
  - API endpoint: `https://generativelanguage.googleapis.com/v1beta/openai`
  - Auth: API key (`Config.gemini.apiKey`)
  - Implementation: `js/providers/gemini.js`
  - Free tier available with models like gemini-2.5-flash

- OpenRouter - Multi-model LLM access
  - API endpoint: `https://openrouter.ai/api/v1/chat/completions`
  - Auth: API key (`Config.openrouter.apiKey`)
  - Implementation: `js/providers/openrouter.js`
  - Free tier models available

- Ollama - Local LLM inference
  - Default endpoint: `http://localhost:11434`
  - Auth: None (local only)
  - Implementation: `js/ollama.js`, `js/providers/ollama-adapter.js`
  - Models: Llama 3.2, Mistral, DeepSeek, Qwen, Gemma (user-provided)

- LM Studio - Local LLM with OpenAI-compatible API
  - Default endpoint: `http://localhost:1234/v1`
  - Auth: None (local only)
  - Implementation: `js/providers/lmstudio.js`

**Music Services:**
- Spotify Web API - Quick Snapshot feature
  - OAuth endpoints: `https://accounts.spotify.com/authorize`, `https://accounts.spotify.com/api/token`
  - Data endpoints: Recently played, top artists, top tracks, user profile
  - Auth: PKCE OAuth flow with client ID (`Config.spotify.clientId`)
  - Implementation: `js/spotify.js`
  - Scopes: `user-read-recently-played`, `user-top-read`

**External Libraries:**
- Transformers.js (via CDN) - In-browser ML model execution
  - CDN: `https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2`
  - Implementation: `js/local-embeddings.js`
  - Model: Xenova/all-MiniLM-L6-v2 (6MB INT8 quantized)

- Marked.js (via CDN) - Markdown parsing
  - CDN: `https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js`
  - Loaded in: `app.html`
  - Purpose: Render markdown responses in chat interface

## Data Storage

**Databases:**
- IndexedDB (native browser API)
  - Database name: `rhythm-chamber`
  - Version: 3
  - Stores: streams, chunks, embeddings, personality, settings, chat_sessions, config, tokens, migration
  - Implementation: `js/storage/indexeddb.js`
  - Connection: Automatic browser API
  - Used for: All user data, streaming history, embeddings, chat sessions

**File Storage:**
- Local filesystem (user uploads)
  - Supported formats: JSON, ZIP (Spotify exports)
  - Processing: In-browser parsing with JSZip
  - No external file storage

**Caching:**
- LRU Cache for embeddings
  - Implementation: `js/storage/lru-cache.js`
  - Max size: 1000 vectors (configurable)
  - Purpose: Improve semantic search performance

- Write-Ahead Log for transaction safety
  - Implementation: `js/storage/write-ahead-log.js`
  - Purpose: Prevent data corruption during failures

## Authentication & Identity

**Auth Provider:**
- Custom implementation (no external auth provider)
- Spotify PKCE OAuth for Quick Snapshot feature
  - Implementation: `js/spotify.js`
  - Token storage: IndexedDB
  - Token refresh: Automatic with expiry handling

**User Identity:**
- No user accounts or authentication system
- Anonymous usage (100% client-side)
- Future: Stripe integration for premium features (placeholder in `js/payments.js`)

## Monitoring & Observability

**Error Tracking:**
- None (console logging only)
- Custom error handling in `js/operation-lock-errors.js`
- Safe mode for error recovery: `js/security/safe-mode.js`

**Logs:**
- Console logging with structured prefixes
- Event bus for event tracking: `js/services/event-bus.js`
- Performance profiling: `js/services/performance-profiler.js`
- Wave telemetry for operation tracking: `js/services/wave-telemetry.js`

## CI/CD & Deployment

**Hosting:**
- Static site hosting (Netlify, Vercel configured)
- Netlify config: `.planning/codebase/netlify.toml`
- Vercel config: `vercel.json`

**CI Pipeline:**
- None configured (manual testing with npm scripts)
- Test commands: `npm run test`, `npm run test:unit`

## Environment Configuration

**Required env vars:**
- `Config.gemini.apiKey` - Google AI Studio API key (optional, for Gemini provider)
- `Config.openrouter.apiKey` - OpenRouter API key (optional, for OpenRouter provider)
- `Config.spotify.clientId` - Spotify Client ID (optional, for Quick Snapshot)

**Optional env vars:**
- `Config.stripe.publishableKey` - Stripe publishable key (future premium features)
- `Config.ollama.endpoint` - Custom Ollama endpoint (defaults to localhost:11434)
- `Config.lmstudio.endpoint` - Custom LM Studio endpoint (defaults to localhost:1234)

**Secrets location:**
- `js/config.js` (gitignored, user-provided)
- Example config: `js/config.example.js`
- No server-side secrets storage

## Webhooks & Callbacks

**Incoming:**
- None (static site with no backend)

**Outgoing:**
- None (no external service integrations requiring webhooks)
- OAuth callbacks handled via URL parameters (`?code=`, `?state=`)

## Browser APIs Used

**Storage APIs:**
- IndexedDB - Primary persistent storage
- localStorage - Session data and caching
- sessionStorage - Temporary state

**Worker APIs:**
- Web Workers - Background embedding generation and data parsing
- Shared Workers - Cross-tab coordination
- Service Workers - Not currently used

**Security APIs:**
- Web Crypto API - SHA-256 hashing for Spotify PKCE, encryption operations
- Content Security Policy - Configured in HTML meta tags

**Performance APIs:**
- Performance API - Timing and profiling
- requestIdleCallback - Background task scheduling
- Intersection Observer - UI visibility detection

**Other APIs:**
- File API - User file uploads
- Blob API - Binary data handling
- URL API - URL parsing and manipulation
- Fetch API - HTTP requests to external services

---

*Integration audit: 2025-01-21*