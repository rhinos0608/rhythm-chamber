#!/usr/bin/env node

/**
 * Dependency Graph Analyzer
 *
 * Analyzes the codebase to:
 * - Build a complete dependency graph
 * - Detect circular dependencies
 * - Identify layer violations (e.g., services importing controllers)
 * - Output results in JSON and DOT formats
 *
 * Usage: node scripts/analyze-deps.js
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const JS_DIR = join(ROOT_DIR, 'js');
const OUTPUT_DIR = join(ROOT_DIR, '.state');

// Layer definitions (hierarchy order: higher layers can import lower layers)
const LAYERS = {
  controllers: { level: 5, canImport: ['services', 'utils', 'storage', 'security', 'providers'] },
  services: { level: 4, canImport: ['services', 'utils', 'storage', 'security', 'providers'] },
  providers: { level: 3, canImport: ['utils', 'storage'] },
  storage: { level: 2, canImport: ['utils', 'security'] },
  security: { level: 2, canImport: ['utils'] },
  utils: { level: 1, canImport: ['utils'] },
  artifacts: { level: 4, canImport: ['services', 'utils'] },
  embeddings: { level: 4, canImport: ['services', 'utils', 'vector-store'] },
  'vector-store': { level: 4, canImport: ['services', 'utils'] },
  workers: { level: 3, canImport: ['services', 'utils', 'storage', 'providers'] },
  rag: { level: 4, canImport: ['services', 'utils', 'vector-store'] },
  observability: { level: 4, canImport: ['services', 'utils'] },
  functions: { level: 4, canImport: ['services', 'utils'] },
  spotify: { level: 4, canImport: ['services', 'utils', 'storage'] },
  settings: { level: 4, canImport: ['services', 'utils', 'storage'] },
  bootstrap: { level: 6, canImport: ['*'] }, // Can import anything
  config: { level: 0, canImport: [] }, // Cannot import anything
  contracts: { level: 0, canImport: [] }, // Cannot import anything
  state: { level: 0, canImport: ['utils'] },
  vendor: { level: 0, canImport: [] } // External libraries
};

/**
 * Recursively find all JavaScript files in a directory
 */
function findJSFiles(dir, baseDir = dir) {
  const files = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and test directories
      if (entry.name === 'node_modules' || entry.name === '__tests__') {
        continue;
      }
      files.push(...findJSFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      // Skip minified files
      if (!entry.name.includes('.min.js')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Extract imports from a JavaScript file using regex
 */
function extractImports(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const imports = [];

  // Match ES6 import statements
  // import { X } from './path.js'
  // import X from './path.js'
  // import * as X from './path.js'
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s+from\s+['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];

    // Only process relative imports (starting with . or ..)
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      imports.push(importPath);
    }
  }

  // Also check for dynamic imports
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      imports.push(importPath);
    }
  }

  return imports;
}

/**
 * Resolve a relative import path to an absolute file path
 */
function resolveImportPath(importPath, currentFile) {
  const currentDir = dirname(currentFile);

  // Resolve relative path
  let resolvedPath = join(currentDir, importPath);

  // Try adding .js extension if not present
  if (!resolvedPath.endsWith('.js')) {
    if (existsSync(resolvedPath + '.js')) {
      resolvedPath += '.js';
    } else if (existsSync(join(resolvedPath, 'index.js'))) {
      resolvedPath = join(resolvedPath, 'index.js');
    }
  }

  return resolvedPath;
}

/**
 * Get the layer name for a given file path
 */
function getLayerForFile(filePath) {
  const relativePath = relative(JS_DIR, filePath);
  const parts = relativePath.split(/[/\\]/);
  return parts[0];
}

/**
 * Check if importing layer can import target layer
 */
function isValidLayerImport(importingLayer, targetLayer) {
  const layerConfig = LAYERS[importingLayer];

  if (!layerConfig) {
    // Unknown layer, allow it
    return true;
  }

  // Can import anything
  if (layerConfig.canImport.includes('*')) {
    return true;
  }

  // Can import specific layers
  return layerConfig.canImport.includes(targetLayer);
}

/**
 * Detect circular dependencies using iterative DFS (more efficient than recursive)
 */
