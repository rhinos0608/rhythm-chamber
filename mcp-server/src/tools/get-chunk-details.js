/**
 * MCP Tool: get_chunk_details
 *
 * Get detailed information about a specific code chunk including:
 * - Full source code
 * - Complete metadata
 * - Related chunks (callers, callees)
 * - Symbol relationships
 */

/**
 * Tool schema definition
 */
export const schema = {
  name: 'get_chunk_details',
  description: 'Get detailed information about a specific code chunk including full source code, metadata, and related chunks (callers/callees).',
  inputSchema: {
    type: 'object',
    properties: {
      chunkId: {
        type: 'string',
        description: 'Unique chunk identifier (e.g., js_chat_session-manager_L123)'
      },
      includeRelated: {
        type: 'boolean',
        description: 'Include related chunks (callers/callees)',
        default: true
      },
      includeSource: {
        type: 'boolean',
        description: 'Include full source code',
        default: true
      }
    },
    required: ['chunkId']
  }
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot, indexer, server) => {
  const { chunkId, includeRelated = true, includeSource = true } = args;

  // Check if indexer is available
  if (!indexer) {
    return {
      content: [{
        type: 'text',
        text: `# Chunk Details Not Available

The semantic search indexer has not been initialized. Cannot retrieve chunk details.

**Chunk ID:** ${chunkId}

**To fix:**
1. Ensure the MCP server was started with semantic search enabled
2. Check that indexing completed successfully
`
      }],
      isError: true
    };
  }

  try {
    // Get chunk details from indexer
    const details = indexer.getChunkDetails(chunkId);

    if (!details) {
      return {
        content: [{
          type: 'text',
          text: formatNotFound(chunkId)
        }]
      };
    }

    const { chunkId: id, metadata, related } = details;

    return {
      content: [{
        type: 'text',
        text: formatChunkDetails(id, metadata, related, includeSource, includeRelated, indexer)
      }]
    };

  } catch (error) {
    console.error('[get_chunk_details] Error:', error);

    return {
      content: [{
        type: 'text',
        text: `# Error Retrieving Chunk Details

**Chunk ID:** ${chunkId}

**Error:** ${error.message}

**Suggestion:** Verify the chunk ID is correct and that indexing completed successfully.
`
      }],
      isError: true
    };
  }
};

/**
 * Format chunk details
 */
