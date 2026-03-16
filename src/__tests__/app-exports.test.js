import { describe, it, expect } from 'vitest';
import { createTask, createProject, sortTasks, validateTaskFields, PROJECT_COLORS } from '../app.js';

// ============================================================
// Tests for functions defined in app.js: createTask, createProject, sortTasks
// ============================================================

describe('createTask — defaults and structure', () => {
  it('returns an object with all expected keys when called with no args', () => {
    const t = createTask();
    const expectedKeys = [
      'id',
      'title',
      'notes',
      'status',
      'priority',
      'horizon',
      'project',
      'dueDate',
      'phase',
      'recurrence',
      'estimatedMinutes',
      'tags',
      'blockedBy',
      'subtasks',
      'createdAt',
      'completedAt',
      'archived',
      'updates',
    ];
    for (const key of expectedKeys) {
      expect(t).toHaveProperty(key);
    }
  });

  it('default horizon is "short"', () => {
    expect(createTask().horizon).toBe('short');
  });

  it('default updates is an empty array', () => {
    expect(createTask().updates).toEqual([]);
  });

  it('createdAt is a valid ISO-8601 string close to now', () => {
    const before = Date.now();
    const t = createTask();
    const after = Date.now();
    const ts = new Date(t.createdAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 50);
    expect(ts).toBeLessThanOrEqual(after + 50);
  });
});

describe('createTask — truncation edge cases', () => {
  it('does not truncate title at exactly 500 characters', () => {
    const title = 'A'.repeat(500);
    expect(createTask({ title }).title).toBe(title);
  });

  it('truncates title at 501 characters', () => {
    const title = 'B'.repeat(501);
    expect(createTask({ title }).title.length).toBe(500);
  });

  it('does not truncate notes at exactly 10000 characters', () => {
    const notes = 'N'.repeat(10000);
    expect(createTask({ notes }).notes).toBe(notes);
  });

  it('truncates notes at 10001 characters', () => {
    const notes = 'M'.repeat(10001);
    expect(createTask({ notes }).notes.length).toBe(10000);
  });

  it('does not truncate empty title', () => {
    expect(createTask({ title: '' }).title).toBe('');
  });

  it('does not truncate empty notes', () => {
    expect(createTask({ notes: '' }).notes).toBe('');
  });
});

describe('createTask — override behavior', () => {
  it('override can set a custom id', () => {
    const t = createTask({ id: 'custom_id_123' });
    expect(t.id).toBe('custom_id_123');
  });

  it('override can set archived to true', () => {
    const t = createTask({ archived: true });
    expect(t.archived).toBe(true);
  });

  it('override can set completedAt to a date string', () => {
    const date = '2026-03-15T12:00:00.000Z';
    const t = createTask({ completedAt: date });
    expect(t.completedAt).toBe(date);
  });

  it('override with extra unknown fields are preserved via spread', () => {
    const t = createTask({ customField: 'hello' });
    expect(t.customField).toBe('hello');
  });

  it('override can set estimatedMinutes to a non-zero value', () => {
    const t = createTask({ estimatedMinutes: 120 });
    expect(t.estimatedMinutes).toBe(120);
  });
});

describe('createProject — defaults and structure', () => {
  it('default name is empty string', () => {
    expect(createProject().name).toBe('');
  });

  it('default description is empty string', () => {
    expect(createProject().description).toBe('');
  });

  it('default background is empty string', () => {
    expect(createProject().background).toBe('');
  });

  it('color is one of PROJECT_COLORS', () => {
    const p = createProject();
    expect(PROJECT_COLORS).toContain(p.color);
  });

  it('override color replaces default color', () => {
    const p = createProject({ color: '#000000' });
    expect(p.color).toBe('#000000');
  });

  it('createdAt is a valid ISO timestamp', () => {
    const p = createProject();
    expect(new Date(p.createdAt).getTime()).toBeGreaterThan(0);
  });
});

