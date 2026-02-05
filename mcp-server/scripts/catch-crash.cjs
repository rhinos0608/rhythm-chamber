#!/usr/bin/env node

/* global console, process, setInterval, Buffer, clearInterval */

/**
 * Crash Log Monitor
 *
 * Monitors mcp-server log for CRASH-DEBUG markers and extracts the last file being processed.
 * This helps identify which file triggered the crash.
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.env.HOME || process.env.USERPROFILE, 'Library/Logs/Claude/mcp-server-rhythm-chamber.log');

console.log('Monitoring for crash...');
console.log(`Log file: ${LOG_FILE}`);
console.log('Press Ctrl+C to stop\n');

// Track last seen file
let lastFileStart = null;
let lastFileComplete = null;

// Watch log file for changes
let lastSize = 0;
try {
  lastSize = fs.statSync(LOG_FILE).size;
} catch (e) {
  // File doesn't exist yet
}

const interval = setInterval(() => {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size <= lastSize) return; // No new content

    // Read new content
    const fd = fs.openSync(LOG_FILE, 'r');
    fs.readSync(fd, Buffer.alloc(stat.size - lastSize), 0, stat.size - lastSize, lastSize);
    const newContent = fs.readFileSync(LOG_FILE, 'utf8', lastSize);
    fs.closeSync(fd);
    lastSize = stat.size;

    // Look for CRASH-DEBUG markers
    const lines = newContent.split('\n');

    for (const line of lines) {
      if (line.includes('[CRASH-DEBUG] ========== STARTING FILE #')) {
        const match = line.match(/STARTING FILE #(\d+)/);
        if (match) {
          lastFileStart = match[1];
          // Extract file name from next few lines
        }
      }
      if (line.includes('[CRASH-DEBUG] File: ')) {
        const match = line.match(/File: (.+)/);
        if (match) {
          lastFileStart = match[1];
          console.log(`[${new Date().toISOString()}] Processing: ${lastFileStart}`);
        }
      }
      if (line.includes('[CRASH-DEBUG] ========== COMPLETED FILE #')) {
        const match = line.match(/COMPLETED FILE #(\d+)/);
        if (match) {
          lastFileComplete = match[1];
        }
      }
      if (line.includes('[CRASH-DEBUG] Final memory:')) {
        const match = line.match(/heap=([\d.]+)MB/);
        if (match) {
          console.log(`  ✓ Completed - heap: ${match[1]}MB`);
        }
      }
    }
  } catch (e) {
    // Log file might not exist or be readable yet
  }
}, 500);

// Cleanup on exit
process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('\n\n=== Crash Detection Summary ===');
  if (lastFileStart && lastFileStart !== lastFileComplete) {
    console.log(`🔍 CRASH FILE: ${lastFileStart}`);
    console.log('   (This file was processing when crash occurred)');
  } else {
    console.log('No crash detected - all files completed successfully');
  }
  process.exit(0);
});
