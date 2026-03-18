import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MS_PER_DAY } from '../constants.js';
import { createProactive } from '../proactive.js';

function makeDeps(overrides = {}) {
  return {
    $: vi.fn((sel) => document.querySelector(sel)),
    esc: vi.fn((s) => (s == null ? '' : String(s))),
    sanitizeAIHTML: vi.fn((s) => s),
    todayStr: vi.fn(() => '2026-03-16'),
    localISO: vi.fn((d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }),
    genId: vi.fn((prefix) => `${prefix}_gen`),
    getData: vi.fn(() => ({ tasks: [], projects: [] })),
    userKey: vi.fn((k) => `user1_${k}`),
    hasAI: vi.fn(() => false),
    callAI: vi.fn(async () => ''),
    buildAIContext: vi.fn(() => ''),
    addAIMemory: vi.fn(),
    getAIMemory: vi.fn(() => []),
    findTask: vi.fn(() => null),
    updateTask: vi.fn(),
    addTask: vi.fn(),
    createTask: vi.fn((t) => ({ id: 't_new', ...t })),
    isBlocked: vi.fn(() => false),
    showToast: vi.fn(),
    render: vi.fn(),
    setView: vi.fn(),
    notifyOverdueTasks: vi.fn(),
    getProactiveLog: vi.fn(() => []),
    setProactiveLog: vi.fn(),
    getProactiveRunning: vi.fn(() => false),
    setProactiveRunning: vi.fn(),
    setBriefingGenerating: vi.fn(),
    setPlanGenerating: vi.fn(),
    setNudgeFilter: vi.fn(),
    setProactiveResults: vi.fn(),
    setPlanIndexCache: vi.fn(),
    ...overrides,
  };
}

describe('getSmartDefaults', () => {
  let proactive;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
    proactive = createProactive(deps);
  });

  it('returns empty object for empty title', () => {
    expect(proactive.getSmartDefaults('')).toEqual({});
    expect(proactive.getSmartDefaults(null)).toEqual({});
    expect(proactive.getSmartDefaults(undefined)).toEqual({});
  });

  it('suggests urgent priority for urgent keywords', () => {
    const result = proactive.getSmartDefaults('urgent fix server crash');
    expect(result.suggestedPriority).toBe('urgent');
  });

  it('suggests urgent for ASAP keyword', () => {
    const result = proactive.getSmartDefaults('Send report ASAP');
    expect(result.suggestedPriority).toBe('urgent');
  });

  it('suggests urgent for deadline keyword', () => {
    const result = proactive.getSmartDefaults('deadline tomorrow for proposal');
    expect(result.suggestedPriority).toBe('urgent');
  });

  it('suggests important priority for important keywords', () => {
    const result = proactive.getSmartDefaults('important client meeting prep');
    expect(result.suggestedPriority).toBe('important');
  });

  it('suggests low priority for someday/maybe keywords', () => {
    const result = proactive.getSmartDefaults('someday learn guitar');
    expect(result.suggestedPriority).toBe('low');
  });

  it('suggests project based on project name keyword match', () => {
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't1',
          title: 'deploy backend service',
          project: 'p1',
          status: 'done',
          completedAt: '2026-03-10T10:00:00Z',
          createdAt: '2026-03-08T10:00:00Z',
          priority: 'normal',
        },
        { id: 't2', title: 'backend API endpoint', project: 'p1', status: 'todo', priority: 'normal' },
      ],
      projects: [
        { id: 'p1', name: 'Backend Work', color: '#818cf8' },
        { id: 'p2', name: 'Marketing', color: '#f472b6' },
      ],
    });
    proactive = createProactive(deps);
    const result = proactive.getSmartDefaults('fix backend auth issue');
    expect(result.suggestedProject).toBe('p1');
    expect(result.suggestedProjectName).toBe('Backend Work');
  });

  it('suggests priority from past task patterns', () => {
    const tasks = [];
    for (let i = 0; i < 5; i++) {
      tasks.push({
        id: `t${i}`,
        title: `deploy service ${i}`,
        project: 'p1',
        status: 'done',
        completedAt: '2026-03-10T10:00:00Z',
        createdAt: '2026-03-08T10:00:00Z',
        priority: 'urgent',
      });
    }
    deps.getData.mockReturnValue({ tasks, projects: [] });
    proactive = createProactive(deps);
    const result = proactive.getSmartDefaults('deploy service update');
    expect(result.suggestedPriority).toBe('urgent');
  });

  it('does not suggest due dates (never invent deadlines)', () => {
    const now = Date.now();
    const tasks = [];
    for (let i = 0; i < 6; i++) {
      tasks.push({
        id: `t${i}`,
        title: `review document ${i}`,
        project: 'p1',
        status: 'done',
        completedAt: new Date(now - (10 + i) * MS_PER_DAY + 3 * MS_PER_DAY).toISOString(),
        createdAt: new Date(now - (10 + i) * MS_PER_DAY).toISOString(),
        priority: 'normal',
      });
    }
    deps.getData.mockReturnValue({ tasks, projects: [] });
    proactive = createProactive(deps);
    const result = proactive.getSmartDefaults('review document final');
    expect(result.suggestedDueDate).toBeUndefined();
  });

  it('suggests estimated time from similar past tasks', () => {
    const now = Date.now();
    const tasks = [];
    for (let i = 0; i < 5; i++) {
      tasks.push({
        id: `t${i}`,
        title: `write report ${i}`,
        project: 'p1',
        status: 'done',
        completedAt: new Date(now - i * MS_PER_DAY).toISOString(),
        createdAt: new Date(now - (i + 2) * MS_PER_DAY).toISOString(),
        priority: 'normal',
        estimatedMinutes: 60,
      });
    }
    deps.getData.mockReturnValue({ tasks, projects: [] });
    proactive = createProactive(deps);
    const result = proactive.getSmartDefaults('write report summary');
    expect(result.suggestedEstimate).toBe(60);
  });

  it('uses AI memory patterns for priority suggestion', () => {
    deps.getAIMemory.mockReturnValue([{ type: 'pattern', text: 'Tasks about deploy are always urgent', strength: 2 }]);
    deps.getData.mockReturnValue({ tasks: [], projects: [] });
    proactive = createProactive(deps);
    const result = proactive.getSmartDefaults('deploy new version');
    expect(result.suggestedPriority).toBe('urgent');
  });
});

