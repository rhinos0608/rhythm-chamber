#!/usr/bin/env node

/**
 * Semantic Search Startup Script
 *
 * Cross-platform launcher for the Rhythm Chamber MCP server with semantic search.
 *
 * Features:
 * - Checks for LM Studio availability
 * - Provides clear status messages
 * - Starts MCP server with semantic search enabled
 *
 * Environment variables:
 * - RC_LMSTUDIO_ENDPOINT: LM Studio API endpoint (default: http://localhost:1234/v1)
 * - RC_PROJECT_ROOT: Project root directory
 * - RC_MCP_CACHE_DIR: Cache directory
 * - RC_SEMANTIC_SEARCH: Enable/disable semantic search (default: true)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mcpServerDir = dirname(__dirname);

const EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';
const LM_STUDIO_ENDPOINT = process.env.RC_LMSTUDIO_ENDPOINT || 'http://localhost:1234/v1';

/**
 * Check if LM Studio is running
 */
async function checkLMStudio() {
  try {
    const response = await fetch(`${LM_STUDIO_ENDPOINT}/models`, {
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();

      // Check if embedding model is loaded
      const hasEmbedding = data.data?.some(m =>
        m.id.includes(EMBEDDING_MODEL) || m.id.includes('embedding')
      );

      return {
        available: true,
        hasEmbedding,
        models: data.data?.map(m => m.id) || []
      };
    }

    return { available: false };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

/**
 * Format model list
 */
function formatModels(models) {
  if (models.length === 0) return 'None';

  return models.map(m => {
    const isEmbedding = m.includes('embedding') || m.includes(EMBEDDING_MODEL);
    return `  ${isEmbedding ? '✓' : ' '} ${m}`;
  }).join('\n');
}

/**
 * Print banner
 */
function printBanner() {
  console.error('');
  console.error('╔═══════════════════════════════════════════════════════════════╗');
  console.error('║        Rhythm Chamber MCP Server - Semantic Search           ║');
  console.error('╚═══════════════════════════════════════════════════════════════╝');
  console.error('');
}

/**
 * Main entry point
 */
async function main() {
  printBanner();

  // Check LM Studio
  console.error('Checking LM Studio availability...');
  const lmStudio = await checkLMStudio();

  if (lmStudio.available) {
    console.error('✓ LM Studio is running');

    if (lmStudio.hasEmbedding) {
      console.error(`✓ Embedding model available: ${EMBEDDING_MODEL}`);
      console.error('');
      console.error('Loaded models:');
      console.error(formatModels(lmStudio.models));
      console.error('');
      console.error('🚀 Using LM Studio for embeddings (fast, GPU-accelerated)');
    } else {
      console.error('');
      console.error('⚠️  No embedding model loaded in LM Studio');
      console.error('');
      console.error('To load the embedding model:');
      console.error('  1. Open LM Studio');
      console.error(`  2. Search for "${EMBEDDING_MODEL}"`);
      console.error('  3. Download and load the model');
      console.error('');
      console.error('🔄 Falling back to Transformers.js (CPU-based)');
    }
  } else {
    console.error('✗ LM Studio is not running');
    console.error('');
    console.error('To use LM Studio for faster embeddings:');
    console.error('  1. Install LM Studio: https://lmstudio.ai/');
    console.error(`  2. Load model: ${EMBEDDING_MODEL}`);
    console.error(`  3. Run API server on ${LM_STUDIO_ENDPOINT}`);
    console.error('');
    console.error('🔄 Using Transformers.js fallback (slower, CPU-based)');
  }

  console.error('');
  console.error('─────────────────────────────────────────────────────────────────');
  console.error('');

  // Set environment for semantic search
  process.env.RC_SEMANTIC_SEARCH = 'true';

  // Start MCP server
  console.error('Starting MCP Server with semantic search...');
  console.error('');

  const serverPath = join(mcpServerDir, 'server.js');

  const serverProcess = spawn('node', [serverPath], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: {
      ...process.env,
      RC_SEMANTIC_SEARCH: 'true',
      RC_LMSTUDIO_ENDPOINT: LM_STUDIO_ENDPOINT
    }
  });

  // Handle process events
  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

  serverProcess.on('exit', (code) => {
    console.error('');
    console.error(`MCP Server exited with code ${code}`);
    process.exit(code);
  });

  // Forward signals
  process.on('SIGTERM', () => serverProcess.kill('SIGTERM'));
  process.on('SIGINT', () => serverProcess.kill('SIGINT'));
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
