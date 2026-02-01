/**
 * CSP Validation Script
 *
 * Validates that CSP headers are correctly configured:
 * - 'unsafe-inline' is removed from script-src
 * - 'unsafe-eval' is retained for WebAssembly
 * - 'script-src-elem' is present for stricter control
 */

import fs from 'fs';

const files = ['index.html', 'app.html', 'upgrade.html'];

const issues = [];
const successes = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const cspMatch = content.match(
    /<meta http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/
  );
  if (!cspMatch) {
    issues.push(`${file}: No CSP found`);
    return;
  }

  const csp = cspMatch[1];

  // Check for unsafe-inline in script-src (should be REMOVED)
  if (
    csp.includes("script-src 'self' 'unsafe-inline'") ||
    csp.includes("script-src 'unsafe-inline'") ||
    csp.match(/script-src[^;]*'unsafe-inline'/)
  ) {
    issues.push(`${file}: unsafe-inline found in script-src (should be removed)`);
  } else {
    successes.push(`${file}: unsafe-inline removed from script-src ✓`);
  }

  // Check for unsafe-eval in script-src (should be KEPT for WASM)
  if (csp.includes("'unsafe-eval'")) {
    successes.push(`${file}: unsafe-eval retained for WebAssembly ✓`);
  } else {
    issues.push(`${file}: unsafe-eval missing (required for WASM)`);
  }

  // Check for script-src-elem (should be present for stricter control)
  if (csp.includes('script-src-elem')) {
    successes.push(`${file}: script-src-elem directive present ✓`);
  } else {
    issues.push(`${file}: script-src-elem directive missing`);
  }

  // Check for worker-src
  if (csp.includes('worker-src')) {
    successes.push(`${file}: worker-src directive present ✓`);
  } else {
    issues.push(`${file}: worker-src directive missing`);
  }
});

console.log('=== CSP Validation Results ===');
console.log('');
console.log('✓ Successes:');
successes.forEach(s => console.log('  ' + s));
console.log('');

if (issues.length > 0) {
  console.log('❌ Issues:');
  issues.forEach(i => console.log('  ' + i));
  process.exit(1);
} else {
  console.log('✅ All CSP checks passed!');
  process.exit(0);
}
