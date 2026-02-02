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
 * Increased from 3 to 5 for better search context
 */
const CONTEXT_LINES = 5;

/**
 * Chunk overlap percentage (20% overlap at function boundaries)
 */
const OVERLAP_PERCENTAGE = 0.2;

/**
 * Parent chunk threshold (lines)
 * Functions longer than this will have both parent and child chunks
 */
const PARENT_CHUNK_THRESHOLD = 50;

/**
 * Code Chunker class
 */
export class CodeChunker {
  constructor(options = {}) {
    this.maxChunkSize = options.maxChunkSize || MAX_CHUNK_SIZE;
    this.contextLines = options.contextLines || CONTEXT_LINES;
    this.includeComments = options.includeComments !== false;
    this.overlapPercentage = options.overlapPercentage || OVERLAP_PERCENTAGE;
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
        allowReturnOutsideFunction: true,
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

      // Collect object literal methods
      const objMethods = this._extractObjectMethods(ast, sourceCode, lines, filePath);
      chunks.push(...objMethods);

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
        after: sourceCode.length > this.maxChunkSize ? '... (truncated)' : '',
      },
      metadata: {
        file: filePath,
        startLine: 1,
        endLine: lines.length,
        exported: false,
        parseError: error.message,
        truncated: sourceCode.length > this.maxChunkSize,
      },
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
      },
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
        chunks.push(
          this._createImportChunk(
            sourceCode.substring(currentStart, currentEnd),
            lines,
            importNodes.find(n => n.start === currentStart).loc.start.line,
            importNodes.find(n => n.end === currentEnd).loc.end.line
          )
        );

        // Start new group
        currentStart = node.start;
        currentEnd = node.end;
        lastLine = node.loc.end.line;
      }
    }

    // Create final chunk
    chunks.push(
      this._createImportChunk(
        sourceCode.substring(currentStart, currentEnd),
        lines,
        importNodes.find(n => n.start === currentStart).loc.start.line,
        importNodes.find(n => n.end === currentEnd).loc.end.line
      )
    );

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
        exported: false,
      },
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
        if (
          node.declaration.type !== 'Identifier' &&
          node.declaration.type !== 'FunctionDeclaration' &&
          node.declaration.type !== 'ClassDeclaration'
        ) {
          exportNodes.push({ type: 'default', node });
        }
      },
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
          exportType: type,
        },
      });
    }

    return chunks;
  }

  /**
   * Extract function declarations, arrow functions, and methods
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
            generator: node.generator,
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
            generator: node.generator,
          });
        }
      },
      // Capture arrow functions (most common pattern in modern JS)
      ArrowFunctionExpression(node) {
        // Generate a name based on location since arrow functions are usually anonymous
        functions.push({
          name: `arrow_${node.loc.start.line}`,
          node,
          isArrow: true,
          async: node.async,
          generator: false,
        });
      },
    });

    // Also capture variables that contain functions (const foo = () => {})
    const variableFunctions = this._extractVariableFunctions(ast);
    functions.push(...variableFunctions);

    for (const func of functions) {
      const functionChunks = this._createFunctionChunk(
        func.node,
        sourceCode,
        lines,
        filePath,
        func.async,
        func.generator
      );
      chunks.push(...functionChunks);
    }

    return chunks;
  }

  /**
   * Extract variable declarations that contain functions
   * Captures patterns like: const foo = () => {}, const bar = function() {}
   */
  _extractVariableFunctions(ast) {
    const functions = [];

    walk(ast, {
      VariableDeclaration(node) {
        if (node.kind === 'const' || node.kind === 'let') {
          for (const declarator of node.declarations) {
            if (declarator.id && declarator.id.type === 'Identifier') {
              const varName = declarator.id.name;

              // Check if this is an arrow function
              if (declarator.init && declarator.init.type === 'ArrowFunctionExpression') {
                functions.push({
                  name: varName,
                  node: declarator.init,
                  isArrow: true,
                  isVariable: true,
                  async: declarator.init.async,
                  generator: false,
                });
              }
              // Check if this is a function expression
              else if (declarator.init && declarator.init.type === 'FunctionExpression') {
                functions.push({
                  name: varName,
                  node: declarator.init,
                  isVariable: true,
                  async: declarator.init.async,
                  generator: declarator.init.generator,
                });
              }
            }
          }
        }
      },
    });

    return functions;
  }

  /**
   * Create function chunk(s) with parent-child relationship for large functions
   *
   * For functions exceeding PARENT_CHUNK_THRESHOLD lines:
   * - Creates a parent chunk containing the full function context
   * - Creates child chunks for smaller sections of the function
   * - Links child chunks to parent via parentChunkId metadata
   *
   * For smaller functions:
   * - Creates a single chunk as before
   *
   * @param {Object} node - The AST node for the function
   * @param {string} sourceCode - Full source code
   * @param {string[]} lines - Source code split by lines
   * @param {string} filePath - Relative file path
   * @param {boolean} isAsync - Whether function is async
   * @param {boolean} isGenerator - Whether function is a generator
   * @returns {Object[]} Array of chunk objects (1 for small functions, 2+ for large)
   */
  _createFunctionChunk(node, sourceCode, lines, filePath, isAsync = false, isGenerator = false) {
    const startLine = node.loc.start.line;
    const endLine = node.loc.end.line;
    const funcText = sourceCode.substring(node.start, node.end);
    const funcLength = endLine - startLine + 1;

    // Extract function info
    const params = this._extractParams(node);
    const calls = this._extractCalls(node);
    const throws = this._extractThrows(node);

    // Check if exported
    const exported = this._isExported(node, sourceCode);

    // Get JSDoc comment if present
    const jsDoc = this._extractJSDoc(sourceCode, node);

    // Calculate overlap lines
    const overlapLines = Math.max(1, Math.ceil(funcLength * this.overlapPercentage));
    const context = this._extractContextWithOverlap(lines, startLine, endLine, overlapLines);

    const baseMetadata = {
      file: filePath,
      startLine,
      endLine,
      exported,
      async: isAsync,
      generator: isGenerator,
      params,
      calls,
      throws,
      hasJSDoc: !!jsDoc,
      hasOverlap: overlapLines > 0,
      overlapLines,
    };

    // For small functions, return single chunk as before
    if (funcLength <= PARENT_CHUNK_THRESHOLD) {
      // CRITICAL FIX: Include overlap context in the text for embeddings
      // The context provides boundary information that helps with semantic search
      const contextBeforeText = context.before ? `// Context before:\n${context.before}\n` : '';
      const contextAfterText = context.after ? `\n// Context after:\n${context.after}` : '';

      return [
        {
          id: this._generateChunkId('function', node.id?.name || 'anonymous', startLine),
          type: 'function',
          name: node.id?.name || 'anonymous',
          text: contextBeforeText + (jsDoc ? jsDoc + '\n' : '') + funcText + contextAfterText,
          context,
          metadata: baseMetadata,
        },
      ];
    }

    // Large function: Create parent-child structure
    const chunks = [];

    // CRITICAL FIX: Include overlap context in the text for embeddings
    const contextBeforeText = context.before ? `// Context before:\n${context.before}\n` : '';
    const contextAfterText = context.after ? `\n// Context after:\n${context.after}` : '';
    const fullTextWithContext =
      contextBeforeText + (jsDoc ? jsDoc + '\n' : '') + funcText + contextAfterText;

    // 1. Create parent chunk with full function context
    const parentChunkId = this._generateChunkId(
      'function',
      `${node.id?.name || 'anonymous'}_parent`,
      startLine
    );
    chunks.push({
      id: parentChunkId,
      type: 'parent',
      name: node.id?.name || 'anonymous',
      text: fullTextWithContext, // Include overlap context in embeddings
      context,
      metadata: {
        ...baseMetadata,
        parentChunkId: null, // Parent chunks have no parent
        childCount: 0, // Will be updated when children are created
        isLargeFunction: true,
      },
    });

    // 2. Create child chunks for different sections of the function
    // CRITICAL FIX: Include limited context in child chunks for embeddings
    const funcLines = funcText.split('\n');
    const childSize = Math.max(10, Math.floor(funcLength / 3)); // Target ~1/3 of function per child
    let childStart = 0;

    while (childStart < funcLines.length) {
      const childEnd = Math.min(childStart + childSize, funcLines.length);
      const childText = funcLines.slice(childStart, childEnd).join('\n');
      const childStartLine = startLine + childStart;
      const childEndLine = startLine + childEnd - 1;

      // Calculate context for child chunk (smaller overlap for children)
      const childOverlap = Math.max(1, Math.ceil((childEndLine - childStartLine + 1) * 0.1));
      const childContext = this._extractContextWithOverlap(
        lines,
        childStartLine,
        childEndLine,
        childOverlap
      );

      // CRITICAL FIX: Include child context in the text for embeddings
      // Use smaller context for children to avoid excessive duplication
      const childContextBeforeText = childContext.before
        ? `// Context before:\n${childContext.before}\n`
        : '';
      const childContextAfterText = childContext.after
        ? `\n// Context after:\n${childContext.after}`
        : '';
      const childTextWithContext = childContextBeforeText + childText + childContextAfterText;

      chunks.push({
        id: this._generateChunkId(
          'function',
          `${node.id?.name || 'anonymous'}_child${Math.floor(childStart / childSize)}`,
          childStartLine
        ),
        type: 'child',
        name: `${node.id?.name || 'anonymous'} [${childStart + 1}-${childEnd}]`,
        text: childTextWithContext, // Include overlap context in embeddings
        context: childContext,
        metadata: {
          ...baseMetadata,
          startLine: childStartLine,
          endLine: childEndLine,
          parentChunkId,
          isChildChunk: true,
        },
      });

      childStart = childEnd;
    }

    // Update parent chunk's child count
    chunks[0].metadata.childCount = chunks.length - 1;

    return chunks;
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
      },
    });

    for (const cls of classes) {
      chunks.push(...this._createClassChunks(cls.node, sourceCode, lines, filePath));
    }

    return chunks;
  }

  /**
   * Extract object literal methods
   * Captures methods in object literals like: const obj = { method() {} }
   */
  _extractObjectMethods(ast, sourceCode, lines, filePath) {
    const chunks = [];
    const methods = [];

    // FIX: Preserve class context for walker callbacks
    const self = this;

    walk(ast, {
      // Look for object expressions that might contain methods
      ObjectExpression(node) {
        // Check if this object has method definitions
        const methodProperties = node.properties.filter(
          prop =>
            prop.type === 'Property' &&
            prop.kind === 'init' &&
            prop.value.type === 'FunctionExpression'
        );

        if (methodProperties.length > 0) {
          // Try to get a name for this object from its parent context
          const objName = self._getObjectName(node, sourceCode);

          for (const prop of methodProperties) {
            if (prop.key && (prop.key.type === 'Identifier' || prop.key.type === 'Literal')) {
              const methodName =
                prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);

              methods.push({
                name: objName ? `${objName}.${methodName}` : methodName,
                node: prop.value,
                isObjectMethod: true,
                objectName: objName,
                propertyName: methodName,
                async: prop.value.async,
                generator: prop.value.generator,
              });
            }
          }
        }
      },
    });

    for (const method of methods) {
      const methodChunks = this._createFunctionChunk(
        method.node,
        sourceCode,
        lines,
        filePath,
        method.async,
        method.generator
      );

      // Update metadata to mark as object method
      for (const chunk of methodChunks) {
        chunk.metadata.isObjectMethod = true;
        if (method.objectName) {
          chunk.metadata.objectName = method.objectName;
        }
        if (method.propertyName) {
          chunk.metadata.propertyName = method.propertyName;
        }
      }

      chunks.push(...methodChunks);
    }

    return chunks;
  }

  /**
   * Attempt to get the name of an object from its context
   * Checks if this object is assigned to a variable
   */
  _getObjectName(node, sourceCode) {
    // Look backwards to find variable assignment
    const searchStart = Math.max(0, node.start - 200);
    const before = sourceCode.substring(searchStart, node.start);

    // Match patterns like: const foo = {, const bar = {
    const match = before.match(/(?:const|let|var)\s+(\w+)\s*=\s*\{?$/);
    if (match) {
      return match[1];
    }

    return null;
  }

  /**
   * Create chunks for a class (may be split if large)
   */
  _createClassChunks(node, sourceCode, lines, filePath) {
    const chunks = [];
    const startLine = node.loc.start.line;
    const endLine = node.loc.end.line;
    const classText = sourceCode.substring(node.start, node.end);

    // Get JSDoc comment if present (for classes)
    const jsDoc = this._extractJSDoc(sourceCode, node);

    // Get context for better semantic understanding
    const context = this._extractContext(lines, startLine, endLine);

    // Check if class is small enough to be a single chunk
    if (classText.length <= this.maxChunkSize) {
      const methods = this._extractClassMethods(node);
      const exports = this._extractClassExports(node);

      // FIX: Include JSDoc and context in text for better semantic search
      // This matches the pattern used for functions (lines 443-451)
      const contextBeforeText = context.before ? `// Context before:\n${context.before}\n` : '';
      const contextAfterText = context.after ? `\n// Context after:\n${context.after}` : '';
      const textWithContext = contextBeforeText + (jsDoc ? jsDoc + '\n' : '') + classText + contextAfterText;

      chunks.push({
        id: this._generateChunkId('class', node.id.name, startLine),
        type: 'class',
        name: node.id.name,
        text: textWithContext,
        context,
        metadata: {
          file: filePath,
          startLine,
          endLine,
          exported: this._isExported(node, sourceCode),
          methods,
          superClass: node.superClass?.name || null,
          exports,
        },
      });

      return chunks;
    }

    // Large class: split into method chunks
    const methods = this._extractClassMethodNodes(node);

    // Create a chunk for the class declaration (extends, etc.)
    const classDeclEnd = node.body.start;
    const classDeclText = sourceCode.substring(node.start, classDeclEnd);

    // FIX: Include JSDoc and context for class declaration too
    const classDeclJsDoc = this._extractJSDoc(sourceCode, node);
    const classDeclContext = this._extractContext(lines, startLine, node.loc.start.line + 1);
    const classDeclContextBefore = classDeclContext.before ? `// Context before:\n${classDeclContext.before}\n` : '';
    const classDeclContextAfter = classDeclContext.after ? `\n// Context after:\n${classDeclContext.after}` : '';
    const classDeclTextWithContext = classDeclContextBefore + (classDeclJsDoc ? classDeclJsDoc + '\n' : '') + classDeclText + classDeclContextAfter;

    chunks.push({
      id: this._generateChunkId('class', node.id.name, startLine),
      type: 'class-declaration',
      name: node.id.name,
      text: classDeclTextWithContext,
      context: classDeclContext,
      metadata: {
        file: filePath,
        startLine,
        endLine: node.loc.start.line + 1,
        exported: this._isExported(node, sourceCode),
        superClass: node.superClass?.name || null,
        isLargeClass: true,
      },
    });

    // Create chunks for each method
    for (const method of methods) {
      const methodStart = method.loc.start.line;
      const methodEnd = method.loc.end.line;
      const methodText = sourceCode.substring(method.start, method.end);

      // FIX #2 & #1: Calculate overlap for context only, not for text
      // Same overlap calculation as functions: max(1, ceil(N * 0.2)) lines
      const methodLength = methodEnd - methodStart + 1;
      const overlapLines = Math.max(1, Math.ceil(methodLength * this.overlapPercentage));

      // Get JSDoc comment if present
      const jsDoc = this._extractJSDoc(sourceCode, method);

      // Context includes overlap for continuity
      const context = this._extractContextWithOverlap(lines, methodStart, methodEnd, overlapLines);

      // FIX: Extract calls with class context for qualified names
      const calls = this._extractCalls(method.value, node.id.name);

      chunks.push({
        id: this._generateChunkId(
          'method',
          `${node.id.name}.${method.key?.name || 'anonymous'}`,
          methodStart
        ),
        type: 'method',
        name: `${node.id.name}.${method.key?.name || 'anonymous'}`,
        className: node.id.name,
        text: (jsDoc ? jsDoc + '\n' : '') + methodText,
        context,
        metadata: {
          file: filePath,
          startLine: methodStart,
          endLine: methodEnd,
          exported: method.kind === 'constructor' ? false : this._isExported(node, sourceCode),
          kind: method.kind,
          async: method.async || false,
          static: method.static || false,
          params: this._extractParams(method.value),
          calls,
          hasOverlap: overlapLines > 0,
          overlapLines,
        },
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
          if (text.trim().length > 10) {
            // Minimum meaningful content
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
                exported: false,
              },
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
      after: afterLines.join('\n').trim(),
    };
  }

  /**
   * Extract context with overlap (before/after lines including extra overlap)
   *
   * FIX #2: This method extends the before context to include overlap lines,
   * providing continuity between adjacent chunks without duplicating content
   * in the chunk text itself (which would bias embeddings).
   *
   * @param {string[]} lines - Array of source code lines
   * @param {number} startLine - The starting line number (1-based)
   * @param {number} endLine - The ending line number (1-based)
   * @param {number} overlapLines - Additional lines to include in before context
   * @returns {Object} Context with before/after text
   */
  _extractContextWithOverlap(lines, startLine, endLine, overlapLines) {
    // Include overlap lines in the before context
    // overlapLines are the lines immediately before startLine
    const beforeStart = Math.max(0, startLine - this.contextLines - overlapLines - 1);
    const beforeLines = lines.slice(beforeStart, startLine - 1);

    const afterEnd = Math.min(lines.length, endLine + this.contextLines);
    const afterLines = lines.slice(endLine, afterEnd);

    return {
      before: beforeLines.join('\n').trim(),
      after: afterLines.join('\n').trim(),
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
   *
   * FIX: Preserves qualified names for MemberExpressions to disambiguate
   * overloaded methods (e.g., "UserService.getUser" vs "APIProvider.getUser")
   */
  _extractCalls(node, enclosingClassName = null) {
    const calls = new Set();

    walk(node, {
      CallExpression(callNode) {
        if (callNode.callee.type === 'Identifier') {
          // Simple function call: foo()
          calls.add(callNode.callee.name);
        } else if (callNode.callee.type === 'MemberExpression') {
          // Method call: obj.method() or this.method()
          if (callNode.callee.property.type === 'Identifier') {
            const methodName = callNode.callee.property.name;

            // Try to extract object context for qualified name
            let qualifiedName = null;
            const object = callNode.callee.object;

            if (object.type === 'Identifier') {
              // obj.method() -> try to qualify as obj.method
              qualifiedName = `${object.name}.${methodName}`;
            } else if (
              object.type === 'MemberExpression' &&
              object.property.type === 'Identifier'
            ) {
              // obj.foo.method() -> try to qualify as obj.foo.method
              qualifiedName = `${object.property.name}.${methodName}`;
            } else if (object.type === 'ThisExpression' && enclosingClassName) {
              // this.method() inside a class -> qualify as ClassName.method
              qualifiedName = `${enclosingClassName}.${methodName}`;
            }

            // Add both qualified and short name for maximum recall
            if (qualifiedName) {
              calls.add(qualifiedName);
            }
            calls.add(methodName);
          }
        }
      },
    });

    return Array.from(calls).slice(0, 15); // Increased limit for qualified names
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
      },
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
        async: m.value?.async || false,
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
   *
   * FIX #3: Verify JSDoc is close to the node (within 100 chars)
   * to avoid picking up unrelated comments.
   */
  _extractJSDoc(sourceCode, node) {
    // Look back up to 500 characters, but only accept JSDoc within 100 chars of node
    const searchWindow = sourceCode.substring(Math.max(0, node.start - 500), node.start);
    const jsDocMatch = searchWindow.match(/\/\*\*[\s\S]*?\*\//g);

    if (jsDocMatch) {
      // Get the last JSDoc comment (should be the one immediately preceding the node)
      const lastJsDoc = jsDocMatch[jsDocMatch.length - 1];
      // Find where this JSDoc ends in the search window
      const lastJsDocEndIndex = searchWindow.lastIndexOf(lastJsDoc);
      const jsDocEndPosition =
        node.start - searchWindow.length + lastJsDocEndIndex + lastJsDoc.length;

      // Only accept if JSDoc ends within 100 characters of the node start
      // This prevents picking up comments from far away
      if (node.start - jsDocEndPosition <= 100) {
        return lastJsDoc;
      }
    }

    return '';
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
      .replace(/[^a-zA-Z0-9_/-]/g, '_') // Replace problematic chars except / and -
      .replace(/\//g, '_'); // Normalize path separators
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
      chunk.metadata.file = relativePath; // Keep original path for metadata
      chunk.id = `${sanitizedPath}_${chunk.id}`; // Use sanitized path for ID
    }

    return chunks;
  }
}

export default CodeChunker;
