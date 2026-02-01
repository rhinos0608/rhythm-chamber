#!/usr/bin/env node

/**
 * File Watcher Control CLI
 *
 * Standalone CLI for controlling the Rhythm Chamber MCP file watcher.
 * This script can be run directly from the command line without needing MCP.
 *
 * Usage:
 *   node watcher-control.js [action] [options]
 *
 * Actions:
 *   start   - Start the file watcher
 *   stop    - Stop the file watcher
 *   status  - Show watcher status
 *   restart - Restart the file watcher
 *
 * Options:
 *   --debounce <ms>      Debounce delay in milliseconds (default: 300)
 *   --coalesce <ms>      Coalesce window in milliseconds (default: 1000)
 *   --max-queue <size>   Maximum queue size (default: 1000)
 *
 * Examples:
 *   node watcher-control.js start
 *   node watcher-control.js status
 *   node watcher-control.js restart --debounce 500
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mcpServerDir = dirname(__dirname);

// Parse command line arguments
function parseArgs(args) {
  const action = args[0] || 'status';
  const config = {};
  const options = {
    debounce: 300,
    coalesce: 1000,
    maxQueue: 1000,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--debounce':
        options.debounce = parseInt(args[++i], 10);
        break;
      case '--coalesce':
        options.coalesce = parseInt(args[++i], 10);
        break;
      case '--max-queue':
        options.maxQueue = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        console.error('Use --help for usage information');
        process.exit(1);
    }
  }

  // Build config object
  config.debounceDelay = options.debounce;
  config.coalesceWindow = options.coalesce;
  config.maxQueueSize = options.maxQueue;

  return { action, config };
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
File Watcher Control CLI

Usage:
  node watcher-control.js [action] [options]

Actions:
  start   - Start the file watcher
  stop    - Stop the file watcher
  status  - Show watcher status
  restart - Restart the file watcher

Options:
  --debounce <ms>      Debounce delay in milliseconds (default: 300)
  --coalesce <ms>      Coalesce window in milliseconds (default: 1000)
  --max-queue <size>   Maximum queue size (default: 1000)
  --help, -h           Show this help message

Examples:
  node watcher-control.js start
  node watcher-control.js status
  node watcher-control.js restart --debounce 500
  node watcher-control.js start --coalesce 2000 --max-queue 500

Environment Variables:
  RC_PROJECT_ROOT     Project root directory (default: parent of mcp-server)
  RC_MCP_CACHE_DIR    Cache directory (default: <project_root>/.mcp-cache)
`);
}

/**
 * Load watcher state from cache
 */
