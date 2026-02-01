#!/usr/bin/env node

/**
 * Parse and display test results from JSON output files
 *
 * Usage:
 *   node scripts/parse-test-results.mjs                 # Parse latest results
 *   node scripts/parse-test-results.mjs vitest          # Parse specific test type
 *   node scripts/parse-test-results.mjs --failures      # Show only failures
 *   node scripts/parse-test-results.mjs --summary       # Show only summary
 */

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const OUTPUT_DIR = process.env.TEST_OUTPUT_DIR || join(PROJECT_ROOT, '.test-results');

/**
 * Gets all JSON result files sorted by modification time
 */
async function getResultFiles() {
    try {
        const files = await readdir(OUTPUT_DIR);
        return files
            .filter((f) => f.endsWith('-results.json'))
            .map((f) => join(OUTPUT_DIR, f));
    } catch {
        return [];
    }
}

/**
 * Reads and parses a result file
 */
async function readResult(filePath) {
    try {
        const content = await readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`❌ Failed to read ${filePath}:`, error.message);
        return null;
    }
}

/**
 * Formats a test result summary
 */
function formatSummary(result) {
    const lines = [];
    lines.push(`\n📊 ${result.meta?.testType || 'Unknown'} - ${result.meta?.timestamp || 'Unknown time'}`);

    if (result.results?.numTotalTests !== undefined) {
        // Vitest format (direct counts at results level)
        const { numTotalTests, numPassedTests, numFailedTests, numPendingTests } = result.results;
        lines.push(
            `   Total: ${numTotalTests} | ✅ Passed: ${numPassedTests} | ❌ Failed: ${numFailedTests} | ⏭ Skipped: ${numPendingTests}`
        );
    } else if (result.results?.stats) {
        // Vitest format (nested stats object)
        const { passed, failed, skipped } = result.results.stats;
        const total = passed + failed + skipped;
        lines.push(`   Total: ${total} | ✅ Passed: ${passed} | ❌ Failed: ${failed} | ⏭ Skipped: ${skipped}`);
    } else if (result.results?.summary) {
        // Playwright format
        const { expected, unexpected, skipped, flaky } = result.results.summary;
        const total = expected + unexpected + skipped;
        lines.push(
            `   Total: ${total} | ✅ Passed: ${expected} | ❌ Failed: ${unexpected} | ⏭ Skipped: ${skipped}${flaky ? ` | 🔄 Flaky: ${flaky}` : ''}`
        );
    } else {
        lines.push('   No summary available');
    }

    return lines.join('\n');
}

/**
 * Formats failure details
 */
function formatFailures(result) {
    const lines = [];
    const results = result.results;

    if (!results) {
        lines.push('No results data found');
        return lines.join('\n');
    }

    // Vitest failures - check testResults array
    if (results.testResults && Array.isArray(results.testResults)) {
        const failedTests = [];
        // Collect all failed assertions across all test suites
        for (const suite of results.testResults) {
            if (suite.assertionResults) {
                for (const test of suite.assertionResults) {
                    if (test.status === 'failed') {
                        failedTests.push(test);
                    }
                }
            }
        }

        if (failedTests.length === 0) {
            lines.push('✅ No failures');
        } else {
            lines.push(`\n❌ ${failedTests.length} Failed Test(s):\n`);
            for (const test of failedTests) {
                // Build full test name from ancestor titles
                const fullName = [...test.ancestorTitles, test.title].join(' › ');
                lines.push(`   ${fullName}`);
                if (test.failureMessages && test.failureMessages.length > 0) {
                    lines.push(`   └─ ${test.failureMessages[0].split('\n')[0]}`);
                }
                lines.push('');
            }
        }
    }
    // Playwright failures
    else if (results.suites) {
        const failedTests = [];
        function collectFailures(suite, prefix = '') {
            if (suite.specs) {
                for (const spec of suite.specs) {
                    if (spec.tests?.some((t) => t.results?.some((r) => r.status === 'failed'))) {
                        failedTests.push({ name: prefix + spec.title, spec });
                    }
                }
            }
            if (suite.suites) {
                for (const child of suite.suites) {
                    collectFailures(child, prefix + suite.title + ' › ');
                }
            }
        }
        for (const suite of results.suites) {
            collectFailures(suite);
        }

        if (failedTests.length === 0) {
            lines.push('✅ No failures');
        } else {
            lines.push(`\n❌ ${failedTests.length} Failed Test(s):\n`);
            for (const { name, spec } of failedTests) {
                lines.push(`   ${name}`);
                // Find the error message
                for (const test of spec.tests || []) {
                    for (const result of test.results || []) {
                        if (result.status === 'failed' && result.error?.message) {
                            lines.push(`   └─ ${result.error.message.split('\n')[0]}`);
                        }
                    }
                }
                lines.push('');
            }
        }
    } else {
        lines.push('No failure details available');
    }

    return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);
    const showFailures = args.includes('--failures');
    const showSummary = args.includes('--summary');
    const filterType = args.find((a) => !a.startsWith('--'));

    const resultFiles = await getResultFiles();

    if (resultFiles.length === 0) {
        console.error('❌ No test result files found in', OUTPUT_DIR);
        console.log('   Run tests with `npm run test:unit:json` or `npm run test:e2e:json` first.');
        process.exit(1);
    }

    // Filter by type if specified
    let filesToParse = resultFiles;
    if (filterType && !filterType.startsWith('--')) {
        filesToParse = resultFiles.filter((f) => f.includes(`${filterType}-results.json`));
        if (filesToParse.length === 0) {
            console.error(`❌ No results found for test type: ${filterType}`);
            console.log('   Available types:', resultFiles.map((f) => f.split('/').pop().replace('-results.json', '')).join(', '));
            process.exit(1);
        }
    }

    // Read and display results
    for (const filePath of filesToParse) {
        const result = await readResult(filePath);
        if (!result) continue;

        if (showSummary) {
            console.log(formatSummary(result));
        } else if (showFailures) {
            console.log(formatFailures(result));
        } else {
            console.log(formatSummary(result));
            console.log(formatFailures(result));
        }
    }
}

main();
