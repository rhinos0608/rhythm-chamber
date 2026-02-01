/**
 * Schema Unit Tests
 *
 * Tests for js/functions/schemas/ to ensure the "Intelligence Engine" schemas are valid.
 */

import { describe, it, expect } from 'vitest';
import { DataQuerySchemas } from '../../js/functions/schemas/data-queries.js';
import { AnalyticsQuerySchemas } from '../../js/functions/schemas/analytics-queries.js';
import { TemplateQuerySchemas } from '../../js/functions/schemas/template-queries.js';

// ==========================================
// Schema Structure Validation
// ==========================================

describe('Data Query Schemas', () => {
  it('should export an array of schemas', () => {
    expect(Array.isArray(DataQuerySchemas)).toBe(true);
    expect(DataQuerySchemas.length).toBeGreaterThan(0);
  });

  it('should have valid OpenAI function schema structure', () => {
    for (const schema of DataQuerySchemas) {
      // Type must be "function"
      expect(schema.type).toBe('function');

      // Function must have name, description, parameters
      expect(schema.function).toBeDefined();
      expect(typeof schema.function.name).toBe('string');
      expect(schema.function.name.length).toBeGreaterThan(0);
      expect(typeof schema.function.description).toBe('string');
      expect(schema.function.description.length).toBeGreaterThan(0);
      expect(schema.function.parameters).toBeDefined();
      expect(schema.function.parameters.type).toBe('object');
    }
  });

  it('should have unique function names', () => {
    const names = DataQuerySchemas.map(s => s.function.name);
    const uniqueNames = [...new Set(names)];
    expect(names.length).toBe(uniqueNames.length);
  });

  it('should define required parameters correctly', () => {
    for (const schema of DataQuerySchemas) {
      const params = schema.function.parameters;

      // Required should be an array if present
      if (params.required) {
        expect(Array.isArray(params.required)).toBe(true);

        // All required params should be defined in properties
        for (const required of params.required) {
          expect(params.properties[required]).toBeDefined();
        }
      }
    }
  });

  it('should have valid parameter types', () => {
    const validTypes = ['string', 'integer', 'number', 'boolean', 'array', 'object'];

    for (const schema of DataQuerySchemas) {
      const properties = schema.function.parameters.properties || {};

      for (const [paramName, paramDef] of Object.entries(properties)) {
        expect(validTypes).toContain(paramDef.type);
        expect(typeof paramDef.description).toBe('string');
      }
    }
  });

  it('should include core data functions', () => {
    const functionNames = DataQuerySchemas.map(s => s.function.name);
    expect(functionNames).toContain('get_top_artists');
    expect(functionNames).toContain('get_top_tracks');
    expect(functionNames).toContain('get_artist_history');
    expect(functionNames).toContain('get_listening_stats');
  });
});

describe('Analytics Query Schemas', () => {
  it('should export an array of schemas', () => {
    expect(Array.isArray(AnalyticsQuerySchemas)).toBe(true);
    expect(AnalyticsQuerySchemas.length).toBeGreaterThan(0);
  });

  it('should have valid OpenAI function schema structure', () => {
    for (const schema of AnalyticsQuerySchemas) {
      expect(schema.type).toBe('function');
      expect(schema.function).toBeDefined();
      expect(typeof schema.function.name).toBe('string');
      expect(typeof schema.function.description).toBe('string');
      expect(schema.function.parameters).toBeDefined();
    }
  });

  it('should include stats.fm-style functions', () => {
    const functionNames = AnalyticsQuerySchemas.map(s => s.function.name);
    expect(functionNames).toContain('get_bottom_tracks');
    expect(functionNames).toContain('get_bottom_artists');
    expect(functionNames).toContain('get_listening_clock');
    expect(functionNames).toContain('get_time_by_artist');
  });

  it('should include Spotify Wrapped-style functions', () => {
    const functionNames = AnalyticsQuerySchemas.map(s => s.function.name);
    expect(functionNames).toContain('get_discovery_stats');
    expect(functionNames).toContain('get_skip_patterns');
    expect(functionNames).toContain('get_completion_rate');
  });

  it('should have valid enum values', () => {
    for (const schema of AnalyticsQuerySchemas) {
      const properties = schema.function.parameters.properties || {};

      for (const [paramName, paramDef] of Object.entries(properties)) {
        if (paramDef.enum) {
          expect(Array.isArray(paramDef.enum)).toBe(true);
          expect(paramDef.enum.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('Template Query Schemas', () => {
  it('should export an array of schemas', () => {
    expect(Array.isArray(TemplateQuerySchemas)).toBe(true);
    expect(TemplateQuerySchemas.length).toBeGreaterThan(0);
  });

  it('should include template profile functions', () => {
    const functionNames = TemplateQuerySchemas.map(s => s.function.name);
    expect(functionNames).toContain('get_templates_by_genre');
    expect(functionNames).toContain('get_templates_with_pattern');
    expect(functionNames).toContain('get_templates_by_personality');
    expect(functionNames).toContain('synthesize_profile');
  });

  it('should have valid personality type enums', () => {
    const personalitySchema = TemplateQuerySchemas.find(
      s => s.function.name === 'get_templates_by_personality'
    );
    expect(personalitySchema).toBeDefined();

    const personalityParam = personalitySchema.function.parameters.properties.personality_type;
    expect(personalityParam.enum).toBeDefined();
    expect(personalityParam.enum).toContain('emotional_archaeologist');
    expect(personalityParam.enum).toContain('mood_engineer');
    expect(personalityParam.enum).toContain('discovery_junkie');
    expect(personalityParam.enum).toContain('comfort_curator');
    expect(personalityParam.enum).toContain('social_chameleon');
  });

  it('should have valid pattern type enums', () => {
    const patternSchema = TemplateQuerySchemas.find(
      s => s.function.name === 'get_templates_with_pattern'
    );
    expect(patternSchema).toBeDefined();

    const patternParam = patternSchema.function.parameters.properties.pattern_type;
    expect(patternParam.enum).toBeDefined();
    expect(patternParam.enum.length).toBeGreaterThan(0);
  });
});
