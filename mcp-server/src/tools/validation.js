/**
 * MCP Tool: validate_hnw_compliance
 * Validate codebase adherence to HNW architecture principles
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { HNWAnalyzer } from '../analyzers/hnw-analyzer.js';
import { FileScanner } from '../utils/file-scanner.js';
import { logger } from '../utils/logger.js';

let fileScanner = null;
let analyzerCache = null;

export const schema = {
  name: 'validate_hnw_compliance',
  description:
    'Validate codebase compliance with HNW (Hierarchical Network Wave) architecture patterns',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description:
          'Specific file to validate (optional - validates entire codebase if not provided)',
      },
      checkViolations: {
        type: 'boolean',
        default: true,
        description: 'Check for architecture violations',
      },
      generateReport: {
        type: 'boolean',
        default: true,
        description: 'Generate detailed compliance report',
      },
      layer: {
        type: 'string',
        enum: ['controllers', 'services', 'utils', 'storage', 'providers', 'all'],
        default: 'all',
        description: 'Specific layer to validate (optional)',
      },
    },
  },
};

export const handler = async (args, projectRoot) => {
  const { filePath, checkViolations = true, generateReport = true, layer = 'all' } = args;

  // Initialize file scanner and analyzer
  if (!fileScanner || fileScanner.projectRoot !== projectRoot) {
    fileScanner = new FileScanner(projectRoot);
  }
  if (!analyzerCache || analyzerCache.projectRoot !== projectRoot) {
    analyzerCache = new HNWAnalyzer(projectRoot);
  }

  logger.info('validate_hnw_compliance called with:', {
    filePath,
    checkViolations,
    generateReport,
    layer,
  });

  try {
    // Perform validation
    const results = await validateHNWCompliance(
      projectRoot,
      filePath,
      checkViolations,
      generateReport,
      layer
    );

    // Format results
    const output = formatComplianceReport(results);

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error) {
    logger.error('Error in validate_hnw_compliance:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error validating HNW compliance: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
};

/**
 * Validate HNW compliance across codebase or specific file
 */
async function validateHNWCompliance(
  projectRoot,
  filePath,
  checkViolations,
  generateReport,
  layer
) {
  const results = {
    summary: {
      totalFiles: 0,
      validatedFiles: 0,
      compliantFiles: 0,
      nonCompliantFiles: 0,
      averageScore: 0,
      totalViolations: 0,
      layers: {},
    },
    violations: [],
    recommendations: [],
    layerAnalysis: {},
    criticalIssues: [],
  };

  // Get files to validate
  const filesToValidate = [];

  if (filePath) {
    // Validate specific file
    const fullPath = resolve(projectRoot, filePath);
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    filesToValidate.push(fullPath);
  } else {
    // Validate all JavaScript files
    const jsFiles = await fileScanner.findJsFiles({
      includeTests: false,
      includeNodeModules: false,
      includeDist: false,
    });

    // Filter by layer if specified
    for (const file of jsFiles) {
      if (layer === 'all' || fileScanner.getFileLayer(file) === layer) {
        filesToValidate.push(file);
      }
    }
  }

  results.summary.totalFiles = filesToValidate.length;

  // Validate each file
  let totalScore = 0;

  for (const filePath of filesToValidate) {
    const relativePath = fileScanner.getRelativePath(filePath);
    const fileLayer = fileScanner.getFileLayer(filePath);

    try {
      const analysis = analyzerCache.analyzeFile(filePath);

      // Update layer stats
      if (!results.layerAnalysis[fileLayer]) {
        results.layerAnalysis[fileLayer] = {
          count: 0,
          totalScore: 0,
          violations: [],
        };
      }

      results.layerAnalysis[fileLayer].count++;
      results.layerAnalysis[fileLayer].totalScore += analysis.compliance.score;

      // Track violations
      if (analysis.compliance.violations.length > 0) {
        results.summary.nonCompliantFiles++;
        results.summary.totalViolations += analysis.compliance.violations.length;

        for (const violation of analysis.compliance.violations) {
          results.violations.push({
            file: relativePath,
            layer: fileLayer,
            ...violation,
          });

          results.layerAnalysis[fileLayer].violations.push({
            file: relativePath,
            ...violation,
          });

          // Track critical issues
          if (violation.severity === 'error') {
            results.criticalIssues.push({
              file: relativePath,
              layer: fileLayer,
              rule: violation.rule,
              message: violation.message,
            });
          }
        }
      } else {
        results.summary.compliantFiles++;
      }

      results.summary.validatedFiles++;
      totalScore += analysis.compliance.score;
    } catch (error) {
      logger.warn(`Failed to validate ${relativePath}:`, error.message);
    }
  }

  // Calculate average score
  if (results.summary.validatedFiles > 0) {
    results.summary.averageScore = Math.round(totalScore / results.summary.validatedFiles);
  }

  // Generate recommendations
  results.recommendations = generateRecommendations(results);

  return results;
}

