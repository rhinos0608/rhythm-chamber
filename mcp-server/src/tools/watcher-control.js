/**
 * Watcher Control Tool
 *
 * MCP tool for controlling the file watcher daemon.
 * Allows starting, stopping, restarting, and checking status.
 */

/**
 * Tool schema
 */
export const schema = {
  name: 'watcher_control',
  description: `Control the file watcher daemon for automatic reindexing.

Actions:
- start: Initialize and start the file watcher
- stop: Gracefully stop the watcher
- status: Return comprehensive watcher status
- restart: Stop and restart with optional new config`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'stop', 'status', 'restart'],
        description: 'Action to perform'
      },
      config: {
        type: 'object',
        description: 'Configuration options (for start/restart)',
        properties: {
          debounceDelay: {
            type: 'number',
            description: 'Milliseconds to wait after last change (default: 300)',
            minimum: 100,
            maximum: 5000
          },
          coalesceWindow: {
            type: 'number',
            description: 'Milliseconds window to batch changes (default: 1000)',
            minimum: 500,
            maximum: 10000
          },
          ignore: {
            type: 'array',
            description: 'Additional ignore patterns',
            items: {
              type: 'string'
            }
          }
        }
      }
    },
    required: ['action']
  }
};

/**
 * Tool handler
 */
export async function handler(args, projectRoot, semanticIndexer, mcpServer) {
  const { action, config = {} } = args;

  // Check if semantic search is enabled
  if (!semanticIndexer) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: Semantic search is not enabled. Cannot control file watcher.'
        }
      ],
      isError: true
    };
  }

  try {
    switch (action) {
      case 'start':
        return await handleStart(semanticIndexer, config);

      case 'stop':
        return await handleStop(semanticIndexer);

      case 'status':
        return await handleStatus(semanticIndexer);

      case 'restart':
        return await handleRestart(semanticIndexer, config);

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Error: Unknown action '${action}'. Valid actions: start, stop, status, restart`
            }
          ],
          isError: true
        };
    }
  } catch (error) {
    console.error('[Watcher Control] Error:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Handle start action
 */
async function handleStart(indexer, config) {
  if (indexer.watcher && indexer.watcher.isRunning()) {
    return {
      content: [
        {
          type: 'text',
          text: 'File watcher is already running. Use "status" action to check current state or "restart" to apply new configuration.'
        }
      ]
    };
  }

  await indexer.startWatcher(config);

  return {
    content: [
      {
        type: 'text',
        text: formatStatus(indexer.watcher.getStatus(), 'File watcher started successfully')
      }
    ]
  };
}

/**
 * Handle stop action
 */
async function handleStop(indexer) {
  if (!indexer.watcher || !indexer.watcher.isRunning()) {
    return {
      content: [
        {
          type: 'text',
          text: 'File watcher is not running.'
        }
      ]
    };
  }

  await indexer.stopWatcher();

  return {
    content: [
      {
        type: 'text',
        text: 'File watcher stopped successfully.\n\n' +
              'Note: The watcher has processed all pending changes before stopping.'
      }
    ]
  };
}

/**
 * Handle status action
 */
async function handleStatus(indexer) {
  if (!indexer.watcher) {
    return {
      content: [
        {
          type: 'text',
          text: 'File watcher is not initialized.\n\n' +
                'To start the watcher, use the watcher_control tool with action="start".'
        }
      ]
    };
  }

  const status = indexer.watcher.getStatus();

  return {
    content: [
      {
        type: 'text',
        text: formatStatus(status, 'File Watcher Status')
      }
    ]
  };
}

/**
 * Handle restart action
 */
async function handleRestart(indexer, config) {
  const wasRunning = indexer.watcher && indexer.watcher.isRunning();

  if (wasRunning) {
    await indexer.stopWatcher();
  }

  await indexer.startWatcher(config);

  // CRITICAL: Verify watcher initialized successfully
  if (!indexer.watcher) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: Failed to initialize file watcher'
        }
      ],
      isError: true
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: formatStatus(indexer.watcher.getStatus(), wasRunning ? 'File watcher restarted' : 'File watcher started')
      }
    ]
  };
}

/**
 * Format status for display
 */
function formatStatus(status, title) {
  const lines = [
    `# ${title}`,
    ''
  ];

  // Running state
  lines.push('## State');
  lines.push(`- **Running**: ${status.running ? 'Yes' : 'No'}`);
  lines.push(`- **Paused**: ${status.paused ? 'Yes' : 'No'}`);

  if (status.running) {
    const uptime = Math.floor(status.uptime / 1000);
    const uptimeStr = uptime > 60
      ? `${Math.floor(uptime / 60)}m ${uptime % 60}s`
      : `${uptime}s`;
    lines.push(`- **Uptime**: ${uptimeStr}`);
  }

  lines.push('');

  // Configuration
  lines.push('## Configuration');
  lines.push(`- **Debounce Delay**: ${status.config.debounceDelay}ms`);
  lines.push(`- **Coalesce Window**: ${status.config.coalesceWindow}ms`);
  lines.push(`- **Max Queue Size**: ${status.config.maxQueueSize}`);
  lines.push(`- **Patterns**:`);
  for (const pattern of status.config.patterns) {
    lines.push(`  - ${pattern}`);
  }
  lines.push(`- **Ignore Patterns**:`);
  for (const pattern of status.config.ignore) {
    lines.push(`  - ${pattern}`);
  }

  lines.push('');

  // Statistics
  lines.push('## Statistics');
  lines.push(`- **Files Changed**: ${status.stats.filesChanged}`);
  lines.push(`- **Batches Processed**: ${status.stats.batchesProcessed}`);
  lines.push(`- **Total Files Reindexed**: ${status.stats.totalFilesReindexed}`);
  lines.push(`- **Errors**: ${status.stats.errors}`);

  if (status.stats.lastError) {
    lines.push(`- **Last Error**:`);
    lines.push(`  - Code: ${status.stats.lastError.code}`);
    lines.push(`  - Message: ${status.stats.lastError.message}`);
    lines.push(`  - Context: ${status.stats.lastError.context}`);
    lines.push(`  - Time: ${status.stats.lastError.timestamp}`);
  }

  lines.push('');

  // Queue
  lines.push('## Queue');
  lines.push(`- **Current Size**: ${status.queue.size}`);
  if (status.queue.nextProcessTime) {
    const timeUntil = Math.max(0, status.queue.nextProcessTime - Date.now());
    lines.push(`- **Next Process**: In ${timeUntil}ms`);
  }

  lines.push('');

  // Recent Activity
  if (status.recentActivity.length > 0) {
    lines.push('## Recent Activity (Last 10)');
    for (const activity of status.recentActivity) {
      const time = new Date(activity.timestamp).toLocaleTimeString();
      lines.push(`- [${time}] ${activity.event}: ${activity.file}`);
    }
  } else {
    lines.push('## Recent Activity');
    lines.push('No activity yet.');
  }

  return lines.join('\n');
}

export default { schema, handler };
