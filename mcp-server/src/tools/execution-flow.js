/**
 * MCP Tool: trace_execution_flow
 * Trace execution flow from a function with async pattern support and circular dependency detection
 */

import { resolve } from 'path';
import { readFileSync, statSync, existsSync } from 'fs';
import { parse } from '@babel/parser';
import { default as traverse } from '@babel/traverse';
import { ASTParser } from '../utils/parser.js';
import { CacheManager } from '../cache/cache-manager.js';
import { logger } from '../utils/logger.js';
import { createPartialResponse, createErrorResponse } from '../errors/partial.js';

// Ensure we get the default export (the traverse function)
const traverseFn = traverse.default || traverse;

const cache = new CacheManager();

/**
 * Emoji constants for consistent emoji usage across formatters
 */
const EMOJIS = {
  WARNING: '⚠️',
  ARROW_DOWN: '↓',
};

/**
 * Built-in JavaScript methods to filter out from execution traces
 * These are standard library methods that don't add value to the trace
 */
const BUILT_IN_METHODS = new Set([
  // Array methods
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'slice',
  'concat',
  'forEach',
  'map',
  'filter',
  'reduce',
  'reduceRight',
  'find',
  'findIndex',
  'some',
  'every',
  'includes',
  'indexOf',
  'lastIndexOf',
  'join',
  'sort',
  'reverse',
  'flat',
  'flatMap',
  'entries',
  'keys',
  'values',
  'at',
  'fill',
  'copyWithin',
  'toString',
  'toLocaleString',
  'length',
  // Object methods
  'keys',
  'values',
  'entries',
  'hasOwnProperty',
  'propertyIsEnumerable',
  'isPrototypeOf',
  'toString',
  'toLocaleString',
  'assign',
  'create',
  'defineProperty',
  'defineProperties',
  'freeze',
  'seal',
  'preventExtensions',
  'isFrozen',
  'isSealed',
  'isExtensible',
  'getOwnPropertyDescriptor',
  'getOwnPropertyDescriptors',
  'getOwnPropertyNames',
  'getOwnPropertySymbols',
  'fromEntries',
  'groupBy',
  // String methods
  'charAt',
  'charCodeAt',
  'codePointAt',
  'concat',
  'endsWith',
  'includes',
  'indexOf',
  'lastIndexOf',
  'localeCompare',
  'match',
  'matchAll',
  'normalize',
  'padEnd',
  'padStart',
  'repeat',
  'replace',
  'replaceAll',
  'search',
  'slice',
  'split',
  'startsWith',
  'substring',
  'toLocaleLowerCase',
  'toLocaleUpperCase',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'trimEnd',
  'trimStart',
  'toString',
  'valueOf',
  'length',
  // Number methods
  'toExponential',
  'toFixed',
  'toPrecision',
  'toString',
  'valueOf',
  // Math methods
  'abs',
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atan2',
  'atanh',
  'cbrt',
  'ceil',
  'clz32',
  'cos',
  'cosh',
  'exp',
  'expm1',
  'floor',
  'fround',
  'hypot',
  'imul',
  'log',
  'log10',
  'log1p',
  'log2',
  'max',
  'min',
  'pow',
  'random',
  'round',
  'sign',
  'sin',
  'sinh',
  'sqrt',
  'tan',
  'tanh',
  'trunc',
  // Promise methods
  'then',
  'catch',
  'finally',
  // Map/Set methods
  'add',
  'delete',
  'clear',
  'has',
  'get',
  'set',
  // Console methods
  'log',
  'warn',
  'error',
  'info',
  'debug',
  'trace',
  'table',
  'dir',
  'count',
  'countReset',
  'group',
  'groupEnd',
  'groupCollapsed',
  'time',
  'timeLog',
  'timeEnd',
  'assert',
  'clear',
  // JSON methods
  'parse',
  'stringify',
  // Common utility methods
  'bind',
  'call',
  'apply',
  // Async/await related (these are handled separately)
  'then',
  'catch',
]);

/**
 * Check if a function name is a built-in method
 */
