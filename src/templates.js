// ============================================================
// TASK TEMPLATES MODULE
// ============================================================
// Handles template CRUD, built-in workflow templates,
// and template storage in localStorage.

const TEMPLATES_KEY = 'wb_templates';
const MAX_TEMPLATES = 20;

// Built-in recurring workflow templates
export const BUILTIN_TEMPLATES = [
  {
    id: '_builtin_weekly_review',
    name: 'Weekly Review',
    builtin: true,
    priority: 'normal',
    project: '',
    subtasks: ['Review completed tasks', 'Check overdue', 'Plan next week', 'Archive done'],
    estimatedMinutes: 30,
    tags: [],
  },
  {
    id: '_builtin_daily_standup',
    name: 'Daily Standup',
    builtin: true,
    priority: 'normal',
    project: '',
    subtasks: ['What I did yesterday', "What I'm doing today", 'Any blockers'],
    estimatedMinutes: 15,
    tags: [],
  },
  {
    id: '_builtin_sprint_planning',
    name: 'Sprint Planning',
    builtin: true,
    priority: 'important',
    project: '',
    subtasks: ['Review backlog', 'Estimate tasks', 'Assign priorities', 'Set sprint goals'],
    estimatedMinutes: 60,
    tags: [],
  },
];

/**
 * Factory function to create template management functions.
 * @param {Object} deps - Dependencies
 * @returns {{ getTemplates, saveTemplates, addTemplate, updateTemplate, deleteTemplate, getBuiltinTemplates, getAllTemplates, applyTemplate }}
 */
export function createTemplates(deps) {
  const { userKey, genId, showToast } = deps;

  function _storageKey() {
    return userKey ? userKey(TEMPLATES_KEY) : TEMPLATES_KEY;
  }

  function getTemplates() {
    try {
      const raw = localStorage.getItem(_storageKey());
      const templates = raw ? JSON.parse(raw) : [];
      return Array.isArray(templates) ? templates : [];
    } catch (_e) {
      return [];
    }
  }

  function saveTemplates(templates) {
    localStorage.setItem(_storageKey(), JSON.stringify(templates));
  }

  function addTemplate(template) {
    const templates = getTemplates();
    if (templates.length >= MAX_TEMPLATES) {
      if (showToast) showToast('Maximum 20 templates reached. Delete one first.', true);
      return false;
    }
    const t = {
      id: genId('tmpl'),
      name: template.name || 'Untitled Template',
      priority: template.priority || 'normal',
      project: template.project || '',
      subtasks: Array.isArray(template.subtasks) ? template.subtasks.slice(0, 20) : [],
      estimatedMinutes: template.estimatedMinutes || 0,
      tags: Array.isArray(template.tags) ? template.tags.slice(0, 10) : [],
      createdAt: new Date().toISOString(),
    };
    templates.push(t);
    saveTemplates(templates);
    if (showToast) showToast('Template saved: ' + t.name, false, true);
    return t;
  }

  function updateTemplate(id, updates) {
    const templates = getTemplates();
    const idx = templates.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const allowed = ['name', 'priority', 'project', 'subtasks', 'estimatedMinutes', 'tags'];
    for (const k of allowed) {
      if (k in updates) templates[idx][k] = updates[k];
    }
    saveTemplates(templates);
    return true;
  }

  function deleteTemplate(id) {
    const templates = getTemplates();
    const filtered = templates.filter((t) => t.id !== id);
    if (filtered.length === templates.length) return false;
    saveTemplates(filtered);
    if (showToast) showToast('Template deleted', false, true);
    return true;
  }

  function getBuiltinTemplates() {
    return BUILTIN_TEMPLATES;
  }

  function getAllTemplates() {
    return [...BUILTIN_TEMPLATES, ...getTemplates()];
  }

  /**
   * Apply a template to produce task creation fields.
   * @param {Object} template - The template to apply
   * @param {Function} genSubtaskId - Function to generate subtask IDs
   * @returns {Object} Task fields ready for createTask
   */
  function applyTemplate(template, genSubtaskId) {
    const fields = {
      title: template.name || '',
      priority: template.priority || 'normal',
      project: template.project || '',
      estimatedMinutes: template.estimatedMinutes || 0,
      tags: Array.isArray(template.tags) ? [...template.tags] : [],
    };
    if (template.subtasks && template.subtasks.length) {
      const idFn = genSubtaskId || (() => 'st_' + Math.random().toString(36).slice(2, 10));
      fields.subtasks = template.subtasks.map((s) => ({
        id: idFn('st'),
        title: typeof s === 'string' ? s : s.title || '',
        done: false,
      }));
    }
    return fields;
  }

  return {
    getTemplates,
    saveTemplates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    getBuiltinTemplates,
    getAllTemplates,
    applyTemplate,
  };
}

export { MAX_TEMPLATES, TEMPLATES_KEY };
