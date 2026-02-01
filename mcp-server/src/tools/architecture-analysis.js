/**
 * MCP Tool: analyze_architecture
 * Enhanced HNW architecture validation with actionable insights
 */

import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { globSync } from 'glob';
import { HNWAnalyzer } from '../analyzers/hnw-analyzer.js';
import { CacheManager } from '../cache/cache-manager.js';
import { logger } from '../utils/logger.js';
import { createPartialResponse, createErrorResponse } from '../errors/partial.js';

const cache = new CacheManager();

/**
 * Regex for parsing import statements (defined once for performance)
 * ReDoS protection: Non-backtracking pattern with iteration limit
 */
const IMPORT_REGEX = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;

/**
 * Tool schema definition
 */
export const schema = {
  name: 'analyze_architecture',
  description:
    'Enhanced HNW architecture validation with layer violation detection, circular dependency analysis, and actionable refactoring suggestions.',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        description:
          'File or directory to analyze. Paths are relative to project root. Examples: "js/services/event-bus.js" or { "filePath": "js/services/event-bus.js" } or { "directory": "js/services" }',
        oneOf: [
          {
            type: 'string',
            description: 'File path as string (e.g., "js/controllers/chat-ui-controller.js")',
          },
          {
            type: 'object',
            description:
              'Object with filePath or directory property for explicit type specification',
            properties: {
              filePath: {
                type: 'string',
                description: 'File path (e.g., "js/controllers/chat-ui-controller.js")',
              },
              directory: {
                type: 'string',
                description:
                  'Directory path to analyze all JS files within (e.g., "js/controllers")',
              },
            },
            additionalProperties: false,
          },
        ],
      },
      analysisType: {
        type: 'string',
        enum: ['comprehensive', 'layer-violations', 'circular-dependencies', 'compliance-score'],
        default: 'comprehensive',
        description: 'Type of architecture analysis',
      },
      includeSuggestions: {
        type: 'boolean',
        default: true,
        description: 'Include actionable refactoring suggestions',
      },
      severity: {
        type: 'string',
        enum: ['all', 'error', 'warning'],
        default: 'all',
        description: 'Filter by severity level',
      },
    },
    required: ['target'],
  },
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot) => {
  let { target } = args;
  const {
    analysisType = 'comprehensive',
    includeSuggestions = true,
    severity = 'all',
  } = args;

  logger.info('analyze_architecture called with:', {
    target,
    analysisType,
    includeSuggestions,
    severity,
  });

  // CRITICAL FIX: Handle case where target is a JSON string (user error or client bug)
  // Some clients may pass object parameters as JSON strings
  if (typeof target === 'string' && target.trim().startsWith('{')) {
    try {
      target = JSON.parse(target);
      logger.info('Parsed target from JSON string:', target);
    } catch (parseError) {
      throw new Error(
        `Invalid target format: If trying to use object format, ensure valid JSON. Error: ${parseError.message}`
      );
    }
  }

  try {
    // Determine target files
    let targetFiles = [];
    let targetPath;

    if (typeof target === 'string') {
      targetPath = resolve(projectRoot, target);
      if (!existsSync(targetPath)) {
        throw new Error(`Target not found: ${target}`);
      }
      targetFiles = [targetPath];
    } else if (target.filePath) {
      targetPath = resolve(projectRoot, target.filePath);
      if (!existsSync(targetPath)) {
        throw new Error(`File not found: ${target.filePath}`);
      }
      targetFiles = [targetPath];
    } else if (target.directory) {
      targetPath = resolve(projectRoot, target.directory);
      if (!existsSync(targetPath)) {
        throw new Error(`Directory not found: ${target.directory}`);
      }
      targetFiles = getFilesInDirectory(targetPath);
    }

    if (targetFiles.length === 0) {
      throw new Error('No files to analyze');
    }

    logger.info(`Found ${targetFiles.length} files to analyze:`, {
      target,
      targetPath,
      sampleFiles: targetFiles.slice(0, 5).map(f => f.replace(projectRoot + '/', '')),
    });

    logger.info(`Analyzing ${targetFiles.length} files for architecture issues`);

    // Perform analysis based on type
    let analysis;
    switch (analysisType) {
      case 'comprehensive':
        analysis = performComprehensiveAnalysis(targetFiles, projectRoot);
        break;
      case 'layer-violations':
        analysis = performLayerViolationAnalysis(targetFiles, projectRoot);
        break;
      case 'circular-dependencies':
        analysis = performCircularDependencyAnalysis(targetFiles, projectRoot);
        break;
      case 'compliance-score':
        analysis = performComplianceScoreAnalysis(targetFiles, projectRoot);
        break;
    }

    // Generate suggestions if requested
    if (includeSuggestions) {
      analysis.suggestions = generateRefactoringSuggestions(analysis);
    }

    // Format output
    const output = formatArchitectureAnalysis(analysis, analysisType);

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error) {
    logger.error('Error in analyze_architecture:', error);
    return createErrorResponse(error);
  }
};

