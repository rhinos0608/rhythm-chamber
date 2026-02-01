/**
 * Universal Schema System
 *
 * Provider-agnostic function schema format with adapters for different LLM providers.
 * Enables future-proofing against API changes and multi-provider support.
 *
 * Currently supports:
 * - OpenAI format (including OpenRouter)
 * - Anthropic Claude format
 * - Google Gemini format
 *
 * @module functions/schemas/universal-schema
 */

// ==========================================
// Schema Version
// ==========================================

const SCHEMA_VERSION = '1.0.0';

// ==========================================
// Universal Schema Types
// ==========================================

/**
 * @typedef {Object} UniversalParameter
 * @property {string} name - Parameter name
 * @property {string} type - Type: 'string' | 'number' | 'boolean' | 'array' | 'object'
 * @property {string} description - Parameter description
 * @property {boolean} [required=false] - Whether parameter is required
 * @property {string[]} [enum] - Allowed values for enums
 * @property {Object} [items] - Array item schema (for type='array')
 * @property {Object} [properties] - Object property schemas (for type='object')
 */

/**
 * @typedef {Object} UniversalSchema
 * @property {string} name - Function name
 * @property {string} description - Function description
 * @property {UniversalParameter[]} parameters - Function parameters
 * @property {string} [category] - Function category for grouping
 * @property {string[]} [tags] - Tags for filtering
 */

// ==========================================
// Schema Adapters
// ==========================================

/**
 * Convert universal schema to OpenAI function calling format
 * Works with: OpenAI API, OpenRouter, Azure OpenAI
 *
 * @param {UniversalSchema} schema - Universal schema
 * @returns {Object} OpenAI-format function schema
 */
function toOpenAI(schema) {
    const properties = {};
    const required = [];

    for (const param of schema.parameters) {
        properties[param.name] = buildOpenAIProperty(param);
        if (param.required) {
            required.push(param.name);
        }
    }

    return {
        type: 'function',
        function: {
            name: schema.name,
            description: schema.description,
            parameters: {
                type: 'object',
                properties,
                required,
            },
        },
    };
}

/**
 * Build OpenAI property schema from universal parameter
 */
function buildOpenAIProperty(param) {
    const prop = {
        type: param.type,
        description: param.description,
    };

    if (param.enum) {
        prop.enum = param.enum;
    }

    if (param.type === 'array' && param.items) {
        prop.items = buildOpenAIProperty(param.items);
    }

    if (param.type === 'object' && param.properties) {
        prop.properties = {};
        for (const [key, value] of Object.entries(param.properties)) {
            prop.properties[key] = buildOpenAIProperty(value);
        }
    }

    return prop;
}

/**
 * Convert universal schema to Anthropic Claude tool format
 *
 * @param {UniversalSchema} schema - Universal schema
 * @returns {Object} Anthropic-format tool schema
 */
function toAnthropic(schema) {
    const inputSchema = {
        type: 'object',
        properties: {},
        required: [],
    };

    for (const param of schema.parameters) {
        inputSchema.properties[param.name] = buildAnthropicProperty(param);
        if (param.required) {
            inputSchema.required.push(param.name);
        }
    }

    return {
        name: schema.name,
        description: schema.description,
        input_schema: inputSchema,
    };
}

/**
 * Build Anthropic property schema from universal parameter
 */
function buildAnthropicProperty(param) {
    const prop = {
        type: param.type,
        description: param.description,
    };

    if (param.enum) {
        prop.enum = param.enum;
    }

    if (param.type === 'array' && param.items) {
        prop.items = buildAnthropicProperty(param.items);
    }

    if (param.type === 'object' && param.properties) {
        prop.properties = {};
        for (const [key, value] of Object.entries(param.properties)) {
            prop.properties[key] = buildAnthropicProperty(value);
        }
    }

    return prop;
}

/**
 * Convert universal schema to Google Gemini function declarations format
 *
 * @param {UniversalSchema} schema - Universal schema
 * @returns {Object} Gemini-format function declaration
 */
function toGemini(schema) {
    const parameters = {
        type: 'OBJECT',
        properties: {},
        required: [],
    };

    for (const param of schema.parameters) {
        parameters.properties[param.name] = buildGeminiProperty(param);
        if (param.required) {
            parameters.required.push(param.name);
        }
    }

    return {
        name: schema.name,
        description: schema.description,
        parameters,
    };
}

/**
 * Build Gemini property schema from universal parameter
 * Gemini uses uppercase type names
 */
function buildGeminiProperty(param) {
    const typeMap = {
        string: 'STRING',
        number: 'NUMBER',
        boolean: 'BOOLEAN',
        array: 'ARRAY',
        object: 'OBJECT',
    };

    const prop = {
        type: typeMap[param.type] || 'STRING',
        description: param.description,
    };

    if (param.enum) {
        prop.enum = param.enum;
    }

    if (param.type === 'array' && param.items) {
        prop.items = buildGeminiProperty(param.items);
    }

    if (param.type === 'object' && param.properties) {
        prop.properties = {};
        for (const [key, value] of Object.entries(param.properties)) {
            prop.properties[key] = buildGeminiProperty(value);
        }
    }

    return prop;
}

// ==========================================
// Conversion Utilities
// ==========================================

/**
 * Convert an array of universal schemas to provider-specific format
 *
 * @param {UniversalSchema[]} schemas - Array of universal schemas
 * @param {'openai' | 'anthropic' | 'gemini'} provider - Target provider
 * @returns {Object[]} Provider-specific schemas
 */
function convertSchemas(schemas, provider) {
    const converters = {
        openai: toOpenAI,
        anthropic: toAnthropic,
        gemini: toGemini,
    };

    const converter = converters[provider];
    if (!converter) {
        throw new Error(`Unknown provider: ${provider}`);
    }

    return schemas.map(converter);
}

/**
 * Create a universal schema from a simplified definition
 *
 * @param {string} name - Function name
 * @param {string} description - Function description
 * @param {Object} paramDefs - Parameter definitions { name: { type, description, required?, enum? } }
 * @returns {UniversalSchema}
 */
function createSchema(name, description, paramDefs = {}) {
    const parameters = [];

    for (const [paramName, def] of Object.entries(paramDefs)) {
        parameters.push({
            name: paramName,
            type: def.type || 'string',
            description: def.description || paramName,
            required: def.required || false,
            enum: def.enum,
            items: def.items,
            properties: def.properties,
        });
    }

    return {
        name,
        description,
        parameters,
        schemaVersion: SCHEMA_VERSION,
    };
}

// ==========================================
// Public API
// ==========================================

export const UniversalSchema = {
    // Version
    VERSION: SCHEMA_VERSION,

    // Adapters
    toOpenAI,
    toAnthropic,
    toGemini,

    // Utilities
    convertSchemas,
    createSchema,
};

console.log('[UniversalSchema] Provider-agnostic schema system loaded');
