import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProactiveBriefing } from '../proactive-briefing.js';

function makeDeps(overrides = {}) {
  return {
    sanitizeAIHTML: vi.fn((s) => s),
    todayStr: vi.fn(() => '2026-03-15'),
    getData: vi.fn(() => ({ tasks: [], projects: [] })),
    userKey: vi.fn((k) => `user1_${k}`),
    hasAI: vi.fn(() => false),
    callAI: vi.fn(async () => ''),
    buildAIContext: vi.fn(() => ''),
    addAIMemory: vi.fn(),
    showToast: vi.fn(),
    notifyOverdueTasks: vi.fn(),
    extractMemoryInsights: vi.fn(() => ({})),
    _buildInsightsPromptSection: vi.fn(() => ''),
    getAIMemory: vi.fn(() => []),
    ...overrides,
  };
}

describe('proactive-briefing.js — createProactiveBriefing()', () => {
  let briefing;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    deps = makeDeps();
    briefing = createProactiveBriefing(deps);
  });

  // ── Factory returns ─────────────────────────────────────────────────
  it('returns all expected functions', () => {
    expect(typeof briefing.generateAIBriefing).toBe('function');
    expect(typeof briefing.submitEndOfDay).toBe('function');
    expect(typeof briefing.getAIStatusItems).toBe('function');
  });

  // ── generateAIBriefing ──────────────────────────────────────────────
  it('generateAIBriefing does nothing when AI is not available', async () => {
    await briefing.generateAIBriefing();
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('generateAIBriefing calls AI and stores result in localStorage', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('Your briefing content here');

    const btn = document.createElement('button');
    btn.id = 'briefingBtn';
    const body = document.createElement('div');
    body.id = 'briefingBody';
    document.body.append(btn, body);

    await briefing.generateAIBriefing();

    expect(deps.callAI).toHaveBeenCalledTimes(1);
    expect(deps.buildAIContext).toHaveBeenCalledWith('all');
    const stored = localStorage.getItem('user1_whiteboard_briefing_2026-03-15');
    expect(stored).toBe('Your briefing content here');
    expect(body.innerHTML).toBe('Your briefing content here');
    expect(btn.textContent).toBe('Refresh with AI');
    expect(deps.notifyOverdueTasks).toHaveBeenCalled();
  });

  it('generateAIBriefing strips bullet markers from AI response', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('- Item one\n• Item two\n* Item three');

    const body = document.createElement('div');
    body.id = 'briefingBody';
    document.body.append(body);

    await briefing.generateAIBriefing();

    const stored = localStorage.getItem('user1_whiteboard_briefing_2026-03-15');
    expect(stored).not.toContain('- Item');
    expect(stored).not.toContain('* Item');
    expect(stored).toContain('Item one');
  });

  it('generateAIBriefing shows spinner during generation', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('done');

    const btn = document.createElement('button');
    btn.id = 'briefingBtn';
    document.body.append(btn);

    await briefing.generateAIBriefing();
    expect(btn.textContent).toBe('Refresh with AI');
  });

  it('generateAIBriefing handles AI error gracefully', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockRejectedValue(new Error('API down'));

    const btn = document.createElement('button');
    btn.id = 'briefingBtn';
    document.body.append(btn);

    await briefing.generateAIBriefing();

    expect(btn.textContent).toBe('Error — try again');
    expect(deps.showToast).toHaveBeenCalledWith('Briefing failed — try again', true);
  });

  it('generateAIBriefing uses extractMemoryInsights', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('ok');
    deps.getAIMemory.mockReturnValue([{ content: 'test' }]);

    await briefing.generateAIBriefing();

    expect(deps.extractMemoryInsights).toHaveBeenCalledWith([{ content: 'test' }]);
    expect(deps._buildInsightsPromptSection).toHaveBeenCalled();
  });

  it('generateAIBriefing works without DOM elements', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('briefing text');

    await briefing.generateAIBriefing();

    expect(deps.callAI).toHaveBeenCalledTimes(1);
    const stored = localStorage.getItem('user1_whiteboard_briefing_2026-03-15');
    expect(stored).toBe('briefing text');
  });

  // ── submitEndOfDay ──────────────────────────────────────────────────
  it('submitEndOfDay shows toast when no input element exists', async () => {
    await briefing.submitEndOfDay();
    expect(deps.showToast).toHaveBeenCalledWith('Write a few words about your day first');
  });

  it('submitEndOfDay shows toast when input is empty', async () => {
    const input = document.createElement('input');
    input.id = 'eodInput';
    input.value = '   ';
    document.body.append(input);

    await briefing.submitEndOfDay();
    expect(deps.showToast).toHaveBeenCalledWith('Write a few words about your day first');
  });

  it('submitEndOfDay calls AI with task context and stores reflection', async () => {
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('Great reflection response');
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't1', title: 'Done task', status: 'done', completedAt: '2026-03-15T10:00:00Z' },
        { id: 't2', title: 'Open task', status: 'todo', dueDate: '2026-03-10' },
        { id: 't3', title: 'Another open', status: 'in-progress' },
      ],
      projects: [],
    });

    const input = document.createElement('input');
    input.id = 'eodInput';
    input.value = 'Productive day, got the main feature done';
    const btn = document.createElement('button');
    btn.id = 'eodBtn';
    const card = document.createElement('div');
    card.id = 'eodCard';
    document.body.append(input, btn, card);

    await briefing.submitEndOfDay();

    expect(deps.callAI).toHaveBeenCalledTimes(1);
    const prompt = deps.callAI.mock.calls[0][0];
    expect(prompt).toContain('Productive day');
    expect(prompt).toContain('Done task');
    expect(prompt).toContain('Overdue: 1');

    const stored = localStorage.getItem('user1_wb_eod_2026-03-15');
    expect(stored).toBe('Great reflection response');
    expect(deps.addAIMemory).toHaveBeenCalled();
    expect(card.innerHTML).toContain('Great reflection response');
  });

  it('submitEndOfDay handles AI error gracefully', async () => {
    deps.callAI.mockRejectedValue(new Error('fail'));

    const input = document.createElement('input');
    input.id = 'eodInput';
    input.value = 'my day was ok';
    const btn = document.createElement('button');
    btn.id = 'eodBtn';
    document.body.append(input, btn);

    await briefing.submitEndOfDay();

    expect(btn.textContent).toBe('Error — try again');
    expect(deps.showToast).toHaveBeenCalledWith('End of day reflection failed — try again', true);
  });

  // ── getAIStatusItems ────────────────────────────────────────────────
  it('getAIStatusItems returns empty array when no data', () => {
    const items = briefing.getAIStatusItems();
    expect(items).toEqual([]);
  });

  it('getAIStatusItems includes drafted tasks item', () => {
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't1', notes: '**AI Draft:** some draft', createdAt: '2026-03-15T08:00:00Z', status: 'todo' },
        { id: 't2', notes: '**AI Draft:** another', createdAt: '2026-03-15T09:00:00Z', status: 'todo' },
      ],
      projects: [],
    });

    const items = briefing.getAIStatusItems();
    const draftItem = items.find((i) => i.text.includes('drafts'));
    expect(draftItem).toBeDefined();
    expect(draftItem.text).toContain('2');
  });

  it('getAIStatusItems includes completed tasks item', () => {
    deps.getData.mockReturnValue({
      tasks: [{ id: 't1', status: 'done', completedAt: '2026-03-15T12:00:00Z' }],
      projects: [],
    });

    const items = briefing.getAIStatusItems();
    const completedItem = items.find((i) => i.text.includes('completed'));
    expect(completedItem).toBeDefined();
    expect(completedItem.text).toContain('1 task completed');
  });

  it('getAIStatusItems includes briefing ready item', () => {
    localStorage.setItem('user1_whiteboard_briefing_2026-03-15', 'test briefing');

    const items = briefing.getAIStatusItems();
    const briefingItem = items.find((i) => i.text.includes('briefing'));
    expect(briefingItem).toBeDefined();
  });

  it('getAIStatusItems includes plan prepared item', () => {
    localStorage.setItem('user1_whiteboard_plan_2026-03-15', '[{"id":"t1"}]');

    const items = briefing.getAIStatusItems();
    const planItem = items.find((i) => i.text.includes('plan'));
    expect(planItem).toBeDefined();
  });

  it('getAIStatusItems uses correct singular for 1 draft', () => {
    deps.getData.mockReturnValue({
      tasks: [{ id: 't1', notes: '**AI Draft:** draft', createdAt: '2026-03-15T08:00:00Z', status: 'todo' }],
      projects: [],
    });

    const items = briefing.getAIStatusItems();
    const draftItem = items.find((i) => i.icon === '\u2726');
    expect(draftItem).toBeDefined();
    expect(draftItem.text).not.toContain('tasks');
  });

  it('getAIStatusItems handles malformed proactive log gracefully', () => {
    localStorage.setItem('user1_wb_proactive_log_2026-03-15', 'not json');
    const items = briefing.getAIStatusItems();
    expect(Array.isArray(items)).toBe(true);
  });
});
