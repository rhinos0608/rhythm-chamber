/**
 * Settings Schema Module
 *
 * Centralized schema definition and validation for application settings.
 * Provides type checking, range validation, and defaults for all settings.
 *
 * @module settings-schema
 */

// ==========================================
// Schema Version
// ==========================================

/**
 * Current settings schema version
 * Increment this when making breaking changes to settings structure
 * Migration handlers will be triggered when version mismatch is detected
 */
export const SETTINGS_SCHEMA_VERSION = 1;

// ==========================================
// LLM Provider Models (for enum validation)
// ==========================================

/** Available OpenRouter models (subset for validation) */
const OPENROUTER_MODELS = [
    'xiaomi/mimo-v2-flash:free',
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'microsoft/phi-3-medium-128k-instruct:free',
];

/** Available Gemini models */
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-pro',
];

/** Available LLM providers */
const LLM_PROVIDERS = ['ollama', 'lmstudio', 'gemini', 'openrouter'];

// ==========================================
// Settings Schema Definition
// ==========================================

/**
 * Schema definition for all settings
 *
 * Each property defines:
 * - type: The expected data type
 * - default: Default value for this property
 * - min/max: Numeric range (for number type)
 * - values: Allowed enum values (for enum validation)
 * - pattern: Regex pattern (for string validation)
 * - required: Whether this field is required
 * - sensitive: Whether this field contains sensitive data (e.g., API keys)
 */
export const SETTINGS_SCHEMA = {
    // Schema version (always present)
    _version: {
        type: 'number',
        default: SETTINGS_SCHEMA_VERSION,
        required: true,
    },

    // LLM Provider settings
    llm: {
        type: 'object',
        default: {
            provider: 'ollama',
            ollamaEndpoint: 'http://localhost:11434',
            lmstudioEndpoint: 'http://localhost:1234/v1',
        },
        properties: {
            provider: {
                type: 'enum',
                values: LLM_PROVIDERS,
                default: 'ollama',
            },
            ollamaEndpoint: {
                type: 'url',
                default: 'http://localhost:11434',
                pattern: /^https?:\/\/.+/i,
            },
            lmstudioEndpoint: {
                type: 'url',
                default: 'http://localhost:1234/v1',
                pattern: /^https?:\/\/.+/i,
            },
        },
    },

    // OpenRouter settings
    openrouter: {
        type: 'object',
        default: {
            apiKey: '',
            model: 'xiaomi/mimo-v2-flash:free',
            maxTokens: 4500,
            temperature: 0.7,
            topP: 0.9,
            frequencyPenalty: 0,
            presencePenalty: 0,
            contextWindow: 4096,
        },
        properties: {
            apiKey: {
                type: 'string',
                default: '',
                sensitive: true,
                minLength: 0,
                maxLength: 256,
            },
            model: {
                type: 'string',
                default: 'xiaomi/mimo-v2-flash:free',
                pattern: /^[a-z0-9/\-.:free]+$/,
            },
            maxTokens: {
                type: 'number',
                default: 4500,
                min: 100,
                max: 128000,
            },
            temperature: {
                type: 'number',
                default: 0.7,
                min: 0,
                max: 2,
            },
            topP: {
                type: 'number',
                default: 0.9,
                min: 0,
                max: 1,
            },
            frequencyPenalty: {
                type: 'number',
                default: 0,
                min: -2,
                max: 2,
            },
            presencePenalty: {
                type: 'number',
                default: 0,
                min: -2,
                max: 2,
            },
            contextWindow: {
                type: 'number',
                default: 4096,
                min: 1024,
                max: 128000,
            },
        },
    },

    // Ollama settings
    ollama: {
        type: 'object',
        default: {
            model: 'llama3.2',
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2000,
        },
        properties: {
            model: {
                type: 'string',
                default: 'llama3.2',
                minLength: 1,
            },
            temperature: {
                type: 'number',
                default: 0.7,
                min: 0,
                max: 2,
            },
            topP: {
                type: 'number',
                default: 0.9,
                min: 0,
                max: 1,
            },
            maxTokens: {
                type: 'number',
                default: 2000,
                min: 100,
                max: 32000,
            },
        },
    },

    // LM Studio settings
    lmstudio: {
        type: 'object',
        default: {
            model: 'local-model',
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2000,
        },
        properties: {
            model: {
                type: 'string',
                default: 'local-model',
                minLength: 1,
            },
            temperature: {
                type: 'number',
                default: 0.7,
                min: 0,
                max: 2,
            },
            topP: {
                type: 'number',
                default: 0.9,
                min: 0,
                max: 1,
            },
            maxTokens: {
                type: 'number',
                default: 2000,
                min: 100,
                max: 32000,
            },
        },
    },

    // Gemini settings
    gemini: {
        type: 'object',
        default: {
            apiKey: '',
            model: 'gemini-2.5-flash',
            maxTokens: 8192,
            temperature: 0.7,
            topP: 0.9,
        },
        properties: {
            apiKey: {
                type: 'string',
                default: '',
                sensitive: true,
                minLength: 0,
                maxLength: 256,
            },
            model: {
                type: 'enum',
                values: GEMINI_MODELS,
                default: 'gemini-2.5-flash',
            },
            maxTokens: {
                type: 'number',
                default: 8192,
                min: 100,
                max: 8192,
            },
            temperature: {
                type: 'number',
                default: 0.7,
                min: 0,
                max: 2,
            },
            topP: {
                type: 'number',
                default: 0.9,
                min: 0,
                max: 1,
            },
        },
    },

    // Spotify settings
    spotify: {
        type: 'object',
        default: {
            clientId: '',
        },
        properties: {
            clientId: {
                type: 'string',
                default: '',
                sensitive: true,
                minLength: 0,
                maxLength: 256,
            },
        },
    },
};

