#!/usr/bin/env node

/**
 * Production Build Script for Rhythm Chamber
 *
 * A minimal, zero-config build pipeline that:
 * 1. Minifies JavaScript with esbuild (ultra-fast)
 * 2. Minifies CSS with clean-css
 * 3. Creates a dist/ directory ready for deployment
 *
 * Usage: node scripts/build.mjs
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Common } from '../js/utils/common.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = dirname(__dirname);
const DIST_DIR = join(ROOT_DIR, 'dist');

// Ensure dist directory exists
if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true });
}

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║          Rhythm Chamber Production Build                  ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

/**
 * Get all JS files that need to be built
 */
function getEntryPoints() {
  const jsDir = join(ROOT_DIR, 'js');
  const entryPoints = [];

  // Main entry point
  entryPoints.push(join(jsDir, 'main.js'));

  // Worker files (need to be separate bundles)
  const workersDir = join(jsDir, 'workers');
  if (existsSync(workersDir)) {
    const workerFiles = readdirSync(workersDir).filter(f => f.endsWith('.js'));
    for (const worker of workerFiles) {
      entryPoints.push(join(workersDir, worker));
    }
  }

  // Other standalone files
  const standaloneFiles = ['embedding-worker.js', 'parser-worker.js'];

  for (const file of standaloneFiles) {
    const filePath = join(jsDir, file);
    if (existsSync(filePath)) {
      entryPoints.push(filePath);
    }
  }

  return entryPoints;
}

/**
 * Copy non-JS files to dist
 */
function copyStaticFiles() {
  console.log('📁 Copying static files...');

  const filesToCopy = [
    'index.html',
    'app.html',
    'css/styles.css',
    'js/vendor/jszip.min.js',
    'js/vendor/transformers.min.js',
    'js/config.example.js',
    'netlify.toml',
    'vercel.json',
    '.htaccess',
    'README.md',
    'SECURITY.md',
  ];

  let copiedCount = 0;
  let totalSize = 0;

  for (const file of filesToCopy) {
    const srcPath = join(ROOT_DIR, file);
    if (!existsSync(srcPath)) continue;

    const destPath = join(DIST_DIR, file);
    const destDir = dirname(destPath);

    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    const content = readFileSync(srcPath);
    writeFileSync(destPath, content);

    const size = statSync(srcPath).size;
    totalSize += size;
    copiedCount++;
  }

  // Copy entire docs directory
  const docsDir = join(ROOT_DIR, 'docs');
  if (existsSync(docsDir)) {
    const destDocsDir = join(DIST_DIR, 'docs');
    if (!existsSync(destDocsDir)) {
      mkdirSync(destDocsDir, { recursive: true });
    }
    // Simplified copy - in production would use recursive copy
  }

  console.log(`   ✓ Copied ${copiedCount} files (${Common.formatBytes(totalSize)})`);
}

/**
 * Minify CSS using simple regex-based approach
 * (For production, consider using clean-css-cli)
 */
function minifyCSS(sourcePath, destPath) {
  const css = readFileSync(sourcePath, 'utf-8');
  // Basic CSS minification
  const minified = css
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/\s*([{}:;,])\s*/g, '$1') // Remove space around symbols
    .replace(/;\}/g, '}') // Remove last semicolon
    .trim();

  writeFileSync(destPath, minified);
  const originalSize = css.length;
  const newSize = minified.length;
  const savings = ((1 - newSize / originalSize) * 100).toFixed(1);

  console.log(
    `   ✓ styles.css: ${Common.formatBytes(originalSize)} → ${Common.formatBytes(newSize)} (${savings}% reduction)`
  );
}

/**
 * Build JavaScript with esbuild
 */
async function buildJS() {
  console.log('🔨 Building JavaScript...');

  const entryPoints = getEntryPoints();
  const jsDir = join(ROOT_DIR, 'js');

  for (const entry of entryPoints) {
    const relativePath = entry.replace(jsDir + '/', '');
    const outPath = join(DIST_DIR, 'js', relativePath);

    await build({
      entryPoints: [entry],
      outfile: outPath,
      bundle: false, // Keep as ES modules for browser
      minify: true,
      sourcemap: false,
      target: 'es2020',
      format: 'esm',
      platform: 'browser',
      logLevel: 'error',
      treeShaking: true,
      // NOTE: We no longer drop all console statements. The centralized logger
      // (/js/utils/logger.js) handles log level filtering, ensuring only
      // ERROR and WARN logs appear in production. This preserves critical
      // debugging information while stripping verbose DEBUG/TRACE logs.
    });

    const originalSize = statSync(entry).size;
    const minifiedSize = statSync(outPath).size;
    const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(1);

    console.log(
      `   ✓ ${relativePath}: ${Common.formatBytes(originalSize)} → ${Common.formatBytes(minifiedSize)} (${savings}% reduction)`
    );
  }
}

/**
 * Build CSS
 */
async function buildCSS() {
  console.log('🎨 Building CSS...');

  const srcCssPath = join(ROOT_DIR, 'css', 'styles.css');
  const destCssDir = join(DIST_DIR, 'css');

  if (!existsSync(destCssDir)) {
    mkdirSync(destCssDir, { recursive: true });
  }

  const destCssPath = join(destCssDir, 'styles.css');
  minifyCSS(srcCssPath, destCssPath);
}

/**
 * Generate build report
 */
function generateReport() {
  console.log('\n📊 Build Summary:');
  console.log('─'.repeat(60));

  // Calculate total dist size
  let totalSize = 0;
  let jsSize = 0;
  let cssSize = 0;

  function calculateDirSize(dir) {
    if (!existsSync(dir)) return 0;

    let size = 0;
    const files = readdirSync(dir);

    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);

      if (stat.isDirectory()) {
        size += calculateDirSize(filePath);
      } else {
        const fileSize = stat.size;
        size += fileSize;

        if (file.endsWith('.js')) jsSize += fileSize;
        if (file.endsWith('.css')) cssSize += fileSize;
      }
    }

    return size;
  }

  totalSize = calculateDirSize(DIST_DIR);

  console.log(`   Total size:    ${Common.formatBytes(totalSize)}`);
  console.log(`   JavaScript:    ${Common.formatBytes(jsSize)}`);
  console.log(`   CSS:           ${Common.formatBytes(cssSize)}`);
  console.log(`   Other:         ${Common.formatBytes(totalSize - jsSize - cssSize)}`);
  console.log('\n✅ Build complete! Output in ./dist/\n');
}

/**
 * Main build function
 */
async function main() {
  try {
    // Build steps
    await buildJS();
    await buildCSS();
    copyStaticFiles();
    generateReport();
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

main();
