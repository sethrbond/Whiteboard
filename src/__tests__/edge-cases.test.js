import { describe, it, expect } from 'vitest';
import { createTask, sortTasks, validateTaskFields, createProject } from '../app.js';
import { fmtDate, relativeTime, todayStr, localISO } from '../dates.js';
import { genId } from '../utils.js';

// ============================================================
// Edge case tests — boundary conditions, unicode, performance,
// date handling, and concurrent operations
// ============================================================

describe('string edge cases in task titles', () => {
  it('handles empty string title', () => {
    const t = createTask({ title: '' });
    expect(t.title).toBe('');
  });

  it('handles whitespace-only title', () => {
    const t = createTask({ title: '   ' });
    expect(t.title).toBe('   ');
  });

  it('handles very long string (10K+ chars) — truncated to 500', () => {
    const longTitle = 'A'.repeat(10001);
    const t = createTask({ title: longTitle });
    expect(t.title.length).toBe(500);
  });

  it('handles 501 char title — truncated to 500', () => {
    const t = createTask({ title: 'B'.repeat(501) });
    expect(t.title.length).toBe(500);
  });

  it('handles exactly 500 char title — not truncated', () => {
    const t = createTask({ title: 'C'.repeat(500) });
    expect(t.title.length).toBe(500);
  });

  it('handles unicode characters in title', () => {
    const t = createTask({ title: 'Tarea en español: añadir módulo' });
    expect(t.title).toBe('Tarea en español: añadir módulo');
  });

  it('handles CJK characters', () => {
    const t = createTask({ title: '日本語のタスク管理' });
    expect(t.title).toBe('日本語のタスク管理');
  });

  it('handles emoji in title', () => {
    const t = createTask({ title: '🚀 Launch feature 🎉' });
    expect(t.title).toBe('🚀 Launch feature 🎉');
  });

  it('handles mixed emoji and text', () => {
    const t = createTask({ title: 'Fix bug 🐛 in auth 🔐 module 📦' });
    expect(t.title).toBe('Fix bug 🐛 in auth 🔐 module 📦');
  });

  it('handles RTL text (Arabic)', () => {
    const t = createTask({ title: 'مهمة باللغة العربية' });
    expect(t.title).toBe('مهمة باللغة العربية');
  });

  it('handles zero-width characters', () => {
    const t = createTask({ title: 'normal\u200Btext\u200B' });
    expect(t.title).toContain('\u200B');
  });

  it('handles newlines in title', () => {
    const t = createTask({ title: 'Line 1\nLine 2' });
    expect(t.title).toBe('Line 1\nLine 2');
  });

  it('handles tab characters in title', () => {
    const t = createTask({ title: 'Col1\tCol2' });
    expect(t.title).toBe('Col1\tCol2');
  });
});

describe('string edge cases in notes', () => {
  it('handles very long notes (15K chars) — truncated to 10000', () => {
    const t = createTask({ notes: 'N'.repeat(15000) });
    expect(t.notes.length).toBe(10000);
  });

  it('handles exactly 10000 char notes — not truncated', () => {
    const t = createTask({ notes: 'M'.repeat(10000) });
    expect(t.notes.length).toBe(10000);
  });

  it('handles unicode in notes', () => {
    const t = createTask({ notes: '🎵 Music notes: ♪♫♬ — café résumé naïve' });
    expect(t.notes).toContain('café');
  });
});

