#!/usr/bin/env node

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const JS_DIR = join(ROOT_DIR, 'js');

function findJSFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
        files.push(...findJSFiles(fullPath));
      }
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.includes('.min.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

console.log('Finding files...');
const files = findJSFiles(JS_DIR);
console.log(`Found ${files.length} files`);

console.log('Reading first 10 files...');
for (let i = 0; i < Math.min(10, files.length); i++) {
  const start = Date.now();
  const content = readFileSync(files[i], 'utf-8');
  const elapsed = Date.now() - start;
  console.log(`  ${relative(JS_DIR, files[i])}: ${content.length} bytes (${elapsed}ms)`);
}

console.log('Testing existsSync on first file...');
const testFile = files[0];
const start = Date.now();
const exists = existsSync(testFile);
const elapsed = Date.now() - start;
console.log(`  existsSync: ${exists} (${elapsed}ms)`);

console.log('Done!');
