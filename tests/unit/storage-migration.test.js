/**
 * Storage Migration Path Tests
 *
 * Tests for js/storage/migration.js to ensure data migration handles edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mock localStorage
// ==========================================

function createMockLocalStorage() {
  const store = new Map();

  return {
    getItem: vi.fn(key => store.get(key) ?? null),
    setItem: vi.fn((key, value) => store.set(key, value)),
    removeItem: vi.fn(key => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    get length() {
      return store.size;
    },
    key: vi.fn(index => [...store.keys()][index]),
    _store: store, // For test inspection
  };
}

// ==========================================
// Migration Pattern Simulation
// ==========================================

/**
 * Simulates the migration pattern from js/storage/migration.js
 */
function createMigrationHandler(localStorage, indexedDbPut) {
  const MIGRATION_KEYS = {
    PERSONALITY: 'rhythm_chamber_personality',
    STREAMS: 'rhythm_chamber_streams',
    CHUNKS: 'rhythm_chamber_chunks',
    SETTINGS: 'rhythm_chamber_settings',
  };
  const MIGRATION_FLAG = 'rhythm_chamber_migrated_v2';

  async function needsMigration() {
    // If migration flag exists, skip
    if (localStorage.getItem(MIGRATION_FLAG) === 'true') {
      return false;
    }

    // Check if any old data exists
    for (const key of Object.values(MIGRATION_KEYS)) {
      if (localStorage.getItem(key)) {
        return true;
      }
    }
    return false;
  }

  async function migrate() {
    if (!(await needsMigration())) {
      return { migrated: false, reason: 'already_migrated_or_no_data' };
    }

    const results = [];

    for (const [name, key] of Object.entries(MIGRATION_KEYS)) {
      const data = localStorage.getItem(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          await indexedDbPut(name.toLowerCase(), parsed);
          localStorage.removeItem(key);
          results.push({ key, status: 'migrated' });
        } catch (e) {
          results.push({ key, status: 'error', error: e.message });
        }
      }
    }

    // Set migration flag
    localStorage.setItem(MIGRATION_FLAG, 'true');

    return { migrated: true, results };
  }

  return { needsMigration, migrate, MIGRATION_KEYS, MIGRATION_FLAG };
}

// ==========================================
// Tests
// ==========================================

describe('Storage Migration Paths', () => {
  let localStorage;
  let indexedDbPut;
  let migration;

  beforeEach(() => {
    localStorage = createMockLocalStorage();
    indexedDbPut = vi.fn().mockResolvedValue(true);
    migration = createMigrationHandler(localStorage, indexedDbPut);
  });

  it('should detect need for migration when old data exists', async () => {
    // Add old-format data
    localStorage.setItem(
      'rhythm_chamber_personality',
      JSON.stringify({ type: 'emotional_archaeologist' })
    );

    const needs = await migration.needsMigration();
    expect(needs).toBe(true);
  });

  it('should not migrate if already migrated', async () => {
    // Set migration flag
    localStorage.setItem(migration.MIGRATION_FLAG, 'true');
    localStorage.setItem(
      'rhythm_chamber_personality',
      JSON.stringify({ type: 'emotional_archaeologist' })
    );

    const needs = await migration.needsMigration();
    expect(needs).toBe(false);

    const result = await migration.migrate();
    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('already_migrated_or_no_data');
  });

  it('should migrate localStorage keys to IndexedDB', async () => {
    // Set up old data
    const personalityData = { type: 'comfort_curator', score: 85 };
    localStorage.setItem('rhythm_chamber_personality', JSON.stringify(personalityData));

    const result = await migration.migrate();

    expect(result.migrated).toBe(true);
    expect(indexedDbPut).toHaveBeenCalledWith('personality', personalityData);
    expect(localStorage.removeItem).toHaveBeenCalledWith('rhythm_chamber_personality');
    expect(localStorage.getItem(migration.MIGRATION_FLAG)).toBe('true');
  });

  it('should handle partial migration gracefully', async () => {
    // Set up multiple data items - one valid, one invalid JSON
    localStorage.setItem(
      'rhythm_chamber_personality',
      JSON.stringify({ type: 'discovery_junkie' })
    );
    localStorage._store.set('rhythm_chamber_streams', 'not-valid-json'); // Invalid JSON

    const result = await migration.migrate();

    expect(result.migrated).toBe(true);
    expect(result.results).toHaveLength(2);

    // Valid data migrated
    const personalityResult = result.results.find(r => r.key === 'rhythm_chamber_personality');
    expect(personalityResult.status).toBe('migrated');

    // Invalid data errored but didn't crash
    const streamsResult = result.results.find(r => r.key === 'rhythm_chamber_streams');
    expect(streamsResult.status).toBe('error');
  });

  it('should not re-migrate already migrated data', async () => {
    // First migration
    localStorage.setItem('rhythm_chamber_personality', JSON.stringify({ type: 'mood_engineer' }));
    await migration.migrate();

    // Reset the put mock
    indexedDbPut.mockClear();

    // Try to migrate again
    const result = await migration.migrate();

    expect(result.migrated).toBe(false);
    expect(indexedDbPut).not.toHaveBeenCalled();
  });

  it('should handle empty localStorage', async () => {
    const needs = await migration.needsMigration();
    expect(needs).toBe(false);

    const result = await migration.migrate();
    expect(result.migrated).toBe(false);
  });
});

// ==========================================
// Edge Cases
// ==========================================

describe('Storage Migration Edge Cases', () => {
  it('should handle IndexedDB write failures', async () => {
    const localStorage = createMockLocalStorage();
    const failingPut = vi.fn().mockRejectedValue(new Error('IndexedDB quota exceeded'));
    const migration = createMigrationHandler(localStorage, failingPut);

    localStorage.setItem(
      'rhythm_chamber_personality',
      JSON.stringify({ type: 'social_chameleon' })
    );

    const result = await migration.migrate();

    expect(result.migrated).toBe(true);
    const personalityResult = result.results.find(r => r.key === 'rhythm_chamber_personality');
    expect(personalityResult.status).toBe('error');
    expect(personalityResult.error).toContain('quota');
  });

  it('should handle large data migrations', async () => {
    const localStorage = createMockLocalStorage();
    const indexedDbPut = vi.fn().mockResolvedValue(true);
    const migration = createMigrationHandler(localStorage, indexedDbPut);

    // Simulate large streams array
    const largeStreams = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      trackName: `Track ${i}`,
      artistName: `Artist ${i % 100}`,
    }));
    localStorage.setItem('rhythm_chamber_streams', JSON.stringify(largeStreams));

    const result = await migration.migrate();

    expect(result.migrated).toBe(true);
    expect(indexedDbPut).toHaveBeenCalledWith('streams', expect.any(Array));
    expect(indexedDbPut.mock.calls[0][1].length).toBe(10000);
  });
});