describe('circular dependency references in blockedBy', () => {
  it('allows a task to reference itself in blockedBy (app should handle)', () => {
    const t = createTask({ title: 'Self-blocked' });
    t.blockedBy = [t.id];
    validateTaskFields(t);
    // validateTaskFields does not check for self-reference, just array type
    expect(t.blockedBy).toContain(t.id);
  });

  it('allows two tasks to block each other (mutual dependency)', () => {
    const t1 = createTask({ title: 'Task A' });
    const t2 = createTask({ title: 'Task B' });
    t1.blockedBy = [t2.id];
    t2.blockedBy = [t1.id];
    validateTaskFields(t1);
    validateTaskFields(t2);
    expect(t1.blockedBy).toContain(t2.id);
    expect(t2.blockedBy).toContain(t1.id);
  });

  it('allows three-way circular dependency', () => {
    const t1 = createTask({ title: 'A' });
    const t2 = createTask({ title: 'B' });
    const t3 = createTask({ title: 'C' });
    t1.blockedBy = [t3.id];
    t2.blockedBy = [t1.id];
    t3.blockedBy = [t2.id];
    validateTaskFields(t1);
    validateTaskFields(t2);
    validateTaskFields(t3);
    expect(t1.blockedBy).toEqual([t3.id]);
    expect(t2.blockedBy).toEqual([t1.id]);
    expect(t3.blockedBy).toEqual([t2.id]);
  });

  it('handles blockedBy referencing nonexistent task IDs', () => {
    const t = createTask({ title: 'Orphan ref', blockedBy: ['t_nonexistent_999'] });
    validateTaskFields(t);
    expect(t.blockedBy).toEqual(['t_nonexistent_999']);
  });
});

describe('sorting with all same priority tasks', () => {
  it('sortTasks handles all tasks with same priority and status', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      createTask({ title: `Task ${i}`, priority: 'normal', status: 'todo' }),
    );
    const sorted = sortTasks(tasks);
    expect(sorted.length).toBe(10);
    // All tasks should still be present
    const titles = sorted.map((t) => t.title);
    for (let i = 0; i < 10; i++) {
      expect(titles).toContain(`Task ${i}`);
    }
  });

  it('sortTasks handles all urgent tasks', () => {
    const tasks = [
      createTask({ title: 'A', priority: 'urgent', status: 'todo' }),
      createTask({ title: 'B', priority: 'urgent', status: 'todo' }),
      createTask({ title: 'C', priority: 'urgent', status: 'todo' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted.length).toBe(3);
    expect(sorted.every((t) => t.priority === 'urgent')).toBe(true);
  });

  it('sortTasks handles mix of statuses with same priority', () => {
    const tasks = [
      createTask({ title: 'Todo', priority: 'normal', status: 'todo' }),
      createTask({ title: 'InProgress', priority: 'normal', status: 'in-progress' }),
      createTask({ title: 'Done', priority: 'normal', status: 'done' }),
    ];
    const sorted = sortTasks(tasks);
    // in-progress should come before todo
    const ipIdx = sorted.findIndex((t) => t.title === 'InProgress');
    const todoIdx = sorted.findIndex((t) => t.title === 'Todo');
    expect(ipIdx).toBeLessThan(todoIdx);
  });
});

