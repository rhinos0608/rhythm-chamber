/**
 * AST-Aware Code Chunker
 *
 * Splits JavaScript source code into meaningful chunks using AST parsing.
 * Preserves semantic boundaries (functions, classes, methods) and captures
 * contextual metadata for better semantic search.
 */

import { parse } from 'acorn';
import { simple as walk } from 'acorn-walk';
import { readFile } from 'fs/promises';

/**
 * Supported file extensions
 */
const SUPPORTED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.tsx', '.ts']);

/**
 * Maximum chunk size (in characters)
 */
const MAX_CHUNK_SIZE = 4000;

/**
 * Context window size (lines before/after a chunk)
 */
const CONTEXT_LINES = 3;

/**
 * Code Chunker class
 */
export class CodeChunker {
  constructor(options = {}) {
    this.maxChunkSize = options.maxChunkSize || MAX_CHUNK_SIZE;
    this.contextLines = options.contextLines || CONTEXT_LINES;
    this.includeComments = options.includeComments !== false;
  }

  /**
   * Check if a file is supported
   */
  isSupported(filePath) {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    return SUPPORTED_EXTENSIONS.has(ext);
  }

  /**
   * Chunk a source file
   */
  chunkSourceFile(sourceCode, filePath) {
    const chunks = [];

    try {
      // Parse AST
      const ast = parse(sourceCode, {
        sourceType: 'module',
        ecmaVersion: 'latest',
        locations: true,
        allowHashBang: true,
        allowReserved: true,
        allowReturnOutsideFunction: true
      });

      // Split source into lines for context extraction
      const lines = sourceCode.split('\n');

      // Collect imports
      const imports = this._extractImports(ast, sourceCode, lines);
      if (imports.length > 0) {
        chunks.push(...imports);
      }

      // Collect exports
      const exports = this._extractExports(ast, sourceCode, lines);
      if (exports.length > 0) {
        chunks.push(...exports);
      }

      // Collect function declarations
      const functions = this._extractFunctions(ast, sourceCode, lines, filePath);
      chunks.push(...functions);

      // Collect class declarations
      const classes = this._extractClasses(ast, sourceCode, lines, filePath);
      chunks.push(...classes);

      // Collect variable declarations (top-level only)
      const variables = this._extractVariables(ast, sourceCode, lines, filePath);
      chunks.push(...variables);

      // Collect remaining non-chunked content
      const leftovers = this._extractLeftovers(ast, sourceCode, lines, filePath, chunks);
      if (leftovers.length > 0) {
        chunks.push(...leftovers);
      }

    } catch (error) {
      console.error(`[Chunker] Failed to parse ${filePath}:`, error.message);

      // Fallback: create single chunk with entire file
      chunks.push(this._createFallbackChunk(sourceCode, filePath, error));
    }

    return chunks;
  }

  /**
   * Create a fallback chunk when AST parsing fails
   */
  _createFallbackChunk(sourceCode, filePath, error) {
    const lines = sourceCode.split('\n');
    return {
      id: this._generateChunkId('fallback', filePath, 1),
      type: 'fallback',
      name: filePath.split('/').pop(),
      text: sourceCode.substring(0, this.maxChunkSize),
      context: {
        before: '',
        after: sourceCode.length > this.maxChunkSize ? '... (truncated)' : ''
      },
      metadata: {
        file: filePath,
        startLine: 1,
        endLine: lines.length,
        exported: false,
        parseError: error.message,
        truncated: sourceCode.length > this.maxChunkSize
      }
    };
  }

  /**
   * Extract import statements
   */
  _extractImports(ast, sourceCode, lines) {
    const chunks = [];
    const importNodes = [];

    walk(ast, {
      ImportDeclaration(node) {
        importNodes.push(node);
      }
    });

    if (importNodes.length === 0) return chunks;

    // Group imports by proximity
    let currentStart = importNodes[0].start;
    let currentEnd = importNodes[0].end;
    let lastLine = importNodes[0].loc.start.line;

    for (let i = 1; i < importNodes.length; i++) {
      const node = importNodes[i];
      const lineDiff = node.loc.start.line - lastLine;

      // Group if within 3 lines
      if (lineDiff <= 3) {
        currentEnd = node.end;
        lastLine = node.loc.end.line;
      } else {
        // Create chunk for previous group
        chunks.push(this._createImportChunk(
          sourceCode.substring(currentStart, currentEnd),
          lines,
          importNodes.find(n => n.start === currentStart).loc.start.line,
          importNodes.find(n => n.end === currentEnd).loc.end.line
        ));

        // Start new group
        currentStart = node.start;
        currentEnd = node.end;
        lastLine = node.loc.end.line;
      }
    }

    // Create final chunk
    chunks.push(this._createImportChunk(
      sourceCode.substring(currentStart, currentEnd),
      lines,
      importNodes.find(n => n.start === currentStart).loc.start.line,
      importNodes.find(n => n.end === currentEnd).loc.end.line
    ));

    return chunks;
  }

