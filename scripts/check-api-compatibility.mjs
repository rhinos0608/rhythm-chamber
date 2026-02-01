#!/usr/bin/env node
/**
 * API Compatibility Checker
 *
 * This script checks for breaking API changes by comparing the current
 * exports against a baseline. It should be run in CI/CD to catch
 * accidental breaking changes during refactoring.
 *
 * Usage: node scripts/check-api-compatibility.mjs
 *
 * @module scripts/check-api-compatibility
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Baseline API signatures (should be updated when intentional breaking changes are made)
const BASELINE_APIS = {
  ErrorRecoveryCoordinator: {
    file: './js/services/error-recovery-coordinator.js',
    methods: [
      'coordinateRecovery',
      'getTelemetry',
      'getState',
      'getActiveRecoveries',
      'cancelRecovery',
      'cleanup',
    ],
  },
  StorageDegradationManager: {
    file: './js/services/storage-degradation-manager.js',
    methods: [
      'getCurrentTier',
      'getCurrentMetrics',
      'checkQuotaNow',
      'stopQuotaMonitoring',
      'isReadOnlyMode',
      'isEmergencyMode',
      'setAutoCleanupEnabled',
      'triggerCleanup',
      'triggerEmergencyCleanup',
      'exportStorageData',
      'clearAllData',
      'isEmbeddingFrozen',
      'shouldBlockOperation',
      'getStorageBreakdown',
    ],
  },
  SessionManager: {
    file: './js/services/session-manager.js',
    methods: [
      'initialize',
      'createSession',
      'deleteSession',
      'clearAllSessions',
      'getAllSessions',
      'loadSession',
      'renameSession',
      'switchSession',
    ],
    notes:
      'Breaking changes from previous version: init->initialize, createNewSession->createSession, etc.',
  },
  PatternWorkerPool: {
    file: './js/workers/pattern-worker-pool.js',
    methods: [
      'init',
      'detectAllPatterns',
      'terminate',
      'getStatus',
      'resize',
      'getSpeedupFactor',
      'isPaused',
      'onBackpressure',
      'onResultConsumed',
      'getMemoryConfig',
      'partitionData',
    ],
    constants: ['PATTERN_GROUPS', 'SHARED_MEMORY_AVAILABLE'],
  },
};

// Known breaking changes (documented intentional changes)
const DOCUMENTED_BREAKING_CHANGES = {
  SessionManager: {
    'init()': 'initialize() - Breaking change: renamed for consistency',
    'createNewSession()': 'createSession() - Breaking change: renamed for consistency',
    'deleteSessionById()': 'deleteSession() - Breaking change: renamed for consistency',
    'clearConversation()': 'clearAllSessions() - Breaking change: renamed for consistency',
    'listSessions()': 'getAllSessions() - Breaking change: renamed for consistency',
    'setUserContext()': 'Removed - No longer needed',
    'saveConversation()': 'Removed - Use different persistence approach',
    'flushPendingSaveAsync()': 'Removed - Use different persistence approach',
    'emergencyBackupSync()': 'Removed - Use different persistence approach',
    'recoverEmergencyBackup()': 'Removed - Use different persistence approach',
  },
};

/**
 * Extract exported methods from a file using regex
 * Note: This is a simple heuristic, not a full parser
 */
function extractExports(filePath) {
  const content = readFileSync(resolve(__dirname, '..', filePath), 'utf-8');

  // Find class definitions and their methods
  const classRegex = /export\s+class\s+(\w+)\s*{([^}]+)}/gs;
  const exports = { methods: [], constants: [] };

  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1];
    const classBody = match[2];

    // Extract method names
    const methodRegex = /(?:async\s+)?(\w+)\s*\(/g;
    let methodMatch;
    while ((methodMatch = methodRegex.exec(classBody)) !== null) {
      const methodName = methodMatch[1];
      // Skip private methods
      if (!methodName.startsWith('_')) {
        exports.methods.push(methodName);
      }
    }
  }

  // Find named function exports
  const functionRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
  while ((match = functionRegex.exec(content)) !== null) {
    exports.methods.push(match[1]);
  }

  // Find exported constants
  const constRegex = /export\s+const\s+(\w+)/g;
  while ((match = constRegex.exec(content)) !== null) {
    exports.constants.push(match[1]);
  }

  return exports;
}

/**
 * Check if a method removal is documented
 */
function isDocumentedBreakingChange(className, methodName) {
  const changes = DOCUMENTED_BREAKING_CHANGES[className];
  if (!changes) return false;

  for (const key of Object.keys(changes)) {
    if (key.includes(methodName) || key.startsWith(methodName)) {
      return true;
    }
  }
  return false;
}

/**
 * Main check function
 */
function checkApiCompatibility() {
  const errors = [];
  const warnings = [];

  console.log('🔍 Checking API compatibility...\n');

  for (const [className, config] of Object.entries(BASELINE_APIS)) {
    console.log(`Checking ${className}...`);

    const currentExports = extractExports(config.file);
    const baselineMethods = config.methods || [];
    const baselineConstants = config.constants || [];

    // Check for missing methods
    for (const method of baselineMethods) {
      if (!currentExports.methods.includes(method)) {
        if (isDocumentedBreakingChange(className, method)) {
          warnings.push(
            `${className}: Method '${method}' was removed (documented breaking change)`
          );
        } else {
          errors.push(`${className}: Method '${method}' is missing!`);
        }
      }
    }

    // Check for missing constants
    for (const constant of baselineConstants) {
      if (!currentExports.constants.includes(constant)) {
        errors.push(`${className}: Constant '${constant}' is missing!`);
      }
    }

    // Check for new methods (informational)
    const newMethods = currentExports.methods.filter(m => !baselineMethods.includes(m));
    if (newMethods.length > 0) {
      console.log(`  ✨ New methods: ${newMethods.join(', ')}`);
    }

    console.log(
      `  ✅ Found ${currentExports.methods.length} methods, ${currentExports.constants.length} constants\n`
    );
  }

  // Print warnings
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }

  // Print errors
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const error of errors) {
      console.log(`  - ${error}`);
    }
    console.log('\n💡 To fix these issues:');
    console.log('  1. Restore missing methods for backward compatibility, OR');
    console.log('  2. Document the breaking change in DOCUMENTED_BREAKING_CHANGES, OR');
    console.log('  3. Update BASELINE_APIS if this is an intentional API evolution\n');
    process.exit(1);
  }

  console.log('✅ API compatibility check passed!\n');

  // Optionally update baseline with current exports
  if (process.argv.includes('--update-baseline')) {
    console.log('📝 Updating baseline...');
    // This would update the BASELINE_APIS constant
    console.log('⚠️  Manual update required - please update BASELINE_APIS in this script');
  }
}

// Run the check
checkApiCompatibility();
