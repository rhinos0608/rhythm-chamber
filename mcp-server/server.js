#!/usr/bin/env node

/**
 * Rhythm Chamber MCP Server
 * Model Context Protocol server for codebase analysis and HNW architecture validation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import tools
import {
  schema as get_module_info_schema,
  handler as get_module_info_handler,
} from './src/tools/module-info.js';
import {
  schema as find_dependencies_schema,
  handler as find_dependencies_handler,
} from './src/tools/dependencies.js';
import {
  schema as search_architecture_schema,
  handler as search_architecture_handler,
} from './src/tools/architecture.js';
import {
  schema as validate_hnw_compliance_schema,
  handler as validate_hnw_compliance_handler,
} from './src/tools/validation.js';
import {
  schema as find_all_usages_schema,
  handler as find_all_usages_handler,
} from './src/tools/find-usages.js';
import {
  schema as get_compilation_errors_schema,
  handler as get_compilation_errors_handler,
} from './src/tools/compilation-errors.js';
import {
  schema as get_symbol_graph_schema,
  handler as get_symbol_graph_handler,
} from './src/tools/symbol-graph.js';
import {
  schema as analyze_architecture_schema,
  handler as analyze_architecture_handler,
} from './src/tools/architecture-analysis.js';
import {
  schema as trace_execution_flow_schema,
  handler as trace_execution_flow_handler,
} from './src/tools/execution-flow.js';
import {
  schema as suggest_refactoring_schema,
  handler as suggest_refactoring_handler,
} from './src/tools/refactoring-suggestions.js';

// Semantic search tools
import {
  schema as semantic_search_schema,
  handler as semantic_search_handler,
} from './src/tools/semantic-search.js';
import {
  schema as deep_code_search_schema,
  handler as deep_code_search_handler,
} from './src/tools/deep-code-search.js';
import {
  schema as get_chunk_details_schema,
  handler as get_chunk_details_handler,
} from './src/tools/get-chunk-details.js';
import {
  schema as list_indexed_files_schema,
  handler as list_indexed_files_handler,
} from './src/tools/list-indexed-files.js';
import {
  schema as watcher_control_schema,
  handler as watcher_control_handler,
} from './src/tools/watcher-control.js';
import {
  schema as indexing_control_schema,
  handler as indexing_control_handler,
} from './src/tools/indexing-control.js';

// Multi-model comparison tools
import {
  schema as run_multi_models_schema,
  handler as run_multi_models_handler,
} from './src/tools/run-models.js';
import {
  schema as multi_model_compare_schema,
  handler as multi_model_compare_handler,
} from './src/tools/multi-model-compare.js';

// Model configuration tool
import {
  schema as model_config_schema,
  handler as model_config_handler,
} from './src/tools/model-config.js';

// Semantic indexer
import { CodeIndexer } from './src/semantic/indexer.js';

/**
 * Main MCP Server class for Rhythm Chamber
 */
class RhythmChamberMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'rhythm-chamber-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.projectRoot = process.env.RC_PROJECT_ROOT || join(__dirname, '..');
    this.cacheDir = process.env.RC_MCP_CACHE_DIR || join(this.projectRoot, '.mcp-cache');
    this.enableSemantic = process.env.RC_SEMANTIC_SEARCH !== 'false'; // Enabled by default
    this._indexingInProgress = false; // Track indexing state
    this._indexingError = null; // Track any indexing errors
    this._indexingPromise = null; // Track current indexing operation for graceful shutdown

    console.error('[Rhythm Chamber MCP] Initializing...');
    console.error(`[Rhythm Chamber MCP] Project root: ${this.projectRoot}`);
    console.error(`[Rhythm Chamber MCP] Cache dir: ${this.cacheDir}`);
    console.error(
      `[Rhythm Chamber MCP] Semantic search: ${this.enableSemantic ? 'enabled' : 'disabled'}`
    );
  }

  /**
   * Set up tool handlers
   */
  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [
        get_module_info_schema,
        find_dependencies_schema,
        search_architecture_schema,
        validate_hnw_compliance_schema,
        find_all_usages_schema,
        get_compilation_errors_schema,
        get_symbol_graph_schema,
        analyze_architecture_schema,
        trace_execution_flow_schema,
        suggest_refactoring_schema,
      ];

      // Add semantic search tools if enabled (check indexer at handler level)
      if (this.enableSemantic) {
        tools.push(
          semantic_search_schema,
          deep_code_search_schema,
          get_chunk_details_schema,
          list_indexed_files_schema,
          watcher_control_schema,
          indexing_control_schema,
          model_config_schema,
          run_multi_models_schema,
          multi_model_compare_schema
        );
      }

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      console.error(`[Rhythm Chamber MCP] Tool called: ${name}`);
      console.error('[Rhythm Chamber MCP] Arguments:', JSON.stringify(args, null, 2));

      try {
        switch (name) {
          case 'get_module_info':
            return await get_module_info_handler(args, this.projectRoot);

          case 'find_dependencies':
            return await find_dependencies_handler(args, this.projectRoot);

          case 'search_architecture':
            return await search_architecture_handler(args, this.projectRoot);

          case 'validate_hnw_compliance':
            return await validate_hnw_compliance_handler(args, this.projectRoot);

          case 'find_all_usages':
            return await find_all_usages_handler(args, this.projectRoot);

          case 'get_compilation_errors':
            return await get_compilation_errors_handler(args, this.projectRoot);

          case 'get_symbol_graph':
            return await get_symbol_graph_handler(args, this.projectRoot);

          case 'analyze_architecture':
            return await analyze_architecture_handler(args, this.projectRoot);

          case 'trace_execution_flow':
            return await trace_execution_flow_handler(args, this.projectRoot);

          case 'suggest_refactoring':
            return await suggest_refactoring_handler(args, this.projectRoot);

          // Semantic search tools
          case 'semantic_search':
            return await semantic_search_handler(
              args,
              this.projectRoot,
              this.semanticIndexer,
              this
            );

          case 'deep_code_search':
            return await deep_code_search_handler(
              args,
              this.projectRoot,
              this.semanticIndexer,
              this
            );

          case 'get_chunk_details':
            return await get_chunk_details_handler(
              args,
              this.projectRoot,
              this.semanticIndexer,
              this
            );

          case 'list_indexed_files':
            return await list_indexed_files_handler(
              args,
              this.projectRoot,
              this.semanticIndexer,
              this
            );

          case 'watcher_control':
            return await watcher_control_handler(
              args,
              this.projectRoot,
              this.semanticIndexer,
              this
            );

          case 'indexing_control':
            return await indexing_control_handler(
              args,
              this.projectRoot,
              this.semanticIndexer,
              this
            );

          case 'model_config':
            return await model_config_handler(args, this.projectRoot);

          case 'run_multi_models':
            return await run_multi_models_handler(args, this.projectRoot);

          case 'multi_model_compare':
            return await multi_model_compare_handler(args, this.projectRoot);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`[Rhythm Chamber MCP] Error in ${name}:`, error);

        // Check if handler already returned an error response (avoid double-wrapping)
        // Handlers use createErrorResponse() which returns { content, isError, metadata }
        if (error.content && error.isError !== undefined) {
          return error; // Pass through handler's error response
        }

        // Otherwise, wrap in error response
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
    });
  }

  /**
   * Start the server
   */
  async start() {
    console.error('[Rhythm Chamber MCP] Initializing...');
    console.error('[Rhythm Chamber MCP] Setting up tool handlers...');
    this.setupToolHandlers();

    const transport = new StdioServerTransport();
    console.error('[Rhythm Chamber MCP] Connecting to transport...');

    await this.server.connect(transport);
    console.error('[Rhythm Chamber MCP] Server running and listening for requests');

    // CRITICAL FIX: Initialize semantic indexer AFTER transport is connected
    // This allows the server to respond to Claude immediately, then load cache in background
    if (this.enableSemantic) {
      // Start indexing in background - don't await, but store promise for watcher setup
      this._indexerInitPromise = this.initializeSemanticIndexer().catch(error => {
        console.error('[Rhythm Chamber MCP] Failed to initialize semantic indexer:', error.message);
        this.semanticIndexer = null;
        this.enableSemantic = false;
      });
    }

    // CRITICAL FIX: Log ready message AFTER transport connects
    // The semantic indexer will initialize in background
    console.error('[Rhythm Chamber MCP] Ready! Semantic search initializing in background...');

    // Auto-start file watcher if enabled via environment variable
    // Note: This waits for indexer initialization to complete first
    if (process.env.RC_ENABLE_WATCHER === 'true') {
      // Wait for indexer to be ready before starting watcher
      if (this._indexerInitPromise) {
        this._indexerInitPromise.then(async () => {
          if (this.semanticIndexer) {
            try {
              const watcherConfig = {
                debounceDelay: parseInt(process.env.RC_WATCHER_DEBOUNCE || '300', 10),
                coalesceWindow: parseInt(process.env.RC_WATCHER_COALESCE || '1000', 10),
                maxQueueSize: parseInt(process.env.RC_WATCHER_MAX_QUEUE || '1000', 10),
              };

              await this.semanticIndexer.startWatcher(watcherConfig);
              console.error('[MCP] File watcher initialized');
            } catch (error) {
              console.error('[MCP] Failed to initialize watcher:', error.message);
            }
          }
        }).catch(error => {
          console.error('[MCP] Failed to initialize indexer for watcher:', error.message);
        });
      }
    }
  }

  /**
   * Initialize semantic search indexer
   */
  async initializeSemanticIndexer() {
    // Guard: Don't re-initialize if already exists
    if (this.semanticIndexer) {
      console.error('[Rhythm Chamber MCP] Semantic indexer already exists, skipping initialization');
      return this.semanticIndexer;
    }

    console.error('[Rhythm Chamber MCP] Initializing semantic search indexer...');

    try {
      this.semanticIndexer = new CodeIndexer(this.projectRoot, {
        cacheDir: this.cacheDir,
        patterns: ['js/**/*.js', 'mcp-server/src/**/*.js', 'tests/**/*.js', 'docs/**/*.md', '*.md'],
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

      await this.semanticIndexer.initialize();

      // Load cached chunks IMMEDIATELY (blocks server start until cache loaded)
      await this.semanticIndexer.loadCachedChunks();

      // Perform incremental indexing in background (doesn't block server start)
      this.runIndexing().catch(error => {
        console.error('[Rhythm Chamber MCP] Indexing error:', error);
      });

      console.error('[Rhythm Chamber MCP] Semantic indexer initialized');
    } catch (error) {
      console.error('[Rhythm Chamber MCP] Failed to initialize semantic indexer:', error.message);
      this.semanticIndexer = null;
      this.enableSemantic = false;
    }
  }

  /**
   * Run indexing in the background
   * Returns immediately, indexing runs asynchronously
   */
  runIndexing() {
    if (!this.semanticIndexer) return Promise.resolve();

    this._indexingInProgress = true;
    this._indexingError = null;

    console.error('[Rhythm Chamber MCP] Starting background indexing...');

    // Store promise so shutdown can wait for it
    this._indexingPromise = (async () => {
      try {
        const stats = await this.semanticIndexer.indexAll({ force: false });

        console.error('[Rhythm Chamber MCP] Indexing complete:', {
          files: stats.filesIndexed,
          chunks: stats.chunksIndexed,
          time: `${(stats.indexTime / 1000).toFixed(2)}s`,
          source: stats.embeddingSource,
        });
      } catch (error) {
        console.error('[Rhythm Chamber MCP] Indexing error:', error);
        this._indexingError = error.message || String(error);
        this.semanticIndexer._indexingError = error;
      } finally {
        this._indexingInProgress = false;
        // Note: semanticIndexer._indexingInProgress is managed by indexAll() itself
      }
    })();

    // Also store promise on indexer
    this.semanticIndexer._indexingPromise = this._indexingPromise;

    // Return promise for error handling at call site
    return this._indexingPromise;
  }

  /**
   * Get indexing status
   */
  getIndexingStatus() {
    if (!this.semanticIndexer) {
      return { status: 'disabled' };
    }

    const isIndexing = Boolean(
      this._indexingInProgress || this.semanticIndexer._indexingInProgress
    );
    const error = this._indexingError || this.semanticIndexer._indexingError;

    return {
      status: isIndexing ? 'indexing' : 'ready',
      error,
      stats: this.semanticIndexer.getStats(),
    };
  }
}

/**
 * Main entry point
 */
async function main() {
  console.error('[Rhythm Chamber MCP] Starting Rhythm Chamber MCP Server v0.1.0');

  // OOM DIAGNOSTICS: Log actual runtime environment
  const v8 = await import('v8');
  const heapStats = v8.getHeapStatistics();
  console.error('[Rhythm Chamber MCP] Runtime Diagnostics:', {
    nodeVersion: process.version,
    execPath: process.execPath,
    execArgv: process.execArgv.join(' ') || '(none)',
    nodeOptions: process.env.NODE_OPTIONS || '(not set)',
    heapLimit: `${(heapStats.heap_size_limit / 1024 / 1024).toFixed(0)} MB`,
    heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(0)} MB`,
  });

  const mcpServer = new RhythmChamberMCPServer();

  // Store instance globally for error handlers
  mcpServerInstance = mcpServer;

  await mcpServer.start();

  console.error('[Rhythm Chamber MCP] Ready!');

  // Set up graceful shutdown handlers
  setupShutdownHandlers(mcpServer);
}

/**
 * Set up signal handlers for graceful shutdown
 */
function setupShutdownHandlers(mcpServer) {
  const shutdown = async signal => {
    console.error(`[Rhythm Chamber MCP] Received ${signal}, shutting down gracefully...`);

    // CRITICAL: Wait for any in-progress indexing to complete before saving cache
    // But add a timeout to avoid waiting forever for large codebases
    if (mcpServer._indexingPromise) {
      console.error('[Rhythm Chamber MCP] Waiting for indexing to complete (max 5 minutes)...');
      console.error(
        '[Rhythm Chamber MCP] DEBUG: _indexingPromise exists:',
        !!mcpServer._indexingPromise
      );
      try {
        // Wait with timeout - if indexing takes too long, save what we have
        // FIX: Increased timeout to 300s (5 minutes) for LM Studio batch processing
        // LM Studio processes embeddings in batches which can take longer
        const result = await Promise.race([
          mcpServer._indexingPromise,
          new Promise((_, reject) =>
            setTimeout(() => {
              console.error('[Rhythm Chamber MCP] DEBUG: Timeout callback triggered');
              reject(new Error('Indexing timeout'));
            }, 300000)
          ),
        ]);
        console.error('[Rhythm Chamber MCP] Indexing complete');
      } catch (error) {
        console.error('[Rhythm Chamber MCP] DEBUG: Caught error:', error.message);
        if (error.message === 'Indexing timeout') {
          console.error('[Rhythm Chamber MCP] Indexing timed out, saving partial cache...');
        } else {
          console.error('[Rhythm Chamber MCP] Indexing error during shutdown:', error.message);
        }
      }
      console.error('[Rhythm Chamber MCP] DEBUG: Indexing wait block complete');
    }

    console.error('[Rhythm Chamber MCP] DEBUG: About to save cache...');

    // CRITICAL: Save cache before exiting to persist embeddings
    // FIX: Increased timeout from 1.5s to 15s to accommodate large caches
    // Cache save time scales with chunk count: ~8s for 11K chunks observed
    // This prevents the MCP client from timing out and killing the server
    const CACHE_SAVE_TIMEOUT = 15000; // 15 seconds
    if (mcpServer.semanticIndexer) {
      try {
        console.error('[Rhythm Chamber MCP] Saving cache...');
        const saveStart = Date.now();
        const saveResult = await Promise.race([
          mcpServer.semanticIndexer._saveCache(),
          new Promise((_, reject) =>
            setTimeout(() => {
              const elapsed = Date.now() - saveStart;
              console.error(`[Rhythm Chamber MCP] Cache save timeout (${elapsed}ms > ${CACHE_SAVE_TIMEOUT}ms), proceeding with shutdown`);
              reject(new Error('Cache save timeout'));
            }, CACHE_SAVE_TIMEOUT)
          ),
        ]);
        const saveElapsed = Date.now() - saveStart;
        console.error(`[Rhythm Chamber MCP] Cache saved in ${saveElapsed}ms, result:`, saveResult);
      } catch (error) {
        if (error.message === 'Cache save timeout') {
          console.error('[Rhythm Chamber MCP] Cache save timed out - partial data may be lost. Consider increasing CACHE_SAVE_TIMEOUT if this happens frequently.');
        } else {
          console.error('[Rhythm Chamber MCP] Error saving cache:', error.message);
        }
      }
    }

    console.error('[Rhythm Chamber MCP] DEBUG: Cache save complete');

    // Stop file watcher if running
    if (mcpServer.semanticIndexer?.watcher) {
      console.error('[Rhythm Chamber MCP] Stopping file watcher...');
      try {
        await mcpServer.semanticIndexer.watcher.stop();
        console.error('[Rhythm Chamber MCP] File watcher stopped');
      } catch (error) {
        console.error('[Rhythm Chamber MCP] Error stopping watcher:', error.message);
      }
    }

    // FIX: Close semantic indexer to release SQLite adapter
    if (mcpServer.semanticIndexer) {
      console.error('[Rhythm Chamber MCP] Closing semantic indexer...');
      try {
        await mcpServer.semanticIndexer.close();
        console.error('[Rhythm Chamber MCP] Semantic indexer closed');
      } catch (error) {
        console.error('[Rhythm Chamber MCP] Error closing indexer:', error.message);
      }
    }

    console.error('[Rhythm Chamber MCP] DEBUG: About to exit...');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Handle errors - try to save cache before exiting
let mcpServerInstance = null;

process.on('uncaughtException', async error => {
  console.error('[Rhythm Chamber MCP] Uncaught exception:', error);

  // Wait for indexing to complete
  if (mcpServerInstance?._indexingPromise) {
    console.error('[Rhythm Chamber MCP] Waiting for indexing to complete...');
    try {
      await mcpServerInstance._indexingPromise;
    } catch (indexError) {
      console.error('[Rhythm Chamber MCP] Indexing error:', indexError.message);
    }
  }

  // Try to save cache before exiting
  // FIX: Increased timeout from 1.5s to 15s to match shutdown handler
  if (mcpServerInstance?.semanticIndexer) {
    try {
      console.error('[Rhythm Chamber MCP] Attempting to save cache before exit...');
      const saveStart = Date.now();
      await Promise.race([
        mcpServerInstance.semanticIndexer._saveCache(),
        new Promise((_, reject) =>
          setTimeout(() => {
            const elapsed = Date.now() - saveStart;
            console.error(`[Rhythm Chamber MCP] Cache save timeout (${elapsed}ms > 15000ms), proceeding with shutdown`);
            reject(new Error('Cache save timeout'));
          }, 15000)
        ),
      ]);
      const elapsed = Date.now() - saveStart;
      console.error(`[Rhythm Chamber MCP] Cache saved in ${elapsed}ms`);
    } catch (saveError) {
      if (saveError.message === 'Cache save timeout') {
        console.error('[Rhythm Chamber MCP] Cache save timed out - partial data may be lost');
      } else {
        console.error('[Rhythm Chamber MCP] Error saving cache:', saveError.message);
      }
    }

    // FIX: Close semantic indexer to release SQLite adapter
    try {
      await mcpServerInstance.semanticIndexer.close();
    } catch (closeError) {
      console.error('[Rhythm Chamber MCP] Error closing indexer:', closeError.message);
    }
  }

  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('[Rhythm Chamber MCP] Unhandled rejection at:', promise, 'reason:', reason);

  // Wait for indexing to complete
  if (mcpServerInstance?._indexingPromise) {
    console.error('[Rhythm Chamber MCP] Waiting for indexing to complete...');
    try {
      await mcpServerInstance._indexingPromise;
    } catch (indexError) {
      console.error('[Rhythm Chamber MCP] Indexing error:', indexError.message);
    }
  }

  // Try to save cache before exiting
  // FIX: Increased timeout from 1.5s to 15s to match shutdown handler
  if (mcpServerInstance?.semanticIndexer) {
    try {
      console.error('[Rhythm Chamber MCP] Attempting to save cache before exit...');
      const saveStart = Date.now();
      await Promise.race([
        mcpServerInstance.semanticIndexer._saveCache(),
        new Promise((_, reject) =>
          setTimeout(() => {
            const elapsed = Date.now() - saveStart;
            console.error(`[Rhythm Chamber MCP] Cache save timeout (${elapsed}ms > 15000ms), proceeding with shutdown`);
            reject(new Error('Cache save timeout'));
          }, 15000)
        ),
      ]);
      const elapsed = Date.now() - saveStart;
      console.error(`[Rhythm Chamber MCP] Cache saved in ${elapsed}ms`);
    } catch (saveError) {
      if (saveError.message === 'Cache save timeout') {
        console.error('[Rhythm Chamber MCP] Cache save timed out - partial data may be lost');
      } else {
        console.error('[Rhythm Chamber MCP] Error saving cache:', saveError.message);
      }
    }

    // FIX: Close semantic indexer to release SQLite adapter
    try {
      await mcpServerInstance.semanticIndexer.close();
    } catch (closeError) {
      console.error('[Rhythm Chamber MCP] Error closing indexer:', closeError.message);
    }
  }

  process.exit(1);
});

// Start server
main().catch(async error => {
  console.error('[Rhythm Chamber MCP] Fatal error:', error);

  // Wait for indexing to complete
  if (mcpServerInstance?._indexingPromise) {
    console.error('[Rhythm Chamber MCP] Waiting for indexing to complete...');
    try {
      await mcpServerInstance._indexingPromise;
    } catch (indexError) {
      console.error('[Rhythm Chamber MCP] Indexing error:', indexError.message);
    }
  }

  // Try to save cache before exiting
  // FIX: Increased timeout from 1.5s to 15s to match shutdown handler
  if (mcpServerInstance?.semanticIndexer) {
    try {
      console.error('[Rhythm Chamber MCP] Attempting to save cache before exit...');
      const saveStart = Date.now();
      await Promise.race([
        mcpServerInstance.semanticIndexer._saveCache(),
        new Promise((_, reject) =>
          setTimeout(() => {
            const elapsed = Date.now() - saveStart;
            console.error(`[Rhythm Chamber MCP] Cache save timeout (${elapsed}ms > 15000ms), proceeding with shutdown`);
            reject(new Error('Cache save timeout'));
          }, 15000)
        ),
      ]);
      const elapsed = Date.now() - saveStart;
      console.error(`[Rhythm Chamber MCP] Cache saved in ${elapsed}ms`);
    } catch (saveError) {
      if (saveError.message === 'Cache save timeout') {
        console.error('[Rhythm Chamber MCP] Cache save timed out - partial data may be lost');
      } else {
        console.error('[Rhythm Chamber MCP] Error saving cache:', saveError.message);
      }
    }

    // FIX: Close semantic indexer to release SQLite adapter
    try {
      await mcpServerInstance.semanticIndexer.close();
    } catch (closeError) {
      console.error('[Rhythm Chamber MCP] Error closing indexer:', closeError.message);
    }
  }

  process.exit(1);
});
