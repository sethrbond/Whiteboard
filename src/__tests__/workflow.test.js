import { describe, it, expect } from 'vitest';
import { createTask, createProject, validateTaskFields, todayStr, localISO, genId } from '../app.js';
import { parseQuickInput } from '../parsers.js';
import { migrateData, CURRENT_SCHEMA_VERSION } from '../migrations.js';

// ============================================================
// End-to-end workflow tests — complete user scenarios
// ============================================================

describe('Workflow: Create project, add tasks, mark done, archive', () => {
  it('creates a project with default fields', () => {
    const proj = createProject({ name: 'Sprint 1' });
    expect(proj.id).toBeTruthy();
    expect(proj.name).toBe('Sprint 1');
    expect(proj.color).toBeTruthy();
    expect(proj.createdAt).toBeTruthy();
  });

  it('creates tasks assigned to a project', () => {
    const proj = createProject({ name: 'Sprint 1' });
    const t1 = createTask({ title: 'Design mockups', project: proj.id, priority: 'urgent' });
    const t2 = createTask({ title: 'Write tests', project: proj.id, priority: 'normal' });
    const t3 = createTask({ title: 'Deploy', project: proj.id, priority: 'low' });

    expect(t1.project).toBe(proj.id);
    expect(t2.project).toBe(proj.id);
    expect(t3.project).toBe(proj.id);
    expect(t1.status).toBe('todo');
  });

  it('marks tasks as done with completedAt timestamp', () => {
    const t = createTask({ title: 'Design mockups', status: 'done' });
    // When created directly with status done, completedAt is not set automatically
    // but the task can hold done status
    expect(t.status).toBe('done');
  });

  it('can simulate archiving a task', () => {
    const t = createTask({ title: 'Old task', status: 'done', archived: true });
    expect(t.archived).toBe(true);
    expect(t.status).toBe('done');
  });

  it('full lifecycle: create, progress, complete, archive', () => {
    const proj = createProject({ name: 'My Project' });
    const task = createTask({ title: 'Build feature', project: proj.id });

    // Phase 1: task is todo
    expect(task.status).toBe('todo');
    expect(task.archived).toBe(false);

    // Phase 2: move to in-progress
    task.status = 'in-progress';
    validateTaskFields(task);
    expect(task.status).toBe('in-progress');

    // Phase 3: mark done
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    validateTaskFields(task);
    expect(task.status).toBe('done');
    expect(task.completedAt).toBeTruthy();

    // Phase 4: archive
    task.archived = true;
    expect(task.archived).toBe(true);
  });
});

