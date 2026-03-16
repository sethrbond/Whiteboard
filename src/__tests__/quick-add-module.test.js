import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createQuickAdd } from '../quick-add.js';

function makeDeps(overrides = {}) {
  return {
    $: vi.fn((sel) => document.querySelector(sel)),
    esc: vi.fn((s) => String(s ?? '')),
    fmtDate: vi.fn((d) => d || ''),
    todayStr: vi.fn(() => '2026-03-15'),
    localISO: vi.fn((d) => d.toISOString().slice(0, 10)),
    genId: vi.fn((prefix) => `${prefix}_test_1`),
    getData: vi.fn(() => ({ tasks: [], projects: [{ id: 'p1', name: 'Work' }] })),
    saveData: vi.fn(),
    render: vi.fn(),
    showToast: vi.fn(),
    showUndoToast: vi.fn(),
    closeModal: vi.fn(),
    confirmAction: vi.fn(async () => true),
    hasAI: vi.fn(() => false),
    callAI: vi.fn(async () => '{}'),
    findTask: vi.fn(() => null),
    findSimilarProject: vi.fn(() => null),
    updateTask: vi.fn(),
    addTask: vi.fn(),
    createTask: vi.fn((o) => ({ id: 't_new', status: 'todo', priority: 'normal', ...o })),
    pushUndo: vi.fn(),
    getLifeProjectId: vi.fn(() => 'p_life'),
    matchTask: vi.fn(() => null),
    matchProject: vi.fn(() => null),
    buildAIContext: vi.fn(() => 'context'),
    AI_PERSONA: 'Test AI persona',
    startFocus: vi.fn(),
    toggleChat: vi.fn(),
    sendChat: vi.fn(),
    setView: vi.fn(),
    planMyDay: vi.fn(),
    maybeProactiveEnhance: vi.fn(),
    autoClassifyTask: vi.fn(),
    getBulkSelected: vi.fn(() => new Set()),
    setBatchMode: vi.fn(),
    ...overrides,
  };
}

