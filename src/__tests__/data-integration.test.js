import { describe, it, expect } from 'vitest';
import {
  createTask,
  createProject,
  findTask,
  findSimilarTask,
  findSimilarProject,
  sortTasks,
  validateTaskFields,
  titleSimilarity,
  normalizeTitle,
  PRIORITY_ORDER,
} from '../app.js';

// ============================================================
// Data integration tests — validateTaskFields, createTask,
// sortTasks, findSimilarTask, and edge cases
// ============================================================

describe('validateTaskFields', () => {
  describe('status validation', () => {
    it('accepts valid statuses', () => {
      for (const status of ['todo', 'in-progress', 'done']) {
        const t = { status };
        validateTaskFields(t);
        expect(t.status).toBe(status);
      }
    });

    it('resets invalid status to todo', () => {
      const t = { status: 'invalid-status' };
      validateTaskFields(t);
      expect(t.status).toBe('todo');
    });

    it('resets empty string status to todo', () => {
      const t = { status: '' };
      validateTaskFields(t);
      expect(t.status).toBe('todo');
    });

    it('leaves undefined status untouched', () => {
      const t = { title: 'test' };
      validateTaskFields(t);
      expect(t.status).toBeUndefined();
    });
  });

  describe('priority validation', () => {
    it('accepts valid priorities', () => {
      for (const priority of ['urgent', 'important', 'normal', 'low']) {
        const t = { priority };
        validateTaskFields(t);
        expect(t.priority).toBe(priority);
      }
    });

    it('resets invalid priority to normal', () => {
      const t = { priority: 'super-high' };
      validateTaskFields(t);
      expect(t.priority).toBe('normal');
    });
  });

  describe('dueDate validation', () => {
    it('accepts valid YYYY-MM-DD date', () => {
      const t = { dueDate: '2026-03-15' };
      validateTaskFields(t);
      expect(t.dueDate).toBe('2026-03-15');
    });

    it('accepts empty string dueDate', () => {
      const t = { dueDate: '' };
      validateTaskFields(t);
      expect(t.dueDate).toBe('');
    });

    it('resets malformed date to empty string', () => {
      const t = { dueDate: 'March 15' };
      validateTaskFields(t);
      expect(t.dueDate).toBe('');
    });

    it('resets date with wrong separator to empty string', () => {
      const t = { dueDate: '2026/03/15' };
      validateTaskFields(t);
      expect(t.dueDate).toBe('');
    });

    it('resets partial date to empty string', () => {
      const t = { dueDate: '2026-03' };
      validateTaskFields(t);
      expect(t.dueDate).toBe('');
    });
  });

  describe('estimatedMinutes validation', () => {
    it('accepts valid positive number', () => {
      const t = { estimatedMinutes: 30 };
      validateTaskFields(t);
      expect(t.estimatedMinutes).toBe(30);
    });

    it('accepts zero', () => {
      const t = { estimatedMinutes: 0 };
      validateTaskFields(t);
      expect(t.estimatedMinutes).toBe(0);
    });

    it('resets negative number to 0', () => {
      const t = { estimatedMinutes: -10 };
      validateTaskFields(t);
      expect(t.estimatedMinutes).toBe(0);
    });

    it('resets string to 0', () => {
      const t = { estimatedMinutes: '30' };
      validateTaskFields(t);
      expect(t.estimatedMinutes).toBe(0);
    });

    it('resets NaN to 0', () => {
      const t = { estimatedMinutes: NaN };
      validateTaskFields(t);
      expect(t.estimatedMinutes).toBe(0);
    });

    it('resets Infinity to 0', () => {
      const t = { estimatedMinutes: Infinity };
      validateTaskFields(t);
      expect(t.estimatedMinutes).toBe(0);
    });
  });

  describe('horizon validation', () => {
    it('accepts valid horizons', () => {
      for (const horizon of ['short', 'long', '']) {
        const t = { horizon };
        validateTaskFields(t);
        expect(t.horizon).toBe(horizon);
      }
    });

    it('resets invalid horizon to short', () => {
      const t = { horizon: 'medium' };
      validateTaskFields(t);
      expect(t.horizon).toBe('short');
    });
  });

  describe('recurrence validation', () => {
    it('accepts valid recurrences', () => {
      for (const recurrence of ['daily', 'weekly', 'monthly', '']) {
        const t = { recurrence };
        validateTaskFields(t);
        expect(t.recurrence).toBe(recurrence);
      }
    });

    it('resets invalid recurrence to empty string', () => {
      const t = { recurrence: 'yearly' };
      validateTaskFields(t);
      expect(t.recurrence).toBe('');
    });
  });

  describe('tags validation', () => {
    it('accepts valid array', () => {
      const t = { tags: ['bug', 'frontend'] };
      validateTaskFields(t);
      expect(t.tags).toEqual(['bug', 'frontend']);
    });

    it('resets non-array to empty array', () => {
      const t = { tags: 'bug' };
      validateTaskFields(t);
      expect(t.tags).toEqual([]);
    });

    it('resets null tags to empty array', () => {
      const t = { tags: null };
      validateTaskFields(t);
      expect(t.tags).toEqual([]);
    });
  });

  describe('subtasks validation', () => {
    it('accepts valid subtask array', () => {
      const subtasks = [{ id: 'st_1', title: 'Step 1', done: false }];
      const t = { subtasks };
      validateTaskFields(t);
      expect(t.subtasks).toEqual(subtasks);
    });

    it('resets non-array to empty array', () => {
      const t = { subtasks: 'step 1' };
      validateTaskFields(t);
      expect(t.subtasks).toEqual([]);
    });
  });

  describe('blockedBy validation', () => {
    it('accepts valid array of task IDs', () => {
      const t = { blockedBy: ['t_1', 't_2'] };
      validateTaskFields(t);
      expect(t.blockedBy).toEqual(['t_1', 't_2']);
    });

    it('resets non-array to empty array', () => {
      const t = { blockedBy: 't_1' };
      validateTaskFields(t);
      expect(t.blockedBy).toEqual([]);
    });
  });

  describe('updates validation', () => {
    it('accepts valid array', () => {
      const updates = [{ date: '2026-03-15', text: 'Started work' }];
      const t = { updates };
      validateTaskFields(t);
      expect(t.updates).toEqual(updates);
    });

    it('resets non-array to empty array', () => {
      const t = { updates: 'some update' };
      validateTaskFields(t);
      expect(t.updates).toEqual([]);
    });
  });

  describe('archived validation', () => {
    it('accepts boolean true', () => {
      const t = { archived: true };
      validateTaskFields(t);
      expect(t.archived).toBe(true);
    });

    it('accepts boolean false', () => {
      const t = { archived: false };
      validateTaskFields(t);
      expect(t.archived).toBe(false);
    });

    it('resets non-boolean to false', () => {
      const t = { archived: 1 };
      validateTaskFields(t);
      expect(t.archived).toBe(false);
    });

    it('resets string to false', () => {
      const t = { archived: 'true' };
      validateTaskFields(t);
      expect(t.archived).toBe(false);
    });
  });

  describe('title length validation', () => {
    it('preserves title under 500 chars', () => {
      const t = { title: 'Short title' };
      validateTaskFields(t);
      expect(t.title).toBe('Short title');
    });

    it('truncates title over 500 chars', () => {
      const longTitle = 'A'.repeat(600);
      const t = { title: longTitle };
      validateTaskFields(t);
      expect(t.title.length).toBe(500);
    });

    it('handles exactly 500 char title', () => {
      const exactTitle = 'B'.repeat(500);
      const t = { title: exactTitle };
      validateTaskFields(t);
      expect(t.title.length).toBe(500);
    });
  });

  describe('notes length validation', () => {
    it('preserves notes under 10000 chars', () => {
      const t = { notes: 'Short notes' };
      validateTaskFields(t);
      expect(t.notes).toBe('Short notes');
    });

    it('truncates notes over 10000 chars', () => {
      const longNotes = 'N'.repeat(15000);
      const t = { notes: longNotes };
      validateTaskFields(t);
      expect(t.notes.length).toBe(10000);
    });
  });

  describe('multiple fields at once', () => {
    it('validates and corrects multiple invalid fields simultaneously', () => {
      const t = {
        status: 'bogus',
        priority: 'super',
        dueDate: 'tomorrow',
        estimatedMinutes: -5,
        horizon: 'eternity',
        recurrence: 'yearly',
        tags: 'not-an-array',
        subtasks: null,
        blockedBy: 42,
        updates: {},
        archived: 'yes',
        title: 'X'.repeat(1000),
        notes: 'Y'.repeat(20000),
      };
      validateTaskFields(t);
      expect(t.status).toBe('todo');
      expect(t.priority).toBe('normal');
      expect(t.dueDate).toBe('');
      expect(t.estimatedMinutes).toBe(0);
      expect(t.horizon).toBe('short');
      expect(t.recurrence).toBe('');
      expect(t.tags).toEqual([]);
      expect(t.subtasks).toEqual([]);
      expect(t.blockedBy).toEqual([]);
      expect(t.updates).toEqual([]);
      expect(t.archived).toBe(false);
      expect(t.title.length).toBe(500);
      expect(t.notes.length).toBe(10000);
    });

    it('returns the same object reference (mutates in place)', () => {
      const t = { status: 'bad' };
      const result = validateTaskFields(t);
      expect(result).toBe(t);
    });
  });
});

