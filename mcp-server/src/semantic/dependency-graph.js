/**
 * Dependency Graph
 *
 * Tracks symbol definitions and usages across the codebase.
 * Enables quick lookup of where symbols are defined and used.
 */

/**
 * Symbol types
 */
const SYMBOL_TYPES = {
  FUNCTION: 'function',
  CLASS: 'class',
  METHOD: 'method',
  VARIABLE: 'variable',
  PARAMETER: 'parameter',
  IMPORT: 'import',
  EXPORT: 'export'
};

/**
 * Dependency Graph class
 */
export class DependencyGraph {
  constructor() {
    // symbol -> chunks that define it
    this.definitions = new Map();

    // symbol -> chunks that use it
    this.usages = new Map();

    // file -> exported symbols
    this.exports = new Map();

    // file -> imported symbols
    this.imports = new Map();

    // chunkId -> {defines, uses} for quick lookup
    this.chunkSymbols = new Map();

    // file -> chunks
    this.fileChunks = new Map();

    // CRITICAL FIX #8: Prevent unbounded array growth
    this.maxDefinitionsPerSymbol = 1000;
    this.maxUsagesPerSymbol = 5000;
  }

  /**
   * Add a chunk to the graph
   */
  addChunk(chunk) {
    const { id, type, name, metadata } = chunk;

    // Initialize chunk symbols
    this.chunkSymbols.set(id, {
      defines: new Set(),
      uses: new Set()
    });

    // Add to file chunks
    const file = metadata.file || '';
    if (!this.fileChunks.has(file)) {
      this.fileChunks.set(file, []);
    }
    this.fileChunks.get(file).push(id);

    // Process based on chunk type
    switch (type) {
      case 'function':
        this._addFunction(chunk);
        break;
      case 'class':
      case 'class-declaration':
        this._addClass(chunk);
        break;
      case 'method':
        this._addMethod(chunk);
        break;
      case 'variable':
        this._addVariable(chunk);
        break;
      case 'imports':
        this._addImports(chunk);
        break;
      case 'export':
        this._addExport(chunk);
        break;
      default:
        this._addGenericChunk(chunk);
    }

    // Track calls/usages
    if (metadata.calls) {
      for (const call of metadata.calls) {
        this._addUsage(call, id, 'call');
      }
    }

    // Track throws
    if (metadata.throws) {
      for (const thrown of metadata.throws) {
        this._addUsage(thrown, id, 'throw');
      }
    }
  }

  /**
   * Add a function to the graph
   */
  _addFunction(chunk) {
    const { id, name, metadata } = chunk;

    // Register definition
    this._addDefinition(name, id, {
      type: SYMBOL_TYPES.FUNCTION,
      file: metadata.file,
      exported: metadata.exported
    });

    // Track as export if exported
    if (metadata.exported) {
      this._addExport(metadata.file, name, id);
    }

    // Track parameters
    if (metadata.params) {
      for (const param of metadata.params) {
        const paramName = this._extractParamName(param);
        if (paramName) {
          this._addDefinition(paramName, id, {
            type: SYMBOL_TYPES.PARAMETER,
            file: metadata.file,
            parentId: name
          });
        }
      }
    }
  }

  /**
   * Add a class to the graph
   */
  _addClass(chunk) {
    const { id, name, metadata } = chunk;

    this._addDefinition(name, id, {
      type: SYMBOL_TYPES.CLASS,
      file: metadata.file,
      exported: metadata.exported
    });

    if (metadata.exported) {
      this._addExport(metadata.file, name, id);
    }

    // Track methods if present
    if (metadata.methods) {
      for (const method of metadata.methods) {
        const methodId = `${id}_${method.name}`;
        this._addDefinition(`${name}.${method.name}`, methodId, {
          type: SYMBOL_TYPES.METHOD,
          file: metadata.file,
          className: name,
          kind: method.kind
        });
      }
    }
  }

  /**
   * Add a method to the graph
   */
  _addMethod(chunk) {
    const { id, name, className, metadata } = chunk;

    this._addDefinition(name, id, {
      type: SYMBOL_TYPES.METHOD,
      file: metadata.file,
      className,
      kind: metadata.kind
    });
  }