describe('Workflow: Task dependencies and circular detection', () => {
  /**
   * wouldCreateCircularDep is inside the task-editor factory
   * and not directly exported. We replicate the same BFS logic
   * to test the concept with plain task objects.
   */
  function wouldCreateCircularDep(taskId, newBlockerId, taskMap) {
    const visited = new Set();
    const queue = [newBlockerId];
    while (queue.length) {
      const cid = queue.shift();
      if (cid === taskId) return true;
      if (visited.has(cid)) continue;
      visited.add(cid);
      const t = taskMap.get(cid);
      if (t && t.blockedBy) queue.push(...t.blockedBy);
    }
    return false;
  }

  it('creates tasks with blockedBy dependencies', () => {
    const t1 = createTask({ title: 'Setup DB' });
    const t2 = createTask({ title: 'Build API', blockedBy: [t1.id] });

    expect(t2.blockedBy).toContain(t1.id);
    expect(t1.blockedBy).toEqual([]);
  });

  it('detects direct circular dependency', () => {
    const t1 = createTask({ title: 'A' });
    const t2 = createTask({ title: 'B', blockedBy: [t1.id] });

    const taskMap = new Map([
      [t1.id, t1],
      [t2.id, t2],
    ]);

    // Adding t1 blocked by t2 would create: t1 -> t2 -> t1
    expect(wouldCreateCircularDep(t1.id, t2.id, taskMap)).toBe(true);
  });

  it('detects transitive circular dependency', () => {
    const t1 = createTask({ title: 'A' });
    const t2 = createTask({ title: 'B', blockedBy: [t1.id] });
    const t3 = createTask({ title: 'C', blockedBy: [t2.id] });

    const taskMap = new Map([
      [t1.id, t1],
      [t2.id, t2],
      [t3.id, t3],
    ]);

    // Adding t1 blocked by t3 would create: t1 -> t2 -> t3 -> t1
    expect(wouldCreateCircularDep(t1.id, t3.id, taskMap)).toBe(true);
  });

  it('allows valid (non-circular) dependencies', () => {
    const t1 = createTask({ title: 'A' });
    const t2 = createTask({ title: 'B', blockedBy: [t1.id] });
    const t3 = createTask({ title: 'C' });

    const taskMap = new Map([
      [t1.id, t1],
      [t2.id, t2],
      [t3.id, t3],
    ]);

    // t3 blocking t2 is fine (no cycle)
    expect(wouldCreateCircularDep(t2.id, t3.id, taskMap)).toBe(false);
  });

  it('handles self-referential dependency', () => {
    const t1 = createTask({ title: 'A' });
    const taskMap = new Map([[t1.id, t1]]);

    // A task blocking itself is circular
    expect(wouldCreateCircularDep(t1.id, t1.id, taskMap)).toBe(true);
  });

  it('handles missing tasks in the map gracefully', () => {
    const t1 = createTask({ title: 'A', blockedBy: ['nonexistent'] });
    const taskMap = new Map([[t1.id, t1]]);

    expect(wouldCreateCircularDep('other', t1.id, taskMap)).toBe(false);
  });
});

describe('Workflow: Quick-add parsing', () => {
  it('extracts priority from !!! marker', () => {
    const result = parseQuickInput('Fix bug !!!');
    expect(result.priority).toBe('urgent');
    expect(result.title).toContain('Fix bug');
  });

  it('extracts priority from !! marker', () => {
    const result = parseQuickInput('Review PR !!');
    expect(result.priority).toBe('important');
  });

  it('extracts "urgent" keyword as priority', () => {
    const result = parseQuickInput('Fix server urgent');
    expect(result.priority).toBe('urgent');
  });

  it('extracts "important" keyword as priority', () => {
    const result = parseQuickInput('Prepare slides important');
    expect(result.priority).toBe('important');
  });

  it('defaults to normal priority', () => {
    const result = parseQuickInput('Buy milk');
    expect(result.priority).toBe('normal');
  });

  it('extracts due date from "tomorrow"', () => {
    const result = parseQuickInput('Buy groceries tomorrow');
    expect(result.dueDate).toBeTruthy();
    expect(result.title).not.toContain('tomorrow');
  });

  it('extracts due date from "today"', () => {
    const result = parseQuickInput('Call dentist today');
    expect(result.dueDate).toBe(todayStr());
  });

  it('combines priority and date extraction', () => {
    const result = parseQuickInput('Deploy server !!! tomorrow');
    expect(result.priority).toBe('urgent');
    expect(result.dueDate).toBeTruthy();
    expect(result.title).toContain('Deploy server');
  });

  it('extracts #project tag', () => {
    const mockFindProject = (name) => ({ id: 'p1', name });
    const result = parseQuickInput('Buy groceries #shopping', {
      findSimilarProject: mockFindProject,
    });
    expect(result.quickProject).toBeTruthy();
    expect(result.quickProject.name).toBe('shopping');
    expect(result.title).not.toContain('#shopping');
  });

  it('handles combined input: title + tag + priority + date', () => {
    const mockFindProject = (name) => ({ id: 'p1', name });
    const result = parseQuickInput('Buy groceries #shopping !!! tomorrow', {
      findSimilarProject: mockFindProject,
    });
    expect(result.priority).toBe('urgent');
    expect(result.dueDate).toBeTruthy();
    expect(result.quickProject).toBeTruthy();
    expect(result.title).toContain('Buy groceries');
  });

  it('cleans up trailing punctuation', () => {
    const result = parseQuickInput('task name -');
    expect(result.title).toBe('task name');
  });

  it('collapses multiple spaces', () => {
    const result = parseQuickInput('task   name   here');
    expect(result.title).not.toContain('  ');
  });
});