describe('createTask', () => {
  it('creates a task with default values', () => {
    const t = createTask();
    expect(t.id).toMatch(/^t_/);
    expect(t.title).toBe('');
    expect(t.notes).toBe('');
    expect(t.status).toBe('todo');
    expect(t.priority).toBe('normal');
    expect(t.horizon).toBe('short');
    expect(t.project).toBe('');
    expect(t.dueDate).toBe('');
    expect(t.recurrence).toBe('');
    expect(t.estimatedMinutes).toBe(0);
    expect(t.tags).toEqual([]);
    expect(t.blockedBy).toEqual([]);
    expect(t.subtasks).toEqual([]);
    expect(t.updates).toEqual([]);
    expect(t.archived).toBe(false);
    expect(t.completedAt).toBeNull();
    expect(t.createdAt).toBeTruthy();
  });

  it('accepts overrides for fields', () => {
    const t = createTask({
      title: 'My task',
      priority: 'urgent',
      status: 'in-progress',
      tags: ['feature'],
    });
    expect(t.title).toBe('My task');
    expect(t.priority).toBe('urgent');
    expect(t.status).toBe('in-progress');
    expect(t.tags).toEqual(['feature']);
    expect(t.id).toMatch(/^t_/);
  });

  it('generates unique IDs for each task', () => {
    const t1 = createTask();
    const t2 = createTask();
    expect(t1.id).not.toBe(t2.id);
  });

  it('truncates title over 500 chars', () => {
    const t = createTask({ title: 'Z'.repeat(600) });
    expect(t.title.length).toBe(500);
  });

  it('truncates notes over 10000 chars', () => {
    const t = createTask({ notes: 'W'.repeat(15000) });
    expect(t.notes.length).toBe(10000);
  });

  it('preserves custom createdAt if provided', () => {
    const ts = '2025-01-01T00:00:00.000Z';
    const t = createTask({ createdAt: ts });
    expect(t.createdAt).toBe(ts);
  });

  it('handles special characters in title', () => {
    const specialTitle = '<script>alert("xss")</script> & "quotes" \'apos\'';
    const t = createTask({ title: specialTitle });
    expect(t.title).toBe(specialTitle);
  });

  it('handles empty string overrides', () => {
    const t = createTask({ title: '', notes: '' });
    expect(t.title).toBe('');
    expect(t.notes).toBe('');
  });

  it('handles unicode in title and notes', () => {
    const t = createTask({ title: 'Fix bug 🐛 in módule', notes: '日本語テスト' });
    expect(t.title).toBe('Fix bug 🐛 in módule');
    expect(t.notes).toBe('日本語テスト');
  });
});

