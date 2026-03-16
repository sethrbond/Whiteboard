// ============================================================
// FOCUS MODE MODULE
// ============================================================
// Extracted from app.js — manages focus mode overlay, timer,
// session analytics, break timer, distraction log, and session goals

const FOCUS_HISTORY_KEY = 'wb_focus_history';
const MAX_FOCUS_SESSIONS = 30;
const POMODORO_MS = 25 * 60 * 1000; // 25 minutes
const BREAK_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Factory function to create focus mode functions.
 * @param {Object} deps - Dependencies from the main app
 * @returns {{ startFocus, openFocusView, renderFocusOverlay, completeFocusTask, skipFocusTask, closeFocus, getFocusTask, resetFocusState, getFocusStats, getFocusHistory, logDistraction, startBreakTimer, endBreak, setSessionGoal, handleGoalPick, handleGoalStart }}
 */
export function createFocusMode(deps) {
  const {
    $,
    esc,
    findTask,
    updateTask,
    activeTasks,
    matchTask,
    showToast,
    render,
    hasAI,
    callAI,
    buildAIContext,
    getAIMemory,
    PRIORITY_ORDER,
    AI_PERSONA_SHORT,
    getData,
    setModalTriggerEl,
    userKey,
  } = deps;

  // Module-local state
  let focusTask = null;
  let focusStartTime = null;
  let focusReason = '';
  let _focusSkipped = [];
  let _distractionCount = 0;
  let _sessionGoal = 0;
  let _sessionCompleted = 0;
  let _breakActive = false;
  let _breakEndTime = null;
  let _lastProjectId = null;
  let _currentAIExtras = null;

  // ── Analytics: Focus History ──────────────────────────────────

  function _storageKey() {
    return userKey ? userKey(FOCUS_HISTORY_KEY) : FOCUS_HISTORY_KEY;
  }

  function getFocusHistory() {
    try {
      return JSON.parse(localStorage.getItem(_storageKey()) || '[]');
    } catch (_e) {
      return [];
    }
  }

  function _saveFocusHistory(history) {
    try {
      localStorage.setItem(_storageKey(), JSON.stringify(history.slice(-MAX_FOCUS_SESSIONS)));
    } catch (_e) {
      /* quota exceeded */
    }
  }

  function _recordSession(taskId, taskTitle, completed) {
    const now = Date.now();
    const duration = focusStartTime ? Math.round((now - focusStartTime) / 1000) : 0;
    const session = {
      taskId,
      taskTitle: taskTitle || '',
      startedAt: focusStartTime ? new Date(focusStartTime).toISOString() : new Date().toISOString(),
      endedAt: new Date(now).toISOString(),
      duration,
      completed,
      skipped: !completed,
      distractions: _distractionCount,
    };
    const history = getFocusHistory();
    history.push(session);
    _saveFocusHistory(history);
    return session;
  }

  function getFocusStats() {
    const history = getFocusHistory();
    if (!history.length) return null;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

    const completed = history.filter((s) => s.completed);
    const avgSessionLength = history.length
      ? Math.round(history.reduce((sum, s) => sum + (s.duration || 0), 0) / history.length)
      : 0;
    const completionRate = history.length ? Math.round((completed.length / history.length) * 100) : 0;

    // Today
    const todaySessions = history.filter((s) => s.startedAt && s.startedAt.slice(0, 10) === todayStr);
    const todayFocusTime = todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const todayCompleted = todaySessions.filter((s) => s.completed).length;

    // This week
    const weekSessions = history.filter((s) => s.startedAt && s.startedAt.slice(0, 10) >= weekAgo);
    const weekFocusTime = weekSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const weekCompleted = weekSessions.filter((s) => s.completed).length;
    const weekCompletionRate = weekSessions.length ? Math.round((weekCompleted / weekSessions.length) * 100) : 0;

    // Most productive hour (based on completed session end times)
    const hourCounts = {};
    completed.forEach((s) => {
      if (s.endedAt) {
        const h = new Date(s.endedAt).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      }
    });
    let mostProductiveHour = null;
    let maxCount = 0;
    for (const [h, count] of Object.entries(hourCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostProductiveHour = parseInt(h, 10);
      }
    }

    // Streak: consecutive days with at least 1 session
    let streak = 0;
    const daySet = new Set(history.map((s) => (s.startedAt ? s.startedAt.slice(0, 10) : null)).filter(Boolean));
    const checkDate = new Date(now);
    for (let i = 0; i < 365; i++) {
      const ds = checkDate.toISOString().slice(0, 10);
      if (daySet.has(ds)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (i === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      }
    }

    return {
      totalSessions: history.length,
      avgSessionLength,
      completionRate,
      todayFocusTime,
      todayCompleted,
      weekFocusTime,
      weekCompleted,
      weekCompletionRate,
      mostProductiveHour,
      streak,
    };
  }

  // ── Distraction Log ───────────────────────────────────────────

  function logDistraction() {
    _distractionCount++;
    const el = document.getElementById('focusDistractionCount');
    if (el) el.textContent = _distractionCount;
    showToast('Noted. Refocus!');
  }

  // ── Session Goal ──────────────────────────────────────────────

  function setSessionGoal(n) {
    _sessionGoal = Math.max(0, Math.min(n, 20));
    _sessionCompleted = 0;
  }

  // ── Break Timer ───────────────────────────────────────────────

  function startBreakTimer() {
    _breakActive = true;
    _breakEndTime = Date.now() + BREAK_MS;
    _renderBreakOverlay();
  }

  function _renderBreakOverlay() {
    $('#modalRoot').innerHTML = `<div class="modal-overlay focus-break-overlay">
    <div class="focus-break-container">
      <div class="focus-mode-label">Break Time</div>
      <div class="focus-break-message">Take a breather. Stretch, hydrate, look away from the screen.</div>
      <div class="focus-timer-display" id="focusBreakTimer">5:00</div>
      ${_sessionGoal > 0 ? `<div class="focus-session-progress">Task ${_sessionCompleted} of ${_sessionGoal} completed</div>` : ''}
      <div class="focus-actions">
        <button class="btn btn-primary" data-action="end-break" style="padding:10px 24px">Skip Break</button>
        <button class="btn" data-action="close-focus">End Session</button>
      </div>
    </div>
  </div>`;

    if (window._focusInterval) clearInterval(window._focusInterval);
    window._focusInterval = setInterval(() => {
      const el = document.getElementById('focusBreakTimer');
      if (!el) {
        clearInterval(window._focusInterval);
        return;
      }
      const remaining = Math.max(0, Math.floor((_breakEndTime - Date.now()) / 1000));
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      if (remaining <= 0) {
        clearInterval(window._focusInterval);
        _breakActive = false;
        showToast('Break over! Ready for the next task?');
        _startFocusInternal(_lastProjectId);
      }
    }, 1000);
  }

  function endBreak() {
    _breakActive = false;
    if (window._focusInterval) clearInterval(window._focusInterval);
    _startFocusInternal(_lastProjectId);
  }

  // ── Session Goal Prompt ───────────────────────────────────────

  function _renderSessionGoalPrompt(projectId) {
    _lastProjectId = projectId || null;
    $('#modalRoot').innerHTML = `<div class="modal-overlay focus-break-overlay">
    <div class="focus-break-container">
      <div class="focus-mode-label">Focus Session</div>
      <div class="focus-break-message">How many tasks do you want to focus on?</div>
      <div style="display:flex;gap:10px;justify-content:center;margin:20px 0;align-items:center;flex-wrap:wrap">
        <button class="btn" data-action="focus-goal-pick" data-goal="0" style="padding:8px 16px">Just one</button>
        <button class="btn" data-action="focus-goal-pick" data-goal="3" style="padding:8px 16px">3 tasks</button>
        <button class="btn" data-action="focus-goal-pick" data-goal="4" style="padding:8px 16px">4 tasks</button>
        <input type="number" id="focusGoalCustom" min="1" max="20" placeholder="#" style="width:50px;padding:8px;border-radius:var(--radius-xs);border:1px solid var(--border);background:var(--surface2);color:var(--text);text-align:center;font-size:14px" aria-label="Custom task goal">
      </div>
      <div class="focus-actions">
        <button class="btn btn-primary" data-action="focus-goal-start" style="padding:10px 24px">Start Focusing</button>
        <button class="btn" data-action="close-focus">Cancel</button>
      </div>
    </div>
  </div>`;
  }

  function handleGoalPick(goal) {
    _sessionGoal = parseInt(goal, 10) || 0;
    _sessionCompleted = 0;
    _startFocusInternal(_lastProjectId);
  }

  function handleGoalStart() {
    const input = document.getElementById('focusGoalCustom');
    const custom = input ? parseInt(input.value, 10) : 0;
    if (custom > 0) {
      _sessionGoal = Math.min(custom, 20);
    }
    _sessionCompleted = 0;
    _startFocusInternal(_lastProjectId);
  }

  // ── Core Focus Flow ───────────────────────────────────────────

  async function startFocus(projectId) {
    _lastProjectId = projectId || null;
    if (_sessionGoal === 0 && _sessionCompleted === 0) {
      _renderSessionGoalPrompt(projectId);
      return;
    }
    await _startFocusInternal(projectId);
  }

  async function _startFocusInternal(projectId) {
    let active = projectId ? activeTasks(projectId) : activeTasks();
    if (_focusSkipped.length) active = active.filter((t) => !_focusSkipped.includes(t.id));
    if (!active.length) {
      _focusSkipped = [];
      showToast('No more tasks to focus on');
      closeFocus();
      return;
    }

    if (_sessionGoal > 0 && _sessionCompleted >= _sessionGoal) {
      const stats = getFocusStats();
      const todayMin = stats ? Math.round(stats.todayFocusTime / 60) : 0;
      showToast(`Session complete! ${_sessionCompleted} tasks done. ${todayMin} min focused today.`);
      closeFocus();
      render();
      return;
    }

    if (hasAI()) {
      showToast('\u2726 Picking your next focus...');
      const data = getData();
      const history = getFocusHistory();
      const skippedTitles = history.filter((s) => s.skipped).map((s) => s.taskTitle);

      const taskList = active
        .slice(0, 30)
        .map((t) => {
          const p = data.projects.find((x) => x.id === t.project);
          const wasSkipped = skippedTitles.includes(t.title);
          return `- "${t.title}" [${t.priority}]${t.dueDate ? ' due:' + t.dueDate : ''}${t.status === 'in-progress' ? ' [WIP]' : ''} ${p ? '(' + p.name + ')' : ''}${wasSkipped ? ' [PREVIOUSLY SKIPPED]' : ''}`;
        })
        .join('\n');

      try {
        const ctx = buildAIContext('all', null, 'minimal');
        const mem = getAIMemory();
        const memCtx = mem.length
          ? '\nUser preferences: ' +
            mem
              .filter((m) => m.type === 'preference')
              .map((m) => m.text)
              .join('; ')
          : '';

        const historyCtx =
          history.length > 0
            ? `\nFocus history: ${history.length} sessions, ${Math.round((history.filter((s) => s.completed).length / history.length) * 100)}% completion rate. Avg session: ${Math.round(history.reduce((s, h) => s + (h.duration || 0), 0) / history.length / 60)} min.`
            : '';

        const reply = await callAI(
          `${AI_PERSONA_SHORT}

${ctx}${memCtx}${historyCtx}

Pick the ONE task this person should work on RIGHT NOW. Consider: urgency, deadlines, priority, momentum (prefer in-progress tasks), time of day.

Tasks:\n${taskList}

Return JSON: { "title": "exact task title", "reason": "one sentence why this one", "estimatedMinutes": number_or_null, "tip": "one motivational micro-tip for this task type", "skippedNote": "if previously skipped, acknowledge it in one sentence, else null" }`,
          { maxTokens: 350, temperature: 0.3 },
        );
        const json = JSON.parse(
          reply
            .replace(/```json?\s*/g, '')
            .replace(/```/g, '')
            .trim(),
        );
        const pick = (json.title || '').replace(/^["'\s]+|["'\s]+$/g, '').trim();
        const match =
          matchTask(pick) || active.find((t) => t.title.toLowerCase().includes(pick.toLowerCase().slice(0, 20)));
        if (match) {
          openFocusView(match.id, json.reason, {
            estimatedMinutes: json.estimatedMinutes,
            tip: json.tip,
            skippedNote: json.skippedNote,
          });
          return;
        }
      } catch (e) {
        console.error('Focus pick error:', e);
      }
    }

    const sorted = [...active].sort((a, b) => {
      if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority])
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      return 1;
    });
    openFocusView(sorted[0].id);
  }

  function openFocusView(taskId, reason, aiExtras) {
    setModalTriggerEl(document.activeElement);
    focusTask = taskId;
    focusStartTime = Date.now();
    focusReason = reason || '';
    _distractionCount = 0;
    _currentAIExtras = aiExtras || null;
    renderFocusOverlay();
  }

  function renderFocusOverlay() {
    const t = findTask(focusTask);
    if (!t) {
      closeFocus();
      return;
    }
    const data = getData();
    const proj = data.projects.find((p) => p.id === t.project);

    // Determine next incomplete subtask for step-by-step guidance
    let nextSubtaskId = null;
    if (t.subtasks && t.subtasks.length) {
      const next = t.subtasks.find((s) => !s.done);
      if (next) nextSubtaskId = next.id;
    }

    // AI extras display
    const extras = _currentAIExtras || {};
    const estimateHtml = extras.estimatedMinutes
      ? `<div class="focus-estimate">\u23F1 Est. ${extras.estimatedMinutes} min</div>`
      : '';
    const skippedHtml = extras.skippedNote ? `<div class="focus-skipped-note">${esc(extras.skippedNote)}</div>` : '';
    const tipHtml = extras.tip ? `<div class="focus-micro-tip">\u2728 ${esc(extras.tip)}</div>` : '';

    // Session progress
    const progressHtml =
      _sessionGoal > 0
        ? `<div class="focus-session-progress">Task ${_sessionCompleted + 1} of ${_sessionGoal}</div>`
        : '';

    // Check if we've passed 25 min mark
    const elapsed = focusStartTime ? Date.now() - focusStartTime : 0;
    const pomodoroReached = elapsed >= POMODORO_MS;

    $('#modalRoot').innerHTML = `<div class="modal-overlay focus-overlay">
    <div class="focus-container">
      <div class="focus-mode-label">Focus Mode</div>
      ${progressHtml}
      <div class="focus-task-title">${esc(t.title)}</div>
      ${focusReason ? `<div class="focus-reason">\u2726 ${esc(focusReason)}</div>` : ''}
      ${proj ? `<div class="focus-project" style="color:${proj.color}">${esc(proj.name)}</div>` : ''}
      ${skippedHtml}
      ${estimateHtml}
      <div id="focusCoachTip" class="focus-coach-tip"></div>
      ${tipHtml}
      ${t.notes ? `<div class="focus-notes">${esc(t.notes)}</div>` : ''}
      ${
        t.subtasks && t.subtasks.length
          ? `<div class="focus-subtasks">${t.subtasks
              .map((s) => {
                const isNext = s.id === nextSubtaskId;
                return `<div class="focus-subtask-row${isNext ? ' focus-subtask-next' : ''}" role="checkbox" aria-checked="${s.done}" aria-label="Mark subtask: ${esc(s.title)} complete" tabindex="0" data-action="toggle-subtask-focus" data-task-id="${t.id}" data-subtask-id="${s.id}">
          <div class="focus-subtask-check${s.done ? ' done' : ''}">${s.done ? '\u2713' : ''}</div>
          <span class="focus-subtask-title${s.done ? ' done' : ''}">${isNext && !s.done ? '\u25B6 ' : ''}${esc(s.title)}</span>
        </div>`;
              })
              .join('')}</div>`
          : ''
      }
      <div class="focus-timer-display${pomodoroReached ? ' focus-timer-complete' : ''}" id="focusTimer">0:00</div>
      ${pomodoroReached ? '<div class="focus-pomodoro-hint">25 min reached! Consider taking a break.</div>' : ''}
      <div class="focus-distraction-row">
        <button class="btn btn-ghost focus-distraction-btn" data-action="log-distraction" title="Log a distraction">
          Got distracted? <span id="focusDistractionCount">${_distractionCount}</span>
        </button>
      </div>
      <div class="focus-actions">
        <button class="btn btn-primary" data-action="complete-focus" style="padding:10px 24px">\u2713 Done</button>
        <button class="btn" data-action="skip-focus">Skip \u2192 Next</button>
        ${pomodoroReached ? '<button class="btn" data-action="start-break" style="color:var(--green)">Take Break</button>' : ''}
        <button class="btn" data-action="close-focus">Exit</button>
      </div>
    </div>
  </div>`;

    // AI coaching tip for focus mode
    if (hasAI() && !focusReason) {
      const focusTipEl = document.getElementById('focusCoachTip');
      if (focusTipEl) {
        focusTipEl.textContent = '\u2726 Thinking...';
        const focusPrompt = `${AI_PERSONA_SHORT}\n\nThe user just entered Focus Mode on: "${t.title}"${t.notes ? '\nNotes: ' + t.notes : ''}${t.subtasks?.length ? '\nSubtasks: ' + t.subtasks.map((s) => (s.done ? '\u2713' : '\u25CB') + ' ' + s.title).join(', ') : ''}\n\nGive ONE sentence of tactical advice to help them START right now. What's the very first action? Be specific and concrete. No preamble.`;
        callAI(focusPrompt, { maxTokens: 100 })
          .then((tip) => {
            if (focusTipEl) focusTipEl.textContent = '\u2726 ' + tip.replace(/\n/g, ' ').trim();
          })
          .catch((e) => {
            console.warn('AI call failed:', e.message);
            if (focusTipEl) focusTipEl.textContent = '';
          });
      }
    }

    // Start timer
    if (window._focusInterval) clearInterval(window._focusInterval);
    window._focusInterval = setInterval(() => {
      const el = document.getElementById('focusTimer');
      if (!el) {
        clearInterval(window._focusInterval);
        return;
      }
      const elapsedSec = Math.floor((Date.now() - focusStartTime) / 1000);
      const m = Math.floor(elapsedSec / 60);
      const s = elapsedSec % 60;
      el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      if (elapsedSec >= POMODORO_MS / 1000 && !el.classList.contains('focus-timer-complete')) {
        el.classList.add('focus-timer-complete');
        const breakBtn = document.querySelector('[data-action="start-break"]');
        if (!breakBtn) {
          const actionsDiv = el.closest('.focus-container')?.querySelector('.focus-actions');
          if (actionsDiv) {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.style.color = 'var(--green)';
            btn.setAttribute('data-action', 'start-break');
            btn.textContent = 'Take Break';
            actionsDiv.insertBefore(btn, actionsDiv.lastElementChild);
          }
        }
        const hint = document.querySelector('.focus-pomodoro-hint');
        if (!hint) {
          const hintEl = document.createElement('div');
          hintEl.className = 'focus-pomodoro-hint';
          hintEl.textContent = '25 min reached! Consider taking a break.';
          el.after(hintEl);
        }
      }
    }, 1000);
  }

  function completeFocusTask() {
    if (focusTask) {
      const t = findTask(focusTask);
      const session = _recordSession(focusTask, t ? t.title : '', true);
      updateTask(focusTask, { status: 'done' });
      _sessionCompleted++;

      const durationMin = Math.round(session.duration / 60);
      const distractMsg =
        _distractionCount > 0 ? ` with ${_distractionCount} distraction${_distractionCount > 1 ? 's' : ''}` : '';
      if (t) showToast(`\u2713 ${t.title} (${durationMin} min${distractMsg})`, false, true);

      // Check if should suggest break (25+ min session)
      if (session.duration >= POMODORO_MS / 1000) {
        focusTask = null;
        focusStartTime = null;
        if (window._focusInterval) clearInterval(window._focusInterval);
        render();
        startBreakTimer();
        return;
      }

      // If session goal set and not done, auto-continue
      if (_sessionGoal > 0 && _sessionCompleted < _sessionGoal) {
        focusTask = null;
        focusStartTime = null;
        _distractionCount = 0;
        if (window._focusInterval) clearInterval(window._focusInterval);
        $('#modalRoot').innerHTML = '';
        render();
        _startFocusInternal(_lastProjectId);
        return;
      }
    }
    // Prevent double-recording: null out before closeFocus
    focusTask = null;
    focusStartTime = null;
    closeFocus();
    render();
  }

  function skipFocusTask() {
    if (focusTask) {
      const t = findTask(focusTask);
      _recordSession(focusTask, t ? t.title : '', false);
      _focusSkipped.push(focusTask);
    }
    focusTask = null;
    focusStartTime = null;
    _distractionCount = 0;
    if (window._focusInterval) clearInterval(window._focusInterval);
    $('#modalRoot').innerHTML = '';
    _startFocusInternal(_lastProjectId);
  }

  function closeFocus() {
    // Record incomplete session if one was active
    if (focusTask && focusStartTime) {
      const t = findTask(focusTask);
      _recordSession(focusTask, t ? t.title : '', false);
    }
    focusTask = null;
    focusStartTime = null;
    _focusSkipped = [];
    _distractionCount = 0;
    _sessionGoal = 0;
    _sessionCompleted = 0;
    _breakActive = false;
    _currentAIExtras = null;
    if (window._focusInterval) clearInterval(window._focusInterval);
    $('#modalRoot').innerHTML = '';
  }

  function getFocusTask() {
    return focusTask;
  }

  function resetFocusState() {
    focusTask = null;
    focusStartTime = null;
    focusReason = '';
    _focusSkipped = [];
    _distractionCount = 0;
    _sessionGoal = 0;
    _sessionCompleted = 0;
    _breakActive = false;
    _currentAIExtras = null;
  }

  return {
    startFocus,
    openFocusView,
    renderFocusOverlay,
    completeFocusTask,
    skipFocusTask,
    closeFocus,
    getFocusTask,
    resetFocusState,
    getFocusStats,
    getFocusHistory,
    logDistraction,
    startBreakTimer,
    endBreak,
    setSessionGoal,
    handleGoalPick,
    handleGoalStart,
  };
}