function isBuiltInMethod(funcName) {
  if (!funcName || typeof funcName !== 'string') return false;

  // Direct match
  if (BUILT_IN_METHODS.has(funcName)) return true;

  // Check for common patterns like Array.prototype.push
  if (funcName.includes('.')) {
    const parts = funcName.split('.');
    const methodName = parts[parts.length - 1];
    return BUILT_IN_METHODS.has(methodName);
  }

  return false;
}

/**
 * Tool schema definition
 */
export const schema = {
  name: 'trace_execution_flow',
  description:
    'Trace execution flow from a function with async pattern support and circular dependency detection',
  inputSchema: {
    type: 'object',
    properties: {
      startFunction: {
        type: 'string',
        description: 'Function name to start tracing',
      },
      filePath: {
        type: 'string',
        description: 'File containing the function',
      },
      maxDepth: {
        type: 'number',
        default: 5,
        description: 'Maximum traversal depth (1-10)',
      },
      includeAsync: {
        type: 'boolean',
        default: true,
        description: 'Include async patterns',
      },
      detectCycles: {
        type: 'boolean',
        default: true,
        description: 'Detect circular flows',
      },
      filterBuiltIns: {
        type: 'boolean',
        default: true,
        description: 'Filter out built-in JavaScript methods (console.log, Array methods, etc.)',
      },
      format: {
        type: 'string',
        enum: ['text', 'mermaid', 'json'],
        default: 'text',
        description: 'Output format',
      },
    },
    required: ['startFunction', 'filePath'],
  },
};

/**
 * Handle tool execution
 */
/**
 * Validate path is within project root (security: prevent path traversal)
 */
function validatePath(projectRoot, targetPath) {
  const resolved = resolve(projectRoot, targetPath);
  const normalizedRoot = resolve(projectRoot);

  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(
      '[trace_execution_flow] Path traversal detected: Target path is outside project root\n' +
        `Requested: ${targetPath}\n` +
        `Resolved: ${resolved}\n` +
        `Project root: ${normalizedRoot}`
    );
  }

  return resolved;
}

