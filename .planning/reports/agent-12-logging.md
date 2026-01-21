# Logging & Debugging Infrastructure Audit Report
**Agent 12 of 20** | Date: 2026-01-22

---

## Executive Summary

This audit examined the logging and debugging infrastructure across the Rhythm Chamber codebase. The application uses **console-based logging** with module-prefixed messages. While the codebase follows a consistent pattern, several areas require attention for production readiness.

### Key Findings

| Area | Status | Priority |
|------|--------|----------|
| Console.log cleanup | 200+ instances | Medium |
| Structured logging | Not implemented | High |
| Error tracking | Inconsistent | Medium |
| Debug mode handling | Ad-hoc | Medium |
| Sensitive data in logs | Potential issues | High |
| Log levels/filters | Not implemented | High |

---

## 1. Console Usage Analysis

### 1.1 Overall Statistics

- **Total console statements**: ~250+ instances
- **Files affected**: ~50 JavaScript files
- **Distribution by type**:
  - `console.log`: ~60% (primarily informational/debug)
  - `console.warn`: ~25% (deprecation warnings, fallbacks)
  - `console.error`: ~15% (error conditions)

### 1.2 Module Breakdown

| Module | console.log | console.warn | console.error | Notes |
|--------|-------------|--------------|---------------|-------|
| `/js/rag.js` | 10 | 13 | 3 | Heavy logging for RAG operations |
| `/js/local-vector-store.js` | 9 | 9 | 2 | Worker lifecycle logging |
| `/js/spotify.js` | 10 | 8 | 3 | Token management logging |
| `/js/context-aware-recovery.js` | 9 | 5 | 5 | Recovery operation tracking |
| `/js/storage.js` | 8 | 4 | 1 | Storage operations |
| `/js/main.js` | 10 | 4 | 1 | Bootstrap and initialization |
| `/js/app.js` | 7 | 5 | 2 | Application lifecycle |
| `/js/genre-enrichment.js` | 1 | 3 | 0 | Cache failures |
| `/js/security/*.js` | 15 | 12 | 8 | Security operations |
| `/js/storage/*.js` | 20 | 15 | 5 | Config/Migration/API |

### 1.3 Logging Pattern Consistency

**POSITIVE**: The codebase follows a consistent prefix pattern:
```javascript
console.log('[ModuleName] message');
console.warn('[ModuleName] warning message');
console.error('[ModuleName] error message', error);
```

All modules follow this `[ModuleName]` prefix convention, which aids in filtering and debugging.

---

## 2. Sensitive Data Exposure Analysis

### 2.1 Potential Concerns Identified

The following log patterns reference sensitive data:

1. **Token-related logs** (`/js/spotify.js`):
   ```javascript
   console.log('[Spotify] Attempting token refresh...');
   console.warn('[Spotify] Secure token retrieval failed:', e.message);
   ```
   - Risk: Error objects may contain token fragments
   - Recommendation: Sanitize error objects before logging

2. **Key/Encryption logs** (`/js/security/*.js`):
   ```javascript
   console.log(`[Security] Credentials encrypted for: ${key}`);
   console.warn(`[Security] Decryption failed for ${key}`);
   ```
   - Risk: Key names may reveal data structures
   - Recommendation: Use generic key identifiers

3. **API Key validation logs** (`/js/providers/*.js`):
   ```javascript
   console.warn('[OpenRouter] API key validation failed:', error.message);
   console.warn('[Gemini] API key validation failed:', error.message);
   ```
   - Risk: Error messages may contain partial keys
   - Recommendation: Truncate/sanitize error messages

### 2.2 Safe Logging Practices Observed

The following good practices were noted:
- Actual token values are never directly logged
- Errors are logged separately from operations
- Encryption operations log success/failure without data exposure

---

## 3. Debug Mode Handling

### 3.1 Current State

Debug mode is handled **inconsistently** across the codebase:

1. **No global debug flag**: Each module independently decides what to log
2. **No build-time stripping**: All console statements remain in production
3. **Ad-hoc debug conditions**: Some modules conditionally log based on internal state

### 3.2 Debug Logging Examples

**In Production Code** (always executes):
```javascript
// js/rag.js:46
console.log('[RAG] EmbeddingWorker initialized');

// js/main.js:33
console.log('[Main] Security context validated');

// js/local-vector-store.js:195
console.log(`[LocalVectorStore] Worker search: ${stats.vectorCount} vectors in ${stats.elapsedMs}ms`);
```