/**
 * Get files in directory recursively
 */
function getFilesInDirectory(dir) {
  const patterns = [join(dir, '**/*.js'), '!**/node_modules/**', '!**/*.test.js', '!**/*.spec.js'];
  return globSync(patterns, { absolute: true });
}

/**
 * Perform comprehensive architecture analysis
 */
function performComprehensiveAnalysis(files, projectRoot) {
  const analyzer = new HNWAnalyzer(projectRoot);

  const analysis = {
    summary: {
      total_files: files.length,
      analyzed_files: 0,
      total_violations: 0,
      total_warnings: 0,
      compliance_score: 0,
    },
    violations: [],
    layerViolations: [],
    circularDependencies: [],
    metrics: {
      hierarchy_compliance: 0,
      network_compliance: 0,
      wave_compliance: 0,
    },
  };

  const importGraph = buildImportGraph(files, projectRoot);
  const fileLayers = {};

  for (const file of files) {
    try {
      const fileAnalysis = analyzer.analyzeFile(file);
      analysis.summary.analyzed_files++;
      analysis.summary.total_violations += fileAnalysis.compliance.violations.length;

      // Track file layer
      fileLayers[file.replace(projectRoot + '/', '')] = fileAnalysis.layer;

      // Collect violations
      for (const violation of fileAnalysis.compliance.violations) {
        analysis.violations.push({
          file: file.replace(projectRoot + '/', ''),
          layer: fileAnalysis.layer,
          ...violation,
        });

        if (violation.severity === 'error') {
          analysis.summary.total_violations++;
        } else {
          analysis.summary.total_warnings++;
        }
      }
    } catch (error) {
      logger.warn(`Analysis failed for ${file}:`, error);
    }
  }

  // Detect layer violations
  analysis.layerViolations = detectLayerViolations(importGraph, fileLayers, projectRoot);

  // Detect circular dependencies
  analysis.circularDependencies = detectCircularDependencies(importGraph, projectRoot);

  // Calculate metrics
  analysis.metrics.hierarchy_compliance = calculateHierarchyCompliance(
    analysis.layerViolations,
    files.length
  );
  analysis.metrics.network_compliance = calculateNetworkCompliance(analysis.violations);
  analysis.metrics.wave_compliance = calculateWaveCompliance(analysis.violations);

  // Calculate overall compliance score
  analysis.summary.compliance_score =
    (analysis.metrics.hierarchy_compliance +
      analysis.metrics.network_compliance +
      analysis.metrics.wave_compliance) /
    3;

  return analysis;
}

/**
 * Perform layer violation analysis
 */
function performLayerViolationAnalysis(files, projectRoot) {
  const analyzer = new HNWAnalyzer(projectRoot);
  const importGraph = buildImportGraph(files, projectRoot);
  const fileLayers = {};

  for (const file of files) {
    try {
      const fileAnalysis = analyzer.analyzeFile(file);
      fileLayers[file.replace(projectRoot + '/', '')] = fileAnalysis.layer;
    } catch (error) {
      logger.warn(`Layer detection failed for ${file}:`, error);
    }
  }

  const layerViolations = detectLayerViolations(importGraph, fileLayers, projectRoot);

  return {
    summary: {
      total_files: files.length,
      total_violations: layerViolations.length,
    },
    layerViolations,
    metrics: {
      hierarchy_compliance: calculateHierarchyCompliance(layerViolations, files.length),
    },
  };
}

/**
 * Perform circular dependency analysis
 */
function performCircularDependencyAnalysis(files, projectRoot) {
  const importGraph = buildImportGraph(files, projectRoot);
  const circularDeps = detectCircularDependencies(importGraph, projectRoot);

  return {
    summary: {
      total_files: files.length,
      total_cycles: circularDeps.length,
    },
    circularDependencies: circularDeps,
  };
}

/**
 * Perform compliance score analysis
 */
