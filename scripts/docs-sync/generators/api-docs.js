/**
 * API Documentation Generator
 * Extracts JSDoc comments and generates markdown documentation
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import doctrine from 'doctrine';
import { parse } from '@babel/parser';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const traverse = require('@babel/traverse').default;

import Logger from '../utils/logger.js';

export class APIDocsGenerator {
  constructor(options = {}) {
    this.logger = options.logger || new Logger();
    this.projectRoot = options.projectRoot || process.cwd();
    this.dryRun = options.dryRun || false;
    this.markers = options.markers || {
      start: '<!-- AUTO-GENERATED:START -->',
      end: '<!-- AUTO-GENERATED:END -->',
    };
  }

  /**
   * Extract JSDoc comments from a JavaScript file
   * @param {string} filepath - Absolute path to file
   * @returns {Array} Array of {name, jsdoc, type} objects
   */
  extractJSDoc(filepath) {
    try {
      const sourceCode = readFileSync(filepath, 'utf-8');
      const ast = parse(sourceCode, {
        sourceType: 'module',
        plugins: ['jsx'],
      });

      const docs = [];

      traverse(
        ast,
        {
          ExportNamedDeclaration(path) {
            this.extractDocsFromDeclaration(path, docs, filepath);
          },

          ExportDefaultDeclaration(path) {
            this.extractDocsFromDeclaration(path, docs, filepath);
          },

          FunctionDeclaration(path) {
            if (
              path.parent.type !== 'ExportNamedDeclaration' &&
              path.parent.type !== 'ExportDefaultDeclaration'
            ) {
              // Skip non-exported functions
              return;
            }
            this.extractDocsFromDeclaration(path, docs, filepath);
          },

          ClassDeclaration(path) {
            if (
              path.parent.type !== 'ExportNamedDeclaration' &&
              path.parent.type !== 'ExportDefaultDeclaration'
            ) {
              return;
            }
            this.extractDocsFromDeclaration(path, docs, filepath);
          },
        },
        { scope: this, docs, filepath }
      );

      return docs;
    } catch (error) {
      this.logger.warning(`Could not extract JSDoc from ${filepath}: ${error.message}`);
      return [];
    }
  }

  /**
   * Helper to extract docs from declaration nodes
   */
  extractDocsFromDeclaration(path, docs, filepath) {
    const node = path.node;

    // Get leading comments
    if (!node.leadingComments || node.leadingComments.length === 0) {
      return;
    }

    // Find JSDoc comment (starts with *)
    const jsdocComment = node.leadingComments.find(
      comment => comment.type === 'CommentBlock' && comment.value.startsWith('*')
    );

    if (!jsdocComment) {
      return;
    }

    // Parse JSDoc with doctrine
    const parsed = doctrine.parse(jsdocComment.value, {
      unwrap: true,
      sloppy: true,
      recoverable: true,
    });

    // Determine name and type
    let name = 'unknown';
    let type = 'function';

    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
      name = node.id?.name || 'anonymous';
      type = 'function';
    } else if (node.type === 'ClassDeclaration') {
      name = node.id?.name || 'anonymous';
      type = 'class';
    } else if (node.type === 'VariableDeclaration') {
      name = node.declarations[0]?.id?.name || 'unknown';
      type = 'variable';
    }

    docs.push({
      name,
      type,
      jsdoc: parsed,
      raw: jsdocComment.value,
      filepath,
    });
  }

  /**
   * Generate markdown from JSDoc
   * @param {object} doc - Document object
   * @returns {string} Markdown
   */
  generateMarkdown(doc) {
    const { name, type, jsdoc, filepath } = doc;
    const relativePath = filepath.replace(this.projectRoot + '/', '');

    let md = '';

    // Header
    md += `### \`${name}\`${type === 'class' ? ' (class)' : ''}\n\n`;

    // Description
    if (jsdoc.description) {
      md += `${jsdoc.description}\n\n`;
    }

    // Source file reference
    md += `**Source:** \`${relativePath}\`\n\n`;

    // Tags
    if (jsdoc.tags && jsdoc.tags.length > 0) {
      // Parameters
      const params = jsdoc.tags.filter(tag => tag.title === 'param');
      if (params.length > 0) {
        md += '**Parameters:**\n\n';
        params.forEach(param => {
          const optional = param.name.includes('[') ? ' (optional)' : '';
          const paramName = param.name.replace('[', '').replace(']', '');
          md += `- \`${paramName}\`\`${optional}`;
          if (param.description) {
            md += ` - ${param.description}`;
          }
          if (param.type) {
            md += ` (\`${param.type.name}\`)`;
          }
          md += '\n';
        });
        md += '\n';
      }

      // Returns
      const returns = jsdoc.tags.find(tag => tag.title === 'returns' || tag.title === 'return');
      if (returns) {
        md += '**Returns:**\n\n';
        if (returns.type) {
          md += `\`${returns.type.name}\` - `;
        }
        if (returns.description) {
          md += `${returns.description}\n\n`;
        }
      }

      // Throws
      const throws = jsdoc.tags.filter(tag => tag.title === 'throws' || tag.title === 'exception');
      if (throws.length > 0) {
        md += '**Throws:**\n\n';
        throws.forEach(th => {
          if (th.type) {
            md += `- \`${th.type.name}\``;
          }
          if (th.description) {
            md += ` - ${th.description}`;
          }
          md += '\n';
        });
        md += '\n';
      }

      // Examples
      const examples = jsdoc.tags.filter(tag => tag.title === 'example');
      if (examples.length > 0) {
        md += '**Example:**\n\n';
        examples.forEach(ex => {
          md += '```javascript\n';
          md += ex.description;
          md += '\n```\n\n';
        });
      }

      // Other custom tags
      const otherTags = jsdoc.tags.filter(
        tag => !['param', 'returns', 'return', 'throws', 'exception', 'example'].includes(tag.title)
      );

      if (otherTags.length > 0) {
        otherTags.forEach(tag => {
          md += `**@${tag.title}**`;
          if (tag.description) {
            md += ` ${tag.description}`;
          }
          md += '\n\n';
        });
      }
    }

    return md;
  }

  /**
   * Update API.md with generated documentation
   * @param {string[]} sourceFiles - Files to extract docs from
   * @returns {boolean} Success
   */
  async updateAPI(sourceFiles) {
    this.logger.processing('Generating API documentation...');

    const apiPath = resolve(this.projectRoot, 'API.md');

    // Extract JSDoc from all source files
    const allDocs = [];

    for (const filepath of sourceFiles) {
      const docs = this.extractJSDoc(filepath);
      allDocs.push(...docs);
    }

    if (allDocs.length === 0) {
      this.logger.warning('No JSDoc comments found');
      return false;
    }

    this.logger.info(`Extracted ${allDocs.length} JSDoc comments`);

    // Generate markdown
    let generatedContent = '';
    for (const doc of allDocs) {
      generatedContent += this.generateMarkdown(doc);
      generatedContent += '\n---\n\n';
    }

    // Read existing API.md
    let content;
    try {
      content = readFileSync(apiPath, 'utf-8');
    } catch (error) {
      this.logger.error('Could not read API.md', error.message);
      return false;
    }

    // Check for markers
    const startIndex = content.indexOf(this.markers.start);
    const endIndex = content.indexOf(this.markers.end);

    if (startIndex === -1 || endIndex === -1) {
      this.logger.warning('Auto-generated markers not found in API.md');
      this.logger.info('Add markers to enable auto-generation:');
      this.logger.dim(`  ${this.markers.start}`);
      this.logger.dim(`  ${this.markers.end}`);
      return false;
    }

    // Replace content between markers
    const before = content.substring(0, startIndex + this.markers.start.length);
    const after = content.substring(endIndex);

    const newContent = before + '\n' + generatedContent + '\n' + after;

    if (!this.dryRun) {
      writeFileSync(apiPath, newContent, 'utf-8');
      this.logger.success('Updated API.md');
    } else {
      this.logger.dim('Would update API.md');
    }

    return true;
  }

  /**
   * Add markers to API.md if they don't exist
   * @returns {boolean} Success
   */
  addMarkersIfMissing() {
    const apiPath = resolve(this.projectRoot, 'API.md');

    let content;
    try {
      content = readFileSync(apiPath, 'utf-8');
    } catch (error) {
      this.logger.error('Could not read API.md', error.message);
      return false;
    }

    // Check if markers already exist
    if (content.includes(this.markers.start) && content.includes(this.markers.end)) {
      return true; // Already has markers
    }

    this.logger.processing('Adding auto-generated markers to API.md...');

    // Find a good place to insert (after ## Table of Contents or at end of file)
    let insertIndex = content.indexOf('## ');

    if (insertIndex === -1) {
      insertIndex = content.length;
    } else {
      // Find the end of the first section
      insertIndex = content.indexOf('\n## ', insertIndex + 1);
      if (insertIndex === -1) {
        insertIndex = content.length;
      }
    }

    const before = content.substring(0, insertIndex);
    const after = content.substring(insertIndex);

    const newContent =
      before +
      '\n' +
      this.markers.start +
      '\n' +
      '<!-- API documentation will be auto-generated here -->\n' +
      this.markers.end +
      '\n' +
      after;

    if (!this.dryRun) {
      writeFileSync(apiPath, newContent, 'utf-8');
      this.logger.success('Added markers to API.md');
    } else {
      this.logger.dim('Would add markers to API.md');
    }

    return true;
  }
}

export default APIDocsGenerator;
