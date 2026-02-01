/**
 * Metrics Updater - Updates documentation with code metrics
 * Updates status headers in AGENT_CONTEXT.md, ARCHITECTURE.md, etc.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import Logger from '../utils/logger.js';

export class MetricsUpdater {
  constructor(options = {}) {
    this.logger = options.logger || new Logger();
    this.projectRoot = options.projectRoot || process.cwd();
    this.dryRun = options.dryRun || false;
  }

  /**
   * Update CLAUDE.md status section
   * @param {object} metrics - AST analysis results
   * @param {string} version - Current version
   * @returns {boolean} Success
   */
  updateClaude(metrics, version) {
    const filepath = resolve(this.projectRoot, 'CLAUDE.md');
    this.logger.processing('Updating CLAUDE.md...');

    try {
      let content = readFileSync(filepath, 'utf-8');

      // Track if any actual content changes occur
      let hasChanges = false;

      // Update modular structure section (around line 73-92)
      const structurePattern = /├── controllers\/.*?# UI LAYER \(\d+ controllers\)/;
      const structureReplacement = `├── controllers/               # UI LAYER (${metrics.summary.controllers} controllers)`;
      if (
        structurePattern.test(content) &&
        !content.match(structurePattern)[0].includes(`(${metrics.summary.controllers} controllers)`)
      ) {
        hasChanges = true;
      }
      content = content.replace(structurePattern, structureReplacement);

      const servicesPattern = /├── services\/.*?# BUSINESS LOGIC \(\d+ services\)/;
      const servicesReplacement = `├── services/                  # BUSINESS LOGIC (${metrics.summary.services} services)`;
      if (
        servicesPattern.test(content) &&
        !content.match(servicesPattern)[0].includes(`(${metrics.summary.services} services)`)
      ) {
        hasChanges = true;
      }
      content = content.replace(servicesPattern, servicesReplacement);

      const utilsPattern = /├── utils\/.*?# SHARED UTILITIES \(\d+ utilities\)/;
      const utilsReplacement = `├── utils/                     # SHARED UTILITIES (${metrics.summary.utilities} utilities)`;
      if (
        utilsPattern.test(content) &&
        !content.match(utilsPattern)[0].includes(`(${metrics.summary.utilities} utilities)`)
      ) {
        hasChanges = true;
      }
      content = content.replace(utilsPattern, utilsReplacement);

      // Update Essential Documentation section (around line 113)
      const docPattern =
        /- \*\*\[AGENT_CONTEXT\.md\]\(AGENT_CONTEXT\.md\)\*\* - Complete technical architecture \(\d[\d,]*\+ lines\)/;
      const docReplacement = `- **[AGENT_CONTEXT.md](AGENT_CONTEXT.md)** - Complete technical architecture (${metrics.summary.totalLines.toLocaleString()}+ lines)`;
      if (
        docPattern.test(content) &&
        !content.includes(`(${metrics.summary.totalLines.toLocaleString()}+ lines)`)
      ) {
        hasChanges = true;
      }
      content = content.replace(docPattern, docReplacement);

      // Update Key Directories table (around line 102-110)
      const controllersDirPattern =
        /\| `js\/controllers\/` \| UI components \(\d+ controllers\) \|/;
      if (
        controllersDirPattern.test(content) &&
        !content
          .match(controllersDirPattern)[0]
          .includes(`(${metrics.summary.controllers} controllers)`)
      ) {
        hasChanges = true;
      }
      content = content.replace(
        controllersDirPattern,
        '| `js/controllers/` | UI components (' + metrics.summary.controllers + ' controllers) |'
      );

      const servicesDirPattern = /\| `js\/services\/` \| Business logic \(\d+ services\) \|/;
      if (
        servicesDirPattern.test(content) &&
        !content.match(servicesDirPattern)[0].includes(`(${metrics.summary.services} services)`)
      ) {
        hasChanges = true;
      }
      content = content.replace(
        servicesDirPattern,
        '| `js/services/` | Business logic (' + metrics.summary.services + ' services) |'
      );

      const utilsDirPattern = /\| `js\/utils\/` \| Shared utilities \(\d+ utilities\) \|/;
      if (
        utilsDirPattern.test(content) &&
        !content.match(utilsDirPattern)[0].includes(`(${metrics.summary.utilities} utilities)`)
      ) {
        hasChanges = true;
      }
      content = content.replace(
        utilsDirPattern,
        '| `js/utils/` | Shared utilities (' + metrics.summary.utilities + ' utilities) |'
      );

      // Only update last updated timestamp if actual content changed
      if (hasChanges) {
        content = content.replace(
          /\*\*Last Updated\*\*: [0-9-]+/,
          `**Last Updated**: ${new Date().toISOString().split('T')[0]}`
        );
      }

      if (!this.dryRun) {
        writeFileSync(filepath, content, 'utf-8');
      }

      this.logger.success(hasChanges ? 'Updated CLAUDE.md' : 'CLAUDE.md already up to date');
      return true;
    } catch (error) {
      this.logger.error('Failed to update CLAUDE.md', error.message);
      return false;
    }
  }

  /**
   * Update AGENT_CONTEXT.md status header
   * @param {object} metrics - AST analysis results
   * @param {string} version - Current version
   * @returns {boolean} Success
   */
  updateAgentContext(metrics, version) {
    const filepath = resolve(this.projectRoot, 'AGENT_CONTEXT.md');
    this.logger.processing('Updating AGENT_CONTEXT.md...');

    try {
      let content = readFileSync(filepath, 'utf-8');

      // Update status header (lines 3-9)
      // Match exactly the status header block: starts with "> **Status:**" and ends with "Security v2.0" line
      // This prevents accidentally capturing other lines that start with ">"
      const headerPattern =
        /> \*\*Status:\*\* v[0-9.]+.*[\s\S]*?Security v[0-9.]+\*: Enhanced validation, adaptive rate limiting, and protection\n>/;

      const newHeader = `> **Status:** ${version} Enhanced Architecture Complete — ${metrics.summary.totalFiles} Source Files
> - **${metrics.summary.controllers} Controllers**: Modular UI components for focused functionality
> - **${metrics.summary.services} Services**: Comprehensive business logic with enhanced error handling
> - **${metrics.summary.utilities} Utilities**: Enhanced reliability and performance utilities
> - **Advanced Error Handling**: Intelligent classification and recovery systems
> - **Enhanced Streaming**: Real-time message processing with proper buffering
> - **Security v2.0**: Enhanced validation, adaptive rate limiting, and protection
>`;

      // Check if content would actually change
      const oldContent = content;
      content = content.replace(headerPattern, newHeader);
      const hasChanges = content !== oldContent;

      if (hasChanges && !this.dryRun) {
        writeFileSync(filepath, content, 'utf-8');
      }

      this.logger.success(
        hasChanges ? 'Updated AGENT_CONTEXT.md' : 'AGENT_CONTEXT.md already up to date'
      );
      return true;
    } catch (error) {
      this.logger.error('Failed to update AGENT_CONTEXT.md', error.message);
      return false;
    }
  }

  /**
   * Update ARCHITECTURE.md version and timestamp
   * @param {string} version - Current version
   * @param {string} date - Current date (YYYY-MM-DD)
   * @returns {boolean} Success
   */
  updateArchitecture(version, date) {
    const filepath = resolve(this.projectRoot, 'ARCHITECTURE.md');
    this.logger.processing('Updating ARCHITECTURE.md...');

    try {
      let content = readFileSync(filepath, 'utf-8');

      // Update version line
      content = content.replace(
        /\*\*Version:\*\* [0-9.]+/,
        `**Version:** ${version.replace('v', '')}`
      );

      // Update last modified line
      content = content.replace(/\*\*Last Updated:\*\* [0-9-]+/, `**Last Updated:** ${date}`);

      if (!this.dryRun) {
        writeFileSync(filepath, content, 'utf-8');
      }

      this.logger.success('Updated ARCHITECTURE.md');
      return true;
    } catch (error) {
      this.logger.error('Failed to update ARCHITECTURE.md', error.message);
      return false;
    }
  }

  /**
   * Update API.md version and timestamp
   * @param {string} version - Current version
   * @param {string} date - Current date (YYYY-MM-DD)
   * @returns {boolean} Success
   */
  updateAPI(version, date) {
    const filepath = resolve(this.projectRoot, 'API.md');
    this.logger.processing('Updating API.md...');

    try {
      let content = readFileSync(filepath, 'utf-8');

      // Update footer metadata (usually at end of file)
      // Pattern for: **Last Updated:** YYYY-MM-DD
      content = content.replace(/\*\*Last Updated:\*\* [0-9-]+/, `**Last Updated:** ${date}`);

      // Pattern for: **API Version:** v*
      content = content.replace(/\*\*API Version:\*\* v[0-9.]+/, `**API Version:** ${version}`);

      if (!this.dryRun) {
        writeFileSync(filepath, content, 'utf-8');
      }

      this.logger.success('Updated API.md');
      return true;
    } catch (error) {
      this.logger.error('Failed to update API.md', error.message);
      return false;
    }
  }

  /**
   * Update SECURITY.md version and timestamp
   * @param {string} version - Security version (can be different from app version)
   * @param {string} date - Current date (YYYY-MM-DD)
   * @returns {boolean} Success
   */
  updateSecurity(version, date) {
    const filepath = resolve(this.projectRoot, 'SECURITY.md');
    this.logger.processing('Updating SECURITY.md...');

    try {
      let content = readFileSync(filepath, 'utf-8');

      // Update version line
      content = content.replace(
        /\*\*Version:\*\* [0-9.]+/,
        `**Version:** ${version.replace('v', '')}`
      );

      // Update last modified line
      content = content.replace(/\*\*Last Updated:\*\* [0-9-]+/, `**Last Updated:** ${date}`);

      if (!this.dryRun) {
        writeFileSync(filepath, content, 'utf-8');
      }

      this.logger.success('Updated SECURITY.md');
      return true;
    } catch (error) {
      this.logger.error('Failed to update SECURITY.md', error.message);
      return false;
    }
  }

  /**
   * Update all metric files
   * @param {object} metrics - AST analysis results
   * @param {object} gitData - Git analysis results
   * @returns {object} Update results
   */
  updateAll(metrics, gitData) {
    this.logger.header('Updating Documentation Metrics');

    const version = gitData.currentVersion || 'v1.0';
    const date = new Date().toISOString().split('T')[0];

    const results = {
      claude: this.updateClaude(metrics, version),
      agentContext: this.updateAgentContext(metrics, version),
      architecture: this.updateArchitecture(version, date),
      api: this.updateAPI(version, date),
      security: this.updateSecurity(version, date),
    };

    const successCount = Object.values(results).filter(v => v).length;
    const totalCount = Object.keys(results).length;

    this.logger.section('Update Results');
    this.logger.data('CLAUDE.md:', results.claude ? '✓' : '✗');
    this.logger.data('AGENT_CONTEXT.md:', results.agentContext ? '✓' : '✗');
    this.logger.data('ARCHITECTURE.md:', results.architecture ? '✓' : '✗');
    this.logger.data('API.md:', results.api ? '✓' : '✗');
    this.logger.data('SECURITY.md:', results.security ? '✓' : '✗');
    this.logger.info(`Updated ${successCount}/${totalCount} files`);

    return results;
  }

  /**
   * Check if files need updates
   * @param {object} metrics - AST analysis results
   * @param {object} gitData - Git analysis results
   * @returns {Promise<boolean>} True if updates needed
   */
  async needsUpdate(metrics, gitData) {
    const version = gitData.currentVersion || 'v1.0';

    // Check AGENT_CONTEXT.md for actual metric changes
    const agentContextPath = resolve(this.projectRoot, 'AGENT_CONTEXT.md');
    try {
      const content = readFileSync(agentContextPath, 'utf-8');
      const match = content.match(/Status:\*\* v[0-9.]+.*— (\d+) Source Files/);

      if (match) {
        const currentFileCount = parseInt(match[1], 10);
        if (currentFileCount !== metrics.summary.totalFiles) {
          return true; // File count changed - needs update
        }
      }

      // Check for version match (only if version changed)
      if (!content.includes(`Status:** ${version}`)) {
        return true; // Version changed - needs update
      }

      // Check controller count
      const controllerMatch = content.match(/\* \*\*(\d+) Controllers\*\*:/);
      if (controllerMatch) {
        const currentControllers = parseInt(controllerMatch[1], 10);
        if (currentControllers !== metrics.summary.controllers) {
          return true; // Controller count changed - needs update
        }
      }

      // Check service count
      const serviceMatch = content.match(/\* \*\*(\d+) Services\*\*:/);
      if (serviceMatch) {
        const currentServices = parseInt(serviceMatch[1], 10);
        if (currentServices !== metrics.summary.services) {
          return true; // Service count changed - needs update
        }
      }
    } catch (error) {
      return true; // File doesn't exist or can't be read - needs update
    }

    // Check CLAUDE.md for metric changes (not just date)
    const claudePath = resolve(this.projectRoot, 'CLAUDE.md');
    try {
      const content = readFileSync(claudePath, 'utf-8');

      // Check controller count in tree structure
      const controllerTreeMatch = content.match(/controllers\/.*?# UI LAYER \((\d+) controllers\)/);
      if (controllerTreeMatch) {
        const currentControllers = parseInt(controllerTreeMatch[1], 10);
        if (currentControllers !== metrics.summary.controllers) {
          return true;
        }
      }

      // Check service count in tree structure
      const serviceTreeMatch = content.match(/services\/.*?# BUSINESS LOGIC \((\d+) services\)/);
      if (serviceTreeMatch) {
        const currentServices = parseInt(serviceTreeMatch[1], 10);
        if (currentServices !== metrics.summary.services) {
          return true;
        }
      }

      // Check utility count in tree structure
      const utilTreeMatch = content.match(/utils\/.*?# SHARED UTILITIES \((\d+) utilities\)/);
      if (utilTreeMatch) {
        const currentUtils = parseInt(utilTreeMatch[1], 10);
        if (currentUtils !== metrics.summary.utilities) {
          return true;
        }
      }
    } catch (error) {
      return true; // File doesn't exist or can't be read - needs update
    }

    // All metrics match - no update needed
    return false;
  }
}

export default MetricsUpdater;
