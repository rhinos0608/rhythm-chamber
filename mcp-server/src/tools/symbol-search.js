/**
 * MCP Tool: symbol_search
 *
 * Search code symbols by exact name, pattern, or semantic meaning.
 * Uses FTS5 for fast full-text symbol search with wildcard support.
 *
 * Phase 2: Symbol-Aware Indexing
 */

/**
 * Tool schema definition
 */
export const schema = {
  name: 'symbol_search',
  description: 'Search code symbols (functions, classes, methods, variables, interfaces, types, enums) by exact name, pattern, or semantic meaning. Uses FTS5 full-text search with wildcard support for fast lookups.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Symbol name or search query. Supports wildcards: * for any characters, ? for single character. Examples: "handleMessage", "handle*", "*Service", "getUser*".',
      },
      searchMode: {
        type: 'string',
        enum: ['exact', 'pattern', 'semantic'],
        description: 'Search mode: "exact" for exact match, "pattern" for wildcard search, "semantic" for meaning-based search (uses semantic_search internally)',
        default: 'exact',
      },
      symbolType: {
        type: 'string',
        enum: ['function', 'class', 'method', 'variable', 'interface', 'type', 'enum', 'all'],
        description: 'Filter by symbol type',
        default: 'all',
      },
      includeUsages: {
        type: 'boolean',
        description: 'Include call graph (where this symbol is used)',
        default: false,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 10,
        minimum: 1,
        maximum: 50,
      },
      exportedOnly: {
        type: 'boolean',
        description: 'Only return exported symbols',
        default: false,
      },
    },
    required: ['query'],
  },
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot, indexer, server) => {
  const {
    query,
    searchMode = 'exact',
    symbolType = 'all',
    includeUsages = false,
    limit = 10,
    exportedOnly = false,
  } = args;

  // Check if indexer is available
  if (!indexer) {
    return {
      content: [
        {
          type: 'text',
          text: `# Symbol Search Not Available

The symbol search indexer has not been initialized. Please ensure the MCP server
has completed indexing.

**Troubleshooting:**
- Check server logs for indexing errors
- Verify the codebase has been indexed
- Try running \`indexing_control\` with action: "start"`,
        },
      ],
    };
  }

  // Check if dependency graph supports symbol search
  const depGraph = indexer.dependencyGraph;
  if (!depGraph) {
    return {
      content: [
        {
          type: 'text',
          text: `# Symbol Search Not Available

The dependency graph has not been initialized. Symbol search requires the
dependency graph to be built during indexing.

**Note:** If you're using SymbolIndex (Phase 2), ensure migration has completed.`,
        },
      ],
    };
  }

  try {
    const results = await _performSymbolSearch(
      depGraph,
      query,
      searchMode,
      symbolType,
      includeUsages,
      limit,
      exportedOnly
    );

    return {
      content: [
        {
          type: 'text',
          text: results,
        },
      ],
    };
  } catch (error) {
    console.error('[symbol_search] Error:', error);

    return {
      content: [
        {
          type: 'text',
          text: `# Symbol Search Error

**Error:** ${error.message}

**Query:** "${query}"
**Mode:** ${searchMode}
**Type:** ${symbolType}`,
          isError: true,
        },
      ],
    };
  }
};

/**
 * Perform the actual symbol search
 * @private
 */
async function _performSymbolSearch(
  depGraph,
  query,
  searchMode,
  symbolType,
  includeUsages,
  limit,
  exportedOnly
) {
  const startTime = Date.now();
  let symbols = [];
  const usages = [];

  // Route to appropriate search method
  if (depGraph.searchSymbols && typeof depGraph.searchSymbols === 'function') {
    // SymbolIndex with FTS5 support
    const searchType = symbolType === 'all' ? undefined : symbolType;
    symbols = depGraph.searchSymbols(query, { type: searchType, limit });
  } else {
    // Fallback to in-memory DependencyGraph
    if (searchMode === 'exact') {
      symbols = depGraph.findDefinition(query) || [];
    } else {
      // Pattern matching fallback
      symbols = _patternSearch(depGraph, query, symbolType, limit);
    }
  }

  // Filter by exported
  if (exportedOnly) {
    symbols = symbols.filter(s => s.exported);
  }

  // Filter by type if not already done
  if (symbolType !== 'all' && !depGraph.searchSymbols) {
    symbols = symbols.filter(s => s.type === symbolType);
  }

  // Fetch usages if requested
  if (includeUsages && symbols.length > 0) {
    for (const symbol of symbols) {
      const name = symbol.name || symbol.qualifiedName;
      if (name) {
        const symbolUsages = depGraph.findUsages ? depGraph.findUsages(name) : [];
        usages.push(...symbolUsages.map(u => ({ ...u, symbol: name })));
      }
    }
  }

  const duration = Date.now() - startTime;

  return _formatResults(symbols, usages, query, searchMode, symbolType, duration);
}

/**
 * Pattern search for in-memory fallback
 * @private
 */
