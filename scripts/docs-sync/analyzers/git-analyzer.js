/**
 * Git Analyzer - Queries git history for metadata
 * Uses simple-git for git operations
 */

import { simpleGit } from 'simple-git';
import { readFileSync } from 'fs';
import Logger from '../utils/logger.js';

export class GitAnalyzer {
  constructor(options = {}) {
    this.logger = options.logger || new Logger();
    this.git = options.git || simpleGit();
    this.projectRoot = options.projectRoot || process.cwd();
  }

  /**
   * Get last modified timestamp for a file
   * @param {string} filepath - Relative path to file
   * @returns {Promise<string>} ISO date string or null
   */
  async getLastModified(filepath) {
    try {
      const log = await this.git.log({
        file: filepath,
        maxCount: 1,
      });

      if (log.latest) {
        return new Date(log.latest.date).toISOString().split('T')[0];
      }

      return null;
    } catch (error) {
      // File might not be in git yet
      this.logger.dim(`No git history for ${filepath}`);
      return null;
    }
  }

  /**
   * Get contributor statistics for a file
   * @param {string} filepath - Relative path to file
   * @returns {Promise<object>} Contributor stats
   */
  async getContributors(filepath) {
    try {
      const log = await this.git.log({
        file: filepath,
        stat: true,
      });

      const contributors = {};
      let commitCount = 0;

      for (const commit of log.all) {
        const author = commit.author_name;
        contributors[author] = (contributors[author] || 0) + 1;
        commitCount++;
      }

      return {
        contributors: Object.keys(contributors),
        commitCount,
        topContributor: Object.keys(contributors).sort(
          (a, b) => contributors[b] - contributors[a]
        )[0],
      };
    } catch (error) {
      this.logger.dim(`No contributor data for ${filepath}`);
      return {
        contributors: [],
        commitCount: 0,
        topContributor: null,
      };
    }
  }

  /**
   * Get current version from git tags or CHANGELOG
   * @param {string} fallback - Fallback source ('package' | 'changelog')
   * @returns {Promise<string>} Version string
   */
  async getVersion(fallback = 'package') {
    // Try git tags first
    try {
      const tags = await this.git.tags();
      if (tags.latest && tags.latest.startsWith('v')) {
        return tags.latest;
      }
    } catch (error) {
      this.logger.dim('No git tags found');
    }

    // Fallback to CHANGELOG.md
    try {
      const changelog = readFileSync(`${this.projectRoot}/CHANGELOG.md`, 'utf-8');
      const match = changelog.match(/## \[([\d.]+)\]/);
      if (match) {
        return `v${match[1]}`;
      }
    } catch (error) {
      this.logger.dim('No CHANGELOG.md found');
    }

    // Final fallback to package.json
    if (fallback === 'package') {
      try {
        const pkg = JSON.parse(readFileSync(`${this.projectRoot}/package.json`, 'utf-8'));
        return `v${pkg.version}`;
      } catch (error) {
        this.logger.warning('Could not determine version');
        return 'v0.0.0';
      }
    }

    return 'v0.0.0';
  }

  /**
   * Get git status (check if repo is dirty)
   * @returns {Promise<object>} Git status
   */
  async getStatus() {
    try {
      const status = await this.git.status();
      return {
        dirty: status.files.length > 0,
        modified: status.modified,
        added: status.created,
        deleted: status.deleted,
        staged: status.staged,
      };
    } catch (error) {
      this.logger.error('Failed to get git status', error.message);
      return {
        dirty: false,
        modified: [],
        added: [],
        deleted: [],
        staged: [],
      };
    }
  }

  /**
   * Get last modified timestamps for multiple files
   * @param {string[]} filepaths - Relative file paths
   * @returns {Promise<Map<string, string>>} filepath -> date
   */
  async getBatchLastModified(filepaths) {
    const results = new Map();

    for (const filepath of filepaths) {
      const date = await this.getLastModified(filepath);
      if (date) {
        results.set(filepath, date);
      }
    }

    return results;
  }

  /**
   * Analyze git history for documentation files
   * @param {string[]} targetFiles - Documentation files to analyze
   * @returns {Promise<object>} Git metadata for target files
   */
  async analyzeTargetFiles(targetFiles) {
    this.logger.processing('Analyzing git history...');

    const results = {
      files: {},
      currentVersion: await this.getVersion(),
      repoStatus: await this.getStatus(),
    };

    for (const filepath of targetFiles) {
      const lastModified = await this.getLastModified(filepath);
      const contributors = await this.getContributors(filepath);

      if (lastModified || contributors.commitCount > 0) {
        results.files[filepath] = {
          lastModified,
          ...contributors,
        };
      }
    }

    this.logger.success('Git analysis complete');
    this.logger.data('Version:', results.currentVersion);

    if (results.repoStatus.dirty) {
      this.logger.warning('Git repo has uncommitted changes');
    }

    return results;
  }

  /**
   * Get current date in YYYY-MM-DD format
   * @returns {string}
   */
  getCurrentDate() {
    return new Date().toISOString().split('T')[0];
  }
}

export default GitAnalyzer;
