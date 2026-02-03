/**
 * MCP Tool: semantic_search
 *
 * Search the codebase by semantic meaning using vector embeddings.
 * Finds code that is conceptually similar to the query, not just keyword matches.
 */

import { getEmbeddingsInstance } from '../semantic/embeddings.js';

/**
 * Tool schema definition
 */
export const schema = {
  name: 'semantic_search',
  description:
    'Search codebase by semantic meaning using vector embeddings. Finds code that is conceptually similar to the query, not just keyword matches.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Natural language query describing what you are looking for (e.g., "how are sessions created?", "authentication flow", "error handling for API calls")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 5,
        minimum: 1,
        maximum: 20,
      },
      threshold: {
        type: 'number',
        description:
          'Minimum similarity threshold (0-1). Lower values return more results but may be less relevant.',
        default: 0.3,
        minimum: 0,
        maximum: 1,
      },
      maxChars: {
        type: 'number',
        description: 'Maximum characters per code snippet (prevents OOM)',
        default: 300,
        minimum: 100,
        maximum: 1000,
      },
      summaryMode: {
        type: 'boolean',
        description: 'Return compact summary instead of full code snippets',
        default: true,
      },
      filters: {
        type: 'object',
        description: 'Filters to apply to search results',
        properties: {
          chunkType: {
            type: 'string',
            enum: ['function', 'class', 'method', 'variable', 'imports', 'export', 'code'],
            description: 'Filter by chunk type',
          },
          exportedOnly: {
            type: 'boolean',
            description: 'Only return exported symbols',
            default: false,
          },
          filePath: {
            type: 'string',
            description: 'Only search in specific file',
          },
          layer: {
            type: 'string',
            enum: ['controllers', 'services', 'utils', 'storage', 'providers'],
            description: 'Filter by HNW architecture layer',
          },
          filePattern: {
            type: 'string',
            description: 'Regex pattern to match file paths',
          },
        },
      },
    },
    required: ['query'],
  },
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot, indexer, server) => {
  const { query, limit = 5, threshold = 0.3, maxChars = 300, summaryMode = true, filters = {} } = args;

  // Check if indexer is available
  if (!indexer) {
    return {
      content: [
        {
          type: 'text',
          text: `# Semantic Search Not Available

The semantic search indexer has not been initialized. Please ensure the MCP server
was started with semantic search enabled.

**Current status:** Indexer is null or undefined

**To fix:**
1. Ensure the server was started with semantic search enabled
2. Check that indexing completed successfully
3. Verify the cache directory is accessible

**Fallback:** Use the \`search_architecture\` tool for pattern-based searching.
`,
        },
      ],
      isError: false,
    };
  }

  // Check if indexing is in progress
  const status = server?.getIndexingStatus ? server.getIndexingStatus() : { status: 'unknown' };
  if (status.status === 'indexing') {
    return {
      content: [
        {
          type: 'text',
          text: `# Indexing in Progress

Semantic search is currently building the index. This may take a minute for the first run.

**Status:**
- Indexing files and generating embeddings...
- Please wait and try again

**Progress:**
- Files discovered: ${status.stats?.filesDiscovered || 0}
- Chunks indexed: ${status.stats?.chunksIndexed || 0}
- Embedding source: ${status.stats?.embeddingSource || 'unknown'}

**Tip:** The server remains ready for other tools during indexing.
`,
        },
      ],
      isError: false,
    };
  }

  // Check for indexing errors
  if (status.error) {
    return {
      content: [
        {
          type: 'text',
          text: `# Indexing Error

Semantic search encountered an error during indexing:

**Error:** ${status.error}

**To fix:**
1. Check the server logs for details
2. Try reindexing with \`rm -rf .mcp-cache\` and restart
3. Verify the project contains JavaScript files
`,
        },
      ],
      isError: true,
    };
  }

  // Check if indexing has been performed
  const stats = indexer.getStats();
  if (stats.vectorStore?.chunkCount === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `# No Indexed Code Found

The semantic search index is empty. This could mean:
1. Indexing has not been performed yet
2. No JavaScript files were found in the project
3. All files were filtered out by ignore patterns

**Current stats:**
- Files discovered: ${stats.filesDiscovered || 0}
- Chunks indexed: ${stats.chunksIndexed || 0}
- Embedding source: ${stats.embeddingSource || 'unknown'}

**To fix:**
1. Ensure the project contains JavaScript files in the expected locations
2. Check the ignore patterns in the indexer configuration
3. Try running the indexer manually to see detailed logs
`,
        },
      ],
      isError: false,
    };
  }

  try {
    // Perform semantic search
    const results = await indexer.search(query, { limit, threshold, filters });

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: formatNoResults(query, threshold, filters),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: formatResults(query, results, stats, { maxChars, summaryMode }),
        },
      ],
      metadata: {
        query,
        resultCount: results.length,
        avgSimilarity: results.reduce((a, b) => a + b.similarity, 0) / results.length,
      },
    };
  } catch (error) {
    console.error('[semantic_search] Error:', error);

    return {
      content: [
        {
          type: 'text',
          text: `# Search Error

An error occurred while performing semantic search:

**Error:** ${error.message}

**Query:** ${query}

**Suggestion:** Try rephrasing your query or use the \`search_architecture\` tool as an alternative.
`,
        },
      ],
      isError: true,
    };
  }
};

