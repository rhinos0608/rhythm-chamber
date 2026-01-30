/**
 * Input Validation Utilities
 *
 * Provides strict input schema validation and normalization for MCP tools.
 * Prevents crashes from malformed inputs and provides clear error messages.
 */

import { resolve, join } from 'path';
import { existsSync, statSync } from 'fs';

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Validate and normalize the target parameter for file/directory operations
 *
 * @param {*} target - The target parameter (string, object, or invalid)
 * @param {string} projectRoot - The project root directory
 * @returns {Object} Normalized target with {type, path, original}
 * @throws {ValidationError} If target is invalid
 */
export function validateTarget(target, projectRoot) {
  // 1. Check for null/undefined
  if (target === null || target === undefined) {
    throw new ValidationError(
      'Missing required parameter: target',
      {
        hint: 'Provide either a file path (string) or object with filePath/directory property',
        received: target
      }
    );
  }

  // 2. Handle string form
  if (typeof target === 'string') {
    const targetPath = resolve(projectRoot, target);

    if (!existsSync(targetPath)) {
      throw new ValidationError(
        `Target not found: ${target}`,
        {
          path: target,
          resolved: targetPath
        }
      );
    }

    return {
      type: 'file',
      path: targetPath,
      relative: target,
      original: target
    };
  }

  // 3. Handle object form
  if (typeof target === 'object' && !Array.isArray(target)) {
    const keys = Object.keys(target);

    // Check for filePath property
    if ('filePath' in target) {
      if (typeof target.filePath !== 'string') {
        throw new ValidationError(
          'Invalid filePath property: must be a string',
          { received: typeof target.filePath }
        );
      }

      // Check for empty string
      if (target.filePath === '') {
        throw new ValidationError(
          'Invalid filePath property: cannot be empty string',
          { hint: 'Provide a valid file path relative to project root' }
        );
      }

      const targetPath = resolve(projectRoot, target.filePath);

      if (!existsSync(targetPath)) {
        throw new ValidationError(
          `File not found: ${target.filePath}`,
          {
            path: target.filePath,
            resolved: targetPath
          }
        );
      }

      return {
        type: 'file',
        path: targetPath,
        relative: target.filePath,
        original: target
      };
    }

    // Check for directory property
    if ('directory' in target) {
      if (typeof target.directory !== 'string') {
        throw new ValidationError(
          'Invalid directory property: must be a string',
          { received: typeof target.directory }
        );
      }

      // Check for empty string
      if (target.directory === '') {
        throw new ValidationError(
          'Invalid directory property: cannot be empty string',
          { hint: 'Provide a valid directory path relative to project root' }
        );
      }

      const targetPath = resolve(projectRoot, target.directory);

      if (!existsSync(targetPath)) {
        throw new ValidationError(
          `Directory not found: ${target.directory}`,
          {
            path: target.directory,
            resolved: targetPath
          }
        );
      }

      return {
        type: 'directory',
        path: targetPath,
        relative: target.directory,
        original: target
      };
    }

    // Object has neither property
    throw new ValidationError(
      'Invalid target object: must have filePath or directory property',
      {
        received: keys,
        hint: 'Use { filePath: "path/to/file" } or { directory: "path/to/dir" }'
      }
    );
  }

  // 4. Handle arrays (not valid)
  if (Array.isArray(target)) {
    throw new ValidationError(
      'Invalid target type: array not supported',
      {
        hint: 'Provide a single file path or object, not an array',
        received: `array[${target.length}]`
      }
    );
  }

  // 5. Unknown type
  throw new ValidationError(
    `Invalid target type: must be string or object, received ${typeof target}`,
    { received: typeof target }
  );
}

/**
 * Validate severity parameter
 */
export function validateSeverity(severity) {
  const valid = ['all', 'error', 'warning'];
  if (severity && !valid.includes(severity)) {
    throw new ValidationError(
      `Invalid severity: ${severity}`,
      {
        valid,
        received: severity,
        hint: 'Use "all", "error", or "warning"'
      }
    );
  }
  return severity || 'all';
}

/**
 * Get files in directory recursively
 */
export function getFilesInDirectory(dir, projectRoot) {
  const { globSync } = require('glob');
  const patterns = [
    join(dir, '**/*.js'),
    '!**/node_modules/**',
    '!**/*.test.js',
    '!**/*.spec.js'
  ];

  return globSync(patterns, { absolute: true });
}

/**
 * Safely resolve a file path relative to project root
 */
export function resolvePath(filePath, projectRoot) {
  if (!filePath || typeof filePath !== 'string') {
    throw new ValidationError(
      'Invalid file path: must be a non-empty string',
      { received: filePath }
    );
  }

  const resolved = resolve(projectRoot, filePath);
  return resolved;
}

/**
 * Check if a path exists and return its type
 */
export function getPathType(path) {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const stats = statSync(path);
    if (stats.isFile()) return 'file';
    if (stats.isDirectory()) return 'directory';
  } catch {
    return null;
  }

  return 'unknown';
}
