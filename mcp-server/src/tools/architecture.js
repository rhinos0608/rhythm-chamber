/**
 * MCP Tool: search_architecture
 * Search codebase based on HNW architecture patterns
 * ENHANCED: Now integrates semantic search for conceptual pattern matching
 */

import { resolve, relative } from 'path';
import { existsSync } from 'fs';
import { HNWAnalyzer } from '../analyzers/hnw-analyzer.js';
import { FileScanner } from '../utils/file-scanner.js';
import { logger } from '../utils/logger.js';

/**
 * Validate and sanitize file path extracted from chunk ID
 * Prevents path traversal attacks
 */
function validateChunkFilePath(filePath, projectRoot) {
  // CRITICAL FIX #1: Prevent path traversal attacks
  // Reject paths with directory traversal sequences
  if (filePath.includes('..') || filePath.includes('\\..') || filePath.includes('./..')) {
    logger.warn(`[validateChunkFilePath] Rejected path traversal attempt`);
    return null;
  }

  // Reject absolute paths (should be relative to project root)
  if (filePath.startsWith('/')) {
    logger.warn(`[validateChunkFilePath] Rejected absolute path`);
    return null;
  }

  // Reject null bytes (potential security issue)
  if (filePath.includes('\0')) {
    logger.warn(`[validateChunkFilePath] Rejected path with null byte`);
    return null;
  }

  // Resolve to absolute path and verify it's within project root
  const fullPath = resolve(projectRoot, filePath);
  const resolvedPath = relative(projectRoot, fullPath);

  // Check if the resolved path escaped the project root
  if (resolvedPath.startsWith('..')) {
    logger.warn(`[validateChunkFilePath] Rejected path escaping project root`);
    return null;
  }

  return fullPath;
}

let fileScanner = null;
let analyzerCache = null;

export const schema = {
  name: 'search_architecture',
  description: 'Search the codebase based on HNW architecture patterns and constraints. Enhanced with semantic search for conceptual pattern matching.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description:
          'Architecture pattern to search for (e.g., "EventBus usage", "HNW violation", "Service dependency")',
      },
      layer: {
        type: 'string',
        enum: ['controllers', 'services', 'utils', 'storage', 'providers', 'all'],
        default: 'all',
        description: 'Specific architectural layer to search within',
      },
      complianceCheck: {
        type: 'boolean',
        default: false,
        description: 'Perform strict HNW compliance validation on results',
      },
      maxResults: {
        type: 'number',
        default: 50,
        description: 'Maximum number of results to return (1-200)',
      },
      useSemanticSearch: {
        type: 'boolean',
        default: true,
        description: 'Use semantic search to find conceptual pattern matches (requires semantic indexer)',
      },
      semanticThreshold: {
        type: 'number',
        default: 0.4,
        description: 'Minimum similarity threshold for semantic matches (0-1)',
      },
    },
    required: ['pattern'],
  },
};

