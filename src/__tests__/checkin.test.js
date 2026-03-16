import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MS_PER_DAY } from '../constants.js';
import { createProactive, VAGUE_WORDS } from '../proactive.js';

function makeDeps(overrides = {}) {
  return {
    $: vi.fn((sel) => document.querySelector(sel)),
    esc: vi.fn((s) => (s == null ? '' : String(s))),
    sanitizeAIHTML: vi.fn((s) => s),
    todayStr: vi.fn(() => '2026-03-16'),
    localISO: vi.fn((d) => d.toISOString().slice(0, 10)),
    genId: vi.fn((prefix) => `${prefix}_gen`),
    getData: vi.fn(() => ({ tasks: [], projects: [] })),
    userKey: vi.fn((k) => `user1_${k}`),
    hasAI: vi.fn(() => false),
    callAI: vi.fn(async () => ''),
    buildAIContext: vi.fn(() => ''),
    addAIMemory: vi.fn(),
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

describe('Mid-Day Check-In', () => {
  let proactive;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
    proactive = createProactive(deps);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns new check-in functions', () => {
    expect(typeof proactive.maybeShowCheckIn).toBe('function');
    expect(typeof proactive.dismissCheckIn).toBe('function');
  });

  it('returns empty string outside 2pm-4pm window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 16, 10, 0, 0));
    const result = proactive.maybeShowCheckIn();
    expect(result).toBe('');
  });

  it('returns empty string if already dismissed today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 16, 14, 30, 0));
    localStorage.setItem('user1_wb_checkin_2026-03-16', '1');
    const result = proactive.maybeShowCheckIn();
    expect(result).toBe('');
  });

  it('returns empty string if no day plan exists', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 16, 14, 30, 0));
    const result = proactive.maybeShowCheckIn();
    expect(result).toBe('');
  });

  it('returns check-in HTML with progress when plan exists at 2pm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 16, 14, 30, 0));

    const tasks = [
      { id: 't1', title: 'Task 1', status: 'done' },
      { id: 't2', title: 'Task 2', status: 'todo' },
      { id: 't3', title: 'Task 3', status: 'in-progress' },
    ];
    const plan = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
    localStorage.setItem('user1_whiteboard_plan_2026-03-16', JSON.stringify(plan));

    deps.findTask = vi.fn((id) => tasks.find((t) => t.id === id));
    proactive = createProactive(deps);

    const result = proactive.maybeShowCheckIn();
    expect(result).toContain('checkin-card');
    expect(result).toContain('Mid-Day Check-In');
    expect(result).toContain('33%'); // 1 of 3 done
    expect(result).toContain('1/3 done');
    expect(result).toContain('Task 2');
    expect(result).toContain('Task 3');
    expect(result).toContain('checkin-do-now');
    expect(result).toContain('checkin-push-tomorrow');
    expect(result).toContain('checkin-drop');
  });

  it('returns empty string after 4pm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 16, 16, 0, 0));
    localStorage.setItem('user1_whiteboard_plan_2026-03-16', JSON.stringify([{ id: 't1' }]));
    deps.findTask = vi.fn(() => ({ id: 't1', title: 'Task 1', status: 'todo' }));
    proactive = createProactive(deps);
    const result = proactive.maybeShowCheckIn();
    expect(result).toBe('');
  });

  it('dismissCheckIn sets localStorage flag', () => {
    proactive.dismissCheckIn();
    expect(localStorage.getItem('user1_wb_checkin_2026-03-16')).toBe('1');
  });
});

