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

  async _logToIndexedDB(transactionId, logEntry) {
    // Note: Will be implemented with IndexedDBCore access
    throw new Error('IndexedDB storage not yet implemented');
  }

  async _getFromIndexedDB(transactionId) {
    // Note: Will be implemented with IndexedDBCore access
    return null;
  }

  async _getAllFromIndexedDB() {
    // Note: Will be implemented with IndexedDBCore access
    return [];
  }

  async _clearFromIndexedDB(transactionId) {
    // Note: Will be implemented with IndexedDBCore access
    return false;
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
}
