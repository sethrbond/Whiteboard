import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTemplates, BUILTIN_TEMPLATES, MAX_TEMPLATES, TEMPLATES_KEY } from '../templates.js';

function makeDeps(overrides = {}) {
  return {
    userKey: vi.fn((k) => 'test_' + k),
    genId: vi.fn((prefix) => prefix + '_' + Math.random().toString(36).slice(2, 10)),
    showToast: vi.fn(),
    ...overrides,
  };
}

describe('templates.js — createTemplates()', () => {
  let templates;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    deps = makeDeps();
    templates = createTemplates(deps);
  });

  // ── Factory returns ─────────────────────────────────────────────────
  it('returns all expected functions', () => {
    const keys = [
      'getTemplates',
      'saveTemplates',
      'addTemplate',
      'updateTemplate',
      'deleteTemplate',
      'getBuiltinTemplates',
      'getAllTemplates',
      'applyTemplate',
    ];
    keys.forEach((k) => expect(typeof templates[k]).toBe('function'));
  });

  // ── BUILTIN_TEMPLATES ─────────────────────────────────────────────────
  it('has 3 builtin templates', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(3);
  });

  it('builtin templates have expected names', () => {
    const names = BUILTIN_TEMPLATES.map((t) => t.name);
    expect(names).toContain('Weekly Review');
    expect(names).toContain('Daily Standup');
    expect(names).toContain('Sprint Planning');
  });

  it('builtin templates have subtasks', () => {
    BUILTIN_TEMPLATES.forEach((t) => {
      expect(t.subtasks.length).toBeGreaterThan(0);
    });
  });

  it('Weekly Review has correct subtasks', () => {
    const wr = BUILTIN_TEMPLATES.find((t) => t.name === 'Weekly Review');
    expect(wr.subtasks).toContain('Review completed tasks');
    expect(wr.subtasks).toContain('Check overdue');
    expect(wr.subtasks).toContain('Plan next week');
    expect(wr.subtasks).toContain('Archive done');
  });

  it('Daily Standup has correct subtasks', () => {
    const ds = BUILTIN_TEMPLATES.find((t) => t.name === 'Daily Standup');
    expect(ds.subtasks).toContain('What I did yesterday');
    expect(ds.subtasks).toContain("What I'm doing today");
    expect(ds.subtasks).toContain('Any blockers');
  });

  it('Sprint Planning has correct subtasks', () => {
    const sp = BUILTIN_TEMPLATES.find((t) => t.name === 'Sprint Planning');
    expect(sp.subtasks).toContain('Review backlog');
    expect(sp.subtasks).toContain('Estimate tasks');
    expect(sp.subtasks).toContain('Assign priorities');
    expect(sp.subtasks).toContain('Set sprint goals');
  });

  // ── getTemplates ─────────────────────────────────────────────────
  it('getTemplates returns empty array initially', () => {
    expect(templates.getTemplates()).toEqual([]);
  });

  it('getTemplates returns saved templates', () => {
    templates.addTemplate({ name: 'Test' });
    const result = templates.getTemplates();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Test');
  });

  it('getTemplates handles corrupt localStorage gracefully', () => {
    localStorage.setItem('test_wb_templates', 'not-json');
    expect(templates.getTemplates()).toEqual([]);
  });

  it('getTemplates handles non-array localStorage gracefully', () => {
    localStorage.setItem('test_wb_templates', '{"not":"array"}');
    expect(templates.getTemplates()).toEqual([]);
  });

  // ── addTemplate ─────────────────────────────────────────────────
  it('addTemplate creates a template with generated id', () => {
    const result = templates.addTemplate({ name: 'My Template', priority: 'urgent' });
    expect(result).toBeTruthy();
    expect(result.id).toBeTruthy();
    expect(result.name).toBe('My Template');
    expect(result.priority).toBe('urgent');
  });

  it('addTemplate stores template in localStorage', () => {
    templates.addTemplate({ name: 'Stored' });
    const raw = localStorage.getItem('test_wb_templates');
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Stored');
  });

  it('addTemplate shows toast', () => {
    templates.addTemplate({ name: 'Notified' });
    expect(deps.showToast).toHaveBeenCalledWith('Template saved: Notified', false, true);
  });

  it('addTemplate defaults name to Untitled Template', () => {
    const result = templates.addTemplate({});
    expect(result.name).toBe('Untitled Template');
  });

  it('addTemplate stores subtasks', () => {
    const result = templates.addTemplate({ name: 'With Subs', subtasks: ['A', 'B', 'C'] });
    expect(result.subtasks).toEqual(['A', 'B', 'C']);
  });

  it('addTemplate stores estimatedMinutes', () => {
    const result = templates.addTemplate({ name: 'Timed', estimatedMinutes: 45 });
    expect(result.estimatedMinutes).toBe(45);
  });

  it('addTemplate stores tags', () => {
    const result = templates.addTemplate({ name: 'Tagged', tags: ['work', 'urgent'] });
    expect(result.tags).toEqual(['work', 'urgent']);
  });

  it('addTemplate enforces max 20 templates', () => {
    for (let i = 0; i < MAX_TEMPLATES; i++) {
      templates.addTemplate({ name: 'T' + i });
    }
    expect(templates.getTemplates()).toHaveLength(20);
    const result = templates.addTemplate({ name: 'Too Many' });
    expect(result).toBe(false);
    expect(templates.getTemplates()).toHaveLength(20);
    expect(deps.showToast).toHaveBeenCalledWith('Maximum 20 templates reached. Delete one first.', true);
  });

  it('addTemplate truncates subtasks to 20', () => {
    const subs = Array.from({ length: 25 }, (_, i) => 'Sub ' + i);
    const result = templates.addTemplate({ name: 'Long', subtasks: subs });
    expect(result.subtasks).toHaveLength(20);
  });

  it('addTemplate truncates tags to 10', () => {
    const tags = Array.from({ length: 15 }, (_, i) => 'tag' + i);
    const result = templates.addTemplate({ name: 'Many Tags', tags });
    expect(result.tags).toHaveLength(10);
  });

  it('addTemplate sets createdAt', () => {
    const result = templates.addTemplate({ name: 'Dated' });
    expect(result.createdAt).toBeTruthy();
    expect(new Date(result.createdAt).getTime()).toBeGreaterThan(0);
  });

  // ── updateTemplate ─────────────────────────────────────────────────
  it('updateTemplate changes template fields', () => {
    const tmpl = templates.addTemplate({ name: 'Original', priority: 'normal' });
    const ok = templates.updateTemplate(tmpl.id, { name: 'Updated', priority: 'urgent' });
    expect(ok).toBe(true);
    const updated = templates.getTemplates().find((t) => t.id === tmpl.id);
    expect(updated.name).toBe('Updated');
    expect(updated.priority).toBe('urgent');
  });

  it('updateTemplate returns false for non-existent id', () => {
    expect(templates.updateTemplate('bogus', { name: 'X' })).toBe(false);
  });

  it('updateTemplate only updates allowed fields', () => {
    const tmpl = templates.addTemplate({ name: 'Safe' });
    templates.updateTemplate(tmpl.id, { name: 'Changed', id: 'hacked', createdAt: 'hacked' });
    const updated = templates.getTemplates().find((t) => t.id === tmpl.id);
    expect(updated.name).toBe('Changed');
    expect(updated.id).toBe(tmpl.id); // id not changed
  });

  // ── deleteTemplate ─────────────────────────────────────────────────
  it('deleteTemplate removes template', () => {
    const tmpl = templates.addTemplate({ name: 'Doomed' });
    expect(templates.getTemplates()).toHaveLength(1);
    const ok = templates.deleteTemplate(tmpl.id);
    expect(ok).toBe(true);
    expect(templates.getTemplates()).toHaveLength(0);
  });

  it('deleteTemplate returns false for non-existent id', () => {
    expect(templates.deleteTemplate('bogus')).toBe(false);
  });

  it('deleteTemplate shows toast', () => {
    const tmpl = templates.addTemplate({ name: 'Bye' });
    deps.showToast.mockClear();
    templates.deleteTemplate(tmpl.id);
    expect(deps.showToast).toHaveBeenCalledWith('Template deleted', false, true);
  });

  // ── getBuiltinTemplates ─────────────────────────────────────────────
  it('getBuiltinTemplates returns builtin templates', () => {
    const builtins = templates.getBuiltinTemplates();
    expect(builtins).toHaveLength(3);
    expect(builtins.every((t) => t.builtin === true)).toBe(true);
  });

  // ── getAllTemplates ─────────────────────────────────────────────────
  it('getAllTemplates returns builtins + user templates', () => {
    templates.addTemplate({ name: 'Custom' });
    const all = templates.getAllTemplates();
    expect(all.length).toBe(4); // 3 builtins + 1 custom
    expect(all[0].builtin).toBe(true);
    expect(all[3].name).toBe('Custom');
  });

  it('getAllTemplates returns only builtins when no user templates', () => {
    const all = templates.getAllTemplates();
    expect(all).toHaveLength(3);
  });

  // ── applyTemplate ─────────────────────────────────────────────────
  it('applyTemplate creates task fields from template', () => {
    const tmpl = {
      name: 'My Task',
      priority: 'urgent',
      project: 'p1',
      estimatedMinutes: 30,
      tags: ['work'],
      subtasks: ['Step 1', 'Step 2'],
    };
    const genSt = vi.fn(() => 'st_test');
    const fields = templates.applyTemplate(tmpl, genSt);
    expect(fields.title).toBe('My Task');
    expect(fields.priority).toBe('urgent');
    expect(fields.project).toBe('p1');
    expect(fields.estimatedMinutes).toBe(30);
    expect(fields.tags).toEqual(['work']);
    expect(fields.subtasks).toHaveLength(2);
    expect(fields.subtasks[0].title).toBe('Step 1');
    expect(fields.subtasks[0].done).toBe(false);
    expect(fields.subtasks[1].title).toBe('Step 2');
  });

  it('applyTemplate handles template without subtasks', () => {
    const fields = templates.applyTemplate({ name: 'Simple', priority: 'low' });
    expect(fields.title).toBe('Simple');
    expect(fields.subtasks).toBeUndefined();
  });

  it('applyTemplate handles empty template', () => {
    const fields = templates.applyTemplate({});
    expect(fields.title).toBe('');
    expect(fields.priority).toBe('normal');
    expect(fields.project).toBe('');
    expect(fields.estimatedMinutes).toBe(0);
    expect(fields.tags).toEqual([]);
  });

  it('applyTemplate uses genSubtaskId if provided', () => {
    let counter = 0;
    const genSt = vi.fn(() => 'custom_' + counter++);
    const fields = templates.applyTemplate({ name: 'T', subtasks: ['A'] }, genSt);
    expect(genSt).toHaveBeenCalled();
    expect(fields.subtasks[0].id).toBe('custom_0');
  });

  it('applyTemplate uses fallback ID gen if no genSubtaskId', () => {
    const fields = templates.applyTemplate({ name: 'T', subtasks: ['A'] });
    expect(fields.subtasks[0].id).toBeTruthy();
  });

  it('applyTemplate does not mutate original tags', () => {
    const tags = ['a', 'b'];
    const fields = templates.applyTemplate({ name: 'T', tags });
    fields.tags.push('c');
    expect(tags).toHaveLength(2);
  });

  // ── Constants ─────────────────────────────────────────────────
  it('MAX_TEMPLATES is 20', () => {
    expect(MAX_TEMPLATES).toBe(20);
  });

  it('TEMPLATES_KEY is wb_templates', () => {
    expect(TEMPLATES_KEY).toBe('wb_templates');
  });

  // ── saveTemplates ─────────────────────────────────────────────────
  it('saveTemplates writes to localStorage', () => {
    templates.saveTemplates([{ id: 'x', name: 'Direct' }]);
    const raw = JSON.parse(localStorage.getItem('test_wb_templates'));
    expect(raw).toHaveLength(1);
    expect(raw[0].name).toBe('Direct');
  });
});