function detectCircularDeps(graph) {
  const WHITE = 0; // Not visited
  const GRAY = 1;  // Visiting (in recursion stack)
  const BLACK = 2; // Visited

  const color = {};
  const parent = {};
  const cycles = [];

  // Initialize all nodes as WHITE
  for (const node of Object.keys(graph)) {
    color[node] = WHITE;
  }

  function dfsIterative(startNode) {
    const stack = [[startNode, 0]]; // [node, nextChildIndex]
    const path = [];

    while (stack.length > 0) {
      const [node, childIndex] = stack[stack.length - 1];

      if (childIndex === 0) {
        // First time visiting this node
        color[node] = GRAY;
        path.push(node);
      }

      const dependencies = graph[node] || [];
      const nextChild = dependencies[childIndex];

      if (nextChild) {
        // Increment child index for next iteration
        stack[stack.length - 1][1]++;

        if (color[nextChild] === GRAY) {
          // Found a cycle
          const cycleStart = path.indexOf(nextChild);
          const cycle = [...path.slice(cycleStart), nextChild];
          cycles.push(cycle);
        } else if (color[nextChild] === WHITE) {
          // Visit this child
          stack.push([nextChild, 0]);
        }
        // If BLACK, skip (already processed)
      } else {
        // No more children to process
        color[node] = BLACK;
        path.pop();
        stack.pop();
      }
    }
  }

  for (const node of Object.keys(graph)) {
    if (color[node] === WHITE) {
      dfsIterative(node);
    }
  }

  return cycles;
}

/**
 * Main analysis function
 */
