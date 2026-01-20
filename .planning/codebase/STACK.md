# Technology Stack

**Analysis Date:** 2025-01-21

## Languages

**Primary:**
- JavaScript (ES6+) - Core application logic, modules, and UI interactions
- HTML5 - Application structure and content markup
- CSS3 - Styling and responsive design

**Secondary:**
- TypeScript - Test specifications and configuration files
- JSON - Data persistence and configuration files

## Runtime

**Environment:**
- Browser-based client-side application (100% client-side)
- No server-side runtime or backend infrastructure
- Runs entirely in user's browser

**Package Manager:**
- npm (Node Package Manager) - Development dependency management
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- No framework dependencies (Vanilla JavaScript)
- Custom module system with ES6 imports
- Custom component architecture

**Testing:**
- Playwright v1.57.0 - E2E testing framework
- Vitest v4.0.17 - Unit testing framework
- Happy DOM v20.3.1 - DOM simulation for unit tests

**Build/Dev:**
- http-server v14.1.1 - Development server
- No build process or bundler (direct browser execution)

## Key Dependencies

**Critical:**
- Marked v12.0.2 - Markdown parsing for chat responses
- Transformers.js (via CDN) - Local AI model inference for embeddings
- No npm package for Transformers.js - loaded via CDN to reduce bundle size

**Infrastructure:**
- IndexedDB (native browser API) - Primary data storage
- Web Workers API - Background processing for embeddings and parsing
- Shared Workers API - Cross-tab coordination
- Web Crypto API - Security and encryption operations

## Configuration

**Environment:**
- Configuration via `js/config.js` (gitignored) and `js/config.example.js`
- Runtime configuration through Settings UI
- Environment-specific configs: COOP/COEP headers for SharedArrayBuffer support

**Build:**
- No build configuration (direct browser execution)
- COOP/COEP headers configured in `netlify.toml` and `vercel.json` for deployment
- Content Security Policy headers in HTML files

**Development:**
- Playwright config: `playwright.config.ts`
- Vitest config: `vitest.config.js`
- Development server scripts in `package.json`

## Platform Requirements

**Development:**
- Node.js (for npm scripts and testing)
- Modern browser with ES6+ support
- Local server for development (http-server)

**Production:**
- Modern browser with IndexedDB, Web Workers, and Web Crypto API support
- Static hosting (Netlify, Vercel, or any static file host)
- COOP/COEP headers required for SharedArrayBuffer functionality
- Optional: Local AI server (Ollama, LM Studio) for BYOI functionality

---

*Stack analysis: 2025-01-21*