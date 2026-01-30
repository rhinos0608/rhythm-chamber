/**
 * MCP Tool: get_compilation_errors
 * Get compilation/lint errors with actionable fixes
 */

import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { logger } from '../utils/logger.js';
import { createPartialResponse, createErrorResponse, calculateConfidence } from '../errors/partial.js';
import {
  validateTarget,
  validateSeverity,
  getFilesInDirectory,
  ValidationError
} from '../utils/validation.js';

/**
 * Tool schema definition
 */
export const schema = {
  name: 'get_compilation_errors',
  description: 'Get compilation errors, syntax errors, and lint errors with precise locations, suggested fixes, and priority ranking. Combines Babel parsing for syntax errors and ESLint for code quality issues.',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        description: 'File or directory to analyze. Paths are relative to project root. Examples: "js/storage/indexed-db.js" or { "filePath": "js/storage/indexed-db.js" } or { "directory": "js/storage" }',
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
      severity: {
        type: 'string',
        enum: ['all', 'error', 'warning'],
        default: 'all',
        description: 'Filter by severity level'
      },
      includeContext: {
        type: 'boolean',
        default: true,
        description: 'Include code context around errors'
      }
    }
  },
  required: ['target'],
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot) => {
  const { target, severity = 'all', includeContext = true } = args;

  logger.info('get_compilation_errors called with:', { target, severity, includeContext });

  try {
    // Validate and normalize target using strict validation
    const validatedTarget = validateTarget(target, projectRoot);

    // Validate severity
    const validatedSeverity = validateSeverity(severity);

    // Determine target files
    let targetFiles = [];
    let isDirectory = false;

    if (validatedTarget.type === 'directory') {
      targetFiles = getFilesInDirectory(validatedTarget.path, projectRoot);
      isDirectory = true;
    } else {
      targetFiles = [validatedTarget.path];
    }

    if (targetFiles.length === 0) {
      return createErrorResponse('No files to analyze', {
        target: validatedTarget.relative,
        isDirectory
      });
    }

    logger.info(`Analyzing ${targetFiles.length} files for errors`);

    // Collect all errors
    const allErrors = [];
    const warnings = [];
    let processedFiles = 0;
    let failedFiles = 0;

    for (const file of targetFiles) {
      try {
        // Skip non-JS files
        if (!file.endsWith('.js')) {
          continue;
        }

        // Get syntax errors (Babel parsing)
        const syntaxErrors = getSyntaxErrors(file, projectRoot);
        allErrors.push(...syntaxErrors);

        // Get lint errors (ESLint)
        const lintErrors = await getLintErrors(file, projectRoot, validatedSeverity);
        allErrors.push(...lintErrors);

        processedFiles++;

      } catch (error) {
        failedFiles++;
        warnings.push(`Failed to analyze ${file}: ${error.message}`);
        logger.warn(`Error analyzing ${file}:`, error);
      }
    }

    // Filter by severity
    const filteredErrors = validatedSeverity === 'all' ? allErrors :
                          validatedSeverity === 'error' ? allErrors.filter(e => e.severity === 'error') :
                          allErrors.filter(e => e.severity === 'warning');

    // Group errors by code for summary
    const errorsByCode = {};
    for (const error of filteredErrors) {
      if (!errorsByCode[error.code]) {
        errorsByCode[error.code] = 0;
      }
      errorsByCode[error.code]++;
    }

    // Generate fix priority
    const fixPriority = Object.entries(errorsByCode)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => `Fix ${code} first (${count} occurrence${count > 1 ? 's' : ''})`);

    // Build result
    // Store original unfiltered counts for "no results" messages
    const totalErrors = allErrors.filter(e => e.severity === 'error').length;
    const totalWarnings = allErrors.filter(e => e.severity === 'warning').length;

    const result = {
      target: validatedTarget.relative,
      summary: {
        total_files: targetFiles.length,
        processed_files: processedFiles,
        failed_files: failedFiles,
        total_errors: filteredErrors.filter(e => e.severity === 'error').length,
        total_warnings: filteredErrors.filter(e => e.severity === 'warning').length,
        total_errors_unfiltered: totalErrors,
        total_warnings_unfiltered: totalWarnings,
        by_code: errorsByCode,
        fix_priority: fixPriority
      },
      errors: filteredErrors.map(error => ({
        file: error.file,
        line: error.line,
        column: error.column,
        severity: error.severity,
        code: error.code,
        message: error.message,
        context: includeContext ? error.context : undefined,
        suggested_fix: error.suggested_fix,
        related_symbols: error.related_symbols || []
      }))
    };

    // Format output
    const output = formatErrors(result);

    // Check completeness
    const completeness = processedFiles === targetFiles.length ? 100 :
                        Math.round((processedFiles / targetFiles.length) * 100);
    const confidence = calculateConfidence(completeness, failedFiles);

    if (completeness < 100 || confidence === 'LOW') {
      // Partial result
      return createPartialResponse({
        content: [{ type: 'text', text: output }]
      }, {
        completeness,
        messages: warnings,
        suggestions: fixPriority.slice(0, 3)
      });
    }

    return {
      content: [{ type: 'text', text: output }]
    };

  } catch (error) {
    logger.error('Error in get_compilation_errors:', error);

    // Handle ValidationError specifically with detailed output
    if (error instanceof ValidationError) {
      const details = error.details || {};
      const lines = [];

      lines.push(`# Validation Error`);
      lines.push('');
      lines.push(`**Error:** ${error.message}`);
      lines.push('');

      if (details.path) {
        lines.push(`**Path:** ${details.path}`);
      }
      if (details.resolved) {
        lines.push(`**Resolved:** ${details.resolved}`);
      }
      if (details.received) {
        lines.push(`**Received:** ${JSON.stringify(details.received)}`);
      }
      if (details.hint) {
        lines.push(`**Hint:** ${details.hint}`);
      }

      lines.push('');
      lines.push(`**Expected format:**`);
      lines.push('```json');
      lines.push('{');
      lines.push('  "target": "path/to/file.js"');
      lines.push('  // or: { "filePath": "path/to/file.js" }');
      lines.push('  // or: { "directory": "path/to/dir" }');
      lines.push('}');
      lines.push('```');

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        isError: true
      };
    }

    return createErrorResponse(error);
  }
};