// ==========================================
// Validation Result Types
// ==========================================

/**
 * Validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - Array of error messages
 * @property {string[]} warnings - Array of warning messages (non-critical issues)
 * @property {Object} sanitized - The sanitized/corrected settings object
 */

// ==========================================
// Validation Functions
// ==========================================

/**
 * Validate a single value against a schema definition
 *
 * @param {string} key - Settings key (dot notation for nested)
 * @param {*} value - Value to validate
 * @param {Object} schemaDef - Schema definition for this value
 * @returns {Object} { valid: boolean, errors: string[], sanitized: * }
 */
function validateValue(key, value, schemaDef) {
    const errors = [];

    // Handle null/undefined
    if (value === null || value === undefined) {
        if (schemaDef.required) {
            errors.push(`${key}: required field is missing`);
            return { valid: false, errors, sanitized: schemaDef.default };
        }
        return { valid: true, errors: [], sanitized: schemaDef.default };
    }

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    let sanitized = value;

    switch (schemaDef.type) {
        case 'number':
            if (actualType !== 'number') {
                // Try to convert
                const num = Number(value);
                // EDGE CASE FIX: Reject boolean values which coerce to 0 or 1
                // Number(true) = 1, Number(false) = 0
                // These are not valid number settings and should use defaults
                if (isNaN(num) || actualType === 'boolean') {
                    errors.push(`${key}: expected number, got ${actualType}`);
                    sanitized = schemaDef.default;
                } else {
                    sanitized = num;
                }
            }
            // Range validation
            if (typeof sanitized === 'number') {
                if (schemaDef.min !== undefined && sanitized < schemaDef.min) {
                    errors.push(`${key}: value ${sanitized} below minimum ${schemaDef.min}`);
                    sanitized = schemaDef.min;
                }
                if (schemaDef.max !== undefined && sanitized > schemaDef.max) {
                    errors.push(`${key}: value ${sanitized} above maximum ${schemaDef.max}`);
                    sanitized = schemaDef.max;
                }
            }
            break;

        case 'string':
            if (actualType !== 'string') {
                errors.push(`${key}: expected string, got ${actualType}`);
                sanitized = schemaDef.default;
            } else {
                // Pattern validation
                if (schemaDef.pattern && !schemaDef.pattern.test(sanitized)) {
                    errors.push(`${key}: value does not match required pattern`);
                    sanitized = schemaDef.default;
                }
                // Length validation
                if (schemaDef.minLength !== undefined && sanitized.length < schemaDef.minLength) {
                    // Empty strings are often valid for API keys (not configured)
                    if (sanitized !== '' || schemaDef.required) {
                        errors.push(`${key}: value too short (min ${schemaDef.minLength})`);
                    }
                }
                if (schemaDef.maxLength !== undefined && sanitized.length > schemaDef.maxLength) {
                    errors.push(`${key}: value too long (max ${schemaDef.maxLength})`);
                    sanitized = sanitized.substring(0, schemaDef.maxLength);
                }
            }
            break;

        case 'enum':
            if (!schemaDef.values.includes(value)) {
                errors.push(
                    `${key}: invalid value "${value}", must be one of ${schemaDef.values.join(', ')}`
                );
                sanitized = schemaDef.default;
            }
            break;

        case 'object':
            if (actualType !== 'object' || Array.isArray(value)) {
                errors.push(`${key}: expected object, got ${actualType}`);
                sanitized = schemaDef.default;
            } else if (schemaDef.properties) {
                // Validate nested properties
                const nestedResult = validateObject(value, schemaDef.properties, key);
                if (nestedResult.errors.length > 0) {
                    errors.push(...nestedResult.errors);
                }
                sanitized = nestedResult.sanitized;
            }
            break;

        case 'boolean':
            if (actualType !== 'boolean') {
                errors.push(`${key}: expected boolean, got ${actualType}`);
                sanitized = schemaDef.default;
            }
            break;
    }

    return {
        valid: errors.length === 0,
        errors,
        sanitized,
    };
}

