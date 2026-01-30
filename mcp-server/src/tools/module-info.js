/**
 * MCP Tool: get_module_info
 * Get comprehensive metadata about a module
 */

import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { HNWAnalyzer } from '../analyzers/hnw-analyzer.js';
import { CacheManager } from '../cache/cache-manager.js';
import { logger } from '../utils/logger.js';

const cache = new CacheManager();

/**
 * Tool schema definition (pure MCP schema - no handler)
 */
export const schema = {
  name: 'get_module_info',
  description:
    'Get detailed metadata about a module including exports, imports, dependencies, and architecture role',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description:
          'Relative path to the module file (e.g., "js/controllers/chat-ui-controller.js")',
      },
      includeDependencies: {
        type: 'boolean',
        default: true,
        description: 'Include detailed dependency information',
      },
      includeExports: {
        type: 'boolean',
        default: true,
        description: 'Include all exported members and their types',
      },
    },
    required: ['filePath'],
  },
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot) => {
  const { filePath, includeDependencies = true, includeExports = true } = args;

  logger.info('get_module_info called with:', { filePath, includeDependencies, includeExports });

  // Resolve file path
  const absolutePath = resolve(projectRoot, filePath);

  // Check if file exists
  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Check cache
  const cacheKey = cache.generateKey(absolutePath, { includeDependencies, includeExports });
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info('Returning cached result for:', filePath);
    return cached;
  }

  // Analyze file
  const analyzer = new HNWAnalyzer(projectRoot);
  const analysis = analyzer.analyzeFile(absolutePath);

  // Build response
  const result = {
    content: [
      {
        type: 'text',
        text: formatModuleInfo(analysis, includeDependencies, includeExports),
      },
    ],
  };

  // Cache result
  cache.set(cacheKey, result);

  return result;
};

/**
 * Format module information for display
 */
function formatModuleInfo(analysis, includeDependencies, includeExports) {
  const lines = [];

  lines.push(`# Module Information: ${analysis.filePath}`);
  lines.push('');
  lines.push(`**Layer**: ${analysis.layer}`);
  lines.push(`**HNW Compliance Score**: ${analysis.compliance.score}/100`);
  lines.push(`**Compliant**: ${analysis.compliance.compliant ? '✅ Yes' : '❌ No'}`);
  lines.push('');

  // Imports
  if (includeDependencies && analysis.imports.length > 0) {
    lines.push('## Imports');
    lines.push('');
    for (const imp of analysis.imports) {
      lines.push(`- \`${imp}\``);
    }
    lines.push('');
  }

  // Exports
  if (includeExports) {
    lines.push('## Exports');
    lines.push('');
    lines.push(`**Named Exports**: ${analysis.exports.named}`);
    lines.push(`**Default Export**: ${analysis.exports.default > 0 ? 'Yes' : 'No'}`);
    lines.push('');

    if (analysis.exports.details.named.length > 0) {
      lines.push('### Named Exports');
      for (const exp of analysis.exports.details.named) {
        lines.push(`- \`${exp.name}\` (${exp.type})`);
      }
      lines.push('');
    }

    if (analysis.exports.details.default) {
      lines.push('### Default Export');
      lines.push(
        `- \`${analysis.exports.details.default.name}\` (${analysis.exports.details.default.type})`
      );
      lines.push('');
    }
  }

  // Compliance Issues
  if (analysis.compliance.violations.length > 0) {
    lines.push('## HNW Architecture Issues');
    lines.push('');

    for (const violation of analysis.compliance.violations) {
      const icon = violation.severity === 'error' ? '❌' : '⚠️';
      lines.push(`${icon} **${violation.rule}**: ${violation.message}`);

      if (violation.import) {
        lines.push(`   - Import: \`${violation.import}\``);
      }

      if (violation.recommendation) {
        lines.push(`   - 💡 ${violation.recommendation}`);
      }

      lines.push('');
    }
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    for (const rec of analysis.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  // HNW Pattern Reference
  lines.push('## HNW Architecture Reference');
  lines.push('');
  lines.push('**Hierarchy**: Controllers → Services → Providers');
  lines.push('- ✅ Controllers call Services, not Providers directly');
  lines.push('- ✅ Services use Provider abstraction layer');
  lines.push('- ✅ No circular dependencies');
  lines.push('');
  lines.push('**Network**: Use EventBus for cross-module communication');
  lines.push('- ✅ Event-driven, loosely coupled');
  lines.push('- ✅ Domain filtering for event handlers');
  lines.push('');
  lines.push('**Wave**: TabCoordinator handles cross-tab coordination');
  lines.push('- ✅ Check primary tab status before writes');
  lines.push('- ✅ Use write-ahead log for crash recovery');

  return lines.join('\n');
}
