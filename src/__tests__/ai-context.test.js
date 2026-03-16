import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAIContext, AI_PERSONA, AI_PERSONA_SHORT, AI_ACTIONS_SPEC, AI_MEMORY_TYPES } from '../ai-context.js';

describe('ai-context.js', () => {
  describe('exports', () => {
    it('exports AI_PERSONA as a non-empty string', () => {
      expect(typeof AI_PERSONA).toBe('string');
      expect(AI_PERSONA.length).toBeGreaterThan(100);
      expect(AI_PERSONA).toContain('productivity partner');
    });

    it('exports AI_PERSONA_SHORT', () => {
      expect(typeof AI_PERSONA_SHORT).toBe('string');
      expect(AI_PERSONA_SHORT.length).toBeLessThan(AI_PERSONA.length);
    });

    it('exports AI_ACTIONS_SPEC with all action types', () => {
      expect(AI_ACTIONS_SPEC).toContain('create_task');
      expect(AI_ACTIONS_SPEC).toContain('update_task');
      expect(AI_ACTIONS_SPEC).toContain('delete_task');
      expect(AI_ACTIONS_SPEC).toContain('batch_update');
      expect(AI_ACTIONS_SPEC).toContain('save_memory');
      expect(AI_ACTIONS_SPEC).toContain('search_archive');
    });

    it('exports AI_MEMORY_TYPES with 8 types', () => {
      expect(AI_MEMORY_TYPES).toHaveLength(8);
      expect(AI_MEMORY_TYPES).toContain('preference');
      expect(AI_MEMORY_TYPES).toContain('correction');
      expect(AI_MEMORY_TYPES).toContain('rhythm');
    });
  });

  describe('createAIContext()', () => {
    let ctx;
    let store;
    let mockDeps;
    const mockUserKey = (k) => 'test_' + k;

    beforeEach(() => {
      localStorage.clear();
      store = {
        tasks: [
          {
            id: 't1',
            title: 'Buy groceries',
            status: 'todo',
            priority: 'normal',
            createdAt: '2026-03-10T10:00:00Z',
            project: 'p1',
            tags: [],
          },
          {
            id: 't2',
            title: 'Fix bug',
            status: 'in-progress',
            priority: 'urgent',
            createdAt: '2026-03-12T10:00:00Z',
            dueDate: '2026-03-15',
            project: 'p2',
            tags: [],
          },
          {
            id: 't3',
            title: 'Write tests',
            status: 'done',
            priority: 'normal',
            createdAt: '2026-03-11T10:00:00Z',
            completedAt: '2026-03-14T15:00:00Z',
            project: 'p2',
            tags: [],
          },
        ],
        projects: [
          { id: 'p1', name: 'Life', color: '#818cf8', description: 'Personal tasks' },
          { id: 'p2', name: 'Work', color: '#f472b6', description: 'Work tasks' },
        ],
      };

      mockDeps = {
        userKey: mockUserKey,
        scheduleSyncToCloud: vi.fn(),
        getData: () => store,
        getChatHistory: () => [],
        activeTasks: (pid) => store.tasks.filter((t) => t.status !== 'done' && (!pid || t.project === pid)),
        doneTasks: (pid) => store.tasks.filter((t) => t.status === 'done' && (!pid || t.project === pid)),
        projectTasks: (pid) => store.tasks.filter((t) => t.project === pid),
        findTask: (id) => store.tasks.find((t) => t.id === id),
        findSimilarTask: () => null,
        findSimilarProject: () => null,
        isBlocked: () => false,
        callAI: vi.fn().mockResolvedValue('AI response'),
        hasAI: () => true,
        updateTask: vi.fn(),
        deleteTask: vi.fn(),
        addTask: vi.fn(),
        createTask: (props) => ({ id: 'new_' + Date.now(), status: 'todo', priority: 'normal', ...props }),
        createProject: (props) => ({ id: 'np_' + Date.now(), color: '#818cf8', ...props }),
        addProject: vi.fn(),
        updateProject: vi.fn(),
        saveData: vi.fn(),
        pushUndo: vi.fn(),
        confirmAIAction: vi.fn().mockResolvedValue(true),
        enforceShortDesc: (d) => d.slice(0, 200),
      };

      ctx = createAIContext(mockDeps);
    });

    it('returns all expected functions', () => {
      const fns = [
        'getAIMemory',
        'getAIMemoryArchive',
        'saveAIMemory',
        'saveAIMemoryArchive',
        'archiveMemory',
        'restoreMemory',
        'addAIMemory',
        'pruneStaleMemories',
        'searchMemoryArchive',
        'getAIInteractionCount',
        'incrementAIInteraction',
        'consolidateMemories',
        'maybeLearnPattern',
        'buildAIContext',
        'matchTask',
        'matchProject',
        'executeAIActions',
      ];
      for (const fn of fns) {
        expect(typeof ctx[fn]).toBe('function');
      }
    });

    describe('memory management', () => {
      it('starts with empty memory', () => {
        expect(ctx.getAIMemory()).toEqual([]);
      });

      it('adds memory and retrieves it', () => {
        ctx.addAIMemory('User prefers morning meetings', 'preference');
        const mem = ctx.getAIMemory();
        expect(mem).toHaveLength(1);
        expect(mem[0].text).toBe('User prefers morning meetings');
        expect(mem[0].type).toBe('preference');
        expect(mem[0].strength).toBe(1);
      });

      it('deduplicates similar memories', () => {
        ctx.addAIMemory('User prefers morning meetings', 'preference');
        ctx.addAIMemory('User prefers morning meetings always', 'preference');
        expect(ctx.getAIMemory()).toHaveLength(1);
      });

      it('allows distinct memories', () => {
        ctx.addAIMemory('User prefers morning meetings', 'preference');
        ctx.addAIMemory('User works best in the evening', 'rhythm');
        expect(ctx.getAIMemory()).toHaveLength(2);
      });

      it('defaults invalid type to note', () => {
        ctx.addAIMemory('Some observation', 'invalid_type');
        expect(ctx.getAIMemory()[0].type).toBe('note');
      });

      it('archives memory by index', () => {
        ctx.addAIMemory('Memory A', 'note');
        ctx.addAIMemory('Memory B', 'note');
        expect(ctx.getAIMemory()).toHaveLength(2);
        ctx.archiveMemory(0);
        expect(ctx.getAIMemory()).toHaveLength(1);
        expect(ctx.getAIMemoryArchive()).toHaveLength(1);
        expect(ctx.getAIMemoryArchive()[0].text).toBe('Memory A');
      });

      it('restores memory from archive', () => {
        ctx.addAIMemory('Memory A', 'note');
        ctx.archiveMemory(0);
        expect(ctx.getAIMemory()).toHaveLength(0);
        expect(ctx.getAIMemoryArchive()).toHaveLength(1);
        ctx.restoreMemory(0);
        expect(ctx.getAIMemory()).toHaveLength(1);
        expect(ctx.getAIMemoryArchive()).toHaveLength(0);
      });

      it('handles out-of-bounds archive/restore gracefully', () => {
        ctx.archiveMemory(-1);
        ctx.archiveMemory(100);
        ctx.restoreMemory(-1);
        ctx.restoreMemory(100);
        // No crash
      });
    });

    describe('memory search', () => {
      it('returns empty for no memories', () => {
        expect(ctx.searchMemoryArchive('test')).toEqual([]);
      });

      it('finds matching archived memories', () => {
        // Manually save to archive
        ctx.addAIMemory('User loves coding in Python', 'preference');
        ctx.archiveMemory(0);
        const results = ctx.searchMemoryArchive('coding Python');
        expect(results).toHaveLength(1);
        expect(results[0].text).toContain('Python');
      });

      it('returns empty for short query words', () => {
        ctx.addAIMemory('Something', 'note');
        ctx.archiveMemory(0);
        expect(ctx.searchMemoryArchive('a b')).toEqual([]);
      });
    });

    describe('interaction counter', () => {
      it('starts at 0', () => {
        expect(ctx.getAIInteractionCount()).toBe(0);
      });

      it('increments and returns new count', () => {
        expect(ctx.incrementAIInteraction()).toBe(1);
        expect(ctx.incrementAIInteraction()).toBe(2);
        expect(ctx.getAIInteractionCount()).toBe(2);
      });
    });

    describe('buildAIContext()', () => {
      it('builds minimal context', () => {
        const result = ctx.buildAIContext('all', null, 'minimal');
        expect(result).toContain('active tasks');
        expect(result).toContain('overdue');
      });

      it('builds standard context with tasks and projects', () => {
        const result = ctx.buildAIContext('all');
        expect(result).toContain('BOARDS');
        expect(result).toContain('Life');
        expect(result).toContain('Work');
        expect(result).toContain('Buy groceries');
        expect(result).toContain('Fix bug');
      });

      it('builds project-scoped context', () => {
        const result = ctx.buildAIContext('project', 'p2');
        expect(result).toContain('FOCUSED PROJECT: Work');
        expect(result).toContain('Fix bug');
      });

      it('includes AI memory when present', () => {
        ctx.addAIMemory('User likes deadlines', 'preference');
        const result = ctx.buildAIContext('all');
        expect(result).toContain('AI MEMORY');
        expect(result).toContain('User likes deadlines');
      });

      it('includes experience level for high interaction count', () => {
        for (let i = 0; i < 50; i++) ctx.incrementAIInteraction();
        const result = ctx.buildAIContext('all');
        expect(result).toContain('experienced');
      });

      it('truncates at 30000 chars', () => {
        // Add lots of tasks to inflate context
        for (let i = 0; i < 500; i++) {
          store.tasks.push({
            id: 'bulk_' + i,
            title: 'Task '.repeat(50) + i,
            status: 'todo',
            priority: 'normal',
            createdAt: '2026-03-01',
            project: 'p1',
          });
        }
        const result = ctx.buildAIContext('all');
        expect(result.length).toBeLessThanOrEqual(30000);
      });
    });

    describe('matchTask()', () => {
      it('matches exact title', () => {
        expect(ctx.matchTask('Buy groceries')).toEqual(expect.objectContaining({ id: 't1' }));
      });

      it('matches case-insensitively', () => {
        expect(ctx.matchTask('buy groceries')).toEqual(expect.objectContaining({ id: 't1' }));
      });

      it('matches prefix', () => {
        expect(ctx.matchTask('Buy')).toEqual(expect.objectContaining({ id: 't1' }));
      });

      it('returns null for no match', () => {
        expect(ctx.matchTask('nonexistent task xyz')).toBeNull();
      });

      it('returns null for empty query', () => {
        expect(ctx.matchTask('')).toBeNull();
        expect(ctx.matchTask(null)).toBeNull();
      });
    });

    describe('matchProject()', () => {
      it('matches exact name', () => {
        expect(ctx.matchProject('Life')).toEqual(expect.objectContaining({ id: 'p1' }));
      });

      it('matches case-insensitively', () => {
        expect(ctx.matchProject('work')).toEqual(expect.objectContaining({ id: 'p2' }));
      });

      it('returns null for no match', () => {
        expect(ctx.matchProject('nonexistent')).toBeNull();
      });
    });

    describe('executeAIActions()', () => {
      it('returns 0 applied for reply without actions block', async () => {
        const result = await ctx.executeAIActions('Just a text response with no actions.');
        expect(result.applied).toBe(0);
        expect(result.insights).toEqual([]);
      });

      it('creates a task from action block', async () => {
        const _deps = ctx; // use the initialized context
        const reply =
          'Sure!\n```actions\n[{"action":"create_task","title":"New task from AI","priority":"urgent"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
      });

      it('handles save_memory action', async () => {
        const reply =
          '```actions\n[{"action":"save_memory","text":"User prefers short replies","type":"preference"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(ctx.getAIMemory()).toHaveLength(1);
      });

      it('handles suggest_insight action', async () => {
        const reply =
          '```actions\n[{"action":"suggest_insight","text":"You have 5 overdue tasks","severity":"warning"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.insights).toHaveLength(1);
        expect(result.insights[0].text).toContain('overdue');
      });

      it('handles malformed JSON gracefully', async () => {
        const reply = '```actions\n[{broken json}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('handles update_task action', async () => {
        const reply =
          '```actions\n[{"action":"update_task","taskTitle":"Fix bug","fields":{"priority":"normal","status":"done"}}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
      });

      it('handles delete_task action with confirmation', async () => {
        const reply = '```actions\n[{"action":"delete_task","taskTitle":"Buy groceries"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
      });

      it('handles search_archive action', async () => {
        ctx.addAIMemory('User loves Python programming', 'preference');
        ctx.archiveMemory(0);
        const reply = '```actions\n[{"action":"search_archive","query":"Python"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.insights.length).toBeGreaterThan(0);
        expect(result.insights[0].text).toContain('Python');
      });

      it('handles batch_update action', async () => {
        const reply =
          '```actions\n[{"action":"batch_update","filter":{"status":"todo"},"fields":{"priority":"urgent"}}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
      });

      it('handles create_project action', async () => {
        const reply =
          '```actions\n[{"action":"create_project","name":"New Project","description":"A test project"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
      });
    });

    describe('pruneStaleMemories()', () => {
      it('keeps preference and correction memories', () => {
        ctx.addAIMemory('User prefers dark mode', 'preference');
        ctx.addAIMemory('Always use metric units', 'correction');
        ctx.pruneStaleMemories();
        const mem = ctx.getAIMemory();
        expect(mem).toHaveLength(2);
      });

      it('archives old context memories', () => {
        // Manually add an old context memory
        const mem = ctx.getAIMemory();
        mem.push({ text: 'Working on old project', type: 'context', date: '2025-01-01', strength: 1 });
        ctx.saveAIMemory(mem);
        ctx.pruneStaleMemories();
        expect(ctx.getAIMemory().every((m) => m.type !== 'context' || m.date !== '2025-01-01')).toBe(true);
      });
    });

    describe('maybeLearnPattern()', () => {
      it('does nothing with fewer than 10 completed tasks', () => {
        ctx.maybeLearnPattern();
        expect(ctx.getAIMemory()).toHaveLength(0);
      });

      it('learns rhythm when enough tasks completed in morning', () => {
        // Add 15 done tasks completed in the morning
        for (let i = 0; i < 15; i++) {
          const d = new Date('2026-03-10T09:00:00Z');
          d.setDate(d.getDate() + i);
          store.tasks.push({
            id: 'done_' + i,
            title: 'Morning task ' + i,
            status: 'done',
            priority: 'normal',
            createdAt: '2026-03-01',
            project: 'p1',
            completedAt: d.toISOString(),
            tags: [],
          });
        }
        ctx.maybeLearnPattern();
        const mem = ctx.getAIMemory();
        const rhythmMem = mem.find((m) => m.type === 'rhythm');
        expect(rhythmMem).toBeTruthy();
        expect(rhythmMem.text).toContain('morning');
      });
    });

    describe('consolidateMemories()', () => {
      it('skips when fewer than 20 memories', async () => {
        ctx.addAIMemory('Memory 1', 'note');
        await ctx.consolidateMemories();
        // Should still have the same memory (no consolidation happened)
        expect(ctx.getAIMemory()).toHaveLength(1);
      });
    });

    describe('memory edge cases', () => {
      it('enforces max 30 memories', () => {
        for (let i = 0; i < 35; i++) {
          ctx.addAIMemory(`Unique memory number ${i} with enough distinct text`, 'note');
        }
        expect(ctx.getAIMemory().length).toBeLessThanOrEqual(30);
      });

      it('saveAIMemory persists across get calls', () => {
        ctx.addAIMemory('Persistent memory', 'preference');
        const mem = ctx.getAIMemory();
        expect(mem).toHaveLength(1);
        expect(mem[0].text).toBe('Persistent memory');
        // Save and re-get to verify persistence
        ctx.saveAIMemory(mem);
        expect(ctx.getAIMemory()).toHaveLength(1);
      });

      it('archive round-trip preserves memory content', () => {
        ctx.addAIMemory('Important fact', 'preference');
        const original = ctx.getAIMemory()[0];
        ctx.archiveMemory(0);
        const archived = ctx.getAIMemoryArchive()[0];
        expect(archived.text).toBe(original.text);
        expect(archived.type).toBe(original.type);
        ctx.restoreMemory(0);
        const restored = ctx.getAIMemory()[0];
        expect(restored.text).toBe(original.text);
      });
    });

    describe('executeAIActions() — edge cases', () => {
      it('handles empty actions array', async () => {
        const reply = '```actions\n[]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('handles multiple actions in one block', async () => {
        const reply =
          '```actions\n[{"action":"save_memory","text":"Mem1","type":"note"},{"action":"save_memory","text":"Mem2","type":"note"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(2);
      });

      it('skips unknown action types', async () => {
        const reply = '```actions\n[{"action":"unknown_action","data":"test"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('handles create_task with all fields', async () => {
        const reply =
          '```actions\n[{"action":"create_task","title":"Full task","priority":"urgent","dueDate":"2026-04-01","project":"Life","description":"Notes here"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
      });
    });

    describe('executeAIActions() — move_task', () => {
      it('moves a task to a different project', async () => {
        const reply = '```actions\n[{"action":"move_task","taskTitle":"Buy groceries","toProject":"Work"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(mockDeps.updateTask).toHaveBeenCalledWith('t1', { project: 'p2' });
      });

      it('does nothing when task not found', async () => {
        const reply = '```actions\n[{"action":"move_task","taskTitle":"nonexistent task xyz","toProject":"Work"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
        expect(mockDeps.updateTask).not.toHaveBeenCalled();
      });

      it('does nothing when target project not found', async () => {
        const reply =
          '```actions\n[{"action":"move_task","taskTitle":"Buy groceries","toProject":"Nonexistent Board"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
        expect(mockDeps.updateTask).not.toHaveBeenCalled();
      });

      it('does nothing when missing taskTitle', async () => {
        const reply = '```actions\n[{"action":"move_task","toProject":"Work"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('does nothing when missing toProject', async () => {
        const reply = '```actions\n[{"action":"move_task","taskTitle":"Buy groceries"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });
    });

    describe('executeAIActions() — add_subtasks', () => {
      it('adds subtasks to a task without existing subtasks', async () => {
        const reply =
          '```actions\n[{"action":"add_subtasks","taskTitle":"Buy groceries","subtasks":["Buy milk","Buy eggs"]}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        const task = store.tasks.find((t) => t.id === 't1');
        expect(task.subtasks).toHaveLength(2);
        expect(task.subtasks[0].title).toBe('Buy milk');
        expect(task.subtasks[0].done).toBe(false);
        expect(task.subtasks[1].title).toBe('Buy eggs');
        expect(task.subtasks[1].done).toBe(false);
        expect(mockDeps.saveData).toHaveBeenCalled();
      });

      it('appends to existing subtasks', async () => {
        store.tasks[0].subtasks = [{ id: 'existing', title: 'Existing step', done: true }];
        const reply =
          '```actions\n[{"action":"add_subtasks","taskTitle":"Buy groceries","subtasks":["New step"]}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(store.tasks[0].subtasks).toHaveLength(2);
        expect(store.tasks[0].subtasks[0].title).toBe('Existing step');
        expect(store.tasks[0].subtasks[1].title).toBe('New step');
      });

      it('does nothing when task not found', async () => {
        const reply =
          '```actions\n[{"action":"add_subtasks","taskTitle":"nonexistent xyz","subtasks":["Step 1"]}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('does nothing when missing taskTitle', async () => {
        const reply = '```actions\n[{"action":"add_subtasks","subtasks":["Step 1"]}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('does nothing when missing subtasks', async () => {
        const reply = '```actions\n[{"action":"add_subtasks","taskTitle":"Buy groceries"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });
    });

    describe('executeAIActions() — split_task', () => {
      it('splits a task into multiple tasks with confirmation', async () => {
        const reply =
          '```actions\n[{"action":"split_task","taskTitle":"Buy groceries","into":[{"title":"Buy produce","priority":"normal"},{"title":"Buy dairy","notes":"milk and cheese"}]}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(mockDeps.confirmAIAction).toHaveBeenCalledWith(expect.stringContaining('split'));
        // addTask called for each split part
        expect(mockDeps.addTask).toHaveBeenCalledTimes(2);
        // Original task removed from data
        expect(store.tasks.find((t) => t.id === 't1')).toBeUndefined();
        expect(mockDeps.saveData).toHaveBeenCalled();
      });

      it('inherits project from original task', async () => {
        const reply =
          '```actions\n[{"action":"split_task","taskTitle":"Buy groceries","into":[{"title":"Part A"}]}]\n```';
        await ctx.executeAIActions(reply);
        // createTask should be called with the original task's project
        const createTaskCall = mockDeps.addTask.mock.calls[0][0];
        expect(createTaskCall.project).toBe('p1');
      });

      it('does nothing when user declines confirmation', async () => {
        mockDeps.confirmAIAction.mockResolvedValue(false);
        const ctxDecline = createAIContext(mockDeps);
        const reply =
          '```actions\n[{"action":"split_task","taskTitle":"Buy groceries","into":[{"title":"Part A"},{"title":"Part B"}]}]\n```';
        const result = await ctxDecline.executeAIActions(reply);
        expect(result.applied).toBe(0);
        // Original task should still exist
        expect(store.tasks.find((t) => t.id === 't1')).toBeTruthy();
      });

      it('does nothing when task not found', async () => {
        const reply =
          '```actions\n[{"action":"split_task","taskTitle":"nonexistent xyz","into":[{"title":"Part A"}]}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('does nothing when missing taskTitle', async () => {
        const reply = '```actions\n[{"action":"split_task","into":[{"title":"Part A"}]}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('does nothing when missing into', async () => {
        const reply = '```actions\n[{"action":"split_task","taskTitle":"Buy groceries"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });
    });

    describe('executeAIActions() — batch_reschedule', () => {
      it('reschedules tasks by daysToAdd', async () => {
        const reply = '```actions\n[{"action":"batch_reschedule","filter":{"project":"Work"},"daysToAdd":3}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        // t2 has dueDate and is in project Work
        expect(mockDeps.updateTask).toHaveBeenCalledWith(
          't2',
          expect.objectContaining({ dueDate: expect.any(String) }),
        );
      });

      it('reschedules tasks to a specific newDate', async () => {
        const reply =
          '```actions\n[{"action":"batch_reschedule","filter":{"priority":"urgent"},"newDate":"2026-04-01"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(mockDeps.updateTask).toHaveBeenCalledWith('t2', { dueDate: '2026-04-01' });
      });

      it('does nothing when no filter provided', async () => {
        const reply = '```actions\n[{"action":"batch_reschedule","daysToAdd":3}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('filters by dueBefore', async () => {
        const reply =
          '```actions\n[{"action":"batch_reschedule","filter":{"dueBefore":"2026-03-20"},"daysToAdd":5}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(mockDeps.updateTask).toHaveBeenCalled();
      });

      it('skips when too many targets (>30)', async () => {
        for (let i = 0; i < 35; i++) {
          store.tasks.push({
            id: 'sched_' + i,
            title: 'Scheduled task ' + i,
            status: 'todo',
            priority: 'low',
            dueDate: '2026-03-20',
            project: 'p1',
          });
        }
        const reply = '```actions\n[{"action":"batch_reschedule","filter":{"priority":"low"},"daysToAdd":2}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('asks confirmation when more than 3 targets', async () => {
        for (let i = 0; i < 5; i++) {
          store.tasks.push({
            id: 'br_' + i,
            title: 'Reschedule me ' + i,
            status: 'todo',
            priority: 'low',
            dueDate: '2026-03-18',
            project: 'p1',
          });
        }
        const reply = '```actions\n[{"action":"batch_reschedule","filter":{"priority":"low"},"daysToAdd":2}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(mockDeps.confirmAIAction).toHaveBeenCalledWith(expect.stringContaining('reschedule'));
      });

      it('does nothing when confirmation declined for >3 targets', async () => {
        for (let i = 0; i < 5; i++) {
          store.tasks.push({
            id: 'brd_' + i,
            title: 'Decline me ' + i,
            status: 'todo',
            priority: 'low',
            dueDate: '2026-03-18',
            project: 'p1',
          });
        }
        mockDeps.confirmAIAction.mockResolvedValue(false);
        const ctxDecline = createAIContext(mockDeps);
        const reply = '```actions\n[{"action":"batch_reschedule","filter":{"priority":"low"},"daysToAdd":2}]\n```';
        const result = await ctxDecline.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('only targets tasks with due dates', async () => {
        // t1 has no dueDate, t2 has dueDate — only t2 should be targeted
        const reply = '```actions\n[{"action":"batch_reschedule","filter":{},"newDate":"2026-05-01"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(mockDeps.updateTask).toHaveBeenCalledTimes(1);
        expect(mockDeps.updateTask).toHaveBeenCalledWith('t2', { dueDate: '2026-05-01' });
      });
    });

    describe('executeAIActions() — query', () => {
      it('is a no-op that returns 0 applied and no insights', async () => {
        const reply = '```actions\n[{"action":"query","question":"what did I accomplish this week?"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
        expect(result.insights).toEqual([]);
      });

      it('does not call any mutation functions', async () => {
        const reply = '```actions\n[{"action":"query","question":"how many tasks are overdue?"}]\n```';
        await ctx.executeAIActions(reply);
        expect(mockDeps.updateTask).not.toHaveBeenCalled();
        expect(mockDeps.deleteTask).not.toHaveBeenCalled();
        expect(mockDeps.addTask).not.toHaveBeenCalled();
        expect(mockDeps.saveData).not.toHaveBeenCalled();
      });
    });

    describe('executeAIActions() — update_project', () => {
      it('updates project description', async () => {
        const reply =
          '```actions\n[{"action":"update_project","name":"Work","fields":{"description":"Updated work description"}}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(mockDeps.updateProject).toHaveBeenCalledWith('p2', { description: 'Updated work description' });
      });

      it('updates project color', async () => {
        const reply = '```actions\n[{"action":"update_project","name":"Life","fields":{"color":"#ff0000"}}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(mockDeps.updateProject).toHaveBeenCalledWith('p1', { color: '#ff0000' });
      });

      it('does nothing when project not found', async () => {
        const reply =
          '```actions\n[{"action":"update_project","name":"Nonexistent Board","fields":{"description":"test"}}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
        expect(mockDeps.updateProject).not.toHaveBeenCalled();
      });

      it('does nothing when missing name', async () => {
        const reply = '```actions\n[{"action":"update_project","fields":{"description":"test"}}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('does nothing when no allowed fields provided', async () => {
        const reply = '```actions\n[{"action":"update_project","name":"Work","fields":{"sneakyField":"hacked"}}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
        expect(mockDeps.updateProject).not.toHaveBeenCalled();
      });

      it('filters out disallowed fields', async () => {
        const reply =
          '```actions\n[{"action":"update_project","name":"Work","fields":{"description":"ok","sneaky":"bad"}}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(mockDeps.updateProject).toHaveBeenCalledWith('p2', { description: 'ok' });
      });
    });

    describe('executeAIActions() — update_background', () => {
      it('updates a background section on a project', async () => {
        const reply =
          '```actions\n[{"action":"update_background","project":"Work","section":"origin","content":"Started as a side project"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        expect(mockDeps.updateProject).toHaveBeenCalledWith('p2', {
          background: expect.stringContaining('Started as a side project'),
        });
      });

      it('replaces existing section content', async () => {
        store.projects[1].background =
          "## Origin\nOld origin text\n## Where It's Going\nOld direction\n## Roadblocks\n\n## Next Steps\n\n## Notes\n";
        const reply =
          '```actions\n[{"action":"update_background","project":"Work","section":"origin","content":"New origin text"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        const call = mockDeps.updateProject.mock.calls[0];
        expect(call[1].background).toContain('New origin text');
        expect(call[1].background).not.toContain('Old origin text');
      });

      it('maps section keys to proper headers', async () => {
        const reply =
          '```actions\n[{"action":"update_background","project":"Work","section":"direction","content":"Going places"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        const call = mockDeps.updateProject.mock.calls[0];
        expect(call[1].background).toContain("Where It's Going");
      });

      it('creates default background when project has none', async () => {
        store.projects[1].background = undefined;
        const reply =
          '```actions\n[{"action":"update_background","project":"Work","section":"notes","content":"Some notes here"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(1);
        const call = mockDeps.updateProject.mock.calls[0];
        expect(call[1].background).toContain('## Origin');
        expect(call[1].background).toContain('Some notes here');
      });

      it('does nothing when project not found', async () => {
        const reply =
          '```actions\n[{"action":"update_background","project":"Nonexistent","section":"origin","content":"text"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
        expect(mockDeps.updateProject).not.toHaveBeenCalled();
      });

      it('does nothing when missing section', async () => {
        const reply = '```actions\n[{"action":"update_background","project":"Work","content":"text"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('does nothing when missing content', async () => {
        const reply = '```actions\n[{"action":"update_background","project":"Work","section":"origin"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });

      it('does nothing when missing project', async () => {
        const reply = '```actions\n[{"action":"update_background","section":"origin","content":"text"}]\n```';
        const result = await ctx.executeAIActions(reply);
        expect(result.applied).toBe(0);
      });
    });

    describe('buildAIContext() — full detail', () => {
      it('includes chat history in full mode', () => {
        // Re-create ctx with chat history
        const ctxFull = createAIContext({
          userKey: (k) => 'test_' + k,
          scheduleSyncToCloud: vi.fn(),
          getData: () => store,
          getChatHistory: () => [
            { role: 'user', content: 'What should I work on?', ts: Date.now() },
            { role: 'assistant', content: 'Focus on the urgent bug fix.', ts: Date.now() },
          ],
          activeTasks: (pid) => store.tasks.filter((t) => t.status !== 'done' && (!pid || t.project === pid)),
          doneTasks: (pid) => store.tasks.filter((t) => t.status === 'done' && (!pid || t.project === pid)),
          projectTasks: (pid) => store.tasks.filter((t) => t.project === pid),
          findTask: (id) => store.tasks.find((t) => t.id === id),
          findSimilarTask: () => null,
          findSimilarProject: () => null,
          isBlocked: () => false,
          callAI: vi.fn(),
          hasAI: () => true,
          updateTask: vi.fn(),
          deleteTask: vi.fn(),
          addTask: vi.fn(),
          createTask: (props) => ({ id: 'new_' + Date.now(), status: 'todo', priority: 'normal', ...props }),
          createProject: (props) => ({ id: 'np_' + Date.now(), color: '#818cf8', ...props }),
          addProject: vi.fn(),
          updateProject: vi.fn(),
          saveData: vi.fn(),
          pushUndo: vi.fn(),
          confirmAIAction: vi.fn().mockResolvedValue(true),
          enforceShortDesc: (d) => d.slice(0, 200),
        });
        const result = ctxFull.buildAIContext('all', null, 'full');
        expect(result).toContain('RECENT CONVERSATION');
        expect(result).toContain('What should I work on');
      });

      it('includes experience level for 100+ interactions', () => {
        for (let i = 0; i < 100; i++) ctx.incrementAIInteraction();
        const result = ctx.buildAIContext('all');
        expect(result).toContain('100+');
      });
    });
  });
});
