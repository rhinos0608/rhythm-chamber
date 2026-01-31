#!/usr/bin/env node
/**
 * URL Protocol Whitelist Security Fix Demonstration
 *
 * This script demonstrates the security fix for CRITICAL ISSUE #2:
 * URL protocol whitelist validation in js/utils/validation/format-validators.js
 *
 * Run: node scripts/demo-url-security-fix.js
 */

import { validateURL } from '../js/utils/validation/format-validators.js';

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║   URL Protocol Whitelist Security Fix Demonstration         ║');
console.log('║   CRITICAL ISSUE #2 - FIXED ✅                              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log();

// Test dangerous protocols
console.log('🔴 DANGEROUS PROTOCOLS (Should ALL be rejected):');
console.log('─────────────────────────────────────────────────────────────');

const dangerousURLs = [
    { url: 'javascript:alert(1)', description: 'Basic JavaScript execution' },
    { url: 'javascript:document.cookie', description: 'Cookie theft' },
    { url: 'javascript:window.location="https://evil.com"', description: 'Phishing redirect' },
    { url: 'data:text/html,<script>alert(1)</script>', description: 'Data URI with HTML' },
    { url: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', description: 'Data URI with base64' },
    { url: 'vbscript:msgbox("XSS")', description: 'VBScript execution (IE)' },
    { url: 'file:///etc/passwd', description: 'Local file access' },
    { url: 'file://localhost/etc/passwd', description: 'Local file via localhost' },
    { url: 'about:blank', description: 'About protocol' },
    { url: 'chrome://settings', description: 'Chrome internal' },
    { url: 'chrome-extension://abcdefg/popup.html', description: 'Chrome extension' },
    { url: 'JAVASCRIPT:alert(1)', description: 'Case variation (uppercase)' },
    { url: 'JaVaScRiPt:alert(1)', description: 'Case variation (mixed case)' },
];

let allBlocked = true;
dangerousURLs.forEach(({ url, description }) => {
    const result = validateURL(url);
    const blocked = !result.valid && result.error.includes('Dangerous protocol');
    const status = blocked ? '✓ BLOCKED' : '✗ VULNERABLE';

    console.log(`  ${status} | ${description}`);
    console.log(`          URL: ${url}`);
    if (result.error) {
        console.log(`          Error: ${result.error}`);
    }
    console.log();

    if (!blocked) allBlocked = false;
});

console.log();
console.log('🟢 SAFE PROTOCOLS (Should ALL be accepted):');
console.log('─────────────────────────────────────────────────────────────');

const safeURLs = [
    { url: 'https://example.com', description: 'Standard HTTPS' },
    { url: 'http://example.com', description: 'Standard HTTP' },
    { url: 'https://example.com/path/to/page', description: 'With path' },
    { url: 'https://example.com?query=value&foo=bar', description: 'With query params' },
    { url: 'https://example.com#section', description: 'With fragment' },
    { url: 'https://example.com:8080', description: 'With port' },
    { url: 'https://user:pass@example.com', description: 'With credentials' },
    { url: 'http://localhost:8080', description: 'Localhost' },
    { url: 'http://127.0.0.1:3000', description: 'Loopback IP' },
    { url: 'https://192.168.1.1', description: 'Private IP' },
    { url: 'HTTPS://EXAMPLE.COM', description: 'Case normalization' },
    { url: 'https://müller.de', description: 'International domain' },
];

let allAccepted = true;
safeURLs.forEach(({ url, description }) => {
    const result = validateURL(url);
    const accepted = result.valid;
    const status = accepted ? '✓ ACCEPTED' : '✗ REJECTED';

    console.log(`  ${status} | ${description}`);
    console.log(`          URL: ${url}`);
    if (result.valid) {
        console.log(`          Normalized: ${result.normalizedValue}`);
    } else {
        console.log(`          Error: ${result.error}`);
    }
    console.log();

    if (!accepted) allAccepted = false;
});

console.log();
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                         RESULTS                               ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log();

if (allBlocked && allAccepted) {
    console.log('  ✅ ALL TESTS PASSED!');
    console.log('  ✅ Dangerous protocols are blocked');
    console.log('  ✅ Safe protocols are accepted');
    console.log('  ✅ URL protocol whitelist validation is working correctly');
    console.log();
    console.log('  The security fix prevents XSS attacks via dangerous URL');
    console.log('  protocols like javascript:, data:, vbscript:, etc.');
    console.log();
    process.exit(0);
} else {
    console.log('  ❌ TESTS FAILED!');
    if (!allBlocked) {
        console.log('  ❌ Some dangerous protocols were NOT blocked');
    }
    if (!allAccepted) {
        console.log('  ❌ Some safe protocols were rejected');
    }
    console.log();
    console.log('  Security vulnerability detected!');
    console.log();
    process.exit(1);
}
