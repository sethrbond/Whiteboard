import { describe, it, expect } from 'vitest';

// Test the extracted modules DIRECTLY (not via app.js re-exports)
import {
  PRIORITY_ORDER,
  PROJECT_COLORS,
  TAG_COLORS,
  DEFAULT_SETTINGS,
  STORE_KEY,
  SETTINGS_KEY,
  LIFE_PROJECT_NAME,
  MS_PER_DAY,
} from '../constants.js';
import {
  esc,
  sanitizeAIHTML,
  normalizeTitle,
  titleSimilarity,
  highlightMatch,
  genId,
  chunkText,
  fmtEstimate,
} from '../utils.js';
import { todayStr, localISO, fmtDate, relativeTime, parseNaturalDate } from '../dates.js';

// ============================================================
// constants.js
// ============================================================
describe('constants.js', () => {
  it('PRIORITY_ORDER has correct numeric ordering', () => {
    expect(PRIORITY_ORDER.urgent).toBe(0);
    expect(PRIORITY_ORDER.low).toBe(3);
  });

  it('PROJECT_COLORS has 10 hex colors', () => {
    expect(PROJECT_COLORS).toHaveLength(10);
    PROJECT_COLORS.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });

  it('TAG_COLORS has bg and color properties', () => {
    expect(TAG_COLORS.length).toBeGreaterThan(0);
    TAG_COLORS.forEach((tc) => {
      expect(tc).toHaveProperty('bg');
      expect(tc).toHaveProperty('color');
      expect(tc.color).toMatch(/^#/);
    });
  });

  it('DEFAULT_SETTINGS has empty apiKey and a model', () => {
    expect(DEFAULT_SETTINGS.apiKey).toBe('');
    expect(DEFAULT_SETTINGS.aiModel).toBeTruthy();
  });

  it('storage keys are non-empty strings', () => {
    expect(STORE_KEY).toBeTruthy();
    expect(SETTINGS_KEY).toBeTruthy();
  });

  it('LIFE_PROJECT_NAME is Life', () => {
    expect(LIFE_PROJECT_NAME).toBe('Life');
  });

  it('DEFAULT_SETTINGS has expected shape', () => {
    expect(DEFAULT_SETTINGS).toHaveProperty('apiKey');
    expect(DEFAULT_SETTINGS).toHaveProperty('aiModel');
    expect(typeof DEFAULT_SETTINGS.apiKey).toBe('string');
    expect(typeof DEFAULT_SETTINGS.aiModel).toBe('string');
  });

  it('PRIORITY_ORDER covers all 4 levels', () => {
    expect(Object.keys(PRIORITY_ORDER)).toHaveLength(4);
    expect(PRIORITY_ORDER.urgent).toBeLessThan(PRIORITY_ORDER.low);
  });

  it('TAG_COLORS bg values are rgba format', () => {
    TAG_COLORS.forEach((tc) => {
      expect(tc.bg).toMatch(/^rgba\(/);
    });
  });
});

// ============================================================
// utils.js
// ============================================================
describe('utils.js — esc()', () => {
  it('escapes all dangerous characters', () => {
    expect(esc('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('escapes backticks', () => {
    expect(esc('`code`')).toBe('&#96;code&#96;');
  });

  it('handles numbers', () => {
    expect(esc(0)).toBe('0');
    expect(esc(42)).toBe('42');
  });

  it('handles null/undefined/empty', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc('')).toBe('');
  });
});

describe('utils.js — sanitizeAIHTML()', () => {
  it('converts markdown bold', () => {
    expect(sanitizeAIHTML('**hello**')).toBe('<strong>hello</strong>');
  });

  it('converts markdown italic', () => {
    expect(sanitizeAIHTML('*world*')).toBe('<em>world</em>');
  });

  it('converts newlines to <br>', () => {
    expect(sanitizeAIHTML('a\nb')).toBe('a<br>b');
  });

  it('escapes HTML before converting markdown', () => {
    const result = sanitizeAIHTML('<script>**bold**</script>');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });
});

describe('utils.js — normalizeTitle()', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTitle('Hello, World!')).toBe('hello world');
  });

  it('collapses whitespace', () => {
    expect(normalizeTitle('  a   b  ')).toBe('a b');
  });

  it('handles special characters', () => {
    expect(normalizeTitle('café & résumé')).toBe('caf rsum');
  });
});

describe('utils.js — titleSimilarity()', () => {
  it('returns 1 for identical normalized titles', () => {
    expect(titleSimilarity('Hello!', 'hello')).toBe(1);
  });

  it('returns 0.85 for substring match', () => {
    expect(titleSimilarity('buy groceries', 'buy groceries at store')).toBe(0.85);
  });

  it('returns low score for unrelated', () => {
    expect(titleSimilarity('abc', 'xyz')).toBeLessThan(0.3);
  });

  it('handles empty strings', () => {
    expect(titleSimilarity('', '')).toBe(1);
  });
});