  /**
   * Create an import chunk
   */
  _createImportChunk(importText, lines, startLine, endLine) {
    const context = this._extractContext(lines, startLine, endLine);

    return {
      id: this._generateChunkId('imports', '', startLine),
      type: 'imports',
      name: 'imports',
      text: importText.trim(),
      context,
      metadata: {
        file: '',
        startLine,
        endLine,
        exported: false
      }
    };
  }

  /**
   * Extract export statements
   */
  _extractExports(ast, sourceCode, lines) {
    const chunks = [];
    const exportNodes = [];

    walk(ast, {
      ExportNamedDeclaration(node) {
        // Skip if it's just exporting a declaration (already captured)
        if (!node.declaration) {
          exportNodes.push({ type: 'named', node });
        }
      },
      ExportDefaultDeclaration(node) {
        // Skip if it's just exporting a declaration
        if (node.declaration.type !== 'Identifier' &&
            node.declaration.type !== 'FunctionDeclaration' &&
            node.declaration.type !== 'ClassDeclaration') {
          exportNodes.push({ type: 'default', node });
        }
      }
    });

    for (const { type, node } of exportNodes) {
      const startLine = node.loc.start.line;
      const endLine = node.loc.end.line;
      const text = sourceCode.substring(node.start, node.end);

      chunks.push({
        id: this._generateChunkId('export', type, startLine),
        type: 'export',
        name: type === 'default' ? 'default-export' : 'named-export',
        text: text.trim(),
        context: this._extractContext(lines, startLine, endLine),
        metadata: {
          file: '',
          startLine,
          endLine,
          exported: true,
          exportType: type
        }
      });
    }

    return chunks;
  }

  /**
   * Extract function declarations
   */
  _extractFunctions(ast, sourceCode, lines, filePath) {
    const chunks = [];
    const functions = [];

    walk(ast, {
      FunctionDeclaration(node) {
        if (node.id) {
          functions.push({
            name: node.id.name,
            node,
            async: node.async,
            generator: node.generator
          });
        }
      },
      // Also capture object methods (they're often important)
      FunctionExpression(node) {
        // Check if this is a method
        if (node.id && node.id.name) {
          functions.push({
            name: node.id.name,
            node,
            isMethod: true,
            async: node.async,
            generator: node.generator
          });
        }
      }
    });

    for (const func of functions) {
      chunks.push(this._createFunctionChunk(
        func.node,
        sourceCode,
        lines,
        filePath,
        func.async,
        func.generator
      ));
    }

    return chunks;
  }

  /**
   * Create a function chunk
   */
  _createFunctionChunk(node, sourceCode, lines, filePath, isAsync = false, isGenerator = false) {
    const startLine = node.loc.start.line;
    const endLine = node.loc.end.line;
    const funcText = sourceCode.substring(node.start, node.end);

    // Extract function info
    const params = this._extractParams(node);
    const calls = this._extractCalls(node);
    const throws = this._extractThrows(node);

    // Check if exported
    const exported = this._isExported(node, sourceCode);

    // Get JSDoc comment if present
    const jsDoc = this._extractJSDoc(sourceCode, node);

    const context = this._extractContext(lines, startLine, endLine);

    return {
      id: this._generateChunkId('function', node.id?.name || 'anonymous', startLine),
      type: 'function',
      name: node.id?.name || 'anonymous',
      text: (jsDoc ? jsDoc + '\n' : '') + funcText,
      context,
      metadata: {
        file: filePath,
        startLine,
        endLine,
        exported,
        async: isAsync,
        generator: isGenerator,
        params,
        calls,
        throws,
        hasJSDoc: !!jsDoc
      }
    };
  }

  /**
   * Extract class declarations
   */
  _extractClasses(ast, sourceCode, lines, filePath) {
    const chunks = [];
    const classes = [];

    walk(ast, {
      ClassDeclaration(node) {
        if (node.id) {
          classes.push({ name: node.id.name, node });
        }
      }
    });

    for (const cls of classes) {
      chunks.push(...this._createClassChunks(
        cls.node,
        sourceCode,
        lines,
        filePath
      ));
    }

    return chunks;
  }

