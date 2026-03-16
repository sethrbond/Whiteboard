import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNotifications } from '../notifications.js';

// Mock Notification API
class MockNotification {
  static permission = 'default';
  static requestPermission = vi.fn(async () => MockNotification.permission);

  constructor(title, options = {}) {
    this.title = title;
    this.body = options.body;
    this.icon = options.icon;
    this.tag = options.tag;
    this.onclick = null;
    MockNotification._lastInstance = this;
    MockNotification._instances.push(this);
  }
  close() {
    this._closed = true;
  }
}
MockNotification._instances = [];
MockNotification._lastInstance = null;

function makeDeps(overrides = {}) {
  return {
    getData: vi.fn(() => ({
      tasks: [
        { id: 't1', title: 'Buy groceries', status: 'todo', dueDate: '2026-03-16' },
        { id: 't2', title: 'Write report', status: 'in-progress', dueDate: '2026-03-17' },
        { id: 't3', title: 'Done task', status: 'done', dueDate: '2026-03-15', completedAt: '2026-03-15T10:00:00Z' },
        { id: 't4', title: 'No date task', status: 'todo' },
        { id: 't5', title: 'Archived task', status: 'todo', archived: true, dueDate: '2026-03-16' },
      ],
      projects: [],
    })),
    userKey: vi.fn((k) => 'test_user_' + k),
    showToast: vi.fn(),
    findTask: vi.fn((id) => {
      const tasks = {
        t1: { id: 't1', title: 'Buy groceries' },
        t2: { id: 't2', title: 'Write report' },
      };
      return tasks[id] || null;
    }),
    ...overrides,
  };
}

