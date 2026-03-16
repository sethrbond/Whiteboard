import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MS_PER_DAY } from '../constants.js';
import { createProactivePlanning } from '../proactive-planning.js';

function makeDeps(overrides = {}) {
  return {
    $: vi.fn((sel) => document.querySelector(sel)),
    esc: vi.fn((s) => (s == null ? '' : String(s))),
    todayStr: vi.fn(() => '2026-03-15'),
    getData: vi.fn(() => ({ tasks: [], projects: [] })),
    userKey: vi.fn((k) => `user1_${k}`),
    hasAI: vi.fn(() => false),
    callAI: vi.fn(async () => ''),
    buildAIContext: vi.fn(() => ''),
    findTask: vi.fn(() => null),
    updateTask: vi.fn(),
    isBlocked: vi.fn(() => false),
    showToast: vi.fn(),
    render: vi.fn(),
    notifyOverdueTasks: vi.fn(),
    setBriefingGenerating: vi.fn(),
    setPlanGenerating: vi.fn(),
    setPlanIndexCache: vi.fn(),
    extractMemoryInsights: vi.fn(() => ({})),
    _buildInsightsPromptSection: vi.fn(() => ''),
    getAIMemory: vi.fn(() => []),
    ...overrides,
  };
}

describe('proactive-planning.js — createProactivePlanning()', () => {
  let planning;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="modalRoot"></div>';
    deps = makeDeps();
    planning = createProactivePlanning(deps);
  });

  // ── Factory returns ─────────────────────────────────────────────────
  it('returns all expected functions', () => {
    const keys = [
      'planMyDay',
      'snoozePlanTask',
      'replanDay',
      'analyzeWorkload',
      'suggestReschedule',
      'showRescheduleModal',
      'acceptReschedule',
      'skipReschedule',
      'acceptAllReschedules',
      'autoRebalanceWeek',
      'isWeekOverloaded',
    ];
    keys.forEach((k) => expect(typeof planning[k]).toBe('function'));
  });

  // ── planMyDay ───────────────────────────────────────────────────────
  it('planMyDay does nothing when AI unavailable', async () => {
    await planning.planMyDay();
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('planMyDay shows toast when no active tasks', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({ tasks: [{ id: 't1', status: 'done' }], projects: [] });

    await planning.planMyDay();

    expect(deps.showToast).toHaveBeenCalledWith('No active tasks to plan — add some tasks first');
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('planMyDay calls AI, stores plan, and renders', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't1', title: 'Task 1', status: 'todo', priority: 'normal' },
        { id: 't2', title: 'Task 2', status: 'in-progress', priority: 'urgent' },
      ],
      projects: [],
    });
    deps.findTask.mockImplementation((id) => {
      if (id === 't1') return { id: 't1' };
      if (id === 't2') return { id: 't2' };
      return null;
    });
    deps.callAI.mockResolvedValue('[{"id":"t2","why":"Urgent first"},{"id":"t1","why":"Then this"}]');

    await planning.planMyDay();

    expect(deps.callAI).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorage.getItem('user1_whiteboard_plan_2026-03-15'));
    expect(stored).toHaveLength(2);
    expect(deps.setPlanIndexCache).toHaveBeenCalledWith(null, '');
    expect(deps.render).toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith('Day planned: 2 tasks');
    expect(deps.notifyOverdueTasks).toHaveBeenCalled();
  });

  it('planMyDay filters out invalid task IDs from AI response', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't1', title: 'Task 1', status: 'todo', priority: 'normal' }],
      projects: [],
    });
    deps.findTask.mockImplementation((id) => (id === 't1' ? { id: 't1' } : null));
    deps.callAI.mockResolvedValue('[{"id":"t1","why":"exists"},{"id":"t_bad","why":"does not exist"}]');

    await planning.planMyDay();

    const stored = JSON.parse(localStorage.getItem('user1_whiteboard_plan_2026-03-15'));
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('t1');
  });

  it('planMyDay handles AI error gracefully', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't1', title: 'Task', status: 'todo', priority: 'normal' }],
      projects: [],
    });
    deps.callAI.mockRejectedValue(new Error('fail'));

    const btn = document.createElement('button');
    btn.id = 'planBtn';
    btn.innerHTML = '<span class="spinner"></span>Planning...';
    document.body.append(btn);

    await planning.planMyDay();

    expect(deps.showToast).toHaveBeenCalledWith('Planning failed — try again', true);
    expect(btn.textContent).toContain('Plan My Day');
  });

  it('planMyDay handles markdown-wrapped JSON from AI', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't1', title: 'Task 1', status: 'todo', priority: 'normal' }],
      projects: [],
    });
    deps.findTask.mockImplementation((id) => (id === 't1' ? { id: 't1' } : null));
    deps.callAI.mockResolvedValue('```json\n[{"id":"t1","why":"reason"}]\n```');

    await planning.planMyDay();

    const stored = JSON.parse(localStorage.getItem('user1_whiteboard_plan_2026-03-15'));
    expect(stored).toHaveLength(1);
  });

  it('planMyDay includes time estimates in prompt', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't1', title: 'Task 1', status: 'todo', priority: 'normal', estimatedMinutes: 60 },
        { id: 't2', title: 'Task 2', status: 'todo', priority: 'normal', estimatedMinutes: 120 },
      ],
      projects: [],
    });
    deps.callAI.mockResolvedValue('[]');

    await planning.planMyDay();

    const prompt = deps.callAI.mock.calls[0][0];
    expect(prompt).toContain('TIME ESTIMATES');
    expect(prompt).toContain('3');
  });

  // ── snoozePlanTask ──────────────────────────────────────────────────
  it('snoozePlanTask removes task from plan and reschedules to tomorrow', () => {
    const plan = [
      { id: 't1', why: 'test' },
      { id: 't2', why: 'other' },
    ];
    localStorage.setItem('user1_whiteboard_plan_2026-03-15', JSON.stringify(plan));

    planning.snoozePlanTask('t1');

    const updated = JSON.parse(localStorage.getItem('user1_whiteboard_plan_2026-03-15'));
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('t2');
    expect(deps.updateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ dueDate: expect.any(String) }));
    expect(deps.showToast).toHaveBeenCalledWith('Snoozed to tomorrow');
    expect(deps.render).toHaveBeenCalled();
  });

  it('snoozePlanTask handles missing plan gracefully', () => {
    expect(() => planning.snoozePlanTask('t1')).not.toThrow();
  });

  // ── replanDay ───────────────────────────────────────────────────────
  it('replanDay clears existing plan and triggers planMyDay', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't1', title: 'Task', status: 'todo', priority: 'normal' }],
      projects: [],
    });
    deps.callAI.mockResolvedValue('[]');

    localStorage.setItem('user1_whiteboard_plan_2026-03-15', '[{"id":"old"}]');

    planning.replanDay();
    await vi.waitFor(() => expect(deps.callAI).toHaveBeenCalled());

    expect(localStorage.getItem('user1_whiteboard_plan_2026-03-15')).toBeNull();
    expect(deps.setPlanGenerating).toHaveBeenCalledWith(true);
  });

  // ── analyzeWorkload ─────────────────────────────────────────────────
  it('analyzeWorkload returns structure with expected keys', () => {
    const result = planning.analyzeWorkload();
    expect(result).toHaveProperty('dailyTasks');
    expect(result).toHaveProperty('overloadedDays');
    expect(result).toHaveProperty('emptyDays');
    expect(result).toHaveProperty('avgCapacity');
  });

  it('analyzeWorkload detects overloaded days (>5 tasks)', () => {
    const d = new Date();
    const today =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const tasks = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      status: 'todo',
      dueDate: today,
    }));
    deps.getData.mockReturnValue({ tasks, projects: [] });

    const result = planning.analyzeWorkload();
    expect(result.overloadedDays.length).toBeGreaterThan(0);
  });

  it('analyzeWorkload calculates avg capacity from completions', () => {
    const recentDate = new Date(Date.now() - 2 * MS_PER_DAY).toISOString();
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't1', status: 'done', completedAt: recentDate },
        { id: 't2', status: 'done', completedAt: recentDate },
      ],
      projects: [],
    });

    const result = planning.analyzeWorkload();
    expect(result.avgCapacity).toBeGreaterThan(0);
  });

  // ── suggestReschedule ───────────────────────────────────────────────
  it('suggestReschedule returns empty when no overdue tasks', async () => {
    deps.getData.mockReturnValue({
      tasks: [{ id: 't1', status: 'todo', dueDate: '2026-12-31' }],
      projects: [],
    });

    const result = await planning.suggestReschedule();
    expect(result).toEqual([]);
  });

  it('suggestReschedule uses fallback algorithm when AI unavailable', async () => {
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't1', title: 'Overdue 1', status: 'todo', priority: 'urgent', dueDate: '2026-03-10' },
        { id: 't2', title: 'Overdue 2', status: 'todo', priority: 'low', dueDate: '2026-03-12' },
      ],
      projects: [],
    });

    const result = await planning.suggestReschedule();
    expect(result.length).toBe(2);
    expect(result[0].taskId).toBe('t1');
    expect(result[0].suggestedDueDate).toBeDefined();
    expect(result[0].reason).toBeDefined();
  });

  it('suggestReschedule uses AI when available', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.getData.mockReturnValue({
      tasks: [{ id: 't1', title: 'Overdue task', status: 'todo', priority: 'urgent', dueDate: '2026-03-10' }],
      projects: [],
    });
    deps.findTask.mockImplementation((id) =>
      id === 't1' ? { id: 't1', title: 'Overdue task', dueDate: '2026-03-10' } : null,
    );
    deps.callAI.mockResolvedValue('[{"id":"t1","suggestedDate":"2026-03-17","reason":"Move to Monday"}]');

    const result = await planning.suggestReschedule();
    expect(result).toHaveLength(1);
    expect(result[0].suggestedDueDate).toBe('2026-03-17');
    expect(result[0].reason).toBe('Move to Monday');
  });

  it('suggestReschedule falls back to simple algorithm on AI error', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockRejectedValue(new Error('fail'));
    deps.getData.mockReturnValue({
      tasks: [{ id: 't1', title: 'Overdue', status: 'todo', priority: 'normal', dueDate: '2026-03-10' }],
      projects: [],
    });

    const result = await planning.suggestReschedule();
    expect(result.length).toBe(1);
    expect(result[0].reason).toBeDefined();
  });

  // ── showRescheduleModal ─────────────────────────────────────────────
  it('showRescheduleModal shows toast when no suggestions', () => {
    planning.showRescheduleModal([]);
    expect(deps.showToast).toHaveBeenCalledWith('No tasks to reschedule');
  });

  it('showRescheduleModal renders modal with suggestions', () => {
    const suggestions = [
      {
        taskId: 't1',
        taskTitle: 'Task 1',
        currentDueDate: '2026-03-10',
        suggestedDueDate: '2026-03-17',
        reason: 'Balance',
      },
    ];

    planning.showRescheduleModal(suggestions);

    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('Rebalance Your Week');
    expect(modal.innerHTML).toContain('Task 1');
    expect(modal.innerHTML).toContain('2026-03-17');
  });

  // ── acceptReschedule ────────────────────────────────────────────────
  it('acceptReschedule updates task due date', () => {
    const suggestions = [
      {
        taskId: 't1',
        taskTitle: 'Task 1',
        currentDueDate: '2026-03-10',
        suggestedDueDate: '2026-03-17',
        reason: 'test',
      },
    ];
    planning.showRescheduleModal(suggestions);

    planning.acceptReschedule(0);

    expect(deps.updateTask).toHaveBeenCalledWith('t1', { dueDate: '2026-03-17' });
  });

  it('acceptReschedule does nothing with invalid index', () => {
    const suggestions = [
      {
        taskId: 't1',
        taskTitle: 'Task 1',
        currentDueDate: '2026-03-10',
        suggestedDueDate: '2026-03-17',
        reason: 'test',
      },
    ];
    planning.showRescheduleModal(suggestions);

    planning.acceptReschedule(99);
    expect(deps.updateTask).not.toHaveBeenCalled();
  });

  // ── skipReschedule ──────────────────────────────────────────────────
  it('skipReschedule removes the row and nullifies suggestion', () => {
    const suggestions = [
      {
        taskId: 't1',
        taskTitle: 'Task 1',
        currentDueDate: '2026-03-10',
        suggestedDueDate: '2026-03-17',
        reason: 'test',
      },
    ];
    planning.showRescheduleModal(suggestions);

    planning.skipReschedule(0);

    const modal = document.querySelector('.reschedule-modal');
    expect(modal._suggestions[0]).toBeNull();
  });

  // ── acceptAllReschedules ────────────────────────────────────────────
  it('acceptAllReschedules updates all tasks and clears modal', () => {
    const suggestions = [
      { taskId: 't1', taskTitle: 'Task 1', currentDueDate: '2026-03-10', suggestedDueDate: '2026-03-17', reason: 'a' },
      { taskId: 't2', taskTitle: 'Task 2', currentDueDate: '2026-03-11', suggestedDueDate: '2026-03-18', reason: 'b' },
    ];
    planning.showRescheduleModal(suggestions);

    planning.acceptAllReschedules();

    expect(deps.updateTask).toHaveBeenCalledTimes(2);
    expect(deps.showToast).toHaveBeenCalledWith('Rescheduled 2 tasks');
    expect(deps.render).toHaveBeenCalled();
    expect(document.getElementById('modalRoot').innerHTML).toBe('');
  });

  it('acceptAllReschedules skips already accepted suggestions', () => {
    const suggestions = [
      { taskId: 't1', taskTitle: 'Task 1', currentDueDate: '2026-03-10', suggestedDueDate: '2026-03-17', reason: 'a' },
      { taskId: 't2', taskTitle: 'Task 2', currentDueDate: '2026-03-11', suggestedDueDate: '2026-03-18', reason: 'b' },
    ];
    planning.showRescheduleModal(suggestions);

    planning.acceptReschedule(0);
    deps.updateTask.mockClear();

    planning.acceptAllReschedules();

    expect(deps.updateTask).toHaveBeenCalledTimes(1);
    expect(deps.updateTask).toHaveBeenCalledWith('t2', { dueDate: '2026-03-18' });
  });

  // ── autoRebalanceWeek ───────────────────────────────────────────────
  it('autoRebalanceWeek shows toast when week is balanced', async () => {
    deps.getData.mockReturnValue({ tasks: [], projects: [] });

    await planning.autoRebalanceWeek();

    expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('balanced'));
  });

  // ── isWeekOverloaded ────────────────────────────────────────────────
  it('isWeekOverloaded returns false when no tasks', () => {
    expect(planning.isWeekOverloaded()).toBe(false);
  });

  it('isWeekOverloaded returns true with 3+ overdue tasks', () => {
    const tasks = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      status: 'todo',
      dueDate: '2026-03-10',
    }));
    deps.getData.mockReturnValue({ tasks, projects: [] });

    expect(planning.isWeekOverloaded()).toBe(true);
  });

  it('isWeekOverloaded returns true when days are overloaded', () => {
    const d = new Date();
    const today =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const tasks = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i}`,
      status: 'todo',
      dueDate: today,
    }));
    deps.getData.mockReturnValue({ tasks, projects: [] });

    expect(planning.isWeekOverloaded()).toBe(true);
  });
});
