import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChat } from '../chat.js';

// Helper to build a mock deps object for createChat
function makeDeps(overrides = {}) {
  return {
    esc: vi.fn((s) => (s == null ? '' : String(s))),
    todayStr: vi.fn(() => '2026-03-15'),
    getData: vi.fn(() => ({ tasks: [], projects: [] })),
    hasAI: vi.fn(() => false),
    getAIEndpoint: vi.fn(() => ({ url: 'https://test.api/v1', headers: {} })),
    buildAIContext: vi.fn(() => 'context'),
    AI_PERSONA: 'You are a test assistant.',
    AI_ACTIONS_SPEC: '',
    executeAIActions: vi.fn(async () => ({ applied: 0, insights: [] })),
    incrementAIInteraction: vi.fn(),
    render: vi.fn(),
    callAI: vi.fn(async () => 'AI reply'),
    findTask: vi.fn(() => null),
    userKey: vi.fn((k) => `user1_${k}`),
    CHAT_HISTORY_KEY: 'chat_hist',
    getSettings: vi.fn(() => ({ aiModel: 'claude-haiku-4-5-20251001' })),
    ...overrides,
  };
}

describe('chat.js — createChat()', () => {
  let chat;
  let deps;

  beforeEach(() => {
    localStorage.clear();
    // Ensure DOM elements exist
    if (!document.getElementById('chatTitle')) {
      const titleEl = document.createElement('div');
      titleEl.id = 'chatTitle';
      document.getElementById('chatPanel').prepend(titleEl);
    }
    deps = makeDeps();
    chat = createChat(deps);
  });

  // ── Factory returns ─────────────────────────────────────────────────
  it('returns all expected functions', () => {
    const keys = [
      'toggleChat',
      'sendChat',
      'sendChatChip',
      'updateChatChips',
      'openProjectChat',
      'chatTimeStr',
      'saveChatHistory',
      'getChatHistory',
      'getChatContext',
      'setChatContext',
      'getChatSessionStarted',
      'setChatSessionStarted',
      'setChatHistory',
      'offerStuckHelp',
      'resetChatState',
      'reloadChatHistory',
    ];
    keys.forEach((k) => expect(typeof chat[k]).toBe('function'));
  });

  // ── chatTimeStr ─────────────────────────────────────────────────────
  it('chatTimeStr formats the current time when called with no argument', () => {
    const ts = chat.chatTimeStr();
    // Should match something like "3:05 PM" or "15:05"
    expect(typeof ts).toBe('string');
    expect(ts.length).toBeGreaterThan(0);
  });

  it('chatTimeStr formats a specific date', () => {
    const d = new Date(2026, 0, 5, 14, 30);
    const ts = chat.chatTimeStr(d);
    expect(ts).toContain('30'); // minutes portion
  });

  // ── State accessors ────────────────────────────────────────────────
  it('getChatHistory returns an array', () => {
    expect(Array.isArray(chat.getChatHistory())).toBe(true);
  });

  it('setChatHistory replaces history', () => {
    chat.setChatHistory([{ role: 'user', content: 'hi' }]);
    expect(chat.getChatHistory()).toHaveLength(1);
    expect(chat.getChatHistory()[0].content).toBe('hi');
  });

  it('getChatContext starts null', () => {
    expect(chat.getChatContext()).toBeNull();
  });

  it('setChatContext sets the context value', () => {
    chat.setChatContext('proj_1');
    expect(chat.getChatContext()).toBe('proj_1');
  });

  it('getChatSessionStarted starts false', () => {
    expect(chat.getChatSessionStarted()).toBe(false);
  });

  it('setChatSessionStarted updates the flag', () => {
    chat.setChatSessionStarted(true);
    expect(chat.getChatSessionStarted()).toBe(true);
  });

  // ── resetChatState ─────────────────────────────────────────────────
  it('resetChatState clears history, context, and session flag', () => {
    chat.setChatHistory([{ role: 'user', content: 'test' }]);
    chat.setChatContext('proj_1');
    chat.setChatSessionStarted(true);

    chat.resetChatState();

    expect(chat.getChatHistory()).toHaveLength(0);
    expect(chat.getChatContext()).toBeNull();
    expect(chat.getChatSessionStarted()).toBe(false);
  });

  // ── saveChatHistory ────────────────────────────────────────────────
  it('saveChatHistory persists to localStorage (up to 15 entries)', () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({
      role: 'user',
      content: `msg ${i}`,
    }));
    chat.setChatHistory(msgs);
    chat.saveChatHistory();

    const stored = JSON.parse(localStorage.getItem('user1_chat_hist'));
    expect(stored).toHaveLength(15);
  });

  it('saveChatHistory trims in-memory history to 100', () => {
    const msgs = Array.from({ length: 120 }, (_, i) => ({
      role: 'user',
      content: `msg ${i}`,
    }));
    chat.setChatHistory(msgs);
    chat.saveChatHistory();

    expect(chat.getChatHistory()).toHaveLength(100);
  });

  it('saveChatHistory handles localStorage errors gracefully', () => {
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    // Should not throw
    expect(() => chat.saveChatHistory()).not.toThrow();
    localStorage.setItem = origSetItem;
  });

  // ── reloadChatHistory ──────────────────────────────────────────────
  it('reloadChatHistory loads from localStorage', () => {
    localStorage.setItem('user1_chat_hist', JSON.stringify([{ role: 'assistant', content: 'hello from storage' }]));
    chat.reloadChatHistory();
    expect(chat.getChatHistory()).toHaveLength(1);
    expect(chat.getChatHistory()[0].content).toBe('hello from storage');
  });

  it('reloadChatHistory defaults to empty array for bad JSON', () => {
    localStorage.setItem('user1_chat_hist', 'NOT JSON!!!');
    chat.reloadChatHistory();
    expect(chat.getChatHistory()).toEqual([]);
  });

  // ── sendChat (guard clauses) ───────────────────────────────────────
  it('sendChat does nothing when input is empty', async () => {
    document.getElementById('chatInput').value = '';
    await chat.sendChat();
    // No messages should have been added
    expect(chat.getChatHistory()).toHaveLength(0);
  });

  it('sendChat does nothing when AI is not available', async () => {
    document.getElementById('chatInput').value = 'hello';
    deps.hasAI.mockReturnValue(false);
    await chat.sendChat();
    expect(chat.getChatHistory()).toHaveLength(0);
  });

  it('sendChat does nothing when already sending', async () => {
    document.getElementById('chatInput').value = 'hello';
    deps.hasAI.mockReturnValue(true);

    // Simulate a pending fetch by making it hang
    const neverResolve = new Promise(() => {});
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => neverResolve);

    // Start first send (will hang on fetch)
    const _p1 = chat.sendChat();

    // Try second send while first is in-flight
    document.getElementById('chatInput').value = 'second message';
    await chat.sendChat();
    // Second send should not add to history (only the first msg was added)
    expect(chat.getChatHistory()).toHaveLength(1);

    globalThis.fetch = origFetch;
  });

  it('sendChat adds user message to history', async () => {
    document.getElementById('chatInput').value = 'test message';
    deps.hasAI.mockReturnValue(true);

    // Mock fetch to return a non-streaming response
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ content: [{ text: 'AI response' }] }),
      }),
    );

    await chat.sendChat();

    expect(chat.getChatHistory().length).toBeGreaterThanOrEqual(1);
    expect(chat.getChatHistory()[0].role).toBe('user');
    expect(chat.getChatHistory()[0].content).toBe('test message');

    globalThis.fetch = origFetch;
  });

  it('sendChat clears input after sending', async () => {
    const input = document.getElementById('chatInput');
    input.value = 'test message';
    deps.hasAI.mockReturnValue(true);

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ content: [{ text: 'Reply' }] }),
      }),
    );

    await chat.sendChat();
    expect(input.value).toBe('');

    globalThis.fetch = origFetch;
  });

  it('sendChat handles fetch error (non-ok response)', async () => {
    document.getElementById('chatInput').value = 'hello';
    deps.hasAI.mockReturnValue(true);

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ error: { message: 'Server error' } }),
      }),
    );

    await chat.sendChat();

    // Should show error in chat
    const chatMsgs = document.getElementById('chatMessages');
    expect(chatMsgs.innerHTML).toContain('Error');

    globalThis.fetch = origFetch;
  });

  it('sendChat handles 429 rate limit error', async () => {
    document.getElementById('chatInput').value = 'hello';
    deps.hasAI.mockReturnValue(true);

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.reject(new Error('parse error')),
      }),
    );

    await chat.sendChat();

    const chatMsgs = document.getElementById('chatMessages');
    expect(chatMsgs.innerHTML).toContain('busy');

    globalThis.fetch = origFetch;
  });

  it('sendChat uses project context when chatContext is set', async () => {
    chat.setChatContext('proj_1');
    document.getElementById('chatInput').value = 'hello';
    deps.hasAI.mockReturnValue(true);

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ content: [{ text: 'Reply' }] }),
      }),
    );

    await chat.sendChat();

    expect(deps.buildAIContext).toHaveBeenCalledWith('project', 'proj_1', 'standard');

    globalThis.fetch = origFetch;
  });

  it('sendChat uses all context when chatContext is null', async () => {
    document.getElementById('chatInput').value = 'hello';
    deps.hasAI.mockReturnValue(true);

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ content: [{ text: 'Reply' }] }),
      }),
    );

    await chat.sendChat();

    expect(deps.buildAIContext).toHaveBeenCalledWith('all', null, 'standard');

    globalThis.fetch = origFetch;
  });

  it('sendChat processes AI actions from response', async () => {
    document.getElementById('chatInput').value = 'create a task';
    deps.hasAI.mockReturnValue(true);
    deps.executeAIActions.mockResolvedValue({ applied: 1, insights: [] });

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ content: [{ text: 'Done! ```actions\n[]\n```' }] }),
      }),
    );

    await chat.sendChat();

    expect(deps.executeAIActions).toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalled();

    globalThis.fetch = origFetch;
  });

  it('sendChat increments AI interaction counter', async () => {
    document.getElementById('chatInput').value = 'hello';
    deps.hasAI.mockReturnValue(true);

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ content: [{ text: 'Hi there' }] }),
      }),
    );

    await chat.sendChat();

    expect(deps.incrementAIInteraction).toHaveBeenCalled();

    globalThis.fetch = origFetch;
  });

  // ── sendChatChip ───────────────────────────────────────────────────
  it('sendChatChip sets the input value and calls sendChat', async () => {
    // sendChat shows no-AI message when hasAI is false, clearing input
    chat.sendChatChip('Plan my day');
    const msgs = document.getElementById('chatMessages');
    expect(msgs.innerHTML).toContain('Claude API key');
  });

  it('sendChatChip works when chatInput exists', () => {
    chat.sendChatChip('What is overdue?');
    const msgs = document.getElementById('chatMessages');
    expect(msgs.innerHTML).toContain('Claude API key');
  });

  // ── updateChatChips ────────────────────────────────────────────────
  it('updateChatChips shows chips when input is empty', () => {
    const chips = document.getElementById('chatChips');
    const input = document.getElementById('chatInput');
    input.value = '';
    chat.updateChatChips();
    expect(chips.style.display).toBe('flex');
  });

  it('updateChatChips hides chips when input has text', () => {
    const chips = document.getElementById('chatChips');
    const input = document.getElementById('chatInput');
    input.value = 'hello';
    chat.updateChatChips();
    expect(chips.style.display).toBe('none');
  });

  it('updateChatChips treats whitespace-only input as empty', () => {
    const chips = document.getElementById('chatChips');
    const input = document.getElementById('chatInput');
    input.value = '   ';
    chat.updateChatChips();
    expect(chips.style.display).toBe('flex');
  });

  // ── openProjectChat ────────────────────────────────────────────────
  it('openProjectChat sets chat context to the project', () => {
    deps.getData.mockReturnValue({
      tasks: [],
      projects: [{ id: 'proj_1', name: 'My Project' }],
    });
    chat.openProjectChat('proj_1');
    expect(chat.getChatContext()).toBe('proj_1');
  });

  it('openProjectChat updates chat title to project name', () => {
    deps.getData.mockReturnValue({
      tasks: [],
      projects: [{ id: 'proj_1', name: 'My Project' }],
    });
    chat.openProjectChat('proj_1');
    const titleEl = document.getElementById('chatTitle');
    expect(titleEl.textContent).toBe('Chat: My Project');
  });

  it('openProjectChat shows fallback title when project not found', () => {
    deps.getData.mockReturnValue({ tasks: [], projects: [] });
    chat.openProjectChat('nonexistent');
    const titleEl = document.getElementById('chatTitle');
    expect(titleEl.textContent).toBe('AI Assistant');
  });

  it('openProjectChat opens the chat panel', () => {
    deps.getData.mockReturnValue({ tasks: [], projects: [{ id: 'proj_1', name: 'Test' }] });
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    chat.openProjectChat('proj_1');
    expect(panel.classList.contains('open')).toBe(true);
  });

  it('openProjectChat focuses the chat input', () => {
    deps.getData.mockReturnValue({ tasks: [], projects: [{ id: 'proj_1', name: 'Test' }] });
    const input = document.getElementById('chatInput');
    const focusSpy = vi.spyOn(input, 'focus');
    chat.openProjectChat('proj_1');
    expect(focusSpy).toHaveBeenCalled();
  });

  // ── offerStuckHelp ─────────────────────────────────────────────────
  it('offerStuckHelp does nothing when task is not found', async () => {
    deps.findTask.mockReturnValue(null);
    await chat.offerStuckHelp('t_123');
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('offerStuckHelp does nothing when AI is unavailable', async () => {
    deps.findTask.mockReturnValue({ id: 't_1', title: 'Test task' });
    deps.hasAI.mockReturnValue(false);
    await chat.offerStuckHelp('t_1');
    expect(deps.callAI).not.toHaveBeenCalled();
  });

  it('offerStuckHelp calls AI and opens chat panel on success', async () => {
    const task = { id: 't_1', title: 'Stuck task', project: 'proj_1', notes: 'Some notes' };
    deps.findTask.mockReturnValue(task);
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('What specifically is blocking you?');
    deps.getData.mockReturnValue({
      tasks: [],
      projects: [{ id: 'proj_1', name: 'Work' }],
    });

    await chat.offerStuckHelp('t_1');

    expect(deps.callAI).toHaveBeenCalled();
    expect(chat.getChatContext()).toBe('proj_1');
    const panel = document.getElementById('chatPanel');
    expect(panel.classList.contains('open')).toBe(true);
  });

  it('offerStuckHelp saves chat history with user stub message and AI reply', async () => {
    const task = { id: 't_1', title: 'Stuck task' };
    deps.findTask.mockReturnValue(task);
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('Let me help you think through this.');
    deps.getData.mockReturnValue({ tasks: [], projects: [] });

    await chat.offerStuckHelp('t_1');

    const history = chat.getChatHistory();
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toContain('stuck');
    expect(history[1].role).toBe('assistant');
    expect(history[1].content).toContain('help you think');
  });

  it('offerStuckHelp handles AI error gracefully', async () => {
    const task = { id: 't_1', title: 'Stuck task' };
    deps.findTask.mockReturnValue(task);
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockRejectedValue(new Error('API error'));
    deps.getData.mockReturnValue({ tasks: [], projects: [] });

    // Should not throw
    await expect(chat.offerStuckHelp('t_1')).resolves.not.toThrow();
  });

  it('offerStuckHelp sets context to null when task has no project', async () => {
    const task = { id: 't_1', title: 'Stuck task' }; // no project
    deps.findTask.mockReturnValue(task);
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('What is blocking you?');
    deps.getData.mockReturnValue({ tasks: [], projects: [] });

    await chat.offerStuckHelp('t_1');
    expect(chat.getChatContext()).toBeNull();
  });

  it('offerStuckHelp includes subtask info in prompt when task has subtasks', async () => {
    const task = {
      id: 't_1',
      title: 'Complex task',
      subtasks: [
        { title: 'Step 1', done: true },
        { title: 'Step 2', done: false },
      ],
    };
    deps.findTask.mockReturnValue(task);
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('Which subtask is tricky?');
    deps.getData.mockReturnValue({ tasks: [], projects: [] });

    await chat.offerStuckHelp('t_1');

    const promptArg = deps.callAI.mock.calls[0][0];
    expect(promptArg).toContain('Step 1');
    expect(promptArg).toContain('Step 2');
  });

  // ── toggleChat ─────────────────────────────────────────────────────
  it('toggleChat opens the chat panel', () => {
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    chat.toggleChat();
    expect(panel.classList.contains('open')).toBe(true);
  });

  it('toggleChat closes an already-open chat panel', () => {
    const panel = document.getElementById('chatPanel');
    panel.classList.add('open');
    chat.toggleChat();
    expect(panel.classList.contains('open')).toBe(false);
  });

  it('toggleChat shows greeting on first open with no history', () => {
    // Create a fresh chat instance with clean DOM
    document.getElementById('chatMessages').innerHTML = '';
    const freshChat = createChat(deps);
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    freshChat.toggleChat();
    const messages = document.getElementById('chatMessages');
    expect(messages.innerHTML).toContain('chat-welcome-msg');
  });

  it('toggleChat shows existing history on first open', () => {
    chat.setChatHistory([
      { role: 'user', content: 'hello', ts: Date.now() },
      { role: 'assistant', content: 'hi there', ts: Date.now() },
    ]);
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    chat.toggleChat();
    const messages = document.getElementById('chatMessages');
    expect(messages.innerHTML).toContain('hello');
    expect(messages.innerHTML).toContain('hi there');
  });

  it('toggleChat sets session started on first open', () => {
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    chat.toggleChat();
    expect(chat.getChatSessionStarted()).toBe(true);
  });

  it('toggleChat does not re-render messages on subsequent opens', () => {
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    chat.toggleChat(); // first open
    panel.classList.remove('open');
    const msgsBefore = document.getElementById('chatMessages').innerHTML;
    chat.toggleChat(); // second open
    // session already started, should not re-render
    expect(document.getElementById('chatMessages').innerHTML).toBe(msgsBefore);
  });

  // ── Initial state from localStorage ───────────────────────────────
  it('initializes chat history from localStorage on creation', () => {
    localStorage.setItem('user1_chat_hist', JSON.stringify([{ role: 'user', content: 'persisted' }]));
    const chat2 = createChat(deps);
    expect(chat2.getChatHistory()).toHaveLength(1);
    expect(chat2.getChatHistory()[0].content).toBe('persisted');
  });

  it('initializes to empty array when localStorage has invalid JSON', () => {
    localStorage.setItem('user1_chat_hist', '{bad}');
    const chat2 = createChat(deps);
    expect(chat2.getChatHistory()).toEqual([]);
  });

  // ── getChatGreeting (tested via toggleChat) ────────────────────────
  it('toggleChat shows overdue warning in greeting when there are overdue tasks', () => {
    document.getElementById('chatMessages').innerHTML = '';
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Overdue task', status: 'todo', dueDate: '2026-03-01' }],
      projects: [],
    });
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    const freshChat = createChat(deps);
    freshChat.toggleChat();
    const messages = document.getElementById('chatMessages');
    expect(messages.innerHTML).toContain('overdue');
  });

  it('toggleChat shows productivity message when many tasks completed this week', () => {
    // Pin to Wednesday 2pm to avoid Monday/morning branch
    vi.useFakeTimers({ now: new Date(2026, 2, 18, 14, 0, 0) });
    document.getElementById('chatMessages').innerHTML = '';
    const recentDate = '2026-03-18';
    deps.getData.mockReturnValue({
      tasks: Array.from({ length: 6 }, (_, i) => ({
        id: `t_${i}`,
        title: `Done ${i}`,
        status: 'done',
        completedAt: recentDate + 'T10:00:00Z',
      })),
      projects: [],
    });
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    const freshChat = createChat(deps);
    freshChat.toggleChat();
    const messages = document.getElementById('chatMessages');
    expect(messages.innerHTML).toContain('productive');
    vi.useRealTimers();
  });

  it('toggleChat shows default greeting when nothing special', () => {
    // Pin to Wednesday 2pm to avoid Monday/morning branch
    vi.useFakeTimers({ now: new Date(2026, 2, 18, 14, 0, 0) });
    document.getElementById('chatMessages').innerHTML = '';
    deps.getData.mockReturnValue({ tasks: [], projects: [] });
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    const freshChat = createChat(deps);
    freshChat.toggleChat();
    const messages = document.getElementById('chatMessages');
    expect(messages.innerHTML).toContain('on your mind');
    vi.useRealTimers();
  });

  // ── maybeProactiveChat ────────────────────────────────────────────
  it('maybeProactiveChat does nothing when already triggered', () => {
    const freshDeps = makeDeps({
      hasAI: vi.fn(() => true),
      getStuckTasks: vi.fn(() => [{ id: 't_1', title: 'Stuck task', project: 'p_1' }]),
    });
    const freshChat = createChat(freshDeps);
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');

    freshChat.maybeProactiveChat(); // first call
    freshChat.maybeProactiveChat(); // second call should no-op

    expect(panel.classList.contains('open')).toBe(true);
    // History should only have 1 proactive message, not 2
    expect(freshChat.getChatHistory().length).toBe(1);
  });

  it('maybeProactiveChat does nothing when no AI', () => {
    const freshDeps = makeDeps({
      hasAI: vi.fn(() => false),
      getStuckTasks: vi.fn(() => [{ id: 't_1', title: 'Stuck', project: 'p_1' }]),
    });
    const freshChat = createChat(freshDeps);
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');

    freshChat.maybeProactiveChat();

    expect(panel.classList.contains('open')).toBe(false);
  });

  it('maybeProactiveChat does nothing when no stuck tasks', () => {
    const freshDeps = makeDeps({
      hasAI: vi.fn(() => true),
      getStuckTasks: vi.fn(() => []),
    });
    const freshChat = createChat(freshDeps);
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');

    freshChat.maybeProactiveChat();

    expect(panel.classList.contains('open')).toBe(false);
  });

  it('maybeProactiveChat does nothing when panel already open', () => {
    const freshDeps = makeDeps({
      hasAI: vi.fn(() => true),
      getStuckTasks: vi.fn(() => [{ id: 't_1', title: 'Stuck', project: 'p_1' }]),
    });
    const freshChat = createChat(freshDeps);
    const panel = document.getElementById('chatPanel');
    panel.classList.add('open');

    freshChat.maybeProactiveChat();

    // Should not have added to history since panel was already open
    expect(freshChat.getChatHistory().length).toBe(0);
  });

  it('maybeProactiveChat opens panel with stuck task message on success', () => {
    const freshDeps = makeDeps({
      hasAI: vi.fn(() => true),
      getStuckTasks: vi.fn(() => [{ id: 't_1', title: 'Build landing page', project: 'p_1' }]),
    });
    const freshChat = createChat(freshDeps);
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');

    freshChat.maybeProactiveChat();

    expect(panel.classList.contains('open')).toBe(true);
    expect(freshChat.getChatSessionStarted()).toBe(true);
    expect(freshChat.getChatContext()).toBe('p_1');
    const history = freshChat.getChatHistory();
    expect(history.length).toBe(1);
    expect(history[0].role).toBe('assistant');
    expect(history[0].content).toContain('Build landing page');
    const messagesEl = document.getElementById('chatMessages');
    expect(messagesEl.innerHTML).toContain('Build landing page');
  });

  it('maybeProactiveChat sets context to null when stuck task has no project', () => {
    const freshDeps = makeDeps({
      hasAI: vi.fn(() => true),
      getStuckTasks: vi.fn(() => [{ id: 't_1', title: 'No project task' }]),
    });
    const freshChat = createChat(freshDeps);
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');

    freshChat.maybeProactiveChat();

    expect(freshChat.getChatContext()).toBeNull();
  });

  it('maybeProactiveChat handles getStuckTasks not being a function', () => {
    const freshDeps = makeDeps({
      hasAI: vi.fn(() => true),
      getStuckTasks: undefined,
    });
    const freshChat = createChat(freshDeps);
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');

    expect(() => freshChat.maybeProactiveChat()).not.toThrow();
    expect(panel.classList.contains('open')).toBe(false);
  });

  // ── getChatGreeting branches ──────────────────────────────────────
  it('toggleChat shows Monday morning greeting', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 16, 9, 0, 0) }); // March 16, 2026 is a Monday
    document.getElementById('chatMessages').innerHTML = '';
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Active task', status: 'todo' }],
      projects: [],
    });
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    const freshChat = createChat(deps);
    freshChat.toggleChat();
    const messages = document.getElementById('chatMessages');
    expect(messages.innerHTML).toContain('Fresh week');
    vi.useRealTimers();
  });

  it('toggleChat shows stale task greeting when tasks are old', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 18, 14, 0, 0) });
    document.getElementById('chatMessages').innerHTML = '';
    const oldDate = new Date(Date.now() - 15 * 86400000).toISOString();
    deps.getData.mockReturnValue({
      tasks: [{ id: 't_1', title: 'Very old stale task that needs attention', status: 'todo', createdAt: oldDate }],
      projects: [],
    });
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    const freshChat = createChat(deps);
    freshChat.toggleChat();
    const messages = document.getElementById('chatMessages');
    expect(messages.innerHTML).toContain('sitting for');
    vi.useRealTimers();
  });

  it('toggleChat shows unassigned task greeting when 3+ tasks have no project', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 18, 14, 0, 0) });
    document.getElementById('chatMessages').innerHTML = '';
    deps.getData.mockReturnValue({
      tasks: [
        { id: 't_1', title: 'Unassigned 1', status: 'todo' },
        { id: 't_2', title: 'Unassigned 2', status: 'todo' },
        { id: 't_3', title: 'Unassigned 3', status: 'todo' },
      ],
      projects: [],
    });
    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    const freshChat = createChat(deps);
    freshChat.toggleChat();
    const messages = document.getElementById('chatMessages');
    expect(messages.innerHTML).toContain('unassigned');
    vi.useRealTimers();
  });

  // ── toggleChat FAB visibility ─────────────────────────────────────
  it('toggleChat hides mobile FAB when opening', () => {
    const fab = document.getElementById('mobileChatFab');
    fab.classList.add('unread');
    fab.classList.remove('hidden');

    const panel = document.getElementById('chatPanel');
    panel.classList.remove('open');
    const freshChat = createChat(deps);
    freshChat.toggleChat();

    expect(fab.classList.contains('hidden')).toBe(true);
    expect(fab.classList.contains('unread')).toBe(false);
  });

  it('toggleChat shows mobile FAB when closing', () => {
    const fab = document.getElementById('mobileChatFab');
    fab.classList.add('hidden');

    const panel = document.getElementById('chatPanel');
    panel.classList.add('open');
    chat.toggleChat();

    expect(fab.classList.contains('hidden')).toBe(false);
  });

  // ── sendChat SSE streaming path ───────────────────────────────────
  it('sendChat handles SSE streaming response', async () => {
    document.getElementById('chatInput').value = 'hello';
    deps.hasAI.mockReturnValue(true);

    const encoder = new globalThis.TextEncoder();
    const sseData =
      'data: {"type":"content_block_delta","delta":{"text":"Hi "}}\ndata: {"type":"content_block_delta","delta":{"text":"there!"}}\n';

    let readerDone = false;
    const mockReader = {
      read: vi.fn(() => {
        if (!readerDone) {
          readerDone = true;
          return Promise.resolve({ done: false, value: encoder.encode(sseData) });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: { getReader: () => mockReader },
      }),
    );

    await chat.sendChat();

    const history = chat.getChatHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);
    const lastMsg = history[history.length - 1];
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toContain('Hi ');

    globalThis.fetch = origFetch;
  });

  // ── sendChat with applied actions but no clean reply text ─────────
  it('sendChat processes actions from non-streaming response and calls render', async () => {
    document.getElementById('chatInput').value = 'create a task';
    deps.hasAI.mockReturnValue(true);
    deps.executeAIActions.mockResolvedValue({ applied: 2, insights: [] });

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ content: [{ text: 'Done! ```actions\n[{"action":"create_task"}]\n```' }] }),
      }),
    );

    await chat.sendChat();

    expect(deps.executeAIActions).toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalled();
    expect(deps.incrementAIInteraction).toHaveBeenCalled();

    globalThis.fetch = origFetch;
  });

  // ── sendChat network error (TypeError) ────────────────────────────
  it('sendChat shows no internet message for TypeError', async () => {
    document.getElementById('chatInput').value = 'hello';
    deps.hasAI.mockReturnValue(true);

    const origFetch = globalThis.fetch;
    const typeError = new TypeError('Failed to fetch');
    globalThis.fetch = vi.fn(() => Promise.reject(typeError));

    await chat.sendChat();

    const chatMsgs = document.getElementById('chatMessages');
    expect(chatMsgs.innerHTML).toContain('No internet');

    globalThis.fetch = origFetch;
  });

  // ── Chat history backup/restore ─────────────────────────────────────
  it('resetChatState saves backup to localStorage before clearing', () => {
    const msgs = [
      { role: 'user', content: 'hello', ts: 1000 },
      { role: 'assistant', content: 'hi', ts: 2000 },
    ];
    chat.setChatHistory(msgs);
    chat.saveChatHistory();

    chat.resetChatState();

    const backup = JSON.parse(localStorage.getItem('user1_chat_hist_backup'));
    expect(backup).toHaveLength(2);
    expect(backup[0].content).toBe('hello');
    expect(chat.getChatHistory()).toHaveLength(0);
  });

  it('resetChatState does not save backup if history is empty', () => {
    chat.setChatHistory([]);
    chat.resetChatState();

    expect(localStorage.getItem('user1_chat_hist_backup')).toBeNull();
  });

  it('reloadChatHistory restores from backup when main history is empty', () => {
    const msgs = [{ role: 'user', content: 'saved', ts: 1000 }];
    localStorage.setItem('user1_chat_hist_backup', JSON.stringify(msgs));
    localStorage.removeItem('user1_chat_hist');

    chat.reloadChatHistory();

    expect(chat.getChatHistory()).toHaveLength(1);
    expect(chat.getChatHistory()[0].content).toBe('saved');
    // Should also persist to main key
    expect(JSON.parse(localStorage.getItem('user1_chat_hist'))).toHaveLength(1);
  });

  it('reloadChatHistory cleans up backup key after restoring', () => {
    localStorage.setItem('user1_chat_hist_backup', JSON.stringify([{ role: 'user', content: 'x', ts: 1 }]));
    localStorage.removeItem('user1_chat_hist');

    chat.reloadChatHistory();

    expect(localStorage.getItem('user1_chat_hist_backup')).toBeNull();
  });

  it('reloadChatHistory does NOT use backup when main history exists', () => {
    const main = [{ role: 'user', content: 'main', ts: 1000 }];
    const backup = [{ role: 'user', content: 'backup', ts: 500 }];
    localStorage.setItem('user1_chat_hist', JSON.stringify(main));
    localStorage.setItem('user1_chat_hist_backup', JSON.stringify(backup));

    chat.reloadChatHistory();

    expect(chat.getChatHistory()).toHaveLength(1);
    expect(chat.getChatHistory()[0].content).toBe('main');
    // Backup should remain untouched
    expect(localStorage.getItem('user1_chat_hist_backup')).not.toBeNull();
  });

  it('offerStuckHelp appends to history instead of replacing', async () => {
    const existing = [
      { role: 'user', content: 'old msg', ts: 1000 },
      { role: 'assistant', content: 'old reply', ts: 2000 },
    ];
    chat.setChatHistory(existing);
    deps.findTask.mockReturnValue({ id: 't1', title: 'Fix bug', project: 'proj1' });
    deps.getData.mockReturnValue({ tasks: [], projects: [{ id: 'proj1', name: 'Work' }] });
    deps.hasAI.mockReturnValue(true);
    deps.callAI.mockResolvedValue('Try breaking it down.');

    await chat.offerStuckHelp('t1');

    const history = chat.getChatHistory();
    expect(history.length).toBeGreaterThanOrEqual(4);
    expect(history[0].content).toBe('old msg');
    expect(history[1].content).toBe('old reply');
    expect(history[2].content).toContain('Fix bug');
    expect(history[3].content).toBe('Try breaking it down.');
  });
});
