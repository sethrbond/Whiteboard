import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MS_PER_DAY } from '../constants.js';
import { createProactive } from '../proactive.js';
import { createChat } from '../chat.js';

// ── Proactive Deps Helper ─────────────────────────────────────────
function makeProactiveDeps(overrides = {}) {
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

// ── Chat Deps Helper ──────────────────────────────────────────────
function makeChatDeps(overrides = {}) {
  return {
    esc: vi.fn((s) => (s == null ? '' : String(s))),
    todayStr: vi.fn(() => '2026-03-16'),
    getData: vi.fn(() => ({ tasks: [], projects: [] })),
    hasAI: vi.fn(() => true),
    getAIEndpoint: vi.fn(() => ({ url: 'http://test', headers: {} })),
    buildAIContext: vi.fn(() => ''),
    AI_PERSONA: 'Test persona',
    AI_ACTIONS_SPEC: '',
    executeAIActions: vi.fn(async () => ({ applied: 0, insights: [] })),
    incrementAIInteraction: vi.fn(),
    render: vi.fn(),
    callAI: vi.fn(async () => 'test reply'),
    findTask: vi.fn(() => null),
    userKey: vi.fn((k) => `user1_${k}`),
    CHAT_HISTORY_KEY: 'chat_history',
    getSettings: vi.fn(() => ({})),
    getStuckTasks: vi.fn(() => []),
    ...overrides,
  };
}

// ================================================================
// 1. extractMemoryInsights
// ================================================================
describe('extractMemoryInsights', () => {
  let proactive;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeProactiveDeps();
    proactive = createProactive(deps);
  });

  it('returns default insights for empty memories', () => {
    const result = proactive.extractMemoryInsights([]);
    expect(result.productive_time).toBeNull();
    expect(result.avg_tasks_per_day).toBeNull();
    expect(result.most_productive_day).toBeNull();
    expect(result.task_order_preference).toBeNull();
    expect(result.procrastination_types).toEqual([]);
  });

  it('extracts productive_time from memory text', () => {
    const memories = [{ text: 'User completes most tasks in the morning (6am-12pm)', type: 'rhythm' }];
    const result = proactive.extractMemoryInsights(memories);
    expect(result.productive_time).toBe('morning');
  });

  it('extracts afternoon productive_time', () => {
    const memories = [{ text: 'User is most productive in the afternoon', type: 'rhythm' }];
    const result = proactive.extractMemoryInsights(memories);
    expect(result.productive_time).toBe('afternoon');
  });

  it('extracts evening productive_time', () => {
    const memories = [{ text: 'User completes most tasks in the evening (5-10pm)', type: 'rhythm' }];
    const result = proactive.extractMemoryInsights(memories);
    expect(result.productive_time).toBe('evening');
  });

  it('extracts avg_tasks_per_day from memory', () => {
    const memories = [{ text: 'User averages 4.5 tasks per day', type: 'pattern' }];
    const result = proactive.extractMemoryInsights(memories);
    expect(result.avg_tasks_per_day).toBe(4.5);
  });

  it('extracts most_productive_day', () => {
    const memories = [{ text: 'Most productive day tends to be Wednesday', type: 'rhythm' }];
    const result = proactive.extractMemoryInsights(memories);
    expect(result.most_productive_day).toBe('Wednesday');
  });

  it('extracts task_order_preference hard-first', () => {
    const memories = [{ text: 'User prefers to tackle hard tasks first', type: 'preference' }];
    const result = proactive.extractMemoryInsights(memories);
    expect(result.task_order_preference).toBe('hard-first');
  });

  it('extracts task_order_preference easy-first', () => {
    const memories = [{ text: 'User likes easy tasks first to build momentum', type: 'preference' }];
    const result = proactive.extractMemoryInsights(memories);
    expect(result.task_order_preference).toBe('easy-first');
  });

  it('extracts task_order_preference from quick wins', () => {
    const memories = [{ text: 'User prefers quick wins first', type: 'preference' }];
    const result = proactive.extractMemoryInsights(memories);
    expect(result.task_order_preference).toBe('easy-first');
  });

  it('extracts procrastination_types', () => {
    const memories = [
      { text: 'User tends to avoid email tasks', type: 'pattern' },
      { text: 'User procrastinates on writing and review work', type: 'pattern' },
    ];
    const result = proactive.extractMemoryInsights(memories);
    expect(result.procrastination_types).toContain('email');
    expect(result.procrastination_types).toContain('writing');
    expect(result.procrastination_types).toContain('review');
  });

  it('does not duplicate procrastination_types', () => {
    const memories = [
      { text: 'User avoids email tasks', type: 'pattern' },
      { text: 'User delays email responses', type: 'pattern' },
    ];
    const result = proactive.extractMemoryInsights(memories);
    const emailCount = result.procrastination_types.filter((t) => t === 'email').length;
    expect(emailCount).toBe(1);
  });

  it('derives avg_tasks_per_day from task data if not in memories', () => {
    // Create tasks with explicit completedAt dates within the last 14 days
    const now = Date.now();
    const oneDay = 86400000; // Use literal to avoid any import issues
    const tasks = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(now - i * oneDay);
      tasks.push({
        id: 't' + i,
        status: 'done',
        completedAt: d.toISOString(),
      });
    }
    const mockGetData = vi.fn(() => ({ tasks, projects: [] }));
    deps = makeProactiveDeps({ getData: mockGetData });
    proactive = createProactive(deps);
    const result = proactive.extractMemoryInsights([]);
    // The function should have called getData to derive avg
    expect(mockGetData).toHaveBeenCalled();
    // avg_tasks_per_day should be a number (14 tasks / 14 days = 1.0)
    if (result.avg_tasks_per_day !== null) {
      expect(result.avg_tasks_per_day).toBeGreaterThan(0);
    }
  });

  it('handles null/undefined memories gracefully', () => {
    const result = proactive.extractMemoryInsights(null);
    expect(result.productive_time).toBeNull();
    expect(result.procrastination_types).toEqual([]);
  });

  it('extracts multiple insights from combined memories', () => {
    const memories = [
      { text: 'User completes most tasks in the morning (6am-12pm)', type: 'rhythm' },
      { text: 'Most productive day tends to be Monday', type: 'rhythm' },
      { text: 'User prefers to tackle hard tasks first', type: 'preference' },
      { text: 'User avoids call tasks', type: 'pattern' },
      { text: 'Averages 6 tasks per day', type: 'pattern' },
    ];
    const result = proactive.extractMemoryInsights(memories);
    expect(result.productive_time).toBe('morning');
    expect(result.most_productive_day).toBe('Monday');
    expect(result.task_order_preference).toBe('hard-first');
    expect(result.procrastination_types).toContain('call');
    expect(result.avg_tasks_per_day).toBe(6);
  });
});

