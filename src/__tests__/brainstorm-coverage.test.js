import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrainstorm } from '../brainstorm.js';

function makeDeps(overrides = {}) {
  return {
    userKey: vi.fn((k) => 'user1_' + k),
    render: vi.fn(),
    showToast: vi.fn(),
    hasAI: vi.fn(() => false),
    callAI: vi.fn(async () => ''),
    getAIEndpoint: vi.fn(() => ({ url: 'https://test.api/v1', headers: {} })),
    getData: vi.fn(() => ({ tasks: [], projects: [] })),
    getSettings: vi.fn(() => ({ apiKey: '', aiModel: 'claude-haiku-4-5-20251001' })),
    findTask: vi.fn(() => null),
    findSimilarTask: vi.fn(() => null),
    findSimilarProject: vi.fn(() => null),
    createTask: vi.fn((t) => ({ id: 't_new', ...t })),
    addTask: vi.fn(),
    updateTask: vi.fn(),
    createProject: vi.fn((p) => ({ id: 'p_new', ...p })),
    addProject: vi.fn(),
    updateProject: vi.fn(),
    getLifeProjectId: vi.fn(() => 'p_life'),
    pushUndo: vi.fn(),
    undo: vi.fn(),
    closeModal: vi.fn(),
    genId: vi.fn((prefix) => (prefix || 't') + '_gen'),
    normalizeTitle: vi.fn((s) =>
      (s || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    ),
    $: vi.fn((sel) => document.querySelector(sel)),
    ...overrides,
  };
}

describe('brainstorm.js — additional coverage', () => {
  let bs;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
    bs = createBrainstorm(deps);
  });

  // ── handleDumpFiles with legacy .doc files ──────────────────────
  describe('handleDumpFiles with legacy .doc files', () => {
    it('shows error toast for legacy .doc files', async () => {
      const docFile = new File(['content'], 'report.doc', { type: 'application/msword' });

      await bs.handleDumpFiles([docFile]);
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not process'), true);
    });

    it('does not add legacy .doc file to attachments', async () => {
      const docFile = new File(['content'], 'report.doc', { type: 'application/msword' });

      await bs.handleDumpFiles([docFile]);
      const html = bs.renderDump();
      expect(html).not.toContain('report.doc');
    });
  });

  // ── initDumpDropZone drop event ─────────────────────────────────
  describe('initDumpDropZone drop event', () => {
    it('handles drop event with files', async () => {
      const ta = document.createElement('textarea');
      ta.id = 'dumpText';
      const overlay = document.createElement('div');
      overlay.id = 'dumpDropOverlay';
      overlay.style.display = 'flex';
      const area = document.createElement('div');
      area.className = 'dump-area';
      area.appendChild(ta);
      area.appendChild(overlay);
      document.body.appendChild(area);

      bs.initDumpDropZone();

      // Create a drop event with a text file
      const file = new File(['drop test content here'], 'dropped.txt', { type: 'text/plain' });
      const dropEvent = new Event('drop', { bubbles: true });
      dropEvent.preventDefault = vi.fn();
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { files: [file] },
      });

      area.dispatchEvent(dropEvent);

      // Wait for async handleDumpFiles to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(overlay.style.display).toBe('none');
      expect(deps.showToast).toHaveBeenCalledWith('Attached dropped.txt');

      area.remove();
    });

    it('handles drop event without files gracefully', async () => {
      const ta = document.createElement('textarea');
      ta.id = 'dumpText';
      const overlay = document.createElement('div');
      overlay.id = 'dumpDropOverlay';
      overlay.style.display = 'flex';
      const area = document.createElement('div');
      area.className = 'dump-area';
      area.appendChild(ta);
      area.appendChild(overlay);
      document.body.appendChild(area);

      bs.initDumpDropZone();

      const dropEvent = new Event('drop', { bubbles: true });
      dropEvent.preventDefault = vi.fn();
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { files: [] },
      });

      area.dispatchEvent(dropEvent);
      expect(overlay.style.display).toBe('none');

      area.remove();
    });
  });

  // ── applyDumpResults with existing project ──────────────────────
  describe('applyDumpResults — existing project update', () => {
    it('updates existing project description when current desc is too long', () => {
      deps.findSimilarProject.mockReturnValue({
        id: 'p_existing',
        name: 'Existing Proj',
        description: 'A'.repeat(100), // > 80 chars
      });

      window._dumpReviewData = {
        parsed: {
          tasks: [
            {
              action: 'create',
              title: 'Task A',
              suggestedProject: 'Existing Proj',
              priority: 'normal',
              status: 'todo',
            },
          ],
          projectUpdates: [{ name: 'Existing Proj', description: 'Short desc', background: '## Notes\nStuff' }],
          patterns: [],
        },
        inputText: 'task a',
      };

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.dumpCheck = '0';
      document.body.appendChild(cb);

      const ta = document.createElement('textarea');
      ta.id = 'dumpText';
      document.body.appendChild(ta);

      bs.applyDumpResults();

      expect(deps.updateProject).toHaveBeenCalledWith(
        'p_existing',
        expect.objectContaining({
          description: 'Short desc',
          background: '## Notes\nStuff',
        }),
      );
      expect(deps.createProject).not.toHaveBeenCalled();

      cb.remove();
      ta.remove();
    });
  });

  // ── applyDumpResults with estimatedMinutes ──────────────────────
  describe('applyDumpResults — estimatedMinutes', () => {
    it('passes estimatedMinutes to createTask', () => {
      window._dumpReviewData = {
        parsed: {
          tasks: [
            {
              action: 'create',
              title: 'Timed task',
              suggestedProject: '',
              priority: 'normal',
              status: 'todo',
              estimatedMinutes: 60,
            },
          ],
          projectUpdates: [],
          patterns: [],
        },
        inputText: 'timed task',
      };

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.dumpCheck = '0';
      document.body.appendChild(cb);

      const ta = document.createElement('textarea');
      ta.id = 'dumpText';
      document.body.appendChild(ta);

      bs.applyDumpResults();

      const createCall = deps.createTask.mock.calls[0][0];
      expect(createCall.estimatedMinutes).toBe(60);

      cb.remove();
      ta.remove();
    });

    it('updates estimatedMinutes on duplicate task when missing', () => {
      deps.findSimilarTask.mockReturnValue({
        id: 't_dup',
        title: 'Existing',
        status: 'todo',
        notes: '',
        estimatedMinutes: 0,
      });

      window._dumpReviewData = {
        parsed: {
          tasks: [
            {
              action: 'create',
              title: 'Existing task',
              suggestedProject: '',
              priority: 'normal',
              status: 'todo',
              estimatedMinutes: 45,
            },
          ],
          projectUpdates: [],
          patterns: [],
        },
        inputText: 'existing task',
      };

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.dumpCheck = '0';
      document.body.appendChild(cb);

      const ta = document.createElement('textarea');
      ta.id = 'dumpText';
      document.body.appendChild(ta);

      bs.applyDumpResults();

      expect(deps.updateTask).toHaveBeenCalledWith(
        't_dup',
        expect.objectContaining({
          estimatedMinutes: 45,
        }),
      );

      cb.remove();
      ta.remove();
    });
  });

  // ── applyDumpResults with explicit project creation ─────────────
  describe('applyDumpResults — explicit project creation via projectUpdates', () => {
    it('creates project when suggestedProject matches a projectUpdates entry name', () => {
      deps.findSimilarProject.mockReturnValue(null);

      window._dumpReviewData = {
        parsed: {
          tasks: [
            {
              action: 'create',
              title: 'Task for new board',
              suggestedProject: 'Brand New Board',
              priority: 'normal',
              status: 'todo',
            },
          ],
          projectUpdates: [{ name: 'Brand New Board', description: 'A brand new board', isNew: true }],
          patterns: [],
        },
        inputText: 'task for new board',
      };

      // normalizeTitle needs to work for the comparison
      deps.normalizeTitle.mockImplementation((s) =>
        (s || '')
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      );

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.dumpCheck = '0';
      document.body.appendChild(cb);

      const ta = document.createElement('textarea');
      ta.id = 'dumpText';
      document.body.appendChild(ta);

      bs.applyDumpResults();

      expect(deps.createProject).toHaveBeenCalled();
      expect(deps.addProject).toHaveBeenCalled();
      expect(deps.addTask).toHaveBeenCalled();

      cb.remove();
      ta.remove();
    });

    it('falls back to life project when suggestedProject has no matching projectUpdate and no similar project', () => {
      deps.findSimilarProject.mockReturnValue(null);

      window._dumpReviewData = {
        parsed: {
          tasks: [
            {
              action: 'create',
              title: 'Orphan task',
              suggestedProject: 'Random Board',
              priority: 'normal',
              status: 'todo',
            },
          ],
          projectUpdates: [],
          patterns: [],
        },
        inputText: 'orphan task',
      };

      deps.normalizeTitle.mockImplementation((s) =>
        (s || '')
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      );

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.dumpCheck = '0';
      document.body.appendChild(cb);

      const ta = document.createElement('textarea');
      ta.id = 'dumpText';
      document.body.appendChild(ta);

      bs.applyDumpResults();

      const createCall = deps.createTask.mock.calls[0][0];
      expect(createCall.project).toBe('p_life');

      cb.remove();
      ta.remove();
    });
  });

  // ── applyDumpResults — project update with long description and no background ──
  describe('applyDumpResults — project with long description and no background', () => {
    it('moves long description to background for existing project', () => {
      const longDesc =
        'This is a very long description that exceeds eighty characters and contains lots of detail about the project direction and goals and roadmap';
      deps.findSimilarProject.mockReturnValue({
        id: 'p_existing',
        name: 'Existing',
        description: longDesc,
      });

      window._dumpReviewData = {
        parsed: {
          tasks: [{ action: 'create', title: 'Task', suggestedProject: '', priority: 'normal', status: 'todo' }],
          projectUpdates: [{ name: 'Existing', description: longDesc }],
          patterns: [],
        },
        inputText: 'task',
      };

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.dumpCheck = '0';
      document.body.appendChild(cb);

      const ta = document.createElement('textarea');
      ta.id = 'dumpText';
      document.body.appendChild(ta);

      bs.applyDumpResults();

      expect(deps.updateProject).toHaveBeenCalledWith(
        'p_existing',
        expect.objectContaining({
          background: longDesc,
        }),
      );

      cb.remove();
      ta.remove();
    });
  });
});