/**
 * Validate an object against property schema definitions
 *
 * @param {Object} obj - Object to validate
 * @param {Object} properties - Property schema definitions
 * @param {string} prefix - Key prefix for error messages
 * @returns {Object} { valid: boolean, errors: string[], sanitized: Object }
 */
function validateObject(obj, properties, prefix = '') {
    const errors = [];
    const sanitized = { ...obj };

    for (const [propName, propSchema] of Object.entries(properties)) {
        const key = prefix ? `${prefix}.${propName}` : propName;
        const value = obj[propName];

        const result = validateValue(key, value, propSchema);

        if (result.errors.length > 0) {
            errors.push(...result.errors);
        }

        sanitized[propName] = result.sanitized;
    }

    return {
        valid: errors.length === 0,
        errors,
        sanitized,
    };
}

/**
 * Validate settings object against the full schema
 *
 * This function:
 * 1. Checks all required fields are present
 * 2. Validates types and ranges
 * 3. Sanitizes invalid values (clamps numbers, defaults invalid enums)
 * 4. Returns a complete validation result with any errors
 *
 * @param {Object} settings - Settings object to validate
 * @returns {ValidationResult} Validation result with errors and sanitized settings
 */
export function validateSettings(settings) {
    const errors = [];
    const warnings = [];
    const sanitized = {};

    // Validate schema version first
    if (settings._version !== undefined && typeof settings._version === 'number') {
        sanitized._version = settings._version;
        if (settings._version > SETTINGS_SCHEMA_VERSION) {
            warnings.push(
                `Settings version ${settings._version} is newer than current schema version ${SETTINGS_SCHEMA_VERSION}`
            );
        }
    } else {
        // No version in settings - this is a legacy settings object
        warnings.push('Settings object does not contain a version field');
        sanitized._version = SETTINGS_SCHEMA_VERSION;
    }

    // Validate each top-level section
    for (const [sectionKey, sectionSchema] of Object.entries(SETTINGS_SCHEMA)) {
        if (sectionKey === '_version') continue; // Already handled

        const value = settings[sectionKey];

        if (value === null || value === undefined) {
            // Use default for missing sections
            sanitized[sectionKey] = sectionSchema.default;
            continue;
        }

        if (sectionSchema.type === 'object' && sectionSchema.properties) {
            const result = validateObject(value, sectionSchema.properties, sectionKey);
            if (result.errors.length > 0) {
                errors.push(...result.errors);
            }
            sanitized[sectionKey] = result.sanitized;
        } else {
            const result = validateValue(sectionKey, value, sectionSchema);
            if (result.errors.length > 0) {
                errors.push(...result.errors);
            }
            sanitized[sectionKey] = result.sanitized;
        }
    }

    // Check for unknown properties (forward compatibility)
    for (const key of Object.keys(settings)) {
        if (!SETTINGS_SCHEMA[key] && key !== '_version') {
            warnings.push(`Unknown settings property: ${key}`);
            sanitized[key] = settings[key]; // Preserve for future migration
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        sanitized,
    };
}

/**
 * Get default settings object from schema
 *
 * @returns {Object} Default settings with all values from schema
 */
export function getDefaultSettings() {
    const defaults = {};

    for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
        if (schema.type === 'object' && schema.default) {
            defaults[key] = { ...schema.default };
        } else {
            defaults[key] = schema.default;
        }
    }

    return defaults;
}

