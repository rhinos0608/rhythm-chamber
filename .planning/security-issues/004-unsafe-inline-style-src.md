# Security Issue: unsafe-inline in style-src CSP Directive

**Issue ID:** SEC-004
**Severity:** LOW
**Status:** DOCUMENTED
**Date Reported:** 2026-01-22

## Description

The CSP includes `'unsafe-inline'` for the `style-src` directive, which:
- Increases attack surface for CSS-based attacks
- Conflicts with future CSP tightening efforts
- Is often unnecessary when using proper CSS class management

## Affected Files

- `/Users/rhinesharar/rhythm-chamber/app.html:11`
- `/Users/rhinesharar/rhythm-chamber/index.html:11`

## Current CSP

```html
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
```

## Risk Analysis

### Why LOW Severity

**Reduced Impact:**
- The application already has strong XSS protections via `escapeHtml()`
- CSS injection is less critical than script injection
- No sensitive operations are performed via CSS

**Why Not Ignore:**
- Defense-in-depth principle
- Future-proofing for stricter CSP
- Best practice compliance

## CSS-Based Attack Vectors

While less severe than script XSS, CSS injection can enable:
1. **Data Exfiltration**: `url()` with data to external servers
2. **UI Redressing**: Hiding important UI elements
3. **Clickjacking**: Overlapping elements to hijack clicks
4. **Behavioral Changes**: Hiding error messages, changing layouts

## Audit Required

Before removing `'unsafe-inline'`, audit all inline style usage:

### Method 1: Grep for inline styles
```bash
grep -r "\.style\." /path/to/js --include="*.js"
grep -r "style=\"" /path/to --include="*.html"
```

### Method 2: Browser DevTools
1. Open DevTools Elements tab
2. Search for `style=` attributes in HTML
3. Check for dynamic style modifications in JS

### Known Inline Style Usage

From code analysis:
- `tab-coordination.js:1774-1788` - Dynamic banner CSS via `style.cssText`
- `error-boundary.js:166-209` - Dynamic error UI CSS
- `app.js` - Modal display toggles via `style.display`
- `main.js` - Security banner CSS

## Recommendations

### Option A: Nonce-Based CSP (Most Secure)

```javascript
// Generate nonce on server or at page load
const nonce = crypto.randomUUID();
```

```html
<meta http-equiv="Content-Security-Policy"
    content="style-src 'self' https://fonts.googleapis.com 'nonce-${nonce}';">
```

Then apply nonce to style elements:
```javascript
styleElement.nonce = nonce;
```

### Option B: Hash-Based CSP

Use SHA-256 hashes for specific inline styles:
```html
<meta http-equiv="Content-Security-Policy"
    content="style-src 'self' https://fonts.googleapis.com 'sha256-ABC123...';">
```

Generate hashes:
```bash
echo "background: red;" | openssl dgst -sha256 -binary | openssl base64 -A
```

### Option C: CSS Classes Refactoring (Recommended)

1. Move all inline styles to CSS classes
2. Use `classList.toggle()` for dynamic states
3. Add utility classes to `css/styles.css`

Example refactoring:
```javascript
// Before
banner.style.cssText = `position: fixed; top: 0; ...`;

// After
banner.classList.add('safe-mode-banner');
```

With CSS:
```css
.safe-mode-banner {
    position: fixed;
    top: 0;
    /* ... */
}
```

### Option D: Accept Current State

If refactoring is too costly, document the trade-off:
- XSS protections are strong elsewhere
- CSS-based attacks have limited impact
- Focus on higher-priority security issues

## Implementation Status

- [ ] Audit all inline style usage
- [ ] Determine refactoring effort
- [ ] Choose mitigation strategy (A, B, C, or D)
- [ ] Implement chosen strategy
- [ ] Test application after CSP change

## Testing Strategy

1. **CSP Violation Detection**: Use DevTools to find all violations after removing unsafe-inline
2. **Functional Testing**: Verify all UI elements render correctly
3. **Dynamic Style Testing**: Test all dynamic show/hide functionality

## References

- CSP Level 3: style-src-nonce
- CSP Level 3: style-src-hash
- MDN: CSP unsafe-inline considerations