describe('utils.js — genId()', () => {
  it('uses default prefix t', () => {
    expect(genId()).toMatch(/^t_/);
  });

  it('uses custom prefix', () => {
    expect(genId('p')).toMatch(/^p_/);
    expect(genId('st')).toMatch(/^st_/);
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 50 }, () => genId()));
    expect(ids.size).toBe(50);
  });
});

describe('utils.js — chunkText()', () => {
  it('returns single chunk for short text', () => {
    expect(chunkText('short', 100)).toEqual(['short']);
  });

  it('splits long text preserving content', () => {
    const text = 'x'.repeat(200);
    const chunks = chunkText(text, 50);
    expect(chunks.join('')).toBe(text);
    expect(chunks.length).toBe(4);
  });

  it('prefers paragraph boundaries', () => {
    const text = 'A'.repeat(40) + '\n\n' + 'B'.repeat(40);
    const chunks = chunkText(text, 50);
    expect(chunks[0].trim()).toBe('A'.repeat(40));
  });
});

describe('utils.js — fmtEstimate()', () => {
  it('formats minutes', () => {
    expect(fmtEstimate(30)).toBe('30m');
  });

  it('formats hours', () => {
    expect(fmtEstimate(120)).toBe('2h');
  });

  it('formats hours and minutes', () => {
    expect(fmtEstimate(90)).toBe('1h 30m');
  });

  it('returns empty for zero/null', () => {
    expect(fmtEstimate(0)).toBe('');
    expect(fmtEstimate(null)).toBe('');
    expect(fmtEstimate(-5)).toBe('');
  });
});

describe('utils.js — highlightMatch()', () => {
  it('wraps match in <mark>', () => {
    expect(highlightMatch('Hello World', 'world')).toBe('Hello <mark>World</mark>');
  });

  it('returns original when no match', () => {
    expect(highlightMatch('abc', 'xyz')).toBe('abc');
  });

  it('returns original for empty query', () => {
    expect(highlightMatch('abc', '')).toBe('abc');
  });

  it('is case-insensitive but preserves original case', () => {
    expect(highlightMatch('FooBar', 'foo')).toBe('<mark>Foo</mark>Bar');
  });
});

// ============================================================
// dates.js
// ============================================================
describe('dates.js — todayStr()', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is cached (same value on repeated calls)', () => {
    expect(todayStr()).toBe(todayStr());
  });
});

describe('dates.js — localISO()', () => {
  it('formats date correctly', () => {
    expect(localISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localISO(new Date(2026, 11, 25))).toBe('2026-12-25');
  });

  it('pads single digits', () => {
    expect(localISO(new Date(2026, 2, 3))).toBe('2026-03-03');
  });
});

describe('dates.js — fmtDate()', () => {
  it('returns Today for today', () => {
    expect(fmtDate(todayStr())).toBe('Today');
  });

  it('returns Tomorrow for tomorrow', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    expect(fmtDate(localISO(d))).toBe('Tomorrow');
  });

  it('returns Yesterday for yesterday', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(fmtDate(localISO(d))).toBe('Yesterday');
  });

  it('returns weekday name for dates 2-7 days ahead', () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const result = fmtDate(localISO(d));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(dayNames).toContain(result);
  });

  it('returns month+day for dates > 7 days away', () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const result = fmtDate(localISO(d));
    // Should be like "Apr 14" format
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it('returns empty for falsy input', () => {
    expect(fmtDate('')).toBe('');
    expect(fmtDate(null)).toBe('');
    expect(fmtDate(undefined)).toBe('');
  });
});

