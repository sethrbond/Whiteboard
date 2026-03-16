import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSettings } from '../settings.js';

function makeDeps(overrides = {}) {
  return {
    $: vi.fn((sel) => document.querySelector(sel)),
    esc: vi.fn((s) => (s == null ? '' : String(s))),
    todayStr: vi.fn(() => '2026-03-15'),
    getData: vi.fn(() => ({
      tasks: [],
      projects: [
        { id: 'p_1', name: 'Work', color: '#3b82f6', description: 'Work tasks' },
        { id: 'p_life', name: 'Life', color: '#10b981', description: '' },
      ],
    })),
    getSettings: vi.fn(() => ({ apiKey: 'sk-test', aiModel: 'claude-haiku-4-5-20251001' })),
    setModalLabel: vi.fn(),
    pushModalState: vi.fn(),
    closeModal: vi.fn(),
    trapFocus: vi.fn(() => vi.fn()),
    getTrapFocusCleanup: vi.fn(() => null),
    setTrapFocusCleanup: vi.fn(),
    _getModalTriggerEl: vi.fn(() => null),
    setModalTriggerEl: vi.fn(),
    createProject: vi.fn((p) => ({ id: 'p_new', ...p })),
    addProject: vi.fn(),
    updateProject: vi.fn(),
    setView: vi.fn(),
    render: vi.fn(),
    saveData: vi.fn(),
    pushUndo: vi.fn(),
    ensureLifeProject: vi.fn(),
    showToast: vi.fn(),
    getAIMemory: vi.fn(() => []),
    saveAIMemory: vi.fn(),
    getAIMemoryArchive: vi.fn(() => []),
    PROJECT_COLORS: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    _getShowProjectBg: vi.fn(() => false),
    setShowProjectBg: vi.fn(),
    ...overrides,
  };
}