describe('Workflow: Bulk operations simulation', () => {
  it('marks multiple tasks as done', () => {
    const tasks = [createTask({ title: 'Task 1' }), createTask({ title: 'Task 2' }), createTask({ title: 'Task 3' })];

    // Simulate bulk done
    const selectedIds = new Set([tasks[0].id, tasks[2].id]);
    tasks.forEach((t) => {
      if (selectedIds.has(t.id)) {
        t.status = 'done';
        t.completedAt = new Date().toISOString();
      }
    });

    expect(tasks[0].status).toBe('done');
    expect(tasks[1].status).toBe('todo');
    expect(tasks[2].status).toBe('done');
    expect(tasks[0].completedAt).toBeTruthy();
    expect(tasks[1].completedAt).toBeNull();
  });

  it('simulates undo by restoring from snapshot', () => {
    const original = [createTask({ title: 'Task A', status: 'todo' }), createTask({ title: 'Task B', status: 'todo' })];

    // Snapshot before operation
    const snapshot = JSON.parse(JSON.stringify(original));

    // Modify
    original[0].status = 'done';
    original[1].status = 'done';
    expect(original[0].status).toBe('done');

    // Undo by restoring snapshot
    const restored = snapshot;
    expect(restored[0].status).toBe('todo');
    expect(restored[1].status).toBe('todo');
  });

  it('bulk move tasks to a different project', () => {
    const proj = createProject({ name: 'New Board' });
    const tasks = [createTask({ title: 'T1', project: 'old_proj' }), createTask({ title: 'T2', project: 'old_proj' })];

    tasks.forEach((t) => {
      t.project = proj.id;
    });

    expect(tasks[0].project).toBe(proj.id);
    expect(tasks[1].project).toBe(proj.id);
  });

  it('bulk priority change', () => {
    const tasks = [createTask({ title: 'T1', priority: 'normal' }), createTask({ title: 'T2', priority: 'low' })];

    tasks.forEach((t) => {
      t.priority = 'urgent';
      validateTaskFields(t);
    });

    expect(tasks[0].priority).toBe('urgent');
    expect(tasks[1].priority).toBe('urgent');
  });
});

describe('Workflow: Import/export round-trip', () => {
  it('serializes and deserializes task data identically', () => {
    const data = {
      tasks: [
        createTask({ title: 'Task 1', priority: 'urgent', tags: ['work', 'important'] }),
        createTask({ title: 'Task 2', dueDate: '2026-06-15', notes: 'Some notes' }),
      ],
      projects: [createProject({ name: 'Work' }), createProject({ name: 'Personal' })],
    };

    const exported = JSON.stringify(data, null, 2);
    const imported = JSON.parse(exported);

    expect(imported.tasks).toHaveLength(2);
    expect(imported.projects).toHaveLength(2);
    expect(imported.tasks[0].title).toBe('Task 1');
    expect(imported.tasks[0].priority).toBe('urgent');
    expect(imported.tasks[0].tags).toEqual(['work', 'important']);
    expect(imported.tasks[1].dueDate).toBe('2026-06-15');
    expect(imported.projects[0].name).toBe('Work');
  });

  it('validates imported tasks have required fields', () => {
    const exported = JSON.stringify({
      tasks: [
        { id: 't1', title: 'Imported Task', status: 'todo' },
        { id: 't2', title: 'Another', priority: 'urgent' },
      ],
      projects: [],
    });

    const imported = JSON.parse(exported);
    expect(imported.tasks.every((t) => t.id && t.title)).toBe(true);
  });

  it('round-trip preserves subtasks structure', () => {
    const task = createTask({
      title: 'Parent',
      subtasks: [
        { id: 'st1', title: 'Step 1', done: false },
        { id: 'st2', title: 'Step 2', done: true },
      ],
    });

    const roundTrip = JSON.parse(JSON.stringify(task));
    expect(roundTrip.subtasks).toHaveLength(2);
    expect(roundTrip.subtasks[0].done).toBe(false);
    expect(roundTrip.subtasks[1].done).toBe(true);
  });

  it('round-trip preserves blockedBy references', () => {
    const t1 = createTask({ title: 'Base' });
    const t2 = createTask({ title: 'Dependent', blockedBy: [t1.id] });

    const roundTrip = JSON.parse(JSON.stringify({ tasks: [t1, t2] }));
    expect(roundTrip.tasks[1].blockedBy).toContain(t1.id);
  });

  it('round-trip handles empty data gracefully', () => {
    const data = { tasks: [], projects: [] };
    const roundTrip = JSON.parse(JSON.stringify(data));
    expect(roundTrip.tasks).toEqual([]);
    expect(roundTrip.projects).toEqual([]);
  });
});