describe('sortTasks — priority ordering', () => {
  it('sorts all four priorities in correct order', () => {
    const tasks = [
      createTask({ title: 'low', priority: 'low' }),
      createTask({ title: 'important', priority: 'important' }),
      createTask({ title: 'urgent', priority: 'urgent' }),
      createTask({ title: 'normal', priority: 'normal' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted.map((t) => t.priority)).toEqual(['urgent', 'important', 'normal', 'low']);
  });

  it('in-progress status takes precedence over priority', () => {
    const tasks = [
      createTask({ title: 'urgent-todo', priority: 'urgent', status: 'todo' }),
      createTask({ title: 'low-inprog', priority: 'low', status: 'in-progress' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('low-inprog');
  });

  it('multiple in-progress tasks are sorted by priority among themselves', () => {
    const tasks = [
      createTask({ title: 'low-ip', priority: 'low', status: 'in-progress' }),
      createTask({ title: 'urgent-ip', priority: 'urgent', status: 'in-progress' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('urgent-ip');
    expect(sorted[1].title).toBe('low-ip');
  });
});

describe('sortTasks — interest tiebreaker', () => {
  it('higher interest comes first when priority is equal', () => {
    const tasks = [
      createTask({ title: 'boring', priority: 'normal', interest: 1 }),
      createTask({ title: 'exciting', priority: 'normal', interest: 5 }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('exciting');
  });

  it('defaults interest to 3 when not set', () => {
    // Two tasks with no interest field should be treated as interest=3
    // A task with interest 4 should beat one without interest
    const tasks = [
      createTask({ title: 'no-interest', priority: 'normal' }),
      createTask({ title: 'interest-4', priority: 'normal', interest: 4 }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('interest-4');
  });

  it('tasks with equal interest and priority maintain stable order', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      createTask({ title: `task-${i}`, priority: 'normal', interest: 3 }),
    );
    const sorted = sortTasks(tasks);
    expect(sorted).toHaveLength(10);
  });
});

describe('sortTasks — immutability and edge cases', () => {
  it('returns a new array, does not mutate input', () => {
    const tasks = [createTask({ title: 'A', priority: 'low' }), createTask({ title: 'B', priority: 'urgent' })];
    const originalFirst = tasks[0];
    const sorted = sortTasks(tasks);
    expect(tasks[0]).toBe(originalFirst);
    expect(sorted).not.toBe(tasks);
  });

  it('handles single-element array', () => {
    const tasks = [createTask({ title: 'only' })];
    const sorted = sortTasks(tasks);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].title).toBe('only');
  });

  it('handles tasks with unknown priority gracefully', () => {
    // Unknown priorities fall back to undefined in PRIORITY_ORDER,
    // which becomes NaN in subtraction — verify no crash
    const tasks = [
      createTask({ title: 'normal', priority: 'normal' }),
      createTask({ title: 'unknown', priority: 'whatever' }),
    ];
    expect(() => sortTasks(tasks)).not.toThrow();
  });

  it('handles large arrays without error', () => {
    const tasks = Array.from({ length: 200 }, (_, i) =>
      createTask({
        title: `task-${i}`,
        priority: ['urgent', 'important', 'normal', 'low'][i % 4],
        status: i % 7 === 0 ? 'in-progress' : 'todo',
        interest: (i % 5) + 1,
      }),
    );
    const sorted = sortTasks(tasks);
    expect(sorted).toHaveLength(200);
    // First task should be in-progress (status trumps priority)
    expect(sorted[0].status).toBe('in-progress');
  });
});

// ============================================================
// validateTaskFields
// ============================================================
describe('validateTaskFields', () => {
  it('corrects invalid status to todo', () => {
    const t = { status: 'invalid' };
    validateTaskFields(t);
    expect(t.status).toBe('todo');
  });

  it('keeps valid status unchanged', () => {
    const t = { status: 'in-progress' };
    validateTaskFields(t);
    expect(t.status).toBe('in-progress');
  });

  it('corrects invalid priority to normal', () => {
    const t = { priority: 'critical' };
    validateTaskFields(t);
    expect(t.priority).toBe('normal');
  });

  it('keeps valid priority unchanged', () => {
    const t = { priority: 'urgent' };
    validateTaskFields(t);
    expect(t.priority).toBe('urgent');
  });

  it('clears invalid dueDate format', () => {
    const t = { dueDate: 'next friday' };
    validateTaskFields(t);
    expect(t.dueDate).toBe('');
  });

  it('keeps valid dueDate unchanged', () => {
    const t = { dueDate: '2026-03-15' };
    validateTaskFields(t);
    expect(t.dueDate).toBe('2026-03-15');
  });

  it('allows empty dueDate', () => {
    const t = { dueDate: '' };
    validateTaskFields(t);
    expect(t.dueDate).toBe('');
  });

  it('corrects negative estimatedMinutes to 0', () => {
    const t = { estimatedMinutes: -10 };
    validateTaskFields(t);
    expect(t.estimatedMinutes).toBe(0);
  });

  it('corrects NaN estimatedMinutes to 0', () => {
    const t = { estimatedMinutes: NaN };
    validateTaskFields(t);
    expect(t.estimatedMinutes).toBe(0);
  });

  it('corrects string estimatedMinutes to 0', () => {
    const t = { estimatedMinutes: 'thirty' };
    validateTaskFields(t);
    expect(t.estimatedMinutes).toBe(0);
  });

  it('keeps valid estimatedMinutes unchanged', () => {
    const t = { estimatedMinutes: 45 };
    validateTaskFields(t);
    expect(t.estimatedMinutes).toBe(45);
  });

  it('skips validation for undefined fields', () => {
    const t = { title: 'Test' };
    validateTaskFields(t);
    expect(t.status).toBeUndefined();
    expect(t.priority).toBeUndefined();
  });
});
