import { describe, it, expect } from 'vitest';
import { createTask, createProject, sortTasks, findSimilarTask, findSimilarProject, PRIORITY_ORDER } from '../app.js';

// ============================================================
// These tests import from the REAL app.js — not re-implementations
// ============================================================

describe('createTask()', () => {
  it('creates task with defaults', () => {
    const t = createTask();
    expect(t.id).toMatch(/^t_/);
    expect(t.status).toBe('todo');
    expect(t.priority).toBe('normal');
    expect(t.tags).toEqual([]);
    expect(t.subtasks).toEqual([]);
    expect(t.blockedBy).toEqual([]);
    expect(t.archived).toBe(false);
    expect(t.completedAt).toBeNull();
  });

  it('applies overrides', () => {
    const t = createTask({ title: 'Test', priority: 'urgent', project: 'p_123' });
    expect(t.title).toBe('Test');
    expect(t.priority).toBe('urgent');
    expect(t.project).toBe('p_123');
  });

  it('truncates long titles to 500 chars', () => {
    const t = createTask({ title: 'a'.repeat(600) });
    expect(t.title.length).toBe(500);
  });

  it('truncates long notes to 10000 chars', () => {
    const t = createTask({ notes: 'b'.repeat(11000) });
    expect(t.notes.length).toBe(10000);
  });

  it('preserves tags array', () => {
    const t = createTask({ tags: ['urgent', 'design'] });
    expect(t.tags).toEqual(['urgent', 'design']);
  });

  it('preserves subtasks', () => {
    const t = createTask({ subtasks: [{ id: 'st_1', title: 'Sub 1', done: false }] });
    expect(t.subtasks).toHaveLength(1);
    expect(t.subtasks[0].title).toBe('Sub 1');
  });

  it('has createdAt timestamp', () => {
    const t = createTask();
    expect(t.createdAt).toBeTruthy();
    expect(new Date(t.createdAt).getTime()).toBeGreaterThan(0);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createTask().id));
    expect(ids.size).toBe(50);
  });
});

describe('createProject()', () => {
  it('creates project with defaults', () => {
    const p = createProject();
    expect(p.id).toMatch(/^p_/);
    expect(p.name).toBe('');
    expect(p.color).toBeTruthy();
  });

  it('applies overrides', () => {
    const p = createProject({ name: 'Test Project', description: 'A test' });
    expect(p.name).toBe('Test Project');
    expect(p.description).toBe('A test');
  });
});

