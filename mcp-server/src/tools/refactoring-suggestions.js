/**
 * MCP Tool: suggest_refactoring
 * Generate IMPACT-AWARE refactoring suggestions with:
 * - Call frequency weighting (from dependency graph)
 * - Test coverage proximity analysis
 * - Risk tier classification
 * - HNW compliance checks and before/after examples
 */

import { resolve, join } from 'path';
import { promises as fs } from 'fs';
import { existsSync, statSync } from 'fs';
import { globSync } from 'glob';
import { parse } from '@babel/parser';
import { default as traverse } from '@babel/traverse';

// Ensure we get the default export (the traverse function)
const traverseFn = traverse.default || traverse;
import { FileScanner } from '../utils/file-scanner.js';
import { CacheManager } from '../cache/cache-manager.js';
import { logger } from '../utils/logger.js';
import { createPartialResponse, createErrorResponse } from '../errors/partial.js';

const cache = new CacheManager();

/**
 * Priority constants for consistent priority handling
 */
const PRIORITIES = {
  HIGH: 100,
  MEDIUM: 50,
  LOW: 0
};

/**
 * Complexity thresholds for refactoring type determination
 */
const COMPLEXITY_THRESHOLDS = {
  EXTRACT_CLASS_CYCLOMATIC: 20,
  EXTRACT_FUNCTION_CYCLOMATIC: 15,
  EXTRACT_FUNCTION_COGNITIVE: 18,
  EXTRACT_ASYNC_CYCLOMATIC: 10,
  SIMPLIFY_CONDITIONALS: 10
};

/**
 * Output message constants for consistency
 * Note: These are currently English-only. If i18n is planned, these should be moved to a locale file.
 */
const OUTPUT_MESSAGES = {
  HIGH_PRIORITY: 'High Priority',
  MEDIUM_PRIORITY: 'Medium Priority',
  LOW_PRIORITY: 'Low Priority',
  CURRENT_METRICS: 'Current Metrics',
  PROJECTED_METRICS: 'Projected Metrics',
  IMPACT_ANALYSIS: 'Impact Analysis',
  HNW_IMPACT: 'HNW Impact',
  REFACTORING: 'Refactoring',
  BEFORE: 'Before',
  AFTER: 'After',
  TOTAL_ANALYZED: 'Total Functions Analyzed',
  SUGGESTIONS_GENERATED: 'Suggestions Generated',
  FILE: 'File',
  TYPE: 'Type',
  PRIORITY: 'Priority',
  CYCLOMATIC: 'Cyclomatic Complexity',
  COGNITIVE: 'Cognitive Complexity',
  MAINTAINABILITY: 'Maintainability Index'
};

/**
 * Emoji constants for consistent emoji usage across formatters
 */
const EMOJIS = {
  HIGH_PRIORITY: '🔴',
  MEDIUM_PRIORITY: '🟡',
  LOW_PRIORITY: '🟢',
  WARNING: '⚠️',
  SUCCESS: '✅',
  INFO: 'ℹ️',
  ARROW_DOWN: '↓',
  CHECKMARK: '✓'
};

/**
 * Validate path is within project root (security: prevent path traversal)
 */
function validatePath(projectRoot, targetPath) {
  const resolved = resolve(projectRoot, targetPath);
  const normalizedRoot = resolve(projectRoot);

  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(
      `[suggest_refactoring] Path traversal detected: Target path is outside project root\n` +
      `Requested: ${targetPath}\n` +
      `Resolved: ${resolved}\n` +
      `Project root: ${normalizedRoot}`
    );
  }

  return resolved;
}

/**
 * Get files in directory recursively
 */

/**
 * Tool schema definition
 */
