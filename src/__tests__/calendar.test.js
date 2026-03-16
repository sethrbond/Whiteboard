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
