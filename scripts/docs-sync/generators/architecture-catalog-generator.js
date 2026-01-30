/**
 * Architecture Catalog Generator
 * Generates detailed architecture breakdowns for controllers, services, and utilities
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import Logger from '../utils/logger.js';

export class ArchitectureCatalogGenerator {
  constructor(options = {}) {
    this.logger = options.logger || new Logger();
    this.projectRoot = options.projectRoot || process.cwd();
    this.dryRun = options.dryRun || false;
  }

  /**
   * Extract module name from file path
   * @param {string} filepath - File path
   * @returns {string} Module name
   */
  extractModuleName(filepath) {
    const name = basename(filepath, '.js');
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generate controller catalog
   * @param {object} metrics - AST analysis results
   * @returns {boolean} Success
   */
  generateControllerCatalog(metrics) {
    const filepath = resolve(this.projectRoot, 'docs/CONTROLLER_CATALOG.md');
    this.logger.processing('Generating CONTROLLER_CATALOG.md...');

    try {
      // Ensure docs directory exists
      const docsDir = dirname(filepath);
      if (!this.dryRun && !existsSync(docsDir)) {
        mkdirSync(docsDir, { recursive: true });
      }

      // Get controllers from metrics.files (object with filepath keys)
      const controllers = Object.entries(metrics.files)
        .filter(([_, data]) => data.filepath && data.filepath.startsWith('js/controllers/'))
        .map(([path, data]) => ({ path, ...data }))
        .sort((a, b) => a.filepath.localeCompare(b.filepath));

      const generatedDate = new Date().toISOString().split('T')[0];
      let content = '# Controller Catalog\n\n';
      content += '> **Auto-generated** by docs-sync tool\n';
      content += `> **Generated:** ${generatedDate}\n`;
      content += `> **Total Controllers:** ${controllers.length}\n\n`;
      content += 'This catalog provides detailed information about all UI controllers in the application.\n\n';
      content += '## Overview\n\n';
      content += 'Controllers manage UI components and user interactions. Each controller is responsible for a specific aspect of the user interface.\n\n';
      content += '## Controllers\n\n';

      if (controllers.length === 0) {
        content += '*No controllers found*\n\n';
      } else {
        for (const controller of controllers) {
          const name = this.extractModuleName(controller.filepath);
          content += `### ${name}\n\n`;
          content += `**File:** \`${controller.filepath}\`\n\n`;
          content += `**Lines:** ${controller.lines}\n\n`;

          if (controller.exports && controller.exports.named > 0) {
            content += `**Named Exports:** ${controller.exports.named}\n\n`;
          }

          if (controller.exports && controller.exports.default > 0) {
            content += `**Default Exports:** ${controller.exports.default}\n\n`;
          }

          if (controller.classes > 0) {
            content += `**Classes:** ${controller.classes}\n\n`;
          }

          if (controller.functions > 0) {
            content += `**Functions:** ${controller.functions}\n\n`;
          }

          if (controller.imports && controller.imports.length > 0) {
            content += '**Dependencies:**\n\n';
            controller.imports.slice(0, 10).forEach(dep => {
              // Convert absolute path to relative project path
              const relativeDep = dep.replace(this.projectRoot + '/', '');
              content += `- \`${relativeDep}\`\n`;
            });
            if (controller.imports.length > 10) {
              content += `- ... and ${controller.imports.length - 10} more\n`;
            }
            content += '\n';
          }

          content += '---\n\n';
        }
      }

      if (!this.dryRun) {
        writeFileSync(filepath, content, 'utf-8');
      }

      this.logger.success('Generated CONTROLLER_CATALOG.md');
      return true;
    } catch (error) {
      this.logger.error('Failed to generate CONTROLLER_CATALOG.md', error.message);
      if (this.logger.verbose) {
        console.error(error);
      }
      return false;
    }
  }

  /**
   * Generate service catalog
   * @param {object} metrics - AST analysis results
   * @returns {boolean} Success
   */
  generateServiceCatalog(metrics) {
    const filepath = resolve(this.projectRoot, 'docs/SERVICE_CATALOG.md');
    this.logger.processing('Generating SERVICE_CATALOG.md...');

    try {
      // Ensure docs directory exists
      const docsDir = dirname(filepath);
      if (!this.dryRun && !existsSync(docsDir)) {
        mkdirSync(docsDir, { recursive: true });
      }

      // Get services from metrics.files (object with filepath keys)
      const services = Object.entries(metrics.files)
        .filter(([_, data]) => data.filepath && data.filepath.startsWith('js/services/'))
        .map(([path, data]) => ({ path, ...data }))
        .sort((a, b) => a.filepath.localeCompare(b.filepath));

      const generatedDate = new Date().toISOString().split('T')[0];
      let content = '# Service Catalog\n\n';
      content += '> **Auto-generated** by docs-sync tool\n';
      content += `> **Generated:** ${generatedDate}\n`;
      content += `> **Total Services:** ${services.length}\n\n`;
      content += 'This catalog provides detailed information about all business logic services in the application.\n\n';
      content += '## Overview\n\n';
      content += 'Services encapsulate business logic and data processing. They follow the HNW architecture pattern and communicate via the EventBus.\n\n';
      content += '## Services\n\n';

      if (services.length === 0) {
        content += '*No services found*\n\n';
      } else {
        for (const service of services) {
          const name = this.extractModuleName(service.filepath);
          content += `### ${name}\n\n`;
          content += `**File:** \`${service.filepath}\`\n\n`;
          content += `**Lines:** ${service.lines}\n\n`;

          if (service.exports && service.exports.named > 0) {
            content += `**Named Exports:** ${service.exports.named}\n\n`;
          }

          if (service.exports && service.exports.default > 0) {
            content += `**Default Exports:** ${service.exports.default}\n\n`;
          }

          if (service.classes > 0) {
            content += `**Classes:** ${service.classes}\n\n`;
          }

          if (service.functions > 0) {
            content += `**Functions:** ${service.functions}\n\n`;
          }

          if (service.imports && service.imports.length > 0) {
            content += '**Dependencies:**\n\n';
            service.imports.slice(0, 10).forEach(dep => {
              // Convert absolute path to relative project path
              const relativeDep = dep.replace(this.projectRoot + '/', '');
              content += `- \`${relativeDep}\`\n`;
            });
            if (service.imports.length > 10) {
              content += `- ... and ${service.imports.length - 10} more\n`;
            }
            content += '\n';
          }

          content += '---\n\n';
        }
      }

      if (!this.dryRun) {
        writeFileSync(filepath, content, 'utf-8');
      }

      this.logger.success('Generated SERVICE_CATALOG.md');
      return true;
    } catch (error) {
      this.logger.error('Failed to generate SERVICE_CATALOG.md', error.message);
      if (this.logger.verbose) {
        console.error(error);
      }
      return false;
    }
  }

  /**
   * Generate utility reference
   * @param {object} metrics - AST analysis results
   * @returns {boolean} Success
   */
  generateUtilityReference(metrics) {
    const filepath = resolve(this.projectRoot, 'docs/UTILITY_REFERENCE.md');
    this.logger.processing('Generating UTILITY_REFERENCE.md...');

    try {
      // Ensure docs directory exists
      const docsDir = dirname(filepath);
      if (!this.dryRun && !existsSync(docsDir)) {
        mkdirSync(docsDir, { recursive: true });
      }

      // Get utilities from metrics.files (object with filepath keys)
      const utilities = Object.entries(metrics.files)
        .filter(([_, data]) => data.filepath && (data.filepath.startsWith('js/utils/') || data.filepath.startsWith('js/utilities/')))
        .map(([path, data]) => ({ path, ...data }))
        .sort((a, b) => a.filepath.localeCompare(b.filepath));

      const generatedDate = new Date().toISOString().split('T')[0];
      let content = '# Utility Reference\n\n';
      content += '> **Auto-generated** by docs-sync tool\n';
      content += `> **Generated:** ${generatedDate}\n`;
      content += `> **Total Utilities:** ${utilities.length}\n\n`;
      content += 'This reference provides detailed information about all utility modules in the application.\n\n';
      content += '## Overview\n\n';
      content += 'Utilities are shared helper functions and modules used across the application.\n\n';
      content += '## Utilities\n\n';

      if (utilities.length === 0) {
        content += '*No utilities found*\n\n';
      } else {
        for (const util of utilities) {
          const name = this.extractModuleName(util.filepath);
          content += `### ${name}\n\n`;
          content += `**File:** \`${util.filepath}\`\n\n`;
          content += `**Lines:** ${util.lines}\n\n`;

          if (util.exports && util.exports.named > 0) {
            content += `**Named Exports:** ${util.exports.named}\n\n`;
          }

          if (util.exports && util.exports.default > 0) {
            content += `**Default Exports:** ${util.exports.default}\n\n`;
          }

          if (util.classes > 0) {
            content += `**Classes:** ${util.classes}\n\n`;
          }

          if (util.functions > 0) {
            content += `**Functions:** ${util.functions}\n\n`;
          }

          if (util.imports && util.imports.length > 0) {
            content += '**Dependencies:**\n\n';
            util.imports.slice(0, 10).forEach(dep => {
              // Convert absolute path to relative project path
              const relativeDep = dep.replace(this.projectRoot + '/', '');
              content += `- \`${relativeDep}\`\n`;
            });
            if (util.imports.length > 10) {
              content += `- ... and ${util.imports.length - 10} more\n`;
            }
            content += '\n';
          }

          content += '---\n\n';
        }
      }

      if (!this.dryRun) {
        writeFileSync(filepath, content, 'utf-8');
      }

      this.logger.success('Generated UTILITY_REFERENCE.md');
      return true;
    } catch (error) {
      this.logger.error('Failed to generate UTILITY_REFERENCE.md', error.message);
      if (this.logger.verbose) {
        console.error(error);
      }
      return false;
    }
  }

  /**
   * Generate all architecture catalogs
   * @param {object} metrics - AST analysis results
   * @returns {object} Generation results
   */
  generateAll(metrics) {
    this.logger.header('Generating Architecture Catalogs');

    const results = {
      controllers: this.generateControllerCatalog(metrics),
      services: this.generateServiceCatalog(metrics),
      utilities: this.generateUtilityReference(metrics),
    };

    const successCount = Object.values(results).filter(v => v).length;
    const totalCount = Object.keys(results).length;

    this.logger.section('Catalog Generation Results');
    this.logger.data('CONTROLLER_CATALOG.md:', results.controllers ? '✓' : '✗');
    this.logger.data('SERVICE_CATALOG.md:', results.services ? '✓' : '✗');
    this.logger.data('UTILITY_REFERENCE.md:', results.utilities ? '✓' : '✗');
    this.logger.info(`Generated ${successCount}/${totalCount} catalogs`);

    return results;
  }
}

export default ArchitectureCatalogGenerator;