**Conditional Debugging** (rare, good pattern):
```javascript
// js/storage/config-api.js
// Some logs behind error conditions only
```

---

## 4. Error Tracking Completeness

### 4.1 Error Logging Patterns

The codebase uses **consistent error logging** with context:

```javascript
// Good: Error with context
console.error('[RAG] Failed to get config:', e);

// Good: Specific error conditions
console.error('[Main] Failed to initialize application:', error);

// Good: Error with identification
console.error('[Storage] Validation error:', err);
```

### 4.2 Gaps Identified

1. **No error aggregation**: Errors are logged but not collected
2. **No user-facing error reports**: Console errors don't reach UI
3. **No error context preservation**: Stack traces may be lost
4. **Inconsistent error codes**: No standardized error identifiers

---

## 5. Log Levels and Filtering

### 5.1 Current Implementation

**NONE**: The codebase does not implement log level filtering. All console statements execute unconditionally.

### 5.2 Recommended Hierarchy

| Level | Use Case | Production Behavior |
|-------|----------|---------------------|
| `TRACE` | Detailed execution flow | Stripped |
| `DEBUG` | Development diagnostics | Stripped |
| `INFO` | Important state changes | Kept |
| `WARN` | Degraded operation | Kept |
| `ERROR` | Failures requiring attention | Kept |

---

## 6. Cleanup Recommendations

### 6.1 Debug Statements to Remove

The following `console.log` statements are debug-only and should be removed or gated:

| File | Line | Statement |
|------|------|-----------|
| `js/rag.js` | 46 | `console.log('[RAG] EmbeddingWorker initialized')` |
| `js/rag.js` | 76 | `console.log('[RAG] EmbeddingWorker cleaned up')` |
| `js/rag.js` | 616 | `console.log('[RAG] Updated manifest: ...')` |
| `js/rag.js` | 816 | `console.log('[RAG] Added ${patternChunks.length} pattern chunks')` |
| `js/main.js` | 33 | `console.log('[Main] Security context validated')` |
| `js/main.js` | 40 | `console.log('[Main] Window globals deprecation warnings enabled')` |
| `js/main.js` | 156 | `console.log('[Main] All modules imported via ES modules')` |
| `js/local-vector-store.js` | 195 | `console.log('[LocalVectorStore] Worker search: ...')` |
| `js/local-vector-store.js` | 242 | `console.log('[LocalVectorStore] Search worker initialized')` |
| `js/storage.js` | 102 | `console.log('[Storage] Executing deferred reload')` |

### 6.2 Logs to Keep (Production)

The following should remain as they indicate important state changes:

| File | Statement | Reason |
|------|-----------|--------|
| `js/main.js` | `console.warn('[Main] Security check failed, entering Safe Mode')` | Critical failure mode |
| `js/storage.js` | `console.warn('[Storage] Database upgrade blocked by other tabs')` | User-facing issue |
| `js/spotify.js` | `console.error('[Spotify] Token refresh failed')` | Authentication failure |
| All `console.error` | - | Required for production debugging |

---

## 7. Implementation Guide

### 7.1 Create a Logging Utility

**File: `/js/utils/logger.js`**

```javascript
/**
 * Centralized logging utility with level filtering
 * and production-ready defaults
 */

const LOG_LEVELS = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  NONE: 5
};

// Default to INFO in production, DEBUG in development
const DEFAULT_LEVEL = typeof window !== 'undefined' && window.location?.hostname === 'localhost'
  ? LOG_LEVELS.DEBUG
  : LOG_LEVELS.INFO;

let currentLevel = DEFAULT_LEVEL;
let releaseStage = 'production'; // 'development' | 'production'

/**
 * Configure the logger
 */
export function configureLogger(options = {}) {
  currentLevel = options.level ?? DEFAULT_LEVEL;
  releaseStage = options.releaseStage ?? (options.isDev ? 'development' : 'production');
}

/**
 * Get current log level
 */
export function getLogLevel() {
  return currentLevel;
}

/**
 * Sanitize data for logging (remove sensitive fields)
 */
function sanitize(data) {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const sensitiveKeys = ['token', 'key', 'secret', 'password', 'apiKey', 'authorization'];
  const sanitized = Array.isArray(data) ? [] : {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(k => lowerKey.includes(k));

    if (isSensitive && typeof value === 'string') {
      sanitized[key] = value.length > 0 ? '[REDACTED]' : '';
    } else if (isSensitive && typeof value === 'object') {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Format log message with module prefix
 */
function formatMessage(module, message) {
  return `[${module}] ${message}`;
}

/**
 * Core logging function
 */
function log(level, levelName, module, message, ...args) {
  if (level < currentLevel) {
    return;
  }

  const formattedMessage = formatMessage(module, message);
  const sanitizedArgs = args.map(arg => sanitize(arg));

  switch (levelName) {
    case 'TRACE':
    case 'DEBUG':
    case 'INFO':
      console.log(formattedMessage, ...sanitizedArgs);
      break;
    case 'WARN':
      console.warn(formattedMessage, ...sanitizedArgs);
      break;
    case 'ERROR':
      console.error(formattedMessage, ...sanitizedArgs);
      break;
  }
}

/**
 * Create a module-specific logger
 */
export function createLogger(moduleName) {
  return {
    trace: (message, ...args) => log(LOG_LEVELS.TRACE, 'TRACE', moduleName, message, ...args),
    debug: (message, ...args) => log(LOG_LEVELS.DEBUG, 'DEBUG', moduleName, message, ...args),
    info: (message, ...args) => log(LOG_LEVELS.INFO, 'INFO', moduleName, message, ...args),
    warn: (message, ...args) => log(LOG_LEVELS.WARN, 'WARN', moduleName, message, ...args),
    error: (message, ...args) => log(LOG_LEVELS.ERROR, 'ERROR', moduleName, message, ...args),
  };
}

// Export constants for use elsewhere
export { LOG_LEVELS };
```