/**
 * Format search results with payload caps
 * @param {string} query - Search query
 * @param {Array} results - Search results
 * @param {Object} stats - Index statistics
 * @param {Object} options - Formatting options
 * @param {number} options.maxChars - Max characters per snippet
 * @param {boolean} options.summaryMode - Use compact summary format
 */
function formatResults(query, results, stats, options = {}) {
  const { maxChars = 300, summaryMode = true } = options;
  const lines = [];

  lines.push('# Semantic Search Results');
  lines.push('');
  lines.push(`**Query:** ${query}`);
  lines.push(`**Results:** ${results.length} matches`);
  lines.push(`**Index:** ${stats.vectorStore?.chunkCount || 0} chunks indexed`);
  lines.push(`**Source:** ${stats.embeddingSource || 'unknown'}`);
  lines.push('');

  // Group by file
  const byFile = new Map();
  for (const result of results) {
    const file = result.metadata?.file || 'unknown';
    if (!byFile.has(file)) {
      byFile.set(file, []);
    }
    byFile.get(file).push(result);
  }

  // SUMMARY MODE: Compact one-line per result format
  if (summaryMode) {
    lines.push('**Matches:**');
    for (const result of results) {
      const { chunkId, similarity, metadata } = result;
      const location = metadata.startLine ? `:${metadata.startLine}` : '';
      const exported = metadata.exported ? ' 📤' : '';
      lines.push(
        `- \`${metadata.name || 'unnamed'}\`${exported} ${formatSimilarity(similarity)} → ${metadata.file || 'unknown'}${location}`
      );
    }
    return lines.join('\n');
  }

  // FULL MODE: Detailed output with code snippets (respecting maxChars)
  for (const [file, fileResults] of byFile.entries()) {
    lines.push(`## ${file}`);
    lines.push('');

    for (const result of fileResults) {
      const { chunkId, similarity, metadata } = result;

      lines.push(`### \`${metadata.name || 'unnamed'}\` ${formatSimilarity(similarity)}`);
      lines.push('');
      lines.push(`**Chunk ID:** \`${chunkId}\``);

      if (metadata.type) {
        lines.push(`**Type:** ${metadata.type}`);
      }

      if (metadata.startLine && metadata.endLine) {
        lines.push(`**Location:** Lines ${metadata.startLine}-${metadata.endLine}`);
      }

      if (metadata.exported) {
        lines.push('**Exported:** Yes');
      }

      lines.push('');

      // Show context before (if available) - respect maxChars
      const contextBefore = result.metadata?.contextBefore;
      if (contextBefore && contextBefore.trim().length > 0) {
        lines.push('**Context (before):**');
        lines.push('```javascript');
        lines.push(contextBefore.trim().substring(0, maxChars));
        if (contextBefore.length > maxChars) {
          lines.push('...');
        }
        lines.push('```');
        lines.push('');
      }

      // Show code snippet - respect maxChars
      const snippet = result.metadata?.text || '';
      if (snippet) {
        lines.push('**Code:**');
        lines.push('```javascript');
        lines.push(snippet.substring(0, maxChars));
        if (snippet.length > maxChars) {
          lines.push('...');
        }
        lines.push('```');
        lines.push('');
      }

      // Show context after (if available) - respect maxChars
      const contextAfter = result.metadata?.contextAfter;
      if (contextAfter && contextAfter.trim().length > 0) {
        lines.push('**Context (after):**');
        lines.push('```javascript');
        lines.push(contextAfter.trim().substring(0, maxChars));
        if (contextAfter.length > maxChars) {
          lines.push('...');
        }
        lines.push('```');
        lines.push('');
      }

      // Additional metadata
      const extras = [];
      if (metadata.async) extras.push('async');
      if (metadata.generator) extras.push('generator');
      if (metadata.static) extras.push('static');
      if (metadata.className) extras.push(`class: ${metadata.className}`);

      if (extras.length > 0) {
        lines.push(`**Attributes:** ${extras.join(', ')}`);
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format similarity as badge
 */
function formatSimilarity(similarity) {
  // Validate input
  if (typeof similarity !== 'number' || isNaN(similarity)) {
    return '❓ N/A';
  }

  // Clamp to valid range [0, 1]
  const clamped = Math.max(0, Math.min(1, similarity));
  const percent = Math.round(clamped * 100);

  if (percent >= 80) {
    return `🟢 ${percent}%`;
  } else if (percent >= 60) {
    return `🟡 ${percent}%`;
  } else if (percent >= 40) {
    return `🟠 ${percent}%`;
  } else {
    return `🔴 ${percent}%`;
  }
}

/**
 * Format no results message
 */
function formatNoResults(query, threshold, filters) {
  const lines = [];

  lines.push('# No Results Found');
  lines.push('');
  lines.push('No code chunks matched your query with the current threshold.');
  lines.push('');
  lines.push(`**Query:** ${query}`);
  lines.push(`**Threshold:** ${threshold}`);
  lines.push('');

  if (filters && Object.keys(filters).length > 0) {
    lines.push('**Active filters:**');
    for (const [key, value] of Object.entries(filters)) {
      lines.push(`- ${key}: ${value}`);
    }
    lines.push('');
  }

  lines.push('**Suggestions:');
  lines.push('- Try a more general query');
  lines.push(`- Lower the threshold (current: ${threshold})`);
  lines.push('- Remove some filters');
  lines.push('- Try rephrasing your query');
  lines.push('- Use `search_architecture` for pattern-based search');

  return lines.join('\n');
}

export default { schema, handler };
