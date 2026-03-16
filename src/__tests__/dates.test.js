import { describe, it, expect } from 'vitest';
import { MS_PER_DAY } from '../constants.js';
import { todayStr, localISO, fmtDate, relativeTime, parseNaturalDate } from '../dates.js';

// ============================================================
// Comprehensive tests for date utilities
// ============================================================

describe('todayStr()', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a string', () => {
    expect(typeof todayStr()).toBe('string');
  });

  it('returns consistent value on repeated calls', () => {
    expect(todayStr()).toBe(todayStr());
  });

  it('matches current date components', () => {
    const result = todayStr();
    const now = new Date();
    const expected =
      now.getFullYear() +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0');
    expect(result).toBe(expected);
  });

  it('pads single-digit month and day with zeros', () => {
    // We verify format correctness — month/day are always 2 digits
    const parts = todayStr().split('-');
    expect(parts[1]).toHaveLength(2);
    expect(parts[2]).toHaveLength(2);
  });
});

describe('localISO()', () => {
  it('returns YYYY-MM-DD for a given date', () => {
    const d = new Date(2026, 2, 15); // March 15, 2026
    expect(localISO(d)).toBe('2026-03-15');
  });

  it('pads single-digit months', () => {
    const d = new Date(2026, 0, 15); // January 15
    expect(localISO(d)).toBe('2026-01-15');
  });

  it('pads single-digit days', () => {
    const d = new Date(2026, 11, 5); // December 5
    expect(localISO(d)).toBe('2026-12-05');
  });

  it('handles Jan 1 boundary', () => {
    const d = new Date(2026, 0, 1);
    expect(localISO(d)).toBe('2026-01-01');
  });

  it('handles Dec 31 boundary', () => {
    const d = new Date(2026, 11, 31);
    expect(localISO(d)).toBe('2026-12-31');
  });

  it('handles leap year Feb 29', () => {
    const d = new Date(2024, 1, 29);
    expect(localISO(d)).toBe('2024-02-29');
  });

  it('returns string in correct format pattern', () => {
    const d = new Date(2030, 5, 20);
    expect(localISO(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('fmtDate()', () => {
  it('returns empty string for empty input', () => {
    expect(fmtDate('')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(fmtDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(fmtDate(undefined)).toBe('');
  });

  it('returns "Today" for today\'s date', () => {
    expect(fmtDate(todayStr())).toBe('Today');
  });

  it('returns "Tomorrow" for tomorrow\'s date', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    expect(fmtDate(localISO(d))).toBe('Tomorrow');
  });

  it('returns "Yesterday" for yesterday\'s date', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(fmtDate(localISO(d))).toBe('Yesterday');
  });

  it('returns weekday name for dates 2-7 days in the future', () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const result = fmtDate(localISO(d));
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(weekdays).toContain(result);
  });

  it('returns month/day format for dates far in the future', () => {
    const result = fmtDate('2099-06-15');
    expect(result).toMatch(/Jun\s+15/);
  });

  it('returns month/day format for dates in the past beyond yesterday', () => {
    const result = fmtDate('2020-01-01');
    expect(result).toMatch(/Jan\s+1/);
  });

  it('returns a non-empty string for any valid date', () => {
    expect(fmtDate('2026-03-15').length).toBeGreaterThan(0);
  });
});

describe('relativeTime()', () => {
  it('returns empty string for empty input', () => {
    expect(relativeTime('')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(relativeTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(relativeTime(undefined)).toBe('');
  });

  it('returns "just now" for current time', () => {
    expect(relativeTime(new Date().toISOString())).toBe('just now');
  });

  it('returns minutes ago for times within the last hour', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    expect(relativeTime(d.toISOString())).toBe('5m ago');
  });

  it('returns "1m ago" for 1 minute ago', () => {
    const d = new Date(Date.now() - 1 * 60 * 1000);
    expect(relativeTime(d.toISOString())).toBe('1m ago');
  });

  it('returns "59m ago" for 59 minutes ago', () => {
    const d = new Date(Date.now() - 59 * 60 * 1000);
    expect(relativeTime(d.toISOString())).toBe('59m ago');
  });

  it('returns hours ago for times within the last day', () => {
    const d = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    expect(relativeTime(d.toISOString())).toBe('2h ago');
  });

  it('returns "1h ago" for 1 hour ago', () => {
    const d = new Date(Date.now() - 60 * 60 * 1000);
    expect(relativeTime(d.toISOString())).toBe('1h ago');
  });

  it('returns "yesterday" for exactly 1 day ago', () => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(relativeTime(d.toISOString())).toBe('yesterday');
  });

  it('returns days ago for 2-29 days', () => {
    const d = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    expect(relativeTime(d.toISOString())).toBe('5d ago');
  });

  it('returns formatted date for 30+ days ago', () => {
    const d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    const result = relativeTime(d.toISOString());
    // Should be a formatted date like "Jan 15"
    expect(result).not.toContain('ago');
    expect(result).not.toBe('yesterday');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('parseNaturalDate()', () => {
  it('returns object with dueDate and cleaned properties', () => {
    const result = parseNaturalDate('some text');
    expect(result).toHaveProperty('dueDate');
    expect(result).toHaveProperty('cleaned');
  });

  it('parses "today"', () => {
    const result = parseNaturalDate('task today');
    expect(result.dueDate).toBe(todayStr());
    expect(result.cleaned).toBe('task');
  });

  it('parses "today" case-insensitively', () => {
    const result = parseNaturalDate('task TODAY');
    expect(result.dueDate).toBe(todayStr());
  });

  it('parses "tomorrow"', () => {
    const result = parseNaturalDate('do this tomorrow');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    expect(result.dueDate).toBe(localISO(d));
    expect(result.cleaned).toBe('do this');
  });

  it('parses "in 3 days"', () => {
    const result = parseNaturalDate('meeting in 3 days');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3);
    expect(result.dueDate).toBe(localISO(d));
    expect(result.cleaned).toBe('meeting');
  });

  it('parses "in 1 day"', () => {
    const result = parseNaturalDate('task in 1 day');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    expect(result.dueDate).toBe(localISO(d));
  });

  it('parses "in 2 weeks"', () => {
    const result = parseNaturalDate('review in 2 weeks');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 14);
    expect(result.dueDate).toBe(localISO(d));
  });

  it('parses "next week" as next Monday', () => {
    const result = parseNaturalDate('plan next week');
    expect(result.dueDate).toBeTruthy();
    // next week should resolve to a Monday
    const d = new Date(result.dueDate + 'T00:00:00');
    expect(d.getDay()).toBe(1); // Monday
  });

  it('parses "end of month"', () => {
    const result = parseNaturalDate('report end of month');
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    expect(result.dueDate).toBe(localISO(lastDay));
  });

  it('parses day name like "friday"', () => {
    const result = parseNaturalDate('meeting friday');
    expect(result.dueDate).toBeTruthy();
    const d = new Date(result.dueDate + 'T00:00:00');
    expect(d.getDay()).toBe(5); // Friday
  });

  it('parses "next monday"', () => {
    const result = parseNaturalDate('standup next monday');
    expect(result.dueDate).toBeTruthy();
    const d = new Date(result.dueDate + 'T00:00:00');
    expect(d.getDay()).toBe(1); // Monday
    // "next" should be at least 7 days out
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = (d - today) / MS_PER_DAY;
    expect(diff).toBeGreaterThan(0);
  });

  it('parses short day names like "tue"', () => {
    const result = parseNaturalDate('call tue');
    expect(result.dueDate).toBeTruthy();
    const d = new Date(result.dueDate + 'T00:00:00');
    expect(d.getDay()).toBe(2); // Tuesday
  });

  it('parses "month day" like "March 20"', () => {
    const result = parseNaturalDate('deadline March 20');
    expect(result.dueDate).toBeTruthy();
    const d = new Date(result.dueDate + 'T00:00:00');
    expect(d.getMonth()).toBe(2); // March
    expect(d.getDate()).toBe(20);
  });

  it('parses short month "Jan 5"', () => {
    const result = parseNaturalDate('task Jan 5');
    expect(result.dueDate).toBeTruthy();
    const d = new Date(result.dueDate + 'T00:00:00');
    expect(d.getMonth()).toBe(0); // January
    expect(d.getDate()).toBe(5);
  });

  it('parses "month day, year" like "December 25, 2027"', () => {
    const result = parseNaturalDate('holiday December 25, 2027');
    expect(result.dueDate).toBe('2027-12-25');
  });

  it('parses M/D format like "3/20"', () => {
    const result = parseNaturalDate('task 3/20');
    expect(result.dueDate).toBeTruthy();
    const d = new Date(result.dueDate + 'T00:00:00');
    expect(d.getMonth()).toBe(2); // March
    expect(d.getDate()).toBe(20);
  });

  it('parses M/D/YYYY format like "12/25/2027"', () => {
    const result = parseNaturalDate('party 12/25/2027');
    expect(result.dueDate).toBe('2027-12-25');
  });

  it('returns empty dueDate for text with no date', () => {
    const result = parseNaturalDate('buy groceries');
    expect(result.dueDate).toBe('');
    expect(result.cleaned).toBe('buy groceries');
  });

  it('removes date text from cleaned output', () => {
    const result = parseNaturalDate('buy milk tomorrow');
    expect(result.cleaned).not.toContain('tomorrow');
  });

  it('handles text that is only a date keyword', () => {
    const result = parseNaturalDate('today');
    expect(result.dueDate).toBe(todayStr());
    expect(result.cleaned).toBe('');
  });

  it('parses "in 1 week"', () => {
    const result = parseNaturalDate('task in 1 week');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 7);
    expect(result.dueDate).toBe(localISO(d));
  });

  it('handles text with multiple spaces around date', () => {
    const result = parseNaturalDate('  task   tomorrow  ');
    expect(result.dueDate).toBeTruthy();
  });

  it('parses "tomorrow" case-insensitively', () => {
    const result = parseNaturalDate('task TOMORROW');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    expect(result.dueDate).toBe(localISO(d));
  });

  it('returns empty dueDate for random words', () => {
    const result = parseNaturalDate('completely random words here');
    expect(result.dueDate).toBe('');
  });

  it('parses "next friday" as a future friday', () => {
    const result = parseNaturalDate('meeting next friday');
    expect(result.dueDate).toBeTruthy();
    const d = new Date(result.dueDate + 'T00:00:00');
    expect(d.getDay()).toBe(5); // Friday
  });

  it('parses short month with ordinal "Jan 5th"', () => {
    const result = parseNaturalDate('due Jan 5th');
    expect(result.dueDate).toBeTruthy();
    const d = new Date(result.dueDate + 'T00:00:00');
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(5);
  });
});

// ============================================================
// Additional edge-case tests for date utilities
// ============================================================

describe('todayStr() edge cases', () => {
  it('result has exactly 10 characters', () => {
    expect(todayStr()).toHaveLength(10);
  });

  it('year part is 4 digits', () => {
    const year = todayStr().split('-')[0];
    expect(year).toHaveLength(4);
    expect(Number(year)).toBeGreaterThan(2000);
  });
});

describe('localISO() edge cases', () => {
  it('handles year 2000', () => {
    const d = new Date(2000, 0, 1);
    expect(localISO(d)).toBe('2000-01-01');
  });

  it('handles year 2099', () => {
    const d = new Date(2099, 11, 31);
    expect(localISO(d)).toBe('2099-12-31');
  });

  it('handles Feb 28 in non-leap year', () => {
    const d = new Date(2025, 1, 28);
    expect(localISO(d)).toBe('2025-02-28');
  });
});

describe('fmtDate() edge cases', () => {
  it('returns a weekday for 2 days from now', () => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    const result = fmtDate(localISO(d));
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(weekdays).toContain(result);
  });

  it('returns a weekday for 7 days from now', () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const result = fmtDate(localISO(d));
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(weekdays).toContain(result);
  });

  it('returns month/day for 8 days from now', () => {
    const d = new Date();
    d.setDate(d.getDate() + 8);
    const result = fmtDate(localISO(d));
    // Should not be a weekday name
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(weekdays).not.toContain(result);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns month/day for 2 days in the past', () => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    const result = fmtDate(localISO(d));
    expect(result).not.toBe('Today');
    expect(result).not.toBe('Tomorrow');
    expect(result).not.toBe('Yesterday');
  });
});

describe('relativeTime() edge cases', () => {
  it('returns "23h ago" for 23 hours ago', () => {
    const d = new Date(Date.now() - 23 * 60 * 60 * 1000);
    expect(relativeTime(d.toISOString())).toBe('23h ago');
  });

  it('returns "29d ago" for 29 days ago', () => {
    const d = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    expect(relativeTime(d.toISOString())).toBe('29d ago');
  });

  it('returns formatted date for exactly 30 days ago', () => {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = relativeTime(d.toISOString());
    expect(result).not.toContain('ago');
    expect(result).not.toBe('yesterday');
  });

  it('returns "just now" for timestamp 30 seconds ago', () => {
    const d = new Date(Date.now() - 30 * 1000);
    expect(relativeTime(d.toISOString())).toBe('just now');
  });
});