export const schema = {
  name: 'suggest_refactoring',
  description: 'Generate complexity-based refactoring suggestions with HNW compliance checks and before/after examples',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        description: 'File or directory to analyze. Paths are relative to project root. Examples: "js/utils/file-scanner.js" or { "filePath": "js/utils/file-scanner.js" } or { "directory": "js/utils" }',
        oneOf: [
          { type: 'string', description: 'File path as string (e.g., "js/controllers/chat-ui-controller.js")' },
          {
            type: 'object',
            description: 'Object with filePath or directory property for explicit type specification',
            properties: {
              filePath: { type: 'string', description: 'File path (e.g., "js/controllers/chat-ui-controller.js")' },
              directory: { type: 'string', description: 'Directory path to analyze all JS files within (e.g., "js/controllers")' }
            },
            additionalProperties: false
          }
        ]
      },
      complexityThreshold: {
        type: 'number',
        default: 10,
        description: 'Cyclomatic complexity threshold'
      },
      includeHNWCheck: {
        type: 'boolean',
        default: true,
        description: 'Include HNW compliance checks'
      },
      priorityBy: {
        type: 'string',
        enum: ['impact', 'effort', 'risk', 'balanced'],
        default: 'balanced',
        description: 'Priority calculation strategy'
      },
      maxSuggestions: {
        type: 'number',
        default: 10,
        description: 'Maximum number of suggestions'
      }
    },
    required: ['target']
  }
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot, indexer, server) => {
  const {
    target,
    complexityThreshold = 10,
    includeHNWCheck = true,
    priorityBy = 'balanced',
    maxSuggestions = 10
  } = args;

  logger.info('suggest_refactoring called with:', {
    target,
    complexityThreshold,
    includeHNWCheck,
    priorityBy,
    maxSuggestions
  });

  try {
    // Determine target files with path validation
    let targetFiles = [];

    if (typeof target === 'string') {
      const targetPath = validatePath(projectRoot, target);
      if (!existsSync(targetPath)) {
        throw new Error(`[suggest_refactoring] Target not found: ${target}`);
      }
      targetFiles = [targetPath];
    } else if (target.filePath) {
      const targetPath = validatePath(projectRoot, target.filePath);
      if (!existsSync(targetPath)) {
        throw new Error(`[suggest_refactoring] File not found: ${target.filePath}`);
      }
      targetFiles = [targetPath];
    } else if (target.directory) {
      const targetPath = validatePath(projectRoot, target.directory);
      if (!existsSync(targetPath)) {
        throw new Error(`[suggest_refactoring] Directory not found: ${target.directory}`);
      }
      targetFiles = getFilesInDirectory(targetPath);
    }

    if (targetFiles.length === 0) {
      throw new Error('[suggest_refactoring] No files to analyze');
    }

    logger.info(`Analyzing ${targetFiles.length} files for refactoring opportunities`);

    // Analyze all functions with error tracking (using async for proper resource cleanup)
    const allFunctions = [];
    const failures = [];

    for (const file of targetFiles) {
      try {
        // Resource limit: Check file size before reading
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        const stats = statSync(file);
        if (stats.size > MAX_FILE_SIZE) {
          failures.push({
            file: file.replace(projectRoot + '/', ''),
            error: `File too large (${Math.round(stats.size / 1024 / 1024)}MB)`
          });
          logger.warn(`[suggest_refactoring] Skipping large file: ${file}`);
          continue;
        }

        const functions = await analyzeFunctions(file, projectRoot);
        allFunctions.push(...functions);
      } catch (error) {
        failures.push({
          file: file.replace(projectRoot + '/', ''),
          error: error.message
        });
        logger.warn(`[suggest_refactoring] Failed to analyze ${file}:`, error);
      }
    }

    // Report partial results if there were failures
    if (failures.length > 0) {
      logger.warn(`[suggest_refactoring] Failed to analyze ${failures.length}/${targetFiles.length} files`);
    }

    // Generate refactoring suggestions with impact awareness
    const suggestions = await generateRefactoringSuggestions(allFunctions, {
      complexityThreshold,
      includeHNWCheck,
      priorityBy,
      maxSuggestions,
      projectRoot,
      indexer // Pass indexer for call frequency analysis
    });

    // Format output
    const output = formatRefactoringSuggestions(suggestions, allFunctions.length);

    // Check completeness and report partial results if needed
    if (failures.length > 0) {
      return createPartialResponse(
        {
          content: [{ type: 'text', text: output }]
        },
        {
          completeness: Math.round(((targetFiles.length - failures.length) / targetFiles.length) * 100),
          messages: [`Failed to analyze ${failures.length}/${targetFiles.length} files`],
          suggestions: failures.slice(0, 5).map(f => `Check ${f.file}: ${f.error}`)
        }
      );
    }

    return {
      content: [{ type: 'text', text: output }]
    };
  } catch (error) {
    logger.error('Error in suggest_refactoring:', error);
    return createErrorResponse(error);
  }
};

/**
 * Get files in directory recursively
 * @param {string} dir - Directory path to search
 * @returns {Array<string>} Array of absolute file paths
 */
function getFilesInDirectory(dir) {
  const patterns = [
    join(dir, '**/*.js'),
    '!**/node_modules/**',
    '!**/*.test.js',
    '!**/*.spec.js'
  ];
  return globSync(patterns, { absolute: true });
}

/**
 * Analyze functions in a file (async for proper resource cleanup)
 * @param {string} filePath - Absolute path to file to analyze
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<Array<Object>>} Array of function analysis objects
 */
async function analyzeFunctions(filePath, projectRoot) {
  // Use async readFile to avoid file handle leaks
  const content = await fs.readFile(filePath, 'utf-8');

  // Detect file extension for appropriate parser plugins
  const ext = filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : null;
  const ast = parse(content, {
    sourceType: 'module',
    plugins: [...(ext ? [ext] : []), 'jsx']
  });
  const functions = [];

  traverseFn(ast, {
    FunctionDeclaration(path) {
      const func = analyzeFunction(path, filePath, projectRoot);
      functions.push(func);
    },

    FunctionExpression(path) {
      // Only analyze named functions
      if (path.node.id) {
        const func = analyzeFunction(path, filePath, projectRoot);
        functions.push(func);
      }
    },

    ArrowFunctionExpression(path) {
      // Only analyze named arrow functions assigned to variables
      const parent = path.parent;
      if (parent.type === 'VariableDeclarator' && parent.id.name) {
        const func = analyzeFunction(path, filePath, projectRoot);
        func.name = parent.id.name;
        functions.push(func);
      }
    }
  });

  return functions;
}

/**
 * Analyze a single function
 * @param {Object} path - Babel NodePath for the function
 * @param {string} filePath - Absolute path to file containing function
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Function analysis object with complexity metrics
 */
function analyzeFunction(path, filePath, projectRoot) {
  const node = path.node;
  const loc = node.loc;
  const linesOfCode = loc.end.line - loc.start.line + 1;

  const cyclomatic = calculateCyclomaticComplexity(path);
  const cognitive = calculateCognitiveComplexity(path);

  // Calculate maintainability index (simplified)
  // MI = 171 - 5.2 * ln(avg_vol) - 0.23 * cyclomatic - 16.2 * ln(loc)
  // Guard against invalid input (prevent NaN)
  const safeLinesOfCode = Math.max(1, linesOfCode); // Minimum 1 line
  const maintainability = Math.max(0, 171 - 0.23 * cyclomatic - 16.2 * Math.log(safeLinesOfCode));

  return {
    name: node.id?.name || '<anonymous>',
    type: node.type,
    filePath: filePath.replace(projectRoot + '/', ''),
    line: loc.start.line,
    linesOfCode,
    cyclomatic,
    cognitive,
    maintainability: isNaN(maintainability) ? 0 : maintainability,
    isAsync: node.async || false,
    node
  };
}

