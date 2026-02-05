/**
 * TypeScript/JSX Chunker
 *
 * Extends CodeChunker to handle TypeScript (.ts, .tsx) and JSX (.jsx) files.
 * Uses Babel parser for TypeScript syntax support.
 *
 * Additional features:
 * - Extracts interface declarations
 * - Extracts type aliases
 * - Extracts enum declarations
 * - Handles TSX/JSX syntax
 *
 * Phase 2: Symbol-Aware Indexing
 */

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { CodeChunker } from './chunker.js';
import { existsSync, readFileSync } from 'fs';

/**
 * TypeScript-specific extensions to CodeChunker
 */
export class TypeScriptChunker extends CodeChunker {
  constructor(options = {}) {
    super(options);

    // TypeScript-specific file extensions
    this.tsExtensions = new Set(['.ts', '.tsx', '.jsx', '.mtsx']);

    // Interface tracking
    this.interfaces = new Map();
    this.typeAliases = new Map();
    this.enums = new Map();
  }

  /**
   * Check if file is supported by TypeScript chunker
   * @param {string} filePath - File path to check
   * @returns {boolean} True if supported
   */
  isSupported(filePath) {
    // HIGH FIX #6: Add validation for file path parameter
    if (!filePath || typeof filePath !== 'string') {
      return false;
    }

    // Must have a file extension
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === filePath.length - 1) {
      return false;
    }