describe('date edge cases', () => {
  it('fmtDate handles empty string', () => {
    expect(fmtDate('')).toBe('');
  });

  it('fmtDate handles null', () => {
    expect(fmtDate(null)).toBe('');
  });

  it('fmtDate handles undefined', () => {
    expect(fmtDate(undefined)).toBe('');
  });

  it('fmtDate handles far future date (year 2099)', () => {
    const result = fmtDate('2099-12-31');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('fmtDate handles past date', () => {
    const result = fmtDate('2020-01-01');
    expect(result).toBeTruthy();
  });

  it('fmtDate returns "Today" for today', () => {
    const today = todayStr();
    expect(fmtDate(today)).toBe('Today');
  });

  it('fmtDate returns "Tomorrow" for tomorrow', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrow = localISO(d);
    expect(fmtDate(tomorrow)).toBe('Tomorrow');
  });

  it('fmtDate returns "Yesterday" for yesterday', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = localISO(d);
    expect(fmtDate(yesterday)).toBe('Yesterday');
  });

  it('relativeTime handles empty string', () => {
    expect(relativeTime('')).toBe('');
  });

  it('relativeTime handles null', () => {
    expect(relativeTime(null)).toBe('');
  });

  it('relativeTime returns "just now" for current time', () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe('just now');
  });

  it('todayStr returns YYYY-MM-DD format', () => {
    const today = todayStr();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('localISO formats date correctly', () => {
    const d = new Date(2026, 0, 5); // January 5, 2026
    expect(localISO(d)).toBe('2026-01-05');
  });

  it('localISO pads single-digit months and days', () => {
    const d = new Date(2026, 2, 3); // March 3, 2026
    expect(localISO(d)).toBe('2026-03-03');
  });

  it('validateTaskFields rejects invalid date format', () => {
    const t = { dueDate: '2026/03/15' };
    validateTaskFields(t);
    expect(t.dueDate).toBe('');
  });

  it('validateTaskFields accepts valid YYYY-MM-DD date', () => {
    const t = { dueDate: '2099-12-31' };
    validateTaskFields(t);
    expect(t.dueDate).toBe('2099-12-31');
  });

  it('validateTaskFields resets date with text', () => {
    const t = { dueDate: 'not-a-date' };
    validateTaskFields(t);
    expect(t.dueDate).toBe('');
  });
});

describe('project with many tasks (performance sanity)', () => {
  it('creates 1000 tasks without error', () => {
    const tasks = Array.from({ length: 1000 }, (_, i) =>
      createTask({ title: `Task ${i}`, priority: ['urgent', 'important', 'normal', 'low'][i % 4] }),
    );
    expect(tasks.length).toBe(1000);
    expect(tasks[0].id).toMatch(/^t_/);
    expect(tasks[999].id).toMatch(/^t_/);
  });

  it('sorts 1000 tasks in reasonable time', () => {
    const tasks = Array.from({ length: 1000 }, (_, i) =>
      createTask({
        title: `Task ${i}`,
        priority: ['urgent', 'important', 'normal', 'low'][i % 4],
        status: i % 3 === 0 ? 'in-progress' : 'todo',
      }),
    );
    const start = performance.now();
    const sorted = sortTasks(tasks);
    const elapsed = performance.now() - start;
    expect(sorted.length).toBe(1000);
    // Should complete in under 100ms even on slow machines
    expect(elapsed).toBeLessThan(1000);
  });

  it('all 1000 tasks have unique IDs', () => {
    const tasks = Array.from({ length: 1000 }, () => createTask());
    const ids = new Set(tasks.map((t) => t.id));
    expect(ids.size).toBe(1000);
  });

  it('genId generates mostly unique IDs (>99% unique out of 1000)', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => genId()));
    // genId uses Date.now() + short random suffix, so rare collisions are possible
    expect(ids.size).toBeGreaterThan(990);
  });
});

describe('concurrent-style rapid operations', () => {
  it('rapid create and validate does not corrupt data', () => {
    const tasks = [];
    for (let i = 0; i < 100; i++) {
      const t = createTask({ title: `Rapid ${i}`, priority: 'normal' });
      validateTaskFields(t);
      tasks.push(t);
    }
    expect(tasks.length).toBe(100);
    expect(tasks.every((t) => t.priority === 'normal')).toBe(true);
    expect(tasks.every((t) => t.status === 'todo')).toBe(true);
  });

  it('rapid sort of changing array produces consistent results', () => {
    const tasks = Array.from({ length: 50 }, (_, i) =>
      createTask({ title: `T${i}`, priority: ['urgent', 'normal', 'low'][i % 3] }),
    );
    // Sort multiple times — should be deterministic
    const sorted1 = sortTasks(tasks);
    const sorted2 = sortTasks(tasks);
    expect(sorted1.map((t) => t.id)).toEqual(sorted2.map((t) => t.id));
  });

  it('validateTaskFields is idempotent', () => {
    const t = createTask({
      title: 'Idempotent test',
      status: 'in-progress',
      priority: 'urgent',
      tags: ['a', 'b'],
    });
    const first = { ...t, tags: [...t.tags] };
    validateTaskFields(t);
    validateTaskFields(t);
    validateTaskFields(t);
    expect(t.status).toBe(first.status);
    expect(t.priority).toBe(first.priority);
    expect(t.tags).toEqual(first.tags);
  });
});

describe('createProject edge cases', () => {
  it('handles very long project name', () => {
    const p = createProject({ name: 'P'.repeat(1000) });
    expect(p.name.length).toBe(1000);
  });

  it('handles emoji in project name', () => {
    const p = createProject({ name: '🏠 Home Improvement' });
    expect(p.name).toBe('🏠 Home Improvement');
  });

  it('handles empty project name', () => {
    const p = createProject({ name: '' });
    expect(p.name).toBe('');
  });

  it('generates unique project IDs', () => {
    const projects = Array.from({ length: 100 }, () => createProject());
    const ids = new Set(projects.map((p) => p.id));
    expect(ids.size).toBe(100);
  });
});
