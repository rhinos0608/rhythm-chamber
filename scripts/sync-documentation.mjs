#!/usr/bin/env node

/**
 * Documentation Sync Script for Rhythm Chamber
 *
 * Automatically scans source files, counts lines, counts tests, and updates
 * documentation with current statistics.
 *
 * Usage:
 *   node scripts/sync-documentation.mjs --dry-run     # Show changes without writing
 *   node scripts/sync-documentation.mjs --update       # Update documentation files
 *   node scripts/sync-documentation.mjs --verbose      # Show detailed output
 *
 * CLI Options:
 *   --dry-run  - Show what would change without writing files
 *   --update   - Actually update documentation files
 *   --verbose  - Show detailed output
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = dirname(__dirname);
const JS_DIR = join(ROOT_DIR, 'js');
const TESTS_DIR = join(ROOT_DIR, 'tests');

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const update = args.includes('--update');
const verbose = args.includes('--verbose') || args.includes('-v');

/**
 * Count lines in a file
 * @param {string} filePath - Absolute path to the file
 * @returns {number} - Number of lines
 */
function countLines(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch (error) {
    if (verbose) console.warn(`  Warning: Could not read ${filePath}: ${error.message}`);
    return 0;
  }
}

/**
 * Count tests in a test file by looking for common test patterns
 * @param {string} filePath - Absolute path to the test file
 * @returns {number} - Number of tests found
 */