  /**
   * Add a variable to the graph
   */
  _addVariable(chunk) {
    const { id, name, metadata } = chunk;

    // Handle multiple variables (e.g., const a, b, c)
    const names = metadata.names || [name];

    for (const varName of names) {
      this._addDefinition(varName, id, {
        type: SYMBOL_TYPES.VARIABLE,
        file: metadata.file,
        kind: metadata.kind
      });
    }
  }

  /**
   * Add imports to the graph
   */
  _addImports(chunk) {
    const { id, text, metadata } = chunk;

    // Parse import statements
    const importRegex = /import\s+(?:(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;

    // CRITICAL FIX #2: Prevent ReDoS by limiting iterations
    let iterations = 0;
    const maxIterations = 1000; // Safe upper limit for import parsing

    while ((match = importRegex.exec(text)) !== null) {
      iterations++;
      if (iterations > maxIterations) {
        console.warn(`[DependencyGraph] Too many import matches (${iterations}), stopping to prevent ReDoS`);
        break;
      }

      const imports = match[1];
      const source = match[2];

      if (!this.imports.has(metadata.file)) {
        this.imports.set(metadata.file, []);
      }

      this.imports.get(metadata.file).push({
        source,
        imports,
        chunkId: id
      });

      // Track named imports as usages
      if (imports && imports.startsWith('{')) {
        const names = imports.slice(1, -1).split(',').map(s => s.trim().split(' ')[0]);
        for (const name of names) {
          this._addImport(metadata.file, name, source, id);
        }
      } else if (imports && !imports.startsWith('*')) {
        this._addImport(metadata.file, imports, source, id);
      }
    }
  }

  /**
   * Add an export to the graph
   */
  _addExport(chunk) {
    const { name, metadata, type } = chunk;

    if (type === 'export') {
      // Parse named exports
      const exportRegex = /export\s+\{([^}]+)\}/;
      const match = chunk.text.match(exportRegex);

      if (match) {
        const names = match[1].split(',').map(s => s.trim().split(' ')[0]);
        for (const name of names) {
          this._addExport(metadata.file, name, chunk.id);
        }
      }
    }
  }

  /**
   * Add a generic chunk to the graph
   */
  _addGenericChunk(chunk) {
    // Try to extract symbols from the text
    const { id, text, metadata } = chunk;

    // Look for function calls
    const callRegex = /(\w+)\s*\(/g;
    let match;

    // CRITICAL FIX #2: Prevent ReDoS by limiting iterations
    let iterations = 0;
    const maxIterations = 10000; // Safe upper limit for call extraction

    while ((match = callRegex.exec(text)) !== null) {
      iterations++;
      if (iterations > maxIterations) {
        console.warn(`[DependencyGraph] Too many call matches (${iterations}), stopping to prevent ReDoS`);
        break;
      }

      // Skip if it's a keyword
      if (!this._isKeyword(match[1])) {
        this._addUsage(match[1], id, 'call');
      }
    }
  }

  /**
   * Add a definition
   */
  _addDefinition(symbol, chunkId, info) {
    if (!this.definitions.has(symbol)) {
      this.definitions.set(symbol, []);
    }

    // CRITICAL FIX #8: Prevent unbounded array growth
    const defs = this.definitions.get(symbol);
    if (defs.length >= this.maxDefinitionsPerSymbol) {
      // Skip this definition if we've reached the limit
      return;
    }

    defs.push({
      chunkId,
      ...info
    });

    // Track in chunk symbols
    const chunkSyms = this.chunkSymbols.get(chunkId);
    if (chunkSyms) {
      chunkSyms.defines.add(symbol);
    }
  }

  /**
   * Add a usage
   */
  _addUsage(symbol, chunkId, usageType = 'use') {
    if (!this.usages.has(symbol)) {
      this.usages.set(symbol, []);
    }

    // Avoid duplicates and enforce limit
    const existing = this.usages.get(symbol);

    // CRITICAL FIX #8: Prevent unbounded array growth
    if (existing.length >= this.maxUsagesPerSymbol) {
      // Skip this usage if we've reached the limit
      return;
    }

    if (!existing.some(u => u.chunkId === chunkId)) {
      existing.push({
        chunkId,
        usageType
      });
    }

    // Track in chunk symbols
    const chunkSyms = this.chunkSymbols.get(chunkId);
    if (chunkSyms) {
      chunkSyms.uses.add(symbol);
    }
  }

  /**
   * Add an export
   */
  _addExport(file, symbol, chunkId) {
    if (!this.exports.has(file)) {
      this.exports.set(file, []);
    }

    // Avoid duplicates
    const existing = this.exports.get(file);
    if (!existing.some(e => e.symbol === symbol)) {
      existing.push({
        symbol,
        chunkId
      });
    }
  }

  /**
   * Add an import
   */
  _addImport(file, symbol, source, chunkId) {
    if (!this.imports.has(file)) {
      this.imports.set(file, []);
    }

    // Avoid duplicates
    const existing = this.imports.get(file);
    if (!existing.some(i => i.symbol === symbol && i.source === source)) {
      existing.push({
        symbol,
        source,
        chunkId
      });
    }
  }

  /**
   * Find usages of a symbol
   */
  findUsages(symbolName) {
    return this.usages.get(symbolName) || [];
  }

  /**
   * Find definitions of a symbol
   */
  findDefinition(symbolName) {
    return this.definitions.get(symbolName) || [];
  }

  /**
   * Find exports from a file
   */
  findExports(filePath) {
    return this.exports.get(filePath) || [];
  }

  /**
   * Find imports for a file
   */
  findImports(filePath) {
    return this.imports.get(filePath) || [];
  }

  /**
   * Get all chunks for a file
   */
  getChunksForFile(filePath) {
    return this.fileChunks.get(filePath) || [];
  }

  /**
   * Get symbols for a chunk
   */
  getSymbolsForChunk(chunkId) {
    return this.chunkSymbols.get(chunkId) || { defines: new Set(), uses: new Set() };
  }

  /**
   * Find related chunks (callers and callees)
   */
  findRelatedChunks(chunkId) {
    const chunkSyms = this.chunkSymbols.get(chunkId);
    if (!chunkSyms) {
      return { callers: [], callees: [] };
    }

    const callers = [];
    const callees = [];

    // Find callers (chunks that use symbols defined in this chunk)
    for (const symbol of chunkSyms.defines) {
      const usages = this.usages.get(symbol) || [];
      for (const usage of usages) {
        if (usage.chunkId !== chunkId) {
          callers.push({
            chunkId: usage.chunkId,
            symbol,
            usageType: usage.usageType
          });
        }
      }
    }

    // Find callees (chunks that define symbols used in this chunk)
    for (const symbol of chunkSyms.uses) {
      const definitions = this.definitions.get(symbol) || [];
      for (const definition of definitions) {
        if (definition.chunkId !== chunkId) {
          callees.push({
            chunkId: definition.chunkId,
            symbol,
            type: definition.type
          });
        }
      }
    }

    return { callers, callees };
  }

  /**
   * Get graph statistics
   */
  getStats() {
    let totalDefinitions = 0;
    let totalUsages = 0;

    for (const defs of this.definitions.values()) {
      totalDefinitions += defs.length;
    }

    for (const uses of this.usages.values()) {
      totalUsages += uses.length;
    }

    return {
      symbols: this.definitions.size,
      definitions: totalDefinitions,
      usages: totalUsages,
      files: this.fileChunks.size,
      chunks: this.chunkSymbols.size,
      exports: this.exports.size,
      imports: this.imports.size
    };
  }

  /**
   * Export graph data
   */
  export() {
    return {
      version: 1,
      definitions: Array.from(this.definitions.entries()),
      usages: Array.from(this.usages.entries()),
      exports: Array.from(this.exports.entries()),
      imports: Array.from(this.imports.entries()),
      chunkSymbols: Array.from(this.chunkSymbols.entries()).map(([id, syms]) => [
        id,
        { defines: Array.from(syms.defines), uses: Array.from(syms.uses) }
      ]),
      fileChunks: Array.from(this.fileChunks.entries())
    };
  }

  /**
   * Import graph data
   */
  import(data) {
    if (data.version !== 1) {
      throw new Error(`Unsupported dependency graph version: ${data.version}`);
    }

    this.definitions = new Map(data.definitions);
    this.usages = new Map(data.usages);
    this.exports = new Map(data.exports);
    this.imports = new Map(data.imports);
    this.chunkSymbols = new Map(data.chunkSymbols.map(([id, syms]) => [
      id,
      { defines: new Set(syms.defines), uses: new Set(syms.uses) }
    ]));
    this.fileChunks = new Map(data.fileChunks);

    console.error(`[DependencyGraph] Imported ${this.chunkSymbols.size} chunks with ${this.definitions.size} symbols`);
  }

  /**
   * Check if a word is a JavaScript keyword
   */
  _isKeyword(word) {
    const keywords = new Set([
      'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
      'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
      'false', 'finally', 'for', 'function', 'if', 'implements', 'import',
      'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package',
      'private', 'protected', 'public', 'return', 'static', 'super',
      'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var',
      'void', 'while', 'with', 'yield'
    ]);

    return keywords.has(word);
  }

  /**
   * Extract parameter name from parameter string
   */
  _extractParamName(param) {
    if (param.startsWith('...')) {
      return param.substring(3);
    }
    if (param.startsWith('{') || param.startsWith('[')) {
      return null; // Destructuring, skip
    }
    return param;
  }

  /**
   * Remove a chunk from the graph
   * Cleans up all references to the chunk across all data structures
   */
  removeChunk(chunkId) {
    const chunkSyms = this.chunkSymbols.get(chunkId);
    if (!chunkSyms) {
      return false; // Chunk not found
    }

    // Remove definitions for symbols defined by this chunk
    for (const symbol of chunkSyms.defines) {
      const defs = this.definitions.get(symbol);
      if (defs) {
        // Filter out this chunk's definition
        const filtered = defs.filter(d => d.chunkId !== chunkId);
        if (filtered.length === 0) {
          this.definitions.delete(symbol);
        } else {
          this.definitions.set(symbol, filtered);
        }
      }
    }

    // Remove usages for symbols used by this chunk
    for (const symbol of chunkSyms.uses) {
      const uses = this.usages.get(symbol);
      if (uses) {
        // Filter out this chunk's usage
        const filtered = uses.filter(u => u.chunkId !== chunkId);
        if (filtered.length === 0) {
          this.usages.delete(symbol);
        } else {
          this.usages.set(symbol, filtered);
        }
      }
    }

    // Remove from exports
    for (const [file, exports] of this.exports.entries()) {
      const filtered = exports.filter(e => e.chunkId !== chunkId);
      if (filtered.length === 0) {
        this.exports.delete(file);
      } else {
        this.exports.set(file, filtered);
      }
    }

    // Remove from imports
    for (const [file, imports] of this.imports.entries()) {
      const filtered = imports.filter(i => i.chunkId !== chunkId);
      if (filtered.length === 0) {
        this.imports.delete(file);
      } else {
        this.imports.set(file, filtered);
      }
    }

    // Remove from file chunks
    for (const [file, chunks] of this.fileChunks.entries()) {
      const filtered = chunks.filter(id => id !== chunkId);
      if (filtered.length === 0) {
        this.fileChunks.delete(file);
      } else {
        this.fileChunks.set(file, filtered);
      }
    }

    // Remove from chunk symbols
    this.chunkSymbols.delete(chunkId);

    return true;
  }

  /**
   * Clear all data
   */
  clear() {
    this.definitions.clear();
    this.usages.clear();
    this.exports.clear();
    this.imports.clear();
    this.chunkSymbols.clear();
    this.fileChunks.clear();
  }
}

/**
 * Symbol type constants
 */
export { SYMBOL_TYPES };

export default DependencyGraph;
