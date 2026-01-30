/**
 * MCP Tool: get_module_info
 * Get comprehensive metadata about a module including symbol table
 */

import { resolve, join, relative } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { HNWAnalyzer } from '../analyzers/hnw-analyzer.js';
import { CacheManager } from '../cache/cache-manager.js';
import { logger } from '../utils/logger.js';
import { createPartialResponse, createErrorResponse } from '../errors/partial.js';
import path from 'path';

// Static imports for parsers (ES6 modules)
import parser from '@babel/parser';
import traverse from '@babel/traverse';

const cache = new CacheManager();

/**
 * Tool schema definition (pure MCP schema - no handler)
 */
export const schema = {
  name: 'get_module_info',
  description:
    'Get detailed metadata about a module including exports, imports, dependencies, and architecture role. Enhanced with semantic similarity analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description:
          'Relative path to the module file (e.g., "js/controllers/chat-ui-controller.js")',
      },
      includeDependencies: {
        type: 'boolean',
        default: true,
        description: 'Include detailed dependency information',
      },
      includeExports: {
        type: 'boolean',
        default: true,
        description: 'Include all exported members and their types',
      },
      includeSymbols: {
        type: 'boolean',
        default: false,
        description: 'Include detailed symbol table (functions, classes, variables with locations)',
      },
      includeSimilarModules: {
        type: 'boolean',
        default: true,
        description: 'Include semantically similar modules (requires semantic indexer)',
      },
      similarityLimit: {
        type: 'number',
        default: 5,
        description: 'Maximum number of similar modules to show',
      },
    },
    required: ['filePath'],
  },
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot, indexer, server) => {
  const {
    filePath,
    includeDependencies = true,
    includeExports = true,
    includeSymbols = false,
    includeSimilarModules = true,
    similarityLimit = 5
  } = args;

  logger.info('get_module_info called with:', {
    filePath,
    includeDependencies,
    includeExports,
    includeSymbols,
    includeSimilarModules,
    similarityLimit
  });

  // Resolve file path
  const absolutePath = resolve(projectRoot, filePath);

  // Check if file exists
  if (!existsSync(absolutePath)) {
    // Return partial result with suggestions
    const similarFiles = findSimilarFiles(filePath, projectRoot);
    return createPartialResponse({
      content: [{
        type: 'text',
        text: `# File Not Found: ${filePath}

## Suggestions

${similarFiles.length > 0 ? similarFiles.map(f => `- Did you mean \`${f}\`?`).join('\n') : 'No similar files found.'}

## Check
- Verify the file path is correct
- The file should be relative to the project root
`
      }]
    }, {
      completeness: 0,
      messages: [`File not found: ${filePath}`],
      suggestions: similarFiles.length > 0 ?
        [`Try one of these similar files:`, ...similarFiles.slice(0, 3)] :
        ['Verify the file path']
    });
  }

  // Check cache
  const cacheKey = cache.generateKey(absolutePath, { includeDependencies, includeExports, includeSymbols });
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info('Returning cached result for:', filePath);
    return cached;
  }

  // Analyze file
  const analyzer = new HNWAnalyzer(projectRoot);
  let analysis;

  try {
    analysis = analyzer.analyzeFile(absolutePath);
  } catch (error) {
    // Partial analysis on error
    logger.warn(`Analysis failed for ${filePath}, attempting partial analysis:`, error);
    const partialAnalysis = getPartialAnalysis(absolutePath, projectRoot, error);

    const result = createPartialResponse({
      content: [{
        type: 'text',
        text: formatModuleInfo(partialAnalysis, includeDependencies, includeExports, includeSymbols)
      }]
    }, {
        completeness: 60,
        messages: [`Analysis partially failed: ${error.message}`],
        suggestions: ['Showing available information from regex fallback']
    });

    return result;
  }

  // Add symbol table if requested
  let symbols = null;
  if (includeSymbols) {
    try {
      symbols = extractSymbols(absolutePath, projectRoot);
    } catch (error) {
      logger.warn(`Symbol extraction failed for ${filePath}:`, error);
      // Continue without symbols rather than failing
    }
  }

  // Find semantically similar modules if requested
  let similarModules = null;
  if (includeSimilarModules && indexer) {
    try {
      const indexingStatus = server?.getIndexingStatus ? server.getIndexingStatus() : { status: 'unknown' };

      if (indexingStatus.status === 'ready' && indexingStatus.stats?.vectorStore?.chunkCount > 0) {
        // Build semantic query from file name and layer
        const layer = analysis.layer;
        const basename = filePath.split('/').pop().replace('.js', '');
        const query = `${basename} ${layer} module exports functions`;

        // Search for similar code
        const semanticMatches = await indexer.vectorStore.search(query, similarityLimit * 3, 0.5);

        // Process matches to extract unique files
        similarModules = processSimilarModules(semanticMatches, filePath, similarityLimit, projectRoot);
        logger.info(`Found ${similarModules.length} similar modules for ${filePath}`);
      }
    } catch (error) {
      logger.warn(`Similar module search failed for ${filePath}:`, error);
      // Continue without similar modules rather than failing
    }
  }

  // Build response
  const result = {
    content: [
      {
        type: 'text',
        text: formatModuleInfo(analysis, includeDependencies, includeExports, includeSymbols, symbols, similarModules),
      },
    ],
  };

  // Cache result
  cache.set(cacheKey, result);

  return result;
};

/**
 * Format module information for display
 */
function formatModuleInfo(analysis, includeDependencies, includeExports, includeSymbols = false, symbols = null, similarModules = null) {
  const lines = [];

  lines.push(`# Module Information: ${analysis.filePath}`);
  lines.push('');
  lines.push(`**Layer**: ${analysis.layer}`);
  lines.push(`**HNW Compliance Score**: ${analysis.compliance.score}/100`);
  lines.push(`**Compliant**: ${analysis.compliance.compliant ? 'Yes' : 'No'}`);
  lines.push('');

  // Imports
  if (includeDependencies && analysis.imports.length > 0) {
    lines.push('## Imports');
    lines.push('');
    for (const imp of analysis.imports) {
      lines.push(`- \`${imp}\``);
    }
    lines.push('');
  }

  // Exports
  if (includeExports) {
    lines.push('## Exports');
    lines.push('');
    lines.push(`**Named Exports**: ${analysis.exports.named}`);
    lines.push(`**Default Export**: ${analysis.exports.default > 0 ? 'Yes' : 'No'}`);
    lines.push('');

    if (analysis.exports.details.named.length > 0) {
      lines.push('### Named Exports');
      for (const exp of analysis.exports.details.named) {
        lines.push(`- \`${exp.name}\` (${exp.type})`);
      }
      lines.push('');
    }

    if (analysis.exports.details.default) {
      lines.push('### Default Export');
      lines.push(
        `- \`${analysis.exports.details.default.name}\` (${analysis.exports.details.default.type})`
      );
      lines.push('');
    }
  }

  // Symbol Table (NEW)
  if (includeSymbols && symbols) {
    lines.push('## Symbol Table');
    lines.push('');

    if (symbols.functions.length > 0) {
      lines.push('### Functions');
      for (const func of symbols.functions) {
        lines.push(`- \`${func.name}\` - Line ${func.line}`);
        if (func.exported) lines.push(`  - Exported`);
        if (func.calls.length > 0) {
          lines.push(`  - Calls: ${func.calls.slice(0, 3).join(', ')}${func.calls.length > 3 ? '...' : ''}`);
        }
      }
      lines.push('');
    }

    if (symbols.classes.length > 0) {
      lines.push('### Classes');
      for (const cls of symbols.classes) {
        lines.push(`- \`${cls.name}\` - Line ${cls.line}`);
        if (cls.methods.length > 0) {
          lines.push(`  - Methods: ${cls.methods.join(', ')}`);
        }
      }
      lines.push('');
    }

    if (symbols.variables.length > 0) {
      lines.push('### Variables (declared in scope)');
      for (const v of symbols.variables.slice(0, 10)) { // Limit to 10
        lines.push(`- \`${v.name}\` (${v.kind}) - Line ${v.line}`);
      }
      if (symbols.variables.length > 10) {
        lines.push(`  ... and ${symbols.variables.length - 10} more`);
      }
      lines.push('');
    }
  }

  // Compliance Issues
  if (analysis.compliance.violations.length > 0) {
    lines.push('## HNW Architecture Issues');
    lines.push('');

    for (const violation of analysis.compliance.violations) {
      const icon = violation.severity === 'error' ? 'X' : '!';
      lines.push(`${icon} **${violation.rule}**: ${violation.message}`);

      if (violation.import) {
        lines.push(`   - Import: \`${violation.import}\``);
      }

      if (violation.recommendation) {
        lines.push(`   - Suggestion: ${violation.recommendation}`);
      }

      lines.push('');
    }
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    for (const rec of analysis.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  // Similar Modules (SEMANTIC SEARCH)
  if (similarModules && similarModules.length > 0) {
    lines.push('## Semantically Similar Modules');
    lines.push('');
    lines.push('Modules with similar code patterns or functionality:');
    lines.push('');

    for (const module of similarModules) {
      const similarityPercent = Math.round(module.similarity * 100);
      lines.push(`### ${module.filePath}`);
      lines.push('');
      lines.push(`- **Similarity**: ${similarityPercent}%`);
      lines.push(`- **Layer**: ${module.layer}`);
      if (module.sharedExports.length > 0) {
        lines.push(`- **Shared Concepts**: ${module.sharedExports.slice(0, 3).join(', ')}`);
      }
      lines.push('');
    }

    lines.push('**Note**: Similarity is based on code patterns, functionality, and structure.');
    lines.push('');
  }

  // HNW Pattern Reference
  lines.push('## HNW Architecture Reference');
  lines.push('');
  lines.push('**Hierarchy**: Controllers → Services → Providers');
  lines.push('- Controllers call Services, not Providers directly');
  lines.push('- Services use Provider abstraction layer');
  lines.push('- No circular dependencies');
  lines.push('');
  lines.push('**Network**: Use EventBus for cross-module communication');
  lines.push('- Event-driven, loosely coupled');
  lines.push('- Domain filtering for event handlers');
  lines.push('');
  lines.push('**Wave**: TabCoordinator handles cross-tab coordination');
  lines.push('- Check primary tab status before writes');
  lines.push('- Use write-ahead log for crash recovery');

  return lines.join('\n');
}

/**
 * Get partial analysis when AST parsing fails
 */
function getPartialAnalysis(filePath, projectRoot, error) {
  const relativePath = filePath.replace(projectRoot + '/', '');
  const content = readFileSync(filePath, 'utf-8');

  // Use regex to extract basic information
  const imports = extractImportsRegex(content);
  const exports = extractExportsRegex(content);
  const layer = relativePath.includes('/controllers/') ? 'controllers' :
                relativePath.includes('/services/') ? 'services' :
                relativePath.includes('/utils/') ? 'utils' :
                relativePath.includes('/storage/') ? 'storage' :
                relativePath.includes('/providers/') ? 'providers' : 'unknown';

  return {
    filePath: relativePath,
    layer,
    compliance: {
      score: 0,
      compliant: false,
      violations: []
    },
    imports: imports,
    exports: {
      named: exports.named.length,
      default: exports.default ? 1 : 0,
      details: exports
    },
    recommendations: [],
    partial: true,
    error: error.message
  };
}

/**
 * Extract imports using regex (fallback)
 */
function extractImportsRegex(content) {
  const imports = [];
  const importRegex = /import\s+(?:(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[2]);
  }

  const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)]; // Deduplicate
}

/**
 * Extract exports using regex (fallback)
 */
function extractExportsRegex(content) {
  const named = [];
  const exported = new Set();

  // Find export const/function declarations
  const exportPattern = /export\s+(?:export\s+(?:const|let|var)\s+(\w+)|(?:function\s+(\w+)))/g;
  let match;
  while ((match = exportPattern.exec(content)) !== null) {
    const name = match[1] || match[2];
    if (name) {
      const type = match[0].includes('const') || match[0].includes('let') || match[0].includes('var') ? 'variable' : 'function';
      named.push({ name, type });
      exported.add(name);
    }
  }

  // Find default exports
  const defaultPattern = /export\s+default\s+/;
  const hasDefault = defaultPattern.test(content);

  return {
    named,
    default: hasDefault ? { name: 'default', type: 'unknown' } : null,
    exported: Array.from(exported)
  };
}

/**
 * Extract symbol table from AST
 */
function extractSymbols(filePath, projectRoot) {
  const content = readFileSync(filePath, 'utf-8');

  const ast = parser.parse(content, {
    sourceType: 'module',
    plugins: ['jsx']
  });

  const symbols = {
    functions: [],
    classes: [],
    variables: [],
    exported: new Set()
  };

  const exportedNames = new Set();

  // First pass: collect exported names
  traverse.default(ast, {
    ExportNamedDeclaration(path) {
      path.get('specifiers').forEach(spec => {
        exportedNames.add(spec.exported.name);
      });
    },
    ExportDefaultDeclaration(path) {
      if (path.node.declaration.id) {
        exportedNames.add(path.node.declaration.id.name);
      }
    }
  });

  // Second pass: extract symbols
  traverse.default(ast, {
    FunctionDeclaration(path) {
      if (path.node.id) {
        symbols.functions.push({
          name: path.node.id.name,
          line: path.node.loc.start.line,
          exported: exportedNames.has(path.node.id.name),
          calls: extractCalledFunctions(path)
        });
      }
    },
    ClassDeclaration(path) {
      if (path.node.id) {
        const methods = [];
        path.get('body.body').forEach(classMethod => {
          if (classMethod.isClassMethod({ computed: false })) {
            methods.push(classMethod.node.key.name);
          }
        });

        symbols.classes.push({
          name: path.node.id.name,
          line: path.node.loc.start.line,
          exported: exportedNames.has(path.node.id.name),
          methods: methods
        });
      }
    },
    VariableDeclaration(path) {
      path.get('declarations').forEach(declaration => {
        if (declaration.id && declaration.id.type === 'Identifier') {
          symbols.variables.push({
            name: declaration.id.name,
            kind: path.node.kind, // 'const', 'let', or 'var'
            line: declaration.loc ? declaration.loc.start.line : 0,
            exported: exportedNames.has(declaration.id.name)
          });
        }
      });
    }
  });

  return symbols;
}

/**
 * Extract functions called within a scope
 */
function extractCalledFunctions(path) {
  const calls = [];

  path.traverse({
    CallExpression(callPath) {
      if (callPath.node.callee.type === 'Identifier') {
        calls.push(callPath.node.callee.name);
      } else if (callPath.node.callee.type === 'MemberExpression') {
        if (callPath.node.callee.property.type === 'Identifier') {
          calls.push(callPath.node.callee.property.name);
        }
      }
    }
  });

  return [...new Set(calls)].slice(0, 10); // Deduplicate and limit
}

/**
 * Find similar files when target file not found
 */
function findSimilarFiles(filePath, projectRoot) {
  const dirname = path.dirname(filePath);
  const basename = path.basename(filePath, '.js');
  const absoluteDir = resolve(projectRoot, dirname);

  if (!existsSync(absoluteDir)) {
    return [];
  }

  const files = readdirSync(absoluteDir);

  // Find files with similar names (contains the basename)
  const similar = files
    .filter(f => f.endsWith('.js') && f.includes(basename.replace('.js', '')))
    .slice(0, 5);

  return similar.map(f => path.join(dirname, f));
}

/**
 * Validate and sanitize file path extracted from chunk ID
 * Prevents path traversal attacks
 */
function validateChunkFilePath(filePath, projectRoot) {
  // CRITICAL FIX #1: Prevent path traversal attacks
  // Reject paths with directory traversal sequences
  if (filePath.includes('..') || filePath.includes('\\..') || filePath.includes('./..')) {
    logger.warn(`[validateChunkFilePath] Rejected path traversal attempt: ${filePath}`);
    return null;
  }

  // Reject absolute paths (should be relative to project root)
  if (filePath.startsWith('/')) {
    logger.warn(`[validateChunkFilePath] Rejected absolute path: ${filePath}`);
    return null;
  }

  // Reject null bytes (potential security issue)
  if (filePath.includes('\0')) {
    logger.warn(`[validateChunkFilePath] Rejected path with null byte`);
    return null;
  }

  // Resolve to absolute path and verify it's within project root
  const fullPath = resolve(projectRoot, filePath);
  const relativePath = relative(projectRoot, fullPath);

  // Check if the resolved path escaped the project root
  if (relativePath.startsWith('..')) {
    logger.warn(`[validateChunkFilePath] Rejected path escaping project root: ${filePath}`);
    return null;
  }

  return fullPath;
}

/**
 * Process semantic search results to extract similar modules
 */
function processSimilarModules(semanticMatches, currentFilePath, limit, projectRoot) {
  const fileScanner = new FileScanner(projectRoot);
  const processedFiles = new Map();

  for (const match of semanticMatches) {
    const chunkId = match.chunkId || match.id;
    if (!chunkId) continue;

    // Extract file path from chunk ID
    const filePath = chunkId.split('_L')[0].replace(/_/g, '/');

    // CRITICAL FIX #1: Validate the extracted path to prevent path traversal
    const fullPath = validateChunkFilePath(filePath, projectRoot);
    if (!fullPath) {
      continue; // Skip invalid paths
    }

    // Skip the current file
    if (filePath === currentFilePath || filePath === currentFilePath.replace(/^\//, '')) {
      continue;
    }

    // Skip if already processed
    if (processedFiles.has(filePath)) {
      // Update similarity if this match is higher
      const existing = processedFiles.get(filePath);
      if (match.similarity > existing.similarity) {
        existing.similarity = match.similarity;
      }
      continue;
    }

    // CRITICAL FIX #5: Add null safety for file operations
    let layer = 'unknown';
    try {
      layer = fileScanner.getFileLayer(fullPath);
    } catch (error) {
      logger.warn(`[processSimilarModules] Failed to get layer for ${filePath}:`, error.message);
      // Continue with unknown layer
    }

    const sharedExports = [];

    // CRITICAL FIX #6: Add null checks for metadata access
    if (match.metadata) {
      if (match.metadata.exported) {
        sharedExports.push(match.metadata.exported);
      }
      if (match.chunkType === 'function' && match.metadata.name) {
        sharedExports.push(match.metadata.name);
      }
    }

    processedFiles.set(filePath, {
      filePath,
      layer,
      similarity: match.similarity || 0, // Default to 0 if undefined
      sharedExports,
    });

    // Stop if we've reached the limit
    if (processedFiles.size >= limit) {
      break;
    }
  }

  // Convert to array and sort by similarity
  return Array.from(processedFiles.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