  /**
   * Create chunks for a class (may be split if large)
   */
  _createClassChunks(node, sourceCode, lines, filePath) {
    const chunks = [];
    const startLine = node.loc.start.line;
    const endLine = node.loc.end.line;
    const classText = sourceCode.substring(node.start, node.end);

    // Check if class is small enough to be a single chunk
    if (classText.length <= this.maxChunkSize) {
      const methods = this._extractClassMethods(node);
      const exports = this._extractClassExports(node);

      chunks.push({
        id: this._generateChunkId('class', node.id.name, startLine),
        type: 'class',
        name: node.id.name,
        text: classText,
        context: this._extractContext(lines, startLine, endLine),
        metadata: {
          file: filePath,
          startLine,
          endLine,
          exported: this._isExported(node, sourceCode),
          methods,
          superClass: node.superClass?.name || null,
          exports
        }
      });

      return chunks;
    }

    // Large class: split into method chunks
    const methods = this._extractClassMethodNodes(node);

    // Create a chunk for the class declaration (extends, etc.)
    const classDeclEnd = node.body.start;
    chunks.push({
      id: this._generateChunkId('class', node.id.name, startLine),
      type: 'class-declaration',
      name: node.id.name,
      text: sourceCode.substring(node.start, classDeclEnd),
      context: this._extractContext(lines, startLine, node.loc.start.line + 1),
      metadata: {
        file: filePath,
        startLine,
        endLine: node.loc.start.line + 1,
        exported: this._isExported(node, sourceCode),
        superClass: node.superClass?.name || null,
        isLargeClass: true
      }
    });

    // Create chunks for each method
    for (const method of methods) {
      const methodStart = method.loc.start.line;
      const methodEnd = method.loc.end.line;
      const methodText = sourceCode.substring(method.start, method.end);

      chunks.push({
        id: this._generateChunkId('method', `${node.id.name}.${method.key?.name || 'anonymous'}`, methodStart),
        type: 'method',
        name: `${node.id.name}.${method.key?.name || 'anonymous'}`,
        className: node.id.name,
        text: methodText,
        context: this._extractContext(lines, methodStart, methodEnd),
        metadata: {
          file: filePath,
          startLine: methodStart,
          endLine: methodEnd,
          exported: method.kind === 'constructor' ? false : this._isExported(node, sourceCode),
          kind: method.kind,
          async: method.async || false,
          static: method.static || false,
          params: this._extractParams(method.value)
        }
      });
    }

    return chunks;
  }

  /**
   * Extract top-level variable declarations
   *
   * NOTE: Disabled because Acorn doesn't track parent nodes, making it
   * impossible to reliably distinguish top-level variables from nested ones.
   * Variables are still captured via _extractLeftovers() as code chunks.
   */
  _extractVariables(ast, sourceCode, lines, filePath) {
    // Cannot reliably detect top-level vs nested variables without parent tracking
    // Variables will be captured in _extractLeftovers() as "code-block" chunks
    return [];
  }

  /**
   * Extract leftover code that wasn't chunked
   */
  _extractLeftovers(ast, sourceCode, lines, filePath, existingChunks) {
    const chunks = [];

    // Find covered ranges
    const covered = new Set();
    for (const chunk of existingChunks) {
      for (let i = chunk.metadata.startLine; i <= chunk.metadata.endLine; i++) {
        covered.add(i);
      }
    }

    // Find uncovered ranges
    let currentStart = null;
    for (let i = 1; i <= lines.length; i++) {
      if (!covered.has(i)) {
        if (currentStart === null) {
          currentStart = i;
        }
      } else {
        if (currentStart !== null) {
          // Create chunk for uncovered range
          const text = lines.slice(currentStart - 1, i - 1).join('\n');
          if (text.trim().length > 10) { // Minimum meaningful content
            chunks.push({
              id: this._generateChunkId('code', 'other', currentStart),
              type: 'code',
              name: 'code-block',
              text,
              context: this._extractContext(lines, currentStart, i - 1),
              metadata: {
                file: filePath,
                startLine: currentStart,
                endLine: i - 1,
                exported: false
              }
            });
          }
          currentStart = null;
        }
      }
    }

    return chunks;
  }

  /**
   * Extract context (before/after lines)
   */
  _extractContext(lines, startLine, endLine) {
    const beforeStart = Math.max(0, startLine - this.contextLines - 1);
    const beforeLines = lines.slice(beforeStart, startLine - 1);

    const afterEnd = Math.min(lines.length, endLine + this.contextLines);
    const afterLines = lines.slice(endLine, afterEnd);

    return {
      before: beforeLines.join('\n').trim(),
      after: afterLines.join('\n').trim()
    };
  }

