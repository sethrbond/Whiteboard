import { describe, it, expect } from 'vitest';
import {
  createTask,
  createProject,
  findSimilarTask,
  findSimilarProject,
  sortTasks,
  todayStr,
  localISO,
  fmtDate,
  relativeTime,
  chunkText,
  PRIORITY_ORDER,
  PROJECT_COLORS,
} from '../app.js';

// ============================================================
// Extended coverage for core data functions and utilities
// ============================================================

describe('todayStr()', () => {
  it('returns ISO date format YYYY-MM-DD', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns consistent value on repeated calls', () => {
    expect(todayStr()).toBe(todayStr());
  });
});

describe('localISO()', () => {
  it('returns ISO date format', () => {
    const d = new Date(2026, 2, 15); // March 15, 2026
    expect(localISO(d)).toBe('2026-03-15');
  });

  it('pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026
    expect(localISO(d)).toBe('2026-01-05');
  });
});

describe('fmtDate()', () => {
  it('formats a date string', () => {
    const result = fmtDate('2026-03-15');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('handles empty string', () => {
    expect(fmtDate('')).toBe('');
  });

  it('handles null/undefined', () => {
    expect(fmtDate(null)).toBe('');
    expect(fmtDate(undefined)).toBe('');
  });
});

describe('relativeTime()', () => {
  it('returns a string for recent dates', () => {
    const recent = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    const result = relativeTime(recent);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles null', () => {
    expect(relativeTime(null)).toBe('');
  });
});

describe('chunkText()', () => {
  it('returns single chunk for short text', () => {
    expect(chunkText('hello', 100)).toEqual(['hello']);
  });

  it('splits at paragraph boundaries', () => {
    const text = 'paragraph one\n\nparagraph two\n\nparagraph three';
    const chunks = chunkText(text, 25);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be valid text
    chunks.forEach((c) => expect(c.length).toBeGreaterThan(0));
  });

  it('handles text with no good split points', () => {
    const text = 'a'.repeat(200);
    const chunks = chunkText(text, 50);
    expect(chunks.length).toBe(4);
    expect(chunks.join('')).toBe(text);
  });

  it('preserves all content after chunking', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const chunks = chunkText(text, 25);
    expect(chunks.join('')).toBe(text);
  });
});

describe('findSimilarTask()', () => {
  it('returns null when no tasks exist', () => {
    expect(findSimilarTask('anything')).toBeNull();
  });
});

describe('findSimilarProject()', () => {
  it('returns null when no projects match', () => {
    expect(findSimilarProject('nonexistent project xyz')).toBeNull();
  });
});

describe('PROJECT_COLORS', () => {
  it('is an array of 10 hex colors', () => {
    expect(Array.isArray(PROJECT_COLORS)).toBe(true);
    expect(PROJECT_COLORS.length).toBe(10);
    PROJECT_COLORS.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});

describe('PRIORITY_ORDER', () => {
  it('covers all four priority levels', () => {
    expect(PRIORITY_ORDER).toHaveProperty('urgent');
    expect(PRIORITY_ORDER).toHaveProperty('important');
    expect(PRIORITY_ORDER).toHaveProperty('normal');
    expect(PRIORITY_ORDER).toHaveProperty('low');
  });
});

describe('sortTasks() edge cases', () => {
  it('sorts by priority (urgent before normal)', () => {
    const tasks = [
      createTask({ title: 'Normal', priority: 'normal' }),
      createTask({ title: 'Urgent', priority: 'urgent' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('Urgent');
  });

  it('handles single task array', () => {
    const tasks = [createTask({ title: 'Only one' })];
    const sorted = sortTasks(tasks);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].title).toBe('Only one');
  });

  it('preserves all tasks', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => createTask({ title: `Task ${i}` }));
    const sorted = sortTasks(tasks);
    expect(sorted).toHaveLength(20);
  });
});

describe('createTask() edge cases', () => {
  it('handles empty title', () => {
    const t = createTask({ title: '' });
    expect(t.title).toBe('');
  });

  it('sets horizon default to short', () => {
    const t = createTask();
    expect(t.horizon).toBe('short');
  });

  it('sets recurrence default to empty', () => {
    const t = createTask();
    expect(t.recurrence).toBe('');
  });

  it('sets estimatedMinutes default to 0', () => {
    const t = createTask();
    expect(t.estimatedMinutes).toBe(0);
  });

  it('preserves blockedBy array', () => {
    const t = createTask({ blockedBy: ['t_123', 't_456'] });
    expect(t.blockedBy).toEqual(['t_123', 't_456']);
  });
});

describe('createProject() edge cases', () => {
  it('assigns a color', () => {
    const p = createProject({ name: 'Test' });
    expect(p.color).toBeTruthy();
    expect(p.color).toMatch(/^#/);
  });

  it('has createdAt timestamp', () => {
    const p = createProject();
    expect(p.createdAt).toBeTruthy();
    expect(new Date(p.createdAt).getTime()).toBeGreaterThan(0);
  });

  it('sets empty background by default', () => {
    const p = createProject();
    expect(p.background).toBe('');
  });
});
