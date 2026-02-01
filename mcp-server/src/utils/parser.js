/**
 * AST Parser utility using @babel/parser
 *
 * Uses LRU cache to prevent unbounded memory growth
 * - Max 500 cached ASTs (configurable)
 * - 5-minute TTL to prevent stale data
 * - Size tracking to monitor memory usage
 */

import { parse } from '@babel/parser';
import { readFileSync } from 'fs';
import { LRUCache } from 'lru-cache';

export class ASTParser {
  constructor(options = {}) {
    // Use LRU cache to prevent unbounded growth
    this.cache = new LRUCache({
      max: options.max || 500, // Max 500 cached ASTs
      ttl: options.ttl || 1000 * 60 * 5, // 5 minutes
      updateAgeOnGet: true,
      updateAgeOnHas: true,
      // Calculate size approximation for memory tracking
      maxSize: options.maxSize || 50 * 1024 * 1024, // 50MB default
      sizeCalculation: value => {
        // Rough approximation: AST nodes * 100 bytes
        return (value.program?.body?.length || 0) * 100;
      },
    });
  }

  /**
   * Parse a JavaScript or TypeScript file and return AST
   *
   * Supports:
   * - JavaScript (.js, .jsx, .mjs)
   * - TypeScript (.ts, .tsx)
   * - JSX (React components)
   */
  parse(filePath) {
    // Check cache first
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath);
    }

    try {
      const sourceCode = readFileSync(filePath, 'utf-8');

      // Determine file type for parser plugins
      const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
      const isJSX = filePath.endsWith('.jsx') || filePath.endsWith('.tsx');

      const plugins = [];
      if (isJSX) {
        plugins.push('jsx');
      }
      if (isTypeScript) {
        plugins.push('typescript');
      }

      const ast = parse(sourceCode, {
        sourceType: 'module',
        plugins,
      });

      // Cache the result (LRU will evict old entries if needed)
      this.cache.set(filePath, ast);

      return ast;
    } catch (error) {
      throw new Error(`Failed to parse ${filePath}: ${error.message}`);
    }
  }

  /**
   * Extract imports from AST (both static and dynamic)
   *
   * Detects:
   * - Static ES6 imports: import { x } from './module.js'
   * - Dynamic imports: import('./module.js')
   */
  extractImports(ast) {
    const imports = [];

    for (const statement of ast.program.body) {
      // Static imports: import { x } from './module.js'
      if (statement.type === 'ImportDeclaration') {
        imports.push({
          source: statement.source.value,
          type: 'static',
          specifiers: statement.specifiers.map(spec => ({
            type: spec.type,
            imported: spec.imported?.name,
            local: spec.local?.name,
          })),
        });
      }
    }

    // Extract dynamic imports using AST traversal
    const dynamicImports = this.extractDynamicImports(ast);
    imports.push(...dynamicImports);

    return imports;
  }

  /**
   * Extract dynamic import() expressions from AST
   *
   * Dynamic imports can appear anywhere in the code:
   * - const module = await import('./module.js')
   * - import('./module.js').then(...)
   *
   * Babel parser may represent import() as either:
   * - ImportExpression (modern)
   * - CallExpression with callee.name === 'import' (older/babel)
   */
  extractDynamicImports(ast) {
    const dynamicImports = [];
    const visited = new Set();

    /**
     * Traverse AST nodes to find dynamic imports
     */
    function traverse(node) {
      if (!node || typeof node !== 'object') {
        return;
      }

      // Prevent cycles
      const nodeId = node.type + (node.loc?.start?.line || '');
      if (visited.has(nodeId)) {
        return;
      }
      visited.add(nodeId);

      // Check for ImportExpression (modern representation)
      if (node.type === 'ImportExpression') {
        let source = null;

        if (node.source.type === 'StringLiteral') {
          source = node.source.value;
        } else if (node.source.type === 'TemplateLiteral') {
          // Simple template literals: `./module-${name}.js`
          // Only track if it's a simple string (no expressions)
          if (node.source.quasis.length === 1 && !node.source.expressions.length) {
            source = node.source.quasis[0].value.cooked;
          }
        }

        if (source) {
          dynamicImports.push({
            source,
            type: 'dynamic',
            async: true,
          });
        }
      }

      // Check for CallExpression with import() callee (Babel representation)
      if (node.type === 'CallExpression') {
        const callee = node.callee;

        // Check if it's import() - Babel uses 'Import' type node
        if (
          callee.type === 'Import' ||
          (callee.type === 'Identifier' && callee.name === 'import')
        ) {
          let source = null;

          if (node.arguments.length > 0) {
            const arg = node.arguments[0];

            if (arg.type === 'StringLiteral') {
              source = arg.value;
            } else if (arg.type === 'TemplateLiteral') {
              // Simple template literals
              if (arg.quasis.length === 1 && !arg.expressions.length) {
                source = arg.quasis[0].value.cooked;
              }
            }
          }

          if (source) {
            dynamicImports.push({
              source,
              type: 'dynamic',
              async: true,
            });
          }
        }
      }

      // Recursively traverse child nodes
      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'loc') {
          continue;
        }

        const value = node[key];

        if (Array.isArray(value)) {
          for (const item of value) {
            traverse(item);
          }
        } else if (typeof value === 'object' && value !== null) {
          traverse(value);
        }
      }
    }

    traverse(ast);

    return dynamicImports;
  }

  /**
   * Extract exports from AST
   */
  extractExports(ast) {
    const exports = {
      named: [],
      default: null,
    };

    for (const statement of ast.program.body) {
      if (statement.type === 'ExportNamedDeclaration') {
        if (statement.declaration) {
          // export function/class/const
          exports.named.push({
            type: statement.declaration.type,
            name: statement.declaration.id?.name,
          });
        }

        // export { x, y }
        if (statement.specifiers) {
          for (const spec of statement.specifiers) {
            exports.named.push({
              type: 'specifier',
              name: spec.exported.name,
              local: spec.local.name,
            });
          }
        }
      }

      if (statement.type === 'ExportDefaultDeclaration') {
        exports.default = {
          type: statement.declaration.type,
          name: statement.declaration.id?.name || 'anonymous',
        };
      }
    }

    return exports;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize,
      maxSize: this.cache.max,
      maxMemorySize: this.cache.maxSize,
    };
  }

  /**
   * Get cache size (backward compatibility)
   */
  getCacheSize() {
    return this.cache.size;
  }
}
