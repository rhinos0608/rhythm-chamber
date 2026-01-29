/**
 * Batch 2: Manual Verification Script for P0-3 Backward Compatibility Fix
 *
 * This script verifies that old function names are accessible from the facade.
 */

import { isQueueProcessing, getApiStats, isProcessing, getStats } from '../js/genre-enrichment/index.js';

console.log('='.repeat(60));
console.log('Batch 2: Verifying P0-3 Backward Compatibility Fix');
console.log('='.repeat(60));

// Test 1: isQueueProcessing alias
console.log('\n[Test 1] Verifying isQueueProcessing alias...');
try {
    if (typeof isQueueProcessing !== 'function') {
        console.error('❌ FAIL: isQueueProcessing is not a function');
        console.error('   Type:', typeof isQueueProcessing);
        process.exit(1);
    }

    const result = isQueueProcessing();
    console.log('✓ PASS: isQueueProcessing is callable');
    console.log('  Result type:', typeof result);
    console.log('  Result value:', result);

    // Verify it's the same as isProcessing
    if (isQueueProcessing !== isProcessing) {
        console.error('❌ FAIL: isQueueProcessing is not the same function as isProcessing');
        process.exit(1);
    }
    console.log('✓ PASS: isQueueProcessing === isProcessing');
} catch (error) {
    console.error('❌ FAIL: Error calling isQueueProcessing:', error.message);
    process.exit(1);
}

// Test 2: getApiStats alias
console.log('\n[Test 2] Verifying getApiStats alias...');
try {
    if (typeof getApiStats !== 'function') {
        console.error('❌ FAIL: getApiStats is not a function');
        console.error('   Type:', typeof getApiStats);
        process.exit(1);
    }

    const promise = getApiStats();
    if (!(promise instanceof Promise)) {
        console.error('❌ FAIL: getApiStats does not return a Promise');
        console.error('   Type:', typeof promise);
        process.exit(1);
    }

    console.log('✓ PASS: getApiStats is callable and returns Promise');

    // Verify it's the same as getStats
    if (getApiStats !== getStats) {
        console.error('❌ FAIL: getApiStats is not the same function as getStats');
        process.exit(1);
    }
    console.log('✓ PASS: getApiStats === getStats');

    // Test the actual promise resolves
    promise.then(stats => {
        console.log('✓ PASS: getApiStats promise resolves');
        console.log('  Stats structure:', Object.keys(stats));

        if (!stats || typeof stats !== 'object') {
            console.error('❌ FAIL: getApiStats did not return an object');
            process.exit(1);
        }

        if (typeof stats.cachedCount !== 'number') {
            console.error('❌ FAIL: stats.cachedCount is not a number');
            console.error('   Type:', typeof stats.cachedCount);
            process.exit(1);
        }

        console.log('✓ PASS: getApiStats returns correct structure');
        console.log('  cachedCount:', stats.cachedCount);

        console.log('\n' + '='.repeat(60));
        console.log('✓ ALL TESTS PASSED - Fix 2.1 verified successfully!');
        console.log('='.repeat(60));
    }).catch(error => {
        console.error('❌ FAIL: getApiStats promise rejected:', error.message);
        process.exit(1);
    });
} catch (error) {
    console.error('❌ FAIL: Error calling getApiStats:', error.message);
    process.exit(1);
}