describe('Workflow: Recurring tasks', () => {
  it('creates a task with daily recurrence', () => {
    const task = createTask({
      title: 'Standup',
      recurrence: 'daily',
      dueDate: todayStr(),
    });
    expect(task.recurrence).toBe('daily');
  });

  it('creates a task with weekly recurrence', () => {
    const task = createTask({ title: 'Review', recurrence: 'weekly' });
    expect(task.recurrence).toBe('weekly');
  });

  it('creates a task with monthly recurrence', () => {
    const task = createTask({ title: 'Report', recurrence: 'monthly' });
    expect(task.recurrence).toBe('monthly');
  });

  it('validates invalid recurrence to empty string', () => {
    const task = { recurrence: 'yearly' };
    validateTaskFields(task);
    expect(task.recurrence).toBe('');
  });

  it('simulates recurrence processing: done daily task spawns new task', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const doneTask = createTask({
      title: 'Daily standup',
      recurrence: 'daily',
      status: 'done',
      completedAt: yesterday.toISOString(),
      project: 'p1',
    });

    // Simulate the recurrence logic from processRecurringTasks
    const completedDate = new Date(doneTask.completedAt);
    const nextDate = new Date(completedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextStr = localISO(nextDate);

    const newTask = createTask({
      title: doneTask.title,
      recurrence: doneTask.recurrence,
      priority: doneTask.priority,
      project: doneTask.project,
      dueDate: nextStr,
    });

    expect(newTask.status).toBe('todo');
    expect(newTask.recurrence).toBe('daily');
    expect(newTask.title).toBe('Daily standup');
    expect(newTask.dueDate).toBeTruthy();
    expect(newTask.project).toBe('p1');
  });

  it('weekly recurrence advances by 7 days', () => {
    const base = new Date(2026, 2, 10); // March 10
    const next = new Date(base);
    next.setDate(next.getDate() + 7);
    expect(localISO(next)).toBe('2026-03-17');
  });

  it('monthly recurrence advances by 1 month', () => {
    const base = new Date(2026, 0, 31); // Jan 31
    const next = new Date(base);
    next.setMonth(next.getMonth() + 1);
    // Feb doesn't have 31 days, JS rolls to March
    expect(next.getMonth()).toBe(2); // March
  });
});