function loadWatcherState(cacheDir) {
  const stateFile = join(cacheDir, 'semantic', 'watcher-state.json');

  try {
    const data = readFileSync(stateFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Format status for display
 */
function formatStatus(state, title) {
  if (!state) {
    return `# ${title}\n\nFile watcher is not initialized.\n\nTo start the watcher, run:\n  node watcher-control.js start`;
  }

  const lines = [`# ${title}`, ''];

  // Running state
  lines.push('## State');
  lines.push(`- **Running**: ${state.running ? 'Yes' : 'No'}`);
  lines.push(`- **Paused**: ${state.paused ? 'Yes' : 'No'}`);

  if (state.uptime) {
    const uptime = Math.floor(state.uptime / 1000);
    const uptimeStr = uptime > 60 ? `${Math.floor(uptime / 60)}m ${uptime % 60}s` : `${uptime}s`;
    lines.push(`- **Uptime**: ${uptimeStr}`);
  }

  lines.push('');

  // Configuration
  if (state.config) {
    lines.push('## Configuration');
    lines.push(`- **Debounce Delay**: ${state.config.debounceDelay}ms`);
    lines.push(`- **Coalesce Window**: ${state.config.coalesceWindow}ms`);
    lines.push(`- **Max Queue Size**: ${state.config.maxQueueSize}`);

    if (state.config.patterns) {
      lines.push('- **Patterns**:');
      for (const pattern of state.config.patterns) {
        lines.push(`  - ${pattern}`);
      }
    }

    if (state.config.ignore) {
      lines.push('- **Ignore Patterns**:');
      for (const pattern of state.config.ignore) {
        lines.push(`  - ${pattern}`);
      }
    }

    lines.push('');
  }

  // Statistics
  if (state.stats) {
    lines.push('## Statistics');
    lines.push(`- **Files Changed**: ${state.stats.filesChanged || 0}`);
    lines.push(`- **Batches Processed**: ${state.stats.batchesProcessed || 0}`);
    lines.push(`- **Total Files Reindexed**: ${state.stats.totalFilesReindexed || 0}`);
    lines.push(`- **Errors**: ${state.stats.errors || 0}`);

    if (state.stats.lastError) {
      lines.push('- **Last Error**:');
      lines.push(`  - Code: ${state.stats.lastError.code}`);
      lines.push(`  - Message: ${state.stats.lastError.message}`);
      if (state.stats.lastError.context) {
        lines.push(`  - Context: ${state.stats.lastError.context}`);
      }
      lines.push(`  - Time: ${state.stats.lastError.timestamp}`);
    }

    lines.push('');
  }

  // Queue
  if (state.queue) {
    lines.push('## Queue');
    lines.push(`- **Current Size**: ${state.queue.size || 0}`);
    if (state.queue.nextProcessTime) {
      const timeUntil = Math.max(0, state.queue.nextProcessTime - Date.now());
      lines.push(`- **Next Process**: In ${timeUntil}ms`);
    }

    lines.push('');
  }

  // Recent Activity
  if (state.recentActivity && state.recentActivity.length > 0) {
    lines.push('## Recent Activity (Last 10)');
    for (const activity of state.recentActivity) {
      const time = new Date(activity.timestamp).toLocaleTimeString();
      lines.push(`- [${time}] ${activity.event}: ${activity.file}`);
    }
  } else {
    lines.push('## Recent Activity');
    lines.push('No activity yet.');
  }

  return lines.join('\n');
}

/**
 * Execute watcher action via MCP tool
 */
async function executeWatcherAction(action, config, projectRoot, cacheDir) {
  // Import the watcher module directly
  const { CodeIndexer } = await import(join(mcpServerDir, 'src', 'semantic', 'indexer.js'));

  // Create indexer instance
  const indexer = new CodeIndexer(projectRoot, {
    cacheDir,
    patterns: ['js/**/*.js', 'mcp-server/src/**/*.js', 'tests/**/*.js'],
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.mcp-cache/**',
      '**/*.test.js',
      '**/*.spec.js',
      '**/coverage/**',
    ],
  });

  // Initialize indexer
  await indexer.initialize();

  // Load cached chunks
  try {
    await indexer.loadCachedChunks();
  } catch (error) {
    console.error('Warning: Could not load cached chunks:', error.message);
  }

  // Execute action
  switch (action) {
    case 'start':
      if (indexer.watcher && indexer.watcher.isRunning()) {
        console.log('File watcher is already running.');
        console.log(
          '\nUse "status" to check current state or "restart" to apply new configuration.'
        );
        return;
      }

      await indexer.startWatcher(config);
      console.log(formatStatus(indexer.watcher.getStatus(), 'File watcher started successfully'));
      break;

    case 'stop':
      if (!indexer.watcher || !indexer.watcher.isRunning()) {
        console.log('File watcher is not running.');
        return;
      }

      await indexer.stopWatcher();
      console.log('File watcher stopped successfully.');
      console.log('\nNote: The watcher has processed all pending changes before stopping.');
      break;

    case 'status': {
      if (!indexer.watcher) {
        const state = loadWatcherState(cacheDir);
        console.log(formatStatus(state, 'File Watcher Status'));
        console.log('\nTo start the watcher, run:');
        console.log('  node watcher-control.js start');
        return;
      }

      const status = indexer.watcher.getStatus();
      console.log(formatStatus(status, 'File Watcher Status'));
      break;
    }

    case 'restart': {
      const wasRunning = indexer.watcher && indexer.watcher.isRunning();

      if (wasRunning) {
        await indexer.stopWatcher();
      }

      await indexer.startWatcher(config);

      if (!indexer.watcher) {
        console.error('Error: Failed to initialize file watcher');
        process.exit(1);
      }

      console.log(
        formatStatus(
          indexer.watcher.getStatus(),
          wasRunning ? 'File watcher restarted' : 'File watcher started'
        )
      );
      break;
    }

    default:
      console.error(`Unknown action: ${action}`);
      console.error('Valid actions: start, stop, status, restart');
      process.exit(1);
  }

  // Keep process alive if watcher is running
  if (action === 'start' || action === 'restart') {
    console.log('\nWatcher is running. Press Ctrl+C to stop.');
    console.log(
      '(The watcher will continue running in the background if this process is killed)\n'
    );
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const { action, config } = parseArgs(args);

  // Determine paths
  const projectRoot = process.env.RC_PROJECT_ROOT || join(mcpServerDir, '..');
  const cacheDir = process.env.RC_MCP_CACHE_DIR || join(projectRoot, '.mcp-cache');

  // Execute action
  try {
    await executeWatcherAction(action, config, projectRoot, cacheDir);
  } catch (error) {
    console.error('Error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
