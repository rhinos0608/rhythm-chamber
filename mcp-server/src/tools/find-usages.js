/**
 * MCP Tool: find_all_usages
 * Find all usages of a function/class/variable with precise locations
 */

import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { globSync } from 'glob';
import parser from '@babel/parser';
import traverse from '@babel/traverse';
import { HNWAnalyzer } from '../analyzers/hnw-analyzer.js';
import { CacheManager } from '../cache/cache-manager.js';
import { logger } from '../utils/logger.js';
import { createPartialResponse, createErrorResponse } from '../errors/partial.js';

const cache = new CacheManager();

/**
 * Tool schema definition
 */
export const schema = {
  name: 'find_all_usages',
  description:
    'Find all usages of a function, class, or variable with precise file:line:column locations. Supports direct calls and detects dynamic calls with lower certainty.',
  inputSchema: {
    type: 'object',
    properties: {
      symbolName: {
        type: 'string',
        description: 'Name of the symbol to find (e.g., "handleMessage", "TabCoordinator")',
      },
      symbolType: {
        type: 'string',
        enum: ['function', 'class', 'variable'],
        description: 'Type of symbol to search for',
      },
      filePath: {
        type: 'string',
        description: 'Search within specific file only (optional)',
      },
      includeDynamic: {
        type: 'boolean',
        default: true,
        description: 'Include dynamic calls (call(), apply(), eval()) with lower certainty',
      },
    },
    required: ['symbolName', 'symbolType'],
  },
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot) => {
  const { symbolName, symbolType, filePath, includeDynamic = true } = args;

  logger.info('find_all_usages called with:', { symbolName, symbolType, filePath, includeDynamic });

  try {
    // Validate inputs
    if (!symbolName || symbolName.trim() === '') {
      throw new Error('symbolName cannot be empty');
    }

    // Build file list to search
    const filesToSearch = filePath ? [resolve(projectRoot, filePath)] : getSourceFiles(projectRoot);

    if (filesToSearch.length === 0) {
      throw new Error('No files found to search');
    }

    logger.info(`Searching ${filesToSearch.length} files for usages of "${symbolName}"`);

    // Find usages
    const usages = [];
    const warnings = [];
    let processedFiles = 0;

    for (const file of filesToSearch) {
      if (!existsSync(file)) {
        warnings.push(`File not found: ${file}`);
        continue;
      }

      try {
        const fileUsages = findUsagesInFile(file, symbolName, symbolType, includeDynamic, projectRoot);
        usages.push(...fileUsages);
        processedFiles++;
      } catch (error) {
        // Partial analysis - continue with other files
        warnings.push(`Failed to analyze ${file}: ${error.message}`);
        logger.warn(`Error analyzing ${file}:`, error);
      }
    }

    // Analyze usage patterns
    const riskyUsages = identifyRiskyUsages(usages, symbolType);

    const result = {
      symbol: {
        name: symbolName,
        type: symbolType,
        file: filePath || 'entire project',
      },
      usages: usages.map(u => ({
        file: u.file,
        line: u.line,
        column: u.column,
        context: u.context,
        callType: u.callType,
        certainty: u.certainty,
      })),
      summary: {
        total_usages: usages.length,
        unique_files: new Set(usages.map(u => u.file)).size,
        direct_calls: usages.filter(u => u.callType === 'direct').length,
        dynamic_calls: usages.filter(u => u.callType === 'dynamic').length,
      },
      risky_usages: riskyUsages,
    };

    // Format output
    const output = formatUsages(result);

    // Check completeness
    const completeness =
      processedFiles === filesToSearch.length
        ? 100
        : Math.round((processedFiles / filesToSearch.length) * 100);

    if (completeness < 100) {
      // Partial result - some files failed
      return createPartialResponse(
        {
          content: [{ type: 'text', text: output }],
        },
        {
          completeness,
          messages: warnings,
          suggestions: [
            `Found ${usages.length} usages across ${processedFiles}/${filesToSearch.length} files`,
            warnings.length > 0 ? 'Some files could not be analyzed' : null,
          ].filter(Boolean),
        }
      );
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error) {
    logger.error('Error in find_all_usages:', error);
    return createErrorResponse(error);
  }
};

/**
 * Find all source files in the project
 */
function getSourceFiles(projectRoot) {
  // Use globSync imported at top of file

  // Search for JavaScript files in key directories
  const patterns = [
    'js/**/*.js',
    'src/**/*.js',
    '!**/node_modules/**',
    '!**/*.test.js',
    '!**/*.spec.js',
  ];

  const files = globSync(patterns, { cwd: projectRoot, absolute: true });
  return files;
}

/**
 * Find usages in a single file
 */
function findUsagesInFile(filePath, symbolName, symbolType, includeDynamic, projectRoot) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const usages = [];

  // Try AST parsing first (for direct calls)
  try {
    // Use parser and traverse imported at top of file
    const ast = parser.parse(content, {
      sourceType: 'module',
      plugins: ['jsx'],
    });

    // Find symbol declarations to get scope
    const declarations = new Map();

    traverse.default(ast, {
      // Find function/class/variable declarations
      FunctionDeclaration(path) {
        if (path.node.id && path.node.id.name === symbolName && symbolType === 'function') {
          declarations.set(path.scope.uid, path);
        }
      },
      ClassDeclaration(path) {
        if (path.node.id && path.node.id.name === symbolName && symbolType === 'class') {
          declarations.set(path.scope.uid, path);
        }
      },
      VariableDeclarator(path) {
        if (path.node.id && path.node.id.name === symbolName && symbolType === 'variable') {
          declarations.set(path.scope.uid, path);
        }
      },

      // Find usages (identifiers)
      Identifier(path) {
        if (path.node.name === symbolName && !path.isBindingIdentifier()) {
          // This is a usage, not a declaration
          const loc = path.node.loc;
          if (loc) {
            usages.push({
              file: filePath.replace(projectRoot + '/', ''),
              line: loc.start.line,
              column: loc.start.column + 1, // 0-indexed to 1-indexed
              context: extractContext(lines, loc.start.line, loc.start.column),
              callType: determineCallType(path),
              certainty: 1.0,
            });
          }
        }
      },
    });
  } catch (error) {
    // AST parsing failed, fall back to regex
    logger.warn(`AST parsing failed for ${filePath}, using regex fallback:`, error.message);
    const regexUsages = findUsagesWithRegex(content, lines, filePath, symbolName, symbolType);
    usages.push(...regexUsages);
  }

  // Find dynamic calls if requested
  if (includeDynamic) {
    const dynamicUsages = findDynamicUsages(content, lines, filePath, symbolName);
    usages.push(...dynamicUsages);
  }

  return usages;
}