export const handler = async (args, projectRoot) => {
  const {
    startFunction,
    filePath,
    maxDepth = 5,
    includeAsync = true,
    detectCycles = true,
    filterBuiltIns = true,
    format = 'text',
  } = args;

  logger.info('trace_execution_flow called with:', {
    startFunction,
    filePath,
    maxDepth,
    includeAsync,
    detectCycles,
    filterBuiltIns,
    format,
  });

  try {
    // Validate inputs
    if (maxDepth < 1 || maxDepth > 10) {
      throw new Error('[trace_execution_flow] maxDepth must be between 1 and 10');
    }

    // Security: Validate path is within project root
    const resolvedPath = validatePath(projectRoot, filePath);

    // Trace execution flow
    const flow = traceExecutionFlow(resolvedPath, startFunction, {
      projectRoot,
      maxDepth,
      includeAsync,
      detectCycles,
      filterBuiltIns,
    });

    // Format output
    let output;
    switch (format) {
      case 'mermaid':
        output = formatExecutionFlowMermaid(flow);
        break;
      case 'json':
        output = formatExecutionFlowJSON(flow);
        break;
      case 'text':
      default:
        output = formatExecutionFlowText(flow);
        break;
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error) {
    logger.error('Error in trace_execution_flow:', error);
    return createErrorResponse(error);
  }
};

/**
 * Trace execution flow from a function
 */
function traceExecutionFlow(filePath, functionName, options) {
  const { projectRoot, maxDepth, includeAsync, detectCycles, filterBuiltIns } = options;

  // Resource limit: Check file size before reading (DoS protection)
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const stats = statSync(filePath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(
      `[trace_execution_flow] File too large (${Math.round(stats.size / 1024 / 1024)}MB). ` +
        `Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`
    );
  }

  // Parse AST
  const content = readFileSync(filePath, 'utf-8');

  // Detect file extension for appropriate parser plugins
  const ext = filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : null;
  const ast = parse(content, {
    sourceType: 'module',
    plugins: [...(ext ? [ext] : []), 'jsx'],
  });

  // Find starting function
  const startFunc = findFunctionDeclaration(ast, functionName);
  if (!startFunc) {
    throw new Error(`[trace_execution_flow] Function ${functionName} not found in ${filePath}`);
  }

  // Extract import mappings for cross-file tracing
  const importMappings = extractImportMappings(
    ast,
    filePath.replace(projectRoot + '/', ''),
    projectRoot
  );

  // DEBUG: Log import mappings
  logger.info(`[trace_execution_flow] Extracted ${importMappings.size} import mappings`);
  for (const [name, info] of importMappings.entries()) {
    logger.info(`[trace_execution_flow]   ${name} -> ${info.source}`);
  }

  // File cache to avoid re-parsing files
  const fileCache = new Map();

  // Build call graph with cycle detection and cross-file tracing
  // Initial path includes the starting function's location
  const startKey = `${filePath}:${functionName}:${startFunc.node.loc.start.line}`;
  const callGraph = buildCallGraph(ast, startFunc, {
    maxDepth,
    includeAsync,
    detectCycles,
    filterBuiltIns,
    visited: new Set(),
    path: [startKey],
    filePath,
    projectRoot,
    importMappings,
    fileCache,
  });

  // Extract async patterns
  const asyncPatterns = includeAsync ? extractAsyncPatterns(ast, startFunc, filePath) : [];

  return {
    startFunction: {
      name: functionName,
      file: filePath.replace(projectRoot + '/', ''),
      line: startFunc.node.loc.start.line,
    },
    callGraph,
    asyncPatterns,
    summary: calculateFlowSummary(callGraph, asyncPatterns),
  };
}

/**
 * Find function declaration by name
 *
 * Uses a scoring system to prefer certain types of declarations:
 * - Score 10: FunctionDeclaration (top-level functions)
 * - Score 8: ClassMethod (ES6 class methods)
 * - Score 6: VariableDeclarator with function (const foo = () => {})
 * - Score 5: ObjectMethod (object method shorthand)
 * - Score 4: ObjectProperty (object property with function)
 * - Score 3: FunctionExpression (named function expressions)
 *
 * This ensures we find the most relevant declaration when multiple exist.
 */
function findFunctionDeclaration(ast, functionName) {
  let bestMatch = null;
  let bestScore = -1;

  traverseFn(ast, {
    FunctionDeclaration(path) {
      if (path.node.id && path.node.id.name === functionName) {
        // Prefer top-level declarations
        if (bestScore < 10) {
          bestMatch = path;
          bestScore = 10;
        }
      }
    },
    FunctionExpression(path) {
      if (path.node.id && path.node.id.name === functionName) {
        if (bestScore < 3) {
          bestMatch = path;
          bestScore = 3;
        }
      }
    },
    VariableDeclarator(path) {
      if (path.node.id && path.node.id.name === functionName) {
        // Only match if it's actually a function
        if (
          path.node.init &&
          (path.node.init.type === 'FunctionExpression' ||
            path.node.init.type === 'ArrowFunctionExpression')
        ) {
          if (bestScore < 6) {
            bestMatch = path;
            bestScore = 6;
          }
        }
      }
    },
    // Handle ES6 class methods (e.g., class Foo { bar() {} })
    ClassMethod(path) {
      const key = path.node.key;
      const matches =
        (key.type === 'Identifier' && key.name === functionName) ||
        (key.type === 'StringLiteral' && key.value === functionName) ||
        (key.type === 'PrivateIdentifier' && `#${key.name}` === functionName);

      if (matches && bestScore < 8) {
        bestMatch = path;
        bestScore = 8;
      }
    },
    // Handle object methods (e.g., { sendMessage() {...} })
    ObjectMethod(path) {
      const key = path.node.key;
      const matches =
        (key.type === 'Identifier' && key.name === functionName) ||
        (key.type === 'StringLiteral' && key.value === functionName);

      // Handle computed properties
      if (key.type === 'ComputedProperty' && key.value) {
        if (
          (key.value.type === 'StringLiteral' && key.value.value === functionName) ||
          (key.value.type === 'Identifier' && key.value.name === functionName)
        ) {
          if (bestScore < 5) {
            bestMatch = path;
            bestScore = 5;
          }
          return;
        }
      }

      if (matches && bestScore < 5) {
        bestMatch = path;
        bestScore = 5;
      }
    },
    // Handle object properties with arrow functions (e.g., { sendMessage: async () => {...} })
    ObjectProperty(path) {
      const key = path.node.key;
      const value = path.node.value;

      // Handle inline functions
      const isInlineFunction =
        value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression';

      // Handle function references
      const isFunctionReference = value.type === 'Identifier' && value.name === functionName;

      if (isInlineFunction || isFunctionReference) {
        const matches =
          (key.type === 'Identifier' && key.name === functionName) ||
          (key.type === 'StringLiteral' && key.value === functionName);

        // Handle computed properties
        if (key.type === 'ComputedProperty' && key.value) {
          if (
            (key.value.type === 'StringLiteral' && key.value.value === functionName) ||
            (key.value.type === 'Identifier' && key.value.name === functionName)
          ) {
            if (bestScore < 4) {
              bestMatch = path;
              bestScore = 4;
            }
            return;
          }
        }

        if (matches && bestScore < 4) {
          bestMatch = path;
          bestScore = 4;
        }
      }
    },
  });

  return bestMatch;
}

/**
 * Extract import mappings from AST
 * Maps imported names to their source files
 *
 * SECURITY: Validates that all resolved paths remain within project root
 * to prevent path traversal attacks.
 */
function extractImportMappings(ast, currentFile, projectRoot) {
  const imports = new Map(); // localName -> sourceFile

  // Normalize project root for consistent path comparison
  const normalizedProjectRoot = resolve(projectRoot);

  traverseFn(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      const specifiers = path.node.specifiers;

      // Resolve the import source to an absolute file path
      let resolvedFile = null;
      try {
        // Try to resolve relative to current file directory
        const currentDir = resolve(projectRoot, currentFile, '..');
        resolvedFile = resolve(currentDir, source);

        // SECURITY: Validate path is within project root (prevent path traversal)
        const resolvedNormalized = resolve(resolvedFile);
        if (
          !resolvedNormalized.startsWith(normalizedProjectRoot + '/') &&
          !resolvedNormalized.startsWith(normalizedProjectRoot + '\\') &&
          resolvedNormalized !== normalizedProjectRoot
        ) {
          logger.warn(
            `[trace_execution_flow] Import outside project root: ${source} -> ${resolvedFile}`
          );
          return; // Skip this import
        }

        // Check if it's a .js file (add extension if missing)
        if (
          !resolvedFile.endsWith('.js') &&
          !resolvedFile.endsWith('.mjs') &&
          !resolvedFile.endsWith('.cjs')
        ) {
          const withJsExt = resolvedFile + '.js';
          if (existsSync(withJsExt)) {
            resolvedFile = withJsExt;
          }
        }

        // Verify file exists
        if (!existsSync(resolvedFile)) {
          // Try index.js
          const indexJs = resolve(resolvedFile, 'index.js');
          if (existsSync(indexJs)) {
            resolvedFile = indexJs;
          } else {
            return; // File doesn't exist, skip this import
          }
        }
      } catch (error) {
        // Can't resolve, skip this import
        return;
      }

      // Map each specifier
      for (const spec of specifiers) {
        if (spec.type === 'ImportDefaultSpecifier') {
          // `import Foo from 'module'` - local name is spec.local.name
          imports.set(spec.local.name, {
            source: resolvedFile,
            importedName: 'default',
            originalSource: source,
          });
        } else if (spec.type === 'ImportSpecifier') {
          // `import { Foo } from 'module'` - local name is spec.local.name
          imports.set(spec.local.name, {
            source: resolvedFile,
            importedName: spec.imported.name,
            originalSource: source,
          });
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          // `import * as Foo from 'module'`
          imports.set(spec.local.name, {
            source: resolvedFile,
            importedName: '*',
            originalSource: source,
          });
        }
      }
    },
  });

  return imports;
}

