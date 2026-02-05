/**
 * MCP Tool: list_indexed_files
 *
 * List all files that have been indexed for semantic search,
 * including chunk counts and last modified timestamps.
 */

/**
 * Tool schema definition
 */
export const schema = {
  name: 'list_indexed_files',
  description:
    'List all files that have been indexed for semantic search, including chunk counts, types of chunks, and last modified timestamps.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        enum: ['all', 'controllers', 'services', 'utils', 'storage', 'providers'],
        description: 'Filter by HNW architecture layer',
        default: 'all',
      },
      contentType: {
        type: 'string',
        enum: ['all', 'code', 'documentation', 'tests'],
        description: 'Filter by content type. "code" for js/, mcp-server/src/, "documentation" for docs/, *.md, "tests" for tests/',
        default: 'all',
      },
      includeChunks: {
        type: 'boolean',
        description: 'Include individual chunk details for each file',
        default: false,
      },
      format: {
        type: 'string',
        enum: ['summary', 'detailed', 'json'],
        description: 'Output format',
        default: 'summary',
      },
    },
  },
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot, indexer, server) => {
  const { filter = 'all', contentType = 'all', includeChunks = false, format = 'summary' } = args;

  // Check if indexer is available
  if (!indexer) {
    return {
      content: [
        {
          type: 'text',
          text: `# Indexed Files Not Available

The semantic search indexer has not been initialized.

**To fix:**
1. Ensure the MCP server was started with semantic search enabled
2. Check that indexing completed successfully
`,
        },
      ],
      isError: true,
    };
  }

  try {
    // Get indexed files
    const files = indexer.listIndexedFiles({ includeChunks });

    if (files.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `# No Indexed Files

No files are currently indexed. This could mean:
1. Indexing has not been performed yet
2. All files were filtered out by ignore patterns
3. The project contains no supported JavaScript files

**Current stats:**
${formatStats(indexer.getStats())}
`,
          },
        ],
      };
    }

    // Apply HNW layer filter
    let filteredFiles = files;
    if (filter !== 'all') {
      filteredFiles = files.filter(f => f.file.includes(`/${filter}/`));
    }

    // Apply content type filter
    if (contentType !== 'all') {
      filteredFiles = filteredFiles.filter(f => {
        const file = f.file;
        switch (contentType) {
          case 'documentation':
            // Documentation: docs/ directory and root markdown files
            return file.startsWith('docs/') || /^[^/]+\.md$/.test(file);
          case 'code':
            // Code: js/, mcp-server/src/, workers/, scripts/ - exclude tests
            return (
              /^(js\/|mcp-server\/src\/|workers\/|scripts\/)/.test(file) &&
              !file.includes('.test.') &&
              !file.includes('.spec.')
            );
          case 'tests':
            // Tests: tests/ directory and .test.js/.spec.js files
            return file.startsWith('tests/') || /\.(test|spec)\./.test(file);
          default:
            return true;
        }
      });
    }

    // Format output
    if (format === 'json') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(filteredFiles, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: formatFileList(filteredFiles, filter, includeChunks, indexer),
        },
      ],
    };
  } catch (error) {
    console.error('[list_indexed_files] Error:', error);

    return {
      content: [
        {
          type: 'text',
          text: `# Error Listing Indexed Files

**Error:** ${error.message}

**Suggestion:** Check that the indexer is properly initialized and indexing has completed.
`,
        },
      ],
      isError: true,
    };
  }
};

/**
 * Format file list
 */
