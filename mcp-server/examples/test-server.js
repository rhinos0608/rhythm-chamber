#!/usr/bin/env node

/**
 * Test script for Rhythm Chamber MCP Server
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function testMCPServer() {
  console.log('Starting Rhythm Chamber MCP Server...\n');

  const serverPath = join(__dirname, '..', 'server.js');
  const projectRoot = join(__dirname, '..', '..');

  const server = spawn('node', [serverPath], {
    cwd: join(__dirname, '..'),
    env: {
      ...process.env,
      RC_PROJECT_ROOT: projectRoot,
      RC_MCP_CACHE_DIR: join(projectRoot, '.mcp-cache'),
      NODE_ENV: 'development',
    },
  });

  server.stderr.on('data', data => {
    console.error(`[SERVER] ${data}`);
  });

  server.on('error', error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

  server.on('exit', code => {
    console.log(`\nServer exited with code ${code}`);
  });

  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n✅ Server started successfully!');
  console.log('\nNext steps:');
  console.log('1. Test with a real MCP client (Claude Code)');
  console.log('2. Add to Claude Code config:');
  console.log('   {');
  console.log('     "mcpServers": {');
  console.log('       "rhythm-chamber": {');
  console.log('         "command": "node",');
  console.log(`         "args": ["${join(projectRoot, 'mcp-server/server.js')}"]`);
  console.log('       }');
  console.log('     }');
  console.log('   }');

  // Keep server running for a bit then exit
  setTimeout(() => {
    console.log('\nStopping test server...');
    server.kill();
  }, 3000);
}

testMCPServer().catch(console.error);