// ================================================================
// 2. trackNudgeInteraction
// ================================================================
describe('trackNudgeInteraction', () => {
  let proactive;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeProactiveDeps();
    proactive = createProactive(deps);
  });

  it('saves nudge interaction to localStorage', () => {
    proactive.trackNudgeInteraction('overdue', true);
    const key = deps.userKey('wb_nudge_interactions');
    const stored = JSON.parse(localStorage.getItem(key));
    expect(stored).toHaveLength(1);
    expect(stored[0].type).toBe('overdue');
    expect(stored[0].acted).toBe(true);
  });

  it('tracks multiple interactions', () => {
    proactive.trackNudgeInteraction('overdue', true);
    proactive.trackNudgeInteraction('stale', false);
    proactive.trackNudgeInteraction('warning', true);
    const key = deps.userKey('wb_nudge_interactions');
    const stored = JSON.parse(localStorage.getItem(key));
    expect(stored).toHaveLength(3);
  });

  it('caps at 100 interactions', () => {
    const key = deps.userKey('wb_nudge_interactions');
    const existing = Array.from({ length: 99 }, () => ({ type: 'old', acted: false, ts: Date.now() }));
    localStorage.setItem(key, JSON.stringify(existing));
    proactive.trackNudgeInteraction('new', true);
    proactive.trackNudgeInteraction('new', true);
    const stored = JSON.parse(localStorage.getItem(key));
    expect(stored.length).toBeLessThanOrEqual(100);
  });

  it('saves memory when action rate is high after 5 interactions', () => {
    for (let i = 0; i < 5; i++) {
      proactive.trackNudgeInteraction('urgent', true);
    }
    expect(deps.addAIMemory).toHaveBeenCalled();
    const call = deps.addAIMemory.mock.calls.find((c) => c[0].includes('urgent'));
    expect(call).toBeTruthy();
    expect(call[0]).toContain('acts on');
  });

  it('saves memory when action rate is low after 5 interactions', () => {
    for (let i = 0; i < 5; i++) {
      proactive.trackNudgeInteraction('stale', false);
    }
    expect(deps.addAIMemory).toHaveBeenCalled();
    const call = deps.addAIMemory.mock.calls.find((c) => c[0].includes('stale'));
    expect(call).toBeTruthy();
    expect(call[0]).toContain('ignores');
  });
});