/**
 * Get syntax errors by parsing with Babel
 */
function getSyntaxErrors(filePath, projectRoot) {
  const errors = [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parser = require('@babel/parser');

    parser.parse(content, {
      sourceType: 'module',
      plugins: ['jsx']
    });

  } catch (error) {
    if (error.loc) {
      const lines = readFileSync(filePath, 'utf-8').split('\n');
      const errorLine = error.loc.line - 1;

      errors.push({
        file: filePath.replace(projectRoot + '/', ''),
        line: error.loc.line,
        column: error.loc.column,
        severity: 'error',
        code: 'SYNTAX_ERROR',
        message: error.message,
        context: extractErrorContext(lines, errorLine),
        suggested_fix: suggestSyntaxFix(error, lines[errorLine])
      });
    } else {
      errors.push({
        file: filePath.replace(projectRoot + '/', ''),
        line: 0,
        column: 0,
        severity: 'error',
        code: 'PARSE_ERROR',
        message: error.message
      });
    }
  }

  return errors;
}

/**
 * Get lint errors using ESLint
 */
async function getLintErrors(filePath, projectRoot, severity) {
  const errors = [];

  try {
    const { ESLint } = require('eslint');
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const eslint = new ESLint({
      cwd: projectRoot,
      useEslintrc: true,
      overrideConfig: {
        rules: {
          'no-undef': 'error',
          'no-unused-vars': 'warn',
          'no-console': 'off'
        }
      }
    });

    const results = await eslint.lintText(content, { filePath });

    for (const result of results) {
      for (const message of result.messages) {
        // Filter by severity
        if (severity === 'error' && message.severity !== 2) continue;
        if (severity === 'warning' && message.severity !== 1) continue;

        const errorLine = message.line - 1;

        errors.push({
          file: filePath.replace(projectRoot + '/', ''),
          line: message.line,
          column: message.column,
          severity: message.severity === 2 ? 'error' : 'warning',
          code: message.ruleId,
          message: message.message,
          context: extractErrorContext(lines, errorLine),
          suggested_fix: suggestLintFix(message, lines[errorLine])
        });
      }
    }

  } catch (error) {
    // ESLint not available or failed, skip lint errors
    logger.warn(`ESLint failed for ${filePath}:`, error.message);
  }

  return errors;
}

/**
 * Extract context around error line
 */
function extractErrorContext(lines, errorLine) {
  const start = Math.max(0, errorLine - 2);
  const end = Math.min(lines.length, errorLine + 3);

  const context = [];
  for (let i = start; i < end; i++) {
    const marker = i === errorLine ? '>' : ' ';
    context.push(`${marker} ${lines[i]}`);
  }

  return context.join('\n');
}

