import { describe, it, expect } from 'vitest';
import {
  esc,
  sanitizeAIHTML,
  normalizeTitle,
  titleSimilarity,
  highlightMatch,
  genId,
  parseNaturalDate,
} from '../app.js';

// ============================================================
// These tests import from the REAL app.js — not re-implementations
// ============================================================

describe('esc() - HTML escaping', () => {
  it('escapes HTML special characters', () => {
    expect(esc('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('handles null and undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('handles numbers', () => {
    expect(esc(42)).toBe('42');
  });

  it('escapes backticks', () => {
    expect(esc('`test`')).toBe('&#96;test&#96;');
  });

  it('escapes single quotes', () => {
    expect(esc("it's")).toBe('it&#39;s');
  });
});

describe('sanitizeAIHTML() - XSS prevention', () => {
  it('renders bold markdown safely', () => {
    expect(sanitizeAIHTML('**bold text**')).toBe('<strong>bold text</strong>');
  });

  it('renders italic markdown safely', () => {
    expect(sanitizeAIHTML('*italic text*')).toBe('<em>italic text</em>');
  });

  it('converts newlines to br', () => {
    expect(sanitizeAIHTML('line1\nline2')).toBe('line1<br>line2');
  });

  it('prevents XSS via script tags', () => {
    const result = sanitizeAIHTML('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('prevents XSS via img onerror', () => {
    const result = sanitizeAIHTML('<img src=x onerror="alert(1)">');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  it('prevents XSS inside bold markers', () => {
    const result = sanitizeAIHTML('**<img src=x onerror=alert(1)>**');
    expect(result).not.toContain('<img');
  });

  it('escapes event handler attributes', () => {
    const result = sanitizeAIHTML('<div onmouseover="alert(1)">hover</div>');
    // The entire tag is escaped, so onmouseover is inside escaped text (not an active attribute)
    expect(result).not.toContain('<div');
    expect(result).toContain('&lt;div');
  });

  it('handles null input', () => {
    expect(sanitizeAIHTML(null)).toBe('');
  });

  it('handles nested markdown', () => {
    expect(sanitizeAIHTML('**bold *and italic***')).toContain('<strong>');
  });
});

describe('normalizeTitle()', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTitle('Hello, World!')).toBe('hello world');
  });

  it('collapses whitespace', () => {
    expect(normalizeTitle('  multiple   spaces  ')).toBe('multiple spaces');
  });

  it('handles empty string', () => {
    expect(normalizeTitle('')).toBe('');
  });

  it('handles null', () => {
    expect(normalizeTitle(null)).toBe('');
  });
});

describe('titleSimilarity()', () => {
  it('returns 1 for identical titles', () => {
    expect(titleSimilarity('Buy groceries', 'Buy groceries')).toBe(1);
  });

  it('returns 1 for titles differing only in case/punctuation', () => {
    expect(titleSimilarity('Buy Groceries!', 'buy groceries')).toBe(1);
  });

  it('returns 0.85 for substring match', () => {
    expect(titleSimilarity('Schedule meeting', 'Schedule meeting with Jane')).toBe(0.85);
  });

  it('returns low score for unrelated titles', () => {
    expect(titleSimilarity('Buy groceries', 'Fix deployment')).toBeLessThan(0.3);
  });
});

describe('genId()', () => {
  it('generates IDs with correct prefix', () => {
    expect(genId('t')).toMatch(/^t_[a-f0-9]{16}$/);
    expect(genId('p')).toMatch(/^p_[a-f0-9]{16}$/);
    expect(genId('st')).toMatch(/^st_[a-f0-9]{16}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()));
    expect(ids.size).toBe(100);
  });
});

describe('parseNaturalDate()', () => {
  it('parses "today"', () => {
    const result = parseNaturalDate('today');
    expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses "tomorrow"', () => {
    const result = parseNaturalDate('tomorrow');
    expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Verify it's 1 day after today (using local dates, not UTC)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expected =
      tomorrow.getFullYear() +
      '-' +
      String(tomorrow.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(tomorrow.getDate()).padStart(2, '0');
    expect(result.dueDate).toBe(expected);
  });

  it('parses "in 3 days"', () => {
    const result = parseNaturalDate('in 3 days');
    expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(today);
    target.setDate(target.getDate() + 3);
    const expected =
      target.getFullYear() +
      '-' +
      String(target.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(target.getDate()).padStart(2, '0');
    expect(result.dueDate).toBe(expected);
  });

  it('parses "in 2 weeks"', () => {
    const result = parseNaturalDate('in 2 weeks');
    expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses month day format "mar 20"', () => {
    const result = parseNaturalDate('mar 20');
    expect(result.dueDate).toMatch(/^\d{4}-03-20$/);
  });

  it('parses slash format "3/15"', () => {
    const result = parseNaturalDate('3/15');
    expect(result.dueDate).toMatch(/^\d{4}-03-15$/);
  });

  it('returns empty for unparseable input', () => {
    const result = parseNaturalDate('not a date at all');
    expect(result.dueDate).toBe('');
  });

  it('returns cleaned text without date portion', () => {
    const result = parseNaturalDate('meeting tomorrow at noon');
    expect(result.dueDate).toBeTruthy();
    expect(result.cleaned).not.toContain('tomorrow');
  });
});

describe('highlightMatch()', () => {
  it('wraps matching text in mark tags', () => {
    expect(highlightMatch('Hello World', 'world')).toContain('<mark>World</mark>');
  });

  it('returns original text when no match', () => {
    expect(highlightMatch('Hello', 'xyz')).toBe('Hello');
  });

  it('handles empty query', () => {
    expect(highlightMatch('Hello', '')).toBe('Hello');
  });
});
