# Agent 3: Input Validation & Sanitization Audit Report

**Agent:** INPUT VALIDATION & SANITIZATION AGENT (3 of 20)
**Date:** 2026-01-22
**Working Directory:** /Users/rhinesharar/rhythm-chamber
**Scope:** User input handling, API key validation, settings/config validation, file uploads, URL parameters, LLM response parsing

---

## Executive Summary

**Overall Security Posture:** MODERATE with specific areas requiring attention

This audit identified **8 findings** across 6 categories:
- **2 High Priority** issues requiring immediate attention
- **3 Medium Priority** issues for near-term resolution
- **3 Low Priority** improvements for security hardening

### Key Strengths Found
1. Comprehensive HTML escaping utility (`js/utils/html-escape.js`)
2. Well-structured function parameter validation (`js/functions/utils/validation.js`)
3. Proper try/catch error handling for JSON parsing
4. Message sanitization for cross-tab communication
5. Good use of template literal escaping in most places

### Key Gaps Found
1. No API key format validation
2. File upload only validates extension (no magic bytes)
3. URL parameter handling could be more robust
4. Settings input lacks comprehensive validation

---

## Detailed Findings

### 1. API Key Format Validation (MEDIUM)

**Location:** `js/settings.js`, `js/config.js`, `js/services/config-loader.js`

**Issue:** API keys are read and stored without format validation. Currently only checks for empty string or placeholder values.

**Evidence:**
```javascript
// js/settings.js:325-328
if (parsed.openrouter?.apiKey &&
    (!settings.openrouter.apiKey || settings.openrouter.apiKey === 'your-api-key-here')) {
    settings.openrouter.apiKey = parsed.openrouter.apiKey;
}
```

**Risk:**
- Malformed keys cause API failures without clear error messages
- No early validation before API calls
- Potential for injection if keys are used in insecure contexts

**Recommendation:**
Add format validation function:

```javascript
function validateApiKey(provider, key) {
    if (!key || key === 'your-api-key-here' || key === 'your-spotify-client-id') {
        return { valid: false, error: 'Please enter a valid API key' };
    }

    const validators = {
        openrouter: (k) => k.startsWith('sk-or-v1-') && k.length >= 40,
        gemini: (k) => k.startsWith('AIza') && k.length >= 35,
        spotify: (k) => k.length >= 32 && /^[a-zA-Z0-9]+$/.test(k)
    };

    const validator = validators[provider];
    if (validator && !validator(key)) {
        return { valid: false, error: `Invalid ${provider} API key format` };
    }

    return { valid: true };
}
```

**Priority:** MEDIUM

---

### 2. Settings Input Validation (HIGH)

**Location:** `js/settings.js:1112-1199` (saveFromModal function)

**Issue:** The `saveFromModal()` function uses `.trim()` but lacks comprehensive validation for:
- API key lengths
- URL formats for endpoints
- Numeric range validation for `maxTokens`, `temperature`, `contextWindow`
- Model ID format validation

**Evidence:**
```javascript
// js/settings.js:1135-1136
const geminiApiKey = geminiApiKeyInput?.value?.trim();
const spotifyClientId = spotifyInput?.value?.trim();
```

**Existing Validation (Positive):**
```javascript
// js/settings.js:1152-1157 - Good range clamping
maxTokens: Math.min(Math.max(maxTokens, 100), 8000),
temperature: Math.min(Math.max(temperature, 0), 2),
contextWindow: Math.min(Math.max(contextWindow, 1024), 128000),
```

**Risk:**
- Invalid URLs could cause fetch failures
- Extremely long strings could impact storage
- Invalid model IDs cause silent failures

**Recommendation:**
Add comprehensive input validation:

```javascript
function validateSettingsInput(settings) {
    const errors = [];

    // Validate API keys
    if (settings.openrouter?.apiKey) {
        const keyCheck = validateApiKey('openrouter', settings.openrouter.apiKey);
        if (!keyCheck.valid) errors.push({ field: 'openrouter.apiKey', error: keyCheck.error });
    }

    // Validate URLs
    if (settings.llm?.ollamaEndpoint) {
        try {
            new URL(settings.llm.ollamaEndpoint);
            if (!settings.llm.ollamaEndpoint.startsWith('http')) {
                errors.push({ field: 'ollamaEndpoint', error: 'Must use http:// or https://' });
            }
        } catch {
            errors.push({ field: 'ollamaEndpoint', error: 'Invalid URL format' });
        }
    }

    // Validate numeric ranges
    if (settings.openrouter?.maxTokens < 100 || settings.openrouter?.maxTokens > 128000) {
        errors.push({ field: 'maxTokens', error: 'Must be between 100 and 128000' });
    }

    return { valid: errors.length === 0, errors };
}
```

**Priority:** HIGH

---

### 3. File Upload Validation (HIGH)

**Location:** `js/controllers/file-upload-controller.js:57-67`

**Issue:** File upload validation only checks file extension with `.endsWith()`. No validation for:
- MIME type
- File size limits
- Magic bytes (file signature)