    const ext = filePath.substring(lastDotIndex);
    return this.tsExtensions.has(ext);
  }

  /**
   * Chunk a TypeScript/JSX source file
   * @param {string} sourceCode - Source code to chunk
   * @param {string} filePath - File path for context
   * @returns {Array} Array of chunks
   */
  chunkSourceFile(sourceCode, filePath) {
    const ext = filePath.substring(filePath.lastIndexOf('.'));

    // Use Babel for TypeScript/JSX files
    if (this.tsExtensions.has(ext)) {
      return this._chunkWithBabel(sourceCode, filePath);
    }

    // Fall back to Acorn for regular .js files
    return super.chunkSourceFile(sourceCode, filePath);
  }

  /**
   * Parse and chunk using Babel parser
   * @private
   */
  _chunkWithBabel(sourceCode, filePath) {
    const chunks = [];
    const lines = sourceCode.split('\n');

    try {
      const ast = parse(sourceCode, {
        sourceType: 'module',
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'functionBind',
          'exportDefaultFrom',
          'dynamicImport',
        ],
      });

      // Extract imports first
      const imports = this._extractBabelImports(ast, sourceCode, lines, filePath);
      chunks.push(...imports);

      // Extract exports
      const exports = this._extractBabelExports(ast, sourceCode, lines, filePath);
      chunks.push(...exports);

      // Extract interfaces
      const interfaces = this._extractInterfaces(ast, sourceCode, lines, filePath);
      chunks.push(...interfaces);
      this.interfaces.clear(); // Clear for next file

      // Extract type aliases
      const typeAliases = this._extractTypes(ast, sourceCode, lines, filePath);
      chunks.push(...typeAliases);
      this.typeAliases.clear();

      // Extract enums
      const enums = this._extractEnums(ast, sourceCode, lines, filePath);
      chunks.push(...enums);
      this.enums.clear();

      // Extract functions
      const functions = this._extractBabelFunctions(ast, sourceCode, lines, filePath);
      chunks.push(...functions);

      // Extract classes
      const classes = this._extractBabelClasses(ast, sourceCode, lines, filePath);
      chunks.push(...classes);

    } catch (error) {
      console.error(`[TypeScriptChunker] Error parsing ${filePath}:`, error.message);

      // Fall back to parent class error handling
      const parentChunks = super.chunkSourceFile(sourceCode, filePath);
      chunks.push(...parentChunks);
    }

    return chunks;
  }

  /**
   * Extract interface declarations
   * @private
   */
  _extractInterfaces(ast, sourceCode, lines, filePath) {
    const chunks = [];

    traverse.default(ast, {
      TSInterfaceDeclaration: (path) => {
        const node = path.node;
        const id = node.id;

        if (!id) return;

        const startLine = node.loc?.start.line || 0;
        const endLine = node.loc?.end.line || startLine;

        // Get the full text
        const text = lines.slice(startLine - 1, endLine).join('\n');

        // HIGH FIX #7: Check if interface is exported
        // In Babel, ExportNamedDeclaration wraps the declaration, so check if parent is ExportNamedDeclaration
        const isExported = path.parent.type === 'ExportNamedDeclaration';

        // Extract properties with comprehensive handling
        const properties = [];
        const methods = [];
        const indexSignatures = [];

        if (node.body.body) {
          for (const prop of node.body.body) {
            // Handle property signatures
            if (prop.type === 'TSPropertySignature' && prop.key) {
              properties.push({
                name: prop.key.name || prop.key.value,
                optional: prop.optional,
                readonly: prop.readonly,
                type: this._getTypeString(prop.typeAnnotation),
                isStatic: prop.static || false,
              });
            }
            // Handle method signatures
            else if (prop.type === 'TSMethodSignature' && prop.key) {
              methods.push({
                name: prop.key.name || prop.key.value,
                optional: prop.optional,
                params: prop.params?.map(p => this._getParamString(p)) || [],
                returnType: this._getTypeString(prop.returnType),
              });
            }
            // Handle index signatures
            else if (prop.type === 'TSIndexSignature') {
              indexSignatures.push({
                key: prop.parameters?.[0]?.name || '',
                keyType: this._getTypeString(prop.parameters?.[0]?.typeAnnotation),
                isReadOnly: prop.readonly || false,
                returnType: this._getTypeString(prop.typeAnnotation),
              });
            }
            // Handle call signatures
            else if (prop.type === 'TSCallSignatureDeclaration') {
              methods.push({
                name: '__call',
                params: prop.params?.map(p => this._getParamString(p)) || [],
                returnType: this._getTypeString(prop.typeAnnotation),
              });
            }
            // Handle construct signatures
            else if (prop.type === 'TSConstructSignatureDeclaration') {
              methods.push({
                name: '__new',
                params: prop.params?.map(p => this._getParamString(p)) || [],
                returnType: this._getTypeString(prop.typeAnnotation),
              });
            }
          }
        }

        const chunkId = `interface_${id.name}_${startLine}`;

        chunks.push({
          id: chunkId,
          type: 'interface',
          name: id.name,
          text,
          metadata: {
            file: filePath,
            startLine,
            endLine,
            exported: isExported,
            properties,
            methods,
            indexSignatures,
            extends: node.extends?.map(e => {
              if (e.type === 'TSInterfaceHeritage') {
                return {
                  name: e.expression?.name,
                  typeParams: e.typeParameters?.params?.map(p => this._getTypeString({ typeAnnotation: p })),
                };
              }
              return null;
            }).filter(Boolean) || [],
            typeParams: node.typeParameters?.params?.map(p => p.name) || [],
          },
        });

        // Track for reference resolution
        this.interfaces.set(id.name, { chunkId, properties, methods, indexSignatures });
      },
    });

    return chunks;
  }

  /**
   * Extract type aliases
   * @private
   */
  _extractTypes(ast, sourceCode, lines, filePath) {
    const chunks = [];

    traverse.default(ast, {
      TSTypeAliasDeclaration: (path) => {
        const node = path.node;
        const id = node.id;

        if (!id) return;

        const startLine = node.loc?.start.line || 0;
        const endLine = node.loc?.end.line || startLine;

        const text = lines.slice(startLine - 1, endLine).join('\n');
        const typeString = this._getTypeString(node.typeAnnotation);

        // HIGH FIX #7: Check if type alias is exported
        const isExported = path.parent.type === 'ExportNamedDeclaration';

        const chunkId = `type_${id.name}_${startLine}`;

        chunks.push({
          id: chunkId,
          type: 'type-alias',
          name: id.name,
          text,
          metadata: {
            file: filePath,
            startLine,
            endLine,
            exported: isExported,
            typeAnnotation: typeString,
          },
        });

        this.typeAliases.set(id.name, { chunkId, type: typeString });
      },
    });

    return chunks;
  }

  /**
   * Extract enum declarations
   * @private
   */
  _extractEnums(ast, sourceCode, lines, filePath) {
    const chunks = [];

    traverse.default(ast, {
      TSEnumDeclaration: (path) => {
        const node = path.node;
        const id = node.id;

        if (!id) return;

        const startLine = node.loc?.start.line || 0;
        const endLine = node.loc?.end.line || startLine;

        const text = lines.slice(startLine - 1, endLine).join('\n');

        // HIGH FIX #7: Check if enum is exported
        const isExported = path.parent.type === 'ExportNamedDeclaration';

        // Extract enum members
        const members = [];
        if (node.members) {
          for (const member of node.members) {
            if (member.id) {
              members.push({
                name: member.id.name,
                initializer: member.initializer?.value || null,
              });
            }
          }
        }

        const chunkId = `enum_${id.name}_${startLine}`;

        chunks.push({
          id: chunkId,
          type: 'enum',
          name: id.name,
          text,
          metadata: {
            file: filePath,
            startLine,
            endLine,
            exported: isExported,
            members,
          },
        });

        this.enums.set(id.name, { chunkId, members });
      },
    });

    return chunks;
  }

  /**
   * Extract function declarations using Babel
   * @private
   */
  _extractBabelFunctions(ast, sourceCode, lines, filePath) {
    const chunks = [];

    traverse.default(ast, {
      // Function declarations
      FunctionDeclaration: (path) => {
        const node = path.node;
        const id = node.id;

        if (!id) return;

        const startLine = node.loc?.start.line || 0;
        const endLine = node.loc?.end.line || startLine;

        const text = lines.slice(startLine - 1, endLine).join('\n');

        // Extract parameters
        const params = node.params?.map(p => this._getParamString(p)) || [];

        // Extract async flag
        const isAsync = node.async || false;

        const chunkId = `function_${id.name}_${startLine}`;

        chunks.push({
          id: chunkId,
          type: 'function',
          name: id.name,
          text,
          metadata: {
            file: filePath,
            startLine,
            endLine,
            exported: false,
            params,
            async: isAsync,
            generator: node.generator || false,
          },
        });
      },

      // Arrow functions assigned to variables
      VariableDeclarator: (path) => {
        const node = path.node;
        const id = node.id;

        if (!id || id.type !== 'Identifier') return;
        if (!node.init || node.init.type !== 'ArrowFunctionExpression') return;

        const startLine = node.loc?.start.line || 0;
        const endLine = node.loc?.end.line || startLine;

        const text = lines.slice(startLine - 1, endLine).join('\n');

        const params = node.init.params?.map(p => this._getParamString(p)) || [];

        const chunkId = `arrow_${id.name}_${startLine}`;

        chunks.push({
          id: chunkId,
          type: 'function',
          name: id.name,
          text,
          metadata: {
            file: filePath,
            startLine,
            endLine,
            exported: false,
            params,
            async: node.init.async || false,
            arrowFunction: true,
          },
        });
      },
    });

    return chunks;
  }

  /**
   * Extract class declarations using Babel
   * @private
   */
  _extractBabelClasses(ast, sourceCode, lines, filePath) {
    const chunks = [];

    traverse.default(ast, {
      ClassDeclaration: (path) => {
        const node = path.node;
        const id = node.id;

        if (!id) return;

        const startLine = node.loc?.start.line || 0;
        const endLine = node.loc?.end.line || startLine;

        const text = lines.slice(startLine - 1, endLine).join('\n');

        // Extract methods
        const methods = [];
        if (node.body.body) {
          for (const method of node.body.body) {
            if (method.type === 'ClassMethod' && method.key) {
              methods.push({
                name: method.key.name,
                kind: method.kind, // 'get', 'set', 'method', 'constructor'
                async: method.async || false,
                params: method.params?.map(p => this._getParamString(p)) || [],
              });
            }
          }
        }

        // Extract implements (rename to avoid reserved word)
        const classImplements = node.implements?.map(i => {
          if (i.type === 'TSExpressionWithTypeArguments' && i.expression) {
            return i.expression.name;
          }
          return null;
        }).filter(Boolean) || [];

        const chunkId = `class_${id.name}_${startLine}`;

        chunks.push({
          id: chunkId,
          type: 'class',
          name: id.name,
          text,
          metadata: {
            file: filePath,
            startLine,
            endLine,
            exported: false,
            methods,
            implements: classImplements,
            extends: node.superClass?.name || null,
          },
        });
      },
    });

    return chunks;
  }

  /**
   * Extract imports using Babel
   * @private
   */
  _extractBabelImports(ast, sourceCode, lines, filePath) {
    const chunks = [];

    traverse.default(ast, {
      ImportDeclaration: (path) => {
        const node = path.node;
        const startLine = node.loc?.start.line || 0;
        const endLine = node.loc?.end.line || startLine;

        const text = lines.slice(startLine - 1, endLine).join('\n');

        const chunkId = `import_${startLine}`;

        chunks.push({
          id: chunkId,
          type: 'imports',
          name: 'imports',
          text,
          metadata: {
            file: filePath,
            startLine,
            endLine,
            source: node.source.value,
            specifiers: node.specifiers?.map(s => ({
              type: s.type,
              imported: s.imported?.name,
              local: s.local?.name,
            })) || [],
          },
        });
      },
    });

    return chunks;
  }

  /**
   * Extract exports using Babel
   * @private
   */
  _extractBabelExports(ast, sourceCode, lines, filePath) {
    const chunks = [];

    traverse.default(ast, {
      ExportNamedDeclaration: (path) => {
        const node = path.node;
        const startLine = node.loc?.start.line || 0;
        const endLine = node.loc?.end.line || startLine;

        const text = lines.slice(startLine - 1, endLine).join('\n');

        const chunkId = `export_${startLine}`;

        chunks.push({
          id: chunkId,
          type: 'export',
          name: 'export',
          text,
          metadata: {
            file: filePath,
            startLine,
            endLine,
            exported: true,
            specifiers: node.specifiers?.map(s => ({
              exported: s.exported?.name,
              local: s.local?.name,
            })) || [],
            source: node.source?.value,
          },
        });
      },

      ExportDefaultDeclaration: (path) => {
        const node = path.node;
        const startLine = node.loc?.start.line || 0;
        const endLine = node.loc?.end.line || startLine;

        const text = lines.slice(startLine - 1, endLine).join('\n');

        const chunkId = `export_default_${startLine}`;

        chunks.push({
          id: chunkId,
          type: 'export',
          name: 'default',
          text,
          metadata: {
            file: filePath,
            startLine,
            endLine,
            exported: true,
            isDefault: true,
            declarationType: node.declaration?.type,
          },
        });
      },
    });

    return chunks;
  }

  /**
   * Get parameter string from Babel parameter node
   * @private
   */
  _getParamString(param) {
    if (param.type === 'Identifier') {
      return param.name;
    }
    if (param.type === 'RestElement') {
      return '...' + this._getParamString(param.argument);
    }
    if (param.type === 'ObjectPattern') {
      return '{ ... }';
    }
    if (param.type === 'ArrayPattern') {
      return '[ ... ]';
    }
    if (param.type === 'AssignmentPattern') {
      return this._getParamString(param.left) + ' = ' + (param.right.value || '?');
    }
    return '?';
  }

  /**
   * Get type annotation string
   * @private
   */
  _getTypeString(typeAnnotation) {
    if (!typeAnnotation || !typeAnnotation.typeAnnotation) {
      return 'any';
    }

    const type = typeAnnotation.typeAnnotation;

    switch (type.type) {
      case 'TSStringKeyword':
        return 'string';
      case 'TSNumberKeyword':
        return 'number';
      case 'TSBooleanKeyword':
        return 'boolean';
      case 'TSVoidKeyword':
        return 'void';
      case 'TSAnyKeyword':
        return 'any';
      case 'TSUnknownKeyword':
        return 'unknown';
      case 'TSNeverKeyword':
        return 'never';
      case 'TSArrayType':
        return this._getTypeString({ typeAnnotation: type.elementType }) + '[]';
      case 'TSUnionType':
        return type.types?.map(t => this._getTypeString({ typeAnnotation: t })).join(' | ') || 'unknown';
      case 'TSIntersectionType':
        return type.types?.map(t => this._getTypeString({ typeAnnotation: t })).join(' & ') || 'unknown';
      case 'TSTypeReference':
        return type.typeName?.name || 'unknown';
      case 'TSFunctionType':
        return 'function';
      default:
        return 'unknown';
    }
  }
}

export default TypeScriptChunker;