function formatFileList(files, filter, includeChunks, indexer) {
  const lines = [];

  // Get overall stats
  const stats = indexer.getStats();

  lines.push('# Indexed Files');
  lines.push('');
  lines.push(`**Filter:** ${filter === 'all' ? 'All layers' : filter}`);
  lines.push(`**Files:** ${files.length}`);
  lines.push(`**Total Chunks:** ${files.reduce((sum, f) => sum + f.chunkCount, 0)}`);
  lines.push('');

  // Format stats
  lines.push(formatStats(stats));
  lines.push('');

  // Group by layer
  const byLayer = groupByLayer(files);

  for (const [layer, layerFiles] of Object.entries(byLayer)) {
    lines.push(`## ${layer}`);
    lines.push('');
    lines.push('| File | Chunks | Types | Last Modified |');
    lines.push('|------|--------|-------|---------------|');

    for (const file of layerFiles) {
      const types = getChunkTypes(file);
      const modified = file.lastModified
        ? new Date(file.lastModified).toLocaleDateString()
        : 'Unknown';

      lines.push(`| ${file.file} | ${file.chunkCount} | ${types} | ${modified} |`);

      // Include chunk details if requested
      if (includeChunks && file.chunks && file.chunks.length > 0) {
        for (const chunk of file.chunks) {
          lines.push(`| &nbsp; ↳ \`${chunk.id}\` | | ${chunk.type} | |`);
        }
      }
    }

    lines.push('');
  }

  // Chunk type distribution
  lines.push('## Chunk Type Distribution');
  lines.push('');

  const typeCounts = getTypeDistribution(files);
  const total = Object.values(typeCounts).reduce((a, b) => a + b, 0);

  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const percent = ((count / total) * 100).toFixed(1);
    lines.push(`- **${type}**: ${count} (${percent}%)`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('**Index Information:');
  lines.push(`- Version: ${stats.vectorStore?.version || 1}`);
  lines.push(`- Embedding Source: ${stats.embeddingSource || 'unknown'}`);
  lines.push(
    `- Last Indexed: ${stats.lastIndexed ? new Date(stats.lastIndexed).toLocaleString() : 'Never'}`
  );

  return lines.join('\n');
}

/**
 * Format stats
 */
function formatStats(stats) {
  const lines = [];

  lines.push('**Index Statistics:**');
  lines.push(`- Total Files: ${stats.filesIndexed || 0}`);
  lines.push(`- Total Chunks: ${stats.chunksIndexed || 0}`);
  lines.push(`- Dependencies Graph: ${stats.dependencyGraph?.symbols || 0} symbols`);
  lines.push(`- Vector Store: ${stats.vectorStore?.chunkCount || 0} vectors`);
  lines.push(`- Cache Hit Rate: ${((stats.embeddings?.hitRate || 0) * 100).toFixed(1)}%`);

  return lines.join('\n');
}

/**
 * Group files by HNW layer
 */
function groupByLayer(files) {
  const grouped = {
    'Controllers (js/controllers/)': [],
    'Services (js/services/)': [],
    'Providers (js/providers/)': [],
    'Utils (js/utils/)': [],
    'Storage (js/storage/)': [],
    'Tests (tests/)': [],
    Other: [],
  };

  for (const file of files) {
    const path = file.file;

    if (path.includes('/controllers/')) {
      grouped['Controllers (js/controllers/)'].push(file);
    } else if (path.includes('/services/')) {
      grouped['Services (js/services/)'].push(file);
    } else if (path.includes('/providers/')) {
      grouped['Providers (js/providers/)'].push(file);
    } else if (path.includes('/utils/')) {
      grouped['Utils (js/utils/)'].push(file);
    } else if (path.includes('/storage/')) {
      grouped['Storage (js/storage/)'].push(file);
    } else if (path.includes('tests/') || path.includes('.test.') || path.includes('.spec.')) {
      grouped['Tests (tests/)'].push(file);
    } else {
      grouped['Other'].push(file);
    }
  }

  // Remove empty groups
  for (const [key, value] of Object.entries(grouped)) {
    if (value.length === 0) {
      delete grouped[key];
    }
  }

  return grouped;
}

/**
 * Get chunk types for a file
 */
function getChunkTypes(file) {
  if (!file.chunks || file.chunks.length === 0) {
    return 'N/A';
  }

  const types = new Set(file.chunks.map(c => c.type));
  return Array.from(types).join(', ');
}

/**
 * Get chunk type distribution
 */
function getTypeDistribution(files) {
  const counts = {};

  for (const file of files) {
    if (!file.chunks) continue;

    for (const chunk of file.chunks) {
      counts[chunk.type] = (counts[chunk.type] || 0) + 1;
    }
  }

  return counts;
}

export default { schema, handler };