describe('predictCompletion', () => {
  let proactive;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
  });

  it('returns null for non-existent task', () => {
    proactive = createProactive(deps);
    expect(proactive.predictCompletion('nonexistent')).toBeNull();
  });

  it('returns null for done tasks', () => {
    const task = {
      id: 't1',
      title: 'Done task',
      status: 'done',
      priority: 'normal',
      createdAt: '2026-03-10T10:00:00Z',
    };
    deps.getData.mockReturnValue({ tasks: [task], projects: [] });
    deps.findTask.mockReturnValue(task);
    proactive = createProactive(deps);
    expect(proactive.predictCompletion('t1')).toBeNull();
  });

  it('returns high likelihood for simple task with low workload', () => {
    const now = new Date();
    const task = {
      id: 't1',
      title: 'Simple task',
      status: 'todo',
      priority: 'normal',
      createdAt: now.toISOString(),
    };
    const doneTasks = [];
    for (let i = 0; i < 10; i++) {
      doneTasks.push({
        id: `d${i}`,
        title: `done ${i}`,
        status: 'done',
        priority: 'normal',
        createdAt: new Date(now.getTime() - (i + 3) * MS_PER_DAY).toISOString(),
        completedAt: new Date(now.getTime() - i * MS_PER_DAY).toISOString(),
      });
    }
    deps.getData.mockReturnValue({ tasks: [task, ...doneTasks], projects: [] });
    deps.findTask.mockReturnValue(task);
    proactive = createProactive(deps);
    const result = proactive.predictCompletion('t1');
    expect(result).not.toBeNull();
    expect(result.likelihood).toBe('high');
    expect(result.estimatedDate).toBeDefined();
    expect(result.estimatedDays).toBeGreaterThanOrEqual(1);
    expect(result.blockers).toEqual([]);
  });

  it('returns low likelihood for blocked task', () => {
    const task = {
      id: 't1',
      title: 'Blocked task',
      status: 'todo',
      priority: 'normal',
      createdAt: '2026-03-10T10:00:00Z',
      blockedBy: ['t2'],
    };
    deps.getData.mockReturnValue({ tasks: [task], projects: [] });
    deps.findTask.mockReturnValue(task);
    deps.isBlocked.mockReturnValue(true);
    proactive = createProactive(deps);
    const result = proactive.predictCompletion('t1');
    expect(result.likelihood).toBe('low');
    expect(result.blockers).toContain('Task is blocked by dependencies');
  });

  it('returns medium likelihood for heavy workload', () => {
    const now = new Date();
    const task = {
      id: 't1',
      title: 'Task in heavy workload',
      status: 'todo',
      priority: 'normal',
      createdAt: now.toISOString(),
    };
    const activeTasks = [];
    for (let i = 0; i < 25; i++) {
      activeTasks.push({
        id: `a${i}`,
        title: `active ${i}`,
        status: 'todo',
        priority: 'normal',
        createdAt: now.toISOString(),
      });
    }
    deps.getData.mockReturnValue({ tasks: [task, ...activeTasks], projects: [] });
    deps.findTask.mockReturnValue(task);
    proactive = createProactive(deps);
    const result = proactive.predictCompletion('t1');
    expect(result.likelihood).toBe('medium');
  });

  it('applies priority factor - urgent tasks estimate faster', () => {
    const now = new Date();
    const urgentTask = {
      id: 't1',
      title: 'Urgent task',
      status: 'todo',
      priority: 'urgent',
      createdAt: now.toISOString(),
      estimatedMinutes: 120,
    };
    const normalTask = {
      id: 't2',
      title: 'Normal task',
      status: 'todo',
      priority: 'normal',
      createdAt: now.toISOString(),
      estimatedMinutes: 120,
    };
    const doneTasks = [];
    for (let i = 0; i < 5; i++) {
      doneTasks.push({
        id: `d${i}`,
        title: `done ${i}`,
        status: 'done',
        priority: 'normal',
        createdAt: new Date(now.getTime() - (i + 2) * MS_PER_DAY).toISOString(),
        completedAt: new Date(now.getTime() - i * MS_PER_DAY).toISOString(),
      });
    }

    deps.getData.mockReturnValue({ tasks: [urgentTask, normalTask, ...doneTasks], projects: [] });
    deps.findTask.mockReturnValue(urgentTask);
    proactive = createProactive(deps);
    const urgentResult = proactive.predictCompletion('t1');

    deps.findTask.mockReturnValue(normalTask);
    const normalResult = proactive.predictCompletion('t2');

    expect(urgentResult.estimatedDays).toBeLessThanOrEqual(normalResult.estimatedDays);
  });
});