export const handler = async (args, projectRoot, indexer, server) => {
  const {
    pattern,
    layer = 'all',
    complianceCheck = false,
    maxResults = 50,
    useSemanticSearch = true,
    semanticThreshold = 0.4
  } = args;

  // Initialize file scanner and analyzer
  if (!fileScanner || fileScanner.projectRoot !== projectRoot) {
    fileScanner = new FileScanner(projectRoot);
  }
  if (!analyzerCache || analyzerCache.projectRoot !== projectRoot) {
    analyzerCache = new HNWAnalyzer(projectRoot);
  }

  logger.info('search_architecture called with:', {
    pattern,
    layer,
    complianceCheck,
    maxResults,
    useSemanticSearch,
    semanticThreshold,
  });

  // Validate inputs
  if (maxResults < 1 || maxResults > 200) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: maxResults must be between 1 and 200',
        },
      ],
      isError: true,
    };
  }

  try {
    let results;
    let semanticResults = null;

    // Use semantic search if available and enabled
    if (useSemanticSearch && indexer) {
      const indexingStatus = server?.getIndexingStatus ? server.getIndexingStatus() : { status: 'unknown' };

      if (indexingStatus.status === 'ready' && indexingStatus.stats?.vectorStore?.chunkCount > 0) {
        logger.info('Using semantic search for pattern matching');

        // Build semantic query from pattern
        const semanticQuery = buildSemanticQuery(pattern, layer);

        // Search using semantic search
        const semanticMatches = await indexer.vectorStore.search(
          semanticQuery,
          maxResults * 2, // Get more results, then filter
          semanticThreshold
        );

        // Convert semantic results to architecture results
        semanticResults = processSemanticResults(semanticMatches, layer, complianceCheck, analyzerCache, fileScanner, projectRoot);
        logger.info(`Semantic search found ${semanticResults.matches.length} matches`);
      } else {
        logger.info('Semantic search not ready, falling back to pattern matching');
      }
    }

    // Perform traditional pattern-based search
    results = await searchArchitecture(
      projectRoot,
      pattern,
      layer,
      complianceCheck,
      maxResults
    );

    // Merge semantic results if available
    if (semanticResults && semanticResults.matches.length > 0) {
      results = mergeResults(results, semanticResults, maxResults);
      results.searchMethod = 'hybrid (semantic + pattern)';
    } else {
      results.searchMethod = useSemanticSearch ? 'pattern (semantic unavailable)' : 'pattern-only';
    }

    // Format results
    const output = formatSearchResults(results, pattern, layer, complianceCheck);

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error) {
    logger.error('Error in search_architecture:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error searching architecture: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
};

/**
 * Search architecture patterns across the codebase
 */
async function searchArchitecture(projectRoot, pattern, layer, complianceCheck, maxResults) {
  const results = {
    pattern,
    matches: [],
    summary: {
      totalFiles: 0,
      matchedFiles: 0,
      totalViolations: 0,
      layers: {},
    },
  };

  // Get all JavaScript files
  const jsFiles = await fileScanner.findJsFiles({
    includeTests: false,
    includeNodeModules: false,
    includeDist: false,
  });

  results.summary.totalFiles = jsFiles.length;

  // Process each file
  for (const filePath of jsFiles) {
    const relativePath = fileScanner.getRelativePath(filePath);
    const fileLayer = fileScanner.getFileLayer(filePath);

    // Update layer counts
    results.summary.layers[fileLayer] = (results.summary.layers[fileLayer] || 0) + 1;

    // Filter by layer if specified
    if (layer !== 'all' && fileLayer !== layer) {
      continue;
    }

    try {
      // Analyze file
      const analysis = analyzerCache.analyzeFile(filePath);

      // Check for pattern matches
      const match = checkPatternMatch(analysis, pattern, relativePath, fileLayer);

      if (match) {
        // Filter by compliance if requested
        if (complianceCheck && analysis.compliance.score < 50) {
          continue;
        }

        results.matches.push({
          file: relativePath,
          layer: fileLayer,
          compliance: analysis.compliance,
          pattern: match,
        });

        results.summary.matchedFiles++;
        results.summary.totalViolations += analysis.compliance.violations.length;

        // Stop if we've reached max results
        if (results.matches.length >= maxResults) {
          break;
        }
      }
    } catch (error) {
      logger.warn(`Failed to analyze ${relativePath}:`, error.message);
    }
  }

  // Sort matches by relevance (compliance score, then violations)
  results.matches.sort((a, b) => {
    // First sort by compliance score (lower = more violations)
    if (complianceCheck) {
      return a.compliance.score - b.compliance.score;
    }
    // Otherwise sort by number of violations
    return b.compliance.violations.length - a.compliance.violations.length;
  });

  return results;
}

/**
 * Check if file matches the search pattern
 */
function checkPatternMatch(analysis, pattern, filePath, layer) {
  const patternLower = pattern.toLowerCase();
  const match = {
    type: null,
    details: [],
    score: 0,
  };

  // Check for EventBus-related patterns
  if (patternLower.includes('eventbus') || patternLower.includes('event bus')) {
    for (const imp of analysis.imports) {
      // Skip if import is undefined/null
      if (!imp || typeof imp !== 'string') {
        continue;
      }
      if (imp.includes('event-bus')) {
        match.type = 'EventBus Usage';
        match.details.push(`Imports EventBus from ${imp}`);
        match.score += 10;
      }
    }
  }

  // Check for HNW violations
  if (
    patternLower.includes('hnw') ||
    patternLower.includes('violation') ||
    patternLower.includes('compliance')
  ) {
    if (analysis.compliance.violations.length > 0) {
      match.type = match.type || 'HNW Violations';
      match.details.push(`${analysis.compliance.violations.length} violations found`);
      match.score += analysis.compliance.violations.length * 5;

      for (const violation of analysis.compliance.violations) {
        match.details.push(`- ${violation.rule}: ${violation.message}`);
      }
    }
  }

  // Check for Service dependencies
  if (patternLower.includes('service') || patternLower.includes('dependency')) {
    for (const imp of analysis.imports) {
      // Skip if import is undefined/null
      if (!imp || typeof imp !== 'string') {
        continue;
      }
      if (imp.includes('/services/')) {
        match.type = match.type || 'Service Dependencies';
        const serviceName = imp.split('/').pop().replace('.js', '');
        match.details.push(`Depends on service: ${serviceName}`);
        match.score += 5;
      }
    }
  }

  // Check for Provider dependencies (potential HNW violation)
  if (patternLower.includes('provider') || patternLower.includes('bypass')) {
    for (const imp of analysis.imports) {
      // Skip if import is undefined/null
      if (!imp || typeof imp !== 'string') {
        continue;
      }
      if (imp.includes('/providers/')) {
        match.type = match.type || 'Provider Dependencies';
        const providerName = imp.split('/').pop().replace('.js', '');
        match.details.push(`Direct provider usage: ${providerName}`);
        match.score += 10;
      }
    }
  }

  // Check for Controller patterns
  if (patternLower.includes('controller')) {
    if (layer === 'controllers') {
      match.type = 'Controller Module';
      match.details.push(`${analysis.exports.named} named exports`);
      match.score += 5;
    }
  }

  // Check for circular dependency indicators
  if (patternLower.includes('circular') || patternLower.includes('cycle')) {
    // Look for patterns that might indicate circular dependencies
    for (const imp of analysis.imports) {
      // Skip if import is undefined/null
      if (!imp || typeof imp !== 'string') {
        continue;
      }
      const importName = imp.split('/').pop().replace('.js', '');
      if (filePath.toLowerCase().includes(importName.toLowerCase())) {
        match.type = match.type || 'Potential Circular Dependency';
        match.details.push(`Imports module with similar name: ${importName}`);
        match.score += 15;
      }
    }
  }

  // Generic text search in imports/exports
  if (match.score === 0) {
    for (const imp of analysis.imports) {
      // Skip if import is undefined/null
      if (!imp || typeof imp !== 'string') {
        continue;
      }
      if (imp.toLowerCase().includes(patternLower)) {
        match.type = 'Import Match';
        match.details.push(`Import matches: ${imp}`);
        match.score += 5;
      }
    }

    if (analysis.exports.details.named) {
      for (const exp of analysis.exports.details.named) {
        if (exp.name && exp.name.toLowerCase && exp.name.toLowerCase().includes(patternLower)) {
          match.type = match.type || 'Export Match';
          match.details.push(`Export matches: ${exp.name}`);
          match.score += 5;
        }
      }
    }
  }

  // Return match if we found anything
  return match.score > 0 ? match : null;
}

/**
 * Format search results
 */
function formatSearchResults(results, pattern, layer, complianceCheck) {
  const lines = [];

  lines.push('# Architecture Pattern Search');
  lines.push('');
  lines.push(`**Search Pattern**: ${pattern}`);
  lines.push(`**Layer Filter**: ${layer === 'all' ? 'None' : layer}`);
  lines.push(`**Compliance Filter**: ${complianceCheck ? 'Yes (score ≥ 50)' : 'No'}`);
  lines.push(`**Files Scanned**: ${results.summary.totalFiles}`);
  lines.push(`**Matches Found**: ${results.matches.length}`);
  lines.push('');

  // Layer distribution
  if (Object.keys(results.summary.layers).length > 0) {
    lines.push('## Files by Layer');
    lines.push('');
    for (const [layerName, count] of Object.entries(results.summary.layers)) {
      lines.push(`- **${layerName}**: ${count} files`);
    }
    lines.push('');
  }

  // Results
  if (results.matches.length === 0) {
    lines.push('## No Matches Found');
    lines.push('');
    lines.push('No files matched your search criteria. Try:');
    lines.push('- Using a broader search pattern');
    lines.push('- Removing the layer filter');
    lines.push('- Disabling compliance filter');
  } else {
    lines.push(`## Top ${Math.min(results.matches.length, 20)} Results`);
    lines.push('');

    for (let i = 0; i < Math.min(results.matches.length, 20); i++) {
      const match = results.matches[i];
      lines.push(`### ${i + 1}. ${match.file}`);
      lines.push('');
      lines.push(`- **Layer**: ${match.layer}`);
      lines.push(`- **HNW Compliance**: ${match.compliance.score}/100`);
      lines.push(`- **Match Type**: ${match.pattern.type}`);

      if (match.pattern.details.length > 0) {
        lines.push(`- **Details**:`);
        for (const detail of match.pattern.details) {
          lines.push(`  - ${detail}`);
        }
      }

      if (match.compliance.violations.length > 0) {
        lines.push(`- **Violations** (${match.compliance.violations.length}):`);
        for (const violation of match.compliance.violations) {
          const icon = violation.severity === 'error' ? '❌' : '⚠️';
          lines.push(`  - ${icon} ${violation.rule}: ${violation.message}`);
        }
      }

      lines.push('');
    }

    if (results.matches.length > 20) {
      lines.push(`*... and ${results.matches.length - 20} more results*`);
      lines.push('');
    }
  }

  // Recommendations
  lines.push('## Recommendations');
  lines.push('');

  const criticalViolations = results.matches.filter((m) => m.compliance.score < 50);
  if (criticalViolations.length > 0) {
    lines.push(`### Critical Issues Found (${criticalViolations.length} files)`);
    lines.push('');
    lines.push('The following files have critical HNW compliance issues:');
    for (const match of criticalViolations.slice(0, 10)) {
      lines.push(`- **${match.file}** (${match.compliance.score}/100)`);
    }
    lines.push('');
    lines.push('**Action Required**: Review these files for architecture violations.');
    lines.push('');
  }

  // Pattern-specific recommendations
  const patternLower = pattern.toLowerCase();
  if (patternLower.includes('provider') && results.matches.length > 0) {
    lines.push('### Provider Usage Detected');
    lines.push('');
    lines.push('Direct Provider usage may indicate HNW violations:');
    lines.push('- Controllers should not import Providers directly');
    lines.push('- Use Services as the abstraction layer');
    lines.push('- Ensure proper hierarchy: Controller → Service → Provider');
    lines.push('');
  }

  if (patternLower.includes('circular') && results.matches.length > 0) {
    lines.push('### Potential Circular Dependencies');
    lines.push('');
    lines.push('Circular dependencies can cause:');
    lines.push('- Module initialization failures');
    lines.push('- Runtime errors during loading');
    lines.push('- Difficult-to-debug behavior');
    lines.push('');
    lines.push('**Recommended Actions**:');
    lines.push('- Review the identified files');
    lines.push('- Extract shared functionality into separate modules');
    lines.push('- Use dependency injection to break cycles');
    lines.push('');
  }

  if (patternLower.includes('eventbus')) {
    lines.push('### EventBus Usage Patterns');
    lines.push('');
    lines.push('EventBus is the preferred way to handle cross-module communication:');
    lines.push('✅ Use EventBus for loose coupling');
    lines.push('✅ Implement domain filtering for event handlers');
    lines.push('✅ Use priority dispatch for important events');
    lines.push('❌ Avoid direct module-to-module dependencies when possible');
    lines.push('');
  }

  // Add search method indicator
  if (results.searchMethod) {
    lines.push('## Search Method');
    lines.push('');
    lines.push(`**Method**: ${results.searchMethod}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build a semantic search query from the architecture pattern
 */
function buildSemanticQuery(pattern, layer) {
  const queries = {
    'eventbus': 'EventBus cross-module communication event-driven loose coupling',
    'event bus': 'EventBus cross-module communication event-driven loose coupling',
    'hnw': 'HNW architecture hierarchy network wave compliance violation',
    'violation': 'architecture violation layer bypass dependency rule',
    'compliance': 'HNW architecture compliance score validation check',
    'service': 'service layer dependency injection business logic',
    'provider': 'provider abstraction data source external api',
    'dependency': 'import dependency module coupling circular',
    'circular': 'circular dependency cycle import mutual reference',
    'controller': 'controller layer UI interaction event handling',
    'hierarchy': 'hierarchical layer architecture controller service provider',
    'network': 'network event bus communication loose coupling',
    'wave': 'wave tab coordination cross-tab primary authority',
  };

  // Find matching key or construct query from pattern
  const patternLower = pattern.toLowerCase();

  for (const [key, query] of Object.entries(queries)) {
    if (patternLower.includes(key)) {
      if (layer !== 'all') {
        return `${query} ${layer} layer`;
      }
      return query;
    }
  }

  // Default: use the pattern directly with layer context
  const baseQuery = pattern.includes(' ') ? pattern : `${pattern} architecture pattern`;
  return layer !== 'all' ? `${baseQuery} ${layer} layer` : baseQuery;
}

/**
 * Process semantic search results into architecture results format
 */
function processSemanticResults(semanticMatches, layer, complianceCheck, analyzerCache, fileScanner, projectRoot) {
  const results = {
    pattern: 'semantic',
    matches: [],
    summary: {
      totalFiles: 0,
      matchedFiles: 0,
      totalViolations: 0,
      layers: {},
    },
  };

  // Track processed files to avoid duplicates
  const processedFiles = new Set();

  for (const match of semanticMatches) {
    const chunkId = match.chunkId || match.id;
    if (!chunkId) continue;

    // Extract file path from chunk ID
    const filePath = chunkId.split('_L')[0].replace(/_/g, '/');

    // CRITICAL FIX #1: Validate the extracted path to prevent path traversal
    const fullPath = validateChunkFilePath(filePath, projectRoot);
    if (!fullPath) {
      continue; // Skip invalid paths
    }

    if (processedFiles.has(filePath)) continue;
    processedFiles.add(filePath);

    if (!existsSync(fullPath)) continue;

    // CRITICAL FIX #5: Add null safety for file operations
    let fileLayer = 'unknown';
    try {
      fileLayer = fileScanner.getFileLayer(fullPath);
    } catch (error) {
      logger.warn(`[processSemanticResults] Failed to get layer: ${error.message}`);
      continue;
    }

    // Filter by layer if specified
    if (layer !== 'all' && fileLayer !== layer) {
      continue;
    }

    try {
      // Analyze file for HNW compliance
      const analysis = analyzerCache.analyzeFile(fullPath);

      // Filter by compliance if requested
      if (complianceCheck && analysis.compliance.score < 50) {
        continue;
      }

      // CRITICAL FIX #6: Add null checks for metadata access
      const matchInfo = match.metadata?.exported || match.chunkType || 'code chunk';

      results.matches.push({
        file: filePath,
        layer: fileLayer,
        compliance: analysis.compliance,
        pattern: {
          type: 'Semantic Match',
          details: [
            `Semantic similarity: ${((match.similarity || 0) * 100).toFixed(0)}%`,
            `Match: ${matchInfo}`,
          ],
          score: Math.round((match.similarity || 0) * 100),
          similarity: match.similarity || 0,
        },
      });

      results.summary.matchedFiles++;
      results.summary.totalViolations += analysis.compliance.violations.length;
      results.summary.layers[fileLayer] = (results.summary.layers[fileLayer] || 0) + 1;

      // Stop if we've reached max results
      if (results.matches.length >= 50) {
        break;
      }
    } catch (error) {
      // CRITICAL FIX #4: Sanitize error messages - don't expose internal paths
      logger.warn(`Failed to analyze file: ${error.message}`);
    }
  }

  return results;
}

/**
 * Merge pattern and semantic results, removing duplicates
 */
function mergeResults(patternResults, semanticResults, maxResults) {
  const merged = {
    ...patternResults,
    matches: [],
  };

  // Track files we've already added
  const seenFiles = new Set();

  // Add pattern results first (higher priority for exact matches)
  for (const match of patternResults.matches) {
    if (!seenFiles.has(match.file)) {
      seenFiles.add(match.file);
      merged.matches.push(match);
    }
  }

  // Add semantic results that weren't in pattern results
  for (const match of semanticResults.matches) {
    if (!seenFiles.has(match.file) && merged.matches.length < maxResults) {
      seenFiles.add(match.file);
      merged.matches.push(match);
    }
  }

  // Trim to maxResults
  merged.matches = merged.matches.slice(0, maxResults);

  return merged;
}