/**
 * Calculate cyclomatic complexity
 * Based on: McCabe's cyclomatic complexity = E - N + 2*P
 * Simplified: 1 (base) + number of decision points
 * @param {Object} functionPath - Babel NodePath for function to analyze
 * @returns {number} Cyclomatic complexity score
 */
function calculateCyclomaticComplexity(functionPath) {
  let complexity = 1; // Base complexity

  functionPath.traverse({
    IfStatement() {
      complexity += 1;
    },

    WhileStatement() {
      complexity += 1;
    },

    ForStatement() {
      complexity += 1;
    },

    ForInStatement() {
      complexity += 1;
    },

    ForOfStatement() {
      complexity += 1;
    },

    ConditionalExpression() {
      complexity += 1;
    },

    SwitchCase(path) {
      if (path.node.test) {
        complexity += 1;
      }
    },

    CatchClause() {
      complexity += 1;
    },

    LogicalExpression(path) {
      if (path.node.operator === '&&' || path.node.operator === '||') {
        complexity += 1;
      }
    }
  });

  return complexity;
}

/**
 * Calculate cognitive complexity
 * Based on: Cognitive Complexity by SonarSource
 * Accounts for nesting and breaks in control flow
 * @param {Object} functionPath - Babel NodePath for function to analyze
 * @returns {number} Cognitive complexity score
 */
function calculateCognitiveComplexity(functionPath) {
  let complexity = 0;
  let nestingDepth = 0;
  const MAX_NESTING_DEPTH = 50; // Prevent infinite loops in malformed AST

  functionPath.traverse({
    IfStatement(path) {
      // Bounds checking to prevent infinite loops
      if (nestingDepth > MAX_NESTING_DEPTH) {
        logger.warn(`[calculateCognitiveComplexity] Exceeded max nesting depth ${MAX_NESTING_DEPTH}`);
        path.stop(); // Stop traversing this branch
        return;
      }
      complexity += 1 + nestingDepth;
      nestingDepth += 1;
    },

    IfStatement: {
      exit() {
        nestingDepth -= 1;
      }
    },

    WhileStatement(path) {
      if (nestingDepth > MAX_NESTING_DEPTH) {
        logger.warn(`[calculateCognitiveComplexity] Exceeded max nesting depth ${MAX_NESTING_DEPTH}`);
        path.stop();
        return;
      }
      complexity += 1 + nestingDepth;
      nestingDepth += 1;
    },

    WhileStatement: {
      exit() {
        nestingDepth -= 1;
      }
    },

    ForStatement(path) {
      if (nestingDepth > MAX_NESTING_DEPTH) {
        logger.warn(`[calculateCognitiveComplexity] Exceeded max nesting depth ${MAX_NESTING_DEPTH}`);
        path.stop();
        return;
      }
      complexity += 1 + nestingDepth;
      nestingDepth += 1;
    },

    ForStatement: {
      exit() {
        nestingDepth -= 1;
      }
    },

    ForInStatement(path) {
      if (nestingDepth > MAX_NESTING_DEPTH) {
        logger.warn(`[calculateCognitiveComplexity] Exceeded max nesting depth ${MAX_NESTING_DEPTH}`);
        path.stop();
        return;
      }
      complexity += 1 + nestingDepth;
      nestingDepth += 1;
    },

    ForInStatement: {
      exit() {
        nestingDepth -= 1;
      }
    },

    ForOfStatement(path) {
      if (nestingDepth > MAX_NESTING_DEPTH) {
        logger.warn(`[calculateCognitiveComplexity] Exceeded max nesting depth ${MAX_NESTING_DEPTH}`);
        path.stop();
        return;
      }
      complexity += 1 + nestingDepth;
      nestingDepth += 1;
    },

    ForOfStatement: {
      exit() {
        nestingDepth -= 1;
      }
    },

    ConditionalExpression(path) {
      complexity += 1;
    },

    BreakStatement() {
      complexity += 1;
    },

    ContinueStatement() {
      complexity += 1;
    }
  });

  return complexity;
}

/**
 * Generate refactoring suggestions with impact awareness
 * @param {Array<Object>} functions - Array of analyzed function objects
 * @param {Object} options - Configuration options
 * @param {number} options.complexityThreshold - Minimum complexity to trigger suggestions
 * @param {boolean} options.includeHNWCheck - Whether to include HNW compliance checks
 * @param {string} options.priorityBy - Priority calculation strategy
 * @param {number} options.maxSuggestions - Maximum number of suggestions to return
 * @param {string} options.projectRoot - Project root directory
 * @param {Object} options.indexer - Semantic indexer with dependency graph
 * @returns {Promise<Array<Object>>} Sorted array of refactoring suggestions
 */
