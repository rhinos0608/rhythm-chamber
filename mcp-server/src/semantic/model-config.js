/**
 * Model Configuration Manager
 *
 * Manages the active embedding model configuration for the MCP server.
 * Allows runtime switching between different embedding models.
 *
 * Features:
 * - Set/get active model
 * - Model validation
 * - Configuration persistence
 * - Cache-aware model switching
 *
 * @module semantic/model-config
 */

import { MODEL_DIMENSIONS } from './config.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Configuration file path
 */
const CONFIG_FILE = join(process.env.RC_MCP_CACHE_DIR || join(__dirname, '../../../.mcp-cache'), 'model-config.json');

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  activeModel: 'Xenova/gte-base',
  comparisonModels: [],
  autoSwitch: false,
};

/**
 * Model Configuration Manager Class
 */
export class ModelConfigManager {
  constructor(options = {}) {
    this.configFile = options.configFile || CONFIG_FILE;
    this.config = { ...DEFAULT_CONFIG };
    this.listeners = new Set();
    this.loaded = false;
  }

  /**
   * Load configuration from file
   */
  load() {
    try {
      if (existsSync(this.configFile)) {
        const data = JSON.parse(readFileSync(this.configFile, 'utf-8'));
        this.config = { ...DEFAULT_CONFIG, ...data };
        console.error(`[ModelConfig] Loaded config: active=${this.config.activeModel}`);
      } else {
        // Create default config file
        this.save();
        console.error(`[ModelConfig] Created default config: ${this.configFile}`);
      }
    } catch (error) {
      console.error('[ModelConfig] Failed to load config:', error.message);
      this.config = { ...DEFAULT_CONFIG };
    }

    this.loaded = true;
    return this.config;
  }

  /**
   * Save configuration to file
   */
  save() {
    try {
      const dir = dirname(this.configFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8');
      console.error(`[ModelConfig] Saved config: ${JSON.stringify(this.config)}`);
    } catch (error) {
      console.error('[ModelConfig] Failed to save config:', error.message);
    }
  }

  /**
   * Set the active embedding model
   * @param {string} modelName - Model name to set as active
   * @returns {Object} Result with success status
   */
  setActiveModel(modelName) {
    // Validate model exists
    if (!MODEL_DIMENSIONS[modelName]) {
      const available = Object.keys(MODEL_DIMENSIONS).slice(0, 10).join(', ');
      return {
        success: false,
        error: `Unknown model: ${modelName}`,
        availableModels: available,
      };
    }

    const previousModel = this.config.activeModel;
    this.config.activeModel = modelName;
    this.save();

    // Notify listeners
    this._notifyListeners('model-changed', {
      previous: previousModel,
      current: modelName,
    });

    console.error(`[ModelConfig] Active model changed: ${previousModel} → ${modelName}`);

    return {
      success: true,
      previous: previousModel,
      current: modelName,
      dimension: MODEL_DIMENSIONS[modelName],
    };
  }

  /**
   * Get the active embedding model
   * @returns {string} Active model name
   */
  getActiveModel() {
    if (!this.loaded) {
      this.load();
    }
    return this.config.activeModel;
  }

  /**
   * Get configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    if (!this.loaded) {
      this.load();
    }
    return { ...this.config };
  }

  /**
   * Set comparison models for multi-model analysis
   * @param {string[]} models - Array of model names to compare
   * @returns {Object} Result with success status
   */
  setComparisonModels(models) {
    // Validate all models
    const invalid = models.filter(m => !MODEL_DIMENSIONS[m]);
    if (invalid.length > 0) {
      return {
        success: false,
        error: `Unknown model(s): ${invalid.join(', ')}`,
      };
    }

    this.config.comparisonModels = models;
    this.save();

    return {
      success: true,
      models,
      count: models.length,
    };
  }

  /**
   * Get comparison models
   * @returns {string[]} Array of comparison model names
   */
  getComparisonModels() {
    if (!this.loaded) {
      this.load();
    }
    return this.config.comparisonModels || [];
  }

  /**
   * Get all available models
   * @returns {Object} Model registry with dimensions
   */
  getAvailableModels() {
    const models = {};
    for (const [name, dimension] of Object.entries(MODEL_DIMENSIONS)) {
      models[name] = {
        dimension,
        isCompatible: dimension === 768, // EMBEDDING_DIMENSION
        type: name.includes('jina') ? 'code' :
              name.includes('gte') ? 'general' :
              name.includes('nomic') ? 'code' : 'general',
        provider: name.startsWith('Xenova/') ? 'transformers' :
                   name.startsWith('jinaai/') ? 'transformers' :
                   name.startsWith('text-embedding-') ? 'lmstudio' :
                   name.includes('/') ? 'cloud' : 'local',
      };
    }
    return models;
  }

  /**
   * Subscribe to configuration changes
   * @param {Function} callback - Callback function for changes
   * @returns {Function} Unsubscribe function
   */
  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify listeners of configuration changes
   * @private
   */
  _notifyListeners(event, data) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (error) {
        console.error('[ModelConfig] Listener error:', error);
      }
    }
  }

  /**
   * Reset to default configuration
   */
  reset() {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
    console.error('[ModelConfig] Reset to default configuration');
  }
}

/**
 * Global singleton instance
 */
let globalInstance = null;

/**
 * Get or create global model config instance
 * @returns {ModelConfigManager} The global instance
 */
export function getModelConfig() {
  if (!globalInstance) {
    globalInstance = new ModelConfigManager();
    globalInstance.load();
  }
  return globalInstance;
}

/**
 * Reset global instance (for testing)
 */
export function resetModelConfig() {
  globalInstance = null;
}

export default ModelConfigManager;
