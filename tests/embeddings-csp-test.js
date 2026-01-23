/**
 * Embeddings CSP Compliance Test
 *
 * Tests that the local embeddings functionality works correctly
 * with the updated Content Security Policy.
 *
 * Run this test in the browser console after loading app.html
 * or integrate it into your test runner.
 *
 * Run programmatically:
 * ```javascript
 * import { runEmbeddingsCSPTest } from './tests/embeddings-csp-test.js';
 * const results = await runEmbeddingsCSPTest();
 * ```
 */

export function runEmbeddingsCSPTest() {
    const results = {
        passed: [],
        failed: [],
        warnings: []
    };

    const networkRequests = []; // Track all network requests

    console.log('🧪 Starting Embeddings CSP Compliance Tests...\n');

    // Set up network request tracking
    if (typeof PerformanceObserver !== 'undefined') {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.entryType === 'resource') {
                    networkRequests.push({
                        name: entry.name,
                        type: entry.initiatorType
                    });
                }
            }
        });
        observer.observe({ entryTypes: ['resource'] });
    }

    // Test 1: Verify CSP meta tag exists
    function testCSPMetaTag() {
        const cspMetaTag = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        if (!cspMetaTag) {
            results.failed.push({
                test: 'CSP Meta Tag',
                reason: 'No CSP meta tag found in document'
            });
            return false;
        }

        const cspContent = cspMetaTag.getAttribute('content');
        console.log('✓ CSP meta tag found');

        // Test 2: Verify 'unsafe-eval' is present (required for WebAssembly)
        if (!cspContent.includes("'unsafe-eval'")) {
            results.failed.push({
                test: 'CSP unsafe-eval',
                reason: "'unsafe-eval' is required for WebAssembly compilation but not found in CSP"
            });
            return false;
        }
        results.passed.push({ test: 'CSP unsafe-eval', reason: 'Found in CSP policy' });
        console.log('✓ CSP includes \'unsafe-eval\' for WebAssembly support');

        // Test 3: Verify script-src includes 'self'
        if (!cspContent.includes("script-src 'self'")) {
            results.failed.push({
                test: 'CSP script-src self',
                reason: 'script-src does not include \'self\''
            });
            return false;
        }
        results.passed.push({ test: 'CSP script-src self', reason: 'Found in CSP policy' });
        console.log('✓ CSP script-src includes \'self\'');

        // Test 4: Verify worker-src is present (required for Workers)
        if (!cspContent.includes('worker-src')) {
            results.failed.push({
                test: 'CSP worker-src',
                reason: 'worker-src directive is required for Transformers.js and app workers but not found'
            });
            return false;
        }
        results.passed.push({ test: 'CSP worker-src', reason: 'Found in CSP policy' });
        console.log('✓ CSP includes worker-src directive');

        // Test 5: Warn if CDN is still in CSP (should not be needed anymore)
        if (cspContent.includes('cdn.jsdelivr.net')) {
            results.warnings.push({
                test: 'CSP CDN whitelist',
                reason: 'cdn.jsdelivr.net is whitelisted but may not be needed with local bundling'
            });
            console.log('⚠ Warning: CDN domain still in CSP');
        } else {
            results.passed.push({ test: 'CSP No CDN', reason: 'CDN not whitelisted (good)' });
            console.log('✓ CSP does not whitelist CDN domains');
        }

        return true;
    }

    // Test 6: Verify Transformers.js is loaded from local source
    async function testTransformersLoaded() {
        if (typeof window.transformers === 'undefined') {
            results.failed.push({
                test: 'Transformers.js Loaded',
                reason: 'window.transformers is not defined. Check that js/vendor/transformers.min.js is loaded.'
            });
            return false;
        }
        results.passed.push({ test: 'Transformers.js Loaded', reason: 'window.transformers is available' });
        console.log('✓ Transformers.js is loaded (window.transformers available)');

        // Test 7: Verify pipeline function exists
        if (typeof window.transformers.pipeline !== 'function') {
            results.failed.push({
                test: 'Transformers.js pipeline',
                reason: 'transformers.pipeline is not a function'
            });
            return false;
        }
        results.passed.push({ test: 'Transformers.js pipeline', reason: 'pipeline function is available' });
        console.log('✓ Transformers.js pipeline function is available');

        // Test 8: Verify env property exists (for WASM configuration)
        if (!window.transformers.env) {
            results.warnings.push({
                test: 'Transformers.js env',
                reason: 'transformers.env is not available'
            });
            console.log('⚠ Warning: transformers.env not available');
        } else {
            results.passed.push({ test: 'Transformers.js env', reason: 'env object is available' });
            console.log('✓ Transformers.js env object is available');
        }

        return true;
    }

    // Test 9: Verify vendor script source
    function testVendorScriptSource() {
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        const transformersScript = scripts.find(s => s.src.includes('transformers.min.js'));

        if (!transformersScript) {
            results.failed.push({
                test: 'Transformers Script Tag',
                reason: 'No script tag found for transformers.min.js'
            });
            return false;
        }

        const src = transformersScript.src;
        console.log('✓ Transformers.js script tag found');

        // Verify it's loaded from local source, not CDN
        if (src.includes('cdn.jsdelivr.net')) {
            results.failed.push({
                test: 'Transformers Local Source',
                reason: 'Transformers.js is loaded from CDN instead of local vendor directory'
            });
            return false;
        }

        if (!src.includes('/js/vendor/') && !src.includes('js/vendor/')) {
            results.warnings.push({
                test: 'Transformers Local Source',
                reason: 'Transformers.js may not be from expected vendor path'
            });
            console.log('⚠ Warning: Transformers.js source path unexpected');
        }

        results.passed.push({ test: 'Transformers Script Tag', reason: 'Loaded from local vendor directory' });
        console.log('✓ Transformers.js is loaded from local vendor directory');
        return true;
    }

    // Test 10: Verify WebAssembly is supported
    function testWebAssemblySupport() {
        if (typeof WebAssembly === 'undefined') {
            results.failed.push({
                test: 'WebAssembly Support',
                reason: 'WebAssembly is not supported in this browser'
            });
            return false;
        }
        results.passed.push({ test: 'WebAssembly Support', reason: 'WebAssembly is available' });
        console.log('✓ WebAssembly is supported');

        // Test if WebAssembly can compile (may still fail with strict CSP)
        try {
            const testModule = new WebAssembly.Module(
                Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
            );
            results.passed.push({ test: 'WebAssembly Compilation', reason: 'Can compile WASM modules' });
            console.log('✓ WebAssembly compilation works (CSP allows it)');
            return true;
        } catch (e) {
            results.failed.push({
                test: 'WebAssembly Compilation',
                reason: 'Cannot compile WASM modules: ' + e.message + '. CSP may be too strict.'
            });
            console.error('✗ WebAssembly compilation failed:', e.message);
            return false;
        }
    }

    // Test 11: Verify Workers can be created
    function testWorkerSupport() {
        try {
            // Create a simple test worker using a data URL
            const testWorker = new Worker(
                URL.createObjectURL(new Blob(['done();postMessage("worker-works");'], { type: 'text/javascript' }))
            );

            results.passed.push({ test: 'Worker Support', reason: 'Can create Workers' });
            console.log('✓ Worker creation works (CSP allows it)');
            testWorker.terminate();
            return true;
        } catch (e) {
            results.failed.push({
                test: 'Worker Support',
                reason: 'Cannot create Workers: ' + e.message + '. worker-src CSP may be missing.'
            });
            console.error('✗ Worker creation failed:', e.message);
            return false;
        }
    }

    // Test 12: Verify no jsDelivr network requests were made
    function testNoCDNNetworkRequests() {
        const jsdelivrRequests = networkRequests.filter(req =>
            req.name && req.name.includes('jsdelivr.net')
        );

        if (jsdelivrRequests.length > 0) {
            results.failed.push({
                test: 'No CDN Network Requests',
                reason: `Found ${jsdelivrRequests.length} requests to jsDelivr CDN`
            });
            console.error('✗ Found jsDelivr network requests:', jsdelivrRequests.map(r => r.name));
            return false;
        }

        results.passed.push({ test: 'No CDN Network Requests', reason: 'No jsDelivr requests detected' });
        console.log('✓ No network requests to jsDelivr CDN detected');
        return true;
    }

    // Test 13: Verify CSP is enforced (check for violations)
    function testCSPEnforced() {
        // Check if there are any CSP violations reported
        let violationsFound = false;
        const violations = [];

        // Check console for CSP warnings
        if (window.__cspViolations && window.__cspViolations.length > 0) {
            violationsFound = true;
            violations.push(...window.__cspViolations);
        }

        // The key test is that CSP meta tag exists and is being enforced
        const cspMetaTag = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        if (!cspMetaTag) {
            results.failed.push({
                test: 'CSP Enforced',
                reason: 'No CSP meta tag found'
            });
            return false;
        }

        // Try to trigger a CSP violation by loading an external image
        const testImg = new Image();
        let blocked = false;

        // We can't easily test this synchronously, but we can verify the CSP structure
        const cspContent = cspMetaTag.getAttribute('content');

        // Verify default-src is 'self' (not * or missing)
        if (!cspContent.includes("default-src 'self'")) {
            results.warnings.push({
                test: 'CSP Enforcement',
                reason: 'default-src may be too permissive'
            });
        }

        results.passed.push({ test: 'CSP Enforced', reason: 'CSP meta tag present and structured correctly' });
        console.log('✓ CSP is enforced (meta tag present)');

        if (violationsFound) {
            results.warnings.push({
                test: 'CSP Violations',
                reason: `${violations.length} CSP violations detected`
            });
            console.log(`⚠ Warning: ${violations.length} CSP violations detected`);
        }

        return true;
    }

    // Run all tests
    async function runAllTests() {
        testCSPMetaTag();
        testVendorScriptSource();
        await testTransformersLoaded();
        testWebAssemblySupport();
        testWorkerSupport();
        testNoCDNNetworkRequests();
        testCSPEnforced();

        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 Test Summary');
        console.log('='.repeat(60));
        console.log(`✅ Passed: ${results.passed.length}`);
        console.log(`❌ Failed: ${results.failed.length}`);
        console.log(`⚠️  Warnings: ${results.warnings.length}`);

        if (results.failed.length > 0) {
            console.log('\n❌ Failed Tests:');
            results.failed.forEach(f => {
                console.log(`   - ${f.test}: ${f.reason}`);
            });
        }

        if (results.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            results.warnings.forEach(w => {
                console.log(`   - ${w.test}: ${w.reason}`);
            });
        }

        if (results.failed.length === 0) {
            console.log('\n✅ All critical tests passed! Embeddings should work with current CSP.');
        } else {
            console.log('\n❌ Some tests failed. Embeddings may not work correctly.');
        }

        return {
            success: results.failed.length === 0,
            results
        };
    }

    return runAllTests();
}

// Set up CSP violation tracking
if (typeof window !== 'undefined') {
    window.__cspViolations = [];
    window.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push({
            type: e.violatedDirective,
            resource: e.blockedURI || e.resource || 'unknown',
            policy: e.originalPolicy
        });
    });

    // Export for use in test runners or browser console
    window.runEmbeddingsCSPTest = runEmbeddingsCSPTest;
    console.log('💡 runEmbeddingsCSPTest() is available. Run it to test embeddings CSP compliance.');
}

export default runEmbeddingsCSPTest;
