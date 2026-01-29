/**
 * Cross-Reference Validator
 * Validates internal links in markdown files
 */

import { readFileSync } from 'fs';
import { resolve, relative, dirname } from 'path';
import { glob } from 'glob';
import Logger from '../utils/logger.js';

export class XRefValidator {
  constructor(options = {}) {
    this.logger = options.logger || new Logger();
    this.projectRoot = options.projectRoot || process.cwd();
  }

  /**
   * Extract markdown links from content
   * @param {string} content - Markdown content
   * @param {string} sourceFile - Source filepath for context
   * @returns {Array} Array of {text, href, line} objects
   */
  extractLinks(content, sourceFile) {
    const links = [];
    const lines = content.split('\n');

    // Regex for markdown links: [text](href)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    lines.forEach((line, index) => {
      let match;
      while ((match = linkRegex.exec(line)) !== null) {
        links.push({
          text: match[1],
          href: match[2],
          line: index + 1,
          sourceFile,
        });
      }
    });

    return links;
  }

  /**
   * Check if a link is internal (relative path or hash)
   * @param {string} href - Link href
   * @returns {boolean}
   */
  isInternalLink(href) {
    // External links start with http://, https://, //
    if (href.match(/^https?:\/\//) || href.startsWith('//')) {
      return false;
    }

    // Anchor-only links (#section)
    if (href.startsWith('#')) {
      return true; // These are internal but we'll validate separately
    }

    // Email links
    if (href.startsWith('mailto:')) {
      return false;
    }

    return true;
  }

  /**
   * Resolve a relative link to absolute path
   * @param {string} href - Link href
   * @param {string} sourceFile - Source filepath
   * @returns {string} Absolute filepath
   */
  resolveLink(href, sourceFile) {
    // Remove hash/fragment for file path resolution
    const hashIndex = href.indexOf('#');
    const filepathPart = hashIndex !== -1 ? href.substring(0, hashIndex) : href;

    // Resolve relative to source file
    const sourceDir = dirname(sourceFile);
    return resolve(sourceDir, filepathPart);
  }

  /**
   * Check if a file exists
   * @param {string} filepath - Absolute filepath
   * @returns {boolean}
   */
  fileExists(filepath) {
    try {
      const stats = require('fs').statSync(filepath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Validate links in a single file
   * @param {string} filepath - Absolute path to file
   * @returns {Array} Array of validation issues
   */
  validateFile(filepath) {
    const issues = [];

    try {
      const content = readFileSync(filepath, 'utf-8');
      const links = this.extractLinks(content, filepath);

      for (const link of links) {
        if (!this.isInternalLink(link.href)) {
          continue; // Skip external links
        }

        // Resolve link
        const resolvedPath = this.resolveLink(link.href, filepath);

        // Check if file exists
        if (!this.fileExists(resolvedPath)) {
          issues.push({
            type: 'broken',
            file: relative(this.projectRoot, filepath),
            link: link.text,
            href: link.href,
            line: link.line,
            resolved: relative(this.projectRoot, resolvedPath),
          });
        }
      }
    } catch (error) {
      issues.push({
        type: 'error',
        file: relative(this.projectRoot, filepath),
        message: `Could not read file: ${error.message}`,
      });
    }

    return issues;
  }

  /**
   * Check version consistency across documents
   * @param {string[]} files - Files to check
   * @returns {Array} Array of version inconsistencies
   */
  checkVersionConsistency(files) {
    const issues = [];
    const versions = new Map();

    // Extract versions from files
    for (const filepath of files) {
      try {
        const content = readFileSync(filepath, 'utf-8');

        // Look for version patterns
        const versionMatch = content.match(/\*\*Version:\*\* ([\d.]+)/);
        const lastUpdatedMatch = content.match(/\*\*Last Updated:\*\* ([0-9-]+)/);

        if (versionMatch) {
          versions.set(relative(this.projectRoot, filepath), {
            version: versionMatch[1],
            lastUpdated: lastUpdatedMatch ? lastUpdatedMatch[1] : null,
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    // Check for inconsistencies
    const versionSet = new Set(Object.values(versions).map(v => v.version));
    if (versionSet.size > 1) {
      issues.push({
        type: 'version',
        message: 'Version numbers are inconsistent across documents',
        versions: Array.from(versions.entries()).map(([file, data]) => ({
          file,
          version: data.version,
        })),
      });
    }

    return issues;
  }

  /**
   * Validate all markdown files
   * @param {string[]} patterns - Glob patterns
   * @returns {Promise<object>} Validation results
   */
  async validateAll(patterns = ['*.md', 'docs/**/*.md']) {
    this.logger.processing('Validating cross-references...');

    const files = await this.globFiles(patterns);
    this.logger.info(`Found ${files.length} markdown files`);

    const results = {
      files: files.length,
      links: 0,
      broken: [],
      errors: [],
      versionIssues: [],
    };

    // Validate links in each file
    for (const filepath of files) {
      const issues = this.validateFile(filepath);

      for (const issue of issues) {
        if (issue.type === 'broken') {
          results.broken.push(issue);
        } else if (issue.type === 'error') {
          results.errors.push(issue);
        }
        results.links++;
      }
    }

    // Check version consistency
    const versionIssues = this.checkVersionConsistency(files);
    results.versionIssues = versionIssues;

    // Report results
    if (results.broken.length === 0 && results.errors.length === 0 && results.versionIssues.length === 0) {
      this.logger.success('No cross-reference issues found');
    } else {
      if (results.broken.length > 0) {
        this.logger.warning(`Found ${results.broken.length} broken links`);
        results.broken.forEach(issue => {
          this.logger.dim(`  ${issue.file}:${issue.line}`);
          this.logger.dim(`    [${issue.link}](${issue.href}) -> ${issue.resolved}`);
        });
      }

      if (results.errors.length > 0) {
        this.logger.error(`${results.errors.length} file read errors`);
      }

      if (results.versionIssues.length > 0) {
        this.logger.warning(`${results.versionIssues.length} version inconsistencies`);
        results.versionIssues.forEach(issue => {
          this.logger.dim(`  ${issue.message}`);
        });
      }
    }

    this.logger.data('Links checked:', results.links);
    this.logger.data('Broken links:', results.broken.length);
    this.logger.data('Errors:', results.errors.length);

    return results;
  }

  /**
   * Get list of files matching glob patterns
   * @param {string[]} patterns - Glob patterns
   * @returns {Promise<string[]>} Absolute file paths
   */
  async globFiles(patterns) {
    const files = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.projectRoot,
        absolute: true,
        nodir: true,
      });

      files.push(...matches);
    }

    return [...new Set(files)]; // Deduplicate
  }
}

export default XRefValidator;