async function generateRefactoringSuggestions(functions, options) {
  const {
    complexityThreshold,
    includeHNWCheck,
    priorityBy,
    maxSuggestions,
    projectRoot,
    indexer
  } = options;

  const suggestions = [];

  // Find complex functions
  const complexFunctions = functions.filter(f =>
    f.cyclomatic >= complexityThreshold ||
    f.cognitive >= complexityThreshold * 1.2
  );

  // Pre-compute call frequencies from dependency graph (if available)
  const callFrequencies = await getCallFrequencies(functions, indexer);

  for (const func of complexFunctions) {
    const refactoringType = determineRefactoringType(func);

    // IMPACT-AWARE: Enhanced impact calculation with multiple factors
    const impactData = await calculateImpactAware(func, refactoringType, {
      callFrequency: callFrequencies.get(func.name) || 0,
      indexer,
      projectRoot
    });

    const effort = calculateEffort(func, refactoringType);

    // ENHANCED: Risk tier classification (not just 1-10 score)
    const riskTier = calculateRiskTier(func, refactoringType, {
      hasTests: await hasTestCoverage(func.filePath, projectRoot),
      callFrequency: callFrequencies.get(func.name) || 0
    });

    const suggestion = {
      function: {
        name: func.name,
        file: func.filePath,
        line: func.line,
        linesOfCode: func.linesOfCode
      },
      refactoringType,
      priority: calculatePriority(impactData, effort, riskTier, priorityBy),
      impact: impactData.score,
      impactDetails: impactData,  // Include breakdown
      effort,
      risk: riskTier.score,
      riskTier: riskTier.tier,  // NEW: Risk tier classification
      riskDetails: riskTier.details,  // NEW: Risk tier breakdown
      currentMetrics: {
        cyclomatic: func.cyclomatic,
        cognitive: func.cognitive,
        maintainability: func.maintainability.toFixed(1)
      },
      projectedMetrics: estimateNewMetrics(func, refactoringType),
      hnwImpact: includeHNWCheck ?
        checkHNWComplianceImpact(func, refactoringType, projectRoot) :
        null,
      examples: generateBeforeAfterExamples(func, refactoringType),
      // NEW: Call frequency and test coverage info
      callFrequency: callFrequencies.get(func.name) || 0,
      hasTestCoverage: await hasTestCoverage(func.filePath, projectRoot)
    };

    suggestions.push(suggestion);
  }

  // Sort by priority and limit
  return suggestions
    .sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority))
    .slice(0, maxSuggestions);
}

/**
 * Get call frequencies from dependency graph
 * @param {Array<Object>} functions - Array of function objects
 * @param {Object} indexer - Semantic indexer with dependency graph
 * @returns {Promise<Map<string, number>>} Map of function name to call frequency
 */
async function getCallFrequencies(functions, indexer) {
  const frequencies = new Map();

  // Initialize all functions with 0 calls
  for (const func of functions) {
    frequencies.set(func.name, 0);
  }

  if (!indexer || !indexer.dependencyGraph) {
    return frequencies;
  }

  try {
    // Get all symbol usages from dependency graph
    const stats = indexer.dependencyGraph.getStats();
    const definitions = indexer.dependencyGraph.definitions;

    // Count how many times each function is used
    for (const [symbolName, defs] of definitions.entries()) {
      const callCount = defs.length;
      // Update frequency for this symbol name
      if (frequencies.has(symbolName)) {
        frequencies.set(symbolName, callCount);
      }
    }

    // Also check usages
    const usages = indexer.dependencyGraph.usages;
    for (const [symbolName, uses] of usages.entries()) {
      const useCount = uses.length;
      if (frequencies.has(symbolName)) {
        frequencies.set(symbolName, Math.max(frequencies.get(symbolName), useCount));
      }
    }
  } catch (error) {
    logger.warn('[getCallFrequencies] Failed to get call frequencies:', error);
  }

  return frequencies;
}

/**
 * Calculate impact-aware score with multiple weighted factors
 * @param {Object} func - Function analysis object
 * @param {string} refactoringType - Type of refactoring
 * @param {Object} context - Additional context for impact calculation
 * @returns {Promise<Object>} Impact score with breakdown
 */
async function calculateImpactAware(func, refactoringType, context) {
  const { callFrequency, indexer, projectRoot } = context;

  let baseImpact = 5;  // Base impact from complexity

  // Factor 1: Cyclomatic complexity (0-30% weight)
  const complexityImpact = Math.min(30, func.cyclomatic * 2);

  // Factor 2: Call frequency (0-40% weight) - HIGHLY CALLED functions are more impactful
  // Normalize call frequency: 0 calls = 0%, 10+ calls = 100%
  const callFrequencyWeight = Math.min(40, callFrequency * 4);

  // Factor 3: Lines of code (0-20% weight) - larger functions benefit more
  const locImpact = Math.min(20, func.linesOfCode / 10);

  // Factor 4: Layer importance (0-10% weight)
  const layerImpact = await getLayerImportance(func.filePath, indexer);

  const totalImpact = baseImpact + complexityImpact + callFrequencyWeight + locImpact + layerImpact;

  return {
    score: Math.min(10, Math.round(totalImpact / 10)),
    breakdown: {
      complexity: complexityImpact,
      callFrequency: {
        count: callFrequency,
        impact: callFrequencyWeight,
        label: callFrequency > 5 ? 'High' : callFrequency > 1 ? 'Medium' : 'Low'
      },
      linesOfCode: locImpact,
      layerImportance: layerImpact
    }
  };
}

/**
 * Get layer importance for impact calculation
 * Services and controllers are more impactful than utils
 */
async function getLayerImportance(filePath, indexer) {
  const layer = getFileLayer(filePath);
  const importanceMap = {
    'services': 10,
    'controllers': 8,
    'providers': 6,
    'storage': 4,
    'utils': 2,
    'other': 1
  };
  return importanceMap[layer] || 1;
}

