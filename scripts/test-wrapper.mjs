#!/usr/bin/env node

/**
 * Test wrapper script - Runs tests with JSON reporter for reliable output parsing
 *
 * Usage:
 *   node scripts/test-wrapper.mjs unit          # Run unit tests with JSON output
 *   node scripts/test-wrapper.mjs e2e           # Run E2E tests with JSON output
 *   node scripts/test-wrapper.mjs unit --watch  # Pass additional args through
 *
 * Environment variables:
 *   TEST_OUTPUT_DIR - Custom output directory (default: .test-results)
 *   TEST_KEEP_OUTPUT   - Keep JSON files even on success (default: false)
 */

import { spawn } from 'child_process';
import { mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Configuration
const OUTPUT_DIR = process.env.TEST_OUTPUT_DIR || join(PROJECT_ROOT, '.test-results');
const KEEP_OUTPUT = process.env.TEST_KEEP_OUTPUT === 'true';

// Test type configurations
const TEST_CONFIGS = {
  unit: {
    command: 'npx',
    args: ['vitest', 'run', 'tests/unit/', '--reporter=json'],
    outputFile: 'vitest-results.json',
    description: 'Unit tests',
  },
  'unit:watch': {
    command: 'npx',
    args: ['vitest', 'tests/unit/', '--reporter=json'],
    outputFile: 'vitest-watch-results.json',
    description: 'Unit tests (watch mode)',
  },
  architecture: {
    command: 'npx',
    args: ['vitest', 'run', 'tests/architecture/', '--reporter=json'],
    outputFile: 'architecture-results.json',
    description: 'Architecture tests',
  },
  e2e: {
    command: 'npx',
    args: ['playwright', 'test', '--reporter=json'],
    outputFile: 'playwright-results.json',
    description: 'E2E tests',
  },
};

/**
 * Ensures output directory exists
 * Note: We don't clean old files to avoid glob dependency issues
 * Files can be manually cleaned or managed by TEST_KEEP_OUTPUT
 */
async function prepareOutputDir() {
  await mkdir(OUTPUT_DIR, { recursive: true });
}

/**
 * Runs a test command and captures output
 */
function runTest(command, args) {
  return new Promise((resolve, reject) => {
    const testProcess = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';

    testProcess.stdout.on('data', data => {
      const chunk = data.toString();
      stdout += chunk;
      // Also stream to console for visibility
      process.stdout.write(chunk);
    });

    testProcess.stderr.on('data', data => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });

    testProcess.on('close', code => {
      resolve({ exitCode: code, stdout, stderr });
    });

    testProcess.on('error', error => {
      reject(error);
    });
  });
}

/**
 * Extracts JSON from test output (handles JSON embedded in text output)
 */
function extractJSON(output) {
  // Vitest outputs JSON at the end, look for the opening bracket
  const jsonStart = output.lastIndexOf('[');
  const jsonEnd = output.lastIndexOf(']');

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    const jsonString = output.substring(jsonStart, jsonEnd + 1);
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      // If that fails, try parsing the whole output
    }
  }

  // Try parsing the whole output as JSON
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

/**
 * Writes test results to file
 */
async function writeResults(results, outputFile) {
  const outputPath = join(OUTPUT_DIR, outputFile);

  // Create a structured result object with metadata
  const structuredResults = {
    meta: {
      timestamp: new Date().toISOString(),
      testType: outputFile.replace('-results.json', ''),
      nodeVersion: process.version,
      platform: process.platform,
    },
    results,
    success: results !== null,
  };

  await writeFile(outputPath, JSON.stringify(structuredResults, null, 2));
  return outputPath;
}

/**
 * Main execution
 */
async function main() {
  const testType = process.argv[2];

  if (!testType || !TEST_CONFIGS[testType]) {
    console.error('❌ Invalid test type. Valid options:');
    console.error(Object.keys(TEST_CONFIGS).map(t => `   - ${t}`).join('\n'));
    process.exit(1);
  }

  const config = TEST_CONFIGS[testType];

  // Allow additional arguments to be passed through
  const additionalArgs = process.argv.slice(3);
  if (additionalArgs.length > 0) {
    // Merge additional args, but preserve --reporter=json
    const hasReporter = additionalArgs.some(arg => arg.startsWith('--reporter'));
    if (!hasReporter) {
      config.args.push('--reporter=json');
    }
    config.args.push(...additionalArgs);
  }

  console.log(`\n🧪 Running ${config.description}...`);
  console.log(`   Output: ${join(OUTPUT_DIR, config.outputFile)}\n`);

  await prepareOutputDir();

  try {
    const { exitCode, stdout } = await runTest(config.command, config.args);

    // Try to extract JSON from output
    const jsonResults = extractJSON(stdout);

    if (jsonResults) {
      const outputPath = await writeResults(jsonResults, config.outputFile);
      console.log(`\n✅ Results written to: ${outputPath}`);

      // Print summary
      if (jsonResults.stats) {
        // Vitest format
        const { passed, failed, skipped } = jsonResults.stats;
        console.log(`   Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}`);
      } else if (jsonResults.summary) {
        // Playwright format
        const { expected, unexpected, skipped } = jsonResults.summary;
        console.log(`   Passed: ${expected}, Failed: ${unexpected}, Skipped: ${skipped}`);
      }
    } else {
      console.warn('\n⚠️  Could not extract JSON from test output');
      console.warn('   Raw output saved to:', join(OUTPUT_DIR, config.outputFile.replace('.json', '-raw.txt')));
      await writeFile(join(OUTPUT_DIR, config.outputFile.replace('.json', '-raw.txt')), stdout);
    }

    // Clean up on success unless KEEP_OUTPUT is set
    if (exitCode === 0 && !KEEP_OUTPUT) {
      // Results remain for inspection, but we could clean here if desired
    }

    process.exit(exitCode);
  } catch (error) {
    console.error('\n❌ Test runner error:', error.message);
    process.exit(1);
  }
}

main();
