import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDataLayer } from '../data.js';

let idCounter = 0;
vi.mock('../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    genId: (prefix = 't') => `${prefix}_${++idCounter}`,
  };
});

vi.mock('../dates.js', () => ({
  todayStr: () => '2026-03-16',
}));

vi.mock('../migrations.js', () => ({
  CURRENT_SCHEMA_VERSION: 1,
  migrateData: (d) => d,
}));

function makeDeps(overrides = {}) {
  return {
    userKey: vi.fn((k) => `user1_${k}`),
    getCurrentUser: vi.fn(() => ({ id: 'u1' })),
    getScheduleSyncToCloud: vi.fn(() => vi.fn()),
    getShowToast: vi.fn(() => vi.fn()),
    getRender: vi.fn(() => vi.fn()),
    getMaybeReflect: vi.fn(() => null),
    getMaybeLearnPattern: vi.fn(() => null),
    getSuppressCloudSync: vi.fn(() => false),
    getBatchMode: vi.fn(() => false),
    getActiveTagFilter: vi.fn(() => null),
    getNudgeFilter: vi.fn(() => null),
    getPruneStaleMemories: vi.fn(() => null),
    getExpandedTask: vi.fn(() => null),
    setExpandedTask: vi.fn(),
    esc: vi.fn((s) => String(s ?? '')),
    confirmAction: vi.fn(async () => true),
    ...overrides,
  };
}

