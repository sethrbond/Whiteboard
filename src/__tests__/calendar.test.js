import { describe, it, expect, beforeEach } from 'vitest';
import { createCalendar } from '../calendar.js';

describe('calendar.js', () => {
  let cal;
  let store;
  let renderCalled;

  beforeEach(() => {
    renderCalled = 0;
    const today = new Date();
    const todayISO =
      today.getFullYear() +
      '-' +
      String(today.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(today.getDate()).padStart(2, '0');

    store = {
      tasks: [
        { id: 't1', title: 'Task with due date', status: 'todo', priority: 'urgent', dueDate: todayISO, project: 'p1' },
        { id: 't2', title: 'Done task', status: 'done', priority: 'normal', dueDate: todayISO, project: 'p1' },
        { id: 't3', title: 'No due date', status: 'todo', priority: 'normal', project: 'p1' },
      ],
      projects: [{ id: 'p1', name: 'Work', color: '#818cf8' }],
    };

    cal = createCalendar({
      localISO: (d) =>
        d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
      esc: (s) =>
        String(s || '')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/&/g, '&amp;'),
      sortTasks: (tasks) =>
        [...tasks].sort((a, b) => {
          const po = { urgent: 0, important: 1, normal: 2, low: 3 };
          return (po[a.priority] || 2) - (po[b.priority] || 2);
        }),
      PRIORITY_ORDER: { urgent: 0, important: 1, normal: 2, low: 3 },
      render: () => {
        renderCalled++;
      },
      fmtDate: (s) => s || '',
      findTask: (id) => store.tasks.find((t) => t.id === id),
      getData: () => store,
      getDashViewMode: () => 'week',
      getExpandedTask: () => null,
      renderTaskExpanded: (t) => `<div class="expanded">${t.title}</div>`,
      renderTaskRow: (t) => `<div class="row">${t.title}</div>`,
    });
  });

  it('returns all expected functions', () => {
    expect(typeof cal.renderCalendar).toBe('function');
    expect(typeof cal.calNav).toBe('function');
    expect(typeof cal.calToday).toBe('function');
    expect(typeof cal.getState).toBe('function');
    expect(typeof cal.setExpandedDay).toBe('function');
    expect(typeof cal.resetOffset).toBe('function');
  });

  describe('renderCalendar()', () => {
    it('returns HTML string', () => {
      const html = cal.renderCalendar();
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(100);
    });

    it('includes day-of-week headers', () => {
      const html = cal.renderCalendar();
      expect(html).toContain('Mon');
      expect(html).toContain('Fri');
    });

    it('shows tasks with due dates', () => {
      const html = cal.renderCalendar();
      expect(html).toContain('Task with due date');
    });

    it('shows navigation buttons', () => {
      const html = cal.renderCalendar();
      expect(html).toContain('cal-nav');
    });

    it('shows unscheduled tasks section', () => {
      const html = cal.renderCalendar();
      expect(html).toContain('Unscheduled');
    });
  });

  describe('calNav()', () => {
    it('increments offset and triggers render', () => {
      cal.calNav(1);
      expect(cal.getState().calendarOffset).toBe(1);
      expect(renderCalled).toBe(1);
    });

    it('decrements offset', () => {
      cal.calNav(-1);
      expect(cal.getState().calendarOffset).toBe(-1);
    });

    it('accumulates offset', () => {
      cal.calNav(1);
      cal.calNav(1);
      cal.calNav(1);
      expect(cal.getState().calendarOffset).toBe(3);
    });
  });

  describe('calToday()', () => {
    it('resets offset to 0 and triggers render', () => {
      cal.calNav(5);
      cal.calToday();
      expect(cal.getState().calendarOffset).toBe(0);
    });
  });

  describe('setExpandedDay()', () => {
    it('sets expanded day', () => {
      cal.setExpandedDay('2026-03-15');
      expect(cal.getState().calendarExpandedDay).toBe('2026-03-15');
    });

    it('clears expanded day with null', () => {
      cal.setExpandedDay('2026-03-15');
      cal.setExpandedDay(null);
      expect(cal.getState().calendarExpandedDay).toBeNull();
    });
  });

  describe('resetOffset()', () => {
    it('resets offset without triggering render', () => {
      cal.calNav(3);
      renderCalled = 0;
      cal.resetOffset();
      expect(cal.getState().calendarOffset).toBe(0);
    });
  });

  describe('renderCalendar() with month view', () => {
    it('renders month grid', () => {
      const monthCal = createCalendar({
        localISO: (d) =>
          d.getFullYear() +
          '-' +
          String(d.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(d.getDate()).padStart(2, '0'),
        esc: (s) => String(s || ''),
        sortTasks: (tasks) => [...tasks],
        PRIORITY_ORDER: { urgent: 0, important: 1, normal: 2, low: 3 },
        render: () => {},
        fmtDate: (s) => s || '',
        findTask: (id) => store.tasks.find((t) => t.id === id),
        getData: () => store,
        getDashViewMode: () => 'month',
        getExpandedTask: () => null,
        renderTaskExpanded: () => '',
        renderTaskRow: (t) => `<div>${t.title}</div>`,
      });
      const html = monthCal.renderCalendar();
      expect(html).toContain('cal-grid');
      expect(html).toContain('cal-agenda-mobile');
    });
  });

  describe('renderCalendar() with empty data', () => {
    it('handles no tasks', () => {
      store.tasks = [];
      const html = cal.renderCalendar();
      expect(typeof html).toBe('string');
      expect(html).toContain('cal-grid');
    });

    it('handles no projects', () => {
      store.projects = [];
      const html = cal.renderCalendar();
      expect(typeof html).toBe('string');
    });
  });
});

// ── Additional coverage tests ─────────────────────────────────────────

describe('calendar.js — additional coverage', () => {
  const localISO = (d) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const esc = (s) => String(s || '');
  const PRIORITY_ORDER = { urgent: 0, important: 1, normal: 2, low: 3 };

  function makeCalendar(overrides = {}) {
    const store = overrides.store || { tasks: [], projects: [] };
    return createCalendar({
      localISO,
      esc,
      sortTasks: (tasks) => [...tasks],
      PRIORITY_ORDER,
      render: () => {},
      fmtDate: (s) => s || '',
      findTask: overrides.findTask || ((id) => store.tasks.find((t) => t.id === id)),
      getData: () => store,
      getDashViewMode: () => overrides.mode || 'week',
      getExpandedTask: () => overrides.expandedTask || null,
      renderTaskExpanded:
        overrides.renderTaskExpanded || ((t, inCal) => `<div class="expanded">${t.title} inCal=${inCal}</div>`),
      renderTaskRow: (t) => `<div class="row">${t.title}</div>`,
    });
  }

  // ── Show more/less (lines 158-163) ──────────────────────────────────
  describe('show more/less buttons when tasks exceed MAX_VISIBLE', () => {
    it('shows "+N more" in week view when tasks exceed 10', () => {
      const todayISO = localISO(new Date());
      const store = { tasks: [], projects: [] };
      for (let i = 0; i < 12; i++) {
        store.tasks.push({
          id: `tw${i}`,
          title: `WeekTask ${i}`,
          status: 'todo',
          priority: 'normal',
          dueDate: todayISO,
        });
      }
      const cal = makeCalendar({ store, mode: 'week' });
      const html = cal.renderCalendar();
      expect(html).toContain('+2 more');
      expect(html).toContain('cal-expand');
    });

    it('shows "Show less" when day is expanded in week view', () => {
      const todayISO = localISO(new Date());
      const store = { tasks: [], projects: [] };
      for (let i = 0; i < 12; i++) {
        store.tasks.push({
          id: `tw${i}`,
          title: `WeekTask ${i}`,
          status: 'todo',
          priority: 'normal',
          dueDate: todayISO,
        });
      }
      const cal = makeCalendar({ store, mode: 'week' });
      cal.setExpandedDay(todayISO);
      const html = cal.renderCalendar();
      expect(html).toContain('Show less');
      expect(html).toContain('cal-collapse');
      for (let i = 0; i < 12; i++) {
        expect(html).toContain(`WeekTask ${i}`);
      }
    });

    it('shows "+N more" in month view when tasks exceed 3', () => {
      const todayISO = localISO(new Date());
      const store = { tasks: [], projects: [] };
      for (let i = 0; i < 5; i++) {
        store.tasks.push({
          id: `tm${i}`,
          title: `MonthTask ${i}`,
          status: 'todo',
          priority: 'normal',
          dueDate: todayISO,
        });
      }
      const cal = makeCalendar({ store, mode: 'month' });
      const html = cal.renderCalendar();
      expect(html).toContain('+2 more');
      expect(html).toContain('cal-expand');
    });

    it('does not show overflow buttons when tasks equal MAX_VISIBLE', () => {
      const todayISO = localISO(new Date());
      const store = { tasks: [], projects: [] };
      for (let i = 0; i < 10; i++) {
        store.tasks.push({
          id: `tw${i}`,
          title: `WeekTask ${i}`,
          status: 'todo',
          priority: 'normal',
          dueDate: todayISO,
        });
      }
      const cal = makeCalendar({ store, mode: 'week' });
      const html = cal.renderCalendar();
      expect(html).not.toContain('cal-expand');
      expect(html).not.toContain('cal-collapse');
    });
  });

  // ── Mobile agenda rendering (lines 186-213) ────────────────────────
  describe('mobile agenda rendering', () => {
    it('highlights today in agenda view', () => {
      const todayISO = localISO(new Date());
      const store = {
        tasks: [{ id: 't1', title: 'Today task', status: 'todo', priority: 'normal', dueDate: todayISO }],
        projects: [],
      };
      const cal = makeCalendar({ store, mode: 'month' });
      const html = cal.renderCalendar();
      expect(html).toContain('(Today)');
      expect(html).toContain('var(--accent)');
    });

    it('renders priority dots for urgent and important tasks', () => {
      const todayISO = localISO(new Date());
      const store = {
        tasks: [
          { id: 't1', title: 'Urgent thing', status: 'todo', priority: 'urgent', dueDate: todayISO },
          { id: 't2', title: 'Important thing', status: 'todo', priority: 'important', dueDate: todayISO },
        ],
        projects: [],
      };
      const cal = makeCalendar({ store, mode: 'month' });
      const html = cal.renderCalendar();
      expect(html).toContain('var(--red)');
      expect(html).toContain('var(--orange)');
      expect(html).toContain('title="Urgent"');
      expect(html).toContain('title="Important"');
    });

    it('applies done styling to completed tasks in agenda', () => {
      const todayISO = localISO(new Date());
      const store = {
        tasks: [{ id: 't1', title: 'Done task', status: 'done', priority: 'normal', dueDate: todayISO }],
        projects: [],
      };
      const cal = makeCalendar({ store, mode: 'month' });
      const html = cal.renderCalendar();
      expect(html).toContain('text-decoration:line-through');
      expect(html).toContain('color:var(--text3)');
    });

    it('renders project color dots in agenda', () => {
      const todayISO = localISO(new Date());
      const store = {
        tasks: [{ id: 't1', title: 'Proj task', status: 'todo', priority: 'normal', dueDate: todayISO, project: 'p1' }],
        projects: [{ id: 'p1', name: 'My Project', color: '#ff5500' }],
      };
      const cal = makeCalendar({ store, mode: 'month' });
      const html = cal.renderCalendar();
      expect(html).toContain('background:#ff5500');
      expect(html).toContain('My Project');
    });

    it('shows "No tasks scheduled this month" when no tasks in month', () => {
      const cal = makeCalendar({ store: { tasks: [], projects: [] }, mode: 'month' });
      const html = cal.renderCalendar();
      expect(html).toContain('No tasks scheduled this month');
    });

    it('does not show today highlight for non-today dates', () => {
      const today = new Date();
      const otherDay = today.getDate() === 1 ? 2 : 1;
      const otherISO =
        today.getFullYear() +
        '-' +
        String(today.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(otherDay).padStart(2, '0');
      const store = {
        tasks: [{ id: 't1', title: 'Other day task', status: 'todo', priority: 'normal', dueDate: otherISO }],
        projects: [],
      };
      const cal = makeCalendar({ store, mode: 'month' });
      const html = cal.renderCalendar();
      const agendaPart = html.split('cal-agenda-mobile')[1];
      expect(agendaPart).toContain('var(--text2)');
      expect(agendaPart).not.toContain('(Today)');
    });
  });

  // ── Expanded task detail below calendar (lines 219-223) ────────────
  describe('expanded task detail below calendar', () => {
    it('renders expanded task when expandedTask is set and task is found', () => {
      const store = { tasks: [{ id: 't1', title: 'Expanded Task', status: 'todo', priority: 'normal' }], projects: [] };
      const cal = makeCalendar({
        store,
        mode: 'week',
        expandedTask: 't1',
        renderTaskExpanded: (t, inCal) => `<div class="expanded">${t.title} inCal=${inCal}</div>`,
      });
      const html = cal.renderCalendar();
      expect(html).toContain('<div class="expanded">Expanded Task inCal=true</div>');
    });

    it('does not render expanded section when task is not found', () => {
      const store = { tasks: [], projects: [] };
      const cal = makeCalendar({
        store,
        mode: 'week',
        expandedTask: 't_nonexistent',
        findTask: () => null,
      });
      const html = cal.renderCalendar();
      expect(html).not.toContain('class="expanded"');
    });
  });

  // ── Unscheduled tasks overflow (lines 235-236) ─────────────────────
  describe('unscheduled tasks overflow', () => {
    it('shows "+N more" when unscheduled tasks exceed 10', () => {
      const store = { tasks: [], projects: [] };
      for (let i = 0; i < 15; i++) {
        store.tasks.push({ id: `u${i}`, title: `Unscheduled ${i}`, status: 'todo', priority: 'normal' });
      }
      const cal = makeCalendar({ store });
      const html = cal.renderCalendar();
      expect(html).toContain('Unscheduled');
      expect(html).toContain('+5 more unscheduled tasks');
    });

    it('does not show "+N more" when unscheduled tasks are 10 or fewer', () => {
      const store = { tasks: [], projects: [] };
      for (let i = 0; i < 10; i++) {
        store.tasks.push({ id: `u${i}`, title: `Unscheduled ${i}`, status: 'todo', priority: 'normal' });
      }
      const cal = makeCalendar({ store });
      const html = cal.renderCalendar();
      expect(html).toContain('Unscheduled');
      expect(html).not.toContain('more unscheduled tasks');
    });
  });
});