/**
 * Find function or class method in an imported module
 * Handles both standalone functions and class methods (e.g., SessionManager.methodName)
 *
 * SECURITY: Validates paths and checks file sizes before reading to prevent DoS
 */
function findInImportedModule(importInfo, funcName, objectName, projectRoot) {
  try {
    // SECURITY: Validate path is within project root (defense-in-depth)
    const normalizedProjectRoot = resolve(projectRoot);
    const normalizedSource = resolve(importInfo.source);
    if (
      !normalizedSource.startsWith(normalizedProjectRoot + '/') &&
      !normalizedSource.startsWith(normalizedProjectRoot + '\\') &&
      normalizedSource !== normalizedProjectRoot
    ) {
      logger.warn(`[trace_execution_flow] Import path outside project root: ${importInfo.source}`);
      return null;
    }

    // SECURITY: Check file size before reading (DoS protection)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    let stats;
    try {
      stats = statSync(importInfo.source);
    } catch (statError) {
      logger.warn(`[trace_execution_flow] Cannot stat file: ${importInfo.source}`);
      return null;
    }

    if (stats.size > MAX_FILE_SIZE) {
      logger.warn(
        `[trace_execution_flow] Imported file too large (${stats.size} bytes): ${importInfo.source}`
      );
      return null;
    }

    logger.info(
      `[trace_execution_flow] findInImportedModule: source=${importInfo.source}, funcName=${funcName}, objectName=${objectName}`
    );
    const content = readFileSync(importInfo.source, 'utf-8');

    const ext =
      importInfo.source.endsWith('.ts') || importInfo.source.endsWith('.tsx') ? 'typescript' : null;
    const importedAst = parse(content, {
      sourceType: 'module',
      plugins: [...(ext ? [ext] : []), 'jsx'],
    });

    // First, try to find as a direct function/class
    const result = findFunctionDeclaration(importedAst, funcName);
    if (result) {
      logger.info(`[trace_execution_flow] Found as direct function: ${funcName}`);
      return result;
    }

    // If not found and objectName is provided, try to find as a class method
    if (objectName) {
      logger.info(`[trace_execution_flow] Looking for class method: ${objectName}.${funcName}`);
      // Find the class declaration for objectName
      let classPath = null;
      traverseFn(importedAst, {
        ClassDeclaration(path) {
          if (path.node.id && path.node.id.name === objectName) {
            classPath = path;
          }
        },
        // Also check for exported classes
        ExportNamedDeclaration(path) {
          if (
            path.node.declaration?.type === 'ClassDeclaration' &&
            path.node.declaration.id?.name === objectName
          ) {
            classPath = path;
          }
        },
      });

      if (classPath) {
        // Search for the method within the class
        const classBody = classPath.node.body || classPath.node.declaration?.body;
        if (classBody && classBody.body) {
          for (const method of classBody.body) {
            if (method.type === 'ClassMethod' && method.key?.name === funcName) {
              logger.info(
                `[trace_execution_flow] FOUND class method: ${funcName} at line ${method.loc?.start.line}`
              );
              return method;
            }
          }
          logger.info(
            `[trace_execution_flow] Method ${funcName} NOT FOUND in ${classBody.body.length} methods`
          );
        }
      }
    }

    return null;
  } catch (error) {
    // Failed to parse/find in imported file
    return null;
  }
}