describe('notifications.js -- createNotifications()', () => {
  let notif;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    // Set up Notification mock
    MockNotification.permission = 'default';
    MockNotification.requestPermission = vi.fn(async () => MockNotification.permission);
    MockNotification._instances = [];
    MockNotification._lastInstance = null;
    globalThis.Notification = MockNotification;

    deps = makeDeps();
    notif = createNotifications(deps);
  });

  afterEach(() => {
    notif.clearScheduled();
    vi.useRealTimers();
    delete globalThis.Notification;
  });

  // -- Factory returns all expected functions ----------------------------
  it('returns all expected functions', () => {
    const keys = [
      'init',
      'scheduleNotifications',
      'sendNotification',
      'clearScheduled',
      'requestPermission',
      'getPrefs',
      'savePrefs',
      'renderNotificationSettings',
      'isSupported',
    ];
    keys.forEach((k) => expect(typeof notif[k]).toBe('function'));
  });

  // -- isSupported -------------------------------------------------------
  it('isSupported returns true when Notification exists', () => {
    expect(notif.isSupported()).toBe(true);
  });

  it('isSupported returns false when Notification is undefined', () => {
    delete globalThis.Notification;
    const n = createNotifications(deps);
    expect(n.isSupported()).toBe(false);
  });

  // -- init --------------------------------------------------------------
  it('init sets permission state from Notification.permission', () => {
    MockNotification.permission = 'granted';
    const n = createNotifications(deps);
    n.init();
    expect(n._getPermissionState()).toBe('granted');
  });

  it('init is idempotent -- second call is a no-op', () => {
    MockNotification.permission = 'granted';
    notif.init();
    MockNotification.permission = 'denied';
    notif.init();
    expect(notif._getPermissionState()).toBe('granted');
  });

  // -- requestPermission -------------------------------------------------
  it('requestPermission returns granted when already granted', async () => {
    MockNotification.permission = 'granted';
    const result = await notif.requestPermission();
    expect(result).toBe('granted');
    expect(notif._getPermissionState()).toBe('granted');
  });

  it('requestPermission shows toast when denied', async () => {
    MockNotification.permission = 'denied';
    const result = await notif.requestPermission();
    expect(result).toBe('denied');
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('blocked'), true);
  });

  it('requestPermission calls Notification.requestPermission when default', async () => {
    MockNotification.permission = 'default';
    MockNotification.requestPermission = vi.fn(async () => {
      MockNotification.permission = 'granted';
      return 'granted';
    });
    const result = await notif.requestPermission();
    expect(result).toBe('granted');
    expect(MockNotification.requestPermission).toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith('Notifications enabled');
  });

  it('requestPermission handles denied response from prompt', async () => {
    MockNotification.permission = 'default';
    MockNotification.requestPermission = vi.fn(async () => {
      MockNotification.permission = 'denied';
      return 'denied';
    });
    const result = await notif.requestPermission();
    expect(result).toBe('denied');
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('re-enable'), true);
  });

  it('requestPermission returns denied when not supported', async () => {
    delete globalThis.Notification;
    const n = createNotifications(deps);
    const result = await n.requestPermission();
    expect(result).toBe('denied');
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('not supported'), true);
  });

  // -- getPrefs / savePrefs ----------------------------------------------
  it('getPrefs returns defaults when nothing saved', () => {
    const prefs = notif.getPrefs();
    expect(prefs.enabled).toBe(false);
    expect(prefs.dueSoon).toBe(true);
    expect(prefs.overdue).toBe(true);
    expect(prefs.dailyBriefing).toBe(true);
  });

  it('savePrefs persists and getPrefs retrieves', () => {
    notif.savePrefs({ enabled: true, dueSoon: false, overdue: true, dailyBriefing: false });
    const prefs = notif.getPrefs();
    expect(prefs.enabled).toBe(true);
    expect(prefs.dueSoon).toBe(false);
    expect(prefs.dailyBriefing).toBe(false);
  });

  it('getPrefs merges saved with defaults for missing keys', () => {
    localStorage.setItem('test_user_wb_notification_prefs', JSON.stringify({ enabled: true }));
    const prefs = notif.getPrefs();
    expect(prefs.enabled).toBe(true);
    expect(prefs.dueSoon).toBe(true); // default
  });

  it('getPrefs returns defaults on corrupt JSON', () => {
    localStorage.setItem('test_user_wb_notification_prefs', 'not-json');
    const prefs = notif.getPrefs();
    expect(prefs.enabled).toBe(false);
  });

  // -- sendNotification --------------------------------------------------
  it('sendNotification creates a Notification when permission is granted', () => {
    notif._setPermissionState('granted');
    const n = notif.sendNotification('Test', 'Body', { tag: 'test-1' });
    expect(n).not.toBeNull();
    expect(n.title).toBe('Test');
    expect(n.body).toBe('Body');
  });

  it('sendNotification returns null when permission is not granted', () => {
    notif._setPermissionState('denied');
    const n = notif.sendNotification('Test', 'Body');
    expect(n).toBeNull();
  });

  it('sendNotification prevents duplicates by tag', () => {
    notif._setPermissionState('granted');
    const n1 = notif.sendNotification('Test', 'Body', { tag: 'dup-tag' });
    const n2 = notif.sendNotification('Test', 'Body', { tag: 'dup-tag' });
    expect(n1).not.toBeNull();
    expect(n2).toBeNull();
  });

  it('sendNotification uses title as default tag', () => {
    notif._setPermissionState('granted');
    notif.sendNotification('Title Tag', 'Body');
    expect(notif._getNotifiedTags().has('Title Tag')).toBe(true);
  });

  it('sendNotification sets default icon', () => {
    notif._setPermissionState('granted');
    const n = notif.sendNotification('Test', 'Body', { tag: 'icon-test' });
    expect(n.icon).toBe('/icon-192.png');
  });

  it('sendNotification onclick focuses window and closes', () => {
    notif._setPermissionState('granted');
    const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {});
    const n = notif.sendNotification('Test', 'Body', { tag: 'click-test', taskId: 't1' });
    n.onclick();
    expect(focusSpy).toHaveBeenCalled();
    expect(n._closed).toBe(true);
    focusSpy.mockRestore();
  });

  it('sendNotification auto-closes after 10 seconds', () => {
    notif._setPermissionState('granted');
    const n = notif.sendNotification('Test', 'Body', { tag: 'auto-close' });
    expect(n._closed).toBeUndefined();
    vi.advanceTimersByTime(10000);
    expect(n._closed).toBe(true);
  });

  // -- clearScheduled ----------------------------------------------------
  it('clearScheduled clears all timers and notified tags', () => {
    notif._setPermissionState('granted');
    notif.sendNotification('Test', 'Body', { tag: 'clear-tag' });
    expect(notif._getNotifiedTags().size).toBe(1);
    notif.clearScheduled();
    expect(notif._getNotifiedTags().size).toBe(0);
    expect(notif._getScheduledTimers().length).toBe(0);
  });

  // -- scheduleNotifications ---------------------------------------------
  it('scheduleNotifications does nothing when not granted', () => {
    notif._setPermissionState('default');
    notif.savePrefs({ enabled: true, dueSoon: true, overdue: true, dailyBriefing: true });
    notif.scheduleNotifications();
    expect(notif._getScheduledTimers().length).toBe(0);
  });

  it('scheduleNotifications does nothing when not enabled', () => {
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: false, dueSoon: true, overdue: true, dailyBriefing: true });
    notif.scheduleNotifications();
    expect(notif._getScheduledTimers().length).toBe(0);
  });

  it('scheduleNotifications creates timers when enabled and granted', () => {
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: true, overdue: true, dailyBriefing: true });
    // Set time to ensure some tasks are near their due date
    vi.setSystemTime(new Date('2026-03-16T23:50:00'));
    notif.scheduleNotifications();
    // Should have at least some scheduled timers (due-soon for t1 and daily briefing)
    expect(notif._getScheduledTimers().length).toBeGreaterThan(0);
  });

  it('scheduleNotifications clears previous timers before rescheduling', () => {
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: true, overdue: true, dailyBriefing: true });
    vi.setSystemTime(new Date('2026-03-16T23:50:00'));
    notif.scheduleNotifications();
    const firstCount = notif._getScheduledTimers().length;
    notif.scheduleNotifications();
    // After rescheduling, should have the same count (cleared and re-added)
    expect(notif._getScheduledTimers().length).toBe(firstCount);
  });

  it('scheduleNotifications skips archived tasks', () => {
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: true, overdue: false, dailyBriefing: false });
    // Set time so that t5 (archived, due 2026-03-16) would trigger if not archived
    vi.setSystemTime(new Date('2026-03-16T23:50:00'));
    notif.scheduleNotifications();
    // Advance all timers
    vi.runAllTimers();
    // Check that only non-archived tasks triggered notifications
    const tags = [...notif._getNotifiedTags()];
    const archivedTags = tags.filter((t) => t.includes('t5'));
    expect(archivedTags.length).toBe(0);
  });

  it('scheduleNotifications skips done tasks', () => {
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: true, overdue: true, dailyBriefing: false });
    vi.setSystemTime(new Date('2026-03-15T23:50:00'));
    notif.scheduleNotifications();
    vi.runAllTimers();
    const tags = [...notif._getNotifiedTags()];
    const doneTags = tags.filter((t) => t.includes('t3'));
    expect(doneTags.length).toBe(0);
  });

  it('scheduleNotifications fires overdue notification for just-overdue task', () => {
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: false, overdue: true, dailyBriefing: false });
    // t1 is due 2026-03-16, end of day is 23:59:59
    // Set time to just after it became overdue
    vi.setSystemTime(new Date('2026-03-17T00:00:10'));
    notif.scheduleNotifications();
    vi.runAllTimers();
    const tags = [...notif._getNotifiedTags()];
    expect(tags.some((t) => t.includes('overdue') && t.includes('t1'))).toBe(true);
  });

  it('scheduleNotifications fires due-soon for task due within 15 minutes', () => {
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: true, overdue: false, dailyBriefing: false });
    // t1 is due 2026-03-16T23:59:59, set time to 23:50 (9 minutes before)
    vi.setSystemTime(new Date('2026-03-16T23:50:00'));
    notif.scheduleNotifications();
    vi.runAllTimers();
    const tags = [...notif._getNotifiedTags()];
    expect(tags.some((t) => t.includes('due-15m') && t.includes('t1'))).toBe(true);
  });

  it('scheduleNotifications fires morning briefing at 9am', () => {
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: false, overdue: false, dailyBriefing: true });
    vi.setSystemTime(new Date('2026-03-16T08:00:00'));
    notif.scheduleNotifications();
    // Advance to 9am
    vi.advanceTimersByTime(60 * 60 * 1000);
    const tags = [...notif._getNotifiedTags()];
    expect(tags.some((t) => t === 'morning-briefing')).toBe(true);
  });

  it('scheduleNotifications fires EOD briefing at 5pm', () => {
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: false, overdue: false, dailyBriefing: true });
    vi.setSystemTime(new Date('2026-03-16T16:00:00'));
    notif.scheduleNotifications();
    // Advance to 5pm
    vi.advanceTimersByTime(60 * 60 * 1000);
    const tags = [...notif._getNotifiedTags()];
    expect(tags.some((t) => t === 'eod-briefing')).toBe(true);
  });

  it('scheduleNotifications does not schedule morning briefing if past 9am', () => {
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: false, overdue: false, dailyBriefing: true });
    vi.setSystemTime(new Date('2026-03-16T10:00:00'));
    notif.scheduleNotifications();
    vi.runAllTimers();
    const tags = [...notif._getNotifiedTags()];
    expect(tags.some((t) => t === 'morning-briefing')).toBe(false);
  });

  it('scheduleNotifications handles empty task list gracefully', () => {
    deps.getData.mockReturnValue({ tasks: [], projects: [] });
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: true, overdue: true, dailyBriefing: true });
    vi.setSystemTime(new Date('2026-03-16T08:00:00'));
    notif.scheduleNotifications();
    // No morning briefing for 0 tasks
    vi.runAllTimers();
    const tags = [...notif._getNotifiedTags()];
    expect(tags.some((t) => t === 'morning-briefing')).toBe(false);
  });

  it('scheduleNotifications handles null data gracefully', () => {
    deps.getData.mockReturnValue(null);
    notif._setPermissionState('granted');
    notif.savePrefs({ enabled: true, dueSoon: true, overdue: true, dailyBriefing: true });
    expect(() => notif.scheduleNotifications()).not.toThrow();
  });

  // -- renderNotificationSettings ----------------------------------------
  it('renderNotificationSettings returns HTML with toggle', () => {
    const html = notif.renderNotificationSettings();
    expect(html).toContain('Enable desktop notifications');
    expect(html).toContain('toggle-notif-enabled');
  });

  it('renderNotificationSettings shows sub-toggles when enabled', () => {
    notif.savePrefs({ enabled: true, dueSoon: true, overdue: true, dailyBriefing: true });
    const html = notif.renderNotificationSettings();
    expect(html).toContain('Due soon reminders');
    expect(html).toContain('Overdue alerts');
    expect(html).toContain('Daily briefing');
  });

  it('renderNotificationSettings hides sub-toggles when disabled', () => {
    notif.savePrefs({ enabled: false, dueSoon: true, overdue: true, dailyBriefing: true });
    const html = notif.renderNotificationSettings();
    expect(html).not.toContain('Due soon reminders');
  });

  it('renderNotificationSettings shows blocked message when denied', () => {
    MockNotification.permission = 'denied';
    notif._setPermissionState('denied');
    const html = notif.renderNotificationSettings();
    expect(html).toContain('blocked by your browser');
  });

  it('renderNotificationSettings shows not-supported message', () => {
    delete globalThis.Notification;
    const n = createNotifications(deps);
    const html = n.renderNotificationSettings();
    expect(html).toContain('not supported');
  });

  it('renderNotificationSettings checked state matches prefs', () => {
    notif.savePrefs({ enabled: true, dueSoon: false, overdue: true, dailyBriefing: false });
    const html = notif.renderNotificationSettings();
    expect(html).toContain('id="notifEnabled" checked');
    // dueSoon should not be checked
    expect(html).toContain('id="notifDueSoon" ');
    expect(html).not.toContain('id="notifDueSoon" checked');
    expect(html).toContain('id="notifOverdue" checked');
    expect(html).not.toContain('id="notifDailyBriefing" checked');
  });
});