describe('getFollowUpSuggestions', () => {
  let proactive;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
  });

  it('returns empty array for null task', () => {
    proactive = createProactive(deps);
    expect(proactive.getFollowUpSuggestions(null)).toEqual([]);
  });

  it('suggests unblocked tasks', () => {
    const completedTask = { id: 't1', title: 'Prerequisite task', status: 'done', project: 'p1' };
    const blockedTask = { id: 't2', title: 'Dependent task', status: 'todo', project: 'p1', blockedBy: ['t1'] };
    deps.getData.mockReturnValue({
      tasks: [completedTask, blockedTask],
      projects: [{ id: 'p1', name: 'Work' }],
    });
    deps.findTask.mockImplementation((id) => {
      if (id === 't1') return completedTask;
      if (id === 't2') return blockedTask;
      return null;
    });
    proactive = createProactive(deps);
    const suggestions = proactive.getFollowUpSuggestions(completedTask);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const unblocked = suggestions.find((s) => s.type === 'unblocked');
    expect(unblocked).toBeDefined();
    expect(unblocked.taskId).toBe('t2');
  });

  it('suggests related tasks in same project', () => {
    const completedTask = { id: 't1', title: 'Write backend tests', status: 'done', project: 'p1' };
    const relatedTask = { id: 't2', title: 'Write frontend tests', status: 'todo', project: 'p1', priority: 'normal' };
    deps.getData.mockReturnValue({
      tasks: [completedTask, relatedTask],
      projects: [{ id: 'p1', name: 'Testing' }],
    });
    proactive = createProactive(deps);
    const suggestions = proactive.getFollowUpSuggestions(completedTask);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const related = suggestions.find((s) => s.type === 'related');
    expect(related).toBeDefined();
    expect(related.taskId).toBe('t2');
  });

  it('detects nearly-done project', () => {
    const completedTask = { id: 't1', title: 'Task A', status: 'done', project: 'p1' };
    const remaining = { id: 't2', title: 'Task B', status: 'todo', project: 'p1', priority: 'normal' };
    deps.getData.mockReturnValue({
      tasks: [completedTask, remaining],
      projects: [{ id: 'p1', name: 'Small Project' }],
    });
    proactive = createProactive(deps);
    const suggestions = proactive.getFollowUpSuggestions(completedTask);
    const almostDone = suggestions.find((s) => s.type === 'almost-done');
    expect(almostDone).toBeDefined();
    expect(almostDone.text).toContain('1 task');
    expect(almostDone.text).toContain('Small Project');
  });

  it('returns max 3 suggestions', () => {
    const completedTask = { id: 't1', title: 'Core task', status: 'done', project: 'p1' };
    const tasks = [completedTask];
    for (let i = 2; i < 10; i++) {
      tasks.push({
        id: `t${i}`,
        title: `Core task variant ${i}`,
        status: 'todo',
        project: 'p1',
        priority: 'normal',
        blockedBy: ['t1'],
      });
    }
    deps.getData.mockReturnValue({
      tasks,
      projects: [{ id: 'p1', name: 'Big Project' }],
    });
    deps.findTask.mockImplementation((id) => tasks.find((t) => t.id === id) || null);
    proactive = createProactive(deps);
    const suggestions = proactive.getFollowUpSuggestions(completedTask);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('does not suggest archived or done tasks as related', () => {
    const completedTask = { id: 't1', title: 'Write tests', status: 'done', project: 'p1' };
    const archivedTask = {
      id: 't2',
      title: 'Write more tests',
      status: 'todo',
      project: 'p1',
      archived: true,
      priority: 'normal',
    };
    const doneTask = { id: 't3', title: 'Write unit tests', status: 'done', project: 'p1', priority: 'normal' };
    deps.getData.mockReturnValue({
      tasks: [completedTask, archivedTask, doneTask],
      projects: [{ id: 'p1', name: 'Testing' }],
    });
    proactive = createProactive(deps);
    const suggestions = proactive.getFollowUpSuggestions(completedTask);
    const related = suggestions.filter((s) => s.type === 'related');
    expect(related.length).toBe(0);
  });
});