/**
 * Generate recommendations based on validation results
 */
function generateRecommendations(results) {
  const recommendations = [];

  // Check for critical issues
  if (results.criticalIssues.length > 0) {
    recommendations.push({
      priority: 'CRITICAL',
      title: `Fix ${results.criticalIssues.length} Critical Architecture Violations`,
      description:
        'Critical violations indicate严重的架构违规 that could lead to runtime errors or maintenance issues.',
      actions: [
        'Review all files with error-level violations',
        'Fix layer bypassing issues (Controllers calling Providers directly)',
        'Resolve circular dependencies',
        'Ensure proper use of EventBus for cross-module communication',
      ],
    });
  }

  // Check layer-specific issues
  for (const [layerName, analysis] of Object.entries(results.layerAnalysis)) {
    const avgScore = analysis.count > 0 ? Math.round(analysis.totalScore / analysis.count) : 100;

    if (avgScore < 70) {
      recommendations.push({
        priority: 'HIGH',
        title: `Improve ${layerName} Layer Compliance (avg: ${avgScore}/100)`,
        description: `The ${layerName} layer has ${analysis.violations.length} violations across ${analysis.count} files.`,
        actions: [
          'Review common violation patterns in this layer',
          'Update coding standards documentation',
          'Add layer-specific validation to pre-commit hooks',
        ],
      });
    }
  }

  // Check for specific violation patterns
  const violationPatterns = analyzeViolationPatterns(results.violations);

  if (violationPatterns.providerBypass > 0) {
    recommendations.push({
      priority: 'HIGH',
      title: `Eliminate Direct Provider Usage (${violationPatterns.providerBypass} occurrences)`,
      description:
        'Controllers or Services are importing Providers directly, bypassing the proper abstraction layer.',
      actions: [
        'Refactor to use Service layer for Provider access',
        'Update module dependencies to follow HNW hierarchy',
        'Add dependency validation to CI/CD pipeline',
      ],
    });
  }

  if (violationPatterns.circularDeps > 0) {
    recommendations.push({
      priority: 'CRITICAL',
      title: `Resolve Circular Dependencies (${violationPatterns.circularDeps} detected)`,
      description:
        'Circular dependencies prevent proper module initialization and can cause runtime errors.',
      actions: [
        'Extract shared functionality into separate modules',
        'Use dependency injection to break cycles',
        'Reorganize module structure to follow HNW hierarchy',
        'Add circular dependency detection to pre-commit hooks',
      ],
    });
  }

  if (violationPatterns.missingEventBus > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      title: `Increase EventBus Usage (${violationPatterns.missingEventBus} opportunities)`,
      description: 'Some modules could benefit from using EventBus instead of direct dependencies.',
      actions: [
        'Identify tight coupling between modules',
        'Refactor to use EventBus for cross-module communication',
        'Implement domain filtering for event handlers',
      ],
    });
  }

  // General recommendations
  if (results.summary.averageScore < 80) {
    recommendations.push({
      priority: 'MEDIUM',
      title: 'Improve Overall HNW Compliance',
      description: `Codebase average score is ${results.summary.averageScore}/100. Target: 90+`,
      actions: [
        'Schedule architecture review meeting',
        'Create HNW compliance checklist for developers',
        'Add automated validation to development workflow',
        'Document common anti-patterns to avoid',
      ],
    });
  }

  return recommendations;
}

/**
 * Analyze violation patterns to generate targeted recommendations
 */