/**
 * Build call graph with depth limiting and cycle detection
 * Now supports cross-file tracing via import resolution
 */
function buildCallGraph(ast, startFunc, options) {
  const {
    maxDepth,
    includeAsync,
    detectCycles,
    filterBuiltIns,
    visited,
    path,
    filePath,
    projectRoot,
    importMappings,
    fileCache,
  } = options;
  const graph = [];

  // HARD LIMIT: Prevent stack overflow
  if (maxDepth <= 0 || path.length > 20) return graph;

  // HARD LIMIT: Prevent unbounded graph growth (DoS protection)
  if (visited.size > 1000) {
    logger.warn('[trace_execution_flow] Call graph exceeded maximum size (1000 nodes), truncating');
    return graph;
  }

  startFunc.traverse({
    CallExpression(callPath) {
      const callee = callPath.node.callee;
      let funcName = null;
      let isMemberCall = false;
      let objectName = null;

      // Extract function name from different call types
      if (callee.type === 'Identifier') {
        funcName = callee.name;
      } else if (callee.type === 'MemberExpression') {
        funcName = callee.property.name;
        isMemberCall = true;
        // Track object name for potential module method calls
        if (callee.object.type === 'Identifier') {
          objectName = callee.object.name;
        }
      }

      if (!funcName) return;

      // DEBUG: Log call detection
      logger.info(
        `[trace_execution_flow] Call detected: funcName=${funcName}, isMemberCall=${isMemberCall}, objectName=${objectName}`
      );

      // Skip built-in methods to reduce noise (if enabled)
      if (filterBuiltIns && isBuiltInMethod(funcName)) return;

      // Use full call key including file context for all tracking (prevents false collisions)
      const fullCallKey = `${filePath}:${funcName}:${callPath.node.loc.start.line}`;

      // Check if this is an await call
      const isAsync = callPath.parent.type === 'AwaitExpression';

      // Detect circular calls - only circular if calling the SAME function (same file + line)
      if (detectCycles && path.some(p => p === fullCallKey)) {
        graph.push({
          function: funcName,
          line: callPath.node.loc.start.line,
          type: 'call',
          async: isAsync,
          circular: true,
        });
        return;
      }

      // Use fullCallKey for visited tracking to prevent cross-file collisions
      // (e.g., same function name at same line in different files)
      if (visited.has(fullCallKey)) return;
      visited.add(fullCallKey);

      // Build node
      const node = {
        function: funcName,
        line: callPath.node.loc.start.line,
        type: 'call',
        async: isAsync,
        circular: false,
        children: [],
      };

      // Try to find the target function and recurse
      let targetFunc = null;
      let targetFile = filePath;
      let targetAst = ast;

      // For member calls (like SessionManager.method), skip current file search
      // and go directly to import resolution. This prevents finding a function
      // with the same name in the current file when we actually want the method
      // from the imported class.
      if (isMemberCall && objectName && importMappings) {
        logger.info(
          `[trace_execution_flow] Member call: objectName=${objectName}, funcName=${funcName}`
        );
        logger.info(`[trace_execution_flow] importMappings.size=${importMappings.size}`);
        const importInfo = importMappings.get(objectName);
        if (importInfo) {
          logger.info(
            `[trace_execution_flow] Found import for ${objectName}: source=${importInfo.source}`
          );
          // Check cache first
          const cacheKey = importInfo.source;
          if (fileCache && fileCache.has(cacheKey)) {
            targetAst = fileCache.get(cacheKey).ast;
            targetFile = cacheKey;
            try {
              targetFunc = findInImportedModule(importInfo, funcName, objectName, projectRoot);
            } catch (error) {
              // Not found in imported module
            }
          } else {
            // Parse and cache the imported file
            try {
              const targetFuncInfo = findInImportedModule(
                importInfo,
                funcName,
                objectName,
                projectRoot
              );
              if (targetFuncInfo) {
                targetFunc = targetFuncInfo;
                targetFile = importInfo.source;
                // Parse the full AST for recursion
                const content = readFileSync(importInfo.source, 'utf-8');
                const ext =
                  importInfo.source.endsWith('.ts') || importInfo.source.endsWith('.tsx')
                    ? 'typescript'
                    : null;
                targetAst = parse(content, {
                  sourceType: 'module',
                  plugins: [...(ext ? [ext] : []), 'jsx'],
                });
                // Cache for future use
                if (fileCache) {
                  fileCache.set(cacheKey, { ast: targetAst });
                }
              }
            } catch (error) {
              // Failed to find in imported module
            }
          }
        }
      }

      // Fallback: try to find in current file (for non-member calls)
      if (!targetFunc && !isMemberCall) {
        try {
          targetFunc = findFunctionDeclaration(ast, funcName);
        } catch (error) {
          // Not found in current AST
        }
      }

      // Recurse if we found the target function
      if (targetFunc) {
        // If we're in a different file, we need its import mappings
        let childImportMappings = importMappings;
        if (targetFile !== filePath) {
          // Extract imports from the target file for cross-file recursion
          childImportMappings = extractImportMappings(targetAst, targetFile, projectRoot);
        }

        node.children = buildCallGraph(targetAst, targetFunc, {
          maxDepth: maxDepth - 1,
          includeAsync,
          detectCycles,
          filterBuiltIns,
          visited: new Set([...visited]),
          path: [...path, fullCallKey],
          filePath: targetFile,
          projectRoot,
          importMappings: childImportMappings,
          fileCache,
        });

        // Mark as cross-file call if applicable
        if (targetFile !== filePath) {
          node.crossFile = true;
          node.sourceFile = targetFile.replace(projectRoot + '/', '');
        }
      }

      graph.push(node);
    },
  });

  return graph;
}

