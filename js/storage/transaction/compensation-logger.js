/**
 * Compensation Logger
 *
 * Logs failed transaction rollbacks for manual recovery.
 * Three-tier fallback: IndexedDB → localStorage → in-memory Map
 *
 * @module storage/transaction/compensation-logger
 */

import { IndexedDBCore } from '../indexeddb.js';
import { TransactionStateManager } from './transaction-state.js';

const COMPENSATION_LOG_STORE = 'TRANSACTION_COMPENSATION';
const MAX_MEMORY_LOGS = 100;

/**
 * Manages compensation logging for transaction rollback failures
 */
export class CompensationLogger {
  constructor() {
    this.memoryLogs = new Map();
  }

  /**
   * Log compensation entries for failed rollback
   * Tries IndexedDB, falls back to localStorage, then memory
   *
   * @param {string} transactionId - Transaction ID
   * @param {Array} entries - Compensation log entries
   * @returns {Promise<void>}
   */
  async logCompensation(transactionId, entries) {
    const logEntry = {
      id: transactionId,
      entries,
      timestamp: Date.now(),
      resolved: false
    };

    // Try IndexedDB first
    try {
      await this._logToIndexedDB(transactionId, logEntry);
      console.warn(`[CompensationLogger] Logged to IndexedDB: ${transactionId}`);
      return;
    } catch (error) {
      console.warn(`[CompensationLogger] IndexedDB failed: ${error.message}`);
    }

    // Fallback to localStorage
    try {
      this._logToLocalStorage(transactionId, logEntry);
      console.warn(`[CompensationLogger] Logged to localStorage: ${transactionId}`);
      return;
    } catch (error) {
      console.warn(`[CompensationLogger] localStorage failed: ${error.message}`);
    }

    // Final fallback: in-memory Map
    this._logToMemory(transactionId, logEntry);
    console.warn(`[CompensationLogger] Logged to memory (final fallback): ${transactionId}`);
  }

  /**
   * Get compensation log for a specific transaction
   * Searches all three storage tiers
   *
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object|null>} Log entry or null
   */
  async getCompensationLog(transactionId) {
    // Check memory first (fastest)
    if (this.memoryLogs.has(transactionId)) {
      return this.memoryLogs.get(transactionId);
    }

    // Check IndexedDB
    try {
      const idbLog = await this._getFromIndexedDB(transactionId);
      if (idbLog) return idbLog;
    } catch (error) {
      console.warn(`[CompensationLogger] IndexedDB read failed: ${error.message}`);
    }

    // Check localStorage
    try {
      const lsLog = this._getFromLocalStorage(transactionId);
      if (lsLog) return lsLog;
    } catch (error) {
      console.warn(`[CompensationLogger] localStorage read failed: ${error.message}`);
    }

    return null;
  }

  /**
   * Get all compensation logs from all storage tiers
   *
   * @returns {Promise<Array>} Array of all log entries
   */
  async getAllCompensationLogs() {
    const logs = [];

    // Collect from memory
    logs.push(...Array.from(this.memoryLogs.values()));

    // Collect from IndexedDB
    try {
      const idbLogs = await this._getAllFromIndexedDB();
      logs.push(...idbLogs);
    } catch (error) {
      console.warn(`[CompensationLogger] IndexedDB scan failed: ${error.message}`);
    }

    // Collect from localStorage
    try {
      const lsLogs = this._getAllFromLocalStorage();
      logs.push(...lsLogs);
    } catch (error) {
      console.warn(`[CompensationLogger] localStorage scan failed: ${error.message}`);
    }

    return logs;
  }

  /**
   * Clear compensation log (mark as resolved)
   *
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<boolean>} True if log was found and cleared
   */
  async clearCompensationLog(transactionId) {
    let cleared = false;

    // Clear from memory
    if (this.memoryLogs.has(transactionId)) {
      this.memoryLogs.delete(transactionId);
      cleared = true;
    }

    // Clear from IndexedDB
    try {
      const idbCleared = await this._clearFromIndexedDB(transactionId);
      if (idbCleared) cleared = true;
    } catch (error) {
      console.warn(`[CompensationLogger] IndexedDB clear failed: ${error.message}`);
    }

    // Clear from localStorage
    try {
      const lsCleared = this._clearFromLocalStorage(transactionId);
      if (lsCleared) cleared = true;
    } catch (error) {
      console.warn(`[CompensationLogger] localStorage clear failed: ${error.message}`);
    }

    return cleared;
  }

  // ==========================================
  // Private: IndexedDB Storage
  // ==========================================

  /**
   * Log compensation entry to IndexedDB
   * Uses IndexedDBCore.put for proper transaction safety and fallback support
   *
   * @private
   * @param {string} transactionId - Transaction ID
   * @param {Object} logEntry - Log entry to store
   * @returns {Promise<void>}
   * @throws {Error} If IndexedDB operation fails
   */
  async _logToIndexedDB(transactionId, logEntry) {
    try {
      // Use IndexedDBCore.put for transaction safety and fallback support
      // This ensures proper error handling and automatic fallback to localStorage
      await IndexedDBCore.put(COMPENSATION_LOG_STORE, logEntry, {
        bypassAuthority: true, // Compensation logs are system-level writes
        skipWriteEpoch: true   // Skip VectorClock for internal logging
      });
    } catch (error) {
      console.error(`[CompensationLogger] IndexedDB put failed:`, error);
      throw new Error(`Failed to log to IndexedDB: ${error.message}`);
    }
  }