**Evidence:**
```javascript
// js/controllers/file-upload-controller.js:63-67
if (!file.name.endsWith('.zip') && !file.name.endsWith('.json')) {
    _showToast('Please upload a .zip or .json file');
    return;
}
```

**Risk:**
- Attacker can rename malicious files to .zip/.json
- No protection against extremely large files (DoS)
- Invalid files could cause processing errors

**Recommendation:**
Add multi-layered file validation:

```javascript
async function validateFileUpload(file) {
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
        return { valid: false, error: `File too large (max ${MAX_FILE_SIZE/1024/1024}MB)` };
    }

    // Check extension
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.zip') && !ext.endsWith('.json')) {
        return { valid: false, error: 'Only .zip and .json files are supported' };
    }

    // For JSON files, validate with magic bytes check
    if (ext.endsWith('.json')) {
        const buffer = await file.slice(0, 32).arrayBuffer();
        const header = new TextDecoder().decode(buffer).trim();
        if (!header.startsWith('{') && !header.startsWith('[')) {
            return { valid: false, error: 'Invalid JSON file format' };
        }
    }

    // For ZIP files, check magic bytes (PK signature)
    if (ext.endsWith('.zip')) {
        const buffer = await file.slice(0, 4).arrayBuffer();
        const view = new Uint8Array(buffer);
        if (view[0] !== 0x50 || view[1] !== 0x4B) {
            return { valid: false, error: 'Invalid ZIP file format' };
        }
    }

    return { valid: true };
}
```

**Priority:** HIGH

---

### 4. URL Parameter Handling (MEDIUM)

**Location:** `js/app.js:567-604`, `js/demo-data.js:437`

**Issue:** URL parameters are read and used without validation:
- `?code=` parameter for OAuth callback
- `?mode=` parameter for demo/spotify modes
- `?error=` parameter for auth errors

**Evidence:**
```javascript
// js/app.js:570-571
if (urlParams.has('code')) {
    await SpotifyController.handleSpotifyCallback(urlParams.get('code'));
```

**Risk:**
- No validation of OAuth code format
- Mode parameter could contain unexpected values
- Error parameter directly logged without sanitization

**Recommendation:**
Add URL parameter validation:

```javascript
function validateUrlParam(param, value, type = 'string') {
    const validators = {
        code: (v) => /^[A-Za-z0-9_-]+$/.test(v) && v.length > 10,
        mode: (v) => ['demo', 'spotify'].includes(v),
        error: (v) => v.length < 100 // Prevent overly long error strings
    };

    if (validators[param]) {
        return validators[param](value);
    }
    return true;
}

// Usage:
const code = urlParams.get('code');
if (code && validateUrlParam('code', code)) {
    await SpotifyController.handleSpotifyCallback(code);
}
```

**Priority:** MEDIUM

---

### 5. LLM Response Parsing (LOW - Well Handled)

**Location:** `js/services/tool-call-handling-service.js:166-185`

**Assessment:** JSON parsing is properly handled with try/catch:

```javascript
try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
} catch (parseError) {
    console.warn(`[ToolCallHandlingService] Invalid tool call arguments...`);
    return {
        earlyReturn: {
            status: 'error',
            content: buildToolCodeOnlyError(functionName, rawArgs),
            // ...
        }
    };
}
```

**Additional Recommendation:**
After successful parsing, validate argument types and ranges before use:

```javascript
function validateToolArguments(functionName, args) {
    const schemas = {
        'get_listening_history': {
            year: { type: 'number', min: 2000, max: 2100 },
            month: { type: 'number', min: 1, max: 12 },
            limit: { type: 'number', min: 1, max: 100 }
        },
        // Add schemas for other functions
    };

    const schema = schemas[functionName];
    if (!schema) return { valid: true }; // No schema defined, allow

    for (const [key, value] of Object.entries(args)) {
        const rules = schema[key];
        if (!rules) continue;

        if (rules.type === 'number' && typeof value !== 'number') {
            return { valid: false, error: `${key} must be a number` };
        }
        if (rules.min && value < rules.min) {
            return { valid: false, error: `${key} must be >= ${rules.min}` };
        }
        if (rules.max && value > rules.max) {
            return { valid: false, error: `${key} must be <= ${rules.max}` };
        }
    }

    return { valid: true };
}
```

**Priority:** LOW (enhancement)

---

### 6. HTML Escaping Usage (LOW - Generally Good)

**Location:** Various files

**Assessment:** The codebase has a well-implemented HTML escape utility:

```javascript
// js/utils/html-escape.js
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
```

**Positive Finding:** `escapeHtml()` is consistently used in user-facing contexts.

**Minor Issue Found:** One innerHTML usage with concatenation:
```javascript
// js/controllers/chat-ui-controller.js:531
contentEl.innerHTML += escaped; // escaped is already escaped, OK but += pattern is risky
```

**Recommendation:** Use `textContent` or createElement instead of innerHTML when possible:

```javascript
// Better approach:
const span = document.createElement('span');
span.textContent = state.token;
contentEl.appendChild(span);
```

**Priority:** LOW

---