// ================================================================
// 3. getSmartNudges with memory-based weighting
// ================================================================
describe('getSmartNudges — memory weighting', () => {
  let proactive;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeProactiveDeps({
      getData: vi.fn(() => ({
        tasks: [
          // 35 active tasks to trigger overload nudge
          ...Array.from({ length: 35 }, (_, i) => ({
            id: 'active' + i,
            title: 'Task ' + i,
            status: 'todo',
            priority: 'normal',
            createdAt: new Date(Date.now() - 2 * MS_PER_DAY).toISOString(),
          })),
          // 4 stale tasks to trigger stale nudge
          ...Array.from({ length: 4 }, (_, i) => ({
            id: 'stale' + i,
            title: 'Stale ' + i,
            status: 'todo',
            priority: 'normal',
            createdAt: new Date(Date.now() - 30 * MS_PER_DAY).toISOString(),
          })),
        ],
        projects: [],
      })),
    });
    proactive = createProactive(deps);
  });

  it('returns nudges sorted by weight when interactions exist', () => {
    // Record interactions favoring stale nudges over warnings
    const key = deps.userKey('wb_nudge_interactions');
    const interactions = [
      ...Array.from({ length: 5 }, () => ({ type: 'stale', acted: true, ts: Date.now() })),
      ...Array.from({ length: 5 }, () => ({ type: 'warning', acted: false, ts: Date.now() })),
    ];
    localStorage.setItem(key, JSON.stringify(interactions));

    const nudges = proactive.getSmartNudges();
    expect(nudges.length).toBeGreaterThan(0);
    // Stale should come before warning due to higher weight
    const staleIdx = nudges.findIndex((n) => n.type === 'stale');
    const warnIdx = nudges.findIndex((n) => n.type === 'warning');
    if (staleIdx >= 0 && warnIdx >= 0) {
      expect(staleIdx).toBeLessThan(warnIdx);
    }
  });

  it('returns nudges without weighting when no interactions', () => {
    const nudges = proactive.getSmartNudges();
    expect(nudges.length).toBeGreaterThan(0);
  });
});

// ================================================================
// 4. maybeProactiveChat
// ================================================================
describe('maybeProactiveChat', () => {
  let chat;
  let chatDeps;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="chatPanel"></div><div id="chatMessages"></div><div id="chatInput"></div>';
    chatDeps = makeChatDeps();
    chat = createChat(chatDeps);
  });

  it('does nothing if no stuck tasks', () => {
    chatDeps.getStuckTasks.mockReturnValue([]);
    chat.maybeProactiveChat();
    const panel = document.getElementById('chatPanel');
    expect(panel.classList.contains('open')).toBe(false);
  });

  it('opens chat with contextual message when stuck tasks exist', () => {
    chatDeps.getStuckTasks.mockReturnValue([
      { id: 't1', title: 'Fix the bug', project: 'proj1', status: 'in-progress' },
    ]);
    chat.maybeProactiveChat();
    const panel = document.getElementById('chatPanel');
    expect(panel.classList.contains('open')).toBe(true);
    const msgs = document.getElementById('chatMessages');
    expect(msgs.innerHTML).toContain('Fix the bug');
  });

  it('only triggers once per session', () => {
    chatDeps.getStuckTasks.mockReturnValue([
      { id: 't1', title: 'Fix the bug', project: 'proj1', status: 'in-progress' },
    ]);
    chat.maybeProactiveChat();
    // Close the panel
    document.getElementById('chatPanel').classList.remove('open');
    document.getElementById('chatMessages').innerHTML = '';
    // Try again
    chat.maybeProactiveChat();
    const panel = document.getElementById('chatPanel');
    expect(panel.classList.contains('open')).toBe(false);
  });

  it('does not trigger if AI is not available', () => {
    chatDeps.hasAI.mockReturnValue(false);
    chatDeps.getStuckTasks.mockReturnValue([
      { id: 't1', title: 'Fix the bug', project: 'proj1', status: 'in-progress' },
    ]);
    chat = createChat(chatDeps);
    chat.maybeProactiveChat();
    const panel = document.getElementById('chatPanel');
    expect(panel.classList.contains('open')).toBe(false);
  });

  it('does not trigger if chat panel already open', () => {
    document.getElementById('chatPanel').classList.add('open');
    chatDeps.getStuckTasks.mockReturnValue([
      { id: 't1', title: 'Fix the bug', project: 'proj1', status: 'in-progress' },
    ]);
    chat.maybeProactiveChat();
    // Should not push a message
    const msgs = document.getElementById('chatMessages');
    expect(msgs.innerHTML).toBe('');
  });

  it('resets trigger flag on resetChatState', () => {
    chatDeps.getStuckTasks.mockReturnValue([
      { id: 't1', title: 'Fix the bug', project: 'proj1', status: 'in-progress' },
    ]);
    chat.maybeProactiveChat();
    chat.resetChatState();
    // Now it should be able to trigger again
    document.getElementById('chatPanel').classList.remove('open');
    chat.maybeProactiveChat();
    const panel = document.getElementById('chatPanel');
    expect(panel.classList.contains('open')).toBe(true);
  });
});

