import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUIHelpers } from '../ui-helpers.js';

// Mock the modules that ui-helpers.js imports
vi.mock('../constants.js', () => ({
  TAG_COLORS: [
    { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
    { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
    { bg: 'rgba(234,179,8,0.12)', color: '#ca8a04' },
    { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
    { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
    { bg: 'rgba(168,85,247,0.12)', color: '#a855f7' },
    { bg: 'rgba(236,72,153,0.12)', color: '#ec4899' },
    { bg: 'rgba(20,184,166,0.12)', color: '#14b8a6' },
  ],
}));

vi.mock('../dates.js', () => ({
  todayStr: vi.fn(() => '2026-03-15'),
  parseNaturalDate: vi.fn(() => ({ dueDate: '' })),
}));

import { todayStr, parseNaturalDate } from '../dates.js';

function makeDeps(overrides = {}) {
  let activeTagFilter = '';
  let bulkMode = false;
  const bulkSelected = new Set();
  let sidebarCollapsed = false;

  return {
    esc: vi.fn((s) => (s == null ? '' : String(s))),
    userKey: vi.fn((k) => 'user1_' + k),
    findTask: vi.fn(() => null),
    getData: vi.fn(() => ({ tasks: [], projects: [] })),
    getRender: vi.fn(() => vi.fn()),
    $: vi.fn((sel) => document.querySelector(sel)),
    getActiveTagFilter: vi.fn(() => activeTagFilter),
    setActiveTagFilter: vi.fn((v) => {
      activeTagFilter = v;
    }),
    getBulkMode: vi.fn(() => bulkMode),
    setBulkMode: vi.fn((v) => {
      bulkMode = v;
    }),
    getBulkSelected: vi.fn(() => bulkSelected),
    getSidebarCollapsed: vi.fn(() => sidebarCollapsed),
    setSidebarCollapsed: vi.fn((v) => {
      sidebarCollapsed = v;
    }),
    ...overrides,
  };
}

describe('ui-helpers.js — createUIHelpers()', () => {
  let helpers;
  let deps;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="ariaLive" aria-live="polite"></div>';
    localStorage.clear();
    deps = makeDeps();
    helpers = createUIHelpers(deps);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Factory returns ─────────────────────────────────────────────
  it('returns all expected functions', () => {
    const keys = [
      'showToast',
      'renderSubtaskProgress',
      'getTagColor',
      'getAllTags',
      'renderTagChips',
      'filterByTag',
      'renderTagPicker',
      'addTagToPicker',
      'toggleBulkMode',
      'renderBulkBar',
      'attachBulkListeners',
      'smartDateInput',
      'previewSmartDate',
      'resolveSmartDate',
      'isBlocked',
      'renderBlockedBy',
      'renderBlocking',
      'parseProjectBackground',
      'requestNotificationPermission',
      'notifyOverdueTasks',
      '_dismissProactiveBanner',
      'getProactiveResults',
      'setProactiveResults',
      'toggleSidebar',
      'throttleAI',
    ];
    keys.forEach((k) => expect(typeof helpers[k]).toBe('function'));
  });

  // ================================================================
  // TOAST
  // ================================================================
  describe('showToast', () => {
    it('creates a toast element and appends it to body', () => {
      helpers.showToast('Hello');
      const toast = document.querySelector('.toast');
      expect(toast).not.toBeNull();
      expect(toast.textContent).toBe('Hello');
      expect(toast.getAttribute('role')).toBe('status');
    });

    it('adds error class when isError is true', () => {
      helpers.showToast('Oops', true);
      const toast = document.querySelector('.toast');
      expect(toast.classList.contains('error')).toBe(true);
    });

    it('adds success class when isSuccess is true', () => {
      helpers.showToast('Done', false, true);
      const toast = document.querySelector('.toast');
      expect(toast.classList.contains('success')).toBe(true);
    });

    it('removes existing non-undo toasts before creating new one', () => {
      helpers.showToast('First');
      helpers.showToast('Second');
      const toasts = document.querySelectorAll('.toast');
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toBe('Second');
    });

    it('does not remove toast-undo elements', () => {
      const undo = document.createElement('div');
      undo.className = 'toast toast-undo';
      undo.textContent = 'Undo';
      document.body.appendChild(undo);
      helpers.showToast('New toast');
      expect(document.querySelector('.toast-undo')).not.toBeNull();
    });

    it('sets ariaLive text', () => {
      helpers.showToast('Accessible');
      expect(document.getElementById('ariaLive').textContent).toBe('Accessible');
    });

    it('removes toast after timeout', () => {
      helpers.showToast('Temp');
      expect(document.querySelector('.toast')).not.toBeNull();
      vi.advanceTimersByTime(2700);
      expect(document.querySelector('.toast.leaving')).not.toBeNull();
      vi.advanceTimersByTime(300);
      expect(document.querySelector('.toast')).toBeNull();
    });
  });

  // ================================================================
  // TOGGLE SIDEBAR
  // ================================================================
  describe('toggleSidebar', () => {
    it('toggles sidebar collapsed state', () => {
      let collapsed = false;
      deps.getSidebarCollapsed = vi.fn(() => collapsed);
      deps.setSidebarCollapsed = vi.fn((v) => {
        collapsed = v;
      });
      helpers = createUIHelpers(deps);

      helpers.toggleSidebar();
      expect(deps.setSidebarCollapsed).toHaveBeenCalledWith(true);
    });

    it('stores collapsed state in localStorage', () => {
      let collapsed = false;
      deps.getSidebarCollapsed = vi.fn(() => collapsed);
      deps.setSidebarCollapsed = vi.fn((v) => {
        collapsed = v;
      });
      helpers = createUIHelpers(deps);

      helpers.toggleSidebar();
      expect(localStorage.getItem('user1_wb_sidebar_collapsed')).toBe('true');
    });

    it('toggles collapsed class on sidebar element', () => {
      const sidebar = document.createElement('div');
      sidebar.id = 'sidebar';
      document.body.appendChild(sidebar);

      let collapsed = false;
      deps.getSidebarCollapsed = vi.fn(() => collapsed);
      deps.setSidebarCollapsed = vi.fn((v) => {
        collapsed = v;
      });
      deps.$ = vi.fn((sel) => document.querySelector(sel));
      helpers = createUIHelpers(deps);

      helpers.toggleSidebar();
      expect(sidebar.classList.contains('collapsed')).toBe(true);
    });
  });

  // ================================================================
  // THROTTLE AI
  // ================================================================
  describe('throttleAI', () => {
    it('allows the first call', () => {
      expect(helpers.throttleAI('test-key')).toBe(true);
    });

    it('blocks a second call within cooldown', () => {
      helpers.throttleAI('test-key');
      expect(helpers.throttleAI('test-key')).toBe(false);
    });

    it('allows call after cooldown expires', () => {
      helpers.throttleAI('test-key', 1000);
      vi.advanceTimersByTime(1001);
      expect(helpers.throttleAI('test-key', 1000)).toBe(true);
    });

    it('tracks different keys independently', () => {
      helpers.throttleAI('key-a');
      expect(helpers.throttleAI('key-b')).toBe(true);
    });
  });

  // ================================================================
  // SUBTASK PROGRESS
  // ================================================================
  describe('renderSubtaskProgress', () => {
    it('renders progress bar with correct fraction', () => {
      const html = helpers.renderSubtaskProgress([{ done: true }, { done: false }, { done: true }]);
      expect(html).toContain('2/3');
      expect(html).toContain('width:67%');
    });

    it('adds complete class when all done', () => {
      const html = helpers.renderSubtaskProgress([{ done: true }, { done: true }]);
      expect(html).toContain('complete');
      expect(html).toContain('2/2');
    });

    it('does not add complete class when not all done', () => {
      const html = helpers.renderSubtaskProgress([{ done: true }, { done: false }]);
      expect(html).not.toContain(' complete');
    });

    it('renders 0% when none done', () => {
      const html = helpers.renderSubtaskProgress([{ done: false }, { done: false }]);
      expect(html).toContain('0/2');
      expect(html).toContain('width:0%');
    });
  });

  // ================================================================
  // TAG SYSTEM
  // ================================================================
  describe('getTagColor', () => {
    it('returns an object with bg and color', () => {
      const c = helpers.getTagColor('work');
      expect(c).toHaveProperty('bg');
      expect(c).toHaveProperty('color');
    });

    it('returns consistent color for same tag', () => {
      const c1 = helpers.getTagColor('feature');
      const c2 = helpers.getTagColor('feature');
      expect(c1).toEqual(c2);
    });

    it('different tags can map to different colors', () => {
      // Not guaranteed, but with enough variety one pair will differ
      const colors = new Set();
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'zz'].forEach((t) => {
        colors.add(JSON.stringify(helpers.getTagColor(t)));
      });
      expect(colors.size).toBeGreaterThan(1);
    });
  });

  describe('getAllTags', () => {
    it('returns empty array when no tasks have tags', () => {
      deps.getData.mockReturnValue({ tasks: [{ id: '1' }], projects: [] });
      expect(helpers.getAllTags()).toEqual([]);
    });

    it('returns sorted unique tags from all tasks', () => {
      deps.getData.mockReturnValue({
        tasks: [
          { id: '1', tags: ['beta', 'alpha'] },
          { id: '2', tags: ['alpha', 'gamma'] },
        ],
        projects: [],
      });
      expect(helpers.getAllTags()).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('renderTagChips', () => {
    it('returns empty string for null or empty tags', () => {
      expect(helpers.renderTagChips(null)).toBe('');
      expect(helpers.renderTagChips([])).toBe('');
    });

    it('renders tag chips with correct structure', () => {
      const html = helpers.renderTagChips(['bug', 'feature']);
      expect(html).toContain('class="tag tag-label tag-filter-btn"');
      expect(html).toContain('data-tag="bug"');
      expect(html).toContain('data-tag="feature"');
    });

    it('uses esc for tag names', () => {
      helpers.renderTagChips(['xss']);
      expect(deps.esc).toHaveBeenCalledWith('xss');
    });
  });

  describe('filterByTag', () => {
    it('sets the tag filter and triggers render', () => {
      let activeTag = '';
      deps.getActiveTagFilter = vi.fn(() => activeTag);
      deps.setActiveTagFilter = vi.fn((v) => {
        activeTag = v;
      });
      const renderFn = vi.fn();
      deps.getRender = vi.fn(() => renderFn);
      helpers = createUIHelpers(deps);

      helpers.filterByTag('work');
      expect(deps.setActiveTagFilter).toHaveBeenCalledWith('work');
      expect(renderFn).toHaveBeenCalled();
    });

    it('clears filter when same tag is selected again', () => {
      let activeTag = 'work';
      deps.getActiveTagFilter = vi.fn(() => activeTag);
      deps.setActiveTagFilter = vi.fn((v) => {
        activeTag = v;
      });
      const renderFn = vi.fn();
      deps.getRender = vi.fn(() => renderFn);
      helpers = createUIHelpers(deps);

      helpers.filterByTag('work');
      expect(deps.setActiveTagFilter).toHaveBeenCalledWith('');
    });
  });

  describe('renderTagPicker', () => {
    it('renders all tags with selection state', () => {
      deps.getData.mockReturnValue({
        tasks: [{ id: '1', tags: ['alpha', 'beta'] }],
        projects: [],
      });
      helpers = createUIHelpers(deps);
      const html = helpers.renderTagPicker(['alpha']);
      expect(html).toContain('selected');
      expect(html).toContain('data-tag="alpha"');
      expect(html).toContain('data-tag="beta"');
      expect(html).toContain('tag-add-input');
    });

    it('renders add-tag input', () => {
      deps.getData.mockReturnValue({ tasks: [], projects: [] });
      const html = helpers.renderTagPicker([]);
      expect(html).toContain('class="tag-add-input"');
      expect(html).toContain('placeholder="+ new tag"');
    });
  });

  // ================================================================
  // BULK MODE
  // ================================================================
  describe('toggleBulkMode', () => {
    it('toggles bulk mode and clears selection', () => {
      let mode = false;
      const selected = new Set(['t1']);
      deps.getBulkMode = vi.fn(() => mode);
      deps.setBulkMode = vi.fn((v) => {
        mode = v;
      });
      deps.getBulkSelected = vi.fn(() => selected);
      const renderFn = vi.fn();
      deps.getRender = vi.fn(() => renderFn);
      helpers = createUIHelpers(deps);

      helpers.toggleBulkMode();
      expect(deps.setBulkMode).toHaveBeenCalledWith(true);
      expect(selected.size).toBe(0);
      expect(renderFn).toHaveBeenCalled();
    });
  });

  describe('renderBulkBar', () => {
    it('does nothing when bulk mode is off', () => {
      deps.getBulkMode = vi.fn(() => false);
      deps.getBulkSelected = vi.fn(() => new Set());
      helpers = createUIHelpers(deps);
      helpers.renderBulkBar();
      expect(document.getElementById('bulkBar')).toBeNull();
    });

    it('does nothing when nothing selected', () => {
      deps.getBulkMode = vi.fn(() => true);
      deps.getBulkSelected = vi.fn(() => new Set());
      helpers = createUIHelpers(deps);
      helpers.renderBulkBar();
      expect(document.getElementById('bulkBar')).toBeNull();
    });

    it('renders bulk bar when selections exist', () => {
      deps.getBulkMode = vi.fn(() => true);
      deps.getBulkSelected = vi.fn(() => new Set(['t1', 't2']));
      deps.getData = vi.fn(() => ({
        tasks: [],
        projects: [{ id: 'p1', name: 'Project A' }],
      }));
      helpers = createUIHelpers(deps);
      helpers.renderBulkBar();
      const bar = document.getElementById('bulkBar');
      expect(bar).not.toBeNull();
      expect(bar.textContent).toContain('2 selected');
      expect(bar.innerHTML).toContain('Project A');
    });

    it('removes existing bulk bar before re-rendering', () => {
      const existing = document.createElement('div');
      existing.id = 'bulkBar';
      document.body.appendChild(existing);

      deps.getBulkMode = vi.fn(() => true);
      deps.getBulkSelected = vi.fn(() => new Set(['t1']));
      deps.getData = vi.fn(() => ({ tasks: [], projects: [] }));
      helpers = createUIHelpers(deps);

      helpers.renderBulkBar();
      expect(document.querySelectorAll('#bulkBar').length).toBe(1);
    });
  });

  describe('attachBulkListeners', () => {
    it('does nothing when bulk mode is off', () => {
      deps.getBulkMode = vi.fn(() => false);
      helpers = createUIHelpers(deps);

      const el = document.createElement('div');
      el.dataset.bulk = 't1';
      document.body.appendChild(el);

      helpers.attachBulkListeners();
      // No click listener should be attached — onclick remains null
      expect(el.onclick).toBeNull();
    });

    it('attaches click listeners to data-bulk elements', () => {
      const selected = new Set();
      deps.getBulkMode = vi.fn(() => true);
      deps.getBulkSelected = vi.fn(() => selected);
      const renderFn = vi.fn();
      deps.getRender = vi.fn(() => renderFn);
      helpers = createUIHelpers(deps);

      const el = document.createElement('div');
      el.dataset.bulk = 't1';
      document.body.appendChild(el);

      helpers.attachBulkListeners();
      el.onclick({ stopPropagation: vi.fn() });

      expect(selected.has('t1')).toBe(true);
      expect(renderFn).toHaveBeenCalled();
    });

    it('toggles selection on repeated clicks', () => {
      const selected = new Set();
      deps.getBulkMode = vi.fn(() => true);
      deps.getBulkSelected = vi.fn(() => selected);
      deps.getRender = vi.fn(() => vi.fn());
      helpers = createUIHelpers(deps);

      const el = document.createElement('div');
      el.dataset.bulk = 't1';
      document.body.appendChild(el);

      helpers.attachBulkListeners();
      el.onclick({ stopPropagation: vi.fn() });
      expect(selected.has('t1')).toBe(true);
      el.onclick({ stopPropagation: vi.fn() });
      expect(selected.has('t1')).toBe(false);
    });
  });

  // ================================================================
  // SMART DATE INPUT
  // ================================================================
  describe('smartDateInput', () => {
    it('returns a text input on non-mobile (default in jsdom)', () => {
      const html = helpers.smartDateInput('dueDate', '2026-03-20');
      expect(html).toContain('type="text"');
      expect(html).toContain('id="dueDate"');
      expect(html).toContain('value="2026-03-20"');
      expect(html).toContain('smart-date-preview');
    });

    it('handles empty value', () => {
      const html = helpers.smartDateInput('dueDate', '');
      expect(html).toContain('value=""');
    });

    it('handles null value', () => {
      const html = helpers.smartDateInput('dueDate', null);
      expect(html).toContain('value=""');
    });
  });

  describe('previewSmartDate', () => {
    it('does nothing if elements not found', () => {
      // Should not throw
      helpers.previewSmartDate('nonexistent');
    });

    it('clears preview when input is empty', () => {
      document.body.innerHTML += `
        <input id="testDate" value="">
        <div id="testDate_preview" style="display:block">old</div>
      `;
      helpers.previewSmartDate('testDate');
      const prev = document.getElementById('testDate_preview');
      expect(prev.innerHTML).toBe('');
      expect(prev.style.display).toBe('none');
    });

    it('shows formatted date for ISO date input', () => {
      document.body.innerHTML += `
        <input id="testDate" value="2026-03-20">
        <div id="testDate_preview"></div>
      `;
      helpers.previewSmartDate('testDate');
      const prev = document.getElementById('testDate_preview');
      expect(prev.style.display).toBe('block');
      expect(prev.innerHTML).toContain('color:var(--green)');
    });

    it('uses parseNaturalDate for non-ISO input', () => {
      parseNaturalDate.mockReturnValue({ dueDate: '2026-03-21' });
      document.body.innerHTML += `
        <input id="testDate" value="tomorrow">
        <div id="testDate_preview"></div>
      `;
      helpers.previewSmartDate('testDate');
      expect(parseNaturalDate).toHaveBeenCalledWith('tomorrow');
      const prev = document.getElementById('testDate_preview');
      expect(prev.style.display).toBe('block');
    });

    it('hides preview when parseNaturalDate returns no date', () => {
      parseNaturalDate.mockReturnValue({ dueDate: '' });
      document.body.innerHTML += `
        <input id="testDate" value="gibberish">
        <div id="testDate_preview"></div>
      `;
      helpers.previewSmartDate('testDate');
      const prev = document.getElementById('testDate_preview');
      expect(prev.innerHTML).toBe('');
      expect(prev.style.display).toBe('none');
    });
  });

  describe('resolveSmartDate', () => {
    it('returns empty string when element not found', () => {
      expect(helpers.resolveSmartDate('nonexistent')).toBe('');
    });

    it('returns empty string for empty input', () => {
      document.body.innerHTML += '<input id="testDate" value="">';
      expect(helpers.resolveSmartDate('testDate')).toBe('');
    });

    it('returns ISO date string as-is', () => {
      document.body.innerHTML += '<input id="testDate" value="2026-03-20">';
      expect(helpers.resolveSmartDate('testDate')).toBe('2026-03-20');
    });

    it('parses natural language dates', () => {
      parseNaturalDate.mockReturnValue({ dueDate: '2026-03-21' });
      document.body.innerHTML += '<input id="testDate" value="tomorrow">';
      expect(helpers.resolveSmartDate('testDate')).toBe('2026-03-21');
    });

    it('returns empty string when natural date parse fails', () => {
      parseNaturalDate.mockReturnValue({ dueDate: '' });
      document.body.innerHTML += '<input id="testDate" value="not a date">';
      expect(helpers.resolveSmartDate('testDate')).toBe('');
    });
  });

  // ================================================================
  // TASK DEPENDENCIES
  // ================================================================
  describe('isBlocked', () => {
    it('returns false if no blockedBy', () => {
      expect(helpers.isBlocked({ id: 't1' })).toBe(false);
      expect(helpers.isBlocked({ id: 't1', blockedBy: [] })).toBe(false);
    });

    it('returns true when a blocker is not done', () => {
      deps.findTask = vi.fn((id) => {
        if (id === 't2') return { id: 't2', status: 'todo' };
        return null;
      });
      helpers = createUIHelpers(deps);
      expect(helpers.isBlocked({ id: 't1', blockedBy: ['t2'] })).toBe(true);
    });

    it('returns false when all blockers are done', () => {
      deps.findTask = vi.fn((id) => {
        if (id === 't2') return { id: 't2', status: 'done' };
        return null;
      });
      helpers = createUIHelpers(deps);
      expect(helpers.isBlocked({ id: 't1', blockedBy: ['t2'] })).toBe(false);
    });

    it('returns false when blocker task is not found', () => {
      deps.findTask = vi.fn(() => null);
      helpers = createUIHelpers(deps);
      expect(helpers.isBlocked({ id: 't1', blockedBy: ['t_gone'] })).toBe(false);
    });
  });

  describe('renderBlockedBy', () => {
    it('returns empty string when no blockedBy', () => {
      expect(helpers.renderBlockedBy({ id: 't1' })).toBe('');
      expect(helpers.renderBlockedBy({ id: 't1', blockedBy: [] })).toBe('');
    });

    it('returns empty string when blockers not found', () => {
      deps.findTask = vi.fn(() => null);
      helpers = createUIHelpers(deps);
      expect(helpers.renderBlockedBy({ id: 't1', blockedBy: ['t_gone'] })).toBe('');
    });

    it('renders blocker tasks with status indicators', () => {
      deps.findTask = vi.fn((id) => {
        if (id === 't2') return { id: 't2', title: 'Setup DB', status: 'todo' };
        if (id === 't3') return { id: 't3', title: 'Write tests', status: 'done' };
        return null;
      });
      helpers = createUIHelpers(deps);
      const html = helpers.renderBlockedBy({ id: 't1', blockedBy: ['t2', 't3'] });
      expect(html).toContain('BLOCKED BY');
      expect(html).toContain('Setup DB');
      expect(html).toContain('Write tests');
      expect(html).toContain('data-action="remove-dep"');
      expect(html).toContain('line-through');
    });
  });

  describe('renderBlocking', () => {
    it('returns empty string when task blocks nothing', () => {
      deps.getData = vi.fn(() => ({
        tasks: [{ id: 't2', status: 'todo' }],
        projects: [],
      }));
      helpers = createUIHelpers(deps);
      expect(helpers.renderBlocking({ id: 't1' })).toBe('');
    });

    it('renders tasks that are blocked by the given task', () => {
      deps.getData = vi.fn(() => ({
        tasks: [
          { id: 't2', title: 'Deploy', status: 'todo', blockedBy: ['t1'] },
          { id: 't3', title: 'Done task', status: 'done', blockedBy: ['t1'] },
        ],
        projects: [],
      }));
      helpers = createUIHelpers(deps);
      const html = helpers.renderBlocking({ id: 't1' });
      expect(html).toContain('Blocking:');
      expect(html).toContain('Deploy');
      // Done tasks should not appear
      expect(html).not.toContain('Done task');
    });
  });

  // ================================================================
  // PROJECT BACKGROUND
  // ================================================================
  describe('parseProjectBackground', () => {
    it('returns null for falsy input', () => {
      expect(helpers.parseProjectBackground(null)).toBeNull();
      expect(helpers.parseProjectBackground('')).toBeNull();
    });

    it('puts plain text into notes when no headers', () => {
      const result = helpers.parseProjectBackground('Just some notes here.');
      expect(result.notes).toBe('Just some notes here.');
      expect(result.origin).toBe('');
      expect(result.direction).toBe('');
    });

    it('parses structured sections with ## headers', () => {
      const bg = `## Origin
Started as a prototype.
## Direction
Building towards MVP.
## Roadblocks
Need more funding.
## Next Steps
Hire a designer.
## Notes
Keep it lean.`;
      const result = helpers.parseProjectBackground(bg);
      expect(result.origin).toBe('Started as a prototype.');
      expect(result.direction).toBe('Building towards MVP.');
      expect(result.roadblocks).toBe('Need more funding.');
      expect(result.nextSteps).toBe('Hire a designer.');
      expect(result.notes).toBe('Keep it lean.');
    });

    it('recognizes alternative header names', () => {
      const bg = `## Where it started
From scratch.
## Where it's going
To the moon.
## Blockers
None yet.
## Next
Ship it.
## Other
Misc.`;
      const result = helpers.parseProjectBackground(bg);
      expect(result.origin).toBe('From scratch.');
      expect(result.direction).toBe('To the moon.');
      expect(result.roadblocks).toBe('None yet.');
      expect(result.nextSteps).toBe('Ship it.');
      expect(result.notes).toBe('Misc.');
    });

    it('handles multiline sections', () => {
      const bg = `## Origin
Line 1.
Line 2.
Line 3.`;
      const result = helpers.parseProjectBackground(bg);
      expect(result.origin).toBe('Line 1.\nLine 2.\nLine 3.');
    });
  });

  // ================================================================
  // NOTIFICATIONS
  // ================================================================
  describe('requestNotificationPermission', () => {
    it('does nothing when Notification API not available', () => {
      const orig = window.Notification;
      delete window.Notification;
      helpers.requestNotificationPermission();
      // Should not throw
      expect(localStorage.getItem('user1_wb_notif_asked')).toBeNull();
      window.Notification = orig;
    });

    it('requests permission and marks as asked', () => {
      window.Notification = { requestPermission: vi.fn() };
      helpers.requestNotificationPermission();
      expect(localStorage.getItem('user1_wb_notif_asked')).toBe('1');
      expect(window.Notification.requestPermission).toHaveBeenCalled();
    });

    it('does not request again if already asked', () => {
      window.Notification = { requestPermission: vi.fn() };
      localStorage.setItem('user1_wb_notif_asked', '1');
      helpers.requestNotificationPermission();
      expect(window.Notification.requestPermission).not.toHaveBeenCalled();
    });
  });

  describe('notifyOverdueTasks', () => {
    it('does nothing when Notification API not available', () => {
      const orig = window.Notification;
      delete window.Notification;
      // Should not throw
      helpers.notifyOverdueTasks();
      window.Notification = orig;
    });

    it('does nothing when permission not granted', () => {
      window.Notification = vi.fn();
      window.Notification.permission = 'denied';
      helpers.notifyOverdueTasks();
      expect(window.Notification).not.toHaveBeenCalled();
    });

    it('does nothing when no overdue tasks', () => {
      window.Notification = vi.fn();
      window.Notification.permission = 'granted';
      deps.getData = vi.fn(() => ({
        tasks: [{ id: 't1', status: 'todo', dueDate: '2026-03-20' }],
        projects: [],
      }));
      helpers = createUIHelpers(deps);
      helpers.notifyOverdueTasks();
      expect(window.Notification).not.toHaveBeenCalled();
    });

    it('creates notification for overdue tasks', () => {
      const mockNotif = { onclick: null, close: vi.fn() };
      window.Notification = vi.fn(() => mockNotif);
      window.Notification.permission = 'granted';
      todayStr.mockReturnValue('2026-03-15');
      deps.getData = vi.fn(() => ({
        tasks: [{ id: 't1', title: 'Overdue task', status: 'todo', dueDate: '2026-03-10' }],
        projects: [],
      }));
      helpers = createUIHelpers(deps);
      helpers.notifyOverdueTasks();
      expect(window.Notification).toHaveBeenCalledWith(
        'You have 1 overdue task',
        expect.objectContaining({ body: 'Overdue task' }),
      );
    });

    it('shows pluralized message for multiple overdue tasks', () => {
      const mockNotif = { onclick: null };
      window.Notification = vi.fn(() => mockNotif);
      window.Notification.permission = 'granted';
      todayStr.mockReturnValue('2026-03-15');
      deps.getData = vi.fn(() => ({
        tasks: [
          { id: 't1', title: 'Task A', status: 'todo', dueDate: '2026-03-10' },
          { id: 't2', title: 'Task B', status: 'todo', dueDate: '2026-03-12' },
        ],
        projects: [],
      }));
      helpers = createUIHelpers(deps);
      helpers.notifyOverdueTasks();
      expect(window.Notification).toHaveBeenCalledWith('You have 2 overdue tasks', expect.any(Object));
    });

    it('skips done and archived tasks', () => {
      const mockNotif = { onclick: null };
      window.Notification = vi.fn(() => mockNotif);
      window.Notification.permission = 'granted';
      todayStr.mockReturnValue('2026-03-15');
      deps.getData = vi.fn(() => ({
        tasks: [
          { id: 't1', title: 'Done', status: 'done', dueDate: '2026-03-01' },
          { id: 't2', title: 'Archived', status: 'todo', archived: true, dueDate: '2026-03-01' },
        ],
        projects: [],
      }));
      helpers = createUIHelpers(deps);
      helpers.notifyOverdueTasks();
      expect(window.Notification).not.toHaveBeenCalled();
    });

    it('truncates body with ellipsis for >3 overdue tasks', () => {
      const mockNotif = { onclick: null };
      window.Notification = vi.fn(() => mockNotif);
      window.Notification.permission = 'granted';
      todayStr.mockReturnValue('2026-03-15');
      deps.getData = vi.fn(() => ({
        tasks: [
          { id: 't1', title: 'A', status: 'todo', dueDate: '2026-03-01' },
          { id: 't2', title: 'B', status: 'todo', dueDate: '2026-03-01' },
          { id: 't3', title: 'C', status: 'todo', dueDate: '2026-03-01' },
          { id: 't4', title: 'D', status: 'todo', dueDate: '2026-03-01' },
        ],
        projects: [],
      }));
      helpers = createUIHelpers(deps);
      helpers.notifyOverdueTasks();
      expect(window.Notification).toHaveBeenCalledWith(
        'You have 4 overdue tasks',
        expect.objectContaining({ body: expect.stringContaining('...') }),
      );
    });
  });

  // ================================================================
  // PROACTIVE BANNER
  // ================================================================
  describe('_dismissProactiveBanner', () => {
    it('clears proactive results and triggers render', () => {
      const renderFn = vi.fn();
      deps.getRender = vi.fn(() => renderFn);
      helpers = createUIHelpers(deps);

      helpers.setProactiveResults({ some: 'data' });
      expect(helpers.getProactiveResults()).toEqual({ some: 'data' });

      helpers._dismissProactiveBanner();
      expect(helpers.getProactiveResults()).toBeNull();
      expect(renderFn).toHaveBeenCalled();
    });
  });

  // ================================================================
  // PROACTIVE RESULTS GETTER/SETTER
  // ================================================================
  describe('getProactiveResults / setProactiveResults', () => {
    it('starts as null', () => {
      expect(helpers.getProactiveResults()).toBeNull();
    });

    it('can set and get proactive results', () => {
      helpers.setProactiveResults({ nudges: [] });
      expect(helpers.getProactiveResults()).toEqual({ nudges: [] });
    });
  });

  // ================================================================
  // addTagToPicker
  // ================================================================
  describe('addTagToPicker', () => {
    it('does nothing for empty input', () => {
      const picker = document.createElement('div');
      picker.className = 'tag-picker';
      const input = document.createElement('input');
      input.value = '   ';
      picker.appendChild(input);
      document.body.appendChild(picker);

      helpers.addTagToPicker(input);
      // No chip created
      expect(picker.querySelectorAll('.tag-chip').length).toBe(0);
    });

    it('creates a new selected chip and clears input', () => {
      const picker = document.createElement('div');
      picker.className = 'tag-picker';
      const input = document.createElement('input');
      input.value = 'NewTag';
      picker.appendChild(input);
      document.body.appendChild(picker);

      helpers.addTagToPicker(input);
      const chip = picker.querySelector('.tag-chip');
      expect(chip).not.toBeNull();
      expect(chip.classList.contains('selected')).toBe(true);
      expect(chip.textContent).toBe('newtag');
      expect(input.value).toBe('');
    });

    it('selects existing chip instead of creating duplicate', () => {
      const picker = document.createElement('div');
      picker.className = 'tag-picker';

      const existing = document.createElement('span');
      existing.dataset.tag = 'mytag';
      existing.className = 'tag-chip';
      picker.appendChild(existing);

      const input = document.createElement('input');
      input.value = 'MyTag';
      picker.appendChild(input);
      document.body.appendChild(picker);

      helpers.addTagToPicker(input);
      expect(existing.classList.contains('selected')).toBe(true);
      expect(input.value).toBe('');
      // No new chip created
      expect(picker.querySelectorAll('.tag-chip').length).toBe(1);
    });

    it('strips special characters and truncates to 20 chars', () => {
      const picker = document.createElement('div');
      picker.className = 'tag-picker';
      const input = document.createElement('input');
      input.value = 'a!@#b$%^c&*(d)_+=e12345678901234567890';
      picker.appendChild(input);
      document.body.appendChild(picker);

      helpers.addTagToPicker(input);
      const chip = picker.querySelector('.tag-chip');
      expect(chip.textContent.length).toBeLessThanOrEqual(20);
      expect(chip.textContent).not.toMatch(/[^a-z0-9\s-]/);
    });
  });
});
