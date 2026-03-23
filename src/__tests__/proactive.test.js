import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MS_PER_DAY } from '../constants.js';
import { createProactive } from '../proactive.js';

function makeDeps(overrides = {}) {
  return {
    $: vi.fn((sel) => document.querySelector(sel)),
    esc: vi.fn((s) => (s == null ? '' : String(s))),
    sanitizeAIHTML: vi.fn((s) => s),
    todayStr: vi.fn(() => '2026-03-15'),
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

describe('proactive.js — createProactive()', () => {
  let proactive;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
    proactive = createProactive(deps);
  });

  // ── Factory returns ─────────────────────────────────────────────────
  it('returns all expected functions', () => {
    const keys = [
      'matchProactivePattern',
      'saveProactiveLog',
      'getAIPreparedTaskIds',
      'filterAIPrepared',
      'maybeProactiveEnhance',
      'runProactiveWorker',
      'planMyDay',
      'snoozePlanTask',
      'replanDay',
      'generateAIBriefing',
      'submitEndOfDay',
      'getSmartNudges',
      'nudgeFilterOverdue',
      'nudgeFilterStale',
      'nudgeFilterUnassigned',
      'maybeReflect',
      'showReflectionToast',
      'getStuckTasks',
      'processRecurringTasks',
      'getAIStatusItems',
      'getSmartFeedItems',
    ];
    keys.forEach((k) => expect(typeof proactive[k]).toBe('function'));
  });

  // ── PROACTIVE_PATTERNS ────────────────────────────────────────────
  it('exports PROACTIVE_PATTERNS array', () => {
    expect(Array.isArray(proactive.PROACTIVE_PATTERNS)).toBe(true);
    expect(proactive.PROACTIVE_PATTERNS.length).toBeGreaterThan(0);
  });

  // ── matchProactivePattern ─────────────────────────────────────────
  it('matchProactivePattern detects email tasks', () => {
    const match = proactive.matchProactivePattern('Email the client about project');
    expect(match).not.toBeUndefined();
    expect(match.type).toBe('email');
  });

  it('matchProactivePattern detects research tasks', () => {
    const match = proactive.matchProactivePattern('Research flights to Tokyo');
    expect(match).not.toBeUndefined();
    expect(match.type).toBe('research');
  });

  it('matchProactivePattern detects call/schedule tasks', () => {
    const match = proactive.matchProactivePattern('Schedule a meeting with the team');
    expect(match).not.toBeUndefined();
    expect(match.type).toBe('call');
  });

  it('matchProactivePattern returns undefined for non-matching text', () => {
    const match = proactive.matchProactivePattern('buy groceries');
    expect(match).toBeUndefined();
  });

  it('matchProactivePattern handles null/undefined input', () => {
    expect(proactive.matchProactivePattern(null)).toBeUndefined();
    expect(proactive.matchProactivePattern(undefined)).toBeUndefined();
  });

  it('matchProactivePattern detects application tasks', () => {
    const match = proactive.matchProactivePattern('Apply for the new grant');
    expect(match).not.toBeUndefined();
    expect(match.type).toBe('application');
  });

  it('matchProactivePattern detects prepare/plan tasks', () => {
    const match = proactive.matchProactivePattern('Prepare the proposal for the board');
    expect(match).not.toBeUndefined();
    expect(match.type).toBe('prepare');
  });

  it('matchProactivePattern detects document/draft tasks', () => {
    const match = proactive.matchProactivePattern('Draft the quarterly report');
    expect(match).not.toBeUndefined();
    expect(match.type).toBe('document');
  });

  it('matchProactivePattern detects review tasks', () => {
    const match = proactive.matchProactivePattern('Review the pull request');
    expect(match).not.toBeUndefined();
    expect(match.type).toBe('review');
  });

  it('matchProactivePattern handles empty string', () => {
    expect(proactive.matchProactivePattern('')).toBeUndefined();
  });

  // ── getAIPreparedTaskIds ──────────────────────────────────────────
  it('getAIPreparedTaskIds returns empty set when no log', () => {
    const ids = proactive.getAIPreparedTaskIds();
    expect(ids.size).toBe(0);
  });

  it('getAIPreparedTaskIds returns set of task IDs from proactive log', () => {
    deps.getProactiveLog.mockReturnValue([
      { taskId: 't_1', taskTitle: 'Task 1', action: 'drafted email', timestamp: Date.now() },
      { taskId: 't_2', taskTitle: 'Task 2', action: 'added research', timestamp: Date.now() },
    ]);
    const ids = proactive.getAIPreparedTaskIds();
    expect(ids.has('t_1')).toBe(true);
    expect(ids.has('t_2')).toBe(true);
  });

  // ── saveProactiveLog ──────────────────────────────────────────────
  it('saveProactiveLog saves to localStorage', () => {
    deps.getProactiveLog.mockReturnValue([{ taskId: 't_1', action: 'test', timestamp: 123 }]);
    proactive.saveProactiveLog();
    const stored = localStorage.getItem('user1_wb_proactive_log_2026-03-15');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].taskId).toBe('t_1');
  });

  it('saveProactiveLog handles localStorage errors gracefully', () => {
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    deps.getProactiveLog.mockReturnValue([{ taskId: 't_1' }]);
    expect(() => proactive.saveProactiveLog()).not.toThrow();
    localStorage.setItem = origSetItem;
  });

  // ── filterAIPrepared ──────────────────────────────────────────────
  it('filterAIPrepared shows toast when no prepared tasks', () => {
    deps.getProactiveLog.mockReturnValue([]);
    proactive.filterAIPrepared();
    expect(deps.showToast).toHaveBeenCalledWith('No AI-prepared tasks today');
  });

  it('filterAIPrepared shows toast when prepared tasks are all done', () => {
    deps.getProactiveLog.mockReturnValue([{ taskId: 't_1' }]);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Done task', status: 'done' }],
      projects: [],
    });
    proactive.filterAIPrepared();
    expect(deps.showToast).toHaveBeenCalledWith('No active AI-prepared tasks');
  });

  it('filterAIPrepared renders modal with active prepared tasks', () => {
    deps.getProactiveLog.mockReturnValue([{ taskId: 't_1' }, { taskId: 't_2' }]);
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't_1', title: 'Active prepared task', status: 'todo' },
        { id: 't_2', title: 'Another active', status: 'in-progress' },
      ],
      projects: [],
    });
    proactive.filterAIPrepared();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('AI Prepared Tasks');
    expect(modal.innerHTML).toContain('Active prepared task');
    expect(modal.innerHTML).toContain('Another active');
  });

  it('filterAIPrepared excludes done tasks from modal count', () => {
    deps.getProactiveLog.mockReturnValue([{ taskId: 't_1' }, { taskId: 't_2' }]);
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't_1', title: 'Active', status: 'todo' },
        { id: 't_2', title: 'Done', status: 'done' },
      ],
      projects: [],
    });
    proactive.filterAIPrepared();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('AI Prepared Tasks (1)');
  });

  // ── submitEndOfDay ────────────────────────────────────────────────
  it('submitEndOfDay shows toast when input is empty', async () => {
    const input = document.createElement('input');
    input.id = 'eodInput';
    input.value = '';
    document.body.appendChild(input);
    await proactive.submitEndOfDay();
    expect(deps.showToast).toHaveBeenCalledWith('Write a few words about your day first');
    input.remove();
  });

  it('submitEndOfDay shows toast when no eodInput element exists', async () => {
    // No eodInput in DOM — should show toast
    await proactive.submitEndOfDay();
    expect(deps.showToast).toHaveBeenCalledWith('Write a few words about your day first');
  });

  it('submitEndOfDay calls AI and saves response on success', async () => {
    const input = document.createElement('input');
    input.id = 'eodInput';
    input.value = 'Had a productive day';
    document.body.appendChild(input);

    const btn = document.createElement('button');
    btn.id = 'eodBtn';
    document.body.appendChild(btn);

    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('Great job today. Try tackling the report tomorrow morning.');
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't_1', title: 'Task 1', status: 'done', completedAt: '2026-03-15T10:00:00Z' },
        { id: 't_2', title: 'Task 2', status: 'todo', dueDate: '2026-03-10' },
      ],
      projects: [],
    });

    await proactive.submitEndOfDay();

    expect(deps.callAI).toHaveBeenCalled();
    expect(deps.addAIMemory).toHaveBeenCalled();
    const stored = localStorage.getItem('user1_wb_eod_2026-03-15');
    expect(stored).toContain('Great job today');

    input.remove();
    btn.remove();
  });

  it('submitEndOfDay handles AI error gracefully', async () => {
    const input = document.createElement('input');
    input.id = 'eodInput';
    input.value = 'Tough day';
    document.body.appendChild(input);

    const btn = document.createElement('button');
    btn.id = 'eodBtn';
    document.body.appendChild(btn);

    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockRejectedValue(new Error('API down'));
    deps.getData.mockReturnValue({ tasks: [], projects: [] });

    await proactive.submitEndOfDay();

    expect(deps.showToast).toHaveBeenCalledWith('End of day reflection failed — try again', true);
    expect(btn.textContent).toBe('Error — try again');

    input.remove();
    btn.remove();
  });

  it('submitEndOfDay updates eodCard HTML on success', async () => {
    const input = document.createElement('input');
    input.id = 'eodInput';
    input.value = 'Good day';
    document.body.appendChild(input);

    const card = document.createElement('div');
    card.id = 'eodCard';
    document.body.appendChild(card);

    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('Nice work today.');
    deps.getData.mockReturnValue({ tasks: [], projects: [] });

    await proactive.submitEndOfDay();

    expect(card.innerHTML).toContain('End of Day');
    expect(card.innerHTML).toContain('Nice work today.');

    input.remove();
    card.remove();
  });

  // ── showReflectionToast ───────────────────────────────────────────
  it('showReflectionToast adds an element to the document body', () => {
    const before = document.body.children.length;
    proactive.showReflectionToast('Great insight');
    expect(document.body.children.length).toBeGreaterThan(before);
  });

  it('showReflectionToast uses esc() to sanitize text', () => {
    proactive.showReflectionToast('Test <script>alert(1)</script>');
    expect(deps.esc).toHaveBeenCalledWith('Test <script>alert(1)</script>');
  });

  it('showReflectionToast creates element with reflection content', () => {
    proactive.showReflectionToast('Styled toast');
    const el = document.body.lastElementChild;
    expect(el.tagName).toBe('DIV');
    expect(el.innerHTML).toContain('Styled toast');
  });

  // ── snoozePlanTask ────────────────────────────────────────────────
  it('snoozePlanTask removes task from plan and updates due date', () => {
    const plan = [
      { id: 't_1', why: 'test' },
      { id: 't_2', why: 'other' },
    ];
    localStorage.setItem('user1_whiteboard_plan_2026-03-15', JSON.stringify(plan));
    proactive.snoozePlanTask('t_1');
    const updated = JSON.parse(localStorage.getItem('user1_whiteboard_plan_2026-03-15'));
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('t_2');
    expect(deps.updateTask).toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith('Snoozed to tomorrow');
  });

  it('snoozePlanTask sets due date to tomorrow', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 15, 10, 0, 0) });
    const plan = [{ id: 't_1', why: 'test' }];
    localStorage.setItem('user1_whiteboard_plan_2026-03-15', JSON.stringify(plan));
    proactive.snoozePlanTask('t_1');
    const call = deps.updateTask.mock.calls[0];
    expect(call[0]).toBe('t_1');
    expect(call[1].dueDate).toBe('2026-03-16');
    vi.useRealTimers();
  });

  it('snoozePlanTask invalidates plan index cache', () => {
    const plan = [{ id: 't_1', why: 'test' }];
    localStorage.setItem('user1_whiteboard_plan_2026-03-15', JSON.stringify(plan));
    proactive.snoozePlanTask('t_1');
    expect(deps.setPlanIndexCache).toHaveBeenCalledWith(null, '');
  });

  it('snoozePlanTask calls render', () => {
    const plan = [{ id: 't_1', why: 'test' }];
    localStorage.setItem('user1_whiteboard_plan_2026-03-15', JSON.stringify(plan));
    proactive.snoozePlanTask('t_1');
    expect(deps.render).toHaveBeenCalled();
  });

  it('snoozePlanTask handles empty plan in localStorage', () => {
    localStorage.setItem('user1_whiteboard_plan_2026-03-15', '[]');
    expect(() => proactive.snoozePlanTask('t_1')).not.toThrow();
    expect(deps.updateTask).toHaveBeenCalled();
  });

  it('snoozePlanTask handles missing plan key gracefully', () => {
    // No plan in localStorage at all
    expect(() => proactive.snoozePlanTask('t_1')).not.toThrow();
    expect(deps.updateTask).toHaveBeenCalled();
  });

  // ── getSmartNudges ────────────────────────────────────────────────
  it('getSmartNudges returns empty array when no tasks', () => {
    const nudges = proactive.getSmartNudges();
    expect(Array.isArray(nudges)).toBe(true);
    expect(nudges.length).toBe(0);
  });

  it('getSmartNudges detects overload (>30 active tasks)', () => {
    const tasks = Array.from({ length: 35 }, (_, i) => ({
      id: `t_${i}`,
      title: `Task ${i}`,
      status: 'todo',
      priority: 'normal',
    }));
    deps.getData.mockReturnValue({ tasks, projects: [] });
    const nudges = proactive.getSmartNudges();
    const overload = nudges.find((n) => n.type === 'warning' && n.text.includes('35 active'));
    expect(overload).toBeDefined();
  });

  it('getSmartNudges detects no tasks in progress', () => {
    const tasks = [{ id: 't_1', title: 'Task 1', status: 'todo', priority: 'normal' }];
    deps.getData.mockReturnValue({ tasks, projects: [] });
    const nudges = proactive.getSmartNudges();
    const noProgress = nudges.find((n) => n.text.includes('Nothing in progress'));
    expect(noProgress).toBeDefined();
  });

  it('getSmartNudges limits to 4 nudges max', () => {
    const tasks = Array.from({ length: 40 }, (_, i) => ({
      id: `t_${i}`,
      title: `Task ${i} with very long title that needs subtasks definitely`,
      status: i < 8 ? 'in-progress' : 'todo',
      priority: 'normal',
      createdAt: new Date(Date.now() - 15 * MS_PER_DAY).toISOString(),
    }));
    deps.getData.mockReturnValue({ tasks, projects: [] });
    const nudges = proactive.getSmartNudges();
    expect(nudges.length).toBeLessThanOrEqual(4);
  });

  it('getSmartNudges detects too many in-progress tasks', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      id: `t_${i}`,
      title: `In-progress ${i}`,
      status: 'in-progress',
      priority: 'normal',
    }));
    deps.getData.mockReturnValue({ tasks, projects: [] });
    const nudges = proactive.getSmartNudges();
    const tooMany = nudges.find((n) => n.text.includes('tasks in progress at once'));
    expect(tooMany).toBeDefined();
  });

  it('getSmartNudges detects overdue pileup (3+ overdue)', () => {
    const tasks = [
      { id: 't_1', title: 'Overdue 1', status: 'todo', priority: 'normal', dueDate: '2026-03-01' },
      { id: 't_2', title: 'Overdue 2', status: 'todo', priority: 'normal', dueDate: '2026-03-05' },
      { id: 't_3', title: 'Overdue 3', status: 'todo', priority: 'normal', dueDate: '2026-03-10' },
      { id: 't_4', title: 'Current', status: 'in-progress', priority: 'normal' },
    ];
    deps.getData.mockReturnValue({ tasks, projects: [] });
    const nudges = proactive.getSmartNudges();
    const overdue = nudges.find((n) => n.type === 'urgent' && n.text.includes('overdue'));
    expect(overdue).toBeDefined();
  });

  it('getSmartNudges detects stale tasks (10+ days untouched)', () => {
    const oldDate = new Date(Date.now() - 15 * MS_PER_DAY).toISOString();
    const tasks = [
      { id: 't_1', title: 'Stale 1', status: 'todo', priority: 'normal', createdAt: oldDate },
      { id: 't_2', title: 'Stale 2', status: 'todo', priority: 'normal', createdAt: oldDate },
      { id: 't_3', title: 'Stale 3', status: 'todo', priority: 'normal', createdAt: oldDate },
      { id: 't_4', title: 'Current', status: 'in-progress', priority: 'normal' },
    ];
    deps.getData.mockReturnValue({ tasks, projects: [] });
    const nudges = proactive.getSmartNudges();
    const stale = nudges.find((n) => n.type === 'stale' && n.text.includes('untouched'));
    expect(stale).toBeDefined();
  });

  it('getSmartNudges detects weekly completions', () => {
    const recentDate = new Date().toISOString();
    const tasks = [
      { id: 't_1', title: 'Done', status: 'done', completedAt: recentDate },
      { id: 't_2', title: 'Active', status: 'in-progress', priority: 'normal' },
    ];
    deps.getData.mockReturnValue({ tasks, projects: [] });
    const nudges = proactive.getSmartNudges();
    const positive = nudges.find((n) => n.type === 'positive' && n.text.includes('completed this week'));
    expect(positive).toBeDefined();
  });

  it('getSmartNudges detects unassigned tasks (3+)', () => {
    const tasks = [
      { id: 't_1', title: 'Unassigned 1', status: 'todo', priority: 'normal' },
      { id: 't_2', title: 'Unassigned 2', status: 'todo', priority: 'normal' },
      { id: 't_3', title: 'Unassigned 3', status: 'todo', priority: 'normal' },
      { id: 't_4', title: 'Assigned', status: 'in-progress', priority: 'normal', project: 'p_1' },
    ];
    deps.getData.mockReturnValue({ tasks, projects: [] });
    const nudges = proactive.getSmartNudges();
    const unassigned = nudges.find((n) => n.text.includes('without a project'));
    expect(unassigned).toBeDefined();
  });

  it('getSmartNudges detects big tasks without subtasks', () => {
    const tasks = [
      {
        id: 't_1',
        title: 'This is a very complex task that definitely needs to be broken down into smaller pieces',
        status: 'todo',
        priority: 'normal',
      },
      {
        id: 't_2',
        title: 'Another complex task with a very long title to meet the threshold requirements',
        status: 'todo',
        priority: 'normal',
      },
      { id: 't_3', title: 'Active', status: 'in-progress', priority: 'normal' },
    ];
    deps.getData.mockReturnValue({ tasks, projects: [] });
    const nudges = proactive.getSmartNudges();
    const big = nudges.find((n) => n.text.includes('looks complex'));
    expect(big).toBeDefined();
  });

  // ── nudgeFilterOverdue ────────────────────────────────────────────
  it('nudgeFilterOverdue sets filter and renders', () => {
    proactive.nudgeFilterOverdue();
    expect(deps.setNudgeFilter).toHaveBeenCalledWith('overdue');
    expect(deps.setView).toHaveBeenCalledWith('dashboard');
    expect(deps.render).toHaveBeenCalled();
  });

  // ── nudgeFilterStale ──────────────────────────────────────────────
  it('nudgeFilterStale sets filter and renders', () => {
    proactive.nudgeFilterStale();
    expect(deps.setNudgeFilter).toHaveBeenCalledWith('stale');
    expect(deps.render).toHaveBeenCalled();
  });

  // ── nudgeFilterUnassigned ─────────────────────────────────────────
  it('nudgeFilterUnassigned sets filter and renders', () => {
    proactive.nudgeFilterUnassigned();
    expect(deps.setNudgeFilter).toHaveBeenCalledWith('unassigned');
    expect(deps.showToast).toHaveBeenCalledWith('Showing unassigned tasks');
  });

  // ── getStuckTasks ─────────────────────────────────────────────────
  it('getStuckTasks returns empty array when no in-progress tasks', () => {
    deps.getData.mockReturnValue({ tasks: [{ id: 't_1', status: 'todo' }], projects: [] });
    expect(proactive.getStuckTasks()).toEqual([]);
  });

  it('getStuckTasks detects tasks in progress for 3+ days', () => {
    const oldDate = new Date(Date.now() - 5 * MS_PER_DAY).toISOString();
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          status: 'in-progress',
          title: 'Stuck task',
          createdAt: oldDate,
          subtasks: [
            { id: 'st_1', title: 'Sub', done: true },
            { id: 'st_2', title: 'Sub2', done: false },
          ],
        },
      ],
      projects: [],
    });
    const stuck = proactive.getStuckTasks();
    expect(stuck.length).toBe(1);
    expect(stuck[0].id).toBe('t_1');
  });

  it('getStuckTasks skips tasks updated recently', () => {
    const recentDate = new Date().toISOString();
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          status: 'in-progress',
          title: 'Recent task',
          createdAt: recentDate,
        },
      ],
      projects: [],
    });
    expect(proactive.getStuckTasks()).toEqual([]);
  });

  it('getStuckTasks uses last update date when updates array exists', () => {
    const oldDate = new Date(Date.now() - 5 * MS_PER_DAY).toISOString();
    const recentUpdate = new Date().toISOString();
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          status: 'in-progress',
          title: 'Task with recent update',
          createdAt: oldDate,
          updates: [{ date: recentUpdate }],
        },
      ],
      projects: [],
    });
    expect(proactive.getStuckTasks()).toEqual([]);
  });

  it('getStuckTasks excludes tasks with no subtasks completed (not started)', () => {
    const oldDate = new Date(Date.now() - 5 * MS_PER_DAY).toISOString();
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          status: 'in-progress',
          title: 'Not started subtasks',
          createdAt: oldDate,
          subtasks: [
            { id: 'st_1', title: 'Sub', done: false },
            { id: 'st_2', title: 'Sub2', done: false },
          ],
        },
      ],
      projects: [],
    });
    // doneCount === 0 → returns false
    expect(proactive.getStuckTasks()).toEqual([]);
  });

  it('getStuckTasks excludes tasks with all subtasks done', () => {
    const oldDate = new Date(Date.now() - 5 * MS_PER_DAY).toISOString();
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          status: 'in-progress',
          title: 'All subtasks done',
          createdAt: oldDate,
          subtasks: [
            { id: 'st_1', title: 'Sub', done: true },
            { id: 'st_2', title: 'Sub2', done: true },
          ],
        },
      ],
      projects: [],
    });
    expect(proactive.getStuckTasks()).toEqual([]);
  });

  it('getStuckTasks includes tasks with no subtasks that are 3+ days old', () => {
    const oldDate = new Date(Date.now() - 5 * MS_PER_DAY).toISOString();
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          status: 'in-progress',
          title: 'No subtasks stuck',
          createdAt: oldDate,
        },
      ],
      projects: [],
    });
    const stuck = proactive.getStuckTasks();
    expect(stuck.length).toBe(1);
  });

  // ── processRecurringTasks ─────────────────────────────────────────
  it('processRecurringTasks does nothing when no recurring tasks', () => {
    deps.getData.mockReturnValue({ tasks: [{ id: 't_1', status: 'todo' }], projects: [] });
    proactive.processRecurringTasks();
    expect(deps.addTask).not.toHaveBeenCalled();
  });

  it('processRecurringTasks creates new task for daily recurrence', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 15, 12, 0, 0) });
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          title: 'Daily standup',
          status: 'done',
          recurrence: 'daily',
          completedAt: '2026-03-14T10:00:00Z',
          priority: 'normal',
          project: 'p_1',
        },
      ],
      projects: [],
    });
    proactive.processRecurringTasks();
    expect(deps.addTask).toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('processRecurringTasks creates new task for weekly recurrence', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 15, 12, 0, 0) });
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          title: 'Weekly review',
          status: 'done',
          recurrence: 'weekly',
          completedAt: '2026-03-07T10:00:00Z',
          priority: 'normal',
          project: 'p_1',
        },
      ],
      projects: [],
    });
    proactive.processRecurringTasks();
    expect(deps.addTask).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('processRecurringTasks creates new task for monthly recurrence', () => {
    const twoMonthsAgo = new Date(Date.now() - 60 * MS_PER_DAY).toISOString();
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          title: 'Monthly report',
          status: 'done',
          recurrence: 'monthly',
          completedAt: twoMonthsAgo,
          priority: 'normal',
          project: 'p_1',
        },
      ],
      projects: [],
    });
    proactive.processRecurringTasks();
    expect(deps.addTask).toHaveBeenCalled();
  });

  it('processRecurringTasks skips unknown recurrence types', () => {
    const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString();
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          title: 'Weird recurrence',
          status: 'done',
          recurrence: 'biweekly',
          completedAt: yesterday,
          priority: 'normal',
        },
      ],
      projects: [],
    });
    proactive.processRecurringTasks();
    expect(deps.addTask).not.toHaveBeenCalled();
  });

  it('processRecurringTasks does not duplicate if active instance exists', () => {
    const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString();
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          title: 'Daily standup',
          status: 'done',
          recurrence: 'daily',
          completedAt: yesterday,
          priority: 'normal',
          project: 'p_1',
        },
        { id: 't_2', title: 'Daily standup', status: 'todo', recurrence: 'daily', project: 'p_1' },
      ],
      projects: [],
    });
    proactive.processRecurringTasks();
    expect(deps.addTask).not.toHaveBeenCalled();
  });

  it('processRecurringTasks creates next instance immediately even if future', () => {
    const justNow = new Date().toISOString();
    deps.localISO.mockReturnValue('2026-03-16');
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          title: 'Daily standup',
          status: 'done',
          recurrence: 'daily',
          completedAt: justNow,
          priority: 'normal',
        },
      ],
      projects: [],
    });
    proactive.processRecurringTasks();
    expect(deps.addTask).toHaveBeenCalled();
  });

  it('processRecurringTasks resets subtasks to undone on new instance', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 15, 12, 0, 0) });
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          title: 'Daily checklist',
          status: 'done',
          recurrence: 'daily',
          completedAt: '2026-03-14T10:00:00Z',
          priority: 'normal',
          subtasks: [
            { id: 'st_1', title: 'Item 1', done: true },
            { id: 'st_2', title: 'Item 2', done: true },
          ],
        },
      ],
      projects: [],
    });
    proactive.processRecurringTasks();
    vi.useRealTimers();
    expect(deps.createTask).toHaveBeenCalled();
    const createCall = deps.createTask.mock.calls[0][0];
    expect(createCall.subtasks.every((s) => s.done === false)).toBe(true);
  });

  // ── maybeReflect ──────────────────────────────────────────────────
  it('maybeReflect does nothing when AI is off', () => {
    deps.hasAI.mockReturnValue(false);
    proactive.maybeReflect({ id: 't_1', title: 'Done task', status: 'done' });
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('maybeReflect calls AI for high-significance tasks', () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('Great progress!');
    deps.getData.mockReturnValue({ tasks: [], projects: [] });
    // High significance: urgent priority + many subtasks + old task
    const task = {
      id: 't_1',
      title: 'Major deliverable',
      status: 'done',
      priority: 'urgent',
      subtasks: [{ done: true }, { done: true }, { done: true }],
      notes: 'Detailed notes that are longer than fifty characters for sure yep definitely.',
      createdAt: new Date(Date.now() - 10 * MS_PER_DAY).toISOString(),
      project: 'p_1',
    };
    proactive.maybeReflect(task);
    expect(deps.callAI).toHaveBeenCalled();
  });

  // ── replanDay ─────────────────────────────────────────────────────
  it('replanDay removes existing plan and triggers re-plan', () => {
    localStorage.setItem('user1_whiteboard_plan_2026-03-15', '[{"id":"t_1"}]');
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', status: 'todo', title: 'A', priority: 'normal' }],
      projects: [],
    });
    deps.callAI.mockResolvedValue('[]');
    proactive.replanDay();
    expect(localStorage.getItem('user1_whiteboard_plan_2026-03-15')).toBeNull();
    expect(deps.setPlanIndexCache).toHaveBeenCalledWith(null, '');
    expect(deps.setPlanGenerating).toHaveBeenCalledWith(true);
    expect(deps.render).toHaveBeenCalled();
  });

  // ── generateAIBriefing ────────────────────────────────────────────
  it('generateAIBriefing does nothing when AI is off', async () => {
    deps.hasAI.mockReturnValue(false);
    await proactive.generateAIBriefing();
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('generateAIBriefing calls AI and stores briefing', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('**Right Now**\nFocus on overdue tasks.');
    deps.getData.mockReturnValue({ tasks: [], projects: [] });
    await proactive.generateAIBriefing();
    expect(deps.callAI).toHaveBeenCalled();
    const stored = localStorage.getItem('user1_whiteboard_briefing_2026-03-15');
    expect(stored).toContain('Right Now');
  });

  it('generateAIBriefing handles AI error', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockRejectedValue(new Error('timeout'));

    const btn = document.createElement('button');
    btn.id = 'briefingBtn';
    document.body.appendChild(btn);

    await proactive.generateAIBriefing();
    expect(deps.showToast).toHaveBeenCalledWith('Briefing failed — try again', true);
    expect(btn.textContent).toBe('Error — try again');

    btn.remove();
  });

  // ── planMyDay ─────────────────────────────────────────────────────
  it('planMyDay does nothing when AI is off', async () => {
    deps.hasAI.mockReturnValue(false);
    await proactive.planMyDay();
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('planMyDay shows toast when no active tasks', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({ tasks: [{ id: 't_1', status: 'done' }], projects: [] });
    await proactive.planMyDay();
    expect(deps.showToast).toHaveBeenCalledWith('No active tasks to plan — add some tasks first');
  });

  it('planMyDay calls AI with task context and saves valid plan', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't_1', title: 'Task A', status: 'todo', priority: 'urgent', dueDate: '2026-03-15' },
        { id: 't_2', title: 'Task B', status: 'in-progress', priority: 'normal' },
      ],
      projects: [{ id: 'p_1', name: 'Project X' }],
    });
    deps.findTask.mockImplementation((id) => ({ id }));
    deps.callAI.mockResolvedValue(
      JSON.stringify([
        { id: 't_1', why: 'Urgent and due today' },
        { id: 't_2', why: 'Keep momentum going' },
      ]),
    );

    await proactive.planMyDay();

    expect(deps.callAI).toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalled();
    expect(deps.notifyOverdueTasks).toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem('user1_whiteboard_plan_2026-03-15'));
    expect(stored).toHaveLength(2);
  });

  it('planMyDay handles AI error gracefully', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Task', status: 'todo', priority: 'normal' }],
      projects: [],
    });
    deps.callAI.mockRejectedValue(new Error('API error'));

    await proactive.planMyDay();
    // Should not throw
  });

  it('planMyDay filters out invalid task IDs from AI response', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Task A', status: 'todo', priority: 'normal' }],
      projects: [],
    });
    deps.findTask.mockImplementation((id) => (id === 't_1' ? { id: 't_1' } : null));
    deps.callAI.mockResolvedValue(
      JSON.stringify([
        { id: 't_1', why: 'Valid' },
        { id: 't_999', why: 'Nonexistent' },
      ]),
    );

    await proactive.planMyDay();

    const stored = JSON.parse(localStorage.getItem('user1_whiteboard_plan_2026-03-15'));
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('t_1');
  });

  // ── runProactiveWorker ────────────────────────────────────────────
  it('runProactiveWorker does nothing when AI is off', async () => {
    deps.hasAI.mockReturnValue(false);
    await proactive.runProactiveWorker();
    expect(deps.setProactiveRunning).not.toHaveBeenCalled();
  });

  it('runProactiveWorker does nothing if already ran today', async () => {
    deps.hasAI.mockReturnValue(true);
    localStorage.setItem('user1_whiteboard_proactive_2026-03-15', '1');
    await proactive.runProactiveWorker();
    expect(deps.setProactiveRunning).not.toHaveBeenCalled();
  });

  it('runProactiveWorker does nothing if already running', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getProactiveRunning.mockReturnValue(true);
    await proactive.runProactiveWorker();
    expect(deps.setProactiveRunning).not.toHaveBeenCalled();
  });

  it('runProactiveWorker stops early when no candidate tasks', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'buy milk', status: 'todo' }], // no pattern match
      projects: [],
    });
    await proactive.runProactiveWorker();
    expect(deps.setProactiveRunning).toHaveBeenCalledWith(true);
    expect(deps.callAI).not.toHaveBeenCalled();
    // Should set running back to false
    expect(deps.setProactiveRunning).toHaveBeenCalledWith(false);
  });

  it('runProactiveWorker processes matching tasks and updates them', async () => {
    deps.hasAI.mockReturnValue(true);
    const task = { id: 't_1', title: 'Email the client', status: 'todo', notes: '' };
    deps.getData.mockReturnValue({ tasks: [task], projects: [] });
    deps.findTask.mockReturnValue(task);
    deps.callAI.mockResolvedValue(JSON.stringify([{ id: 't_1', notes: 'Draft: Dear Client, ...' }]));

    await proactive.runProactiveWorker();

    expect(deps.callAI).toHaveBeenCalled();
    expect(deps.updateTask).toHaveBeenCalled();
    expect(deps.setProactiveLog).toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalled();
  });

  it('runProactiveWorker handles AI error gracefully', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Email the boss', status: 'todo' }],
      projects: [],
    });
    deps.callAI.mockRejectedValue(new Error('API down'));

    await proactive.runProactiveWorker();
    // Should not throw, should set running to false
    expect(deps.setProactiveRunning).toHaveBeenCalledWith(false);
  });

  // ── maybeProactiveEnhance ─────────────────────────────────────────
  it('maybeProactiveEnhance does nothing when AI is off', () => {
    deps.hasAI.mockReturnValue(false);
    proactive.maybeProactiveEnhance({ id: 't_1', title: 'Email client' });
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('maybeProactiveEnhance does nothing for non-matching task', () => {
    deps.hasAI.mockReturnValue(true);
    proactive.maybeProactiveEnhance({ id: 't_1', title: 'buy groceries' });
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('maybeProactiveEnhance does nothing for null task', () => {
    deps.hasAI.mockReturnValue(true);
    proactive.maybeProactiveEnhance(null);
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  // ── getSmartFeedItems ─────────────────────────────────────────────
  it('getSmartFeedItems returns empty array when no active tasks', () => {
    const items = proactive.getSmartFeedItems();
    expect(items).toEqual([]);
  });

  it('getSmartFeedItems prioritizes overdue tasks', () => {
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't_1', title: 'Overdue', status: 'todo', dueDate: '2026-03-10', priority: 'normal' },
        { id: 't_2', title: 'Future', status: 'todo', dueDate: '2026-04-01', priority: 'normal' },
      ],
      projects: [],
    });
    const items = proactive.getSmartFeedItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].task.id).toBe('t_1');
    expect(items[0].source).toBe('overdue');
  });

  it('getSmartFeedItems includes urgent tasks', () => {
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Urgent item', status: 'todo', priority: 'urgent' }],
      projects: [],
    });
    const items = proactive.getSmartFeedItems();
    expect(items.some((i) => i.source === 'urgent')).toBe(true);
  });

  it('getSmartFeedItems includes in-progress tasks', () => {
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Working on it', status: 'in-progress', priority: 'normal' }],
      projects: [],
    });
    const items = proactive.getSmartFeedItems();
    expect(items.some((i) => i.source === 'in-progress')).toBe(true);
  });

  it('getSmartFeedItems includes due-soon tasks', () => {
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Due soon', status: 'todo', dueDate: '2026-03-18', priority: 'normal' }],
      projects: [],
    });
    const items = proactive.getSmartFeedItems();
    expect(items.some((i) => i.source === 'due-soon')).toBe(true);
  });

  it('getSmartFeedItems excludes done tasks', () => {
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Done task', status: 'done', priority: 'urgent' }],
      projects: [],
    });
    const items = proactive.getSmartFeedItems();
    expect(items).toEqual([]);
  });

  it('getSmartFeedItems excludes archived tasks', () => {
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Archived', status: 'todo', priority: 'urgent', archived: true }],
      projects: [],
    });
    const items = proactive.getSmartFeedItems();
    expect(items).toEqual([]);
  });

  it('getSmartFeedItems excludes plan tasks when plan exists', () => {
    localStorage.setItem('user1_whiteboard_plan_2026-03-15', JSON.stringify([{ id: 't_1' }]));
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't_1', title: 'In plan', status: 'todo', priority: 'urgent' },
        { id: 't_2', title: 'Not in plan', status: 'todo', priority: 'urgent' },
      ],
      projects: [],
    });
    const items = proactive.getSmartFeedItems();
    expect(items.every((i) => i.task.id !== 't_1')).toBe(true);
    expect(items.some((i) => i.task.id === 't_2')).toBe(true);
  });

  it('getSmartFeedItems does not duplicate tasks across categories', () => {
    deps.getData.mockReturnValue({
      tasks: [
        {
          id: 't_1',
          title: 'Overdue urgent in-progress',
          status: 'in-progress',
          dueDate: '2026-03-10',
          priority: 'urgent',
        },
      ],
      projects: [],
    });
    const items = proactive.getSmartFeedItems();
    const ids = items.map((i) => i.task.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ── getAIStatusItems ──────────────────────────────────────────────
  it('getAIStatusItems returns empty array when nothing happened today', () => {
    const items = proactive.getAIStatusItems();
    expect(Array.isArray(items)).toBe(true);
  });

  it('getAIStatusItems includes briefing item when briefing exists', () => {
    localStorage.setItem('user1_whiteboard_briefing_2026-03-15', 'some briefing');
    const items = proactive.getAIStatusItems();
    const briefing = items.find((i) => i.text.includes('briefing'));
    expect(briefing).toBeDefined();
  });

  it('getAIStatusItems includes plan item when plan exists', () => {
    localStorage.setItem('user1_whiteboard_plan_2026-03-15', '[{"id":"t_1"}]');
    const items = proactive.getAIStatusItems();
    const plan = items.find((i) => i.text.includes('plan'));
    expect(plan).toBeDefined();
  });

  it('getAIStatusItems includes completed-today count', () => {
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't_1', title: 'Done', status: 'done', completedAt: '2026-03-15T10:00:00Z' },
        { id: 't_2', title: 'Done 2', status: 'done', completedAt: '2026-03-15T14:00:00Z' },
      ],
      projects: [],
    });
    const items = proactive.getAIStatusItems();
    const completed = items.find((i) => i.text.includes('completed today'));
    expect(completed).toBeDefined();
    expect(completed.text).toContain('2 tasks');
  });

  it('getAIStatusItems includes AI-drafted tasks', () => {
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Drafted', notes: '**AI Draft:**\nSome draft', createdAt: '2026-03-15T08:00:00Z' }],
      projects: [],
    });
    const items = proactive.getAIStatusItems();
    const drafted = items.find((i) => i.text.includes('Prepared'));
    expect(drafted).toBeDefined();
  });
});
