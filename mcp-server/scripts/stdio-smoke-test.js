#!/usr/bin/env node
/**
 * MCP stdio smoke test.
 *
 * Spawns the local MCP server over stdio, then exercises a few tool calls.
 * Useful for diagnosing "connection dropped during tool calls" issues.
 *
 * Run from repo root:
 *   node mcp-server/scripts/stdio-smoke-test.js
 */

import process from 'node:process';
import { resolve, join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

async function main() {
  const mcpServerDir = resolve(process.cwd(), 'mcp-server');
  const projectRoot = resolve(mcpServerDir, '..');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['server.js'],
    cwd: mcpServerDir,
    // NOTE: Change to "pipe" to reproduce stderr backpressure problems.
    stderr: 'inherit',
    env: {
      ...process.env,
      RC_PROJECT_ROOT: projectRoot,
      RC_MCP_CACHE_DIR: join(projectRoot, '.mcp-cache'),
      RC_SEMANTIC_SEARCH: 'true',
      RC_ENABLE_WATCHER: 'false',
      NODE_ENV: 'development',
    },
  });

  transport.onclose = () => {
    console.error('[SMOKE] Transport closed');
  };
  transport.onerror = err => {
    console.error('[SMOKE] Transport error:', err?.message || err);
  };

  const client = new Client(
    { name: 'rhythm-chamber-smoke', version: '0.0.0' },
    { capabilities: {} }
  );

  console.error('[SMOKE] Connecting...');
  await withTimeout(client.connect(transport), 10_000, 'connect');

  const tools = await withTimeout(client.listTools(), 10_000, 'listTools');
  console.log('tools:', tools.tools.map(t => t.name).sort().join(', '));

  const call = async (name, args, timeoutMs = 60_000) => {
    const res = await withTimeout(client.callTool({ name, arguments: args }), timeoutMs, name);
    const text = res.content?.[0]?.text ?? '';
    console.log(`\n== ${name} ==\n${text.slice(0, 1200)}${text.length > 1200 ? '\n... (truncated)' : ''}`);
    return res;
  };

  // Give the server a moment to spin up background init.
  await sleep(250);

  await call('indexing_control', { action: 'status' }, 15_000);
  await call('list_indexed_files', { filter: 'all', includeChunks: false, format: 'summary' }, 30_000);
  await call(
    'get_module_info',
    { filePath: 'js/main.js', includeDependencies: true, includeExports: true },
    30_000
  );

  await call(
    'validate_hnw_compliance',
    { filePath: 'js/controllers', checkViolations: true, generateReport: true },
    60_000
  );

  // Semantic search may be unavailable until indexing completes; that should still return a response.
  await call('semantic_search', { query: 'session management', limit: 3, threshold: 0.2 }, 60_000);

  await transport.close();
  console.error('[SMOKE] Done');
}

main().catch(err => {
  console.error('[SMOKE] Failed:', err?.stack || err);
  process.exit(1);
});
