/**
 * HNW (Hierarchical Network Wave) Architecture Pattern Analyzer
 */

import { ASTParser } from '../utils/parser.js';
import { FileScanner } from '../utils/file-scanner.js';
import { resolve, dirname, join, relative } from 'path';
import { existsSync, readFileSync } from 'fs';

/**
 * HNW Rule Definitions with "why" traces
 * Each rule has an ID, description, and confidence criteria
 */
const HNW_RULES = {
  HIERARCHY_001: {
    id: 'HNW-HIERARCHY-001',
    name: 'hierarchy',
    title: 'Layer Violation',
    description: 'Dependencies must follow HNW hierarchy: Controllers → Services → Providers',
    why: 'Bypassing layers creates tight coupling, makes testing difficult, and breaks the clear command chain',
    confidence: 'HIGH',  // AST-based analysis is reliable
    impact: 'HIGH',
  },
  NETWORK_001: {
    id: 'HNW-NETWORK-001',
    name: 'network',
    title: 'EventBus Not Used',
    description: 'Cross-module communication should use EventBus',
    why: 'Direct imports create tight coupling; EventBus enables loose coupling and better testability',
    confidence: 'MEDIUM',  // Heuristic based on import count
    impact: 'MEDIUM',
  },
  WAVE_001: {
    id: 'HNW-WAVE-001',
    name: 'wave',
    title: 'TabCoordinator Not Used',
    description: 'Cross-tab coordination must use TabCoordinator',
    why: 'Direct IndexedDB writes from non-primary tabs cause data corruption and race conditions',
    confidence: 'HIGH',  // Clear pattern detection
    impact: 'CRITICAL',
  },
};

export class HNWAnalyzer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.parser = new ASTParser();
    this.scanner = new FileScanner(projectRoot);
    this.rules = HNW_RULES;
  }

  /**
   * Get rule definition by name
   */
  getRule(ruleName) {
    return Object.values(this.rules).find(r => r.name === ruleName) || null;
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
   * Enhanced with evidence snippets and "why" traces
   */
  checkHNWCompliance(layer, imports, resolvedImports, filePath) {
    const violations = [];
    const score = { max: 100, deducted: 0 };

    // Read file content for evidence extraction
    let fileContent = '';
    try {
      const fullPath = resolve(this.projectRoot, filePath);
      fileContent = readFileSync(fullPath, 'utf-8');
    } catch {
      // File might not exist or be readable
    }

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
        const rule = this.rules.HIERARCHY_001;
        const evidence = this.extractImportEvidence(fileContent, source);

        violations.push({
          ruleId: rule.id,
          rule: rule.name,
          title: rule.title,
          severity: 'error',
          message: validation.reason,
          why: rule.why,
          confidence: rule.confidence,
          impact: rule.impact,
          import: source,
          targetLayer: imp.layer,
          evidence: evidence,
          suggestedFix: `Move ${imp.resolved} logic up to ${layer} or create a service in ${layer}`,
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
      const rule = this.rules.NETWORK_001;
      const evidence = this.extractImportListEvidence(fileContent, imports);

      violations.push({
        ruleId: rule.id,
        rule: rule.name,
        title: rule.title,
        severity: 'warning',
        message: 'Should use EventBus for cross-module communication',
        why: rule.why,
        confidence: rule.confidence,
        impact: rule.impact,
        evidence: evidence,
        suggestedFix: 'Import and use EventBus for inter-module communication',
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
   * Extract evidence snippet showing the problematic import
   */
  extractImportEvidence(fileContent, importPath) {
    const lines = fileContent.split('\n');
    const importLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('import') && line.includes(importPath)) {
        // Get context (line + up to 2 lines after)
        const context = [line];
        for (let j = 1; j <= 2 && i + j < lines.length; j++) {
          const nextLine = lines[i + j].trim();
          if (nextLine && !nextLine.startsWith('import')) {
            context.push(nextLine);
          } else if (nextLine.startsWith('import')) {
            break;
          }
        }
        return {
          line: i + 1,
          snippet: context.join('\n'),
        };
      }
    }

    return {
      line: null,
      snippet: `import ... from '${importPath}'`,
    };
  }

  /**
   * Extract evidence showing the import list for network violations
   */
  extractImportListEvidence(fileContent, imports) {
    const lines = fileContent.split('\n');
    const importLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import')) {
        importLines.push(`L${i + 1}: ${line}`);
      }
    }

    return {
      line: null,
      snippet: importLines.slice(0, 5).join('\n'),
      total: importLines.length,
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