function performComplianceScoreAnalysis(files, projectRoot) {
  const analyzer = new HNWAnalyzer(projectRoot);

  const scores = {
    hierarchy: { score: 0, issues: 0 },
    network: { score: 0, issues: 0 },
    wave: { score: 0, issues: 0 },
  };

  for (const file of files) {
    try {
      const fileAnalysis = analyzer.analyzeFile(file);

      for (const violation of fileAnalysis.compliance.violations) {
        if (violation.category === 'hierarchy') {
          scores.hierarchy.issues++;
        } else if (violation.category === 'network') {
          scores.network.issues++;
        } else if (violation.category === 'wave') {
          scores.wave.issues++;
        }
      }
    } catch (error) {
      logger.warn(`Analysis failed for ${file}:`, error);
    }
  }

  // Calculate scores (0-100)
  scores.hierarchy.score = Math.max(0, 100 - scores.hierarchy.issues * 10);
  scores.network.score = Math.max(0, 100 - scores.network.issues * 10);
  scores.wave.score = Math.max(0, 100 - scores.wave.issues * 10);

  return {
    summary: {
      total_files: files.length,
      overall_score: (scores.hierarchy.score + scores.network.score + scores.wave.score) / 3,
    },
    scores,
  };
}

/**
 * Build import graph for circular dependency detection
 */
function buildImportGraph(files, projectRoot) {
  const graph = {};

  for (const file of files) {
    const relativePath = file.replace(projectRoot + '/', '');
    graph[relativePath] = [];

    try {
      const content = readFileSync(file, 'utf-8');

      // Reset regex lastIndex for new content (required for global regex)
      IMPORT_REGEX.lastIndex = 0;

      let match;
      let iterations = 0;
      const MAX_IMPORTS = 500; // ReDoS protection
      while ((match = IMPORT_REGEX.exec(content)) !== null && iterations < MAX_IMPORTS) {
        iterations++;
        const importPath = match[1];
        // Only skip node_modules, not path aliases
        if (
          !importPath.startsWith('.') &&
          !importPath.startsWith('/') &&
          !importPath.startsWith('@') &&
          !importPath.startsWith('#')
        ) {
          continue; // Skip node_modules (but not @/ or #/ aliases)
        }

        // Resolve relative path
        const importDir = relativePath.split('/').slice(0, -1).join('/');
        const resolvedPath = resolveImportPath(importPath, importDir, relativePath);

        if (resolvedPath && graph[resolvedPath] !== undefined) {
          graph[relativePath].push(resolvedPath);
        }
      }
    } catch (error) {
      logger.warn(`Failed to parse imports for ${file}:`, error);
    }
  }

  return graph;
}

/**
 * Resolve relative import path
 */
function resolveImportPath(importPath, importDir, currentFile) {
  if (!importPath.startsWith('.')) return null;

  const parts = importDir.split('/');
  const importParts = importPath.split('/');

  for (const part of importParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }

  return parts.join('/') + '.js';
}

/**
 * Detect layer violations (HNW Hierarchy)
 */
function detectLayerViolations(importGraph, fileLayers, projectRoot) {
  const violations = [];

  const layerOrder = ['controllers', 'services', 'providers', 'utils', 'storage'];

  for (const [fromFile, imports] of Object.entries(importGraph)) {
    const fromLayer = fileLayers[fromFile];
    if (!fromLayer) continue;

    for (const toFile of imports) {
      const toLayer = fileLayers[toFile];
      if (!toLayer) continue;

      const fromIndex = layerOrder.indexOf(fromLayer);
      const toIndex = layerOrder.indexOf(toLayer);

      // Check if violates hierarchy (higher layer importing from lower layer)
      if (fromIndex < toIndex && fromIndex !== -1 && toIndex !== -1) {
        violations.push({
          from: fromFile,
          to: toFile,
          from_layer: fromLayer,
          to_layer: toLayer,
          severity: 'error',
          message: `${fromLayer} should not import from ${toLayer}`,
          recommendation: `Move ${toFile} logic up to ${fromLayer} or create a service in ${fromLayer}`,
        });
      }
    }
  }

  return violations;
}

/**
 * Detect circular dependencies using DFS
 */
