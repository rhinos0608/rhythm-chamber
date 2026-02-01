/**
 * Indexing Control Tool
 *
 * MCP tool for controlling the code indexing process.
 * Allows triggering full/partial indexing, stopping in-progress indexing,
 * checking status, and clearing cache.
 */

/**
 * Tool schema
 */
export const schema = {
  name: 'indexing_control',
  description: `Control the code indexing process.

Actions:
- start: Trigger a full index of all files (respects existing cache by default)
- force_start: Force a complete reindex, bypassing all cache
- stop: Stop any in-progress indexing operation
- status: Get current indexing status and statistics
- clear_cache: Clear the index cache (requires reindexing to restore)`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'force_start', 'stop', 'status', 'clear_cache'],
        description: 'Action to perform',
      },
      patterns: {
        type: 'array',
        description: 'Glob patterns for files to index (for start/force_start)',
        items: {
          type: 'string',
        },
      },
      ignore: {
        type: 'array',
        description: 'Additional ignore patterns (for start/force_start)',
        items: {
          type: 'string',
        },
      },
    },
    required: ['action'],
  },
};

/**
 * Tool handler
 */
export async function handler(args, projectRoot, semanticIndexer, mcpServer) {
  const { action, patterns, ignore } = args;

  // Check if semantic search is enabled
  if (!semanticIndexer) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: Semantic search is not enabled. Cannot control indexing.',
        },
      ],
      isError: true,
    };
  }

  try {
    switch (action) {
      case 'start':
        return await handleStart(semanticIndexer, mcpServer, patterns, ignore, false);

      case 'force_start':
        return await handleStart(semanticIndexer, mcpServer, patterns, ignore, true);

      case 'stop':
        return await handleStop(semanticIndexer, mcpServer);

      case 'status':
        return await handleStatus(semanticIndexer, mcpServer);

      case 'clear_cache':
        return await handleClearCache(semanticIndexer, mcpServer);

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Error: Unknown action '${action}'. Valid actions: start, force_start, stop, status, clear_cache`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    console.error('[Indexing Control] Error:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Handle start action
 */
async function handleStart(indexer, mcpServer, patterns, ignore, force) {
  // Check if indexing is already in progress (only check indexer flag now)
  const isIndexing = indexer._indexingInProgress || false;
  if (isIndexing) {
    return {
      content: [
        {
          type: 'text',
          text:
            'Indexing is already in progress.\n\n' +
            'Use the "status" action to check progress or "stop" to cancel the current operation.',
        },
      ],
      isError: true,
    };
  }

  // Update patterns if provided
  if (patterns) {
    indexer.patterns = patterns;
  }
  if (ignore) {
    indexer.ignore = [...indexer.ignore, ...ignore];
  }

  console.error(`[Indexing Control] Starting ${force ? 'force ' : ''}indexing...`);

  // CRITICAL FIX: Don't set _indexingInProgress before calling indexAll()
  // indexAll() has its own concurrency control and sets this flag internally.
  // Setting it here causes a race condition where indexAll() throws
  // "Indexing already in progress" immediately.

  // Start indexing in background
  const indexPromise = indexer.indexAll({ force });
  indexer._indexingPromise = indexPromise;
  if (mcpServer) {
    mcpServer._indexingPromise = indexPromise;
  }

  // Don't await - let it run in background
  indexPromise
    .then(stats => {
      console.error('[Indexing Control] Indexing completed:', stats);
      // indexAll() already manages its own state, no need to modify flags here
    })
    .catch(error => {
      console.error('[Indexing Control] Indexing failed:', error);
      // indexAll() already manages its own state and error tracking
    });

  return {
    content: [
      {
        type: 'text',
        text:
          '# Indexing Started\n\n' +
          `${force ? '**Force mode enabled** - bypassing all cache\n\n' : ''}` +
          'Indexing is running in the background.\n\n' +
          '**Patterns:**\n' +
          (indexer.patterns || []).map(p => `- ${p}`).join('\n') +
          '\n\n**Ignore Patterns:**\n' +
          (indexer.ignore || []).map(p => `- ${p}`).join('\n') +
          '\n\nUse the "status" action to check progress.',
      },
    ],
  };
}

/**
 * Handle stop action
 */
async function handleStop(indexer, mcpServer) {
  const isIndexing = indexer._indexingInProgress || false;

  if (!isIndexing) {
    return {
      content: [
        {
          type: 'text',
          text: 'No indexing operation is currently in progress.',
        },
      ],
    };
  }

  // Set flag to stop indexing (indexer only - server flags removed)
  indexer._indexingInProgress = false;

  // Note: We can't actually cancel the promise, but the indexer can check the flag
  // and stop processing new files. For a complete stop, we'd need to add abort
  // controller support to the indexer.

  return {
    content: [
      {
        type: 'text',
        text:
          'Stop signal sent.\n\n' +
          'The current indexing operation will complete processing of the current file ' +
          'and then stop. Use "status" to check the final state.',
      },
    ],
  };
}

/**
 * Handle status action
 */
async function handleStatus(indexer, mcpServer) {
  const isIndexing = indexer._indexingInProgress || false;
  const stats = indexer.stats || {};
  const hasError = indexer._indexingError;

  const lines = ['# Indexing Status', ''];

  // State
  lines.push('## State');
  lines.push(`- **Indexing**: ${isIndexing ? 'In Progress' : 'Idle'}`);
  lines.push(`- **Indexed**: ${indexer.indexed ? 'Yes' : 'No'}`);

  if (hasError) {
    lines.push(`- **Last Error**: ${hasError.message || hasError}`);
  }

  lines.push('');

  // Statistics
  lines.push('## Statistics');
  lines.push(`- **Files Discovered**: ${stats.filesDiscovered || 0}`);
  lines.push(`- **Files Indexed**: ${stats.filesIndexed || 0}`);
  lines.push(`- **Files from Cache**: ${stats.filesFromCache || 0}`);
  lines.push(`- **Files Skipped**: ${stats.filesSkipped || 0}`);
  lines.push(`- **Chunks Indexed**: ${stats.chunksIndexed || 0}`);
  lines.push(`- **Embedding Source**: ${stats.embeddingSource || 'unknown'}`);

  if (stats.lastIndexed) {
    const lastIndexed = new Date(stats.lastIndexed).toLocaleString();
    lines.push(`- **Last Indexed**: ${lastIndexed}`);
  }

  if (stats.indexTime) {
    const timeSeconds = (stats.indexTime / 1000).toFixed(2);
    lines.push(`- **Index Time**: ${timeSeconds}s`);
  }

  lines.push('');

  // Cache status
  const cacheStats = indexer.cache ? indexer.cache.getStats() : {};
  if (cacheStats.fileCount !== undefined || stats.cacheFailures > 0) {
    lines.push('## Cache');
    if (cacheStats.fileCount !== undefined) {
      lines.push(`- **Cached Files**: ${cacheStats.fileCount}`);
      if (cacheStats.chunkCount !== undefined) {
        lines.push(`- **Cached Chunks**: ${cacheStats.chunkCount}`);
      }
      if (cacheStats.approximateSize !== undefined) {
        const sizeMB = (cacheStats.approximateSize / 1024 / 1024).toFixed(2);
        lines.push(`- **Cache Size**: ${sizeMB} MB`);
      }
      if (cacheStats.dirty !== undefined) {
        lines.push(`- **Dirty**: ${cacheStats.dirty ? 'Yes (needs save)' : 'No'}`);
      }
    }
    if (stats.cacheFailures > 0) {
      const failureRate =
        stats.filesIndexed > 0
          ? ((stats.cacheFailures / stats.filesIndexed) * 100).toFixed(1)
          : '0.0';

      // Only show warning if failures are recent (< 1 hour ago)
      const lastFailureTime = stats.lastCacheFailureTime || 0;
      const failureAge = Date.now() - lastFailureTime;
      const isRecent = failureAge < 3600000; // 1 hour in milliseconds

      lines.push(
        `- **Cache Failures**: ${stats.cacheFailures}/${stats.filesIndexed} (${failureRate}%)${isRecent ? ' ⚠️' : ''}`
      );

      if (isRecent) {
        lines.push('- **Status**: Cache degradation detected - re-embedding required on restart');
      } else {
        const minutesAgo = Math.floor(failureAge / 60000);
        lines.push(`- **Last Failure**: ${minutesAgo} minutes ago (resolved)`);
      }
    }
    lines.push('');
  }

  // Current configuration
  if (indexer.patterns) {
    lines.push('## Configuration');
    lines.push('**Patterns:**');
    for (const pattern of indexer.patterns) {
      lines.push(`- ${pattern}`);
    }
    lines.push('**Ignore Patterns:**');
    for (const pattern of indexer.ignore || []) {
      lines.push(`- ${pattern}`);
    }
    lines.push('');
  }

  // Vector store status
  if (indexer.vectorStore) {
    const vectorCount = indexer.vectorStore.chunkCount || 0;
    const expectedCount = stats.chunksIndexed || 0;
    const mismatch = vectorCount !== expectedCount;

    lines.push('## Vector Store');
    lines.push(
      `- **Vectors**: ${vectorCount}${expectedCount > 0 ? ` (expected: ${expectedCount})` : ''}${mismatch ? ' ⚠️' : ''}`
    );
    if (mismatch && expectedCount > 0) {
      lines.push(
        `- **Status**: MISMATCH - ${expectedCount - vectorCount > 0 ? 'Some embeddings not stored' : 'More vectors than chunks indexed'}`
      );
    }
    lines.push('');
  }

  // Dependency graph status
  if (indexer.dependencyGraph) {
    // Count symbols from all relevant maps
    const definitionCount = indexer.dependencyGraph.definitions?.size || 0;
    const usageCount = indexer.dependencyGraph.usages?.size || 0;
    const exportCount = indexer.dependencyGraph.exports?.size || 0;
    const importCount = indexer.dependencyGraph.imports?.size || 0;
    const symbolCount = definitionCount + usageCount + exportCount + importCount;

    lines.push('## Dependency Graph');
    lines.push(
      `- **Symbols**: ${symbolCount} (definitions: ${definitionCount}, usages: ${usageCount}, exports: ${exportCount}, imports: ${importCount})`
    );
    lines.push('');
  }

  return {
    content: [
      {
        type: 'text',
        text: lines.join('\n'),
      },
    ],
  };
}

/**
 * Handle clear_cache action
 */
async function handleClearCache(indexer, mcpServer) {
  const isIndexing = indexer._indexingInProgress || false;

  if (isIndexing) {
    return {
      content: [
        {
          type: 'text',
          text:
            'Cannot clear cache while indexing is in progress.\n\n' +
            'Use "stop" first to stop the current indexing operation.',
        },
      ],
      isError: true,
    };
  }

  // Clear the cache (in-memory)
  indexer.cache.clear();

  // FIX: Also delete the cache file from disk to truly clear it
  try {
    await indexer.cache.delete();
  } catch (deleteError) {
    console.error('[Indexing Control] Warning: Failed to delete cache file:', deleteError.message);
    // Continue - the in-memory cache is still cleared
  }

  // FIX: Clean up any stale .tmp files
  const { unlink } = await import('fs/promises');
  const { join } = await import('path');
  const tmpFile = indexer.cache.cacheFile + '.tmp';
  try {
    await unlink(tmpFile);
    console.error('[Indexing Control] Cleaned up stale tmp file');
  } catch {
    // File doesn't exist, that's fine
  }

  // Reset index state
  indexer.indexed = false;
  indexer.stats = {
    filesDiscovered: 0,
    filesIndexed: 0,
    filesSkipped: 0,
    filesFromCache: 0,
    chunksIndexed: 0,
    embeddingSource: 'unknown',
    indexTime: 0,
    lastIndexed: null,
  };

  // Clear vector store and dependency graph
  if (indexer.vectorStore) {
    indexer.vectorStore.clear();
  }
  if (indexer.dependencyGraph) {
    indexer.dependencyGraph.clear();
  }

  console.error('[Indexing Control] Cache cleared');

  return {
    content: [
      {
        type: 'text',
        text:
          '# Cache Cleared\n\n' +
          'The index cache has been completely cleared.\n\n' +
          '**Next Steps:**\n' +
          '- Use "start" to reindex with cache (will rebuild from scratch)\n' +
          '- Use "force_start" to force a complete fresh index\n\n' +
          '**Note:** All semantic search features will be unavailable until you reindex.',
      },
    ],
  };
}

export default { schema, handler };