function _patternSearch(depGraph, query, symbolType, limit) {
  const results = [];

  // Security: Limit wildcard count to prevent ReDoS
  const wildcardCount = (query.match(/\*/g) || []).length;
  if (wildcardCount > 5) {
    console.warn(`[symbol-search] Pattern has too many wildcards (${wildcardCount}), truncating to 5`);
    // Truncate excessive wildcards
    const parts = query.split('*');
    query = parts.slice(0, 6).join('*');
  }

  // Security: Limit query length
  if (query.length > 100) {
    console.warn('[symbol-search] Pattern too long, truncating');
    query = query.substring(0, 100);
  }

  // Convert wildcard pattern to regex
  const pattern = query
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  let regex;
  try {
    regex = new RegExp(`^${pattern}$`, 'i');
  } catch (error) {
    console.warn('[symbol-search] Invalid regex pattern:', error.message);
    return [];
  }

  // Security: Limit iterations to prevent infinite loops
  const MAX_ITERATIONS = 10000;
  let iterations = 0;

  for (const [symbolName, defs] of depGraph.definitions.entries()) {
    iterations++;

    if (iterations > MAX_ITERATIONS) {
      console.warn(`[symbol-search] Pattern search exceeded iteration limit (${MAX_ITERATIONS}), stopping`);
      break;
    }

    try {
      if (regex.test(symbolName)) {
        for (const def of defs) {
          // Type filter
          if (symbolType !== 'all' && def.type !== symbolType) {
            continue;
          }

          results.push({
            name: symbolName,
            qualifiedName: symbolName,
            chunkId: def.chunkId,
            type: def.type,
            file: def.file,
            exported: def.exported || false,
            line: def.line || 0,
          });

          if (results.length >= limit) {
            return results;
          }
        }
      }
    } catch (error) {
      // Skip this symbol if regex test fails
      continue;
    }
  }

  return results;
}

/**
 * Format search results
 * @private
 */
function _formatResults(symbols, usages, query, searchMode, symbolType, duration) {
  if (symbols.length === 0) {
    return `# No Symbols Found

**Query:** "${query}"
**Mode:** ${searchMode}
**Type:** ${symbolType}

**Suggestions:**
- Try using wildcards: \`*\` for any characters, \`?\` for single character
- Examples: \`handle*\`, \`*Service\`, \`get*User*\`
- Check spelling and case sensitivity
- Use \`searchMode: "semantic"\` for meaning-based search`;
  }

  let output = `# Symbol Search Results

**Query:** "${query}"
**Mode:** ${searchMode}
**Type:** ${symbolType}
**Found:** ${symbols.length} symbol(s)
**Duration:** ${duration}ms

`;

  // Group by type
  const grouped = {};
  for (const symbol of symbols) {
    const type = symbol.type || 'unknown';
    if (!grouped[type]) {
      grouped[type] = [];
    }
    grouped[type].push(symbol);
  }

  // Output by type
  for (const [type, typeSymbols] of Object.entries(grouped)) {
    output += `## ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n`;

    for (const symbol of typeSymbols) {
      const exported = symbol.exported ? ' 🔶' : '';
      const async = symbol.async ? ' ⚡' : '';
      const static_ = symbol.static ? ' 📌' : '';

      output += `### \`${symbol.name}\`${exported}${async}${static_}\n\n`;

      if (symbol.qualifiedName && symbol.qualifiedName !== symbol.name) {
        output += `**Qualified:** \`${symbol.qualifiedName}\`\n\n`;
      }

      if (symbol.signature) {
        const signature = symbol.signature;
        output += `**Signature:** \`${signature}\`\n\n`;
      }

      if (symbol.file) {
        const line = symbol.line ? `:${symbol.line}` : '';
        output += `**Location:** [\`${symbol.file}${line}\`](${symbol.file}${line})\n\n`;
      }

      if (symbol.parameters && symbol.parameters.length > 0) {
        output += `**Parameters:** \`${symbol.parameters.join(', ')}\`\n\n`;
      }

      if (symbol.className) {
        output += `**Class:** \`${symbol.className}\`\n\n`;
      }

      if (symbol.chunkId) {
        output += `**Chunk ID:** \`${symbol.chunkId}\`\n\n`;
      }
    }
  }

  // Add usages if requested
  if (usages.length > 0) {
    output += '\n## Call Graph (Usages)\n\n';
    output += `Found ${usages.length} usage(s):\n\n`;

    // Group by symbol
    const bySymbol = {};
    for (const usage of usages) {
      const name = usage.symbol || usage.symbol_name;
      if (!bySymbol[name]) {
        bySymbol[name] = [];
      }
      bySymbol[name].push(usage);
    }

    for (const [symbol, symbolUsages] of Object.entries(bySymbol)) {
      output += `### \`${symbol}\`\n\n`;
      for (const usage of symbolUsages.slice(0, 10)) { // Limit to 10 per symbol
        const file = usage.file || 'unknown';
        const line = usage.line ? `:${usage.line}` : '';
        const type = usage.usage_type || usage.usageType || 'use';
        output += `- [\`${file}${line}\`](${file}${line}) (${type})\n`;
      }
      if (symbolUsages.length > 10) {
        output += `- ... and ${symbolUsages.length - 10} more\n`;
      }
      output += '\n';
    }
  }

  return output;
}

export default {
  schema,
  handler,
};