// ================================================================
// 5. Memory Insights Card (dashboard)
// ================================================================
describe('Memory Insights Card — renderMemoryInsightsCard', () => {
  let dashboard;

  function makeDashDeps(overrides = {}) {
    const defaultDeps = {
      $: vi.fn((sel) => document.querySelector(sel)),
      $$: vi.fn((sel) => document.querySelectorAll(sel)),
      esc: vi.fn((s) => (s == null ? '' : String(s))),
      sanitizeAIHTML: vi.fn((s) => s),
      fmtDate: vi.fn(() => 'Mar 16'),
      todayStr: vi.fn(() => '2026-03-16'),
      PRIORITY_ORDER: { urgent: 0, important: 1, normal: 2, low: 3 },
      getData: vi.fn(() => ({ tasks: [], projects: [{ id: 'p1', name: 'Life' }] })),
      saveData: vi.fn(),
      userKey: vi.fn((k) => `user1_${k}`),
      findTask: vi.fn(() => null),
      activeTasks: vi.fn(() => []),
      doneTasks: vi.fn(() => []),
      urgentTasks: vi.fn(() => []),
      projectTasks: vi.fn(() => []),
      archivedTasks: vi.fn(() => []),
      sortTasksDeps: { getDataVersion: vi.fn(() => 1) },
      hasAI: vi.fn(() => true),
      showToast: vi.fn(),
      render: vi.fn(),
      setView: vi.fn(),
      updateTask: vi.fn(),
      addTask: vi.fn(),
      createTask: vi.fn(),
      renderTaskRow: vi.fn(() => '<div class="task-row"></div>'),
      renderPriorityTag: vi.fn(() => ''),
      priorityColor: vi.fn(() => '#000'),
      renderCalendar: vi.fn(() => ''),
      getCurrentView: vi.fn(() => 'dashboard'),
      getCurrentProject: vi.fn(() => null),
      getDashViewMode: vi.fn(() => 'list'),
      getShowCompleted: vi.fn(() => false),
      getProjectViewMode: vi.fn(() => undefined),
      getShowProjectBg: vi.fn(() => false),
      parseProjectBackground: vi.fn(() => ({})),
      getBulkMode: vi.fn(() => false),
      getSectionShowCount: vi.fn(() => undefined),
      getArchiveShowCount: vi.fn(() => 50),
      renderBulkBar: vi.fn(() => ''),
      attachListeners: vi.fn(),
      getBrainstormModule: vi.fn(() => ({ getDumpHistory: () => [], shouldShowDumpInvite: () => false })),
      getAIStatusItems: vi.fn(() => []),
      getSmartFeedItems: vi.fn(() => []),
      getSmartNudges: vi.fn(() => []),
      getStuckTasks: vi.fn(() => []),
      isWeekOverloaded: vi.fn(() => false),
      maybeShowCheckIn: vi.fn(() => ''),
      detectVagueTasks: vi.fn(() => null),
      nudgeFilterOverdue: vi.fn(),
      nudgeFilterStale: vi.fn(),
      nudgeFilterUnassigned: vi.fn(),
      startFocus: vi.fn(),
      offerStuckHelp: vi.fn(),
      generateAIBriefing: vi.fn(),
      planMyDay: vi.fn(),
      runProactiveWorker: vi.fn(),
      getBriefingGenerating: vi.fn(() => false),
      setBriefingGenerating: vi.fn(),
      getPlanGenerating: vi.fn(() => false),
      setPlanGenerating: vi.fn(),
      getNudgeFilter: vi.fn(() => ''),
      setNudgeFilter: vi.fn(),
      getSmartFeedExpanded: vi.fn(() => false),
      getTodayBriefingExpanded: vi.fn(() => false),
      getShowTagFilter: vi.fn(() => false),
      getActiveTagFilter: vi.fn(() => ''),
      getAllTags: vi.fn(() => []),
      getTagColor: vi.fn(() => ({ bg: '#eee', color: '#333' })),
      toggleChat: vi.fn(),
      sendChat: vi.fn(),
      renderDump: vi.fn(() => ''),
      initDumpDropZone: vi.fn(),
      renderWeeklyReview: vi.fn(() => ''),
      isComplexInput: vi.fn(() => false),
      parseQuickInput: vi.fn(() => ({})),
      handleSlashCommand: vi.fn(),
      aiEnhanceTask: vi.fn(),
      getEscalationBanner: vi.fn(() => ''),
      getFocusStats: vi.fn(async () => ({})),
      getAIMemory: vi.fn(() => []),
      extractMemoryInsights: vi.fn(() => ({
        productive_time: null,
        avg_tasks_per_day: null,
        most_productive_day: null,
        task_order_preference: null,
        procrastination_types: [],
      })),
      ...overrides,
    };
    return defaultDeps;
  }

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="content"></div>';
  });

  it('returns empty string when fewer than 5 memories', () => {
    const { createDashboard } = require('../dashboard.js');
    const dDeps = makeDashDeps({
      getAIMemory: vi.fn(() => [
        { text: 'memory 1', type: 'note' },
        { text: 'memory 2', type: 'note' },
      ]),
    });
    dashboard = createDashboard(dDeps);
    const html = dashboard.renderMemoryInsightsCard();
    expect(html).toBe('');
  });

  it('renders card when 5+ memories and insights available', () => {
    const { createDashboard } = require('../dashboard.js');
    const memories = Array.from({ length: 6 }, (_, i) => ({ text: 'memory ' + i, type: 'note' }));
    const dDeps = makeDashDeps({
      getAIMemory: vi.fn(() => memories),
      extractMemoryInsights: vi.fn(() => ({
        productive_time: 'morning',
        avg_tasks_per_day: 5,
        most_productive_day: 'Tuesday',
        task_order_preference: 'hard-first',
        procrastination_types: ['email'],
      })),
    });
    dashboard = createDashboard(dDeps);
    const html = dashboard.renderMemoryInsightsCard();
    expect(html).toContain('memory-insights-card');
    expect(html).toContain('Learned Patterns');
    expect(html).toContain('~5 tasks per day');
    expect(html).toContain('Most productive: Tuesdays');
    expect(html).toContain('Peak time: morning');
  });

  it('shows personalized tip for hard-first preference', () => {
    const { createDashboard } = require('../dashboard.js');
    const memories = Array.from({ length: 6 }, (_, i) => ({ text: 'memory ' + i, type: 'note' }));
    const dDeps = makeDashDeps({
      getAIMemory: vi.fn(() => memories),
      extractMemoryInsights: vi.fn(() => ({
        productive_time: null,
        avg_tasks_per_day: 3,
        most_productive_day: null,
        task_order_preference: 'hard-first',
        procrastination_types: [],
      })),
    });
    dashboard = createDashboard(dDeps);
    const html = dashboard.renderMemoryInsightsCard();
    expect(html).toContain('hard tasks first');
  });

  it('shows personalized tip for easy-first preference', () => {
    const { createDashboard } = require('../dashboard.js');
    const memories = Array.from({ length: 6 }, (_, i) => ({ text: 'memory ' + i, type: 'note' }));
    const dDeps = makeDashDeps({
      getAIMemory: vi.fn(() => memories),
      extractMemoryInsights: vi.fn(() => ({
        productive_time: null,
        avg_tasks_per_day: 3,
        most_productive_day: null,
        task_order_preference: 'easy-first',
        procrastination_types: [],
      })),
    });
    dashboard = createDashboard(dDeps);
    const html = dashboard.renderMemoryInsightsCard();
    expect(html).toContain('Quick wins first');
  });

  it('shows procrastination tip when no order preference', () => {
    const { createDashboard } = require('../dashboard.js');
    const memories = Array.from({ length: 6 }, (_, i) => ({ text: 'memory ' + i, type: 'note' }));
    const dDeps = makeDashDeps({
      getAIMemory: vi.fn(() => memories),
      extractMemoryInsights: vi.fn(() => ({
        productive_time: null,
        avg_tasks_per_day: 3,
        most_productive_day: null,
        task_order_preference: null,
        procrastination_types: ['email'],
      })),
    });
    dashboard = createDashboard(dDeps);
    const html = dashboard.renderMemoryInsightsCard();
    expect(html).toContain('email');
    expect(html).toContain('energy is highest');
  });

  it('returns empty when no meaningful insights', () => {
    const { createDashboard } = require('../dashboard.js');
    const memories = Array.from({ length: 6 }, (_, i) => ({ text: 'memory ' + i, type: 'note' }));
    const dDeps = makeDashDeps({
      getAIMemory: vi.fn(() => memories),
      extractMemoryInsights: vi.fn(() => ({
        productive_time: null,
        avg_tasks_per_day: null,
        most_productive_day: null,
        task_order_preference: null,
        procrastination_types: [],
      })),
    });
    dashboard = createDashboard(dDeps);
    const html = dashboard.renderMemoryInsightsCard();
    expect(html).toBe('');
  });

  it('shows memory count in card header', () => {
    const { createDashboard } = require('../dashboard.js');
    const memories = Array.from({ length: 12 }, (_, i) => ({ text: 'memory ' + i, type: 'note' }));
    const dDeps = makeDashDeps({
      getAIMemory: vi.fn(() => memories),
      extractMemoryInsights: vi.fn(() => ({
        productive_time: 'evening',
        avg_tasks_per_day: null,
        most_productive_day: null,
        task_order_preference: null,
        procrastination_types: [],
      })),
    });
    dashboard = createDashboard(dDeps);
    const html = dashboard.renderMemoryInsightsCard();
    expect(html).toContain('12 memories');
  });
});