/**
 * Merge partial settings with defaults
 *
 * @param {Object} partial - Partial settings to merge
 * @returns {Object} Complete settings object
 */
export function mergeWithDefaults(partial = {}) {
    const defaults = getDefaultSettings();
    const validation = validateSettings(partial);

    // Return sanitized settings merged with defaults
    return {
        ...defaults,
        ...validation.sanitized,
    };
}

// ==========================================
// Schema Migration Handlers
// ==========================================

/**
 * Schema migration handlers for version transitions
 * Each handler transforms settings from one version to the next
 *
 * Handlers are pure functions that take the old settings object
 * and return the migrated settings object
 */
export const SETTINGS_MIGRATIONS = {
    // Migration from v0 (unversioned) to v1
    // Adds _version field and ensures all required sections exist
    1: settings => {
        const migrated = { ...settings };
        migrated._version = 1;

        // Ensure all sections exist (add defaults if missing)
        const defaults = getDefaultSettings();
        for (const [key, value] of Object.entries(defaults)) {
            if (migrated[key] === undefined) {
                migrated[key] = value;
            }
        }

        return migrated;
    },

    // Future migrations will be added here:
    // 2: (settings) => { ... },
    // 3: (settings) => { ... },
};

/**
 * Migrate settings from an older schema version to current
 *
 * @param {Object} settings - Settings object to migrate
 * @param {number} fromVersion - Source schema version
 * @param {number} toVersion - Target schema version (default: current)
 * @returns {Object} Migrated settings object
 */
export function migrateSettings(settings, fromVersion, toVersion = SETTINGS_SCHEMA_VERSION) {
    let migrated = { ...settings };

    // Apply migrations sequentially
    for (let v = fromVersion + 1; v <= toVersion; v++) {
        const handler = SETTINGS_MIGRATIONS[v];
        if (handler) {
            console.log(`[SettingsSchema] Migrating settings from v${v - 1} to v${v}`);
            migrated = handler(migrated);
        } else {
            console.warn(`[SettingsSchema] No migration handler for version ${v}`);
        }
    }

    return migrated;
}

/**
 * Check if settings need migration
 *
 * @param {Object} settings - Settings object to check
 * @returns {boolean} True if migration is needed
 */
export function needsMigration(settings) {
    const version = settings._version || 0;
    return version < SETTINGS_SCHEMA_VERSION;
}

// ==========================================
// Public API
// ==========================================

export const SettingsSchema = {
    // Version
    VERSION: SETTINGS_SCHEMA_VERSION,

    // Validation
    validate: validateSettings,
    getDefaultSettings,
    mergeWithDefaults,

    // Migration
    migrate: migrateSettings,
    needsMigration,
    migrations: SETTINGS_MIGRATIONS,

    // Schema access
    schema: SETTINGS_SCHEMA,
};

console.log(`[SettingsSchema] Schema module loaded (v${SETTINGS_SCHEMA_VERSION})`);