describe('dates.js — relativeTime()', () => {
  it('returns "just now" for recent time', () => {
    expect(relativeTime(new Date().toISOString())).toBe('just now');
  });

  it('returns minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60000);
    expect(relativeTime(d.toISOString())).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const d = new Date(Date.now() - 3 * 3600000);
    expect(relativeTime(d.toISOString())).toBe('3h ago');
  });

  it('returns "yesterday" for 1 day ago', () => {
    const d = new Date(Date.now() - 25 * 3600000);
    expect(relativeTime(d.toISOString())).toBe('yesterday');
  });

  it('returns days ago for 2-29 days', () => {
    const d = new Date(Date.now() - 5 * MS_PER_DAY);
    expect(relativeTime(d.toISOString())).toBe('5d ago');
  });

  it('returns month+day for 30+ days ago', () => {
    const d = new Date(Date.now() - 60 * MS_PER_DAY);
    const result = relativeTime(d.toISOString());
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it('returns empty for falsy', () => {
    expect(relativeTime(null)).toBe('');
    expect(relativeTime('')).toBe('');
  });
});

describe('dates.js — parseNaturalDate()', () => {
  it('parses "today"', () => {
    const r = parseNaturalDate('finish today');
    expect(r.dueDate).toBe(todayStr());
    expect(r.cleaned).toBe('finish');
  });

  it('parses "tomorrow"', () => {
    const r = parseNaturalDate('do this tomorrow');
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.cleaned).not.toContain('tomorrow');
  });

  it('parses "in N days"', () => {
    const r = parseNaturalDate('review in 5 days');
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const expected = new Date();
    expected.setHours(0, 0, 0, 0);
    expected.setDate(expected.getDate() + 5);
    expect(r.dueDate).toBe(localISO(expected));
  });

  it('parses "in N weeks"', () => {
    const r = parseNaturalDate('in 2 weeks');
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses month/day format', () => {
    const r = parseNaturalDate('deadline 3/15');
    expect(r.dueDate).toMatch(/^\d{4}-03-15$/);
  });

  it('parses month name format', () => {
    const r = parseNaturalDate('launch jan 20');
    expect(r.dueDate).toMatch(/^\d{4}-01-20$/);
  });

  it('returns empty dueDate for unparseable', () => {
    const r = parseNaturalDate('just a regular task');
    expect(r.dueDate).toBe('');
    expect(r.cleaned).toBe('just a regular task');
  });

  it('parses "end of month"', () => {
    const r = parseNaturalDate('end of month');
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    expect(r.dueDate).toBe(localISO(lastDay));
  });

  it('parses "next week"', () => {
    const r = parseNaturalDate('next week');
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses day name like "friday"', () => {
    const r = parseNaturalDate('finish report friday');
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.cleaned).not.toMatch(/friday/i);
    // The parsed date should be a Friday (day 5)
    const d = new Date(r.dueDate + 'T00:00:00');
    expect(d.getDay()).toBe(5);
  });

  it('parses short day name like "tue"', () => {
    const r = parseNaturalDate('meeting tue');
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date(r.dueDate + 'T00:00:00');
    expect(d.getDay()).toBe(2); // Tuesday
  });

  it('parses "next monday" as a week+ away', () => {
    const r = parseNaturalDate('start next monday');
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date(r.dueDate + 'T00:00:00');
    expect(d.getDay()).toBe(1); // Monday
    // "next monday" should be at least 7 days from now
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(d.getTime() - today.getTime()).toBeGreaterThan(6 * MS_PER_DAY);
  });

  it('returns future date for month/day in the past this year', () => {
    // If we parse "1/1" (Jan 1) and it's already past Jan 1, it should give next year
    const r = parseNaturalDate('deadline 1/1');
    expect(r.dueDate).toMatch(/^\d{4}-01-01$/);
    const parsed = new Date(r.dueDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(parsed.getTime()).toBeGreaterThanOrEqual(today.getTime());
  });

  it('handles empty input', () => {
    const r = parseNaturalDate('');
    expect(r.dueDate).toBe('');
    expect(r.cleaned).toBe('');
  });

  it('handles whitespace-only input', () => {
    const r = parseNaturalDate('   ');
    expect(r.dueDate).toBe('');
    expect(r.cleaned.trim()).toBe('');
  });

  it('preserves task text when extracting date', () => {
    const r = parseNaturalDate('buy groceries tomorrow morning');
    expect(r.cleaned).not.toContain('tomorrow');
    expect(r.cleaned).toContain('buy groceries');
  });

  it('parses M/D/YYYY format', () => {
    const r = parseNaturalDate('deadline 3/15/2027');
    expect(r.dueDate).toBe('2027-03-15');
  });

  it('parses month name with ordinal suffix', () => {
    const r = parseNaturalDate('due march 5th');
    expect(r.dueDate).toMatch(/^\d{4}-03-05$/);
  });

  it('parses "in 1 day" as tomorrow', () => {
    const r = parseNaturalDate('in 1 day');
    const expected = new Date();
    expected.setHours(0, 0, 0, 0);
    expected.setDate(expected.getDate() + 1);
    expect(r.dueDate).toBe(localISO(expected));
  });
});

describe('dates.js — fmtDate() edge cases', () => {
  it('formats dates far in the past', () => {
    const result = fmtDate('2020-01-15');
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it('formats dates far in the future', () => {
    const result = fmtDate('2030-12-25');
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe('dates.js — relativeTime() edge cases', () => {
  it('handles future dates gracefully', () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    const result = relativeTime(future);
    // Should return something without crashing
    expect(typeof result).toBe('string');
  });

  it('handles exactly 24 hours ago', () => {
    const d = new Date(Date.now() - 24 * 3600000);
    const result = relativeTime(d.toISOString());
    expect(result).toBe('yesterday');
  });

  it('handles exactly 2 days ago', () => {
    const d = new Date(Date.now() - 48 * 3600000);
    const result = relativeTime(d.toISOString());
    expect(result).toBe('2d ago');
  });

  it('handles 29 days ago (last before month format)', () => {
    const d = new Date(Date.now() - 29 * MS_PER_DAY);
    expect(relativeTime(d.toISOString())).toBe('29d ago');
  });

  it('handles 30 days ago (switches to month format)', () => {
    const d = new Date(Date.now() - 30 * MS_PER_DAY);
    const result = relativeTime(d.toISOString());
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});
