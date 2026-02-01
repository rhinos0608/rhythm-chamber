/**
 * Unit Tests for Universal Schema System
 *
 * Tests for provider-agnostic schema format and adapters
 */

import { describe, it, expect } from 'vitest';
import { UniversalSchema } from '../../js/functions/schemas/universal-schema.js';

// ==========================================
// Test Schema
// ==========================================

const testSchema = {
  name: 'get_top_artists',
  description: "Get the user's top artists by play count",
  parameters: [
    {
      name: 'limit',
      type: 'number',
      description: 'Maximum number of artists to return',
      required: false,
    },
    {
      name: 'time_range',
      type: 'string',
      description: 'Time range for the query',
      required: true,
      enum: ['all_time', 'last_year', 'last_month'],
    },
  ],
};

const nestedSchema = {
  name: 'get_listening_stats',
  description: 'Get detailed listening statistics',
  parameters: [
    {
      name: 'filters',
      type: 'object',
      description: 'Query filters',
      required: true,
      properties: {
        year: { type: 'number', description: 'Year to filter' },
        genres: { type: 'array', description: 'Genres to include', items: { type: 'string' } },
      },
    },
  ],
};

// ==========================================
// OpenAI Adapter Tests
// ==========================================

describe('UniversalSchema toOpenAI', () => {
  it('should convert simple schema to OpenAI format', () => {
    const result = UniversalSchema.toOpenAI(testSchema);

    expect(result.type).toBe('function');
    expect(result.function.name).toBe('get_top_artists');
    expect(result.function.description).toBe(testSchema.description);
    expect(result.function.parameters.type).toBe('object');
    expect(result.function.parameters.properties.limit.type).toBe('number');
    expect(result.function.parameters.properties.time_range.enum).toEqual([
      'all_time',
      'last_year',
      'last_month',
    ]);
    expect(result.function.parameters.required).toEqual(['time_range']);
  });

  it('should handle nested object parameters', () => {
    const result = UniversalSchema.toOpenAI(nestedSchema);

    expect(result.function.parameters.properties.filters.type).toBe('object');
    expect(result.function.parameters.properties.filters.properties.year.type).toBe('number');
    expect(result.function.parameters.properties.filters.properties.genres.type).toBe('array');
  });
});

// ==========================================
// Anthropic Adapter Tests
// ==========================================

describe('UniversalSchema toAnthropic', () => {
  it('should convert to Anthropic tool format', () => {
    const result = UniversalSchema.toAnthropic(testSchema);

    expect(result.name).toBe('get_top_artists');
    expect(result.description).toBe(testSchema.description);
    expect(result.input_schema.type).toBe('object');
    expect(result.input_schema.properties.limit.type).toBe('number');
    expect(result.input_schema.required).toEqual(['time_range']);
  });

  it('should handle nested parameters', () => {
    const result = UniversalSchema.toAnthropic(nestedSchema);

    expect(result.input_schema.properties.filters.type).toBe('object');
    expect(result.input_schema.properties.filters.properties.genres.items.type).toBe('string');
  });
});

// ==========================================
// Gemini Adapter Tests
// ==========================================

describe('UniversalSchema toGemini', () => {
  it('should convert to Gemini function declaration format', () => {
    const result = UniversalSchema.toGemini(testSchema);

    expect(result.name).toBe('get_top_artists');
    expect(result.description).toBe(testSchema.description);
    expect(result.parameters.type).toBe('OBJECT');
    expect(result.parameters.properties.limit.type).toBe('NUMBER');
    expect(result.parameters.properties.time_range.type).toBe('STRING');
    expect(result.parameters.required).toEqual(['time_range']);
  });

  it('should use uppercase type names for Gemini', () => {
    const result = UniversalSchema.toGemini(nestedSchema);

    expect(result.parameters.properties.filters.type).toBe('OBJECT');
    expect(result.parameters.properties.filters.properties.genres.type).toBe('ARRAY');
  });
});

// ==========================================
// Utility Function Tests
// ==========================================

describe('UniversalSchema Utilities', () => {
  it('should convert multiple schemas at once', () => {
    const schemas = [testSchema, nestedSchema];
    const results = UniversalSchema.convertSchemas(schemas, 'openai');

    expect(results).toHaveLength(2);
    expect(results[0].function.name).toBe('get_top_artists');
    expect(results[1].function.name).toBe('get_listening_stats');
  });

  it('should throw for unknown provider', () => {
    expect(() => UniversalSchema.convertSchemas([testSchema], 'unknown')).toThrow(
      /Unknown provider/
    );
  });

  it('should create schema from simplified definition', () => {
    const schema = UniversalSchema.createSchema('test_function', 'A test function', {
      param1: { type: 'string', description: 'First param', required: true },
      param2: { type: 'number', description: 'Second param' },
    });

    expect(schema.name).toBe('test_function');
    expect(schema.parameters).toHaveLength(2);
    expect(schema.parameters[0].required).toBe(true);
    expect(schema.parameters[1].required).toBe(false);
    expect(schema.schemaVersion).toBeDefined();
  });
});
