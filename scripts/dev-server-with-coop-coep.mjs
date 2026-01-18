#!/usr/bin/env node

/**
 * Development Server with COOP/COEP Headers
 *
 * This script starts a local development server with the necessary
 * Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers
 * to enable SharedArrayBuffer support in the browser.
 *
 * Usage: node scripts/dev-server-with-coop-coep.mjs [port]
 * Default port: 8080
 */

import { createServer } from 'http';
import { parse } from 'url';
import { readFileSync } from 'fs';
import { extname, join, normalize, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 8080;
const ROOT_DIR = resolve(__dirname, '..');

/**
 * MIME types for common file extensions
 */
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

/**
 * Get MIME type for a file extension
 */
function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Security headers including COOP/COEP for SharedArrayBuffer
 */
function getHeaders(filePath) {
  const headers = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.openrouter.com https://api.anthropic.com;",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  };

  // Add COOP/COEP headers for SharedArrayBuffer support
  headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
  headers['Cross-Origin-Opener-Policy'] = 'same-origin';

  // Add CORS header for all files
  headers['Access-Control-Allow-Origin'] = '*';

  return headers;
}

/**
 * Create the HTTP server
 */
const server = createServer((req, res) => {
  const parsedUrl = parse(req.url);

  // Security: Normalize and validate the path to prevent directory traversal
  // Wrap decodeURIComponent in try-catch to handle malformed percent-encoding
  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(parsedUrl.pathname);
  } catch (decodeError) {
    // Malformed percent-encoding in URL - use raw pathname as fallback
    console.warn(`[${new Date().toISOString()}] Warning: Malformed URL encoding in ${parsedUrl.pathname}:`, decodeError.message);
    // Return 400 Bad Request for malformed URLs
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request - Malformed URL encoding');
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} -> 400 Bad Request (malformed URL encoding)`);
    return;
  }

  const normalizedPath = normalize('/' + decodedPathname).replace(/^\/+/, '');
  const safePath = resolve(ROOT_DIR, normalizedPath);

  // Verify the resolved path is within ROOT_DIR (prevent path traversal)
  // Check both that path starts with ROOT_DIR and that it's either exactly ROOT_DIR or has a separator after
  if (safePath !== ROOT_DIR && !safePath.startsWith(ROOT_DIR + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} -> 403 Forbidden (path traversal attempt)`);
    return;
  }

  let filePath = safePath;

  // Default to index.html for directory requests
  if (filePath.endsWith('/')) {
    filePath = join(filePath, 'index.html');
  }

  // Try to resolve the file, fallback to index.html for SPA routes
  try {
    const stats = readFileSync(filePath);
    const mimeType = getMimeType(filePath);
    const headers = getHeaders(filePath);

    res.writeHead(200, {
      ...headers,
      'Content-Type': mimeType
    });
    res.end(stats);

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ${filePath}`);
  } catch (err) {
    // File not found, try index.html for SPA routing
    if (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '/index.html') {
      try {
        const indexFilePath = join(ROOT_DIR, 'index.html');
        const indexContent = readFileSync(indexFilePath);
        const headers = getHeaders(indexFilePath);

        res.writeHead(200, {
          ...headers,
          'Content-Type': 'text/html'
        });
        res.end(indexContent);

        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ${indexFilePath} (SPA fallback)`);
        return;
      } catch (indexErr) {
        // index.html also not found
      }
    }

    // 404 response
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} -> 404 Not Found`);
  }
});

server.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Rhythm Chamber Development Server (COOP/COEP Enabled) ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n  🚀 Server running at: http://localhost:${PORT}/`);
  console.log(`  🔒 COOP/COEP headers enabled for SharedArrayBuffer support`);
  console.log(`  📝 Press Ctrl+C to stop\n`);
});

process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down development server...\n');
  server.close(() => {
    process.exit(0);
  });
});