describe('quick-add.js — createQuickAdd()', () => {
  let qa;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
    qa = createQuickAdd(deps);
  });

  // ── Factory returns ───────────────────────────────────────────────
  it('returns all expected functions', () => {
    const keys = [
      'openQuickAdd',
      'submitQuickAdd',
      'previewQuickCapture',
      'quickAddToProject',
      'parseQuickInput',
      'handleSlashCommand',
      'aiEnhanceTask',
      'aiReorganize',
      'confirmAIAction',
      'bulkAction',
      'exportCalendar',
    ];
    keys.forEach((k) => expect(typeof qa[k]).toBe('function'));
  });

  // ── parseQuickInput ───────────────────────────────────────────────
  describe('parseQuickInput', () => {
    it('returns title from simple input', () => {
      const result = qa.parseQuickInput('Buy milk');
      expect(result.title).toBe('Buy milk');
      expect(result.priority).toBe('normal');
    });

    it('detects urgent priority with !!!', () => {
      const result = qa.parseQuickInput('Fix bug!!!');
      expect(result.priority).toBe('urgent');
      expect(result.title).not.toContain('!!!');
    });

    it('detects urgent priority with keyword', () => {
      const result = qa.parseQuickInput('Fix bug urgent');
      expect(result.priority).toBe('urgent');
    });

    it('detects important priority with !!', () => {
      const result = qa.parseQuickInput('Review PR!!');
      expect(result.priority).toBe('important');
      expect(result.title).not.toContain('!!');
    });

    it('detects important priority with keyword', () => {
      const result = qa.parseQuickInput('Review PR important');
      expect(result.priority).toBe('important');
    });

    it('strips single ! without setting priority above normal', () => {
      const result = qa.parseQuickInput('Do something!');
      expect(result.priority).toBe('normal');
      expect(result.title).not.toContain('!');
    });

    it('returns empty title for empty input', () => {
      const result = qa.parseQuickInput('');
      expect(result.title).toBe('');
    });

    it('detects project with # tag when findSimilarProject matches', () => {
      deps.findSimilarProject.mockReturnValue({ id: 'p1', name: 'Work' });
      qa = createQuickAdd(deps);
      const result = qa.parseQuickInput('Task #Work');
      expect(result.quickProject).toEqual({ id: 'p1', name: 'Work' });
      expect(result.title).not.toContain('#Work');
    });

    it('returns null quickProject when no # tag', () => {
      const result = qa.parseQuickInput('Plain task');
      expect(result.quickProject).toBeNull();
    });

    it('returns null quickProject when findSimilarProject returns null', () => {
      deps.findSimilarProject.mockReturnValue(null);
      qa = createQuickAdd(deps);
      const result = qa.parseQuickInput('Task #NonExistent');
      expect(result.quickProject).toBeNull();
    });

    it('handles trailing punctuation in title', () => {
      const result = qa.parseQuickInput('Call dentist.');
      expect(result.title).toBeTruthy();
      expect(typeof result.title).toBe('string');
    });
  });

  // ── handleSlashCommand ────────────────────────────────────────────
  describe('handleSlashCommand', () => {
    it('handles /done command when task is found', () => {
      const task = { id: 't1', title: 'Report' };
      deps.matchTask.mockReturnValue(task);
      qa = createQuickAdd(deps);

      const result = qa.handleSlashCommand('/done Report');
      expect(result).toBe(true);
      expect(deps.updateTask).toHaveBeenCalledWith('t1', { status: 'done' });
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Report'), false, true);
      expect(deps.render).toHaveBeenCalled();
    });

    it('handles /done command when no task is found', () => {
      deps.matchTask.mockReturnValue(null);
      qa = createQuickAdd(deps);

      const result = qa.handleSlashCommand('/done Nonexistent');
      expect(result).toBe(true);
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('No task matching'), true);
    });

    it('handles /urgent command when task is found', () => {
      const task = { id: 't1', title: 'Budget' };
      deps.matchTask.mockReturnValue(task);
      qa = createQuickAdd(deps);

      const result = qa.handleSlashCommand('/urgent Budget');
      expect(result).toBe(true);
      expect(deps.updateTask).toHaveBeenCalledWith('t1', { priority: 'urgent' });
    });

    it('handles /urgent command when no task is found', () => {
      deps.matchTask.mockReturnValue(null);
      qa = createQuickAdd(deps);

      const result = qa.handleSlashCommand('/urgent Nothing');
      expect(result).toBe(true);
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('No task matching'), true);
    });

    it('handles /focus command', () => {
      const result = qa.handleSlashCommand('/focus');
      expect(result).toBe(true);
      expect(deps.startFocus).toHaveBeenCalled();
    });

    it('handles /plan command', () => {
      const result = qa.handleSlashCommand('/plan');
      expect(result).toBe(true);
      expect(deps.planMyDay).toHaveBeenCalled();
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('plan'), false, true);
    });

    it('handles /brainstorm command', () => {
      const result = qa.handleSlashCommand('/brainstorm');
      expect(result).toBe(true);
      expect(deps.setView).toHaveBeenCalledWith('dump');
    });

    it('handles /dump as alias for brainstorm', () => {
      const result = qa.handleSlashCommand('/dump');
      expect(result).toBe(true);
      expect(deps.setView).toHaveBeenCalledWith('dump');
    });

    it('handles /review command', () => {
      const result = qa.handleSlashCommand('/review');
      expect(result).toBe(true);
      expect(deps.setView).toHaveBeenCalledWith('review');
    });

    it('handles /move command with valid task and project', () => {
      const task = { id: 't1', title: 'Budget' };
      const proj = { id: 'p1', name: 'Finance' };
      deps.matchTask.mockReturnValue(task);
      deps.matchProject.mockReturnValue(proj);
      qa = createQuickAdd(deps);

      const result = qa.handleSlashCommand('/move Budget to Finance');
      expect(result).toBe(true);
      expect(deps.updateTask).toHaveBeenCalledWith('t1', { project: 'p1' });
      expect(deps.render).toHaveBeenCalled();
    });

    it('handles /move with no matching task', () => {
      deps.matchTask.mockReturnValue(null);
      deps.matchProject.mockReturnValue({ id: 'p1', name: 'Work' });
      qa = createQuickAdd(deps);

      const result = qa.handleSlashCommand('/move Ghost to Work');
      expect(result).toBe(true);
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('No task matching'), true);
    });

    it('handles /move with no matching project', () => {
      deps.matchTask.mockReturnValue({ id: 't1', title: 'Task' });
      deps.matchProject.mockReturnValue(null);
      qa = createQuickAdd(deps);

      const result = qa.handleSlashCommand('/move Task to Nowhere');
      expect(result).toBe(true);
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('No board matching'), true);
    });

    it('handles /move with bad syntax (no "to")', () => {
      const result = qa.handleSlashCommand('/move stuff');
      expect(result).toBe(true);
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Usage'), true);
    });

    it('returns false for unknown commands', () => {
      const result = qa.handleSlashCommand('/unknown');
      expect(result).toBe(false);
    });

    it('handles /chat command', () => {
      const panel = document.createElement('div');
      panel.id = 'chatPanel';
      document.body.appendChild(panel);
      const input = document.createElement('textarea');
      input.id = 'chatInput';
      document.body.appendChild(input);

      const result = qa.handleSlashCommand('/chat hello world');
      expect(result).toBe(true);
      expect(deps.toggleChat).toHaveBeenCalled();
      expect(deps.sendChat).toHaveBeenCalled();

      panel.remove();
      input.remove();
    });
  });

  // ── handleSlashCommand edge cases ──────────────────────────────────
  describe('handleSlashCommand edge cases', () => {
    it('/done without arg returns false', () => {
      const result = qa.handleSlashCommand('/done');
      expect(result).toBe(false);
    });

    it('/urgent without arg returns false', () => {
      const result = qa.handleSlashCommand('/urgent');
      expect(result).toBe(false);
    });

    it('/chat without arg returns false', () => {
      const result = qa.handleSlashCommand('/chat');
      expect(result).toBe(false);
    });

    it('/brainstorm with arg sets text in dump textarea', () => {
      vi.useFakeTimers();
      const ta = document.createElement('textarea');
      ta.id = 'dumpText';
      document.body.appendChild(ta);

      const result = qa.handleSlashCommand('/brainstorm my ideas');
      expect(result).toBe(true);
      expect(deps.setView).toHaveBeenCalledWith('dump');
      vi.advanceTimersByTime(200);
      expect(ta.value).toBe('my ideas');

      ta.remove();
      vi.useRealTimers();
    });
  });

  // ── previewQuickCapture ───────────────────────────────────────────
  describe('previewQuickCapture', () => {
    let input;
    let preview;

    beforeEach(() => {
      input = document.createElement('input');
      input.id = 'quickCapture';
      document.body.appendChild(input);
      preview = document.createElement('div');
      preview.id = 'quickCapturePreview';
      document.body.appendChild(preview);
    });

    afterEach(() => {
      input.remove();
      preview.remove();
      const aiInd = document.getElementById('qcAiIndicator');
      if (aiInd) aiInd.remove();
    });

    it('hides preview when input is empty', () => {
      input.value = '';
      qa.previewQuickCapture();
      expect(preview.style.display).toBe('none');
    });

    it('shows slash command hints for / prefix', () => {
      input.value = '/do';
      qa.previewQuickCapture();
      expect(preview.style.display).toBe('block');
      expect(preview.innerHTML).toContain('/done');
    });

    it('shows unknown command hint for unrecognized slash command', () => {
      input.value = '/xyz';
      qa.previewQuickCapture();
      expect(preview.innerHTML).toContain('Unknown command');
    });

    it('does nothing when quickCapture element is missing', () => {
      input.remove();
      qa.previewQuickCapture(); // should not throw
    });
  });

  // ── quickAddToProject ─────────────────────────────────────────────
  describe('quickAddToProject', () => {
    it('creates task with parsed input and project id', () => {
      const inputEl = { value: 'New task' };
      qa.quickAddToProject(inputEl, 'p1');
      expect(deps.createTask).toHaveBeenCalledWith(expect.objectContaining({ project: 'p1' }));
      expect(deps.addTask).toHaveBeenCalled();
      expect(inputEl.value).toBe('');
      expect(deps.render).toHaveBeenCalled();
    });

    it('shows toast with task title', () => {
      const inputEl = { value: 'Task name' };
      qa.quickAddToProject(inputEl, 'p1');
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Task name'), false, true);
    });
  });

  // ── confirmAIAction ───────────────────────────────────────────────
  describe('confirmAIAction', () => {
    it('creates a toast with confirm and cancel buttons', async () => {
      vi.useFakeTimers();
      const _promise = qa.confirmAIAction('Apply changes?');
      const toast = document.querySelector('.toast.ai-confirm');
      expect(toast).toBeTruthy();
      expect(toast.textContent).toContain('Apply changes?');
      toast.querySelector('[data-action="confirm-yes"]').click();
      vi.useRealTimers();
    });

    it('auto-dismisses after timeout', async () => {
      vi.useFakeTimers();
      const promise = qa.confirmAIAction('Timeout test?');
      vi.advanceTimersByTime(11000);
      const result = await promise;
      expect(result).toBe(false);
      vi.useRealTimers();
    });

    it('resolves true when _dismiss is called with true', async () => {
      vi.useFakeTimers();
      const promise = qa.confirmAIAction('Proceed?');
      const toast = document.querySelector('.toast.ai-confirm');
      // _dismiss is the internal dismiss function attached to the toast
      toast._dismiss(true);
      vi.advanceTimersByTime(11000);
      vi.useRealTimers();
      const result = await promise;
      expect(result).toBe(true);
    });

    it('resolves false when _dismiss is called with false', async () => {
      vi.useFakeTimers();
      const promise = qa.confirmAIAction('Proceed?');
      const toast = document.querySelector('.toast.ai-confirm');
      toast._dismiss(false);
      vi.advanceTimersByTime(11000);
      vi.useRealTimers();
      const result = await promise;
      expect(result).toBe(false);
    });

    it('dismisses prior confirm toasts', () => {
      vi.useFakeTimers();
      qa.confirmAIAction('First?');
      const first = document.querySelector('.toast.ai-confirm');
      expect(first).toBeTruthy();
      qa.confirmAIAction('Second?');
      const toasts = document.querySelectorAll('.toast.ai-confirm');
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toContain('Second?');
      vi.advanceTimersByTime(11000);
      vi.useRealTimers();
    });
  });

  // ── bulkAction ────────────────────────────────────────────────────
  describe('bulkAction', () => {
    it('does nothing when no tasks selected', async () => {
      deps.getBulkSelected.mockReturnValue(new Set());
      qa = createQuickAdd(deps);
      await qa.bulkAction('done');
      expect(deps.updateTask).not.toHaveBeenCalled();
    });

    it('marks selected tasks as done', async () => {
      deps.getBulkSelected.mockReturnValue(new Set(['t1', 't2']));
      qa = createQuickAdd(deps);
      await qa.bulkAction('done');
      expect(deps.updateTask).toHaveBeenCalledTimes(2);
      expect(deps.updateTask).toHaveBeenCalledWith('t1', { status: 'done' });
      expect(deps.updateTask).toHaveBeenCalledWith('t2', { status: 'done' });
    });

    it('marks selected tasks as todo', async () => {
      deps.getBulkSelected.mockReturnValue(new Set(['t1']));
      qa = createQuickAdd(deps);
      await qa.bulkAction('todo');
      expect(deps.updateTask).toHaveBeenCalledWith('t1', { status: 'todo' });
    });

    it('moves selected tasks to a project', async () => {
      deps.getBulkSelected.mockReturnValue(new Set(['t1']));
      qa = createQuickAdd(deps);
      await qa.bulkAction('move', 'p2');
      expect(deps.updateTask).toHaveBeenCalledWith('t1', { project: 'p2' });
    });

    it('sets priority for selected tasks', async () => {
      deps.getBulkSelected.mockReturnValue(new Set(['t1']));
      qa = createQuickAdd(deps);
      await qa.bulkAction('priority', 'urgent');
      expect(deps.updateTask).toHaveBeenCalledWith('t1', { priority: 'urgent' });
    });

    it('deletes selected tasks after confirmation', async () => {
      const selected = new Set(['t1', 't2']);
      deps.getBulkSelected.mockReturnValue(selected);
      deps.getData.mockReturnValue({
        tasks: [
          { id: 't1', title: 'A' },
          { id: 't2', title: 'B' },
          { id: 't3', title: 'C' },
        ],
        projects: [],
      });
      qa = createQuickAdd(deps);
      await qa.bulkAction('delete');
      expect(deps.pushUndo).toHaveBeenCalledWith('Bulk delete');
      expect(deps.saveData).toHaveBeenCalled();
    });

    it('pushes undo before bulk action', async () => {
      deps.getBulkSelected.mockReturnValue(new Set(['t1']));
      qa = createQuickAdd(deps);
      await qa.bulkAction('done');
      expect(deps.pushUndo).toHaveBeenCalledWith('Bulk done');
    });

    it('clears selection and re-renders after action', async () => {
      const selected = new Set(['t1']);
      deps.getBulkSelected.mockReturnValue(selected);
      qa = createQuickAdd(deps);
      await qa.bulkAction('done');
      expect(selected.size).toBe(0);
      expect(deps.render).toHaveBeenCalled();
    });

    it('cancels delete when confirmAction returns false', async () => {
      deps.getBulkSelected.mockReturnValue(new Set(['t1']));
      deps.confirmAction.mockResolvedValue(false);
      deps.getData.mockReturnValue({ tasks: [{ id: 't1', title: 'A' }], projects: [] });
      qa = createQuickAdd(deps);
      await qa.bulkAction('delete');
      expect(deps.pushUndo).not.toHaveBeenCalled();
      expect(deps.saveData).not.toHaveBeenCalled();
    });

    it('cleans up blockedBy references on delete', async () => {
      const tasks = [
        { id: 't1', title: 'A' },
        { id: 't2', title: 'B', blockedBy: ['t1', 't3'] },
        { id: 't3', title: 'C', blockedBy: ['t1'] },
      ];
      deps.getBulkSelected.mockReturnValue(new Set(['t1']));
      deps.getData.mockReturnValue({ tasks, projects: [] });
      deps.confirmAction.mockResolvedValue(true);
      qa = createQuickAdd(deps);
      await qa.bulkAction('delete');
      const savedData = deps.saveData.mock.calls[0][0];
      const t2 = savedData.tasks.find((t) => t.id === 't2');
      expect(t2.blockedBy).toEqual(['t3']);
      const t3 = savedData.tasks.find((t) => t.id === 't3');
      expect(t3.blockedBy).toEqual([]);
    });

    it('handles unknown action by clearing selection without error', async () => {
      const selected = new Set(['t1']);
      deps.getBulkSelected.mockReturnValue(selected);
      qa = createQuickAdd(deps);
      await qa.bulkAction('nonsense');
      expect(deps.saveData).not.toHaveBeenCalled();
      expect(selected.size).toBe(0);
      expect(deps.render).toHaveBeenCalled();
    });
  });

  // ── exportCalendar ────────────────────────────────────────────────
  describe('exportCalendar', () => {
    it('shows toast when no tasks with due dates', () => {
      deps.getData.mockReturnValue({ tasks: [], projects: [] });
      qa = createQuickAdd(deps);
      qa.exportCalendar();
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('No tasks'), true);
    });

    it('exports tasks with due dates as ICS', () => {
      const origCreate = URL.createObjectURL;
      const origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();

      deps.getData.mockReturnValue({
        tasks: [
          {
            id: 't1',
            title: 'Due task',
            dueDate: '2026-03-20',
            status: 'todo',
            priority: 'urgent',
            project: 'p1',
            notes: '',
          },
          { id: 't2', title: 'Done task', dueDate: '2026-03-21', status: 'done', priority: 'normal', project: '' },
        ],
        projects: [{ id: 'p1', name: 'Work' }],
      });
      qa = createQuickAdd(deps);
      qa.exportCalendar();
      expect(URL.createObjectURL).toHaveBeenCalled();
      const blobArg = URL.createObjectURL.mock.calls[0][0];
      expect(blobArg).toBeInstanceOf(Blob);
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Exported 1'));

      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    });

    it('excludes done tasks from calendar export', () => {
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();

      deps.getData.mockReturnValue({
        tasks: [{ id: 't1', title: 'Done', dueDate: '2026-03-20', status: 'done', priority: 'normal', project: '' }],
        projects: [],
      });
      qa = createQuickAdd(deps);
      qa.exportCalendar();
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('No tasks'), true);
    });

    it('maps in-progress status to IN-PROCESS', () => {
      const origCreate = URL.createObjectURL;
      const origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();

      deps.getData.mockReturnValue({
        tasks: [
          {
            id: 't1',
            title: 'Active',
            dueDate: '2026-03-20',
            status: 'in-progress',
            priority: 'important',
            project: 'p1',
            notes: 'doing it',
          },
        ],
        projects: [{ id: 'p1', name: 'Work' }],
      });
      qa = createQuickAdd(deps);
      qa.exportCalendar();
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Exported 1'));

      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    });

    it('exports multiple tasks', () => {
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();

      deps.getData.mockReturnValue({
        tasks: [
          {
            id: 't1',
            title: 'Task1',
            dueDate: '2026-03-20',
            status: 'todo',
            priority: 'normal',
            project: 'p1',
            notes: '',
          },
          {
            id: 't2',
            title: 'Task2',
            dueDate: '2026-03-21',
            status: 'todo',
            priority: 'urgent',
            project: 'p1',
            notes: 'note',
          },
        ],
        projects: [{ id: 'p1', name: 'Work' }],
      });
      qa = createQuickAdd(deps);
      qa.exportCalendar();
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Exported 2'));
    });
  });

  // ── aiEnhanceTask ─────────────────────────────────────────────────
  describe('aiEnhanceTask', () => {
    it('does nothing when AI is not available', () => {
      deps.hasAI.mockReturnValue(false);
      qa = createQuickAdd(deps);
      qa.aiEnhanceTask('t1', 'some input');
      expect(deps.callAI).not.toHaveBeenCalled();
    });

    it('does nothing when task is not found', () => {
      deps.hasAI.mockReturnValue(true);
      deps.findTask.mockReturnValue(null);
      qa = createQuickAdd(deps);
      qa.aiEnhanceTask('t1', 'some input');
      expect(deps.callAI).not.toHaveBeenCalled();
    });

    it('calls AI when task exists and AI is available', () => {
      deps.hasAI.mockReturnValue(true);
      deps.findTask.mockReturnValue({ id: 't1', title: 'Email boss' });
      qa = createQuickAdd(deps);
      qa.aiEnhanceTask('t1', 'email boss about raise');
      expect(deps.callAI).toHaveBeenCalled();
    });

    it('applies notes and subtasks from successful AI response', async () => {
      const task = { id: 't1', title: 'Email boss' };
      deps.hasAI.mockReturnValue(true);
      deps.findTask.mockReturnValue(task);
      deps.callAI.mockResolvedValue(
        JSON.stringify({ notes: 'Draft talking points', subtasks: ['Open email', 'Write draft'] }),
      );
      qa = createQuickAdd(deps);
      qa.aiEnhanceTask('t1', 'email boss about raise');
      await vi.waitFor(() => expect(deps.saveData).toHaveBeenCalled());
      expect(task.notes).toBe('Draft talking points');
      expect(task.subtasks).toHaveLength(2);
      expect(task.subtasks[0]).toMatchObject({ title: 'Open email', done: false });
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('AI enhanced'), false, true);
    });

    it('handles malformed JSON gracefully', async () => {
      const task = { id: 't1', title: 'Task' };
      deps.hasAI.mockReturnValue(true);
      deps.findTask.mockReturnValue(task);
      deps.callAI.mockResolvedValue('not json at all');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      qa = createQuickAdd(deps);
      qa.aiEnhanceTask('t1', 'input');
      await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());
      expect(deps.saveData).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('handles AI rejection / callAI error', async () => {
      deps.hasAI.mockReturnValue(true);
      deps.findTask.mockReturnValue({ id: 't1', title: 'Task' });
      deps.callAI.mockRejectedValue(new Error('rate limited'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      qa = createQuickAdd(deps);
      qa.aiEnhanceTask('t1', 'input');
      await vi.waitFor(() =>
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('AI call failed'), expect.anything()),
      );
      warnSpy.mockRestore();
    });

    it('strips markdown code fences from AI response', async () => {
      const task = { id: 't1', title: 'Task' };
      deps.hasAI.mockReturnValue(true);
      deps.findTask.mockReturnValue(task);
      deps.callAI.mockResolvedValue('```json\n{"notes": "fenced notes", "subtasks": []}\n```');
      qa = createQuickAdd(deps);
      qa.aiEnhanceTask('t1', 'input');
      await vi.waitFor(() => expect(deps.saveData).toHaveBeenCalled());
      expect(task.notes).toBe('fenced notes');
    });

    it('does not overwrite existing notes or subtasks', async () => {
      const task = {
        id: 't1',
        title: 'Task',
        notes: 'existing',
        subtasks: [{ id: 's1', title: 'Existing', done: false }],
      };
      deps.hasAI.mockReturnValue(true);
      deps.findTask.mockReturnValue(task);
      deps.callAI.mockResolvedValue(JSON.stringify({ notes: 'new notes', subtasks: ['New step'] }));
      qa = createQuickAdd(deps);
      qa.aiEnhanceTask('t1', 'input');
      await new Promise((r) => setTimeout(r, 50));
      expect(task.notes).toBe('existing');
      expect(task.subtasks).toHaveLength(1);
      expect(task.subtasks[0].title).toBe('Existing');
    });
  });

  // ── aiReorganize ──────────────────────────────────────────────────
  describe('aiReorganize', () => {
    it('does nothing when AI is not available', async () => {
      deps.hasAI.mockReturnValue(false);
      qa = createQuickAdd(deps);
      await qa.aiReorganize();
      expect(deps.callAI).not.toHaveBeenCalled();
    });

    it('shows toast when no active tasks', async () => {
      deps.hasAI.mockReturnValue(true);
      deps.getData.mockReturnValue({
        tasks: [{ id: 't1', status: 'done', project: 'p1' }],
        projects: [{ id: 'p1', name: 'Work' }],
      });
      qa = createQuickAdd(deps);
      await qa.aiReorganize();
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('No active tasks'));
    });

    it('reorganizes with scope "all"', async () => {
      deps.hasAI.mockReturnValue(true);
      deps.getData.mockReturnValue({
        tasks: [{ id: 't1', title: 'Task', status: 'todo', priority: 'normal', project: 'p1' }],
        projects: [{ id: 'p1', name: 'Work' }],
      });
      deps.callAI.mockResolvedValue(
        JSON.stringify([{ id: 't1', changes: { priority: 'urgent' }, reason: 'deadline soon' }]),
      );
      deps.findTask.mockReturnValue({ id: 't1', title: 'Task', priority: 'normal', project: 'p1' });
      qa = createQuickAdd(deps);
      await qa.aiReorganize('all');
      expect(deps.pushUndo).toHaveBeenCalledWith('AI Reorganize');
      expect(deps.updateTask).toHaveBeenCalledWith('t1', { priority: 'urgent' });
      expect(deps.render).toHaveBeenCalled();
    });

    it('reorganizes with project scope', async () => {
      deps.hasAI.mockReturnValue(true);
      deps.getData.mockReturnValue({
        tasks: [
          { id: 't1', title: 'Task1', status: 'todo', priority: 'normal', project: 'p1' },
          { id: 't2', title: 'Task2', status: 'todo', priority: 'normal', project: 'p2' },
        ],
        projects: [
          { id: 'p1', name: 'Work' },
          { id: 'p2', name: 'Home' },
        ],
      });
      deps.callAI.mockResolvedValue(JSON.stringify([]));
      qa = createQuickAdd(deps);
      await qa.aiReorganize('p1');
      expect(deps.callAI).toHaveBeenCalled();
      const prompt = deps.callAI.mock.calls[0][0];
      expect(prompt).toContain('Task1');
    });

    it('applies project move changes', async () => {
      deps.hasAI.mockReturnValue(true);
      deps.getData.mockReturnValue({
        tasks: [{ id: 't1', title: 'Task', status: 'todo', priority: 'normal', project: 'p1' }],
        projects: [
          { id: 'p1', name: 'Work' },
          { id: 'p2', name: 'Home' },
        ],
      });
      deps.callAI.mockResolvedValue(
        JSON.stringify([{ id: 't1', changes: { project: 'Home' }, reason: 'personal task' }]),
      );
      deps.findTask.mockReturnValue({ id: 't1', title: 'Task', priority: 'normal', project: 'p1' });
      deps.matchProject.mockReturnValue({ id: 'p2', name: 'Home' });
      qa = createQuickAdd(deps);
      await qa.aiReorganize('all');
      expect(deps.updateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ project: 'p2' }));
    });

    it('appends notes instead of replacing', async () => {
      deps.hasAI.mockReturnValue(true);
      deps.getData.mockReturnValue({
        tasks: [{ id: 't1', title: 'Task', status: 'todo', priority: 'normal', project: 'p1', notes: 'original' }],
        projects: [{ id: 'p1', name: 'Work' }],
      });
      deps.callAI.mockResolvedValue(
        JSON.stringify([{ id: 't1', changes: { notes: 'extra context' }, reason: 'helpful' }]),
      );
      deps.findTask.mockReturnValue({ id: 't1', title: 'Task', priority: 'normal', project: 'p1', notes: 'original' });
      qa = createQuickAdd(deps);
      await qa.aiReorganize('all');
      expect(deps.updateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ notes: 'original\nextra context' }));
    });

    it('handles AI error gracefully', async () => {
      deps.hasAI.mockReturnValue(true);
      deps.getData.mockReturnValue({
        tasks: [{ id: 't1', title: 'Task', status: 'todo', priority: 'normal', project: 'p1' }],
        projects: [{ id: 'p1', name: 'Work' }],
      });
      deps.callAI.mockRejectedValue(new Error('network error'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      qa = createQuickAdd(deps);
      await qa.aiReorganize('all');
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('failed'), true);
      errorSpy.mockRestore();
    });

    it('shows "no reorganization needed" when AI returns non-array', async () => {
      deps.hasAI.mockReturnValue(true);
      deps.getData.mockReturnValue({
        tasks: [{ id: 't1', title: 'Task', status: 'todo', priority: 'normal', project: 'p1' }],
        projects: [{ id: 'p1', name: 'Work' }],
      });
      deps.callAI.mockResolvedValue('{}');
      qa = createQuickAdd(deps);
      await qa.aiReorganize('all');
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('No reorganization'));
    });
  });

  // ── submitQuickAdd ────────────────────────────────────────────────
  describe('submitQuickAdd', () => {
    function setupQuickAddDOM(value, projectId) {
      const inp = document.createElement('input');
      inp.id = 'quickAddInput';
      inp.value = value;
      document.body.appendChild(inp);
      if (projectId) {
        const sel = document.createElement('select');
        sel.id = 'quickAddProject';
        const opt = document.createElement('option');
        opt.value = projectId;
        opt.selected = true;
        sel.appendChild(opt);
        document.body.appendChild(sel);
      }
      return inp;
    }

    afterEach(() => {
      const inp = document.getElementById('quickAddInput');
      if (inp) inp.remove();
      const sel = document.getElementById('quickAddProject');
      if (sel) sel.remove();
    });

    it('does nothing when input is empty', () => {
      setupQuickAddDOM('');
      qa.submitQuickAdd();
      expect(deps.addTask).not.toHaveBeenCalled();
    });

    it('does nothing when input element is missing', () => {
      deps.$.mockReturnValue(null);
      qa = createQuickAdd(deps);
      qa.submitQuickAdd();
      expect(deps.addTask).not.toHaveBeenCalled();
    });

    it('delegates slash commands and closes modal', () => {
      setupQuickAddDOM('/focus');
      qa.submitQuickAdd();
      expect(deps.closeModal).toHaveBeenCalled();
      expect(deps.startFocus).toHaveBeenCalled();
    });

    it('shows unknown command toast for unrecognized slash command', () => {
      setupQuickAddDOM('/unknown');
      qa.submitQuickAdd();
      expect(deps.closeModal).toHaveBeenCalled();
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Commands'), true);
    });

    it('does not add task when title is empty after parsing', () => {
      setupQuickAddDOM('   ');
      qa.submitQuickAdd();
      expect(deps.addTask).not.toHaveBeenCalled();
    });

    it('triggers autoClassify for default project with AI', () => {
      deps.hasAI.mockReturnValue(true);
      deps.getData.mockReturnValue({
        tasks: [],
        projects: [
          { id: 'p_life', name: 'Life' },
          { id: 'p2', name: 'Work' },
        ],
      });
      deps.getLifeProjectId.mockReturnValue('p_life');
      qa = createQuickAdd(deps);
      setupQuickAddDOM('Buy milk', 'p_life');
      qa.submitQuickAdd();
      expect(deps.autoClassifyTask).toHaveBeenCalled();
    });

    it('adds a normal task and shows toast', () => {
      setupQuickAddDOM('Buy groceries', 'p1');
      qa.submitQuickAdd();
      expect(deps.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Buy groceries', project: 'p1' }));
      expect(deps.addTask).toHaveBeenCalled();
      expect(deps.closeModal).toHaveBeenCalled();
      expect(deps.render).toHaveBeenCalled();
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Buy groceries'), false, true);
    });
  });
});