describe('settings.js — createSettings()', () => {
  let settings;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
    settings = createSettings(deps);
  });

  // ── Factory returns ─────────────────────────────────────────────────
  it('returns all expected functions', () => {
    const keys = [
      'openSettings',
      'deleteAIMemory',
      'exportData',
      'importData',
      'editProjectBackground',
      'saveProjectBackground',
      'openNewProject',
      'saveNewProject',
      'openEditProject',
      'saveEditProject',
    ];
    keys.forEach((k) => expect(typeof settings[k]).toBe('function'));
  });

  // ── openSettings ──────────────────────────────────────────────────
  it('openSettings renders settings modal', () => {
    settings.openSettings();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('Settings');
    expect(modal.innerHTML).toContain('Claude API Key');
  });

  it('openSettings shows memory count', () => {
    deps.getAIMemory.mockReturnValue([{ text: 'User prefers short responses', type: 'preference' }]);
    settings.openSettings();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('1/30');
  });

  it('openSettings shows "No memories yet" when memory is empty', () => {
    settings.openSettings();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('No memories yet');
  });

  it('openSettings calls pushModalState', () => {
    settings.openSettings();
    expect(deps.pushModalState).toHaveBeenCalledWith('settings');
  });

  it('openSettings renders grouped memories by type', () => {
    deps.getAIMemory.mockReturnValue([
      { text: 'Likes dark mode', type: 'preference' },
      { text: 'Works mornings', type: 'pattern' },
      { text: 'Fix typo', type: 'correction' },
    ]);
    settings = createSettings(deps);
    settings.openSettings();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('Likes dark mode');
    expect(modal.innerHTML).toContain('Works mornings');
    expect(modal.innerHTML).toContain('Fix typo');
    expect(modal.innerHTML).toContain('3/30');
  });

  it('openSettings renders archive section when archive exists', () => {
    deps.getAIMemoryArchive.mockReturnValue([{ text: 'Old memory', type: 'note' }]);
    settings = createSettings(deps);
    settings.openSettings();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('Archived');
    expect(modal.innerHTML).toContain('Old memory');
  });

  it('openSettings hides archive section when archive is empty', () => {
    deps.getAIMemoryArchive.mockReturnValue([]);
    settings = createSettings(deps);
    settings.openSettings();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).not.toContain('Archived');
  });

  it('openSettings shows Clear All button when memories exist', () => {
    deps.getAIMemory.mockReturnValue([{ text: 'mem', type: 'note' }]);
    settings = createSettings(deps);
    settings.openSettings();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('Clear All');
  });

  // ── saveSettings (API key flow) ──────────────────────────────────
  it('openSettings renders API key input with current value', () => {
    deps.getSettings.mockReturnValue({ apiKey: 'sk-my-key-123' });
    settings = createSettings(deps);
    settings.openSettings();
    const input = document.getElementById('fApiKey');
    expect(input).toBeTruthy();
    expect(input.value).toBe('sk-my-key-123');
  });

  it('openSettings renders empty API key when none is set', () => {
    deps.getSettings.mockReturnValue({ apiKey: '' });
    settings = createSettings(deps);
    settings.openSettings();
    const input = document.getElementById('fApiKey');
    expect(input.value).toBe('');
  });

  // ── deleteAIMemory ────────────────────────────────────────────────
  it('deleteAIMemory removes the memory at the given index', () => {
    const mem = [
      { text: 'a', type: 'note' },
      { text: 'b', type: 'note' },
    ];
    deps.getAIMemory.mockReturnValue(mem);
    settings.deleteAIMemory(0);
    expect(deps.saveAIMemory).toHaveBeenCalledWith([{ text: 'b', type: 'note' }]);
  });

  it('deleteAIMemory re-renders settings afterwards', () => {
    const mem = [{ text: 'a', type: 'note' }];
    deps.getAIMemory.mockReturnValue(mem);
    settings.deleteAIMemory(0);
    expect(deps.pushModalState).toHaveBeenCalledWith('settings');
  });

  it('deleteAIMemory removes the last memory', () => {
    const mem = [{ text: 'only', type: 'note' }];
    deps.getAIMemory.mockReturnValue(mem);
    settings.deleteAIMemory(0);
    expect(deps.saveAIMemory).toHaveBeenCalledWith([]);
  });

  // ── exportData ────────────────────────────────────────────────────
  it('exportData does not throw', () => {
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    expect(() => settings.exportData()).not.toThrow();
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  it('exportData creates a blob with JSON data', () => {
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();

    settings.exportData();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');

    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  // ── importData ────────────────────────────────────────────────────
  describe('importData', () => {
    function createFileInput(content) {
      const blob = new Blob([content], { type: 'application/json' });
      const file = new File([blob], 'test.json', { type: 'application/json' });
      return { files: [file] };
    }

    it('imports valid data successfully', async () => {
      const validData = JSON.stringify({
        tasks: [{ id: 't1', title: 'Test task' }],
        projects: [{ id: 'p1', name: 'Work' }],
      });
      const input = createFileInput(validData);
      settings.importData(input);
      // Wait for FileReader async
      await new Promise((r) => setTimeout(r, 100));
      expect(deps.pushUndo).toHaveBeenCalledWith('Import data');
      expect(deps.saveData).toHaveBeenCalled();
      expect(deps.ensureLifeProject).toHaveBeenCalled();
      expect(deps.render).toHaveBeenCalled();
      expect(deps.showToast).toHaveBeenCalledWith('Imported');
    });

    it('rejects invalid JSON', async () => {
      const input = createFileInput('not json {{{');
      settings.importData(input);
      await new Promise((r) => setTimeout(r, 100));
      expect(deps.showToast).toHaveBeenCalledWith('Invalid file', true);
      expect(deps.saveData).not.toHaveBeenCalled();
    });

    it('rejects data without tasks array', async () => {
      const input = createFileInput(JSON.stringify({ projects: [] }));
      settings.importData(input);
      await new Promise((r) => setTimeout(r, 100));
      expect(deps.showToast).toHaveBeenCalledWith('Invalid file format', true);
      expect(deps.saveData).not.toHaveBeenCalled();
    });

    it('rejects oversized task arrays', async () => {
      const bigTasks = Array.from({ length: 10001 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}` }));
      const input = createFileInput(JSON.stringify({ tasks: bigTasks }));
      settings.importData(input);
      await new Promise((r) => setTimeout(r, 100));
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('max 10,000 tasks'), true);
      expect(deps.saveData).not.toHaveBeenCalled();
    });

    it('rejects oversized project arrays', async () => {
      const bigProjects = Array.from({ length: 10001 }, (_, i) => ({ id: `p${i}`, name: `Proj ${i}` }));
      const input = createFileInput(JSON.stringify({ tasks: [{ id: 't1', title: 'ok' }], projects: bigProjects }));
      settings.importData(input);
      await new Promise((r) => setTimeout(r, 100));
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('max 10,000 boards'), true);
      expect(deps.saveData).not.toHaveBeenCalled();
    });

    it('rejects tasks without required string fields', async () => {
      const input = createFileInput(JSON.stringify({ tasks: [{ id: 123, title: 'bad id type' }] }));
      settings.importData(input);
      await new Promise((r) => setTimeout(r, 100));
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Invalid task data'), true);
      expect(deps.saveData).not.toHaveBeenCalled();
    });

    it('sanitizes HTML tags from imported data', async () => {
      const input = createFileInput(
        JSON.stringify({
          tasks: [{ id: 't1', title: '<script>alert("xss")</script>Task' }],
          projects: [{ id: 'p1', name: '<b>Bold</b> Project' }],
        }),
      );
      settings.importData(input);
      await new Promise((r) => setTimeout(r, 100));
      expect(deps.saveData).toHaveBeenCalled();
      const savedData = deps.saveData.mock.calls[0][0];
      expect(savedData.tasks[0].title).not.toContain('<script>');
      expect(savedData.tasks[0].title).toContain('Task');
      expect(savedData.projects[0].name).not.toContain('<b>');
      expect(savedData.projects[0].name).toContain('Bold');
    });

    it('does nothing when no file is selected', () => {
      settings.importData({ files: [] });
      expect(deps.saveData).not.toHaveBeenCalled();
    });
  });

  // ── openNewProject ────────────────────────────────────────────────
  it('openNewProject renders new project modal', () => {
    settings.openNewProject();
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('New Board');
    expect(modal.innerHTML).toContain('fName');
  });

  it('openNewProject calls setModalTriggerEl', () => {
    settings.openNewProject();
    expect(deps.setModalTriggerEl).toHaveBeenCalled();
  });

  // ── saveNewProject ────────────────────────────────────────────────
  it('saveNewProject does nothing when name is empty', () => {
    settings.openNewProject();
    document.getElementById('fName').value = '';
    settings.saveNewProject();
    expect(deps.createProject).not.toHaveBeenCalled();
  });

  it('saveNewProject creates a project when name is provided', () => {
    settings.openNewProject();
    document.getElementById('fName').value = 'New Project';
    document.getElementById('fDesc').value = 'Description';
    settings.saveNewProject();
    expect(deps.createProject).toHaveBeenCalledWith({ name: 'New Project', description: 'Description' });
    expect(deps.addProject).toHaveBeenCalled();
    expect(deps.closeModal).toHaveBeenCalled();
  });

  it('saveNewProject navigates to the new project view', () => {
    settings.openNewProject();
    document.getElementById('fName').value = 'My Board';
    settings.saveNewProject();
    expect(deps.setView).toHaveBeenCalledWith('project', 'p_new');
  });

  // ── openEditProject ───────────────────────────────────────────────
  it('openEditProject renders edit modal for existing project', () => {
    settings.openEditProject('p_1');
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('Edit Board');
    expect(modal.innerHTML).toContain('Work');
  });

  it('openEditProject does nothing for non-existent project', () => {
    document.getElementById('modalRoot').innerHTML = '';
    settings.openEditProject('p_nonexistent');
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toBe('');
  });

  // ── saveEditProject ───────────────────────────────────────────────
  it('saveEditProject saves name, description and picked color', () => {
    settings.openEditProject('p_1');
    document.getElementById('fName').value = 'Updated Name';
    document.getElementById('fDesc').value = 'Updated Desc';
    // Simulate picking a color
    const colorEl = document.querySelector('#fColors [data-action="pick-color"]');
    if (colorEl) colorEl.setAttribute('data-picked', '1');
    settings.saveEditProject('p_1');
    expect(deps.updateProject).toHaveBeenCalledWith(
      'p_1',
      expect.objectContaining({
        name: 'Updated Name',
        description: 'Updated Desc',
      }),
    );
    expect(deps.closeModal).toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalled();
  });

  it('saveEditProject uses existing color when none picked', () => {
    settings.openEditProject('p_1');
    document.getElementById('fName').value = 'Same Name';
    // Remove all picked attributes
    document.querySelectorAll('#fColors [data-picked]').forEach((el) => el.removeAttribute('data-picked'));
    settings.saveEditProject('p_1');
    expect(deps.updateProject).toHaveBeenCalledWith(
      'p_1',
      expect.objectContaining({
        color: '#3b82f6', // original project color
      }),
    );
  });

  // ── editProjectBackground ─────────────────────────────────────────
  it('editProjectBackground renders background editor modal', () => {
    settings.editProjectBackground('p_1');
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toContain('Edit Board Background');
    expect(modal.innerHTML).toContain('bgEditor');
  });

  it('editProjectBackground does nothing for non-existent project', () => {
    document.getElementById('modalRoot').innerHTML = '';
    settings.editProjectBackground('p_nonexistent');
    const modal = document.getElementById('modalRoot');
    expect(modal.innerHTML).toBe('');
  });

  // ── saveProjectBackground ─────────────────────────────────────────
  it('saveProjectBackground saves the editor content', () => {
    settings.editProjectBackground('p_1');
    const editor = document.getElementById('bgEditor');
    editor.value = '## My Background';
    settings.saveProjectBackground('p_1');
    expect(deps.updateProject).toHaveBeenCalledWith('p_1', { background: '## My Background' });
    expect(deps.showToast).toHaveBeenCalledWith('Background saved');
    expect(deps.render).toHaveBeenCalled();
  });
});
