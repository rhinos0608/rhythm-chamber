#!/usr/bin/env node
/**
 * Test MCP Server Connection
 *
 * Tests that the MCP server starts correctly and tools are accessible.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testConnection() {
  console.log('=== Testing MCP Server Connection ===\n');

  // Start the server
  console.log('Starting MCP server...');
  const server = spawn('node', ['server.js'], {
    cwd: join(__dirname, '..'),  // server.js is in parent directory
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  let hasErrors = false;

  // Capture stderr (server logs to stderr)
  server.stderr.on('data', (data) => {
    const text = data.toString();
    serverOutput += text;
    console.log('Server:', text.trim());
  });

  // Capture stdout
  server.stdout.on('data', (data) => {
    const text = data.toString();
    serverOutput += text;
    console.log('Server stdout:', text.trim());
  });

  // Wait for server to be ready
  await new Promise((resolve) => {
    const checkReady = (data) => {
      const text = data.toString();
      if (text.includes('Ready!') && text.includes('Semantic search')) {
        console.log('\n✓ Server is ready!\n');
        server.stderr.off('data', checkReady);
        setTimeout(resolve, 2000);  // Wait 2s for initialization
      }
    };
    server.stderr.on('data', checkReady);
  });

  // Send a simple JSON-RPC request to test the server
  console.log('Testing JSON-RPC communication...');
  const testRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
  };

  server.stdin.write(JSON.stringify(testRequest) + '\n');

  // Wait for response
  await new Promise((resolve) => {
    server.stdout.on('data', (data) => {
      const text = data.toString();
      if (text.includes('tools')) {
        console.log('✓ Server responded to tools/list request!');
        console.log('\nResponse:');
        try {
          const response = JSON.parse(text.trim());
          if (response.result && response.result.tools) {
            console.log(`  Found ${response.result.tools.length} tools:`);
            response.result.tools.forEach(tool => {
              console.log(`    - ${tool.name}`);
            });
          }
        } catch (e) {
          console.log('  ', text.trim());
        }
        setTimeout(resolve, 500);
      }
    });
  });

  // Test indexing status
  console.log('\nTesting indexing control...');
  const statusRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'indexing_control',
      arguments: {
        action: 'status',
      },
    },
  };

  server.stdin.write(JSON.stringify(statusRequest) + '\n');

  await new Promise((resolve) => {
    server.stdout.on('data', (data) => {
      const text = data.toString();
      if (text.includes('status') || text.includes('indexed')) {
        console.log('✓ Server responded to indexing_control!');
        console.log('\nResponse preview:');
        try {
          const response = JSON.parse(text.trim());
          if (response.result && response.result.content) {
            const content = response.result.content[0].text;
            console.log(content.split('\n').slice(0, 15).join('\n') + '...');
          }
        } catch (e) {
          console.log('  ', text.trim().substring(0, 500));
        }
        setTimeout(resolve, 500);
      }
    });
  });

  console.log('\n' + '='.repeat(60));
  console.log('✓ MCP Server is working correctly!');
  console.log('\nShutting down server...');

  // Cleanup
  server.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 1000));
  server.kill('SIGKILL');
}

testConnection().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
