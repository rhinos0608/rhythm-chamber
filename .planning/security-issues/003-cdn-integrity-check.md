# Security Issue: External CDN Resource Without Verified Integrity

**Issue ID:** SEC-003
**Severity:** MEDIUM
**Status:** DOCUMENTED
**Date Reported:** 2026-01-22

## Description

The application loads `marked.min.js` from a public CDN (jsdelivr.net) with an SRI integrity hash. However:
1. The integrity hash has not been verified
2. The CSP allows `https://cdn.jsdelivr.net` without requiring SRI
3. If the CDN is compromised, the application is vulnerable

## Affected File

`/Users/rhinesharar/rhythm-chamber/app.html:20-22`

```html
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"
    integrity="sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi"
    crossorigin="anonymous"></script>
```

## Risk Analysis

### Current Risk Level: MEDIUM

**Why not CRITICAL:**
- SRI hash is present (better than nothing)
- CDN is reputable (jsdelivr.net)
- The library is markdown parsing (not executing arbitrary code)

**Why MEDIUM:**
- Hash has not been verified against actual file
- CSP doesn't require SRI for this source
- Self-hosting would provide true air-gap security

## Verification Steps

To verify the SRI hash:

```bash
# Download the file
curl -O https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js

# Generate SHA-384 hash
openssl dgst -sha384 -binary marked.min.js | openssl base64 -A

# Compare with: sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi
```

Expected output should match the integrity attribute.

## Recommendations

### Option A: Verify SRI Hash (Quickest)

1. Run the verification command above
2. Update the `integrity` attribute if hash differs
3. Add CSP requirement for SRI

### Option B: Self-Host the Library (Most Secure)

1. Download `marked.min.js` to `js/vendor/`
2. Update CSP to remove external CDN dependency
3. Update script tag:
   ```html
   <script src="js/vendor/marked.min.js"></script>
   ```

### Option C: Use Built-in Markdown Parser (Recommended)

The application already has extensive code for handling HTML safely. Consider:
1. Implement a simple markdown parser
2. Or use a lighter-weight library
3. Or bundle the library directly (removing external dependency)

### Option D: CSP Strengthening

Update CSP to require SRI for external scripts:
```html
<meta http-equiv="Content-Security-Policy"
    content="...; script-src 'self' 'unsafe-inline' blob: https://cdn.jsdelivr.net 'require-trusted-types-for' 'script';">
```

Note: `require-trusted-types-for` is a newer directive.

## Implementation Status

- [ ] Verify current SRI hash matches actual file
- [ ] Consider self-hosting or bundling marked.js
- [ ] Update CSP to strengthen external script requirements

## Testing Strategy

1. **SRI Bypass Test**: Modify the file locally and verify browser blocks it
2. **CDN Failure Test**: Block cdn.jsdelivr.net and verify graceful degradation
3. **Hash Verification**: Run verification command after updates

## References

- CWE-494: Download of Code Without Integrity Check
- MDN: Subresource Integrity
- MDN: Content Security Policy - script-src