/**
 * Extract async patterns from function
 */
function extractAsyncPatterns(ast, functionPath, filePath) {
  const patterns = [];

  functionPath.traverse({
    AwaitExpression(path) {
      patterns.push({
        type: 'await',
        line: path.node.loc.start.line,
        file: filePath,
        context: extractContext(path),
      });
    },

    CallExpression(path) {
      // Promise.then()
      if (
        path.node.callee.type === 'MemberExpression' &&
        path.node.callee.property.name === 'then'
      ) {
        patterns.push({
          type: 'promise_then',
          line: path.node.loc.start.line,
          file: filePath,
          context: extractContext(path),
        });
      }

      // Callbacks
      for (const arg of path.node.arguments) {
        if (arg.type === 'FunctionExpression' || arg.type === 'ArrowFunctionExpression') {
          patterns.push({
            type: 'callback',
            line: arg.loc.start.line,
            file: filePath,
            context: extractContext(path),
          });
        }
      }
    },
  });

  return patterns;
}

/**
 * Extract context snippet for code location
 */
function extractContext(path) {
  const node = path.node;
  const start = node.loc.start.line;
  const end = Math.min(start + 2, node.loc.end.line);

  return {
    startLine: start,
    endLine: end,
  };
}

/**
 * Calculate flow summary statistics
 */
