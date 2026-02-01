import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { DEPRECATED_WINDOW_GLOBALS } from '../js/window-globals-debug.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TARGET_EXTENSIONS = new Set(['.js', '.ts', '.mjs']);
const IGNORE_DIRS = new Set([
  'node_modules',
  'playwright-report',
  'test-results',
  '.git',
  '.vscode',
  '.roo',
  'docs',
  'tests', // Test files use window globals for mocking
]);

const WATCHED_LOWERCASE = new Set(['transformers']);
const ALLOWED_GLOBALS = new Set(DEPRECATED_WINDOW_GLOBALS);
const WINDOW_ACCESS_REGEX = /window\.([A-Za-z_][A-Za-z0-9_]*)/g;

function shouldCheckName(name) {
  if (WATCHED_LOWERCASE.has(name)) return true;
  const first = name[0];
  const isUppercase = first.toUpperCase() === first && first.toLowerCase() !== first;
  const isUnderscore = first === '_';
  return isUppercase || isUnderscore;
}

function isLikelyComment(line) {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('*/')
  );
}

async function getFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await getFiles(fullPath)));
      continue;
    }

    const ext = path.extname(entry.name);
    if (TARGET_EXTENSIONS.has(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function scanFile(filePath) {
  const findings = [];
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n');

  for (const match of content.matchAll(WINDOW_ACCESS_REGEX)) {
    const name = match[1];
    if (!shouldCheckName(name)) continue;

    const lineNumber = content.slice(0, match.index).split('\n').length;
    const line = lines[lineNumber - 1] || '';

    if (isLikelyComment(line)) continue;
    if (ALLOWED_GLOBALS.has(name)) continue;

    findings.push({
      filePath: path.relative(ROOT, filePath),
      lineNumber,
      name,
      lineText: line.trim(),
    });
  }

  return findings;
}

async function main() {
  const files = await getFiles(ROOT);
  const violations = [];

  for (const file of files) {
    const fileViolations = await scanFile(file);
    violations.push(...fileViolations);
  }

  if (violations.length === 0) {
    console.log('No new window global accesses detected.');
    return;
  }

  console.error('Found disallowed window global accesses:');
  for (const violation of violations) {
    console.error(
      ` - ${violation.filePath}:${violation.lineNumber} -> window.${violation.name} (${violation.lineText})`
    );
  }
  console.error(
    '\nAllowed globals baseline is defined in js/window-globals-debug.js. Additions should migrate to module imports instead.'
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error('Failed to run window globals lint:', error);
  process.exitCode = 1;
});
