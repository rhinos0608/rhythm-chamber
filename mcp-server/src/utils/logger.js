/**
 * Structured logging utility for MCP server
 */

export class Logger {
  constructor(prefix = '[MCP]') {
    this.prefix = prefix;
  }

  info(message, ...args) {
    console.error(`${this.prefix} INFO:`, message, ...args);
  }

  error(message, ...args) {
    console.error(`${this.prefix} ERROR:`, message, ...args);
  }

  warn(message, ...args) {
    console.error(`${this.prefix} WARN:`, message, ...args);
  }

  debug(message, ...args) {
    if (process.env.DEBUG) {
      console.error(`${this.prefix} DEBUG:`, message, ...args);
    }
  }
}

export const logger = new Logger('[Rhythm Chamber MCP]');