function formatChunkDetails(chunkId, metadata, related, includeSource, includeRelated, indexer) {
  const lines = [];

  lines.push(`# Chunk Details: ${metadata.name || chunkId}`);
  lines.push('');

  // Basic info
  lines.push(`## Basic Information`);
  lines.push('');
  lines.push(`| Property | Value |`);
  lines.push(`|----------|-------|`);
  lines.push(`| **Chunk ID** | \`${chunkId}\` |`);
  lines.push(`| **Name** | ${metadata.name || 'N/A'} |`);
  lines.push(`| **Type** | ${metadata.type || 'unknown'} |`);
  lines.push(`| **File** | \`${metadata.file || 'unknown'}\` |`);

  if (metadata.startLine && metadata.endLine) {
    lines.push(`| **Lines** | ${metadata.startLine}-${metadata.endLine} |`);
  }

  if (metadata.exported !== undefined) {
    lines.push(`| **Exported** | ${metadata.exported ? 'Yes ✓' : 'No'} |`);
  }

  lines.push('');

  // Type-specific metadata
  if (metadata.type === 'function' || metadata.type === 'method') {
    lines.push(`## Function Details`);
    lines.push('');

    if (metadata.async) lines.push(`- **Async**: Yes`);
    if (metadata.generator) lines.push(`- **Generator**: Yes`);
    if (metadata.static) lines.push(`- **Static**: Yes`);
    if (metadata.className) lines.push(`- **Class**: ${metadata.className}`);
    if (metadata.kind) lines.push(`- **Kind**: ${metadata.kind}`);

    if (metadata.params && metadata.params.length > 0) {
      lines.push(`- **Parameters**: ${metadata.params.join(', ')}`);
    }

    lines.push('');
  }

  if (metadata.type === 'class') {
    lines.push(`## Class Details`);
    lines.push('');

    if (metadata.superClass) lines.push(`- **Extends**: ${metadata.superClass}`);
    if (metadata.isLargeClass) lines.push(`- **Large Class**: Yes (split into method chunks)`);

    if (metadata.methods && metadata.methods.length > 0) {
      lines.push(`- **Methods**: ${metadata.methods.map(m => m.name).join(', ')}`);
    }

    lines.push('');
  }

  // Symbol relationships
  if (includeRelated && related) {
    lines.push(`## Symbol Relationships`);
    lines.push('');

    // Callers (chunks that use symbols defined here)
    if (related.callers && related.callers.length > 0) {
      lines.push(`### Callers`);
      lines.push('');
      lines.push(`Chunks that use symbols defined in this chunk:`);
      lines.push('');

      for (const caller of related.callers.slice(0, 10)) {
        const callerMeta = getChunkMetadata(caller.chunkId, indexer);
        lines.push(`- \`${caller.chunkId}\``);
        lines.push(`  - Uses: **${caller.symbol}** (${caller.usageType})`);
        if (callerMeta) {
          lines.push(`  - Location: ${callerMeta.file || 'unknown'} (L${callerMeta.startLine || '?'})`);
        }
      }

      if (related.callers.length > 10) {
        lines.push(`- ... and ${related.callers.length - 10} more callers`);
      }

      lines.push('');
    } else {
      lines.push(`### Callers`);
      lines.push('');
      lines.push(`No known callers for this chunk.`);
      lines.push('');
    }

    // Callees (symbols used by this chunk)
    if (related.callees && related.callees.length > 0) {
      lines.push(`### Callees`);
      lines.push('');
      lines.push(`Symbols used by this chunk (defined elsewhere):`);
      lines.push('');

      for (const callee of related.callees.slice(0, 10)) {
        const calleeMeta = getChunkMetadata(callee.chunkId, indexer);
        lines.push(`- **${callee.symbol}** (${callee.type})`);
        lines.push(`  - Defined in: \`${callee.chunkId}\``);
        if (calleeMeta) {
          lines.push(`  - Location: ${calleeMeta.file || 'unknown'} (L${calleeMeta.startLine || '?'})`);
        }
      }

      if (related.callees.length > 10) {
        lines.push(`- ... and ${related.callees.length - 10} more`);
      }

      lines.push('');
    } else {
      lines.push(`### Callees`);
      lines.push('');
      lines.push(`No external symbol calls detected.`);
      lines.push('');
    }
  }

  // Source code
  if (includeSource) {
    lines.push(`## Source Code`);
    lines.push('');
    lines.push('```javascript');

    const source = metadata.text || '';
    lines.push(source);

    lines.push('```');
    lines.push('');
  }

  // Navigation hint
  lines.push(`---`);
  lines.push('');
  lines.push(`**Related Tools:`);
  lines.push(`- \`semantic_search\` - Find similar code`);
  lines.push(`- \`find_dependencies\` - Trace dependencies`);
  lines.push(`- \`get_module_info\` - Full file information`);

  return lines.join('\n');
}

/**
 * Format not found message
 */
function formatNotFound(chunkId) {
  return `# Chunk Not Found

**Chunk ID:** ${chunkId}

No chunk with this ID was found in the index.

**Possible reasons:**
1. The chunk ID is incorrect or mistyped
2. The chunk was from a file that has been modified
3. The index has not been updated after recent changes
4. The file was excluded by ignore patterns

**Suggestions:**
- Use \`list_indexed_files\` to see all indexed chunks
- Check the chunk ID spelling
- Re-index if files have changed recently
`;
}

/**
 * Get metadata for a chunk ID
 */
function getChunkMetadata(chunkId, indexer) {
  if (!indexer) return null;

  try {
    const result = indexer.vectorStore.get(chunkId);
    return result?.metadata || null;
  } catch {
    return null;
  }
}

export default { schema, handler };