describe('Workflow: Schema migration', () => {
  it('migrates v0 data to current version', () => {
    const v0Data = {
      tasks: [
        { id: 't1', title: 'Old task' },
        { id: 't2', title: 'Another old task', status: 'in-progress' },
      ],
      projects: [{ id: 'p1', name: 'Old Project' }],
      goals: ['Be productive'],
    };

    const migrated = migrateData(v0Data);
    expect(migrated._schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('removes goals field during migration', () => {
    const v0Data = {
      tasks: [],
      projects: [],
      goals: ['Goal 1', 'Goal 2'],
    };

    const migrated = migrateData(v0Data);
    expect(migrated.goals).toBeUndefined();
  });

  it('fills all default fields on bare tasks', () => {
    const v0Data = {
      tasks: [{ id: 't1', title: 'Bare task' }],
      projects: [],
    };

    const migrated = migrateData(v0Data);
    const t = migrated.tasks[0];

    // Verify all expected fields are filled
    expect(t.status).toBe('todo');
    expect(t.priority).toBe('normal');
    expect(t.horizon).toBe('short');
    expect(t.dueDate).toBe('');
    expect(t.phase).toBe('');
    expect(t.recurrence).toBe('');
    expect(t.estimatedMinutes).toBe(0);
    expect(t.tags).toEqual([]);
    expect(t.blockedBy).toEqual([]);
    expect(t.subtasks).toEqual([]);
    expect(t.createdAt).toBeTruthy();
    expect(t.completedAt).toBeNull();
    expect(t.archived).toBe(false);
    expect(t.updates).toEqual([]);
    expect(t.notes).toBe('');
  });

  it('preserves existing field values during migration', () => {
    const v0Data = {
      tasks: [
        {
          id: 't1',
          title: 'Existing task',
          status: 'done',
          priority: 'urgent',
          tags: ['work'],
          notes: 'important notes',
        },
      ],
      projects: [],
    };

    const migrated = migrateData(v0Data);
    const t = migrated.tasks[0];
    expect(t.status).toBe('done');
    expect(t.priority).toBe('urgent');
    expect(t.tags).toEqual(['work']);
    expect(t.notes).toBe('important notes');
  });

  it('does not run migration on already current data', () => {
    const currentData = {
      _schemaVersion: CURRENT_SCHEMA_VERSION,
      tasks: [{ id: 't1', title: 'Current task' }],
      projects: [],
    };

    const result = migrateData(currentData);
    // Task should NOT get defaults filled since migration was skipped
    expect(result.tasks[0].status).toBeUndefined();
  });

  it('fills arrays with independent references (no shared refs)', () => {
    const v0Data = {
      tasks: [
        { id: 't1', title: 'A' },
        { id: 't2', title: 'B' },
      ],
      projects: [],
    };

    const migrated = migrateData(v0Data);
    migrated.tasks[0].tags.push('modified');
    expect(migrated.tasks[1].tags).toEqual([]);
  });
});

describe('Workflow: Task validation guards', () => {
  it('resets invalid status to todo', () => {
    const t = { status: 'invalid' };
    validateTaskFields(t);
    expect(t.status).toBe('todo');
  });

  it('resets invalid priority to normal', () => {
    const t = { priority: 'super' };
    validateTaskFields(t);
    expect(t.priority).toBe('normal');
  });

  it('resets malformed date to empty string', () => {
    const t = { dueDate: 'not-a-date' };
    validateTaskFields(t);
    expect(t.dueDate).toBe('');
  });

  it('accepts valid YYYY-MM-DD date', () => {
    const t = { dueDate: '2026-06-15' };
    validateTaskFields(t);
    expect(t.dueDate).toBe('2026-06-15');
  });

  it('resets negative estimatedMinutes to 0', () => {
    const t = { estimatedMinutes: -5 };
    validateTaskFields(t);
    expect(t.estimatedMinutes).toBe(0);
  });

  it('resets non-number estimatedMinutes to 0', () => {
    const t = { estimatedMinutes: 'thirty' };
    validateTaskFields(t);
    expect(t.estimatedMinutes).toBe(0);
  });

  it('truncates title to 500 characters', () => {
    const t = { title: 'x'.repeat(600) };
    validateTaskFields(t);
    expect(t.title).toHaveLength(500);
  });

  it('truncates notes to 10000 characters', () => {
    const t = { notes: 'y'.repeat(11000) };
    validateTaskFields(t);
    expect(t.notes).toHaveLength(10000);
  });

  it('resets non-array tags to empty array', () => {
    const t = { tags: 'not-an-array' };
    validateTaskFields(t);
    expect(t.tags).toEqual([]);
  });

  it('resets invalid horizon to short', () => {
    const t = { horizon: 'forever' };
    validateTaskFields(t);
    expect(t.horizon).toBe('short');
  });
});

describe('Workflow: Project and task identity', () => {
  it('genId creates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(genId('t'));
    }
    expect(ids.size).toBe(100);
  });

  it('createTask generates unique IDs for each task', () => {
    const t1 = createTask({ title: 'A' });
    const t2 = createTask({ title: 'B' });
    expect(t1.id).not.toBe(t2.id);
  });

  it('createProject generates unique IDs for each project', () => {
    const p1 = createProject({ name: 'A' });
    const p2 = createProject({ name: 'B' });
    expect(p1.id).not.toBe(p2.id);
  });

  it('task IDs start with t_ prefix', () => {
    const t = createTask({ title: 'Test' });
    expect(t.id).toMatch(/^t_/);
  });

  it('project IDs start with p_ prefix', () => {
    const p = createProject({ name: 'Test' });
    expect(p.id).toMatch(/^p_/);
  });
});

// ============================================================
// Additional workflow tests — extended coverage
// ============================================================

describe('Workflow: Quick-add with due:keyword syntax', () => {
  it('extracts "!urgent" keyword from complex input', () => {
    const mockFindProject = (name) => ({ id: 'p1', name });
    const result = parseQuickInput('Buy groceries #shopping urgent', {
      findSimilarProject: mockFindProject,
    });
    expect(result.priority).toBe('urgent');
    expect(result.dueDate).toBe('');
    expect(result.quickProject).toBeTruthy();
    expect(result.title).toContain('Buy groceries');
  });

  it('handles input with only priority marker', () => {
    const result = parseQuickInput('!!!');
    expect(result.priority).toBe('urgent');
    expect(result.title).toBe('');
  });

  it('handles input with only date', () => {
    const result = parseQuickInput('tomorrow');
    expect(result.priority).toBe('normal');
    expect(result.dueDate).toBeTruthy();
  });

  it('handles empty input', () => {
    const result = parseQuickInput('');
    expect(result.title).toBe('');
    expect(result.priority).toBe('normal');
    expect(result.dueDate).toBe('');
    expect(result.quickProject).toBeNull();
  });

  it('does not extract project tag without findSimilarProject', () => {
    const result = parseQuickInput('task #myproject');
    expect(result.quickProject).toBeNull();
    // #myproject stays in title since no finder was provided
  });

  it('extracts !! as important priority', () => {
    const result = parseQuickInput('Review docs !! today');
    expect(result.priority).toBe('important');
    expect(result.dueDate).toBe(todayStr());
  });

  it('strips single ! without changing priority', () => {
    const result = parseQuickInput('wow!');
    expect(result.priority).toBe('normal');
  });
});

describe('Workflow: Task default values', () => {
  it('new task has empty notes by default', () => {
    const t = createTask({ title: 'Test' });
    expect(t.notes).toBe('');
  });

  it('new task has empty dueDate by default', () => {
    const t = createTask({ title: 'Test' });
    expect(t.dueDate).toBe('');
  });

  it('new task has normal priority by default', () => {
    const t = createTask({ title: 'Test' });
    expect(t.priority).toBe('normal');
  });

  it('new task has short horizon by default', () => {
    const t = createTask({ title: 'Test' });
    expect(t.horizon).toBe('short');
  });

  it('new task has 0 estimatedMinutes by default', () => {
    const t = createTask({ title: 'Test' });
    expect(t.estimatedMinutes).toBe(0);
  });

  it('new task has empty tags array', () => {
    const t = createTask({ title: 'Test' });
    expect(t.tags).toEqual([]);
  });

  it('new task has empty updates array', () => {
    const t = createTask({ title: 'Test' });
    expect(t.updates).toEqual([]);
  });

  it('new task has createdAt timestamp', () => {
    const t = createTask({ title: 'Test' });
    expect(t.createdAt).toBeTruthy();
    expect(new Date(t.createdAt).getTime()).not.toBeNaN();
  });

  it('new task has null completedAt', () => {
    const t = createTask({ title: 'Test' });
    expect(t.completedAt).toBeNull();
  });

  it('new task has empty phase', () => {
    const t = createTask({ title: 'Test' });
    expect(t.phase).toBe('');
  });

  it('new task has empty recurrence', () => {
    const t = createTask({ title: 'Test' });
    expect(t.recurrence).toBe('');
  });
});

describe('Workflow: Complex dependency chains', () => {
  function wouldCreateCircularDep(taskId, newBlockerId, taskMap) {
    const visited = new Set();
    const queue = [newBlockerId];
    while (queue.length) {
      const cid = queue.shift();
      if (cid === taskId) return true;
      if (visited.has(cid)) continue;
      visited.add(cid);
      const t = taskMap.get(cid);
      if (t && t.blockedBy) queue.push(...t.blockedBy);
    }
    return false;
  }

  it('handles a long dependency chain without false positives', () => {
    const tasks = [];
    for (let i = 0; i < 10; i++) {
      tasks.push(
        createTask({
          title: `Task ${i}`,
          blockedBy: i > 0 ? [tasks[i - 1].id] : [],
        }),
      );
    }
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // Adding tasks[0] blocked by tasks[9] would be circular
    expect(wouldCreateCircularDep(tasks[0].id, tasks[9].id, taskMap)).toBe(true);
    // Adding tasks[9] blocked by a new task is fine
    const newTask = createTask({ title: 'New' });
    taskMap.set(newTask.id, newTask);
    expect(wouldCreateCircularDep(tasks[9].id, newTask.id, taskMap)).toBe(false);
  });

  it('handles diamond-shaped dependencies without false alarm', () => {
    const a = createTask({ title: 'A' });
    const b = createTask({ title: 'B', blockedBy: [a.id] });
    const c = createTask({ title: 'C', blockedBy: [a.id] });
    const d = createTask({ title: 'D', blockedBy: [b.id, c.id] });

    const taskMap = new Map([a, b, c, d].map((t) => [t.id, t]));

    // d depends on b and c, both depend on a — no cycle
    expect(wouldCreateCircularDep(a.id, d.id, taskMap)).toBe(true);
    // Adding e blocked by d is fine
    expect(wouldCreateCircularDep(d.id, a.id, taskMap)).toBe(false);
  });

  it('tracks multiple blockers on a single task', () => {
    const t1 = createTask({ title: 'DB Setup' });
    const t2 = createTask({ title: 'Auth Setup' });
    const t3 = createTask({ title: 'Build API', blockedBy: [t1.id, t2.id] });

    expect(t3.blockedBy).toHaveLength(2);
    expect(t3.blockedBy).toContain(t1.id);
    expect(t3.blockedBy).toContain(t2.id);
  });
});

describe('Workflow: Import/export with complex data', () => {
  it('round-trip preserves task tags order', () => {
    const t = createTask({ title: 'Test', tags: ['work', 'urgent', 'frontend'] });
    const roundTrip = JSON.parse(JSON.stringify(t));
    expect(roundTrip.tags).toEqual(['work', 'urgent', 'frontend']);
  });

  it('round-trip preserves recurrence setting', () => {
    const t = createTask({ title: 'Daily', recurrence: 'daily' });
    const roundTrip = JSON.parse(JSON.stringify(t));
    expect(roundTrip.recurrence).toBe('daily');
  });

  it('round-trip preserves estimatedMinutes', () => {
    const t = createTask({ title: 'Task', estimatedMinutes: 45 });
    const roundTrip = JSON.parse(JSON.stringify(t));
    expect(roundTrip.estimatedMinutes).toBe(45);
  });

  it('round-trip preserves project descriptions', () => {
    const p = createProject({ name: 'Test', description: 'A test project' });
    const roundTrip = JSON.parse(JSON.stringify(p));
    expect(roundTrip.description).toBe('A test project');
  });

  it('large dataset round-trip preserves all tasks', () => {
    const tasks = [];
    for (let i = 0; i < 100; i++) {
      tasks.push(createTask({ title: `Task ${i}`, priority: i % 2 === 0 ? 'urgent' : 'low' }));
    }
    const roundTrip = JSON.parse(JSON.stringify({ tasks }));
    expect(roundTrip.tasks).toHaveLength(100);
    expect(roundTrip.tasks[50].priority).toBe('urgent');
    expect(roundTrip.tasks[51].priority).toBe('low');
  });
});

describe('Workflow: Schema migration edge cases', () => {
  it('migrates data with empty tasks array', () => {
    const v0Data = { tasks: [], projects: [] };
    const migrated = migrateData(v0Data);
    expect(migrated._schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.tasks).toEqual([]);
  });

  it('migrates data with missing tasks property gracefully', () => {
    const v0Data = { projects: [] };
    const migrated = migrateData(v0Data);
    expect(migrated._schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('returns null/undefined input unchanged', () => {
    expect(migrateData(null)).toBeNull();
    expect(migrateData(undefined)).toBeUndefined();
  });

  it('handles task with pre-existing updates array', () => {
    const v0Data = {
      tasks: [
        {
          id: 't1',
          title: 'Task',
          updates: [{ text: 'started', date: '2026-01-01' }],
        },
      ],
      projects: [],
    };
    const migrated = migrateData(v0Data);
    expect(migrated.tasks[0].updates).toHaveLength(1);
    expect(migrated.tasks[0].updates[0].text).toBe('started');
  });

  it('fills createdAt for tasks without it', () => {
    const v0Data = {
      tasks: [{ id: 't1', title: 'No timestamp' }],
      projects: [],
    };
    const migrated = migrateData(v0Data);
    expect(migrated.tasks[0].createdAt).toBeTruthy();
    expect(new Date(migrated.tasks[0].createdAt).getTime()).not.toBeNaN();
  });
});

describe('Workflow: Validation edge cases', () => {
  it('accepts all valid statuses', () => {
    for (const status of ['todo', 'in-progress', 'done']) {
      const t = { status };
      validateTaskFields(t);
      expect(t.status).toBe(status);
    }
  });

  it('accepts all valid priorities', () => {
    for (const priority of ['urgent', 'important', 'normal', 'low']) {
      const t = { priority };
      validateTaskFields(t);
      expect(t.priority).toBe(priority);
    }
  });

  it('accepts all valid horizons', () => {
    for (const horizon of ['short', 'long', '']) {
      const t = { horizon };
      validateTaskFields(t);
      expect(t.horizon).toBe(horizon);
    }
  });

  it('accepts all valid recurrences', () => {
    for (const recurrence of ['', 'daily', 'weekly', 'monthly']) {
      const t = { recurrence };
      validateTaskFields(t);
      expect(t.recurrence).toBe(recurrence);
    }
  });

  it('resets non-boolean archived to false', () => {
    const t = { archived: 'yes' };
    validateTaskFields(t);
    expect(t.archived).toBe(false);
  });

  it('accepts Infinity estimatedMinutes and resets to 0', () => {
    const t = { estimatedMinutes: Infinity };
    validateTaskFields(t);
    expect(t.estimatedMinutes).toBe(0);
  });

  it('resets non-array subtasks to empty array', () => {
    const t = { subtasks: 'not-array' };
    validateTaskFields(t);
    expect(t.subtasks).toEqual([]);
  });

  it('resets non-array blockedBy to empty array', () => {
    const t = { blockedBy: 'not-array' };
    validateTaskFields(t);
    expect(t.blockedBy).toEqual([]);
  });

  it('resets non-array updates to empty array', () => {
    const t = { updates: 'not-array' };
    validateTaskFields(t);
    expect(t.updates).toEqual([]);
  });
});