function detectCircularDependencies(importGraph, projectRoot) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(node, path = []) {
    if (recursionStack.has(node)) {
      // Found cycle
      const cycleStart = path.indexOf(node);
      const cycle = [...path.slice(cycleStart), node];
      cycles.push({
        files: cycle,
        length: cycle.length,
        severity: cycle.length <= 3 ? 'error' : 'warning',
      });
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    recursionStack.add(node);

    const imports = importGraph[node] || [];
    for (const imp of imports) {
      dfs(imp, [...path, node]);
    }

    recursionStack.delete(node);
  }

  for (const node of Object.keys(importGraph)) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Calculate hierarchy compliance score
 */
function calculateHierarchyCompliance(violations, totalFiles) {
  if (totalFiles === 0) return 100;
  const violationRatio = violations.length / totalFiles;
  return Math.max(0, 100 - violationRatio * 100);
}

/**
 * Calculate network compliance score
 */
function calculateNetworkCompliance(violations) {
  const networkViolations = violations.filter(v => v.category === 'network');
  return Math.max(0, 100 - networkViolations.length * 15);
}

/**
 * Calculate wave compliance score
 */
function calculateWaveCompliance(violations) {
  const waveViolations = violations.filter(v => v.category === 'wave');
  return Math.max(0, 100 - waveViolations.length * 20);
}

/**
 * Generate refactoring suggestions
 */
function generateRefactoringSuggestions(analysis) {
  const suggestions = [];

  // Hierarchy violations
  if (analysis.layerViolations && analysis.layerViolations.length > 0) {
    suggestions.push({
      priority: 'HIGH',
      category: 'Hierarchy',
      message: `Fix ${analysis.layerViolations.length} layer violation(s)`,
      actions: analysis.layerViolations.slice(0, 3).map(v => v.recommendation),
    });
  }

  // Circular dependencies
  if (analysis.circularDependencies && analysis.circularDependencies.length > 0) {
    suggestions.push({
      priority: 'HIGH',
      category: 'Circular Dependencies',
      message: `Break ${analysis.circularDependencies.length} circular dependency cycle(s)`,
      actions: analysis.circularDependencies.map(c => `Review cycle: ${c.files.join(' → ')}`),
    });
  }

  // Low compliance
  if (analysis.summary.compliance_score < 70) {
    suggestions.push({
      priority: 'MEDIUM',
      category: 'Overall Compliance',
      message: `Improve compliance score (${analysis.summary.compliance_score.toFixed(0)}/100)`,
      actions: [
        'Review HNW architecture patterns',
        'Ensure Controllers → Services → Providers chain',
        'Use EventBus for cross-module communication',
      ],
    });
  }

  return suggestions;
}

/**
 * Format architecture analysis output
 */
function formatArchitectureAnalysis(analysis, analysisType) {
  const lines = [];

  lines.push(`# Architecture Analysis: ${analysisType.toUpperCase()}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`**Files Analyzed**: ${analysis.summary.total_files}`);
  if (analysis.summary.analyzed_files !== undefined) {
    lines.push(`**Successfully Analyzed**: ${analysis.summary.analyzed_files}`);
  }
  if (analysis.summary.total_violations !== undefined) {
    lines.push(`**Total Violations**: ${analysis.summary.total_violations}`);
  }
  if (analysis.summary.total_warnings !== undefined) {
    lines.push(`**Warnings**: ${analysis.summary.total_warnings}`);
  }
  if (analysis.summary.compliance_score !== undefined) {
    const score = analysis.summary.compliance_score;
    const emoji = score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌';
    lines.push(`**Compliance Score**: ${emoji} ${score.toFixed(0)}/100`);
  }
  if (analysis.summary.total_cycles !== undefined) {
    lines.push(`**Circular Dependencies**: ${analysis.summary.total_cycles}`);
  }
  lines.push('');

  // Metrics
  if (analysis.metrics) {
    lines.push('## HNW Compliance Metrics');
    lines.push('');
    lines.push(`**Hierarchy**: ${analysis.metrics.hierarchy_compliance.toFixed(0)}/100`);
    if (analysis.metrics.network_compliance !== undefined) {
      lines.push(`**Network**: ${analysis.metrics.network_compliance.toFixed(0)}/100`);
    }
    if (analysis.metrics.wave_compliance !== undefined) {
      lines.push(`**Wave**: ${analysis.metrics.wave_compliance.toFixed(0)}/100`);
    }
    lines.push('');
  }

  // Scores
  if (analysis.scores) {
    lines.push('## Compliance Scores');
    lines.push('');
    lines.push(
      `**Hierarchy**: ${analysis.scores.hierarchy.score.toFixed(0)}/100 (${analysis.scores.hierarchy.issues} issues)`
    );
    lines.push(
      `**Network**: ${analysis.scores.network.score.toFixed(0)}/100 (${analysis.scores.network.issues} issues)`
    );
    lines.push(
      `**Wave**: ${analysis.scores.wave.score.toFixed(0)}/100 (${analysis.scores.wave.issues} issues)`
    );
    lines.push('');
  }

  // Layer Violations
  if (analysis.layerViolations && analysis.layerViolations.length > 0) {
    lines.push('## Layer Violations (HNW Hierarchy)');
    lines.push('');
    for (const violation of analysis.layerViolations.slice(0, 10)) {
      const icon = violation.severity === 'error' ? '❌' : '⚠️';
      lines.push(`${icon} **${violation.from}** → **${violation.to}**`);
      lines.push(`   ${violation.message}`);
      lines.push(`   💡 ${violation.recommendation}`);
      lines.push('');
    }
    if (analysis.layerViolations.length > 10) {
      lines.push(`... and ${analysis.layerViolations.length - 10} more violations`);
      lines.push('');
    }
  }

  // Circular Dependencies
  if (analysis.circularDependencies && analysis.circularDependencies.length > 0) {
    lines.push('## Circular Dependencies');
    lines.push('');
    for (const cycle of analysis.circularDependencies) {
      const icon = cycle.severity === 'error' ? '🔴' : '🟡';
      lines.push(`${icon} Cycle (${cycle.length} files)`);
      lines.push(`   ${cycle.files.join(' → ')}`);
      lines.push('');
    }
  }

  // Violations with enhanced "why" traces
  if (analysis.violations && analysis.violations.length > 0) {
    lines.push('## HNW Architecture Violations');
    lines.push('');

    // Group by rule for better organization
    const byRule = {};
    for (const v of analysis.violations) {
      const ruleId = v.ruleId || v.rule || 'unknown';
      if (!byRule[ruleId]) byRule[ruleId] = [];
      byRule[ruleId].push(v);
    }

    for (const [ruleId, violations] of Object.entries(byRule)) {
      const firstViolation = violations[0];

      // Show rule info
      lines.push(`### ${firstViolation.ruleId || firstViolation.rule}`);
      if (firstViolation.title) {
        lines.push(`**${firstViolation.title}**`);
      }
      lines.push('');

      // Show "why" for first violation of this rule
      if (firstViolation.why) {
        lines.push(`**Why this matters:** ${firstViolation.why}`);
        lines.push('');
      }

      // Show impact and confidence
      const impactBadge =
        firstViolation.impact === 'CRITICAL'
          ? '🔴'
          : firstViolation.impact === 'HIGH'
            ? '🟠'
            : firstViolation.impact === 'MEDIUM'
              ? '🟡'
              : '🟢';
      const confBadge =
        firstViolation.confidence === 'HIGH'
          ? '💪'
          : firstViolation.confidence === 'MEDIUM'
            ? '👍'
            : '❓';
      lines.push(
        `**Impact:** ${impactBadge} ${firstViolation.impact || 'N/A'} | **Confidence:** ${confBadge} ${firstViolation.confidence || 'N/A'}`
      );
      lines.push('');

      // Show violations for this rule
      for (const violation of violations.slice(0, 10)) {
        const icon = violation.severity === 'error' ? '❌' : '⚠️';
        lines.push(
          `${icon} **${violation.file}${violation.evidence?.line ? ':' + violation.evidence.line : ''}**`
        );

        if (violation.message) {
          lines.push(`   ${violation.message}`);
        }

        if (violation.import) {
          lines.push(`   Import: \`${violation.import}\` → ${violation.targetLayer || 'unknown'}`);
        }

        // Show evidence snippet
        if (violation.evidence?.snippet) {
          lines.push('   **Evidence:**');
          lines.push('   ```javascript');
          for (const evidenceLine of violation.evidence.snippet.split('\n').slice(0, 5)) {
            lines.push(`   ${evidenceLine}`);
          }
          if (violation.evidence.total > 5) {
            lines.push(`   ... (${violation.evidence.total} total imports)`);
          }
          lines.push('   ```');
        }

        // Show suggested fix
        if (violation.suggestedFix || violation.recommendation) {
          const fix = violation.suggestedFix || violation.recommendation;
          lines.push(`   💡 **Fix:** ${fix}`);
        }

        lines.push('');
      }

      if (violations.length > 10) {
        lines.push(`... and ${violations.length - 10} more violations of ${ruleId}`);
        lines.push('');
      }
    }

    const totalShown = Object.values(byRule).reduce((sum, v) => sum + Math.min(v.length, 10), 0);
    const totalViolations = analysis.violations.length;
    if (totalShown < totalViolations) {
      lines.push(`... showing ${totalShown} of ${totalViolations} total violations`);
      lines.push('');
    }
  }

  // Suggestions
  if (analysis.suggestions && analysis.suggestions.length > 0) {
    lines.push('## Refactoring Suggestions');
    lines.push('');
    for (const suggestion of analysis.suggestions) {
      lines.push(`### ${suggestion.priority} Priority: ${suggestion.category}`);
      lines.push('');
      lines.push(suggestion.message);
      lines.push('');
      lines.push('**Actions:**');
      for (const action of suggestion.actions) {
        lines.push(`- ${action}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