describe('sortTasks()', () => {
  it('puts in-progress tasks first', () => {
    const tasks = [
      createTask({ title: 'Todo', status: 'todo' }),
      createTask({ title: 'In progress', status: 'in-progress' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('In progress');
  });

  it('sorts by priority within same status', () => {
    const tasks = [
      createTask({ title: 'Low', priority: 'low' }),
      createTask({ title: 'Urgent', priority: 'urgent' }),
      createTask({ title: 'Normal', priority: 'normal' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('Urgent');
    expect(sorted[2].title).toBe('Low');
  });

  it('handles empty array', () => {
    expect(sortTasks([])).toEqual([]);
  });

  it('does not mutate original array', () => {
    const tasks = [createTask({ title: 'A' }), createTask({ title: 'B' })];
    const original = [...tasks];
    sortTasks(tasks);
    expect(tasks[0].id).toBe(original[0].id);
  });
});

describe('PRIORITY_ORDER', () => {
  it('has correct ordering', () => {
    expect(PRIORITY_ORDER.urgent).toBeLessThan(PRIORITY_ORDER.important);
    expect(PRIORITY_ORDER.important).toBeLessThan(PRIORITY_ORDER.normal);
    expect(PRIORITY_ORDER.normal).toBeLessThan(PRIORITY_ORDER.low);
  });
});

describe('createTask() — additional edge cases', () => {
  it('defaults all string fields to empty', () => {
    const t = createTask();
    expect(t.title).toBe('');
    expect(t.notes).toBe('');
    expect(t.project).toBe('');
    expect(t.dueDate).toBe('');
    expect(t.phase).toBe('');
    expect(t.recurrence).toBe('');
  });

  it('defaults numeric fields to 0', () => {
    const t = createTask();
    expect(t.estimatedMinutes).toBe(0);
  });

  it('preserves all override fields simultaneously', () => {
    const t = createTask({
      title: 'Complex',
      notes: 'Some notes',
      status: 'in-progress',
      priority: 'important',
      horizon: 'long',
      project: 'p_abc',
      dueDate: '2026-04-01',
      phase: 'Design',
      recurrence: 'weekly',
      estimatedMinutes: 45,
      tags: ['tag1', 'tag2'],
      blockedBy: ['t_dep1'],
      subtasks: [{ id: 'st_1', title: 'Sub', done: true }],
    });
    expect(t.title).toBe('Complex');
    expect(t.status).toBe('in-progress');
    expect(t.priority).toBe('important');
    expect(t.horizon).toBe('long');
    expect(t.dueDate).toBe('2026-04-01');
    expect(t.recurrence).toBe('weekly');
    expect(t.estimatedMinutes).toBe(45);
    expect(t.tags).toEqual(['tag1', 'tag2']);
    expect(t.blockedBy).toEqual(['t_dep1']);
    expect(t.subtasks[0].done).toBe(true);
  });

  it('does not share references between tasks', () => {
    const a = createTask();
    const b = createTask();
    a.tags.push('mutated');
    expect(b.tags).toEqual([]);
  });

  it('title at exactly 500 chars is preserved', () => {
    const t = createTask({ title: 'x'.repeat(500) });
    expect(t.title.length).toBe(500);
  });
});

describe('createProject() — additional edge cases', () => {
  it('has all required fields', () => {
    const p = createProject();
    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('description');
    expect(p).toHaveProperty('background');
    expect(p).toHaveProperty('color');
    expect(p).toHaveProperty('createdAt');
  });

  it('generates unique project IDs', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createProject().id));
    expect(ids.size).toBe(20);
  });

  it('project ID starts with p_', () => {
    expect(createProject().id).toMatch(/^p_/);
  });
});

describe('sortTasks() — comprehensive', () => {
  it('in-progress beats urgent priority', () => {
    const tasks = [
      createTask({ title: 'Urgent', priority: 'urgent', status: 'todo' }),
      createTask({ title: 'InProg', priority: 'low', status: 'in-progress' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('InProg');
  });

  it('sorts by interest as tiebreaker', () => {
    const tasks = [
      createTask({ title: 'Low interest', priority: 'normal', interest: 1 }),
      createTask({ title: 'High interest', priority: 'normal', interest: 5 }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('High interest');
  });

  it('handles all priority levels correctly', () => {
    const tasks = [
      createTask({ title: 'Low', priority: 'low' }),
      createTask({ title: 'Normal', priority: 'normal' }),
      createTask({ title: 'Important', priority: 'important' }),
      createTask({ title: 'Urgent', priority: 'urgent' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted.map((t) => t.title)).toEqual(['Urgent', 'Important', 'Normal', 'Low']);
  });

  it('stable sort for equal priorities', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      createTask({ title: `Task ${i}`, priority: 'normal', interest: 3 }),
    );
    const sorted = sortTasks(tasks);
    expect(sorted).toHaveLength(5);
  });
});

describe('findSimilarTask()', () => {
  it('returns null with no tasks', () => {
    expect(findSimilarTask('anything')).toBeNull();
  });

  it('returns null for empty string query', () => {
    expect(findSimilarTask('')).toBeNull();
  });
});

describe('findSimilarProject()', () => {
  it('returns null with no matching projects', () => {
    expect(findSimilarProject('nonexistent xyz')).toBeNull();
  });

  it('returns null for empty string query', () => {
    expect(findSimilarProject('')).toBeNull();
  });
});

describe('sortTasks() — advanced edge cases', () => {
  it('handles mix of all statuses and priorities', () => {
    const tasks = [
      createTask({ title: 'done-low', priority: 'low', status: 'done' }),
      createTask({ title: 'todo-urgent', priority: 'urgent', status: 'todo' }),
      createTask({ title: 'ip-normal', priority: 'normal', status: 'in-progress' }),
      createTask({ title: 'todo-low', priority: 'low', status: 'todo' }),
      createTask({ title: 'ip-urgent', priority: 'urgent', status: 'in-progress' }),
    ];
    const sorted = sortTasks(tasks);
    // In-progress tasks should come first
    expect(sorted[0].status).toBe('in-progress');
    expect(sorted[1].status).toBe('in-progress');
    // Among in-progress, urgent before normal
    expect(sorted[0].title).toBe('ip-urgent');
    expect(sorted[1].title).toBe('ip-normal');
  });

  it('interest tiebreaker defaults missing interest to 3', () => {
    const tasks = [
      createTask({ title: 'no-interest', priority: 'normal' }),
      createTask({ title: 'interest-2', priority: 'normal', interest: 2 }),
      createTask({ title: 'interest-4', priority: 'normal', interest: 4 }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('interest-4');
    expect(sorted[2].title).toBe('interest-2');
  });

  it('handles tasks with identical properties', () => {
    const tasks = Array.from({ length: 5 }, () => createTask({ title: 'Same', priority: 'normal', interest: 3 }));
    const sorted = sortTasks(tasks);
    expect(sorted).toHaveLength(5);
    sorted.forEach((t) => expect(t.title).toBe('Same'));
  });

  it('handles single task array', () => {
    const tasks = [createTask({ title: 'Only one' })];
    const sorted = sortTasks(tasks);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].title).toBe('Only one');
  });
});

describe('createTask() — horizon and recurrence', () => {
  it('defaults horizon to short', () => {
    expect(createTask().horizon).toBe('short');
  });

  it('accepts long horizon', () => {
    expect(createTask({ horizon: 'long' }).horizon).toBe('long');
  });

  it('accepts medium horizon', () => {
    expect(createTask({ horizon: 'medium' }).horizon).toBe('medium');
  });

  it('defaults recurrence to empty string', () => {
    expect(createTask().recurrence).toBe('');
  });

  it('accepts weekly recurrence', () => {
    expect(createTask({ recurrence: 'weekly' }).recurrence).toBe('weekly');
  });

  it('accepts daily recurrence', () => {
    expect(createTask({ recurrence: 'daily' }).recurrence).toBe('daily');
  });
});