  /**
   * Get compensation log from IndexedDB by transaction ID
   * Uses IndexedDBCore.get for proper transaction safety and fallback support
   *
   * @private
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object|null>} Log entry or null if not found
   */
  async _getFromIndexedDB(transactionId) {
    try {
      const log = await IndexedDBCore.get(COMPENSATION_LOG_STORE, transactionId);
      return log || null;
    } catch (error) {
      console.error(`[CompensationLogger] IndexedDB get failed:`, error);
      throw new Error(`Failed to read from IndexedDB: ${error.message}`);
    }
  }

  /**
   * Get all compensation logs from IndexedDB
   * Uses IndexedDBCore.getAll for proper transaction safety and fallback support
   *
   * @private
   * @returns {Promise<Array>} Array of all log entries
   */
  async _getAllFromIndexedDB() {
    try {
      const logs = await IndexedDBCore.getAll(COMPENSATION_LOG_STORE);
      return logs || [];
    } catch (error) {
      console.error(`[CompensationLogger] IndexedDB getAll failed:`, error);
      throw new Error(`Failed to scan IndexedDB: ${error.message}`);
    }
  }

  /**
   * Clear compensation log from IndexedDB
   * Uses IndexedDBCore.delete for proper transaction safety and fallback support
   *
   * @private
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<boolean>} True if log was found and deleted
   */
  async _clearFromIndexedDB(transactionId) {
    try {
      // First check if the log exists
      const existing = await this._getFromIndexedDB(transactionId);
      if (!existing) {
        return false;
      }

      // Delete the log entry
      await IndexedDBCore.delete(COMPENSATION_LOG_STORE, transactionId, {
        bypassAuthority: true // Compensation logs are system-level deletes
      });
      return true;
    } catch (error) {
      console.error(`[CompensationLogger] IndexedDB delete failed:`, error);
      throw new Error(`Failed to clear from IndexedDB: ${error.message}`);
    }
  }

  // ==========================================
  // Private: localStorage Fallback
  // ==========================================

  _logToLocalStorage(transactionId, logEntry) {
    const key = `comp_log_${transactionId}`;
    localStorage.setItem(key, JSON.stringify(logEntry));
  }

  _getFromLocalStorage(transactionId) {
    const key = `comp_log_${transactionId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  _getAllFromLocalStorage() {
    const logs = [];
    const prefix = 'comp_log_';

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const data = localStorage.getItem(key);
        if (data) {
          logs.push(JSON.parse(data));
        }
      }
    }

    return logs;
  }

  _clearFromLocalStorage(transactionId) {
    const key = `comp_log_${transactionId}`;
    const hadEntry = localStorage.getItem(key) !== null;
    localStorage.removeItem(key);
    return hadEntry;
  }

  // ==========================================
  // Private: In-Memory Fallback
  // ==========================================

  _logToMemory(transactionId, logEntry) {
    // Prevent unbounded growth
    if (this.memoryLogs.size >= MAX_MEMORY_LOGS) {
      const oldestKey = this.memoryLogs.keys().next().value;
      this.memoryLogs.delete(oldestKey);
    }

    this.memoryLogs.set(transactionId, {
      ...logEntry,
      storage: 'memory'
    });
  }

  // ==========================================
  // BACKWARD COMPATIBILITY: Test Helper Methods
  // ==========================================

  /**
   * Add an in-memory compensation log entry (for testing)
   *
   * @param {string} transactionId - Transaction ID
   * @param {Array} entries - Compensation log entries
   */
  addInMemoryCompensationLog(transactionId, entries) {
    this._logToMemory(transactionId, {
      id: transactionId,
      entries,
      timestamp: Date.now(),
      resolved: false,
      storage: 'memory'
    });
  }

  /**
   * Get all in-memory compensation logs (for testing)
   *
   * @returns {Array} Array of in-memory log entries
   */
  getAllInMemoryCompensationLogs() {
    return Array.from(this.memoryLogs.values());
  }

  /**
   * Clear an in-memory compensation log (for testing)
   *
   * @param {string} transactionId - Transaction ID
   */
  clearInMemoryCompensationLog(transactionId) {
    this.memoryLogs.delete(transactionId);
  }

  /**
   * Mark a compensation log as resolved (for testing)
   *
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<boolean>} True if log was found and resolved
   */
  async resolveCompensationLog(transactionId) {
    // Check memory first
    if (this.memoryLogs.has(transactionId)) {
      const log = this.memoryLogs.get(transactionId);
      log.resolved = true;
      log.resolvedAt = Date.now();
      return true;
    }

    // Check other storage tiers
    const log = await this.getCompensationLog(transactionId);
    if (log) {
      log.resolved = true;
      log.resolvedAt = Date.now();

      // Update in persistent storage
      try {
        await this._logToIndexedDB(transactionId, log);
      } catch {
        this._logToLocalStorage(transactionId, log);
      }

      return true;
    }

    return false;
  }

  /**
   * Clear all resolved compensation logs (for testing)
   *
   * @returns {Promise<number>} Number of logs cleared
   */
  async clearResolvedCompensationLogs() {
    let clearedCount = 0;

    // Clear resolved from memory
    for (const [transactionId, log] of this.memoryLogs.entries()) {
      if (log.resolved) {
        this.memoryLogs.delete(transactionId);
        clearedCount++;
      }
    }

    // Clear resolved from persistent storage
    try {
      const allLogs = await this.getAllCompensationLogs();
      for (const log of allLogs) {
        if (log.resolved) {
          await this.clearCompensationLog(log.id);
          clearedCount++;
        }
      }
    } catch (error) {
      console.warn(`[CompensationLogger] Failed to clear resolved logs: ${error.message}`);
    }

    return clearedCount;
  }
}