/**
 * Determine if this is a direct call, usage, or reference
 */
function determineCallType(path) {
  // Check if part of a call expression
  if (path.parentPath.isCallExpression() && path.parentPath.node.callee === path.node) {
    return 'direct';
  }

  // Check if member access
  if (path.parentPath.isMemberExpression()) {
    return 'reference';
  }

  return 'usage';
}

/**
 * Extract context code around a usage
 */
function extractContext(lines, lineNum, column) {
  const startLine = Math.max(0, lineNum - 2);
  const endLine = Math.min(lines.length, lineNum + 2);

  const context = [];
  for (let i = startLine; i < endLine; i++) {
    const prefix = i === lineNum - 1 ? '> ' : '  ';
    context.push(`${prefix}${lines[i]}`);
  }

  return context.join('\n');
}

/**
 * Find usages using regex (fallback when AST parsing fails)
 */
function findUsagesWithRegex(content, lines, filePath, symbolName, symbolType) {
  const usages = [];

  // Build regex pattern for the symbol
  const escapedName = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escapedName}\\b`, 'g');

  let match;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;

    // Reset regex for each line
    pattern.lastIndex = 0;

    while ((match = pattern.exec(line)) !== null) {
      usages.push({
        file: filePath.replace(process.cwd() + '/', ''),
        line: lineNumber,
        column: match.index + 1,
        context: extractContext(lines, lineNumber, match.index),
        callType: 'unknown',
        certainty: 0.7, // Lower certainty for regex
      });
    }
  }

  return usages;
}

/**
 * Find dynamic calls (call(), apply(), eval())
 */
function findDynamicUsages(content, lines, filePath, symbolName) {
  const usages = [];

  // Patterns for dynamic calls that might reference the symbol
  const patterns = [
    // call() and apply()
    new RegExp(`\\.call\\s*\\([^)]*${symbolName}`, 'g'),
    new RegExp(`\\.apply\\s*\\([^)]*${symbolName}`, 'g'),
    // eval with template literals or string concatenation
    new RegExp(`eval\\s*\\([^)]*['"\`].*${symbolName}`, 'g'),
    // Bracket notation
    new RegExp(`\\[\\s*['"\`]${symbolName}['"\`]\\s*\\]`, 'g'),
  ];

  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;

    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(line)) !== null) {
        usages.push({
          file: filePath.replace(process.cwd() + '/', ''),
          line: lineNumber,
          column: match.index + 1,
          context: extractContext(lines, lineNumber, match.index),
          callType: 'dynamic',
          certainty: 0.5, // Lower certainty for dynamic calls
        });
      }
    }
  }

  return usages;
}