describe('Persistent Undo', () => {
  let deps;

  beforeEach(() => {
    localStorage.clear();
    idCounter = 0;
    deps = makeDeps();
  });

  it('persists last 3 undo snapshots to localStorage after pushUndo', () => {
    const dl = createDataLayer(deps);
    dl.pushUndo('action 1');
    dl.pushUndo('action 2');
    dl.pushUndo('action 3');
    dl.pushUndo('action 4');

    const key = 'wb_undo_user1_undo';
    const stored = JSON.parse(localStorage.getItem(key));
    expect(stored).toHaveLength(3);
    expect(stored[0].label).toBe('action 2');
    expect(stored[1].label).toBe('action 3');
    expect(stored[2].label).toBe('action 4');
  });

  it('restores undo stack from localStorage on loadData', () => {
    // First data layer to seed storage
    const storeKey = 'user1_taskboard_data';
    const undoKey = 'wb_undo_user1_undo';
    const taskData = { tasks: [{ id: 't1', title: 'Test', status: 'todo' }], projects: [], _schemaVersion: 1 };
    localStorage.setItem(storeKey, JSON.stringify(taskData));

    const snapshots = [
      { label: 'undo A', snapshot: JSON.stringify(taskData) },
      { label: 'undo B', snapshot: JSON.stringify(taskData) },
    ];
    localStorage.setItem(undoKey, JSON.stringify(snapshots));

    const dl = createDataLayer(deps);
    const stack = dl.getUndoStack();
    expect(stack).toHaveLength(2);
    expect(stack[0].label).toBe('undo A');
    expect(stack[1].label).toBe('undo B');
  });

  it('clearUndoStack removes localStorage entry', () => {
    const dl = createDataLayer(deps);
    dl.pushUndo('something');
    const key = 'wb_undo_user1_undo';
    expect(localStorage.getItem(key)).not.toBeNull();

    dl.clearUndoStack();
    expect(dl.getUndoStack()).toHaveLength(0);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('undo re-persists the stack after popping', () => {
    const dl = createDataLayer(deps);
    dl.pushUndo('first');
    dl.pushUndo('second');
    dl.pushUndo('third');

    const key = 'wb_undo_user1_undo';
    let stored = JSON.parse(localStorage.getItem(key));
    expect(stored).toHaveLength(3);

    dl.undo();
    stored = JSON.parse(localStorage.getItem(key));
    expect(stored).toHaveLength(2);
    expect(stored[0].label).toBe('first');
    expect(stored[1].label).toBe('second');
  });

  it('does not restore undo stack if localStorage data is corrupted', () => {
    const storeKey = 'user1_taskboard_data';
    const undoKey = 'wb_undo_user1_undo';
    const taskData = { tasks: [{ id: 't1', title: 'X', status: 'todo' }], projects: [], _schemaVersion: 1 };
    localStorage.setItem(storeKey, JSON.stringify(taskData));
    localStorage.setItem(undoKey, 'not valid json{{{');

    const dl = createDataLayer(deps);
    expect(dl.getUndoStack()).toHaveLength(0);
  });

  it('skips undo entries with missing label or snapshot', () => {
    const storeKey = 'user1_taskboard_data';
    const undoKey = 'wb_undo_user1_undo';
    const taskData = { tasks: [{ id: 't1', title: 'X', status: 'todo' }], projects: [], _schemaVersion: 1 };
    localStorage.setItem(storeKey, JSON.stringify(taskData));
    localStorage.setItem(
      undoKey,
      JSON.stringify([
        { label: 'good', snapshot: '{}' },
        { label: '', snapshot: '{}' },
        { snapshot: '{}' },
        { label: 'also good', snapshot: '{}' },
      ]),
    );

    const dl = createDataLayer(deps);
    const stack = dl.getUndoStack();
    expect(stack).toHaveLength(2);
    expect(stack[0].label).toBe('good');
    expect(stack[1].label).toBe('also good');
  });
});

describe('Corruption Recovery', () => {
  let deps;

  beforeEach(() => {
    localStorage.clear();
    idCounter = 0;
    deps = makeDeps();
  });

  it('shows corruption banner when main data is corrupted but backup exists', () => {
    vi.useFakeTimers();
    const storeKey = 'user1_taskboard_data';
    const backupKey = storeKey + '_backup';
    localStorage.setItem(storeKey, 'this is not valid JSON!!!');
    const backup = { tasks: [{ id: 't1', title: 'Backup Task', status: 'todo' }], projects: [], _schemaVersion: 1 };
    localStorage.setItem(backupKey, JSON.stringify(backup));

    const dl = createDataLayer(deps);
    // Data should be empty (corruption fallback)
    expect(dl.getData().tasks).toHaveLength(0);

    // Banner should appear after setTimeout
    vi.runAllTimers();
    const banner = document.getElementById('corruptionBanner');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Data may be corrupted');
    expect(banner.querySelector('[data-action="restore-backup"]')).not.toBeNull();
    expect(banner.querySelector('[data-action="start-fresh"]')).not.toBeNull();

    banner.remove();
    vi.useRealTimers();
  });

  it('does not show banner when data is corrupted but no backup exists', () => {
    vi.useFakeTimers();
    const storeKey = 'user1_taskboard_data';
    localStorage.setItem(storeKey, 'corrupted data');

    createDataLayer(deps);
    vi.runAllTimers();
    expect(document.getElementById('corruptionBanner')).toBeNull();
    vi.useRealTimers();
  });

  it('restoreFromBackup recovers data from backup key', () => {
    vi.useFakeTimers();
    const storeKey = 'user1_taskboard_data';
    const backupKey = storeKey + '_backup';
    localStorage.setItem(storeKey, '{{invalid}}');
    const backup = { tasks: [{ id: 't1', title: 'Restored', status: 'todo' }], projects: [], _schemaVersion: 1 };
    localStorage.setItem(backupKey, JSON.stringify(backup));

    const renderFn = vi.fn();
    const toastFn = vi.fn();
    deps.getRender = vi.fn(() => renderFn);
    deps.getShowToast = vi.fn(() => toastFn);

    const dl = createDataLayer(deps);
    vi.runAllTimers();

    dl.restoreFromBackup();
    expect(dl.getData().tasks).toHaveLength(1);
    expect(dl.getData().tasks[0].title).toBe('Restored');
    expect(toastFn).toHaveBeenCalledWith('Data restored from backup');
    expect(renderFn).toHaveBeenCalled();
    // Banner should be removed
    expect(document.getElementById('corruptionBanner')).toBeNull();
    vi.useRealTimers();
  });

  it('dismissCorruption clears data and backup, starts fresh', () => {
    vi.useFakeTimers();
    const storeKey = 'user1_taskboard_data';
    const backupKey = storeKey + '_backup';
    localStorage.setItem(storeKey, '{{invalid}}');
    localStorage.setItem(
      backupKey,
      JSON.stringify({ tasks: [{ id: 't1', title: 'X', status: 'todo' }], projects: [] }),
    );

    const renderFn = vi.fn();
    const toastFn = vi.fn();
    deps.getRender = vi.fn(() => renderFn);
    deps.getShowToast = vi.fn(() => toastFn);

    const dl = createDataLayer(deps);
    vi.runAllTimers();

    dl.dismissCorruption();
    expect(dl.getData().tasks).toHaveLength(0);
    expect(localStorage.getItem(backupKey)).toBeNull();
    expect(toastFn).toHaveBeenCalledWith('Starting fresh');
    expect(renderFn).toHaveBeenCalled();
    expect(document.getElementById('corruptionBanner')).toBeNull();
    vi.useRealTimers();
  });

  it('restoreFromBackup falls back to dismissCorruption if backup is also corrupted', () => {
    vi.useFakeTimers();
    const storeKey = 'user1_taskboard_data';
    const backupKey = storeKey + '_backup';
    localStorage.setItem(storeKey, '{{invalid}}');
    localStorage.setItem(backupKey, '{{also invalid}}');

    const renderFn = vi.fn();
    const toastFn = vi.fn();
    deps.getRender = vi.fn(() => renderFn);
    deps.getShowToast = vi.fn(() => toastFn);

    const dl = createDataLayer(deps);
    vi.runAllTimers();

    dl.restoreFromBackup();
    // Should have fallen back to dismissCorruption
    expect(dl.getData().tasks).toHaveLength(0);
    expect(toastFn).toHaveBeenCalledWith('Backup is also corrupted — starting fresh', true);
    vi.useRealTimers();
  });
});
