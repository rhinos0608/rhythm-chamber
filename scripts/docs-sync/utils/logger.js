/**
 * Logger utility for docs-sync tooling
 * Provides colored console output for different log levels
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const symbols = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✗',
  processing: '⟳',
};

export class Logger {
  constructor(options = {}) {
    this.verbose = options.verbose ?? false;
    this.quiet = options.quiet ?? false;
  }

  info(message) {
    if (!this.quiet) {
      console.log(`${colors.blue}${symbols.info}${colors.reset} ${message}`);
    }
  }

  success(message) {
    if (!this.quiet) {
      console.log(`${colors.green}${symbols.success}${colors.reset} ${message}`);
    }
  }

  warning(message) {
    console.warn(`${colors.yellow}${symbols.warning}${colors.reset} ${colors.yellow}${message}${colors.reset}`);
  }

  error(message, details = null) {
    console.error(`${colors.red}${symbols.error}${colors.reset} ${colors.red}${message}${colors.reset}`);
    if (details && this.verbose) {
      console.error(`${colors.dim}  ${details}${colors.reset}`);
    }
  }

  processing(message) {
    if (!this.quiet) {
      console.log(`${colors.cyan}${symbols.processing}${colors.reset} ${message}`);
    }
  }

  dim(message) {
    if (this.verbose && !this.quiet) {
      console.log(`${colors.dim}${message}${colors.reset}`);
    }
  }

  header(message) {
    if (!this.quiet) {
      console.log(`\n${colors.bright}${colors.cyan}═${colors.reset} ${colors.bright}${message}${colors.bright}${colors.cyan} ═${colors.reset}\n`);
    }
  }

  section(message) {
    if (!this.quiet) {
      console.log(`\n${colors.bright}${message}${colors.reset}`);
    }
  }

  data(label, value) {
    if (!this.quiet) {
      console.log(`  ${colors.dim}${label}:${colors.reset} ${value}`);
    }
  }

  table(headers, rows) {
    if (!this.quiet) {
      // Simple table formatting
      const colWidths = headers.map((h, i) =>
        Math.max(h.length, ...rows.map(r => String(r[i]).length))
      );

      // Header
      const headerRow = headers.map((h, i) =>
        h.padEnd(colWidths[i])
      ).join(' | ');
      console.log(`${colors.bright}${headerRow}${colors.reset}`);

      // Separator
      const separator = colWidths.map(w => '─'.repeat(w)).join('─┼─');
      console.log(`${colors.dim}${separator}${colors.reset}`);

      // Rows
      rows.forEach(row => {
        const rowStr = row.map((cell, i) =>
          String(cell).padEnd(colWidths[i])
        ).join(' | ');
        console.log(rowStr);
      });
    }
  }

  static create(options) {
    return new Logger(options);
  }
}

export default Logger;