/**
 * Calculate risk tier with detailed breakdown
 * @param {Object} func - Function analysis object
 * @param {string} refactoringType - Type of refactoring
 * @param {Object} context - Additional context
 * @returns {Object} Risk tier with details
 */
function calculateRiskTier(func, refactoringType, context) {
  const { hasTests, callFrequency } = context;

  let riskScore = 0;
  const details = [];
  let tier = 'LOW';

  // Factor 1: Async complexity
  if (func.isAsync) {
    riskScore += 3;
    details.push('Async code is harder to test and debug');
  }

  // Factor 2: Size
  if (func.linesOfCode > 200) {
    riskScore += 3;
    tier = 'HIGH';
    details.push(`Very large function (${func.linesOfCode} lines)`);
  } else if (func.linesOfCode > 100) {
    riskScore += 1;
    details.push(`Large function (${func.linesOfCode} lines)`);
  }

  // Factor 3: Complexity
  if (func.cyclomatic > 20) {
    riskScore += 2;
    details.push(`High cyclomatic complexity (${func.cyclomatic})`);
  }

  // Factor 4: Test coverage (REDUCES risk)
  if (hasTests) {
    riskScore = Math.max(0, riskScore - 2);
    details.push('✓ Has test coverage nearby');
  } else {
    details.push('⚠️ No test coverage found');
  }

  // Factor 5: Call frequency (HIGH call frequency = HIGHER risk due to blast radius)
  if (callFrequency > 10) {
    riskScore += 2;
    details.push(`Highly called (${callFrequency} usages) - changes affect many callers`);
    if (tier === 'LOW') tier = 'MEDIUM';
  } else if (callFrequency > 5) {
    details.push(`Moderately called (${callFrequency} usages)`);
  }

  // Factor 6: Refactoring type risk
  const typeRiskMap = {
    'extract_class': 3,
    'extract_async_logic': 2,
    'extract_function': 1,
    'simplify_conditionals': 0,
    'extract_constants': 0
  };
  riskScore += typeRiskMap[refactoringType] || 0;

  // Determine final tier
  if (riskScore >= 7) {
    tier = 'HIGH';
  } else if (riskScore >= 4) {
    tier = 'MEDIUM';
  }

  return {
    score: Math.min(10, riskScore),
    tier,
    details
  };
}

/**
 * Check if a file has test coverage nearby
 * @param {string} filePath - Path to the source file
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<boolean>} True if test file exists nearby
 */
