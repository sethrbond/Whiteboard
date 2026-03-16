import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCommandPalette } from '../command-palette.js';

function makeDeps(overrides = {}) {
  return {
    $: vi.fn((sel) => document.querySelector(sel)),
    $$: vi.fn((sel) => [...document.querySelectorAll(sel)]),
    esc: vi.fn((s) => (s == null ? '' : String(s))),
    highlightMatch: vi.fn((text, _q) => text),
    fmtDate: vi.fn((d) => d),
    getData: vi.fn(() => ({ tasks: [], projects: [] })),
    userKey: vi.fn((k) => `user1_${k}`),
    closeModal: vi.fn(),
    setModalTriggerEl: vi.fn(),
    activeTasks: vi.fn(() => []),
    hasAI: vi.fn(() => false),
    showToast: vi.fn(),
    setView: vi.fn(),
    sendChat: vi.fn(),
    toggleChat: vi.fn(),
    openNewTask: vi.fn(),
    openQuickAdd: vi.fn(),
    openNewProject: vi.fn(),
    openSettings: vi.fn(),
    startFocus: vi.fn(),
    aiReorganize: vi.fn(),
    filterAIPrepared: vi.fn(),
    setNudgeFilter: vi.fn(),
    getCurrentProject: vi.fn(() => null),
    ...overrides,
  };
}

describe('command-palette.js — createCommandPalette()', () => {
  let cp;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
    cp = createCommandPalette(deps);
  });

  // ── Factory returns ─────────────────────────────────────────────────
  it('returns all expected functions', () => {
    const keys = [
      'openSearch',
      'handleCmdNav',
      'renderSearchResults',
      'cmdPaletteAI',
      'cmdExec',
      'openShortcutHelp',
      'resetCmdIdx',
    ];
    keys.forEach((k) => expect(typeof cp[k]).toBe('function'));
  });

  // ── openSearch ────────────────────────────────────────────────────
  it('openSearch renders the command palette modal', () => {
    cp.openSearch();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('cmd-palette');
    expect(modal.innerHTML).toContain('searchInput');
  });

  it('openSearch renders initial search results', () => {
    cp.openSearch();
    const results = document.getElementById('searchResults');
    expect(results.innerHTML).toContain('Commands');
  });

  // ── renderSearchResults ───────────────────────────────────────────
  it('renderSearchResults shows commands when query is empty', () => {
    cp.openSearch();
    cp.renderSearchResults('');
    const results = document.getElementById('searchResults');
    expect(results.innerHTML).toContain('Commands');
    expect(results.innerHTML).toContain('New Task');
  });

  it('renderSearchResults filters commands with > prefix', () => {
    cp.openSearch();
    cp.renderSearchResults('>focus');
    const results = document.getElementById('searchResults');
    expect(results.innerHTML).toContain('Focus Mode');
  });

  it('renderSearchResults shows no results message for unmatched query', () => {
    cp.openSearch();
    cp.renderSearchResults('zzzznonexistent');
    const results = document.getElementById('searchResults');
    expect(results.innerHTML).toContain('No results');
  });

  it('renderSearchResults finds tasks by title', () => {
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Buy groceries', priority: 'normal', status: 'todo' }],
      projects: [],
    });
    cp.openSearch();
    cp.renderSearchResults('groceries');
    const results = document.getElementById('searchResults');
    expect(results.innerHTML).toContain('Tasks');
  });

  it('renderSearchResults finds projects by name', () => {
    deps.getData.mockReturnValue({
      tasks: [],
      projects: [{ id: 'p_1', name: 'Work', color: '#3b82f6' }],
    });
    deps.activeTasks.mockReturnValue([]);
    cp.openSearch();
    cp.renderSearchResults('work');
    const results = document.getElementById('searchResults');
    expect(results.innerHTML).toContain('Boards');
  });

  it('renderSearchResults shows recent commands when available', () => {
    localStorage.setItem('user1_wb_cmd_recent', JSON.stringify(['Focus Mode', 'Settings']));
    cp.openSearch();
    cp.renderSearchResults('');
    const results = document.getElementById('searchResults');
    expect(results.innerHTML).toContain('Recent');
  });

  it('renderSearchResults shows "Create task" option for typed text', () => {
    cp.openSearch();
    cp.renderSearchResults('my new task');
    const results = document.getElementById('searchResults');
    expect(results.innerHTML).toContain('Create task');
  });

  // ── cmdExec ───────────────────────────────────────────────────────
  it('cmdExec saves command to recent history', () => {
    // First open search to register command actions
    cp.openSearch();
    cp.cmdExec('c0', 'New Task');
    const recent = JSON.parse(localStorage.getItem('user1_wb_cmd_recent'));
    expect(recent).toContain('New Task');
  });

  // ── resetCmdIdx ───────────────────────────────────────────────────
  it('resetCmdIdx resets the command index to 0', () => {
    cp.resetCmdIdx();
    // No direct accessor for cmdIdx, but it should not throw
    expect(() => cp.resetCmdIdx()).not.toThrow();
  });

  // ── openShortcutHelp ──────────────────────────────────────────────
  it('openShortcutHelp renders keyboard shortcuts modal', () => {
    cp.openShortcutHelp();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('Keyboard Shortcuts');
    expect(modal.innerHTML).toContain('Navigation');
    expect(modal.innerHTML).toContain('Tasks');
    expect(modal.innerHTML).toContain('AI Features');
  });

  it('openShortcutHelp calls setModalTriggerEl', () => {
    cp.openShortcutHelp();
    expect(deps.setModalTriggerEl).toHaveBeenCalled();
  });

  // ── cmdPaletteAI ──────────────────────────────────────────────────
  it('cmdPaletteAI does nothing when AI is not available', async () => {
    deps.hasAI.mockReturnValue(false);
    await cp.cmdPaletteAI('test query');
    expect(deps.sendChat).not.toHaveBeenCalled();
  });

  it('cmdPaletteAI does nothing for empty query', async () => {
    deps.hasAI.mockReturnValue(true);
    await cp.cmdPaletteAI('  ');
    expect(deps.showToast).not.toHaveBeenCalled();
  });

  it('cmdPaletteAI handles overdue keyword locally', async () => {
    deps.hasAI.mockReturnValue(true);
    await cp.cmdPaletteAI('show me overdue tasks');
    expect(deps.setNudgeFilter).toHaveBeenCalledWith('overdue');
    expect(deps.setView).toHaveBeenCalledWith('dashboard');
  });

  it('cmdPaletteAI handles stale keyword locally', async () => {
    deps.hasAI.mockReturnValue(true);
    await cp.cmdPaletteAI('tasks sitting for too long');
    expect(deps.setNudgeFilter).toHaveBeenCalledWith('stale');
  });

  it('cmdPaletteAI handles unassigned keyword locally', async () => {
    deps.hasAI.mockReturnValue(true);
    await cp.cmdPaletteAI('show unassigned tasks');
    expect(deps.setNudgeFilter).toHaveBeenCalledWith('unassigned');
  });

  // ── handleCmdNav ──────────────────────────────────────────────────
  it('handleCmdNav does nothing when no items exist', () => {
    cp.openSearch();
    document.getElementById('searchResults').innerHTML = '';
    const e = new Event('keydown');
    e.key = 'ArrowDown';
    e.preventDefault = vi.fn();
    cp.handleCmdNav(e);
    // Should not throw
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
