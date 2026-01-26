#!/usr/bin/env node
/**
 * CRITICAL ReDoS Bypass Vulnerability Fix Verification
 *
 * This script verifies that the ReDoS bypass vulnerability has been fixed.
 * The original pattern /\(([a-zA-Z*+]+)\+/ could be bypassed by patterns like ((a+)+
 */

import { validateSchema } from './js/utils/validation.js';

console.log('='.repeat(80));
console.log('CRITICAL ReDoS Bypass Vulnerability Fix Verification');
console.log('='.repeat(80));
console.log();

// Test cases
const testCases = [
    {
        name: 'Original bypass pattern: ((a+)+',
        pattern: '((a+)+',
        shouldBeBlocked: true,
        description: 'This pattern bypassed the old detection mechanism'
    },
    {
        name: 'Variation with star: ((a*)+',
        pattern: '((a*)+',
        shouldBeBlocked: true,
        description: 'Another nested quantifier variation'
    },
    {
        name: 'Single nested: (a+)+',
        pattern: '(a+)+',
        shouldBeBlocked: true,
        description: 'Simple nested quantifier'
    },
    {
        name: 'Non-capturing nested: (?:a+)+',
        pattern: '(?:a+)+',
        shouldBeBlocked: true,
        description: 'Non-capturing group with nested quantifiers'
    },
    {
        name: 'Character class nested: ([a-z]+)+',
        pattern: '([a-z]+)+',
        shouldBeBlocked: true,
        description: 'Character class with nested quantifiers'
    },
    {
        name: 'Safe pattern: ^[a-zA-Z0-9]+$',
        pattern: '^[a-zA-Z0-9]+$',
        shouldBeBlocked: false,
        description: 'Simple alphanumeric pattern (should be allowed)'
    },
    {
        name: 'Safe email pattern',
        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
        shouldBeBlocked: false,
        description: 'Email validation pattern (should be allowed)',
        testValue: 'test@example.com'
    },
    {
        name: 'Safe URL pattern',
        pattern: '^https?://[^\\s/$.?#].[^\\s]*$',
        shouldBeBlocked: false,
        description: 'URL validation pattern (should be allowed)',
        testValue: 'https://example.com'
    }
];

let passed = 0;
let failed = 0;

console.log('Running test cases...');
console.log();

for (const testCase of testCases) {
    const result = validateSchema(testCase.testValue || 'test', {
        type: 'string',
        pattern: testCase.pattern
    });

    const isBlocked = !result.valid;
    const testPassed = isBlocked === testCase.shouldBeBlocked;

    if (testPassed) {
        passed++;
        console.log(`✓ PASS: ${testCase.name}`);
    } else {
        failed++;
        console.log(`✗ FAIL: ${testCase.name}`);
    }

    console.log(`  Pattern: ${testCase.pattern}`);
    console.log(`  Description: ${testCase.description}`);
    console.log(`  Expected: ${testCase.shouldBeBlocked ? 'BLOCKED' : 'ALLOWED'}`);
    console.log(`  Actual: ${isBlocked ? 'BLOCKED' : 'ALLOWED'}`);
    console.log(`  Reason: ${result.valid ? 'Pattern is safe' : (result.errors?.[0] || 'Unknown')}`);
    console.log();
}

console.log('='.repeat(80));
console.log('Test Summary');
console.log('='.repeat(80));
console.log(`Total tests: ${testCases.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log();

if (failed === 0) {
    console.log('✓ SUCCESS: All ReDoS bypass patterns are now properly detected!');
    console.log('✓ The vulnerability has been successfully fixed.');
    process.exit(0);
} else {
    console.log('✗ FAILURE: Some tests failed. The vulnerability may not be fully fixed.');
    process.exit(1);
}