function analyzeDependencies() {
  console.log('Analyzing dependencies...\n');

  // Find all JavaScript files
  console.log('Step 1: Finding JavaScript files...');
  const files = findJSFiles(JS_DIR);
  console.log(`✓ Found ${files.length} JavaScript files\n`);

  // Build dependency graph
  console.log('Step 2: Building dependency graph...');
  const graph = {};
  const fileToLayer = {};
  const layerViolations = [];
  const missingImports = [];
  const validFilesSet = new Set(files); // For O(1) lookup

  for (const file of files) {
    graph[file] = [];
    fileToLayer[file] = getLayerForFile(file);
  }

  // Extract imports with progress indicator
  let processed = 0;
  const progressInterval = 10; // Report every 10 files
  const startTime = Date.now();
  let totalImports = 0;
  let totalResolveTime = 0;
  const progressFile = join(OUTPUT_DIR, 'analyze-progress.txt');

  writeFileSync(progressFile, `Starting file processing...\n`);

  console.log('  Starting file processing...');

  for (const file of files) {
    processed++;

    // Write progress to file for debugging
    if (processed % 5 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const progressMsg = `Processing: ${processed}/${files.length} files... (${elapsed}s)\n`;
      writeFileSync(progressFile, progressMsg);
    }

    // Report progress more frequently at first
    if (processed === 1 || processed % progressInterval === 0 || processed < 5) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  Processing: ${processed}/${files.length} files... (${elapsed}s, ${totalImports} imports, ${(totalResolveTime/1000).toFixed(1)}s resolving)`);
    }

    try {
      const fileStart = Date.now();
      const imports = extractImports(file);

      if (processed === 21) {
        console.log(`    === Processing file 21: ${relative(JS_DIR, file)} ===`);
      }

      const currentLayer = fileToLayer[file];

      let importNum = 0;
      for (const importPath of imports) {
        importNum++;

        if (processed === 21 && importNum <= 5) {
          console.log(`      Import ${importNum}: ${importPath}`);
        }

        const resolveStart = Date.now();
        try {
          const resolvedPath = resolveImportPath(importPath, file);

          if (processed === 21 && importNum <= 5) {
            console.log(`      -> Resolved to: ${resolvedPath}`);
          }

          totalResolveTime += Date.now() - resolveStart;
          totalImports++;

          // Only add if the resolved file is within js/ directory and in our file set
          if (resolvedPath.startsWith(JS_DIR) && validFilesSet.has(resolvedPath)) {
            graph[file].push(resolvedPath);

            // Check for layer violations
            const targetLayer = fileToLayer[resolvedPath];

            if (currentLayer && targetLayer && currentLayer !== targetLayer) {
              if (!isValidLayerImport(currentLayer, targetLayer)) {
                layerViolations.push({
                  file: relative(JS_DIR, file),
                  importingLayer: currentLayer,
                  imports: relative(JS_DIR, resolvedPath),
                  targetLayer: targetLayer,
                  reason: `Layer '${currentLayer}' cannot import from layer '${targetLayer}'`
                });
              }
            }
          } else if (resolvedPath.startsWith(JS_DIR)) {
            // File is in js/ but doesn't exist
            missingImports.push({
              file: relative(JS_DIR, file),
              imports: importPath
            });
          }
        } catch (error) {
          // Ignore resolution errors
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  console.log(`✓ Processed ${files.length} files\n`);

  // Detect circular dependencies
  console.log('Step 3: Detecting circular dependencies...');
  const cycles = detectCircularDeps(graph);

  // Print results
  console.log('\n=== RESULTS ===\n');

  console.log(`Total files: ${files.length}`);
  console.log(`Circular dependencies: ${cycles.length}`);
  console.log(`Layer violations: ${layerViolations.length}`);
  console.log(`Missing imports: ${missingImports.length}\n`);

  if (cycles.length > 0) {
    console.log('⚠️  CIRCULAR DEPENDENCIES FOUND:\n');
    cycles.forEach((cycle, i) => {
      console.log(`Cycle ${i + 1}:`);
      cycle.forEach(file => {
        console.log(`  → ${relative(JS_DIR, file)}`);
      });
      console.log('');
    });
  } else {
    console.log('✅ No circular dependencies detected\n');
  }

  if (layerViolations.length > 0) {
    console.log('⚠️  LAYER VIOLATIONS FOUND:\n');
    layerViolations.forEach((violation, i) => {
      console.log(`Violation ${i + 1}:`);
      console.log(`  File: ${violation.file}`);
      console.log(`  Layer: ${violation.importingLayer} → ${violation.targetLayer}`);
      console.log(`  Imports: ${violation.imports}`);
      console.log(`  Reason: ${violation.reason}`);
      console.log('');
    });
  } else {
    console.log('✅ No layer violations detected\n');
  }

  if (missingImports.length > 0) {
    console.log('⚠️  MISSING IMPORTS:\n');
    missingImports.forEach((missing, i) => {
      console.log(`${i + 1}. ${missing.file} imports '${missing.imports}'`);
    });
    console.log('');
  }

  // Output JSON
  const jsonOutput = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: files.length,
      circularDependencies: cycles.length,
      layerViolations: layerViolations.length,
      missingImports: missingImports.length
    },
    cycles: cycles.map(cycle => cycle.map(f => relative(JS_DIR, f))),
    layerViolations: layerViolations.map(v => ({
      ...v,
      severity: 'error'
    })),
    missingImports,
    graph: Object.fromEntries(
      Object.entries(graph).map(([file, deps]) => [
        relative(JS_DIR, file),
        deps.map(d => relative(JS_DIR, d))
      ])
    )
  };

  const jsonPath = join(OUTPUT_DIR, 'dependency-graph.json');
  writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`✅ JSON output written to: ${jsonPath}`);

  // Output DOT format for visualization
  const dotOutput = ['digraph DependencyGraph {'];
  dotOutput.push('  rankdir=LR;');
  dotOutput.push('  node [shape=box];');

  // Add nodes with layer colors
  for (const file of files) {
    const layer = fileToLayer[file];
    const color = getLayerColor(layer);
    dotOutput.push(`  "${relative(JS_DIR, file)}" [fillcolor="${color}", style="filled"];`);
  }

  // Add edges
  for (const [file, deps] of Object.entries(graph)) {
    for (const dep of deps) {
      dotOutput.push(`  "${relative(JS_DIR, file)}" -> "${relative(JS_DIR, dep)}";`);
    }
  }

  dotOutput.push('}');

  const dotPath = join(OUTPUT_DIR, 'dependency-graph.dot');
  writeFileSync(dotPath, dotOutput.join('\n'));
  console.log(`✅ DOT output written to: ${dotPath}`);

  // Exit with error code if violations found
  if (cycles.length > 0 || layerViolations.length > 0) {
    console.log('\n❌ Architecture violations detected!');
    process.exit(1);
  } else {
    console.log('\n✅ Architecture validation passed!');
    process.exit(0);
  }
}

/**
 * Get a color for a layer in DOT output
 */
function getLayerColor(layer) {
  const colors = {
    controllers: '#ff9999', // Red
    services: '#99ccff',    // Blue
    providers: '#99ff99',   // Green
    utils: '#ffff99',       // Yellow
    storage: '#ff99ff',     // Purple
    security: '#ffcc99',    // Orange
    artifacts: '#cc99ff',   // Light purple
    workers: '#99ffcc'      // Teal
  };
  return colors[layer] || '#cccccc';
}

// Run analysis
analyzeDependencies();