  /**
   * Extract function parameters
   */
  _extractParams(node) {
    if (!node.params) return [];

    return node.params.map(param => {
      if (param.type === 'Identifier') {
        return param.name;
      } else if (param.type === 'AssignmentPattern' && param.left) {
        return `${this._paramToString(param.left)} = ...`;
      } else if (param.type === 'RestElement' && param.argument) {
        return `...${this._paramToString(param.argument)}`;
      } else if (param.type === 'ObjectPattern') {
        return '{...}';
      } else if (param.type === 'ArrayPattern') {
        return '[...]';
      }
      return '?';
    });
  }

  /**
   * Convert parameter node to string
   */
  _paramToString(param) {
    if (param.type === 'Identifier') return param.name;
    return '?';
  }

  /**
   * Extract function calls within a node
   */
  _extractCalls(node) {
    const calls = new Set();

    walk(node, {
      CallExpression(callNode) {
        if (callNode.callee.type === 'Identifier') {
          calls.add(callNode.callee.name);
        } else if (callNode.callee.type === 'MemberExpression') {
          if (callNode.callee.property.type === 'Identifier') {
            calls.add(callNode.callee.property.name);
          }
        }
      }
    });

    return Array.from(calls).slice(0, 10); // Limit to 10
  }

  /**
   * Extract thrown expressions
   */
  _extractThrows(node) {
    const throws = [];
    const self = this;

    walk(node, {
      ThrowStatement(throwNode) {
        if (throwNode.argument) {
          if (throwNode.argument.type === 'Identifier') {
            throws.push(throwNode.argument.name);
          } else if (throwNode.argument.type === 'NewExpression' && throwNode.argument.callee) {
            throws.push(self._getNodeName(throwNode.argument.callee));
          }
        }
      }
    });

    return throws;
  }

  /**
   * Extract class methods
   */
  _extractClassMethods(node) {
    if (!node.body) return [];

    return node.body.body
      .filter(m => m.type === 'MethodDefinition')
      .map(m => ({
        name: m.key?.name || 'anonymous',
        kind: m.kind,
        static: m.static || false,
        async: m.value?.async || false
      }));
  }

  /**
   * Extract class method nodes
   */
  _extractClassMethodNodes(node) {
    if (!node.body) return [];

    return node.body.body.filter(m => m.type === 'MethodDefinition');
  }

  /**
   * Extract class exports
   */
  _extractClassExports(node) {
    const exports = new Set();
    const methods = this._extractClassMethods(node);

    for (const method of methods) {
      if (method.kind !== 'constructor') {
        exports.add(method.name);
      }
    }

    return Array.from(exports);
  }

  /**
   * Check if a node is exported
   */
  _isExported(node, sourceCode) {
    // Check for export keyword before node
    const before = sourceCode.substring(Math.max(0, node.start - 20), node.start);
    return /\bexport\b/.test(before);
  }

  /**
   * Extract JSDoc comment before a node
   */
  _extractJSDoc(sourceCode, node) {
    const before = sourceCode.substring(Math.max(0, node.start - 500), node.start);
    const jsDocMatch = before.match(/\/\*\*[\s\S]*?\*\//);

    return jsDocMatch ? jsDocMatch[0] : '';
  }

  /**
   * Get node name
   */
  _getNodeName(node) {
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression') {
      return `${this._getNodeName(node.object)}.${this._getNodeName(node.property)}`;
    }
    return '?';
  }

  /**
   * Generate a unique chunk ID
   *
   * Note: The final chunk ID includes the file path prefix in chunkFile(),
   * which ensures uniqueness across files. This function generates the
   * local chunk identifier within a file.
   */
  _generateChunkId(type, name, line) {
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${type}_${sanitizedName}_L${line}`;
  }

  /**
   * Sanitize a file path for use in chunk IDs
   * Replaces problematic characters (spaces, dots except extensions, etc.) with underscores
   */
  _sanitizeFilePath(filePath) {
    return filePath
      .replace(/[^a-zA-Z0-9_/-]/g, '_')  // Replace problematic chars except / and -
      .replace(/\//g, '_');                // Normalize path separators
  }

  /**
   * Load and chunk a file
   */
  async chunkFile(filePath, projectRoot) {
    const sourceCode = await readFile(filePath, 'utf-8');
    const relativePath = filePath.replace(projectRoot + '/', '');

    const chunks = this.chunkSourceFile(sourceCode, relativePath);

    // Sanitize path for chunk IDs to prevent issues with special characters
    const sanitizedPath = this._sanitizeFilePath(relativePath);

    // Update file path in metadata
    for (const chunk of chunks) {
      chunk.metadata.file = relativePath;  // Keep original path for metadata
      chunk.id = `${sanitizedPath}_${chunk.id}`;  // Use sanitized path for ID
    }

    return chunks;
  }
}

export default CodeChunker;