function analyzeViolationPatterns(violations) {
  const patterns = {
    providerBypass: 0,
    circularDeps: 0,
    missingEventBus: 0,
    layerViolation: 0,
  };

  for (const violation of violations) {
    const rule = violation.rule.toLowerCase();

    if (rule.includes('provider') || rule.includes('bypass')) {
      patterns.providerBypass++;
    }
    if (rule.includes('circular') || rule.includes('cycle')) {
      patterns.circularDeps++;
    }
    if (rule.includes('eventbus') || rule.includes('event bus')) {
      patterns.missingEventBus++;
    }
    if (rule.includes('layer') || rule.includes('hierarchy')) {
      patterns.layerViolation++;
    }
  }

  return patterns;
}

/**
 * Format compliance report
 */
function formatComplianceReport(results) {
  const lines = [];

  lines.push('# HNW Architecture Compliance Report');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`**Overall Compliance Score**: ${results.summary.averageScore}/100`);
  lines.push(`**Files Validated**: ${results.summary.validatedFiles}`);
  lines.push(`**Compliant Files**: ${results.summary.compliantFiles} ✅`);
  lines.push(`**Non-Compliant Files**: ${results.summary.nonCompliantFiles} ❌`);
  lines.push(`**Total Violations**: ${results.summary.totalViolations}`);
  lines.push('');

  // Compliance grade
  const grade = getComplianceGrade(results.summary.averageScore);
  lines.push(`**Overall Grade**: ${grade.icon} ${grade.label} (${grade.description})`);
  lines.push('');

  // Critical issues
  if (results.criticalIssues.length > 0) {
    lines.push('## 🚨 Critical Issues');
    lines.push('');
    lines.push(
      `Found ${results.criticalIssues.length} critical architecture violations requiring immediate attention:`
    );
    lines.push('');

    for (const issue of results.criticalIssues.slice(0, 20)) {
      lines.push(`### ${issue.file}`);
      lines.push('');
      lines.push(`- **Layer**: ${issue.layer}`);
      lines.push(`- **Rule**: ${issue.rule}`);
      lines.push(`- **Issue**: ${issue.message}`);
      lines.push('');
    }

    if (results.criticalIssues.length > 20) {
      lines.push(`*... and ${results.criticalIssues.length - 20} more critical issues*`);
      lines.push('');
    }
  }

  // Layer analysis
  if (Object.keys(results.layerAnalysis).length > 0) {
    lines.push('## Compliance by Layer');
    lines.push('');

    for (const [layerName, analysis] of Object.entries(results.layerAnalysis)) {
      const avgScore = analysis.count > 0 ? Math.round(analysis.totalScore / analysis.count) : 100;
      const grade = getComplianceGrade(avgScore);

      lines.push(`### ${layerName}`);
      lines.push('');
      lines.push(`- **Files**: ${analysis.count}`);
      lines.push(`- **Average Score**: ${avgScore}/100`);
      lines.push(`- **Grade**: ${grade.icon} ${grade.label}`);
      lines.push(`- **Violations**: ${analysis.violations.length}`);

      if (analysis.violations.length > 0 && analysis.violations.length <= 5) {
        lines.push('- **Top Issues**:');
        for (const violation of analysis.violations.slice(0, 5)) {
          const icon = violation.severity === 'error' ? '❌' : '⚠️';
          lines.push(`  - ${icon} \`${violation.file}\`: ${violation.rule}`);
        }
      }

      lines.push('');
    }
  }

  // All violations (if requested)
  if (results.violations.length > 0) {
    lines.push('## All Violations');
    lines.push('');

    // Group by rule
    const violationsByRule = {};
    for (const violation of results.violations) {
      if (!violationsByRule[violation.rule]) {
        violationsByRule[violation.rule] = [];
      }
      violationsByRule[violation.rule].push(violation);
    }

    for (const [rule, violations] of Object.entries(violationsByRule)) {
      lines.push(`### ${rule}`);
      lines.push('');
      lines.push(`**Occurrences**: ${violations.length}`);
      lines.push('');

      for (const violation of violations.slice(0, 10)) {
        const icon = violation.severity === 'error' ? '❌' : '⚠️';
        lines.push(`${icon} \`${violation.file}\` (${violation.layer}): ${violation.message}`);
      }

      if (violations.length > 10) {
        lines.push(`*... and ${violations.length - 10} more*`);
      }

      lines.push('');
    }
  }

  // Recommendations
  if (results.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');

    // Sort by priority
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    results.recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    for (const rec of results.recommendations) {
      const priorityIcon =
        rec.priority === 'CRITICAL' ? '🔴' : rec.priority === 'HIGH' ? '🟠' : '🟡';
      lines.push(`### ${priorityIcon} ${rec.title}`);
      lines.push('');
      lines.push(rec.description);
      lines.push('');
      lines.push('**Actions:**');
      for (const action of rec.actions) {
        lines.push(`- ${action}`);
      }
      lines.push('');
    }
  }

  // HNW Pattern Reference
  lines.push('## HNW Architecture Reference');
  lines.push('');
  lines.push('### Hierarchy: Controllers → Services → Providers');
  lines.push('- ✅ Controllers call Services, not Providers directly');
  lines.push('- ✅ Services use Provider abstraction layer');
  lines.push('- ✅ No circular dependencies');
  lines.push('- ❌ Never bypass abstraction layers');
  lines.push('');

  lines.push('### Network: EventBus for Cross-Module Communication');
  lines.push('- ✅ Use EventBus for loose coupling');
  lines.push('- ✅ Implement domain filtering for event handlers');
  lines.push('- ✅ Use priority dispatch for important events');
  lines.push('- ❌ Avoid tight coupling between modules');
  lines.push('');

  lines.push('### Wave: TabCoordinator for Cross-Tab Coordination');
  lines.push('- ✅ Check primary tab status before writes');
  lines.push('- ✅ Use write-ahead log for crash recovery');
  lines.push('- ✅ Single writer pattern for data integrity');
  lines.push('- ❌ Never write directly from non-primary tabs');
  lines.push('');

  // OOM FIX #3: Detect and prevent large joins that cause heap crashes
  // The crash: ArrayPrototypeJoin with 4000+ violations causes OOM at 4GB
  const MAX_JOIN_BYTES = 1_000_000; // 1MB threshold for safe join
  const MAX_JOIN_LINES = 10000; // Fallback line count limit

  const arrayLength = lines.length;
  console.error(`[Validation] Pre-join check: ${arrayLength} lines in output array`);

  if (arrayLength > MAX_JOIN_LINES) {
    console.error(
      `[Validation] ⚠️  Line count (${arrayLength}) exceeds limit (${MAX_JOIN_LINES}), truncating output`
    );
    lines.length = MAX_JOIN_LINES;
    lines.push('');
    lines.push(`... (output truncated: ${arrayLength - MAX_JOIN_LINES} additional lines omitted)`);
    lines.push('');
  }

  // Sample first 100 lines to estimate total size
  const SAMPLE_SIZE = Math.min(100, lines.length);
  let sampleBytes = 0;
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    sampleBytes += Buffer.byteLength(lines[i], 'utf8') + 1; // +1 for newline
  }
  const avgLineBytes = sampleBytes / SAMPLE_SIZE;
  const projectedBytes = lines.length * (avgLineBytes + 1);

  console.error(
    `[Validation] Projected output size: ${(projectedBytes / 1024).toFixed(1)}KB ` +
    `(avg line: ${avgLineBytes.toFixed(0)} bytes, ${lines.length} lines)`
  );

  if (projectedBytes > MAX_JOIN_BYTES) {
    const maxSafeLines = Math.floor(MAX_JOIN_BYTES / (avgLineBytes + 1));
    console.error(
      `[Validation] ⚠️  Projected size (${(projectedBytes / 1024).toFixed(1)}KB) exceeds threshold ` +
      `(${(MAX_JOIN_BYTES / 1024).toFixed(1)}KB), truncating to ${maxSafeLines} lines`
    );
    lines.length = maxSafeLines;
    lines.push('');
    lines.push(`... (output truncated to prevent OOM: ${arrayLength - maxSafeLines} lines omitted)`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get compliance grade from score
 */
function getComplianceGrade(score) {
  if (score >= 90) {
    return {
      icon: '🏆',
      label: 'Excellent',
      description: 'Strong HNW architecture compliance',
    };
  }
  if (score >= 80) {
    return {
      icon: '✅',
      label: 'Good',
      description: 'Acceptable compliance with minor issues',
    };
  }
  if (score >= 70) {
    return {
      icon: '⚠️',
      label: 'Fair',
      description: 'Moderate compliance - improvements needed',
    };
  }
  if (score >= 50) {
    return {
      icon: '🔶',
      label: 'Poor',
      description: 'Low compliance - significant issues',
    };
  }
  return {
    icon: '❌',
    label: 'Critical',
    description: 'Fails HNW architecture standards',
  };
}
