#!/usr/bin/env node

/**
 * Documentation Watch Daemon
 * Monitors JavaScript files for changes and auto-updates documentation
 */

import { resolve } from 'path';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
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
const verbose = args.includes('--verbose') || args.includes('-v');
const autoCommit = args.includes('--commit');
const debounceMs = parseInt(args.find(arg => arg.startsWith('--debounce='))?.split('=')[1]) || config.debounceMs || 500;

const logger = new Logger({ verbose });

// State
let cache = new ASTCache();
let pendingChanges = new Set();
let debounceTimer = null;
let isProcessing = false;

/**
 * Process pending file changes
 */
async function processChanges() {
  if (isProcessing || pendingChanges.size === 0) {
    return;
  }

  isProcessing = true;

  try {
    logger.header('Processing File Changes');
    logger.info(`Changed files: ${pendingChanges.size}`);

    // Phase 1: AST Analysis (only changed files)
    logger.section('Phase 1: Analyzing Changed Files');

    const astAnalyzer = new ASTAnalyzer({
      projectRoot,
      logger,
      cache,
      excludePaths: config.excludePaths || [],
    });

    // Invalidate cache for changed files
    for (const filepath of pendingChanges) {
      cache.invalidate(filepath);
    }

    // Analyze all files (with caching, unchanged files will be fast)
    const metrics = await astAnalyzer.analyzeAll(config.watchPaths || ['js/**/*.js']);

    if (metrics.errors.length > 0) {
      logger.warning(`Failed to parse ${metrics.errors.length} files`);
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
      dryRun: false,
    });

    const updateResults = metricsUpdater.updateAll(metrics, gitData);

    // Phase 4: Generate Dependency Graph
    if (metrics.dependencyGraph.size > 0) {
      logger.section('Phase 4: Generating Dependency Graph');

      const depGraphPath = resolve(projectRoot, 'docs/DEPENDENCY_GRAPH.md');
      let depGraphContent = '# Dependency Graph\n\n';
      depGraphContent += '> **Auto-generated** by docs-sync watch daemon\n';
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

      if (metrics.circularDependencies.length > 0) {
        depGraphContent += '## ⚠️ Circular Dependencies\n\n';
        metrics.circularDependencies.forEach((cycle, i) => {
          depGraphContent += `### ${i + 1}. ${cycle[0]}\n\n`;
          depGraphContent += '```\n' + cycle.join(' → ') + ' → ' + cycle[0] + '\n```\n\n';
        });
      }

      await import('fs').then(fs => {
        fs.writeFileSync(depGraphPath, depGraphContent, 'utf-8');
      });
      logger.success('Generated DEPENDENCY_GRAPH.md');
    }

    // Summary
    logger.header('Update Complete');
    logger.data('Files changed:', pendingChanges.size);
    logger.data('Total files:', metrics.summary.totalFiles);
    logger.data('Documentation updates:', Object.values(updateResults).filter(v => v).length);

    // Commit changes if requested
    if (autoCommit) {
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
      }
    }

    // Clear pending changes
    pendingChanges.clear();
  } catch (error) {
    logger.error('Processing failed', error.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Handle file change event
 */
function handleChange(filepath) {
  logger.dim(`Changed: ${filepath}`);
  pendingChanges.add(filepath);

  // Debounce
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    processChanges();
  }, debounceMs);
}

/**
 * Start watch daemon
 */
function startWatch() {
  logger.header('Documentation Watch Daemon');
  logger.info('Watching for file changes...');
  logger.data('Paths:', config.watchPaths.join(', '));
  logger.data('Debounce:', `${debounceMs}ms`);
  logger.data('Auto-commit:', autoCommit ? 'Yes' : 'No');
  logger.info('Press Ctrl+C to stop\n');

  // Initial sync
  logger.section('Initial Synchronization');
  processChanges().then(() => {
    logger.section('Watching for Changes...\n');

    // Start watching
    const watchPaths = config.watchPaths || ['js/**/*.js'];
    const watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    watcher
      .on('change', (filepath) => {
        handleChange(filepath);
      })
      .on('add', (filepath) => {
        logger.dim(`Added: ${filepath}`);
        handleChange(filepath);
      })
      .on('unlink', (filepath) => {
        logger.dim(`Removed: ${filepath}`);
        handleChange(filepath);
      })
      .on('error', (error) => {
        logger.error('Watcher error', error.message);
      });

    // Handle shutdown
    process.on('SIGINT', () => {
      logger.info('\nStopping watch daemon...');
      watcher.close();
      process.exit(0);
    });
  });
}

// Run
startWatch();