function calculateFlowSummary(callGraph, asyncPatterns) {
  return {
    totalFunctions: countNodes(callGraph),
    maxDepth: calculateDepth(callGraph),
    asyncOperations: asyncPatterns.length,
    circularFlows: countCircularFlows(callGraph),
    crossFileCalls: countCrossFileCalls(callGraph),
  };
}

/**
 * Count all nodes in call graph
 */
function countNodes(graph) {
  let count = 0;
  for (const node of graph) {
    count += 1;
    if (node.children) {
      count += countNodes(node.children);
    }
  }
  return count;
}

/**
 * Calculate maximum depth of call graph with memoization
 */
function calculateDepth(graph, memo = new Map()) {
  if (graph.length === 0) return 0;

  // Use graph reference as memoization key
  const memoKey = graph;
  if (memo.has(memoKey)) {
    return memo.get(memoKey);
  }

  let maxChildDepth = 0;
  for (const node of graph) {
    if (node.children && node.children.length > 0) {
      const childDepth = calculateDepth(node.children, memo);
      if (childDepth > maxChildDepth) {
        maxChildDepth = childDepth;
      }
    }
  }

  const depth = maxChildDepth + 1;
  memo.set(memoKey, depth);
  return depth;
}

/**
 * Count circular flow detections
 */
function countCircularFlows(graph) {
  let count = 0;
  for (const node of graph) {
    if (node.circular) count++;
    if (node.children) {
      count += countCircularFlows(node.children);
    }
  }
  return count;
}

/**
 * Count cross-file calls
 */
function countCrossFileCalls(graph) {
  let count = 0;
  for (const node of graph) {
    if (node.crossFile) count++;
    if (node.children) {
      count += countCrossFileCalls(node.children);
    }
  }
  return count;
}

/**
 * Format execution flow as text
 */