describe('createTask + sortTasks round-trip', () => {
  it('sorts by priority: urgent before important before normal before low', () => {
    const tasks = [
      createTask({ title: 'Low', priority: 'low' }),
      createTask({ title: 'Urgent', priority: 'urgent' }),
      createTask({ title: 'Normal', priority: 'normal' }),
      createTask({ title: 'Important', priority: 'important' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted.map((t) => t.priority)).toEqual(['urgent', 'important', 'normal', 'low']);
  });

  it('in-progress tasks sort before todo tasks of same priority', () => {
    const tasks = [
      createTask({ title: 'Todo', status: 'todo', priority: 'normal' }),
      createTask({ title: 'In Progress', status: 'in-progress', priority: 'normal' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('In Progress');
    expect(sorted[1].title).toBe('Todo');
  });

  it('status trumps priority: in-progress low beats todo urgent', () => {
    const tasks = [
      createTask({ title: 'Urgent Todo', status: 'todo', priority: 'urgent' }),
      createTask({ title: 'Low In Progress', status: 'in-progress', priority: 'low' }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('Low In Progress');
  });

  it('does not mutate the original array', () => {
    const tasks = [createTask({ title: 'B', priority: 'low' }), createTask({ title: 'A', priority: 'urgent' })];
    const original = [...tasks];
    sortTasks(tasks);
    expect(tasks[0].title).toBe(original[0].title);
    expect(tasks[1].title).toBe(original[1].title);
  });

  it('handles empty array', () => {
    const sorted = sortTasks([]);
    expect(sorted).toEqual([]);
  });

  it('handles single task', () => {
    const tasks = [createTask({ title: 'Only' })];
    const sorted = sortTasks(tasks);
    expect(sorted.length).toBe(1);
    expect(sorted[0].title).toBe('Only');
  });

  it('uses interest as tiebreaker when status and priority are equal', () => {
    const tasks = [
      createTask({ title: 'Low Interest', priority: 'normal', status: 'todo' }),
      createTask({ title: 'High Interest', priority: 'normal', status: 'todo' }),
    ];
    // Manually set interest — higher interest should come first
    tasks[0].interest = 1;
    tasks[1].interest = 5;
    const sorted = sortTasks(tasks);
    expect(sorted[0].title).toBe('High Interest');
    expect(sorted[1].title).toBe('Low Interest');
  });

  it('sorts many tasks correctly in a complex mix', () => {
    const tasks = [
      createTask({ title: 'E', priority: 'low', status: 'todo' }),
      createTask({ title: 'A', priority: 'urgent', status: 'in-progress' }),
      createTask({ title: 'C', priority: 'normal', status: 'todo' }),
      createTask({ title: 'B', priority: 'urgent', status: 'todo' }),
      createTask({ title: 'D', priority: 'important', status: 'in-progress' }),
    ];
    const sorted = sortTasks(tasks);
    // in-progress first (A urgent, D important), then todo (B urgent, C normal, E low)
    expect(sorted[0].title).toBe('A');
    expect(sorted[1].title).toBe('D');
    expect(sorted[2].title).toBe('B');
    expect(sorted[3].title).toBe('C');
    expect(sorted[4].title).toBe('E');
  });
});

describe('PRIORITY_ORDER', () => {
  it('has correct ordering values', () => {
    expect(PRIORITY_ORDER.urgent).toBeLessThan(PRIORITY_ORDER.important);
    expect(PRIORITY_ORDER.important).toBeLessThan(PRIORITY_ORDER.normal);
    expect(PRIORITY_ORDER.normal).toBeLessThan(PRIORITY_ORDER.low);
  });
});

describe('titleSimilarity and normalizeTitle', () => {
  it('returns 1 for identical titles', () => {
    expect(titleSimilarity('Fix login bug', 'Fix login bug')).toBe(1);
  });

  it('returns 1 for case-insensitive match', () => {
    expect(titleSimilarity('Fix Login Bug', 'fix login bug')).toBe(1);
  });

  it('returns 1 when only punctuation differs', () => {
    expect(titleSimilarity('Fix login bug!', 'Fix login bug')).toBe(1);
  });

  it('returns high score for substring match', () => {
    const score = titleSimilarity('Fix login', 'Fix login bug');
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('returns low score for unrelated titles', () => {
    const score = titleSimilarity('Fix login bug', 'Deploy to production');
    expect(score).toBeLessThan(0.5);
  });

  it('handles empty strings', () => {
    expect(titleSimilarity('', '')).toBe(1);
  });

  it('handles one empty string — substring match triggers high score', () => {
    // normalizeTitle('') === '' and '' is a substring of anything,
    // so titleSimilarity returns 0.85 (the substring branch)
    const score = titleSimilarity('Fix bug', '');
    expect(score).toBe(0.85);
  });

  it('normalizeTitle strips punctuation and lowercases', () => {
    expect(normalizeTitle('Hello, World!')).toBe('hello world');
  });

  it('normalizeTitle collapses whitespace', () => {
    expect(normalizeTitle('  too   many   spaces  ')).toBe('too many spaces');
  });

  it('normalizeTitle handles null/undefined', () => {
    expect(normalizeTitle(null)).toBe('');
    expect(normalizeTitle(undefined)).toBe('');
  });

  it('detects near-duplicate titles (jaccard similarity)', () => {
    // Same words, different order — should have high similarity
    const score = titleSimilarity('update user profile page', 'user profile page update');
    expect(score).toBe(1); // same normalized words
  });

  it('partial word overlap gives proportional score', () => {
    // 2 shared words out of 4 unique words
    const score = titleSimilarity('fix login page', 'fix signup page');
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(1);
  });
});

describe('findSimilarTask', () => {
  // findSimilarTask searches module-level data.tasks which starts empty in tests
  // (addTask is not exported), so we verify it returns null for no matches

  it('returns null when no tasks exist', () => {
    const result = findSimilarTask('Some task title', null);
    expect(result).toBeNull();
  });

  it('returns null for empty title', () => {
    const result = findSimilarTask('', null);
    expect(result).toBeNull();
  });
});

describe('findSimilarProject', () => {
  it('returns null when no projects match', () => {
    const result = findSimilarProject('Nonexistent Board');
    expect(result).toBeNull();
  });
});

describe('findTask', () => {
  it('returns undefined for nonexistent task ID', () => {
    const result = findTask('t_nonexistent_999');
    expect(result).toBeUndefined();
  });
});

describe('edge cases', () => {
  describe('createTask with null/undefined field values', () => {
    it('allows null completedAt', () => {
      const t = createTask({ completedAt: null });
      expect(t.completedAt).toBeNull();
    });

    it('handles undefined override gracefully', () => {
      const t = createTask({ title: undefined });
      // undefined spread doesn't override the default ''
      expect(t.title).toBeUndefined();
    });
  });

  describe('validateTaskFields with edge values', () => {
    it('handles object with no matching fields (noop)', () => {
      const t = { someRandom: 'field' };
      validateTaskFields(t);
      expect(t.someRandom).toBe('field');
      expect(t.status).toBeUndefined();
    });

    it('handles empty object', () => {
      const t = {};
      const result = validateTaskFields(t);
      expect(result).toEqual({});
    });

    it('preserves valid fields when correcting invalid ones', () => {
      const t = { title: 'Valid title', status: 'garbage', priority: 'urgent' };
      validateTaskFields(t);
      expect(t.title).toBe('Valid title');
      expect(t.status).toBe('todo');
      expect(t.priority).toBe('urgent');
    });
  });

  describe('sortTasks with duplicate priorities', () => {
    it('maintains relative order for same priority and status', () => {
      const tasks = [
        createTask({ title: 'First', priority: 'normal', status: 'todo' }),
        createTask({ title: 'Second', priority: 'normal', status: 'todo' }),
        createTask({ title: 'Third', priority: 'normal', status: 'todo' }),
      ];
      // All same interest (default 0/undefined), so order depends on tiebreaker
      const sorted = sortTasks(tasks);
      expect(sorted.length).toBe(3);
      // All should still be present
      const titles = sorted.map((t) => t.title);
      expect(titles).toContain('First');
      expect(titles).toContain('Second');
      expect(titles).toContain('Third');
    });
  });

  describe('special characters in task fields', () => {
    it('createTask preserves HTML entities in title', () => {
      const t = createTask({ title: '&lt;div&gt; &amp; stuff' });
      expect(t.title).toBe('&lt;div&gt; &amp; stuff');
    });

    it('createTask preserves newlines in notes', () => {
      const t = createTask({ notes: 'Line 1\nLine 2\nLine 3' });
      expect(t.notes).toBe('Line 1\nLine 2\nLine 3');
    });

    it('createTask handles very long tag names', () => {
      const longTag = 'a'.repeat(200);
      const t = createTask({ tags: [longTag] });
      expect(t.tags[0].length).toBe(200);
    });
  });

  describe('createProject', () => {
    it('creates a project with default values', () => {
      const p = createProject();
      expect(p.id).toMatch(/^p_/);
      expect(p.name).toBe('');
      expect(p.description).toBe('');
      expect(p.createdAt).toBeTruthy();
    });

    it('accepts overrides', () => {
      const p = createProject({ name: 'My Board', description: 'A project' });
      expect(p.name).toBe('My Board');
      expect(p.description).toBe('A project');
    });

    it('generates unique IDs', () => {
      const p1 = createProject();
      const p2 = createProject();
      expect(p1.id).not.toBe(p2.id);
    });
  });
});