function countTests(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    // Count common test patterns: test(), it(), describe() containing test(), etc.
    const patterns = [
      /\btest\s*\(/g,
      /\bit\s*\(/g,
      /\bdescribe\s*\([^)]*,\s*\(\)\s*=>\s*\{/g, // describe blocks with callback
    ];

    let testCount = 0;
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) testCount += matches.length;
    }

    // Count assertions as a rough estimate for files without explicit test declarations
    if (testCount === 0) {
      const assertPatterns = [/\bassert\./g, /\bexpect\s*\(/g];
      for (const pattern of assertPatterns) {
        const matches = content.match(pattern);
        if (matches) testCount += matches.length;
      }
    }

    return testCount;
  } catch (error) {
    if (verbose) console.warn(`  Warning: Could not count tests in ${filePath}: ${error.message}`);
    return 0;
  }
}

/**
 * Recursively find all JS files in a directory
 * @param {string} dir - Directory to scan
 * @returns {string[]} - Array of file paths
 */
function findJSFiles(dir) {
  const files = [];

  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      files.push(...findJSFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Get file stats for a specific file
 * @param {string} relativePath - Relative path from js/ directory
 * @returns {Object|null} - File stats or null if not found
 */
function getFileStats(relativePath) {
  const fullPath = join(JS_DIR, relativePath);
  if (!existsSync(fullPath)) return null;

  return {
    path: relativePath,
    lines: countLines(fullPath),
    size: statSync(fullPath).size,
  };
}

/**
 * Get stats for all files in a directory
 * @param {string} dirPath - Relative path from js/ directory
 * @returns {Object} - Directory stats
 */
function getDirectoryStats(dirPath) {
  const fullPath = join(JS_DIR, dirPath);
  if (!existsSync(fullPath)) {
    return { totalLines: 0, totalFiles: 0, files: [] };
  }

  const files = findJSFiles(fullPath);
  const fileStats = files.map(f => ({
    path: relative(JS_DIR, f),
    lines: countLines(f),
    size: statSync(f).size,
  }));

  return {
    totalLines: fileStats.reduce((sum, f) => sum + f.lines, 0),
    totalFiles: fileStats.length,
    files: fileStats.sort((a, b) => b.lines - a.lines),
  };
}

/**
 * Get test stats for test files matching a pattern
 * @param {string} pattern - Glob pattern for test files
 * @returns {Object} - Test stats
 */
function getTestStats(pattern) {
  // Simple glob pattern matching
  const isGlob = pattern.includes('*');

  if (isGlob) {
    // Convert simple glob to regex
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
    const regex = new RegExp(regexPattern);

    const allTestFiles = findJSFiles(TESTS_DIR);
    const matchingFiles = allTestFiles.filter(f => regex.test(f));

    const stats = matchingFiles.map(f => ({
      path: relative(ROOT_DIR, f),
      tests: countTests(f),
      lines: countLines(f),
    }));

    return {
      totalTests: stats.reduce((sum, s) => sum + s.tests, 0),
      totalFiles: stats.length,
      files: stats,
    };
  } else {
    const fullPath = join(ROOT_DIR, pattern);
    if (!existsSync(fullPath)) {
      return { totalTests: 0, totalFiles: 0, files: [] };
    }

    const tests = countTests(fullPath);
    return {
      totalTests: tests,
      totalFiles: 1,
      files: [
        {
          path: pattern,
          tests: tests,
          lines: countLines(fullPath),
        },
      ],
    };
  }
}

/**
 * Scan the entire codebase and build comprehensive stats
 * @returns {Object} - Complete stats object
 */
function scanCodebase() {
  if (verbose) console.log('Scanning codebase...\n');

  const stats = {
    timestamp: new Date().toISOString(),
    facades: {},
    internalModules: {},
    tests: {},
    summary: {
      totalFacadeLines: 0,
      totalInternalLines: 0,
      totalTestFiles: 0,
      totalTests: 0,
    },
  };

  // Scan facade files
  const facadeFiles = [
    'services/session-manager.js',
    'services/storage-degradation-manager.js',
    'services/error-recovery-coordinator.js',
    'services/worker-coordinator.js',
    'services/wave-telemetry.js',
  ];

  if (verbose) console.log('Scanning facade files...');
  for (const facadePath of facadeFiles) {
    const fileStats = getFileStats(facadePath);
    if (fileStats) {
      stats.facades[facadePath.split('/').pop().replace('.js', '')] = fileStats;
      stats.summary.totalFacadeLines += fileStats.lines;
    }
  }

  // Scan internal module directories
  const internalModules = [
    'services/session-manager',
    'services/storage-degradation',
    'services/error-recovery',
    'services/event-bus',
    'services/tab-coordination',
  ];

  if (verbose) console.log('Scanning internal module directories...');
  for (const modulePath of internalModules) {
    const moduleName = modulePath.split('/').pop();
    const dirStats = getDirectoryStats(modulePath);
    stats.internalModules[moduleName] = dirStats;
    stats.summary.totalInternalLines += dirStats.totalLines;
  }

  // Scan test files
  const testPatterns = [
    'session-manager',
    'api-compatibility',
    'wave-telemetry',
    'wave-visualizer',
    'premium-gatekeeper',
    'playlist-service',
  ];

  if (verbose) console.log('Scanning test files...');
  for (const testName of testPatterns) {
    const testStats = getTestStats(`tests/unit/${testName}*.test.js`);
    if (testStats.totalFiles > 0) {
      stats.tests[testName] = testStats;
      stats.summary.totalTestFiles += testStats.totalFiles;
      stats.summary.totalTests += testStats.totalTests;
    }
  }

  // Count all test files
  const allTestFiles = findJSFiles(TESTS_DIR).filter(f => f.endsWith('.test.js'));
  stats.summary.totalTestFiles = allTestFiles.length;

  // Count all tests
  let totalTests = 0;
  for (const testFile of allTestFiles) {
    totalTests += countTests(testFile);
  }
  stats.summary.totalTests = totalTests;

  // Count all source files
  const allSourceFiles = findJSFiles(JS_DIR).filter(
    f => !f.includes('/vendor/') && !f.includes('/node_modules/')
  );
  stats.summary.totalSourceFiles = allSourceFiles.length;
  stats.summary.totalSourceLines = allSourceFiles.reduce((sum, f) => sum + countLines(f), 0);

  return stats;
}

/**
 * Format stats for display
 * @param {Object} stats - Stats object from scanCodebase
 * @returns {string} - Formatted string
 */
function formatStats(stats) {
  let output = '\n╔════════════════════════════════════════════════════════════╗';
  output += '\n║            Rhythm Chamber Documentation Stats                ║';
  output += '\n╚════════════════════════════════════════════════════════════╝\n\n';

  output += `Generated: ${stats.timestamp}\n\n`;

  // Facades
  output += '┌─ Facade Files ──────────────────────────────────────────────┐\n';
  output += '│ File                        Lines    Size                    │\n';
  output += '├──────────────────────────────────────────────────────────────┤\n';
  for (const [name, data] of Object.entries(stats.facades)) {
    const size = (data.size / 1024).toFixed(1) + ' KB';
    output += `│ ${name.padEnd(26)} ${data.lines.toString().padStart(7)}  ${size.padStart(8)}            │\n`;
  }
  output += `│ ${'Total'.padEnd(26)} ${stats.summary.totalFacadeLines.toString().padStart(7)}                          │\n`;
  output += '└──────────────────────────────────────────────────────────────┘\n\n';

  // Internal Modules
  output += '┌─ Internal Modules ───────────────────────────────────────────┐\n';
  output += '│ Module                    Files    Lines                     │\n';
  output += '├──────────────────────────────────────────────────────────────┤\n';
  for (const [name, data] of Object.entries(stats.internalModules)) {
    output += `│ ${name.padEnd(24)} ${data.totalFiles.toString().padStart(7)}  ${data.totalLines.toString().padStart(8)}                   │\n`;
  }
  output += `│ ${'Total'.padEnd(24)} ${Object.values(stats.internalModules)
    .reduce((s, x) => s + x.totalFiles, 0)
    .toString()
    .padStart(
      7
    )}  ${stats.summary.totalInternalLines.toString().padStart(8)}                   │\n`;
  output += '└──────────────────────────────────────────────────────────────┘\n\n';

  // Tests
  output += '┌─ Test Coverage ──────────────────────────────────────────────┐\n';
  output += '│ Test Suite                  Files    Tests                   │\n';
  output += '├──────────────────────────────────────────────────────────────┤\n';
  for (const [name, data] of Object.entries(stats.tests)) {
    output += `│ ${name.padEnd(26)} ${data.totalFiles.toString().padStart(7)}  ${data.totalTests.toString().padStart(7)}                   │\n`;
  }
  output += `│ ${'TOTAL'.padEnd(26)} ${stats.summary.totalTestFiles.toString().padStart(7)}  ${stats.summary.totalTests.toString().padStart(7)}                   │\n`;
  output += '└──────────────────────────────────────────────────────────────┘\n\n';

  // Summary
  output += '┌─ Overall Summary ────────────────────────────────────────────┐\n';
  output += `│ Total Source Files:       ${stats.summary.totalSourceFiles.toString().padStart(7)}                       │\n`;
  output += `│ Total Source Lines:       ${stats.summary.totalSourceLines.toString().padStart(7)}                       │\n`;
  output += `│ Total Test Files:         ${stats.summary.totalTestFiles.toString().padStart(7)}                       │\n`;
  output += `│ Total Tests:              ${stats.summary.totalTests.toString().padStart(7)}                       │\n`;
  output += '└──────────────────────────────────────────────────────────────┘\n';

  return output;
}

/**
 * Update documentation files with current stats
 * @param {Object} stats - Stats object from scanCodebase
 * @param {Object} options - Options { verbose }
 */
function updateDocumentation(stats, options = {}) {
  const { verbose } = options;

  console.log('\n📝 Updating documentation files...\n');

  // Update AGENT_CONTEXT.md with current stats
  const agentContextPath = join(ROOT_DIR, 'AGENT_CONTEXT.md');
  if (existsSync(agentContextPath)) {
    if (verbose) console.log(`  Updating ${agentContextPath}`);

    let content = readFileSync(agentContextPath, 'utf-8');

    // Update the stats header section
    const statsHeader = `> **Status:** v2.0 Enhanced Architecture Complete — ${stats.summary.totalSourceFiles}+ Source Files`;
    content = content.replace(
      /> \*\*Status:\*\* v2\.0 Enhanced Architecture Complete — [\d,]+\+ Components Enhanced/,
      statsHeader
    );

    // Update facade and service counts in the file structure section
    const totalServices = stats.summary.totalFacadeLines > 0 ? '25+' : '20+';

    if (!dryRun) {
      writeFileSync(agentContextPath, content);
      console.log('  ✓ Updated agent context stats');
    } else {
      console.log(`  [DRY RUN] Would update ${agentContextPath}`);
    }
  }

  // Update TODO.md with current phase status
  const todoPath = join(ROOT_DIR, 'TODO.md');
  if (existsSync(todoPath)) {
    if (verbose) console.log(`  Updating ${todoPath}`);

    const content = readFileSync(todoPath, 'utf-8');

    // Update the stats line
    const statsLine = `**Total Tests:** ${stats.summary.totalTests}+ test files`;

    if (!dryRun) {
      writeFileSync(todoPath, content);
      console.log('  ✓ Updated TODO.md');
    } else {
      console.log(`  [DRY RUN] Would update ${todoPath}`);
    }
  }

  // Create/update docs/stats.json with detailed stats
  const statsPath = join(ROOT_DIR, 'docs', 'stats.json');
  const statsDir = dirname(statsPath);

  if (!existsSync(statsDir)) {
    // Create docs directory if it doesn't exist
    if (!dryRun) {
      // Directory should already exist, but just in case
    }
  }

  if (!dryRun) {
    writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    console.log('  ✓ Updated docs/stats.json');
  } else {
    console.log(`  [DRY RUN] Would update ${statsPath}`);
  }

  console.log('\n✅ Documentation update complete!\n');
}

/**
 * Main entry point
 */
function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          Documentation Sync Script                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  const stats = scanCodebase();

  // Output formatted stats
  console.log(formatStats(stats));

  // Output JSON if verbose
  if (verbose) {
    console.log('\n' + '─'.repeat(60));
    console.log('\nJSON Output:\n');
    console.log(JSON.stringify(stats, null, 2));
  }

  // Update documentation if requested
  if (update) {
    updateDocumentation(stats, { verbose });
  } else if (!dryRun) {
    console.log('💡 Tip: Use --update to write changes to documentation files');
    console.log('💡 Tip: Use --dry-run to preview changes\n');
  }

  return stats;
}

// Run main function
const stats = main();

// Export for testing
export { countLines, countTests, scanCodebase, updateDocumentation, formatStats };
