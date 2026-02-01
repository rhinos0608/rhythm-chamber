/**
 * MCP Tool: get_symbol_graph
 * Generate symbol relationship graphs with multiple visualization formats
 */

import { resolve, join } from 'path';
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
 * Tool schema definition
 */
export const schema = {
  name: 'get_symbol_graph',
  description:
    'Generate symbol relationship graphs with multiple visualization formats (Mermaid, DOT, JSON). Shows call graphs, inheritance hierarchies, and dependency networks.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description:
          'Relative path to the module file (e.g., "js/controllers/chat-ui-controller.js")',
      },
      graphType: {
        type: 'string',
        enum: ['call', 'inheritance', 'dependency'],
        default: 'call',
        description:
          'Type of graph: call (function calls), inheritance (class extends), dependency (imports/exports)',
      },
      maxDepth: {
        type: 'number',
        default: 2,
        description: 'Maximum depth of graph traversal (1-5)',
      },
      format: {
        type: 'string',
        enum: ['mermaid', 'dot', 'json'],
        default: 'mermaid',
        description: 'Output format for visualization',
      },
    },
    required: ['filePath'],
  },
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot) => {
  const { filePath, graphType = 'call', maxDepth = 2, format = 'mermaid' } = args;

  logger.info('get_symbol_graph called with:', { filePath, graphType, maxDepth, format });

  // Resolve file path
  const absolutePath = resolve(projectRoot, filePath);

  // Check if file exists
  if (!existsSync(absolutePath)) {
    const similarFiles = findSimilarFiles(filePath, projectRoot);
    return createPartialResponse(
      {
        content: [
          {
            type: 'text',
            text: `# File Not Found: ${filePath}

## Suggestions

${similarFiles.length > 0 ? similarFiles.map(f => `- Did you mean \`${f}\`?`).join('\n') : 'No similar files found.'}

## Check
- Verify the file path is correct
- The file should be in the project root: ${projectRoot}
`,
          },
        ],
      },
      {
        completeness: 0,
        messages: [`File not found: ${filePath}`],
        suggestions:
          similarFiles.length > 0
            ? ['Try one of these similar files:', ...similarFiles.slice(0, 3)]
            : ['Verify the file path'],
      }
    );
  }

  // Check cache
  const cacheKey = cache.generateKey(absolutePath, { graphType, maxDepth, format });
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info('Returning cached result for:', filePath);
    return cached;
  }

  // Analyze file and build graph
  let graph;
  try {
    graph = buildSymbolGraph(absolutePath, projectRoot, graphType, maxDepth);
  } catch (error) {
    logger.warn(`Graph building failed for ${filePath}, attempting partial analysis:`, error);
    return createErrorResponse(error, {
      text: `# Graph Generation Failed

Error: ${error.message}

## Suggestions
- Check if the file is valid JavaScript
- Try reducing maxDepth parameter
- Try a different graphType
`,
    });
  }

  // Format output
  const output = formatGraphOutput(graph, filePath, graphType, format);

  // Build response
  const result = {
    content: [
      {
        type: 'text',
        text: output,
      },
    ],
  };

  // Cache result
  cache.set(cacheKey, result);

  return result;
};

/**
 * Build symbol graph based on type
 */
function buildSymbolGraph(filePath, projectRoot, graphType, maxDepth) {
  const content = readFileSync(filePath, 'utf-8');
  const relativePath = filePath.replace(projectRoot + '/', '');

  const ast = parser.parse(content, {
    sourceType: 'module',
    plugins: ['jsx'],
  });

  const graph = {
    type: graphType,
    nodes: [],
    edges: [],
    metadata: {
      file: relativePath,
      depth: maxDepth,
      totalNodes: 0,
      totalEdges: 0,
    },
  };

  if (graphType === 'call') {
    buildCallGraph(ast, graph, filePath, projectRoot, maxDepth);
  } else if (graphType === 'inheritance') {
    buildInheritanceGraph(ast, graph, filePath, projectRoot, maxDepth);
  } else if (graphType === 'dependency') {
    buildDependencyGraph(ast, graph, filePath, projectRoot, maxDepth);
  }

  graph.metadata.totalNodes = graph.nodes.length;
  graph.metadata.totalEdges = graph.edges.length;

  return graph;
}

/**
 * Build call graph (function calls)
 */
function buildCallGraph(ast, graph, filePath, projectRoot, maxDepth, currentDepth = 0) {
  if (currentDepth >= maxDepth) return;

  const functions = new Map();

  // Collect all function declarations
  traverse.default(ast, {
    FunctionDeclaration(path) {
      if (path.node.id) {
        functions.set(path.node.id.name, {
          name: path.node.id.name,
          type: 'function',
          file: filePath.replace(projectRoot + '/', ''),
          line: path.node.loc.start.line,
        });
      }
    },
    ClassDeclaration(path) {
      if (path.node.id) {
        functions.set(path.node.id.name, {
          name: path.node.id.name,
          type: 'class',
          file: filePath.replace(projectRoot + '/', ''),
          line: path.node.loc.start.line,
        });
      }

      // Collect methods
      path.get('body.body').forEach(classMethod => {
        if (classMethod.isClassMethod({ computed: false })) {
          const methodName = `${path.node.id.name}.${classMethod.node.key.name}`;
          functions.set(methodName, {
            name: methodName,
            type: 'method',
            file: filePath.replace(projectRoot + '/', ''),
            line: classMethod.node.loc.start.line,
          });
        }
      });
    },
  });

  // Add nodes
  functions.forEach(func => {
    graph.nodes.push(func);
  });

  // Collect calls
  const calls = new Map(); // function -> Set of called functions

  traverse.default(ast, {
    FunctionDeclaration(path) {
      if (!path.node.id) return;

      const called = new Set();
      path.traverse({
        CallExpression(callPath) {
          if (callPath.node.callee.type === 'Identifier') {
            called.add(callPath.node.callee.name);
          } else if (callPath.node.callee.type === 'MemberExpression') {
            if (callPath.node.callee.property.type === 'Identifier') {
              called.add(callPath.node.callee.property.name);
            }
          }
        },
      });

      calls.set(path.node.id.name, called);
    },
    ClassDeclaration(path) {
      if (!path.node.id) return;

      path.get('body.body').forEach(classMethod => {
        if (!classMethod.isClassMethod({ computed: false })) return;

        const methodName = `${path.node.id.name}.${classMethod.node.key.name}`;
        const called = new Set();

        classMethod.traverse({
          CallExpression(callPath) {
            if (callPath.node.callee.type === 'Identifier') {
              called.add(callPath.node.callee.name);
            } else if (callPath.node.callee.type === 'MemberExpression') {
              if (callPath.node.callee.property.type === 'Identifier') {
                called.add(callPath.node.callee.property.name);
              }
            }
          },
        });

        calls.set(methodName, called);
      });
    },
  });

  // Add edges
  calls.forEach((calledSet, caller) => {
    calledSet.forEach(called => {
      if (functions.has(called)) {
        graph.edges.push({
          from: caller,
          to: called,
          type: 'calls',
        });
      }
    });
  });
}

/**
 * Build inheritance graph (class extends)
 */
function buildInheritanceGraph(ast, graph, filePath, projectRoot, maxDepth, currentDepth = 0) {
  if (currentDepth >= maxDepth) return;

  const classes = new Map();

  // Collect all class declarations
  traverse.default(ast, {
    ClassDeclaration(path) {
      if (!path.node.id) return;

      const className = path.node.id.name;
      const superClass = path.node.superClass;

      classes.set(className, {
        name: className,
        type: 'class',
        file: filePath.replace(projectRoot + '/', ''),
        line: path.node.loc.start.line,
        extends: superClass
          ? superClass.type === 'Identifier'
            ? superClass.name
            : 'Expression'
          : null,
      });

      // Add node
      graph.nodes.push({
        name: className,
        type: 'class',
        file: filePath.replace(projectRoot + '/', ''),
        line: path.node.loc.start.line,
      });

      // Add inheritance edge
      if (superClass && superClass.type === 'Identifier') {
        graph.edges.push({
          from: className,
          to: superClass.name,
          type: 'extends',
        });
      }
    },
  });
}

/**
 * Build dependency graph (imports/exports)
 */
function buildDependencyGraph(ast, graph, filePath, projectRoot, maxDepth, currentDepth = 0) {
  if (currentDepth >= maxDepth) return;

  const dependencies = new Map();

  // Collect imports
  traverse.default(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      const specifiers = path.node.specifiers.map(s => s.local.name);

      dependencies.set(source, {
        type: 'import',
        symbols: specifiers,
      });

      // Add node for dependency
      if (!graph.nodes.find(n => n.name === source)) {
        graph.nodes.push({
          name: source,
          type: 'module',
          file: filePath.replace(projectRoot + '/', ''),
          line: path.node.loc.start.line,
        });
      }

      // Add edge
      const currentFile = filePath.replace(projectRoot + '/', '');
      graph.edges.push({
        from: currentFile,
        to: source,
        type: 'imports',
      });
    },
    ExportNamedDeclaration(path) {
      if (path.node.source) {
        const source = path.node.source.value;

        // Add node for re-export
        if (!graph.nodes.find(n => n.name === source)) {
          graph.nodes.push({
            name: source,
            type: 'module',
            file: filePath.replace(projectRoot + '/', ''),
            line: path.node.loc.start.line,
          });
        }

        // Add edge
        const currentFile = filePath.replace(projectRoot + '/', '');
        graph.edges.push({
          from: currentFile,
          to: source,
          type: 're-exports',
        });
      }
    },
  });
}

/**
 * Format graph output based on format type
 */
function formatGraphOutput(graph, filePath, graphType, format) {
  const lines = [];

  lines.push(`# Symbol Graph: ${filePath}`);
  lines.push('');
  lines.push(`**Type**: ${graphType}`);
  lines.push(`**Nodes**: ${graph.metadata.totalNodes}`);
  lines.push(`**Edges**: ${graph.metadata.totalEdges}`);
  lines.push(`**Depth**: ${graph.metadata.depth}`);
  lines.push('');

  if (format === 'mermaid') {
    lines.push('## Mermaid Diagram');
    lines.push('');
    lines.push('```mermaid');
    lines.push(formatMermaid(graph, graphType));
    lines.push('```');
    lines.push('');
  } else if (format === 'dot') {
    lines.push('## DOT Graph');
    lines.push('');
    lines.push('```dot');
    lines.push(formatDOT(graph, graphType));
    lines.push('```');
    lines.push('');
  } else if (format === 'json') {
    lines.push('## JSON Representation');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(graph, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Legend
  lines.push('## Legend');
  lines.push('');
  lines.push('- **Nodes**: Functions, classes, or modules');
  lines.push('- **Edges**: Relationships between nodes');
  lines.push('- **Types**: calls (function calls), extends (inheritance), imports (dependencies)');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format graph as Mermaid diagram
 */
function formatMermaid(graph, graphType) {
  const lines = [];

  if (graphType === 'call') {
    lines.push('graph TD');
    graph.edges.forEach(edge => {
      lines.push(
        `  ${edge.from.replace(/\./g, '_')}[${edge.from}] --> ${edge.to.replace(/\./g, '_')}[${edge.to}]`
      );
    });
  } else if (graphType === 'inheritance') {
    lines.push('graph TD');
    graph.edges.forEach(edge => {
      lines.push(
        `  ${edge.from.replace(/\./g, '_')}[${edge.from}] --|> ${edge.to.replace(/\./g, '_')}[${edge.to}]`
      );
    });
  } else if (graphType === 'dependency') {
    lines.push('graph LR');
    graph.edges.forEach(edge => {
      lines.push(
        `  ${edge.from.replace(/\./g, '_')}[${edge.from}] --> ${edge.to.replace(/\./g, '_')}[${edge.to}]`
      );
    });
  }

  return lines.join('\n');
}

/**
 * Format graph as DOT (Graphviz)
 */
function formatDOT(graph, graphType) {
  const lines = [];

  const direction = graphType === 'dependency' ? 'LR' : 'TD';
  lines.push('digraph G {');
  lines.push(`  rankdir=${direction};`);
  lines.push('  node [shape=box];');
  lines.push('');

  graph.edges.forEach(edge => {
    const style = edge.type === 'extends' ? ' [arrowhead=empty]' : '';
    lines.push(`  "${edge.from}" -> "${edge.to}"${style};`);
  });

  lines.push('}');

  return lines.join('\n');
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
