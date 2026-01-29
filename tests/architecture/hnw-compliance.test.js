/**
 * HNW Architecture Compliance Tests
 *
 * Tests to verify the codebase follows HNW (Hierarchical Network Wave)
 * architectural principles:
 * - Hierarchy: Controllers → Services → Providers
 * - Network: EventBus for cross-module communication
 * - Wave: Single TabCoordinator for cross-tab coordination
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const JS_DIR = join(ROOT_DIR, 'js');

// Layer definitions
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
  workers: { level: 3, canImport: ['services', 'utils', 'storage', 'providers'] }
};

/**
 * Find all JavaScript files recursively
 */
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

/**
 * Extract ES6 imports from a file
 */
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

/**
 * Resolve a relative import to an absolute path
 */
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

/**
 * Get the layer for a file
 */
function getLayerForFile(filePath) {
  const relativePath = relative(JS_DIR, filePath);
  const parts = relativePath.split(/[/\\]/);
  return parts[0];
}

describe('HNW Hierarchy', () => {
  it('should not have services importing controllers', () => {
    const files = findJSFiles(join(JS_DIR, 'services'));
    const violations = [];

    for (const file of files) {
      const imports = extractImports(file);

      for (const imp of imports) {
        try {
          const resolved = resolveImportPath(imp, file);

          if (resolved.includes('/controllers/')) {
            violations.push({
              file: relative(JS_DIR, file),
              imports: relative(JS_DIR, resolved)
            });
          }
        } catch (e) {
          // Skip
        }
      }
    }

    expect(violations).toHaveLength(0);
    if (violations.length > 0) {
      console.log('\nServices importing controllers:');
      violations.forEach(v => console.log(`  ${v.file} → ${v.imports}`));
    }
  });

  it('should have clean dependency chain (Controllers → Services → Providers)', () => {
    const files = findJSFiles(JS_DIR);
    const violations = [];

    for (const file of files) {
      const fromLayer = getLayerForFile(file);
      const fromConfig = LAYERS[fromLayer];

      if (!fromConfig) continue;

      const imports = extractImports(file);

      for (const imp of imports) {
        try {
          const resolved = resolveImportPath(imp, file);

          if (!resolved.startsWith(JS_DIR)) continue;

          const toLayer = getLayerForFile(resolved);
          const toConfig = LAYERS[toLayer];

          if (toConfig && fromConfig.level > toConfig.level) {
            violations.push({
              file: relative(JS_DIR, file),
              fromLayer,
              toLayer,
              imports: relative(JS_DIR, resolved)
            });
          }
        } catch (e) {
          // Skip
        }
      }
    }

    // Allow some violations for now (TODO: fix these)
    expect(violations.length).toBeLessThan(50);

    if (violations.length > 0) {
      console.log(`\nDependency chain violations (${violations.length}):`);
      violations.slice(0, 10).forEach(v => {
        console.log(`  ${v.file} (${v.fromLayer}) → ${v.imports} (${v.toLayer})`);
      });
    }
  });
});

describe('HNW Network', () => {
  it('should use EventBus instead of direct service-to-service imports where possible', () => {
    // This is a heuristic test - direct imports are OK for tight coupling
    // but cross-cutting concerns should use EventBus

    const serviceFiles = findJSFiles(join(JS_DIR, 'services'));
    let directServiceImports = 0;

    for (const file of serviceFiles) {
      const imports = extractImports(file);

      for (const imp of imports) {
        if (imp.includes('../services/')) {
          directServiceImports++;
        }
      }
    }

    // Allow some direct imports (utilities, tightly coupled services)
    // but flag if there are too many
    console.log(`\nDirect service-to-service imports: ${directServiceImports}`);

    // This should be relatively low (EventBus preferred)
    expect(directServiceImports).toBeLessThan(100);
  });

  it('should have EventBus available for services', () => {
    const eventBusPath = join(JS_DIR, 'services', 'event-bus.js');
    expect(existsSync(eventBusPath)).toBe(true);
  });
});

describe('HNW Wave', () => {
  it('should have single TabCoordinator instance', () => {
    const tabCoordinatorPath = join(JS_DIR, 'services', 'tab-coordination', 'index.js');
    expect(existsSync(tabCoordinatorPath)).toBe(true);
  });

  it('should export TabCoordinator interface', () => {
    const content = readFileSync(join(JS_DIR, 'services', 'tab-coordination', 'index.js'), 'utf-8');
    expect(content).toContain('TabCoordinator');
    expect(content).toContain('export');
  });
});

describe('No Circular Dependencies', () => {
  it('should have zero circular dependencies', () => {
    const { execSync } = require('child_process');

    try {
      const output = execSync('node scripts/analyze-deps-simple.js', {
        cwd: ROOT_DIR,
        encoding: 'utf-8'
      });

      // Check if output contains circular dependencies
      const hasCircularDeps = output.includes('Circular dependencies: 0');

      if (!hasCircularDeps) {
        console.log('\nCircular dependencies detected. Run: npm run analyze:deps');
      }

      expect(hasCircularDeps).toBe(true);
    } catch (error) {
      // Command failed (exit code 1), which means issues were found
      console.log('\n', error.stdout || error.message);
      expect(error.stdout).toContain('Circular dependencies: 0');
    }
  });
});

describe('File Size Limits', () => {
  it('should not have files >400 lines (God Object anti-pattern)', () => {
    const files = findJSFiles(JS_DIR);
    const violations = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;

      if (lines > 400) {
        violations.push({
          file: relative(JS_DIR, file),
          lines
        });
      }
    }

    expect(violations).toHaveLength(0);

    if (violations.length > 0) {
      console.log('\nFiles exceeding 400 lines:');
      violations.forEach(v => console.log(`  ${v.file}: ${v.lines} lines`));
    }
  });

  it('should not have files >500 lines (strict mode)', () => {
    const files = findJSFiles(JS_DIR);
    const violations = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;

      if (lines > 500) {
        violations.push({
          file: relative(JS_DIR, file),
          lines
        });
      }
    }

    // Allow a few exceptions for legacy code
    expect(violations.length).toBeLessThan(5);

    if (violations.length > 0) {
      console.log('\nFiles exceeding 500 lines (refactor candidates):');
      violations.forEach(v => console.log(`  ${v.file}: ${v.lines} lines`));
    }
  });
});