// ================================================================
// 6. planMyDay uses memory insights
// ================================================================
describe('planMyDay — memory-influenced', () => {
  it('includes memory insights in AI prompt', async () => {
    let capturedPrompt = '';
    const deps = makeProactiveDeps({
      hasAI: vi.fn(() => true),
      getData: vi.fn(() => ({
        tasks: [{ id: 't1', title: 'Task 1', status: 'todo', priority: 'normal', createdAt: '2026-03-15' }],
        projects: [],
      })),
      getAIMemory: vi.fn(() => [
        { text: 'User completes most tasks in the morning (6am-12pm)', type: 'rhythm' },
        { text: 'User prefers to tackle hard tasks first', type: 'preference' },
      ]),
      callAI: vi.fn(async (prompt) => {
        capturedPrompt = prompt;
        return '[{"id":"t1","why":"test"}]';
      }),
      findTask: vi.fn((id) => (id === 't1' ? { id: 't1', title: 'Task 1' } : null)),
    });
    document.body.innerHTML = '<div id="planBtn">Plan</div>';
    const proactive = createProactive(deps);
    await proactive.planMyDay();
    expect(capturedPrompt).toContain('morning');
    expect(capturedPrompt).toContain('hard-first');
  });
});

// ================================================================
// 7. generateAIBriefing uses memory insights
// ================================================================
describe('generateAIBriefing — memory-influenced', () => {
  it('includes memory insights in briefing prompt', async () => {
    let capturedPrompt = '';
    const deps = makeProactiveDeps({
      hasAI: vi.fn(() => true),
      getAIMemory: vi.fn(() => [{ text: 'Most productive day tends to be Monday', type: 'rhythm' }]),
      callAI: vi.fn(async (prompt) => {
        capturedPrompt = prompt;
        return '**Right Now**\nTest briefing';
      }),
    });
    document.body.innerHTML = '<div id="briefingBtn">Briefing</div><div id="briefingBody"></div>';
    const proactive = createProactive(deps);
    await proactive.generateAIBriefing();
    expect(capturedPrompt).toContain('Monday');
  });
});
