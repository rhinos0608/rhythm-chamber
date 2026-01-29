#!/usr/bin/env node

/**
 * Simple Dependency Graph Analyzer
 *
 * A simplified version that focuses on detecting circular dependencies
 * and layer violations without complex analysis.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const JS_DIR = join(ROOT_DIR, 'js');
const OUTPUT_DIR = join(ROOT_DIR, '.state');

// Simplified layer hierarchy
const LAYERS = {
  controllers: 5,
  services: 4,
  providers: 3,
  utils: 1,
  storage: 2,
  security: 2
};

function findJSFiles(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__tests__') {
      files.push(...findJSFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.includes('.min.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractImports(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const imports = [];
  const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    if (match[1].startsWith('./') || match[1].startsWith('../')) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function resolveImportPath(importPath, currentFile) {
  const currentDir = dirname(currentFile);
  let resolved = join(currentDir, importPath);

  if (!resolved.endsWith('.js') && existsSync(resolved + '.js')) {
    resolved += '.js';
  } else if (existsSync(join(resolved, 'index.js'))) {
    resolved = join(resolved, 'index.js');
  }

  return resolved;
}

function getLayer(filePath) {
  const parts = relative(JS_DIR, filePath).split(/[/\\]/);
  return LAYERS[parts[0]] || 0;
}

console.log('Analyzing dependencies...\n');
const files = findJSFiles(JS_DIR);
console.log(`Found ${files.length} files\n`);

const graph = {};
const violations = [];
let processed = 0;

// Initialize graph
for (const file of files) {
  graph[file] = [];
}

// Build graph
console.log('Building dependency graph...');
for (const file of files) {
  processed++;
  if (processed % 50 === 0) {
    console.log(`  ${processed}/${files.length}...`);
  }

  const fromLayer = getLayer(file);
  const imports = extractImports(file);

  for (const imp of imports) {
    try {
      const resolved = resolveImportPath(imp, file);

      if (existsSync(resolved) && graph[resolved] !== undefined) {
        graph[file].push(resolved);

        const toLayer = getLayer(resolved);

        // Check for layer violations (higher level importing lower level is OK)
        if (fromLayer > 0 && toLayer > 0 && fromLayer < toLayer) {
          violations.push({
            file: relative(JS_DIR, file),
            imports: relative(JS_DIR, resolved),
            fromLayer,
            toLayer
          });
        }
      }
    } catch (e) {
      // Skip errors
    }
  }
}

console.log(`✓ Processed ${files.length} files\n`);

// Detect cycles using simple DFS
console.log('Detecting circular dependencies...');
const WHITE = 0, GRAY = 1, BLACK = 2;
const color = {};
const cycles = [];

for (const f of files) color[f] = WHITE;

function dfs(node, path) {
  color[node] = GRAY;
  path.push(node);

  for (const dep of graph[node]) {
    if (color[dep] === GRAY) {
      const cycleStart = path.indexOf(dep);
      cycles.push([...path.slice(cycleStart), dep]);
    } else if (color[dep] === WHITE) {
      dfs(dep, path);
    }
  }

  color[node] = BLACK;
  path.pop();
}

for (const file of files) {
  if (color[file] === WHITE) {
    dfs(file, []);
  }
}

console.log('\n=== RESULTS ===\n');
console.log(`Files: ${files.length}`);
console.log(`Circular dependencies: ${cycles.length}`);
console.log(`Layer violations: ${violations.length}\n`);

if (cycles.length > 0) {
  console.log('⚠️  CIRCULAR DEPENDENCIES:\n');
  cycles.slice(0, 5).forEach((cycle, i) => {
    console.log(`Cycle ${i + 1}:`);
    cycle.forEach(f => console.log(`  → ${relative(JS_DIR, f)}`));
    console.log('');
  });
}

if (violations.length > 0) {
  console.log('⚠️  LAYER VIOLATIONS:\n');
  violations.slice(0, 10).forEach((v, i) => {
    console.log(`${i + 1}. ${v.file} (layer ${v.fromLayer}) imports ${v.imports} (layer ${v.toLayer})`);
  });
  console.log('');
}

// Output JSON
const results = {
  timestamp: new Date().toISOString(),
  summary: {
    totalFiles: files.length,
    circularDependencies: cycles.length,
    layerViolations: violations.length
  },
  cycles: cycles.map(c => c.map(f => relative(JS_DIR, f))),
  violations: violations.map(v => ({
    ...v,
    file: relative(JS_DIR, v.file),
    imports: relative(JS_DIR, v.imports)
  }))
};

writeFileSync(join(OUTPUT_DIR, 'dependency-graph.json'), JSON.stringify(results, null, 2));
console.log(`✓ Output: ${join(OUTPUT_DIR, 'dependency-graph.json')}`);

if (cycles.length > 0 || violations.length > 0) {
  console.log('\n❌ Issues detected!');
  process.exit(1);
} else {
  console.log('\n✅ All checks passed!');
  process.exit(0);
}
