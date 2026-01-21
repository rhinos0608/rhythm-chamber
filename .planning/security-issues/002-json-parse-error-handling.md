# Security Issue: Unprotected JSON.parse() Calls

**Issue ID:** SEC-002
**Severity:** MEDIUM
**Status:** PARTIALLY ADDRESSED
**Date Reported:** 2026-01-22

## Description

Multiple instances of `JSON.parse()` are called without proper error handling. This can lead to:
- **Denial of Service (DoS)**: Application crashes from malformed JSON
- **Prototype Pollution**: Risk from crafted JSON (mitigated by existing protections)
- **Information Disclosure**: Error messages may leak implementation details

## Affected Files

### HIGH PRIORITY (Network/user-controlled input)

| File | Line | Context | Risk |
|------|------|---------|------|
| `js/ollama.js` | 249 | `const data = JSON.parse(line);` | Network response from local LLM |
| `js/ollama.js` | 422 | `const data = JSON.parse(buffer.trim());` | Network response from local LLM |
| `js/providers/openrouter.js` | 92 | `const errorJson = JSON.parse(errorText);` | Network error response |
| `js/providers/gemini.js` | 98 | `const errorJson = JSON.parse(errorText);` | Network error response |
| `js/providers/lmstudio.js` | 198 | `const parsed = JSON.parse(data);` | Network response |
| `js/providers/lmstudio.js` | 306 | `const parsed = JSON.parse(data);` | Network response |

### MEDIUM PRIORITY (localStorage/sessionStorage)

| File | Line | Context | Risk |
|------|------|---------|------|
| `js/services/session-manager.js` | 167 | `const history = JSON.parse(legacyData);` | Corrupted sessionStorage |
| `js/services/session-manager.js` | 423 | `const backup = JSON.parse(backupStr);` | Corrupted localStorage |
| `js/services/config-loader.js` | 351 | `const { config, timestamp } = JSON.parse(stored);` | Corrupted config |
| `js/settings.js` | 147 | `const parsed = JSON.parse(stored);` | Corrupted settings |
| `js/settings.js` | 249 | `const parsed = JSON.parse(stored);` | Corrupted settings |
| `js/settings.js` | 353 | `const parsed = JSON.parse(stored);` | Corrupted settings |
| `js/settings.js` | 1811 | `return JSON.parse(stored);` | Corrupted settings |
| `js/context-aware-recovery.js` | 130 | `const allMetadata = stored ? JSON.parse(stored) : {};` | Corrupted metadata |

### LOW PRIORITY (Already protected by try-catch)

| File | Line | Status |
|------|------|--------|
| `js/storage.js` | 668 | PROTECTED - Has try-catch |
| `js/services/tab-coordination.js` | 394, 1213 | PROTECTED - Has try-catch |

## Recommendation

### Option A: Centralized Utility (Preferred)

Created `js/utils/safe-json.js` with:
- `safeJsonParse(json, defaultValue, options)` - Main parsing function
- `safeGetLocalStorage(key, defaultValue)` - localStorage wrapper
- `safeGetSessionStorage(key, defaultValue)` - sessionStorage wrapper
- `safeJsonStringify(value)` - Safe stringification
- Built-in prototype pollution detection
- Optional validation via `validator` callback

**Migration Pattern:**
```javascript
// Before
const data = JSON.parse(stored);

// After
import { safeJsonParse } from './utils/safe-json.js';
const data = safeJsonParse(stored, null);
```

### Option B: Individual Try-Catch Blocks

Add try-catch around each unprotected JSON.parse:
```javascript
let config;
try {
    config = stored ? JSON.parse(stored) : {};
} catch (e) {
    console.error('[Module] JSON parse failed:', e);
    config = {};
}
```

## Implementation Status

- [x] Created `js/utils/safe-json.js` utility
- [x] Updated `js/rag.js` to use safeJsonParse
- [ ] Update provider files (openrouter.js, gemini.js, lmstudio.js)
- [ ] Update ollama.js for network responses
- [ ] Update settings.js for localStorage access
- [ ] Update session-manager.js for session parsing

## Testing Strategy

1. **Unit Tests**: Test safeJsonParse with:
   - Valid JSON
   - Malformed JSON
   - Empty strings
   - Non-string input
   - Prototype pollution attempts

2. **Integration Tests**:
   - Corrupt localStorage and verify graceful degradation
   - Send malformed network responses to providers

3. **Manual Testing**:
   - Use DevTools to corrupt localStorage values
   - Verify application still loads

## References

- CWE-502: Deserialization of Untrusted Data
- OWASP Top 10 2021: A08: Software and Data Integrity Failures
