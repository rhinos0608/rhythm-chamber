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
import { schema as get_module_info_schema, handler as get_module_info_handler } from './src/tools/module-info.js';
import { schema as find_dependencies_schema, handler as find_dependencies_handler } from './src/tools/dependencies.js';
import { schema as search_architecture_schema, handler as search_architecture_handler } from './src/tools/architecture.js';
import { schema as validate_hnw_compliance_schema, handler as validate_hnw_compliance_handler } from './src/tools/validation.js';

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

    console.error(`[Rhythm Chamber MCP] Initializing...`);
    console.error(`[Rhythm Chamber MCP] Project root: ${this.projectRoot}`);
    console.error(`[Rhythm Chamber MCP] Cache dir: ${this.cacheDir}`);
  }

  /**
   * Set up tool handlers
   */
  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          get_module_info_schema,
          find_dependencies_schema,
          search_architecture_schema,
          validate_hnw_compliance_schema,
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.error(`[Rhythm Chamber MCP] Tool called: ${name}`);
      console.error(`[Rhythm Chamber MCP] Arguments:`, JSON.stringify(args, null, 2));

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

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`[Rhythm Chamber MCP] Error in ${name}:`, error);
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
    console.error(`[Rhythm Chamber MCP] Setting up tool handlers...`);
    this.setupToolHandlers();

    const transport = new StdioServerTransport();
    console.error(`[Rhythm Chamber MCP] Connecting to transport...`);

    await this.server.connect(transport);
    console.error(`[Rhythm Chamber MCP] Server running and listening for requests`);
  }
}

/**
 * Main entry point
 */
async function main() {
  console.error('[Rhythm Chamber MCP] Starting Rhythm Chamber MCP Server v0.1.0');

  const mcpServer = new RhythmChamberMCPServer();
  await mcpServer.start();

  console.error('[Rhythm Chamber MCP] Ready!');
}

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('[Rhythm Chamber MCP] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Rhythm Chamber MCP] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
main().catch((error) => {
  console.error('[Rhythm Chamber MCP] Fatal error:', error);
  process.exit(1);
});