/**
 * Identify potentially risky usages
 */
function identifyRiskyUsages(usages, symbolType) {
  const risky = [];

  for (const usage of usages) {
    const issues = [];

    // Check for dynamic calls (risky)
    if (usage.callType === 'dynamic') {
      issues.push('Dynamic call - cannot be statically verified');
    }

    // Check for calls without error handling
    if (usage.context.includes('try')) {
      // Has error handling
      continue;
    }

    if (usage.callType === 'direct' && !usage.context.includes('catch')) {
      issues.push('Direct call without visible error handling');
    }

    if (issues.length > 0) {
      risky.push({
        location: `${usage.file}:${usage.line}:${usage.column}`,
        issues: issues,
        suggestion: 'Add error handling or verify the call is safe',
      });
    }
  }

  return risky;
}

/**
 * Format usages for display
 */
function formatUsages(result) {
  const lines = [];

  lines.push(`# Symbol Usage Analysis: ${result.symbol.name}`);
  lines.push('');
  lines.push(`**Type**: ${result.symbol.type}`);
  lines.push(`**Scope**: ${result.symbol.file}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`**Total Usages**: ${result.summary.total_usages}`);
  lines.push(`**Unique Files**: ${result.summary.unique_files}`);
  lines.push(`**Direct Calls**: ${result.summary.direct_calls}`);
  lines.push(`**Dynamic Calls**: ${result.summary.dynamic_calls}`);
  lines.push('');

  // Usages by file
  if (result.usages.length > 0) {
    lines.push('## Usages');
    lines.push('');

    const groupedByFile = {};
    for (const usage of result.usages) {
      if (!groupedByFile[usage.file]) {
        groupedByFile[usage.file] = [];
      }
      groupedByFile[usage.file].push(usage);
    }

    for (const [file, fileUsages] of Object.entries(groupedByFile)) {
      lines.push(`### ${file}`);
      lines.push('');

      for (const usage of fileUsages) {
        const certainty =
          usage.certainty === 1.0 ? '✓' : `? (${Math.round(usage.certainty * 100)}%)`;
        lines.push(`- **Line ${usage.line}:${usage.column}** (${usage.callType}, ${certainty})`);
        lines.push('  ```');
        lines.push(`  ${usage.context.split('\n').find(l => l.trim().length > 0)}`);
        lines.push('  ```');
        lines.push('');
      }
    }
  } else {
    lines.push('No usages found.');
    lines.push('');
  }

  // Risky usages
  if (result.risky_usages.length > 0) {
    lines.push('## Potentially Risky Usages');
    lines.push('');

    for (const risky of result.risky_usages) {
      lines.push(`### ${risky.location}`);
      lines.push('');
      for (const issue of risky.issues) {
        lines.push(`- ⚠️ ${issue}`);
      }
      lines.push(`- 💡 ${risky.suggestion}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