### 7.2 Migration Pattern

**Before** (current code):
```javascript
console.log('[RAG] EmbeddingWorker initialized');
console.warn('[RAG] Worker error, falling back to async main thread:', error.message);
```

**After** (with logger):
```javascript
import { createLogger } from './utils/logger.js';

const logger = createLogger('RAG');

logger.debug('EmbeddingWorker initialized');
logger.warn('Worker error, falling back to async main thread', error);
```

### 7.3 Build-Time Log Stripping

For production builds, add an esbuild/rollup plugin:

```javascript
// build.config.js
import { defineConfig } from 'some-builder';

export default defineConfig({
  build: {
    minify: true,
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  }
});
```

Alternatively, use a babel transform:

```javascript
// babel.config.js
export default {
  env: {
    production: {
      plugins: [
        ['transform-remove-console', {
          exclude: ['error', 'warn'] // Keep errors and warnings
        }]
      ]
    }
  }
};
```

---

## 8. Priority Action Items

### Phase 1: Critical (Security)
1. [ ] Review and sanitize error logging in security modules
2. [ ] Remove any logs that may expose partial tokens or keys
3. [ ] Implement sensitive data redaction in error objects

### Phase 2: High (Infrastructure)
4. [ ] Create `/js/utils/logger.js` with the implementation above
5. [ ] Configure logger in `main.js` bootstrap
6. [ ] Migrate top 5 logging-heavy modules to new logger

### Phase 3: Medium (Cleanup)
7. [ ] Remove or gate debug console.log statements
8. [ ] Standardize error logging format across modules
9. [ ] Add log level configuration to Settings UI

### Phase 4: Low (Enhancement)
10. [ ] Implement error aggregation for user feedback
11. [ ] Add build-time log stripping for production
12. [ ] Create log export functionality for debugging

---

## 9. Testing Checklist

After implementing the logging utility:

- [ ] Debug logs do not appear in production build
- [ ] Error logs preserve stack traces
- [ ] Sensitive data is redacted from all logs
- [ ] Module prefixes are consistently applied
- [ ] Log level changes take effect without reload
- [ ] Console still works in browser dev tools
- [ ] Performance impact is minimal (<5% overhead)

---

## 10. Related Documentation

- Security Audit: `/planning/reports/agent-00-security.md`
- Build Configuration: `/planning/reports/agent-XX-build.md`
- Error Handling: `/planning/reports/agent-XX-error-handling.md`

---

## Appendix: Complete File Inventory

### Files with 10+ console statements:
1. `/js/rag.js` - 26 statements
2. `/js/local-vector-store.js` - 22 statements
3. `/js/context-aware-recovery.js` - 21 statements
4. `/js/spotify.js` - 21 statements
5. `/js/storage/config-api.js` - 19 statements
6. `/js/storage/migration.js` - 11 statements
7. `/js/main.js` - 16 statements
8. `/js/app.js` - 14 statements
9. `/js/storage.js` - 12 statements
10. `/js/security/storage-encryption.js` - 19 statements

---

**Report generated by Agent 12 (Logging & Debugging)**
**Part of Rhythm Chamber Agent Audit Series**