async function hasTestCoverage(filePath, projectRoot) {
  try {
    // Try common test file patterns
    const testPatterns = [
      filePath.replace('.js', '.test.js'),
      filePath.replace('.js', '.spec.js'),
      filePath.replace('.js', '.test.ts'),
      filePath.replace('.js', '.spec.ts'),
      filePath.replace('/js/', '/tests/').replace('.js', '.test.js'),
    ];

    for (const testPath of testPatterns) {
      const fullPath = resolve(projectRoot, testPath);
      if (existsSync(fullPath)) {
        return true;
      }
    }
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Get file layer from file path
 */
function getFileLayer(filePath) {
  if (filePath.includes('/controllers/')) return 'controllers';
  if (filePath.includes('/services/')) return 'services';
  if (filePath.includes('/providers/')) return 'providers';
  if (filePath.includes('/storage/')) return 'storage';
  if (filePath.includes('/utils/')) return 'utils';
  return 'other';
}

/**
 * Determine refactoring type based on complexity metrics
 * @param {Object} func - Function analysis object
 * @returns {string} Refactoring type identifier
 */
function determineRefactoringType(func) {
  if (func.cyclomatic >= COMPLEXITY_THRESHOLDS.EXTRACT_CLASS_CYCLOMATIC) {
    return 'extract_class';
  }
  if (func.cyclomatic >= COMPLEXITY_THRESHOLDS.EXTRACT_FUNCTION_CYCLOMATIC ||
      func.cognitive >= COMPLEXITY_THRESHOLDS.EXTRACT_FUNCTION_COGNITIVE) {
    return 'extract_function';
  }
  if (func.isAsync && func.cyclomatic >= COMPLEXITY_THRESHOLDS.EXTRACT_ASYNC_CYCLOMATIC) {
    return 'extract_async_logic';
  }
  if (func.cyclomatic >= COMPLEXITY_THRESHOLDS.SIMPLIFY_CONDITIONALS) {
    return 'simplify_conditionals';
  }
  return 'extract_constants';
}

/**
 * Calculate impact of refactoring (1-10, higher is better)
 */
function calculateImpact(func, refactoringType) {
  let impact = 5;

  switch (refactoringType) {
    case 'extract_class':
      impact = Math.min(10, func.cyclomatic / 2);
      break;
    case 'extract_function':
      impact = Math.min(9, func.cyclomatic / 2);
      break;
    case 'extract_async_logic':
      impact = Math.min(8, func.cyclomatic / 2);
      break;
    case 'simplify_conditionals':
      impact = Math.min(7, func.cyclomatic / 3);
      break;
    case 'extract_constants':
      impact = 4;
      break;
  }

  return Math.round(impact);
}

/**
 * Calculate effort required (1-10, higher is more effort)
 */
function calculateEffort(func, refactoringType) {
  let effort = 5;

  switch (refactoringType) {
    case 'extract_class':
      effort = 9;
      break;
    case 'extract_function':
      effort = 6;
      break;
    case 'extract_async_logic':
      effort = 7;
      break;
    case 'simplify_conditionals':
      effort = 5;
      break;
    case 'extract_constants':
      effort = 2;
      break;
  }

  // Adjust based on lines of code
  if (func.linesOfCode > 100) {
    effort += 1;
  }

  return Math.min(10, effort);
}

/**
 * Calculate risk (1-10, higher is riskier)
 */
function calculateRisk(func, refactoringType) {
  let risk = 3;

  // Async code is riskier
  if (func.isAsync) {
    risk += 2;
  }

  // Large functions are riskier
  if (func.linesOfCode > 200) {
    risk += 2;
  } else if (func.linesOfCode > 100) {
    risk += 1;
  }

  switch (refactoringType) {
    case 'extract_class':
      risk += 2;
      break;
    case 'extract_async_logic':
      risk += 1;
      break;
  }

  return Math.min(10, risk);
}

/**
 * Calculate priority based on impact, effort, and risk
 * Now handles impact-aware data structures
 */
function calculatePriority(impactData, effort, riskTier, strategy) {
  // Handle both old format (number) and new format (object with score)
  const impactScore = typeof impactData === 'number' ? impactData : impactData.score;
  const riskScore = typeof riskTier === 'number' ? riskTier : riskTier.score;

  let score;

  switch (strategy) {
    case 'impact':
      score = impactScore * 10;
      break;
    case 'effort':
      score = (10 - effort) * 10;
      break;
    case 'risk':
      score = (10 - riskScore) * 10;
      break;
    case 'balanced':
    default:
      score = (impactScore * 10) - ((effort + riskScore) / 2);
      break;
  }

  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

/**
 * Convert priority to numeric score for sorting
 */
function priorityScore(priority) {
  return PRIORITIES[priority] ?? 0;
}

/**
 * Estimate new metrics after refactoring
 */
function estimateNewMetrics(func, refactoringType) {
  let cyclomaticReduction = 0;
  let cognitiveReduction = 0;

  switch (refactoringType) {
    case 'extract_class':
      cyclomaticReduction = func.cyclomatic * 0.4;
      cognitiveReduction = func.cognitive * 0.5;
      break;
    case 'extract_function':
      cyclomaticReduction = func.cyclomatic * 0.3;
      cognitiveReduction = func.cognitive * 0.4;
      break;
    case 'extract_async_logic':
      cyclomaticReduction = func.cyclomatic * 0.25;
      cognitiveReduction = func.cognitive * 0.35;
      break;
    case 'simplify_conditionals':
      cyclomaticReduction = func.cyclomatic * 0.2;
      cognitiveReduction = func.cognitive * 0.3;
      break;
    case 'extract_constants':
      cyclomaticReduction = 0;
      cognitiveReduction = func.cognitive * 0.1;
      break;
  }

  return {
    cyclomatic: Math.round(func.cyclomatic - cyclomaticReduction),
    cognitive: Math.round(func.cognitive - cognitiveReduction),
    improvement: 'Estimated'
  };
}

/**
 * Check HNW compliance impact of refactoring
 * @param {Object} func - Function analysis object
 * @param {string} refactoringType - Type of refactoring being suggested
 * @param {string} projectRoot - Project root directory
 * @returns {Object} HNW impact assessment with explanation
 */
function checkHNWComplianceImpact(func, refactoringType, projectRoot) {
  // Use projectRoot explicitly (HNW principle - pass context explicitly)
  const scanner = new FileScanner(projectRoot);
  const layer = scanner.getFileLayer(func.filePath);

  let impact = 'neutral';
  const explanation = [];

  switch (refactoringType) {
    case 'extract_function':
      impact = 'positive';
      explanation.push('Extracting functions improves single responsibility');
      explanation.push('Better testability (Network principle)');
      if (layer === 'services' || layer === 'controllers') {
        explanation.push('Follows HNW hierarchical patterns');
      }
      break;

    case 'extract_async_logic':
      impact = 'positive';
      explanation.push('Clearer async boundaries');
      explanation.push('Easier to reason about Promise chains');
      if (layer === 'providers') {
        explanation.push('Better provider abstraction (Hierarchy principle)');
      }
      break;

    case 'extract_class':
      impact = 'positive';
      explanation.push('Better encapsulation');
      explanation.push('Follows object-oriented HNW patterns');
      if (layer === 'services' || layer === 'controllers') {
        explanation.push('Improves service/controller modularity');
      }
      break;

    case 'simplify_conditionals':
      impact = 'neutral';
      explanation.push('No architectural impact');
      explanation.push('Improves code readability');
      break;

    case 'extract_constants':
      impact = 'neutral';
      explanation.push('No architectural impact');
      explanation.push('Improves maintainability');
      break;
  }

  return {
    impact,
    explanation,
    layer
  };
}

/**
 * Generate before/after code examples
 * @param {Object} func - Function analysis object
 * @param {string} refactoringType - Type of refactoring being suggested
 * @returns {Object} Object with before, after code examples and description
 */
function generateBeforeAfterExamples(func, refactoringType) {
  const examples = {
    before: '',
    after: '',
    description: ''
  };

  switch (refactoringType) {
    case 'extract_function':
      examples.description = 'Extract complex logic into separate functions';
      examples.before = `function ${func.name}() {\n  // ${func.linesOfCode} lines of code\n  // Complexity: ${func.cyclomatic}\n  // ... many nested conditions ...\n}`;
      examples.after = `function ${func.name}() {\n  if (!isValid()) return;\n\n  const data = fetchData();\n  processData(data);\n  saveResult(data);\n}\n\n// Extracted helper functions\nfunction isValid() { /* ... */ }\nfunction fetchData() { /* ... */ }\nfunction processData(data) { /* ... */ }\nfunction saveResult(data) { /* ... */ }`;
      break;

    case 'extract_async_logic':
      examples.description = 'Separate async operations into distinct functions';
      examples.before = `async function ${func.name}() {\n  // ${func.linesOfCode} lines of code\n  // Mix of sync and async logic\n  // Complexity: ${func.cyclomatic}\n}`;
      examples.after = `async function ${func.name}() {\n  const input = prepareInput();\n  const data = await fetchDataAsync(input);\n  return processData(data);\n}\n\n// Extracted async operations\nasync function fetchDataAsync(input) {\n  // Specific async logic\n}`;
      break;

    case 'simplify_conditionals':
      examples.description = 'Use guard clauses and early returns';
      examples.before = `function ${func.name}(data) {\n  if (data) {\n    if (data.isValid) {\n      if (data.hasPermission) {\n        // ... nested logic ...\n      } else {\n        throw new Error();\n      }\n    } else {\n      throw new Error();\n    }\n  } else {\n    throw new Error();\n  }\n}`;
      examples.after = `function ${func.name}(data) {\n  // Guard clauses\n  if (!data) throw new Error('No data');\n  if (!data.isValid) throw new Error('Invalid data');\n  if (!data.hasPermission) throw new Error('No permission');\n\n  // Main logic\n  // ... clearer flow ...\n}`;
      break;

    case 'extract_constants':
      examples.description = 'Extract magic numbers and strings to named constants';
      examples.before = `function ${func.name}(items) {\n  if (items.length > 10) {\n    return items.slice(0, 5);\n  }\n  return items;\n}`;
      examples.after = `const MAX_ITEMS = 10;\nconst DEFAULT_LIMIT = 5;\n\nfunction ${func.name}(items) {\n  if (items.length > MAX_ITEMS) {\n    return items.slice(0, DEFAULT_LIMIT);\n  }\n  return items;\n}`;
      break;

    case 'extract_class':
      examples.description = 'Extract related functions into a class';
      examples.before = `// ${func.linesOfCode} lines with multiple responsibilities\nfunction ${func.name}() { /* ... */ }\nfunction helper1() { /* ... */ }\nfunction helper2() { /* ... */ }\nfunction helper3() { /* ... */ }`;
      examples.after = `class ${func.name}Manager {\n  constructor() {\n    this.state = null;\n  }\n\n  ${func.name}() {\n    this.helper1();\n    this.helper2();\n    this.helper3();\n  }\n\n  helper1() { /* ... */ }\n  helper2() { /* ... */ }\n  helper3() { /* ... */ }\n}`;
      break;
  }

  return examples;
}

/**
 * Format refactoring suggestions as text
 * @param {Array} suggestions - Array of refactoring suggestions
 * @param {number} totalFunctionsAnalyzed - Total number of functions analyzed
 * @returns {string} Formatted markdown output
 */
function formatRefactoringSuggestions(suggestions, totalFunctionsAnalyzed) {
  const lines = [];

  lines.push('# Refactoring Suggestions');
  lines.push('');
  lines.push(`**${OUTPUT_MESSAGES.TOTAL_ANALYZED}**: ${totalFunctionsAnalyzed}`);
  lines.push(`**${OUTPUT_MESSAGES.SUGGESTIONS_GENERATED}**: ${suggestions.length}`);
  lines.push('');

  // Group by priority
  const highPriority = suggestions.filter(s => s.priority === 'HIGH');
  const mediumPriority = suggestions.filter(s => s.priority === 'MEDIUM');
  const lowPriority = suggestions.filter(s => s.priority === 'LOW');

  if (highPriority.length > 0) {
    lines.push(`## ${EMOJIS.HIGH_PRIORITY} ${OUTPUT_MESSAGES.HIGH_PRIORITY} (${highPriority.length})`);
    lines.push('');
    for (const suggestion of highPriority) {
      formatSuggestion(lines, suggestion);
    }
  }

  if (mediumPriority.length > 0) {
    lines.push(`## ${EMOJIS.MEDIUM_PRIORITY} ${OUTPUT_MESSAGES.MEDIUM_PRIORITY} (${mediumPriority.length})`);
    lines.push('');
    for (const suggestion of mediumPriority) {
      formatSuggestion(lines, suggestion);
    }
  }

  if (lowPriority.length > 0) {
    lines.push(`## ${EMOJIS.LOW_PRIORITY} ${OUTPUT_MESSAGES.LOW_PRIORITY} (${lowPriority.length})`);
    lines.push('');
    for (const suggestion of lowPriority) {
      formatSuggestion(lines, suggestion);
    }
  }

  return lines.join('\n');
}

/**
 * Format a single suggestion with enhanced impact-aware details
 * @param {Array} lines - Array to append formatted lines to
 * @param {Object} suggestion - Suggestion object to format
 */
function formatSuggestion(lines, suggestion) {
  lines.push(`### ${suggestion.function.name}`);
  lines.push('');
  lines.push(`**${OUTPUT_MESSAGES.FILE}**: ${suggestion.function.file}:${suggestion.function.line}`);
  lines.push(`**${OUTPUT_MESSAGES.TYPE}**: ${suggestion.refactoringType.replace(/_/g, ' ').toUpperCase()}`);
  lines.push(`**${OUTPUT_MESSAGES.PRIORITY}**: ${suggestion.priority}`);
  lines.push('');

  lines.push(`**${OUTPUT_MESSAGES.CURRENT_METRICS}**:`);
  lines.push(`- ${OUTPUT_MESSAGES.CYCLOMATIC}: ${suggestion.currentMetrics.cyclomatic} (decision points)`);
  lines.push(`- ${OUTPUT_MESSAGES.COGNITIVE}: ${suggestion.currentMetrics.cognitive} (nesting complexity)`);
  lines.push(`- ${OUTPUT_MESSAGES.MAINTAINABILITY}: ${suggestion.currentMetrics.maintainability}/171 (higher = better)`);
  lines.push('');

  // Calculate improvement percentages
  const cyclomaticImprovement = ((suggestion.currentMetrics.cyclomatic - suggestion.projectedMetrics.cyclomatic) / suggestion.currentMetrics.cyclomatic * 100).toFixed(0);
  const cognitiveImprovement = ((suggestion.currentMetrics.cognitive - suggestion.projectedMetrics.cognitive) / suggestion.currentMetrics.cognitive * 100).toFixed(0);

  lines.push(`**${OUTPUT_MESSAGES.PROJECTED_METRICS}**:`);
  lines.push(`- ${OUTPUT_MESSAGES.CYCLOMATIC}: ${suggestion.projectedMetrics.cyclomatic} (${cyclomaticImprovement}% reduction)`);
  lines.push(`- ${OUTPUT_MESSAGES.COGNITIVE}: ${suggestion.projectedMetrics.cognitive} (${cognitiveImprovement}% reduction)`);

  // Calculate projected maintainability
  const loc = Math.max(1, suggestion.function.linesOfCode || 50);
  const projectedMaintainability = Math.min(171, 171 - 0.23 * suggestion.projectedMetrics.cyclomatic - 16.2 * Math.log(loc)).toFixed(1);
  const maintainabilityImprovement = (projectedMaintainability - parseFloat(suggestion.currentMetrics.maintainability)).toFixed(1);
  lines.push(`- ${OUTPUT_MESSAGES.MAINTAINABILITY}: ${projectedMaintainability}/171 (+${maintainabilityImprovement})`);
  lines.push('');

  // ENHANCED: Impact-aware analysis with breakdown
  lines.push(`**${OUTPUT_MESSAGES.IMPACT_ANALYSIS}**:`);
  lines.push(`- Impact: ${suggestion.impact}/10`);

  // Show impact breakdown if available
  if (suggestion.impactDetails && suggestion.impactDetails.breakdown) {
    const breakdown = suggestion.impactDetails.breakdown;
    lines.push(`- **Impact Breakdown:**`);
    lines.push(`  - Complexity: ${breakdown.complexity.toFixed(0)}/30`);

    if (breakdown.callFrequency) {
      const cf = breakdown.callFrequency;
      const label = cf.label === 'High' ? '🔴' : cf.label === 'Medium' ? '🟡' : '🟢';
      lines.push(`  - Call Frequency: ${label} (${cf.count} calls) - ${cf.impact.toFixed(0)}/40`);
    }

    lines.push(`  - Lines of Code: ${breakdown.linesOfCode.toFixed(0)}/20`);
    lines.push(`  - Layer Importance: ${breakdown.layerImportance}/10`);
  }

  lines.push(`- Effort: ${suggestion.effort}/10`);

  // ENHANCED: Risk tier with details
  if (suggestion.riskTier) {
    const tierEmoji = suggestion.riskTier === 'HIGH' ? '🔴' :
                      suggestion.riskTier === 'MEDIUM' ? '🟡' : '🟢';
    lines.push(`- Risk Tier: ${tierEmoji} ${suggestion.riskTier} (${suggestion.risk}/10)`);

    // Show risk details if available
    if (suggestion.riskDetails && suggestion.riskDetails.length > 0) {
      lines.push(`  **Risk Factors:**`);
      for (const detail of suggestion.riskDetails.slice(0, 4)) {
        lines.push(`  - ${detail}`);
      }
      if (suggestion.riskDetails.length > 4) {
        lines.push(`  - ... and ${suggestion.riskDetails.length - 4} more factors`);
      }
    }
  } else {
    lines.push(`- Risk: ${suggestion.risk}/10`);
  }

  // ENHANCED: Call frequency and test coverage indicators
  lines.push('');
  lines.push(`**Additional Context:**`);
  const callFreq = suggestion.callFrequency || 0;
  const callBadge = callFreq > 10 ? '🔥' : callFreq > 3 ? '📞' : '📵';
  lines.push(`- ${callBadge} Called ${callFreq} time${callFreq !== 1 ? 's' : ''} in the codebase`);

  const testBadge = suggestion.hasTestCoverage ? '✅' : '❌';
  lines.push(`- ${testBadge} Test coverage: ${suggestion.hasTestCoverage ? 'Found' : 'Not found nearby'}`);
  lines.push('');

  if (suggestion.hnwImpact) {
    lines.push(`**${OUTPUT_MESSAGES.HNW_IMPACT}**: ${suggestion.hnwImpact.impact.toUpperCase()}`);
    lines.push('');
    for (const explanation of suggestion.hnwImpact.explanation) {
      lines.push(`- ${explanation}`);
    }
    lines.push('');
  }

  if (suggestion.examples.description) {
    lines.push(`**${OUTPUT_MESSAGES.REFACTORING}**: ${suggestion.examples.description}`);
    lines.push('');
    lines.push(`**${OUTPUT_MESSAGES.BEFORE}**:`);
    lines.push('```javascript');
    lines.push(suggestion.examples.before);
    lines.push('```');
    lines.push('');
    lines.push(`**${OUTPUT_MESSAGES.AFTER}**:`);
    lines.push('```javascript');
    lines.push(suggestion.examples.after);
    lines.push('```');
    lines.push('');
  }
}