describe('Vague Task Detection', () => {
  let proactive;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
  });

  it('VAGUE_WORDS is exported and contains expected words', () => {
    expect(Array.isArray(VAGUE_WORDS)).toBe(true);
    expect(VAGUE_WORDS).toContain('organize');
    expect(VAGUE_WORDS).toContain('figure out');
    expect(VAGUE_WORDS).toContain('work on');
  });

  it('returns new breakdown functions', () => {
    proactive = createProactive(deps);
    expect(typeof proactive.detectVagueTasks).toBe('function');
    expect(typeof proactive.breakdownTask).toBe('function');
    expect(typeof proactive.dismissVagueTask).toBe('function');
  });

  it('detects task with vague word untouched for 2+ days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * MS_PER_DAY).toISOString();
    deps.getData = vi.fn(() => ({
      tasks: [{ id: 't1', title: 'Figure out the deployment pipeline', status: 'todo', createdAt: threeDaysAgo }],
      projects: [],
    }));
    proactive = createProactive(deps);
    const result = proactive.detectVagueTasks();
    expect(result).not.toBeNull();
    expect(result.id).toBe('t1');
  });

  it('detects task with long title (>40 chars) untouched for 2+ days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * MS_PER_DAY).toISOString();
    deps.getData = vi.fn(() => ({
      tasks: [
        {
          id: 't2',
          title: 'This is a really long task title that exceeds forty characters easily',
          status: 'todo',
          createdAt: threeDaysAgo,
        },
      ],
      projects: [],
    }));
    proactive = createProactive(deps);
    const result = proactive.detectVagueTasks();
    expect(result).not.toBeNull();
    expect(result.id).toBe('t2');
  });

  it('ignores tasks with subtasks', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * MS_PER_DAY).toISOString();
    deps.getData = vi.fn(() => ({
      tasks: [
        {
          id: 't1',
          title: 'Work on something vague',
          status: 'todo',
          createdAt: threeDaysAgo,
          subtasks: [{ id: 'st1', title: 'sub', done: false }],
        },
      ],
      projects: [],
    }));
    proactive = createProactive(deps);
    const result = proactive.detectVagueTasks();
    expect(result).toBeNull();
  });

  it('ignores done tasks', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * MS_PER_DAY).toISOString();
    deps.getData = vi.fn(() => ({
      tasks: [{ id: 't1', title: 'Work on something', status: 'done', createdAt: threeDaysAgo }],
      projects: [],
    }));
    proactive = createProactive(deps);
    const result = proactive.detectVagueTasks();
    expect(result).toBeNull();
  });

  it('ignores recently touched tasks (< 2 days)', () => {
    const recentlyTouched = new Date(Date.now() - 1 * MS_PER_DAY).toISOString();
    deps.getData = vi.fn(() => ({
      tasks: [{ id: 't1', title: 'Organize the entire codebase', status: 'todo', createdAt: recentlyTouched }],
      projects: [],
    }));
    proactive = createProactive(deps);
    const result = proactive.detectVagueTasks();
    expect(result).toBeNull();
  });

  it('ignores dismissed tasks', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * MS_PER_DAY).toISOString();
    deps.getData = vi.fn(() => ({
      tasks: [{ id: 't1', title: 'Deal with the backlog', status: 'todo', createdAt: threeDaysAgo }],
      projects: [],
    }));
    localStorage.setItem('user1_wb_vague_dismissed', JSON.stringify(['t1']));
    proactive = createProactive(deps);
    const result = proactive.detectVagueTasks();
    expect(result).toBeNull();
  });

  it('dismissVagueTask adds task to dismissed list', () => {
    proactive = createProactive(deps);
    proactive.dismissVagueTask('t1');
    const dismissed = JSON.parse(localStorage.getItem('user1_wb_vague_dismissed'));
    expect(dismissed).toContain('t1');
  });
});

describe('breakdownTask', () => {
  let proactive;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
  });

  it('shows toast when AI is not available', async () => {
    deps.hasAI = vi.fn(() => false);
    proactive = createProactive(deps);
    await proactive.breakdownTask('t1');
    expect(deps.showToast).toHaveBeenCalledWith('AI not available');
  });

  it('does nothing if task not found', async () => {
    deps.hasAI = vi.fn(() => true);
    deps.findTask = vi.fn(() => null);
    proactive = createProactive(deps);
    await proactive.breakdownTask('t_missing');
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('calls AI and adds subtasks on success', async () => {
    deps.hasAI = vi.fn(() => true);
    deps.findTask = vi.fn(() => ({ id: 't1', title: 'A big vague task', subtasks: [] }));
    deps.callAI = vi.fn(async () => '["Step 1", "Step 2", "Step 3"]');
    proactive = createProactive(deps);
    await proactive.breakdownTask('t1');
    expect(deps.callAI).toHaveBeenCalled();
    expect(deps.updateTask).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        subtasks: expect.arrayContaining([
          expect.objectContaining({ title: 'Step 1', done: false }),
          expect.objectContaining({ title: 'Step 2', done: false }),
          expect.objectContaining({ title: 'Step 3', done: false }),
        ]),
      }),
    );
    expect(deps.showToast).toHaveBeenCalledWith('Added 3 subtasks');
    expect(deps.render).toHaveBeenCalled();
  });

  it('shows error toast on AI failure', async () => {
    deps.hasAI = vi.fn(() => true);
    deps.findTask = vi.fn(() => ({ id: 't1', title: 'A task' }));
    deps.callAI = vi.fn(async () => {
      throw new Error('AI down');
    });
    proactive = createProactive(deps);
    await proactive.breakdownTask('t1');
    expect(deps.showToast).toHaveBeenCalledWith('Breakdown failed \u2014 try again', true);
  });
});
