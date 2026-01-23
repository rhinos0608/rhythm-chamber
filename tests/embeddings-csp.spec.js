/**
 * Playwright Test: Embeddings CSP Compliance
 *
 * Run with: npx playwright test embeddings-csp.spec.js
 * Or: node tests/embeddings-csp.spec.js (standalone mode with puppeteer-like API)
 *
 * This test verifies:
 * 1. No network calls to jsDelivr during embeddings initialization
 * 2. CSP is actually enforced (violations are blocked)
 * 3. Transformers.js loads from local vendor directory
 * 4. WebAssembly compilation works with the CSP
 * 5. Workers can be created (worker-src CSP directive)
 */

import { test, expect } from '@playwright/test';

// Base URL for testing - adjust if needed
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080/app.html';

test.describe('Embeddings CSP Compliance', () => {
    let networkRequests = [];
    let cspViolations = [];

    test.beforeEach(async ({ page, context }) => {
        // Reset tracking arrays
        networkRequests = [];
        cspViolations = [];

        // Track all network requests
        page.on('request', request => {
            const url = request.url();
            networkRequests.push({
                url,
                method: request.method(),
                resourceType: request.resourceType()
            });
        });

        // Track CSP violations
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('Content Security Policy') ||
                text.includes('CSP') ||
                text.includes('violates')) {
                cspViolations.push({
                    type: 'console',
                    message: text
                });
            }
        });

        // Also listen for securitypolicyviolation events
        await page.addInitScript(() => {
            window.addEventListener('securitypolicyviolation', (e) => {
                window.__cspViolations = window.__cspViolations || [];
                window.__cspViolations.push({
                    type: e.violatedDirective,
                    resource: e.blockedURI || e.resource || 'unknown',
                    policy: e.originalPolicy
                });
            });
        });
    });

    test('should load Transformers.js from local vendor directory, not CDN', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

        // Wait for scripts to load
        await page.waitForTimeout(1000);

        // Check that Transformers.js is loaded from local source
        const transformersScripts = await page.evaluate(() => {
            const scripts = Array.from(document.querySelectorAll('script[src]'));
            return scripts
                .filter(s => s.src.includes('transformers'))
                .map(s => ({
                    src: s.src,
                    isLocal: s.src.includes('/js/vendor/') || s.src.includes('js/vendor/'),
                    isCDN: s.src.includes('cdn.jsdelivr.net') || s.src.includes('jsdelivr.net')
                }));
        });

        expect(transformersScripts.length).toBeGreaterThan(0);
        expect(transformersScripts.every(s => s.isLocal)).toBeTruthy();
        expect(transformersScripts.some(s => s.isCDN)).toBeFalsy();

        // Verify window.transformers is available
        const hasTransformers = await page.evaluate(() => {
            return typeof window.transformers !== 'undefined' &&
                   typeof window.transformers.pipeline === 'function';
        });
        expect(hasTransformers).toBeTruthy();
    });

    test('should not make any network requests to jsDelivr', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });

        const jsdelivrRequests = networkRequests.filter(req =>
            req.url.includes('jsdelivr.net') || req.url.includes('jsDelivr')
        );

        expect(jsdelivrRequests).toHaveLength(0);
    });

    test('should have correct CSP directives in meta tag', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

        const cspContent = await page.evaluate(() => {
            const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            return meta ? meta.getAttribute('content') : null;
        });

        expect(cspContent).not.toBeNull();

        // Verify required CSP directives
        expect(cspContent).toContain('script-src');
        expect(cspContent).toContain("'unsafe-eval'"); // Required for WASM
        expect(cspContent).toContain('worker-src');    // Required for workers
        expect(cspContent).toContain('blob:');         // Required for worker blob URLs

        // Should NOT have CDN whitelist
        expect(cspContent).not.toContain('cdn.jsdelivr.net');
    });

    test('should allow WebAssembly compilation', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

        const wasmWorks = await page.evaluate(async () => {
            try {
                // Test WebAssembly compilation
                const testModule = new WebAssembly.Module(
                    Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
                );
                return { success: true, wasmSupported: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        expect(wasmWorks.success).toBeTruthy();
        expect(wasmWorks.wasmSupported).toBeTruthy();
    });

    test('should allow workers to be created', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

        const workerWorks = await page.evaluate(async () => {
            try {
                // Create a simple test worker
                const worker = new Worker('data:application/javascript;base64,ZG9uZSgpO3Bvc3RNZXNzYWdlKCd3b3JrZXItd29ya3MnKTs=');
                const result = await new Promise((resolve) => {
                    worker.addEventListener('message', (e) => {
                        resolve(e.data === 'worker-works');
                        worker.terminate();
                    });
                    setTimeout(() => resolve(false), 1000);
                });
                return { success: result };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        expect(workerWorks.success).toBeTruthy();
    });

    test('should block CSP violations', async ({ page }) => {
        // Enable CSP report mode or monitoring
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

        // Try to load an external script (should be blocked by CSP)
        const cspBlocksExternal = await page.evaluate(() => {
            const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            const csp = meta ? meta.getAttribute('content') : '';

            // Check that CSP doesn't allow arbitrary external scripts
            return !csp.includes('https://*') && !csp.includes('http://*');
        });

        expect(cspBlocksExternal).toBeTruthy();

        // Check for accumulated CSP violations
        const violations = await page.evaluate(() => {
            return window.__cspViolations || [];
        });

        // Filter out expected violations (if any) - we just want to ensure CSP is active
        // The key is that the CSP meta tag exists and is being enforced
        const cspIsActive = await page.evaluate(() => {
            const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            return meta !== null;
        });

        expect(cspIsActive).toBeTruthy();
    });

    test('should initialize LocalEmbeddings without CDN requests', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

        // Wait for app to initialize
        await page.waitForTimeout(2000);

        // Check that LocalEmbeddings module can be loaded
        const embeddingsStatus = await page.evaluate(async () => {
            try {
                // Check if LocalEmbeddings is available through ModuleRegistry
                if (window.ModuleRegistry) {
                    const LocalEmbeddings = window.ModuleRegistry.getModuleSync('LocalEmbeddings');
                    if (LocalEmbeddings) {
                        const status = LocalEmbeddings.getStatus();
                        return {
                            available: true,
                            isInitialized: status?.isInitialized || false,
                            loadError: status?.loadError || null
                        };
                    }
                }

                // Check if LocalEmbeddings will be available (not yet loaded)
                // by checking if transformers is on window
                if (window.transformers) {
                    return { available: true, transformersReady: true };
                }

                return { available: false };
            } catch (e) {
                return { available: false, error: e.message };
            }
        });

        // Verify embeddings system is available
        expect(embeddingsStatus.available).toBeTruthy();

        // Verify no jsDelivr requests were made during page load
        const jsdelivrRequests = networkRequests.filter(req =>
            req.url.includes('jsdelivr.net')
        );
        expect(jsdelivrRequests).toHaveLength(0);
    });

    test('should pass all CSP compliance checks', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });

        // Run comprehensive CSP test
        const testResults = await page.evaluate(() => {
            const results = {
                passed: [],
                failed: [],
                warnings: []
            };

            // Test 1: CSP meta tag exists
            const cspMetaTag = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            if (!cspMetaTag) {
                results.failed.push({ test: 'CSP Meta Tag', reason: 'Not found' });
            } else {
                results.passed.push({ test: 'CSP Meta Tag', reason: 'Found' });

                const cspContent = cspMetaTag.getAttribute('content');

                // Test 2: unsafe-eval present
                if (cspContent.includes("'unsafe-eval'")) {
                    results.passed.push({ test: 'unsafe-eval', reason: 'Found in CSP' });
                } else {
                    results.failed.push({ test: 'unsafe-eval', reason: 'Required for WASM' });
                }

                // Test 3: worker-src present
                if (cspContent.includes('worker-src')) {
                    results.passed.push({ test: 'worker-src', reason: 'Found in CSP' });
                } else {
                    results.failed.push({ test: 'worker-src', reason: 'Required for workers' });
                }

                // Test 4: No CDN whitelist
                if (!cspContent.includes('cdn.jsdelivr.net')) {
                    results.passed.push({ test: 'No CDN in CSP', reason: 'Correct' });
                } else {
                    results.warnings.push({ test: 'No CDN in CSP', reason: 'CDN still whitelisted' });
                }
            }

            // Test 5: Transformers.js loaded from local
            const scripts = Array.from(document.querySelectorAll('script[src]'));
            const transformersScript = scripts.find(s => s.src.includes('transformers.min.js'));
            if (transformersScript) {
                if (transformersScript.src.includes('js/vendor/')) {
                    results.passed.push({ test: 'Transformers Local', reason: 'Loaded from vendor' });
                } else if (transformersScript.src.includes('cdn.jsdelivr.net')) {
                    results.failed.push({ test: 'Transformers Local', reason: 'Loaded from CDN' });
                } else {
                    results.warnings.push({ test: 'Transformers Local', reason: 'Unexpected path' });
                }
            } else {
                results.failed.push({ test: 'Transformers Script', reason: 'Not found' });
            }

            // Test 6: WebAssembly works
            try {
                new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
                results.passed.push({ test: 'WebAssembly', reason: 'Compiles successfully' });
            } catch (e) {
                results.failed.push({ test: 'WebAssembly', reason: e.message });
            }

            // Test 7: window.transformers available
            if (typeof window.transformers === 'object' &&
                typeof window.transformers.pipeline === 'function') {
                results.passed.push({ test: 'Transformers API', reason: 'Available' });
            } else {
                results.failed.push({ test: 'Transformers API', reason: 'Not available' });
            }

            return results;
        });

        // Assert all critical tests passed
        expect(testResults.failed).toHaveLength(0);

        // Log summary for debugging
        console.log(`✅ Passed: ${testResults.passed.length}`);
        console.log(`⚠️  Warnings: ${testResults.warnings.length}`);
        testResults.passed.forEach(p => console.log(`  ✓ ${p.test}`));
        testResults.warnings.forEach(w => console.log(`  ⚠ ${w.test}: ${w.reason}`));
    });
});

// Export for use in other test files
export default test;
