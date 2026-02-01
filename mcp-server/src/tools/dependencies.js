/**
 * MCP Tool: find_dependencies
 * Find and analyze dependency relationships between modules
 */

import { resolve, dirname, join, relative } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { HNWAnalyzer } from '../analyzers/hnw-analyzer.js';
import { FileScanner } from '../utils/file-scanner.js';
import { logger } from '../utils/logger.js';

const analyzerCache = new Map();
let fileScanner = null;

export const schema = {
  name: 'find_dependencies',
  description: 'Find and analyze dependency relationships between modules',
  inputSchema: {
    type: 'object',
    properties: {
      startModule: {
        type: 'string',
        description: 'Starting module path for dependency traversal (relative to project root)',
      },
      dependencyType: {
        type: 'string',
        enum: ['imports', 'exports', 'all'],
        default: 'all',
        description: 'Type of dependencies to find',
      },
      maxDepth: {
        type: 'number',
        default: 3,
        description: 'Maximum depth for dependency traversal (1-10)',
      },
      filterByLayer: {
        type: 'string',
        enum: ['controllers', 'services', 'utils', 'storage', 'all'],
        default: 'all',
        description: 'Filter dependencies by architectural layer',
      },
    },
    required: ['startModule'],
  },
};

export const handler = async (args, projectRoot) => {
  const { startModule, dependencyType = 'all', maxDepth = 3, filterByLayer = 'all' } = args;

  // Initialize file scanner for this project
  if (!fileScanner || fileScanner.projectRoot !== projectRoot) {
    fileScanner = new FileScanner(projectRoot);
  }

  logger.info('find_dependencies called with:', {
    startModule,
    dependencyType,
    maxDepth,
    filterByLayer,
  });

  // Validate inputs
  if (maxDepth < 1 || maxDepth > 10) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: maxDepth must be between 1 and 10',
        },
      ],
      isError: true,
    };
  }

  // Resolve and validate starting module
  const startPath = resolve(projectRoot, startModule);
  if (!existsSync(startPath)) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Module not found: ${startModule}`,
        },
      ],
      isError: true,
    };
  }

  try {
    // Build dependency graph
    const graph = await buildDependencyGraph(
      projectRoot,
      startPath,
      dependencyType,
      maxDepth,
      filterByLayer
    );

    // Detect circular dependencies
    const circularDeps = detectCircularDependencies(graph);

    // Format results
    const result = formatDependencyResults(
      graph,
      circularDeps,
      startModule,
      maxDepth,
      dependencyType,
      filterByLayer
    );

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    logger.error('Error in find_dependencies:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error analyzing dependencies: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
};

/**
 * Build dependency graph starting from a module
 */
async function buildDependencyGraph(
  projectRoot,
  startPath,
  dependencyType,
  maxDepth,
  filterByLayer
) {
  const graph = new Map();
  const visited = new Set();
  const queue = [{ path: startPath, depth: 0 }];
  const parseFailures = []; // Track parse failures

  // Get cached or create new analyzer
  let analyzer = analyzerCache.get(projectRoot);
  if (!analyzer) {
    analyzer = new HNWAnalyzer(projectRoot);
    analyzerCache.set(projectRoot, analyzer);
  }

  while (queue.length > 0) {
    const { path, depth } = queue.shift();

    if (depth > maxDepth || visited.has(path)) {
      continue;
    }

    visited.add(path);

    // Get relative path for display
    const relativePath = fileScanner.getRelativePath(path);

    // Get module info
    let analysis;
    try {
      analysis = analyzer.analyzeFile(path);
    } catch (error) {
      const failure = {
        file: relativePath,
        error: error.message,
        type: 'parse_error',
      };
      parseFailures.push(failure);
      logger.warn(`Failed to analyze ${relativePath}:`, error.message);
      continue;
    }

    // Filter by layer if requested
    if (filterByLayer !== 'all' && analysis.layer !== filterByLayer) {
      continue;
    }

    // Create node
    const node = {
      path: relativePath,
      layer: analysis.layer,
      depth,
      imports: [],
      exports: analysis.exports,
      compliance: analysis.compliance,
    };

    // Process dependencies based on type
    if (dependencyType === 'imports' || dependencyType === 'all') {
      for (const imp of analysis.imports) {
        // Resolve import path
        const resolvedPath = resolveImportPath(imp, path, projectRoot);
        if (resolvedPath && existsSync(resolvedPath)) {
          node.imports.push({
            module: imp,
            resolved: fileScanner.getRelativePath(resolvedPath),
          });

          // Add to queue if not visited and within depth
          if (!visited.has(resolvedPath) && depth < maxDepth) {
            queue.push({ path: resolvedPath, depth: depth + 1 });
          }
        }
      }
    }

    if (dependencyType === 'exports' || dependencyType === 'all') {
      // For exports, we'd need to find who imports this module
      // This is more expensive and requires scanning all files
      // For now, we'll just note export counts
      node.exportCount = analysis.exports.named;
    }

    graph.set(relativePath, node);
  }

  // Attach parse failures to graph
  graph.parseFailures = parseFailures;

  return graph;
}

/**
 * Detect circular dependencies in the graph
 *
 * Uses DFS with proper tracking of three node states:
 * - UNVISITED: Node hasn't been explored yet
 * - IN_PROGRESS: Node is in current recursion stack (potential cycle)
 * - COMPLETED: Node and all descendants are fully explored (no cycles from here)
 */
function detectCircularDependencies(graph) {
  const cycles = [];
  const state = new Map(); // node -> 'UNVISITED' | 'IN_PROGRESS' | 'COMPLETED'

  // Initialize all nodes as UNVISITED
  for (const node of graph.keys()) {
    state.set(node, 'UNVISITED');
  }

  function dfs(node, path = []) {
    // If we encounter a node in the current path, we found a cycle
    if (state.get(node) === 'IN_PROGRESS') {
      const cycleStart = path.indexOf(node);
      cycles.push([...path.slice(cycleStart), node]);
      return;
    }

    // If node is already fully explored, no need to visit again
    if (state.get(node) === 'COMPLETED') {
      return;
    }

    // Mark node as being explored
    state.set(node, 'IN_PROGRESS');

    // Explore all dependencies
    const nodeData = graph.get(node);
    if (nodeData && nodeData.imports) {
      for (const imp of nodeData.imports) {
        dfs(imp.resolved, [...path, node]);
      }
    }

    // Mark node as fully explored
    state.set(node, 'COMPLETED');
  }

  // Run DFS from each unvisited node (handles disconnected components)
  for (const node of graph.keys()) {
    if (state.get(node) === 'UNVISITED') {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Resolve an import path to an absolute file path
 *
 * SECURITY: Validates that resolved paths stay within project root
 * to prevent directory traversal attacks (e.g., '../../../etc/passwd')
 */
function resolveImportPath(importPath, currentFile, projectRoot) {
  let resolved = null;

  // Handle relative imports
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const currentDir = dirname(currentFile);
    const candidate = resolve(currentDir, importPath);

    // SECURITY: Validate path stays within project root
    if (!isPathWithinProject(candidate, projectRoot)) {
      logger.warn(`Path traversal attempt blocked: ${importPath} in ${currentFile}`);
      return null;
    }

    // Try .js extension
    if (existsSync(candidate + '.js')) {
      resolved = candidate + '.js';
    }
    // Try as directory with index.js
    else {
      const indexJs = join(candidate, 'index.js');
      if (existsSync(indexJs)) {
        resolved = indexJs;
      }
    }
  }
  // Handle absolute imports from project root
  else if (!importPath.startsWith('.')) {
    // Try js/ prefix
    const fromJs = resolve(projectRoot, 'js', importPath);
    if (existsSync(fromJs + '.js')) {
      resolved = fromJs + '.js';
    }
    // Try direct from root
    else {
      const fromRoot = resolve(projectRoot, importPath);
      if (existsSync(fromRoot + '.js')) {
        resolved = fromRoot + '.js';
      }
    }
  }

  // Final security check on resolved path
  if (resolved && !isPathWithinProject(resolved, projectRoot)) {
    logger.warn(`Path traversal attempt blocked (resolved): ${resolved}`);
    return null;
  }

  return resolved;
}

/**
 * Check if a path is within the project root
 * Prevents directory traversal attacks
 */
function isPathWithinProject(path, projectRoot) {
  const relativePath = relative(projectRoot, path);
  // If path starts with '..', it's outside project root
  return !relativePath.startsWith('..');
}

/**
 * Format dependency analysis results
 */
function formatDependencyResults(
  graph,
  circularDeps,
  startModule,
  maxDepth,
  dependencyType,
  filterByLayer
) {
  const lines = [];

  lines.push('# Dependency Analysis');
  lines.push('');
  lines.push(`**Starting Module**: ${startModule}`);
  lines.push(`**Max Depth**: ${maxDepth}`);
  lines.push(`**Dependency Type**: ${dependencyType}`);
  lines.push(`**Layer Filter**: ${filterByLayer === 'all' ? 'None' : filterByLayer}`);
  lines.push(`**Modules Analyzed**: ${graph.size}`);
  lines.push('');

  // Parse failures
  if (graph.parseFailures && graph.parseFailures.length > 0) {
    lines.push('## ⚠️ Parse Failures');
    lines.push('');
    lines.push(`Failed to parse ${graph.parseFailures.length} file(s):`);
    lines.push('');
    for (const failure of graph.parseFailures) {
      lines.push(`- **${failure.file}**: ${failure.error}`);
    }
    lines.push('');
    lines.push(
      '**Note**: These files were excluded from analysis due to syntax errors or parsing issues.'
    );
    lines.push('');
  }

  // Circular dependencies
  if (circularDeps.length > 0) {
    lines.push('## ⚠️ Circular Dependencies Detected');
    lines.push('');
    for (const cycle of circularDeps) {
      lines.push(`- ${cycle.join(' → ')}`);
    }
    lines.push('');
  } else {
    lines.push('## ✅ No Circular Dependencies');
    lines.push('');
  }

  // Dependency tree
  lines.push('## Dependency Tree');
  lines.push('');

  const startNode = graph.get(startModule);
  if (startNode) {
    printDependencyTree(lines, graph, startModule, '', 0, maxDepth);
  } else {
    lines.push('Starting module not found in graph.');
  }
  lines.push('');

  // Module details
  lines.push('## Module Details');
  lines.push('');

  for (const [path, node] of graph.entries()) {
    lines.push(`### ${path}`);
    lines.push('');
    lines.push(`- **Layer**: ${node.layer}`);
    lines.push(`- **Depth**: ${node.depth}`);
    lines.push(`- **HNW Compliance**: ${node.compliance.score}/100`);

    if (node.imports.length > 0) {
      lines.push(`- **Imports** (${node.imports.length}):`);
      for (const imp of node.imports) {
        const targetNode = graph.get(imp.resolved);
        const targetLayer = targetNode ? targetNode.layer : 'unknown';
        lines.push(`  - \`${imp.module}\` → \`${imp.resolved}\` (${targetLayer})`);
      }
    }

    if (node.compliance.violations.length > 0) {
      lines.push(`- **Violations** (${node.compliance.violations.length}):`);
      for (const violation of node.compliance.violations) {
        const icon = violation.severity === 'error' ? '❌' : '⚠️';
        lines.push(`  - ${icon} ${violation.rule}: ${violation.message}`);
      }
    }

    lines.push('');
  }

  // Recommendations
  lines.push('## Recommendations');
  lines.push('');

  if (circularDeps.length > 0) {
    lines.push('### Critical: Resolve Circular Dependencies');
    lines.push('');
    lines.push(
      'Circular dependencies prevent proper module initialization and can cause runtime errors. Consider:'
    );
    lines.push('- Extracting shared functionality into a separate module');
    lines.push('- Using dependency injection to break cycles');
    lines.push('- Reorganizing module structure to follow HNW hierarchy');
    lines.push('');
  }

  // Check for HNW violations across all modules
  const allViolations = [];
  for (const node of graph.values()) {
    for (const violation of node.compliance.violations) {
      if (violation.severity === 'error') {
        allViolations.push({ path: node.path, ...violation });
      }
    }
  }

  if (allViolations.length > 0) {
    lines.push('### High Priority: Fix HNW Architecture Violations');
    lines.push('');
    lines.push(`Found ${allViolations.length} critical violations across ${graph.size} modules:`);
    lines.push('');
    for (const violation of allViolations) {
      lines.push(`- **${violation.path}**: ${violation.rule}`);
      lines.push(`  ${violation.message}`);
      if (violation.recommendation) {
        lines.push(`  💡 ${violation.recommendation}`);
      }
    }
    lines.push('');
  }

  // Layer distribution
  const layerCounts = {};
  for (const node of graph.values()) {
    layerCounts[node.layer] = (layerCounts[node.layer] || 0) + 1;
  }

  lines.push('### Layer Distribution');
  lines.push('');
  for (const [layer, count] of Object.entries(layerCounts)) {
    lines.push(`- **${layer}**: ${count} modules`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Print dependency tree recursively
 */
function printDependencyTree(lines, graph, nodePath, prefix, depth, maxDepth) {
  if (depth > maxDepth) {
    return;
  }

  const node = graph.get(nodePath);
  if (!node) {
    return;
  }

  const isLast = depth === maxDepth || node.imports.length === 0;
  const connector = depth === 0 ? '' : isLast ? '└── ' : '├── ';

  lines.push(`${prefix}${connector}${nodePath} (${node.layer})`);

  const childPrefix = prefix + (depth === 0 ? '' : isLast ? '    ' : '│   ');

  for (let i = 0; i < node.imports.length; i++) {
    const imp = node.imports[i];
    const isLastChild = i === node.imports.length - 1;
    printDependencyTree(
      lines,
      graph,
      imp.resolved,
      childPrefix + (isLastChild ? '└── ' : '├── '),
      depth + 1,
      maxDepth
    );
  }
}