/**
 * Suggest fix for syntax error
 */
function suggestSyntaxFix(error, line) {
  const message = error.message.toLowerCase();

  // Common syntax errors
  if (message.includes('unexpected token')) {
    return 'Check for missing brackets, parentheses, or semicolons';
  }
  if (message.includes('missing') && message.includes('after')) {
    return 'Add the missing token or check for incomplete statement';
  }
  if (message.includes('unexpected')) {
    return 'Remove unexpected token or add proper syntax';
  }

  return 'Review syntax and compare with similar working code';
}

/**
 * Suggest fix for lint error
 */
function suggestLintFix(message, line) {
  const ruleId = message.ruleId;

  // Common lint rules
  switch (ruleId) {
    case 'no-undef':
      return `Add import or declaration for '${message.message.match(/'([^']+)'/)?.[1]}'`;
    case 'no-unused-vars':
      return 'Remove unused variable or add export if intentional';
    case 'no-console':
      return 'Replace with logger or remove console statement';
    default:
      return `Review ${ruleId} documentation for fix options`;
  }
}

/**
 * Format errors for display
 */
function formatErrors(result) {
  const lines = [];

  lines.push(`# Compilation Errors: ${result.target}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`**Files Analyzed**: ${result.summary.processed_files}/${result.summary.total_files}`);
  lines.push(`**Errors**: ${result.summary.total_errors}`);
  lines.push(`**Warnings**: ${result.summary.total_warnings}`);
  lines.push('');

  if (result.summary.fix_priority.length > 0) {
    lines.push('### Fix Priority');
    lines.push('');
    for (const priority of result.summary.fix_priority) {
      lines.push(`1. ${priority}`);
    }
    lines.push('');
  }

  // Errors grouped by file
  if (result.errors.length > 0) {
    const groupedByFile = {};
    for (const error of result.errors) {
      if (!groupedByFile[error.file]) {
        groupedByFile[error.file] = [];
      }
      groupedByFile[error.file].push(error);
    }

    lines.push('## Errors');
    lines.push('');

    for (const [file, fileErrors] of Object.entries(groupedByFile)) {
      lines.push(`### ${file}`);
      lines.push('');

      for (const error of fileErrors) {
        const icon = error.severity === 'error' ? '❌' : '⚠️';
        lines.push(`${icon} **Line ${error.line}:${error.column}** [\`${error.code}\`]`);
        lines.push(`   ${error.message}`);

        if (error.context) {
          lines.push(`   \`\`\``);
          lines.push(`   ${error.context.split('\n').join('\n   ')}`);
          lines.push(`   \`\`\``);
        }

        if (error.suggested_fix) {
          lines.push(`   💡 ${error.suggested_fix}`);
        }

        lines.push('');
      }
    }
  } else {
    // No errors found - provide more context
    const hasWarnings = result.summary.total_warnings_unfiltered > 0;
    const hasErrors = result.summary.total_errors_unfiltered > 0;

    if (hasWarnings && !hasErrors) {
      lines.push('## ✅ No Errors Found (Warnings Present)');
      lines.push('');
      lines.push(`No syntax or lint errors were found. However, ${result.summary.total_warnings_unfiltered} warning(s) were detected.`);
      lines.push('');
      lines.push('**Note:** Warnings were not included in this report. To see warnings, run again with `severity: "all"` or `severity: "warning"`.');
      lines.push('');
    } else if (!hasErrors && !hasWarnings) {
      lines.push('## ✅ No Errors or Warnings Found');
      lines.push('');
      lines.push('The code passed all syntax and lint checks!');
      lines.push('');
      lines.push(`**Files Analyzed:** ${result.summary.processed_files}`);
      lines.push('');
    } else {
      lines.push('## ✅ No Results Matching Filter');
      lines.push('');
      if (hasErrors) {
        lines.push(`- ${result.summary.total_errors_unfiltered} error(s) exist but may be filtered by your settings.`);
      }
      if (hasWarnings) {
        lines.push(`- ${result.summary.total_warnings_unfiltered} warning(s) exist but may be filtered by your settings.`);
      }
      lines.push('');
      lines.push('**Note:** Try running again with `severity: "all"` to see all issues.');
      lines.push('');
    }
  }

  return lines.join('\n');
}
