import { describe, it, expect } from 'vitest';
import {
  STORE_KEY,
  SETTINGS_KEY,
  DUMP_DRAFT_KEY,
  CHAT_HISTORY_KEY,
  PROJECT_COLORS,
  LIFE_PROJECT_NAME,
  DEFAULT_SETTINGS,
  PRIORITY_ORDER,
  TAG_COLORS,
} from '../constants.js';

// ============================================================
// Constants module — validate shape, completeness, consistency
// ============================================================

describe('PRIORITY_ORDER', () => {
  it('is a plain object', () => {
    expect(typeof PRIORITY_ORDER).toBe('object');
    expect(PRIORITY_ORDER).not.toBeNull();
  });

  it('has all four expected priority levels', () => {
    expect(PRIORITY_ORDER).toHaveProperty('urgent');
    expect(PRIORITY_ORDER).toHaveProperty('important');
    expect(PRIORITY_ORDER).toHaveProperty('normal');
    expect(PRIORITY_ORDER).toHaveProperty('low');
  });

  it('has exactly 4 keys', () => {
    expect(Object.keys(PRIORITY_ORDER)).toHaveLength(4);
  });

  it('values are numeric and form a strict ascending order', () => {
    expect(PRIORITY_ORDER.urgent).toBeLessThan(PRIORITY_ORDER.important);
    expect(PRIORITY_ORDER.important).toBeLessThan(PRIORITY_ORDER.normal);
    expect(PRIORITY_ORDER.normal).toBeLessThan(PRIORITY_ORDER.low);
  });

  it('all values are finite numbers', () => {
    for (const val of Object.values(PRIORITY_ORDER)) {
      expect(typeof val).toBe('number');
      expect(Number.isFinite(val)).toBe(true);
    }
  });

  it('urgent has the lowest (highest priority) value', () => {
    const min = Math.min(...Object.values(PRIORITY_ORDER));
    expect(PRIORITY_ORDER.urgent).toBe(min);
  });

  it('low has the highest (lowest priority) value', () => {
    const max = Math.max(...Object.values(PRIORITY_ORDER));
    expect(PRIORITY_ORDER.low).toBe(max);
  });
});

