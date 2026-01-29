#!/usr/bin/env node

/**
 * Documentation Synchronization Orchestrator
 * Main entry point for docs-sync tooling
 * Coordinates analyzers, generators, and validators
 */

import { resolve } from 'path';
import { fileURLToPath } from 'url';
import Logger from './utils/logger.js';
import ASTCache from './utils/cache.js';
import ASTAnalyzer from './analyzers/ast-analyzer.js';
import GitAnalyzer from './analyzers/git-analyzer.js';
import MetricsUpdater from './generators/metrics-updater.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '../..');

// Load configuration
let config;
try {
  const configPath = resolve(__dirname, 'config.json');
  config = JSON.parse(await import('fs').then(fs => fs.readFileSync(configPath, 'utf-8')));
} catch (error) {
  console.error('Failed to load config.json');
  process.exit(1);
}

// Parse CLI arguments
const args = process.argv.slice(2);
const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'manual';
const shouldCommit = args.includes('--commit');
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose') || args.includes('-v');

// Create logger
const logger = new Logger({ verbose, quiet: mode === 'hook' });

async function main() {
  logger.header('Documentation Synchronization');

  // Check git status if not in dry-run mode
  if (!dryRun && mode !== 'hook') {
    const gitAnalyzer = new GitAnalyzer({ projectRoot, logger });
    const status = await gitAnalyzer.getStatus();

    if (status.dirty) {
      logger.warning('Git repository has uncommitted changes');
      logger.data('Modified:', status.modified.length);
      logger.data('Added:', status.added.length);
      logger.data('Staged:', status.staged.length);

      if (!shouldCommit) {
        logger.info('Run with --commit to auto-commit documentation updates');
      }
    }
  }

  // Initialize cache
  const cache = new ASTCache();

  // Phase 1: AST Analysis
  logger.section('Phase 1: Code Analysis');
  const astAnalyzer = new ASTAnalyzer({
    projectRoot,
    logger,
    cache,
    excludePaths: config.excludePaths || [],
  });

  const metrics = await astAnalyzer.analyzeAll(config.watchPaths || ['js/**/*.js']);

  if (metrics.errors.length > 0) {
    logger.warning(`Failed to parse ${metrics.errors.length} files`);
    if (verbose) {
      metrics.errors.forEach(err => logger.dim(`  - ${err}`));
    }
  }

  // Phase 2: Git Analysis
  logger.section('Phase 2: Git History');
  const gitAnalyzer = new GitAnalyzer({ projectRoot, logger });
  const targetFiles = [
    ...config.targetFiles.metrics,
    config.targetFiles.apiDocs,
    config.targetFiles.security,
  ];

  const gitData = await gitAnalyzer.analyzeTargetFiles(targetFiles);

  // Phase 3: Update Documentation
  logger.section('Phase 3: Updating Documentation');
  const metricsUpdater = new MetricsUpdater({
    projectRoot,
    logger,
    dryRun,
  });

  // Check if updates needed (for git hook mode)
  if (mode === 'hook') {
    const needsUpdate = await metricsUpdater.needsUpdate(metrics, gitData);

    if (needsUpdate) {
      logger.error('Documentation is outdated');
      logger.info('Run: npm run docs:sync');
      logger.dim('Or bypass with: git commit --no-verify');
      process.exit(1);
    }

    logger.success('Documentation is up to date');
    process.exit(0);
  }

  // Perform updates
  const updateResults = metricsUpdater.updateAll(metrics, gitData);

  // Phase 4: Generate Dependency Graph (if there are dependencies)
  if (metrics.dependencyGraph.size > 0) {
    logger.section('Phase 4: Generating Dependency Graph');

    const depGraphPath = resolve(projectRoot, 'docs/DEPENDENCY_GRAPH.md');
    let depGraphContent = '# Dependency Graph\n\n';
    depGraphContent += '> **Auto-generated** by docs-sync tool\n';
    depGraphContent += `> **Generated:** ${new Date().toISOString()}\n\n`;

    depGraphContent += '## Module Dependencies\n\n';

    for (const [file, deps] of metrics.dependencyGraph.entries()) {
      depGraphContent += `### ${file}\n\n`;
      if (deps.length > 0) {
        deps.forEach(dep => {
          depGraphContent += `- \`${dep}\`\n`;
        });
      } else {
        depGraphContent += '*No dependencies*\n';
      }
      depGraphContent += '\n';
    }

    // Circular dependencies
    if (metrics.circularDependencies.length > 0) {
      depGraphContent += '## ⚠️ Circular Dependencies\n\n';
      metrics.circularDependencies.forEach((cycle, i) => {
        depGraphContent += `### ${i + 1}. ${cycle[0]}\n\n`;
        depGraphContent += '```\n' + cycle.join(' → ') + ' → ' + cycle[0] + '\n```\n\n';
      });
    }

    if (!dryRun) {
      await import('fs').then(fs => {
        fs.writeFileSync(depGraphPath, depGraphContent, 'utf-8');
      });
      logger.success('Generated DEPENDENCY_GRAPH.md');
    } else {
      logger.dim('Would generate DEPENDENCY_GRAPH.md');
    }
  }

  // Summary
  logger.header('Summary');
  logger.data('Files analyzed:', metrics.summary.totalFiles);
  logger.data('Total lines:', metrics.summary.totalLines.toLocaleString());
  logger.data('Controllers:', metrics.summary.controllers);
  logger.data('Services:', metrics.summary.services);
  logger.data('Documentation updates:', Object.values(updateResults).filter(v => v).length);
  logger.data('Cache hits:', astAnalyzer.getCacheStats().size);

  if (metrics.circularDependencies.length > 0) {
    logger.warning(`Found ${metrics.circularDependencies.length} circular dependencies`);
  }

  // Commit changes if requested
  if (shouldCommit && !dryRun) {
    logger.section('Committing Changes');

    try {
      const { simpleGit } = await import('simple-git');
      const git = simpleGit();

      await git.add([
        'AGENT_CONTEXT.md',
        'ARCHITECTURE.md',
        'API.md',
        'SECURITY.md',
        'docs/DEPENDENCY_GRAPH.md',
      ]);

      await git.commit(config.git.commitMessage);

      logger.success('Committed documentation updates');
    } catch (error) {
      logger.error('Failed to commit', error.message);
      process.exit(1);
    }
  }

  logger.success('Documentation synchronization complete!');

  // Return exit code
  const successCount = Object.values(updateResults).filter(v => v).length;
  const totalCount = Object.keys(updateResults).length;

  if (successCount < totalCount) {
    process.exit(1);
  }

  process.exit(0);
}

// Run
main().catch(error => {
  logger.error('Fatal error', error);
  process.exit(1);
});