### 7. Message Sanitization (LOW - Well Implemented)

**Location:** `js/security/message-security.js`

**Assessment:** Excellent message sanitization for cross-tab communication:

```javascript
sanitizeMessage(message) {
    const sensitiveFields = ['apiKey', 'token', 'secret', 'password', 'credentials'];
    // Recursively removes sensitive fields
    // ...
}
```

**No issues found.** This is a security best practice.

---

### 8. Configuration Validation (MEDIUM)

**Location:** `js/services/config-loader.js:284-309`

**Assessment:** Config validation exists but is lightweight:

```javascript
function validateConfig(config) {
    const warnings = [];
    const requiredSections = ['openrouter', 'spotify', 'app'];
    // ... checks for missing sections
}
```

**Risk:** Doesn't validate config values, only structure.

**Recommendation:** Enhance validation to check value formats:

```javascript
function validateConfig(config) {
    const warnings = [];

    // Existing checks...
    const requiredSections = ['openrouter', 'spotify', 'app'];

    // Add value validation
    if (config.openrouter?.apiKey && !config.openrouter.apiKey.startsWith('sk-or-v1-')) {
        warnings.push('openrouter.apiKey format may be invalid (should start with sk-or-v1-)');
    }

    if (config.spotify?.redirectUri) {
        try {
            new URL(config.spotify.redirectUri);
        } catch {
            warnings.push('spotify.redirectUri is not a valid URL');
        }
    }

    return { valid: warnings.length === 0, warnings };
}
```

**Priority:** MEDIUM

---

## Security Patterns Observed

### Positive Patterns
1. **Centralized escaping utility** - `js/utils/html-escape.js`
2. **Safe DOM API usage** - Most places use `textContent` over `innerHTML`
3. **Message sanitization** - Cross-tab messages are sanitized
4. **Error boundaries** - Try/catch blocks around JSON parsing
5. **Template literal escaping** - `safeHtml`` tag function available

### Patterns to Add
1. **Whitelist validation** - For all user input
2. **Length limits** - For strings stored in IndexedDB
3. **Type coercion safety** - Explicit type checking before operations
4. **Content Security Policy** - Consider adding CSP headers

---

## Files Audited

| File | Lines | Issues |
|------|-------|--------|
| `js/utils/html-escape.js` | 190 | 0 |
| `js/functions/utils/validation.js` | 269 | 0 |
| `js/settings.js` | 2066 | 2 (API key format, input validation) |
| `js/controllers/file-upload-controller.js` | 412 | 2 (file validation, size limits) |
| `js/services/tool-call-handling-service.js` | 669 | 0 (well handled) |
| `js/security/message-security.js` | 475 | 0 |
| `js/services/config-loader.js` | 497 | 1 (config value validation) |
| `js/app.js` | 700+ | 1 (URL param validation) |

---

## Recommended Actions

### Immediate (High Priority)
1. Add file size limits to file upload
2. Add magic bytes validation for .zip and .json files
3. Add comprehensive input validation to `saveFromModal()`

### Near Term (Medium Priority)
1. Add API key format validation
2. Add URL parameter validation
3. Enhance config value validation

### Long Term (Low Priority)
1. Replace innerHTML patterns with createElement
2. Add argument type validation after JSON parsing
3. Consider adding Content Security Policy

---

## Validation Utilities Reference

The following validation utilities should be created in `js/utils/input-validation.js`:

```javascript
/**
 * Input Validation Utilities
 * Centralized validation for all user inputs
 */

export const Validators = {
    /**
     * Validate API key format by provider
     */
    apiKey(provider, key) {
        const patterns = {
            openrouter: /^sk-or-v1-[a-zA-Z0-9]{32,}$/,
            gemini: /^AIza[a-zA-Z0-9_-]{33,}$/,
            spotify: /^[a-zA-Z0-9]{32,}$/
        };
        const pattern = patterns[provider];
        if (!pattern || !key) return { valid: false };
        return { valid: pattern.test(key) };
    },

    /**
     * Validate URL format and scheme
     */
    url(urlString, allowedSchemes = ['http', 'https']) {
        try {
            const url = new URL(urlString);
            return { valid: allowedSchemes.includes(url.protocol.replace(':', '')) };
        } catch {
            return { valid: false };
        }
    },

    /**
     * Validate numeric range
     */
    number(value, min, max) {
        const num = Number(value);
        return {
            valid: !isNaN(num) && num >= min && num <= max,
            normalized: num
        };
    },

    /**
     * Validate string length
     */
    stringLength(value, min, max) {
        const str = String(value);
        return {
            valid: str.length >= min && str.length <= max,
            sanitized: str.trim().slice(0, max)
        };
    },

    /**
     * Validate URL parameter (whitelist approach)
     */
    urlParam(param, value, allowedValues) {
        if (allowedValues && !allowedValues.includes(value)) {
            return { valid: false, error: `Invalid ${param} value` };
        }
        // Sanitize to prevent XSS if ever rendered
        return {
            valid: true,
            sanitized: String(value).replace(/[<>"]/g, '')
        };
    }
};
```

---

**End of Report**