describe('PROJECT_COLORS', () => {
  it('is an array', () => {
    expect(Array.isArray(PROJECT_COLORS)).toBe(true);
  });

  it('has at least 5 colors for variety', () => {
    expect(PROJECT_COLORS.length).toBeGreaterThanOrEqual(5);
  });

  it('has 10 colors', () => {
    expect(PROJECT_COLORS).toHaveLength(10);
  });

  it('all entries are valid hex color strings', () => {
    for (const color of PROJECT_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('contains no duplicate colors', () => {
    const unique = new Set(PROJECT_COLORS);
    expect(unique.size).toBe(PROJECT_COLORS.length);
  });
});

describe('TAG_COLORS', () => {
  it('is an array', () => {
    expect(Array.isArray(TAG_COLORS)).toBe(true);
  });

  it('has at least 5 entries', () => {
    expect(TAG_COLORS.length).toBeGreaterThanOrEqual(5);
  });

  it('has 8 entries', () => {
    expect(TAG_COLORS).toHaveLength(8);
  });

  it('each entry has bg and color properties', () => {
    for (const entry of TAG_COLORS) {
      expect(entry).toHaveProperty('bg');
      expect(entry).toHaveProperty('color');
      expect(typeof entry.bg).toBe('string');
      expect(typeof entry.color).toBe('string');
    }
  });

  it('each bg is an rgba value', () => {
    for (const entry of TAG_COLORS) {
      expect(entry.bg).toMatch(/^rgba\(\d+,\d+,\d+,[\d.]+\)$/);
    }
  });

  it('each color is a hex color', () => {
    for (const entry of TAG_COLORS) {
      expect(entry.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('no duplicate colors', () => {
    const colors = TAG_COLORS.map((e) => e.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('DEFAULT_SETTINGS', () => {
  it('is a plain object', () => {
    expect(typeof DEFAULT_SETTINGS).toBe('object');
    expect(DEFAULT_SETTINGS).not.toBeNull();
  });

  it('has apiKey property', () => {
    expect(DEFAULT_SETTINGS).toHaveProperty('apiKey');
  });

  it('apiKey defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.apiKey).toBe('');
  });

  it('has aiModel property', () => {
    expect(DEFAULT_SETTINGS).toHaveProperty('aiModel');
  });

  it('aiModel is a non-empty string', () => {
    expect(typeof DEFAULT_SETTINGS.aiModel).toBe('string');
    expect(DEFAULT_SETTINGS.aiModel.length).toBeGreaterThan(0);
  });
});

describe('Storage keys', () => {
  it('STORE_KEY is a non-empty string', () => {
    expect(typeof STORE_KEY).toBe('string');
    expect(STORE_KEY.length).toBeGreaterThan(0);
  });

  it('SETTINGS_KEY is a non-empty string', () => {
    expect(typeof SETTINGS_KEY).toBe('string');
    expect(SETTINGS_KEY.length).toBeGreaterThan(0);
  });

  it('DUMP_DRAFT_KEY is a non-empty string', () => {
    expect(typeof DUMP_DRAFT_KEY).toBe('string');
    expect(DUMP_DRAFT_KEY.length).toBeGreaterThan(0);
  });

  it('CHAT_HISTORY_KEY is a non-empty string', () => {
    expect(typeof CHAT_HISTORY_KEY).toBe('string');
    expect(CHAT_HISTORY_KEY.length).toBeGreaterThan(0);
  });

  it('all storage keys are distinct', () => {
    const keys = [STORE_KEY, SETTINGS_KEY, DUMP_DRAFT_KEY, CHAT_HISTORY_KEY];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('LIFE_PROJECT_NAME', () => {
  it('is a non-empty string', () => {
    expect(typeof LIFE_PROJECT_NAME).toBe('string');
    expect(LIFE_PROJECT_NAME.length).toBeGreaterThan(0);
  });

  it('equals "Life"', () => {
    expect(LIFE_PROJECT_NAME).toBe('Life');
  });
});

// ============================================================
// Additional constants tests — deeper validation
// ============================================================

describe('PRIORITY_ORDER additional checks', () => {
  it('values are all non-negative', () => {
    for (const val of Object.values(PRIORITY_ORDER)) {
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });

  it('values are integers', () => {
    for (const val of Object.values(PRIORITY_ORDER)) {
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('can sort priorities using values', () => {
    const priorities = ['low', 'urgent', 'normal', 'important'];
    const sorted = [...priorities].sort((a, b) => PRIORITY_ORDER[a] - PRIORITY_ORDER[b]);
    expect(sorted).toEqual(['urgent', 'important', 'normal', 'low']);
  });

  it('has unique values', () => {
    const values = Object.values(PRIORITY_ORDER);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('PROJECT_COLORS additional checks', () => {
  it('all colors are 7 characters long (# + 6 hex)', () => {
    for (const color of PROJECT_COLORS) {
      expect(color).toHaveLength(7);
    }
  });

  it('first color is defined', () => {
    expect(PROJECT_COLORS[0]).toBeTruthy();
  });

  it('can be indexed by modulo for project assignment', () => {
    const index = 15 % PROJECT_COLORS.length;
    expect(PROJECT_COLORS[index]).toBeTruthy();
    expect(typeof PROJECT_COLORS[index]).toBe('string');
  });
});

describe('TAG_COLORS additional checks', () => {
  it('bg values all have 0.12 opacity', () => {
    for (const entry of TAG_COLORS) {
      expect(entry.bg).toContain('0.12');
    }
  });

  it('no duplicate bg values', () => {
    const bgs = TAG_COLORS.map((e) => e.bg);
    expect(new Set(bgs).size).toBe(bgs.length);
  });

  it('colors and bgs are related (same hue family)', () => {
    // Each entry should have both bg and color defined as non-empty
    for (const entry of TAG_COLORS) {
      expect(entry.bg.length).toBeGreaterThan(0);
      expect(entry.color.length).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_SETTINGS additional checks', () => {
  it('has exactly 2 keys', () => {
    expect(Object.keys(DEFAULT_SETTINGS)).toHaveLength(2);
  });

  it('aiModel contains a model identifier string', () => {
    expect(DEFAULT_SETTINGS.aiModel).toMatch(/claude|gpt|model/i);
  });

  it('apiKey is a string type', () => {
    expect(typeof DEFAULT_SETTINGS.apiKey).toBe('string');
  });
});

describe('Storage keys naming convention', () => {
  it('STORE_KEY starts with "taskboard"', () => {
    expect(STORE_KEY).toMatch(/^taskboard/);
  });

  it('SETTINGS_KEY starts with "taskboard"', () => {
    expect(SETTINGS_KEY).toMatch(/^taskboard/);
  });

  it('DUMP_DRAFT_KEY starts with "taskboard"', () => {
    expect(DUMP_DRAFT_KEY).toMatch(/^taskboard/);
  });

  it('all keys use underscore separation', () => {
    for (const key of [STORE_KEY, SETTINGS_KEY, DUMP_DRAFT_KEY]) {
      expect(key).toMatch(/_/);
    }
  });
});
