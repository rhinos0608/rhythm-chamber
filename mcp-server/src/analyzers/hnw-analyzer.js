/**
 * HNW (Hierarchical Network Wave) Architecture Pattern Analyzer
 */

import { ASTParser } from '../utils/parser.js';
import { FileScanner } from '../utils/file-scanner.js';
import { resolve, dirname, join, relative } from 'path';
import { existsSync } from 'fs';

export class HNWAnalyzer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.parser = new ASTParser();
    this.scanner = new FileScanner(projectRoot);
  }

  /**
   * Analyze a file for HNW compliance
   */
  analyzeFile(filePath) {
    const relativePath = this.scanner.getRelativePath(filePath);
    const layer = this.scanner.getFileLayer(filePath);
    const ast = this.parser.parse(filePath);

    const imports = this.parser.extractImports(ast);
    const exports = this.parser.extractExports(ast);

    // Resolve imports to actual file paths for accurate layer checking
    const resolvedImports = this.resolveImports(imports, filePath);

    const analysis = {
      filePath: relativePath,
      layer,
      compliance: this.checkHNWCompliance(layer, imports, resolvedImports, relativePath),
      imports: imports.map((imp) => imp.source),
      exports: {
        named: exports.named.length,
        default: exports.default ? 1 : 0,
        details: exports,
      },
      recommendations: [],
    };

    return analysis;
  }

  /**
   * Resolve import paths to actual file system paths
   * This allows us to check the actual layer of imported modules
   */
  resolveImports(imports, currentFile) {
    const resolved = [];

    for (const imp of imports) {
      const importPath = imp.source;
      let resolvedPath = null;
      let targetLayer = null;

      // Handle relative imports
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const currentDir = dirname(currentFile);
        const candidate = resolve(currentDir, importPath);

        // Security check
        if (!this.isPathWithinProject(candidate)) {
          resolved.push({
            original: importPath,
            resolved: null,
            layer: 'external',
            error: 'Path outside project root',
          });
          continue;
        }

        // Try .js extension
        if (existsSync(candidate + '.js')) {
          resolvedPath = candidate + '.js';
        }
        // Try as directory with index.js
        else {
          const indexJs = join(candidate, 'index.js');
          if (existsSync(indexJs)) {
            resolvedPath = indexJs;
          }
        }
      }
      // Handle absolute imports from project root
      else if (!importPath.startsWith('.')) {
        // Try js/ prefix
        const fromJs = resolve(this.projectRoot, 'js', importPath);
        if (existsSync(fromJs + '.js')) {
          resolvedPath = fromJs + '.js';
        }
        // Try direct from root
        else {
          const fromRoot = resolve(this.projectRoot, importPath);
          if (existsSync(fromRoot + '.js')) {
            resolvedPath = fromRoot + '.js';
          }
        }
      }

      // Determine layer if resolved
      if (resolvedPath) {
        targetLayer = this.scanner.getFileLayer(resolvedPath);
      }

      resolved.push({
        original: importPath,
        resolved: resolvedPath ? this.scanner.getRelativePath(resolvedPath) : null,
        layer: targetLayer || 'external',
      });
    }

    return resolved;
  }

  /**
   * Check if a path is within the project root
   */
  isPathWithinProject(path) {
    const relativePath = relative(this.projectRoot, path);
    return !relativePath.startsWith('..');
  }

  /**
   * Check HNW compliance for a module
   * Now uses resolved imports to check actual target layers
   */
  checkHNWCompliance(layer, imports, resolvedImports, filePath) {
    const violations = [];
    const score = { max: 100, deducted: 0 };

    for (let i = 0; i < resolvedImports.length; i++) {
      const imp = resolvedImports[i];
      const source = imports[i].source;

      // Skip external modules
      if (imp.layer === 'external') {
        continue;
      }

      // Skip if import couldn't be resolved
      if (!imp.resolved) {
        continue;
      }

      // Use validateDependencyChain for accurate layer checking
      const validation = this.validateDependencyChain(filePath, imp.resolved);

      if (!validation.isValid) {
        violations.push({
          rule: 'hierarchy',
          severity: 'error',
          message: validation.reason,
          import: source,
          targetLayer: imp.layer,
        });
        score.deducted += 20;
      }
    }

    // Check for EventBus usage (Network principle)
    const usesEventBus = imports.some((imp) =>
      imp.source.includes('event-bus.js')
    );

    if (
      (layer === 'controllers' || layer === 'services') &&
      !usesEventBus &&
      imports.length > 1
    ) {
      violations.push({
        rule: 'network',
        severity: 'warning',
        message: 'Should use EventBus for cross-module communication',
        recommendation: 'Import and use EventBus for inter-module communication',
      });
      score.deducted += 10;
    }

    return {
      score: Math.max(0, score.max - score.deducted),
      violations,
      compliant: violations.filter((v) => v.severity === 'error').length === 0,
    };
  }

  /**
   * Validate dependency chain follows HNW patterns
   */
  validateDependencyChain(fromFile, toFile) {
    const fromLayer = this.scanner.getFileLayer(fromFile);
    const toLayer = this.scanner.getFileLayer(toFile);

    const validDependencies = {
      controllers: ['services', 'utils', 'storage'],
      services: ['providers', 'utils', 'storage'],
      providers: ['utils'],
      utils: [],
      storage: ['utils'],
      security: ['utils'],
    };

    const allowed = validDependencies[fromLayer] || [];
    const isValid = allowed.includes(toLayer) || toLayer === 'other';

    return {
      isValid,
      fromLayer,
      toLayer,
      reason: isValid
        ? null
        : `${fromLayer} cannot depend on ${toLayer}`,
    };
  }

  /**
   * Get HNW patterns explanation
   */
  getPatternsExplanation() {
    return {
      hierarchy: {
        description: 'Clear command chain with no bypassing layers',
        pattern: 'Controllers → Services → Providers',
        rules: [
          'Controllers call Services, not Providers directly',
          'Services use Provider abstraction layer',
          'No circular dependencies in the call chain',
          'Follow dependency injection patterns',
        ],
      },
      network: {
        description: 'Event-driven communication with loose coupling',
        pattern: 'EventBus for cross-module communication',
        rules: [
          'Use EventBus for inter-module communication',
          'Avoid tight coupling through direct imports',
          'Implement proper event cleanup',
          'Use domain filtering for event handlers',
        ],
      },
      wave: {
        description: 'Deterministic leader election for cross-tab coordination',
        pattern: 'TabCoordinator handles cross-tab operations',
        rules: [
          'Check primary tab status before IndexedDB writes',
          'Use write-ahead log for crash recovery',
          'Test with multiple tabs when modifying coordination',
          'No direct writes from non-primary tabs',
        ],
      },
    };
  }
}