function formatExecutionFlowText(flow) {
  let output = `# Execution Flow Trace: ${flow.startFunction.name}\n\n`;
  output += `**Starting Function**: ${flow.startFunction.name} (${flow.startFunction.file}:${flow.startFunction.line})\n`;
  output += `**Total Functions Called**: ${flow.summary.totalFunctions}\n`;
  output += `**Max Depth**: ${flow.summary.maxDepth}\n`;
  output += `**Async Operations**: ${flow.summary.asyncOperations}\n`;

  if (flow.summary.circularFlows > 0) {
    output += `**Circular Flows**: ${flow.summary.circularFlows}\n`;
  }

  output += '\n## Execution Flow\n\n';
  output += formatCallTree(flow.callGraph, 0);
  output += '\n';

  if (flow.asyncPatterns.length > 0) {
    output += '\n## Async Patterns\n\n';
    for (const pattern of flow.asyncPatterns) {
      output += `- **${pattern.type}** at ${pattern.file}:${pattern.line} (lines ${pattern.context.startLine}-${pattern.context.endLine})\n`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Format call tree with indentation
 */
function formatCallTree(nodes, indent) {
  const lines = [];
  const prefix = '  '.repeat(indent);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const asyncMarker = node.async ? `${EMOJIS.ARROW_DOWN} awaits` : `${EMOJIS.ARROW_DOWN} calls`;
    const circularMarker = node.circular ? ` ${EMOJIS.WARNING} CIRCULAR` : '';
    const crossFileMarker = node.crossFile ? ` 📄 ${node.sourceFile}` : '';

    lines.push(
      `${prefix}${indent + 1}. **${node.function}** [line ${node.line}]${crossFileMarker}`
    );
    lines.push(`${prefix}   ${asyncMarker}${circularMarker}`);

    if (node.children && node.children.length > 0) {
      lines.push(formatCallTree(node.children, indent + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Format execution flow as Mermaid diagram
 */
function formatExecutionFlowMermaid(flow) {
  const lines = [];

  lines.push('```mermaid');
  lines.push('graph TD');
  lines.push('');
  lines.push(`  Start[${flow.startFunction.name}]`);

  // Generate nodes and edges from call graph
  let nodeId = 1;
  const nodeIdMap = new Map();

  function generateNodes(graph, parentId, indent) {
    for (const node of graph) {
      const id = `N${nodeId++}`;
      nodeIdMap.set(node.function, id);

      const label = node.circular
        ? `${node.function}<br/>${EMOJIS.WARNING} CIRCULAR`
        : node.function;
      const style = node.async ? '(async)' : '';

      lines.push(`  ${id}["${label}"]${style}`);

      // Edge from parent
      if (parentId) {
        const edgeStyle = node.async ? '-.->|await|' : '--->';
        lines.push(`  ${parentId} ${edgeStyle} ${id}`);
      }

      // Recurse for children (with optional chaining for safety)
      if (node.children?.length > 0) {
        generateNodes(node.children, id, indent + 1);
      }
    }
  }

  // Connect start to first level
  for (const node of flow.callGraph) {
    const id = `N${nodeId++}`;
    const label = node.circular ? `${node.function}<br/>${EMOJIS.WARNING} CIRCULAR` : node.function;
    const style = node.async ? '(async)' : '';

    lines.push(`  ${id}["${label}"]${style}`);
    lines.push(`  Start${node.async ? '-.->|await|' : '--->'}${id}`);

    if (node.children?.length > 0) {
      generateNodes(node.children, id, 1);
    }
  }

  lines.push('```');
  lines.push('');
  lines.push('## Legend');
  lines.push('');
  lines.push('- `--->`: Synchronous call');
  lines.push("- '-.->|await|': Async call (await)");
  lines.push('- `(async)`: Async function style');
  lines.push(`- ${EMOJIS.WARNING} CIRCULAR: Circular flow detected`);

  return lines.join('\n');
}

/**
 * Format execution flow as JSON
 */
function formatExecutionFlowJSON(flow) {
  return JSON.stringify(flow, null, 2);
}
