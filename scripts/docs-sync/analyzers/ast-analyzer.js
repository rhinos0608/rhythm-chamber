/**
 * AST Analyzer - Parses JavaScript files and extracts metrics
 * Uses @babel/parser for AST generation and traversal
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const traverse = require('@babel/traverse').default;

import { parse } from '@babel/parser';
import * as t from '@babel/types';
import { readFileSync } from 'fs';
import { resolve, relative, dirname } from 'path';
import { glob } from 'glob';
import Logger from '../utils/logger.js';
import ASTCache from '../utils/cache.js';

export class ASTAnalyzer {
  constructor(options = {}) {
    this.logger = options.logger || new Logger();
    this.cache = options.cache || new ASTCache();
    this.projectRoot = options.projectRoot || process.cwd();
    this.excludePaths = options.excludePaths || [];
  }

  /**
   * Parse a single JavaScript file
   * @param {string} filepath - Absolute path to file
   * @returns {object|null} AST or null if parse fails
   */
  parseFile(filepath) {
    try {
      const sourceCode = readFileSync(filepath, 'utf-8');
      const ast = parse(sourceCode, {
        sourceType: 'module',
        plugins: ['jsx'],
      });
      return ast;
    } catch (error) {
      this.logger.error(`Failed to parse ${filepath}`, error.message);
      return null;
    }
  }

  /**
   * Extract metrics from a parsed AST
   * @param {object} ast - Babel AST
   * @param {string} filepath - File path for context
   * @returns {object} Extracted metrics
   */
  extractMetrics(ast, filepath) {
    const metrics = {
      filepath: relative(this.projectRoot, filepath),
      lines: 0,
      exports: { named: 0, default: 0 },
      imports: [],
      classes: 0,
      functions: 0,
      hasJSDoc: false,
    };

    // Count lines
    try {
      const sourceCode = readFileSync(filepath, 'utf-8');
      metrics.lines = sourceCode.split('\n').length;
    } catch (error) {
      this.logger.warning(`Could not count lines in ${filepath}`);
    }

    // Traverse AST
    traverse(ast, {
      // Track imports
      ImportDeclaration(path) {
        const source = path.node.source.value;
        // Only track relative imports (internal dependencies)
        if (source.startsWith('.') || source.startsWith('..')) {
          const resolvedPath = resolve(dirname(filepath), source);
          metrics.imports.push(resolvedPath);
        }
      },

      // Track exports
      ExportNamedDeclaration(path) {
        if (path.node.declaration) {
          metrics.exports.named++;
        }
        path.node.specifiers?.forEach(() => {
          metrics.exports.named++;
        });
      },

      ExportDefaultDeclaration() {
        metrics.exports.default++;
      },

      // Track classes
      ClassDeclaration(path) {
        if (path.node.id) {
          metrics.classes++;
        }
      },

      // Track functions
      FunctionDeclaration(path) {
        if (path.node.id && !path.node.id.name.startsWith('_')) {
          metrics.functions++;
        }
      },

      // Check for JSDoc comments
      enter(path) {
        if (path.node.leadingComments) {
          const hasJSDoc = path.node.leadingComments.some(
            comment => comment.type === 'CommentBlock' && comment.value.startsWith('*')
          );
          if (hasJSDoc) {
            metrics.hasJSDoc = true;
          }
        }
      },
    });

    return metrics;
  }

  /**
   * Analyze a single file with caching
   * @param {string} filepath - Absolute path to file
   * @returns {object|null} Metrics or null if parse fails
   */
  analyzeFile(filepath) {
    // Check cache first
    if (this.cache.has(filepath)) {
      this.logger.dim(`Cache hit: ${filepath}`);
      return this.cache.get(filepath);
    }

    const ast = this.parseFile(filepath);
    if (!ast) {
      return null;
    }

    const metrics = this.extractMetrics(ast, filepath);

    // Store in cache
    this.cache.set(filepath, metrics);

    return metrics;
  }

  /**
   * Analyze all JavaScript files in the project
   * @param {string[]} patterns - Glob patterns to match files
   * @returns {Promise<object>} Complete analysis results
   */
  async analyzeAll(patterns = ['js/**/*.js']) {
    this.logger.processing('Analyzing JavaScript files...');

    const allFiles = await this.globFiles(patterns);
    this.logger.info(`Found ${allFiles.length} JavaScript files`);

    const results = {
      files: {},
      summary: {
        totalFiles: 0,
        totalLines: 0,
        controllers: 0,
        services: 0,
        utilities: 0,
        workers: 0,
        exports: { named: 0, default: 0 },
        imports: [],
      },
      errors: [],
    };

    for (const filepath of allFiles) {
      const metrics = this.analyzeFile(filepath);

      if (metrics) {
        results.files[metrics.filepath] = metrics;
        results.summary.totalFiles++;
        results.summary.totalLines += metrics.lines;
        results.summary.exports.named += metrics.exports.named;
        results.summary.exports.default += metrics.exports.default;
        results.summary.imports.push(...metrics.imports);

        // Categorize by directory
        if (filepath.includes('/controllers/')) {
          results.summary.controllers++;
        } else if (filepath.includes('/services/')) {
          results.summary.services++;
        } else if (filepath.includes('/utils/') || filepath.includes('/utilities/')) {
          results.summary.utilities++;
        } else if (filepath.includes('/workers/')) {
          results.summary.workers++;
        }
      } else {
        results.errors.push(filepath);
      }
    }

    // Build dependency graph
    results.dependencyGraph = this.buildDependencyGraph();

    // Detect circular dependencies
    results.circularDependencies = this.detectCircularDependencies(results.dependencyGraph);

    this.logger.success(`Analyzed ${results.summary.totalFiles} files`);
    this.logger.data('Total lines:', results.summary.totalLines.toLocaleString());
    this.logger.data('Controllers:', results.summary.controllers);
    this.logger.data('Services:', results.summary.services);
    this.logger.data('Utilities:', results.summary.utilities);

    if (results.circularDependencies.length > 0) {
      this.logger.warning(`Found ${results.circularDependencies.length} circular dependencies`);
    }

    return results;
  }

  /**
   * Get list of files matching glob patterns
   * @param {string[]} patterns - Glob patterns
   * @returns {Promise<string[]>} Absolute file paths
   */
  async globFiles(patterns) {
    const files = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.projectRoot,
        absolute: true,
        nodir: true,
      });

      // Filter out excluded paths
      const filtered = matches.filter(file => {
        return !this.excludePaths.some(exclude => file.includes(exclude));
      });

      files.push(...filtered);
    }

    return [...new Set(files)]; // Deduplicate
  }

  /**
   * Build dependency graph from cache
   * @returns {Map<string, string[]>}
   */
  buildDependencyGraph() {
    const graph = new Map();

    for (const [filepath, metrics] of this.cache.cache.entries()) {
      if (metrics.imports && metrics.imports.length > 0) {
        graph.set(metrics.filepath, metrics.imports);
      }
    }

    return graph;
  }

  /**
   * Detect circular dependencies using DFS
   * @param {Map<string, string[]>} graph - Dependency graph
   * @returns {string[][]} Array of circular dependency chains
   */
  detectCircularDependencies(graph) {
    const cycles = [];
    const visited = new Set();
    const recStack = new Set();

    const dfs = (node, path = []) => {
      if (recStack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart).concat(node);
        cycles.push(cycle);
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recStack.add(node);

      const deps = graph.get(node) || [];
      for (const dep of deps) {
        dfs(dep, [...path, node]);
      }

      recStack.delete(node);
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Get cache statistics
   * @returns {object}
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}

export default ASTAnalyzer;
