// ============================================================
// PROACTIVE AI MODULE
// ============================================================
// Extracted from app.js — handles proactive AI features:
// daily briefing, day plan, proactive worker, nudges,
// reflections, stuck detection, recurring tasks, smart feed

import {
  MS_PER_DAY,
  AI_DELAY_MS,
  TRUNCATE_DESC,
  REFLECTION_TOAST_MS,
  STALE_TASK_DAYS,
  MAX_NUDGES,
} from './constants.js';

export const VAGUE_WORDS = ['organize', 'figure out', 'look into', 'deal with', 'work on'];
import { AI_PERSONA, AI_PERSONA_SHORT } from './ai-context.js';

const PROACTIVE_PATTERNS = [
  {
    regex: /\b(email|message|write to|reach out|contact|follow up with|reply to|send a message)\b/i,
    type: 'email',
    action: 'drafted email',
  },
  { regex: /\b(apply|application|submit|register|sign up|enroll)\b/i, type: 'application', action: 'pre-filled notes' },
  { regex: /\b(call|schedule|book|phone|arrange|meeting)\b/i, type: 'call', action: 'pre-filled notes' },
  {
    regex: /\b(research|look up|find|investigate|compare|evaluate|look into)\b/i,
    type: 'research',
    action: 'added research',
  },
  {
    regex: /\b(prepare|presentation|deck|outline|plan|organize|proposal)\b/i,
    type: 'prepare',
    action: 'broke down task',
  },
  { regex: /\b(draft|write|create doc|report)\b/i, type: 'document', action: 'drafted email' },
  { regex: /\b(review|check|audit|assess|inspect)\b/i, type: 'review', action: 'added research' },
];

/**
 * Factory function to create proactive AI functions.
 * @param {Object} deps - Dependencies from the main app
 * @returns {{ matchProactivePattern, saveProactiveLog, getAIPreparedTaskIds, filterAIPrepared, maybeProactiveEnhance, runProactiveWorker, planMyDay, snoozePlanTask, replanDay, generateAIBriefing, submitEndOfDay, getSmartNudges, nudgeFilterOverdue, nudgeFilterStale, nudgeFilterUnassigned, maybeReflect, showReflectionToast, getStuckTasks, processRecurringTasks, getAIStatusItems, getSmartFeedItems, extractMemoryInsights, trackNudgeInteraction, PROACTIVE_PATTERNS }}
 */
export function createProactive(deps) {
  const {
    $,
    esc,
    sanitizeAIHTML,
    todayStr,
    localISO,
    genId,
    getData,
    userKey,
    hasAI,
    callAI,
    buildAIContext,
    addAIMemory,
    findTask,
    updateTask,
    addTask,
    createTask,
    isBlocked,
    showToast,
    render,
    setView,
    notifyOverdueTasks,
    getProactiveLog,
    setProactiveLog,
    getProactiveRunning,
    setProactiveRunning,
    setBriefingGenerating,
    setPlanGenerating,
    setNudgeFilter,
    setProactiveResults,
    setPlanIndexCache,
  } = deps;

  // ── Memory Insights ─────────────────────────────────────────────────
  function extractMemoryInsights(memories) {
    const insights = {
      productive_time: null,
      avg_tasks_per_day: null,
      most_productive_day: null,
      task_order_preference: null,
      procrastination_types: [],
    };
    if (memories && memories.length) {
      for (const m of memories) {
        const txt = (m.text || '').toLowerCase();

        // productive_time
        if (!insights.productive_time) {
          if (
            txt.includes('morning') &&
            (txt.includes('most tasks') || txt.includes('productive') || txt.includes('completes'))
          )
            insights.productive_time = 'morning';
          else if (
            txt.includes('afternoon') &&
            (txt.includes('most tasks') || txt.includes('productive') || txt.includes('completes'))
          )
            insights.productive_time = 'afternoon';
          else if (
            txt.includes('evening') &&
            (txt.includes('most tasks') || txt.includes('productive') || txt.includes('completes'))
          )
            insights.productive_time = 'evening';
        }

        // avg_tasks_per_day
        if (insights.avg_tasks_per_day === null) {
          const avgMatch = txt.match(/(\d+(?:\.\d+)?)\s*tasks?\s*per\s*day/);
          if (avgMatch) insights.avg_tasks_per_day = parseFloat(avgMatch[1]);
        }

        // most_productive_day
        if (!insights.most_productive_day) {
          const dayMatch = txt.match(
            /most productive day.*?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i,
          );
          if (dayMatch)
            insights.most_productive_day = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1).toLowerCase();
        }

        // task_order_preference
        if (!insights.task_order_preference) {
          if (txt.includes('hard') && txt.includes('first')) insights.task_order_preference = 'hard-first';
          else if (txt.includes('easy') && txt.includes('first')) insights.task_order_preference = 'easy-first';
          else if (txt.includes('quick wins') && txt.includes('first')) insights.task_order_preference = 'easy-first';
        }

        // procrastination_types
        if (
          txt.includes('avoid') ||
          txt.includes('procrastinat') ||
          txt.includes('puts off') ||
          txt.includes('delays')
        ) {
          for (const pType of [
            'email',
            'call',
            'research',
            'writing',
            'planning',
            'review',
            'admin',
            'documentation',
          ]) {
            if (txt.includes(pType) && !insights.procrastination_types.includes(pType)) {
              insights.procrastination_types.push(pType);
            }
          }
        }
      }
    } // end if (memories && memories.length)

    // Derive avg_tasks_per_day from done tasks if not found in memories
    if (insights.avg_tasks_per_day === null) {
      try {
        const data = getData();
        const done = data.tasks.filter((t) => t.status === 'done' && t.completedAt);
        if (done.length >= 7) {
          const twoWeeksAgo = new Date(Date.now() - 14 * MS_PER_DAY).toISOString().slice(0, 10);
          const recentDone = done.filter((t) => t.completedAt.slice(0, 10) >= twoWeeksAgo);
          if (recentDone.length > 0) {
            insights.avg_tasks_per_day = Math.round((recentDone.length / 14) * 10) / 10;
          }
        }
      } catch (_e) {
        /* ignore data access errors */
      }
    }

    return insights;
  }

  function _buildInsightsPromptSection(insights) {
    const parts = [];
    if (insights.productive_time) parts.push('User is most productive in the ' + insights.productive_time + '.');
    if (insights.avg_tasks_per_day) parts.push('Averages ~' + insights.avg_tasks_per_day + ' tasks per day.');
    if (insights.most_productive_day) parts.push('Most productive on ' + insights.most_productive_day + 's.');
    if (insights.task_order_preference) parts.push('Prefers ' + insights.task_order_preference + ' approach.');
    if (insights.procrastination_types.length)
      parts.push('Tends to avoid: ' + insights.procrastination_types.join(', ') + ' tasks.');
    if (!parts.length) return '';
    return '\nUSER PATTERNS (from memory):\n' + parts.join('\n') + '\n';
  }

  // ── Nudge Interaction Tracking ──────────────────────────────────────
  function trackNudgeInteraction(nudgeType, acted) {
    const key = userKey('wb_nudge_interactions');
    let interactions = [];
    try {
      interactions = JSON.parse(localStorage.getItem(key) || '[]');
    } catch (_e) {
      /* ignore */
    }
    interactions.push({ type: nudgeType, acted: !!acted, ts: Date.now() });
    // Keep last 100 interactions
    if (interactions.length > 100) interactions = interactions.slice(-100);
    try {
      localStorage.setItem(key, JSON.stringify(interactions));
    } catch (_e) {
      /* ignore */
    }
    // Save insight to AI memory if we have enough data
    const typeInteractions = interactions.filter((i) => i.type === nudgeType);
    if (typeInteractions.length >= 5) {
      const actRate = typeInteractions.filter((i) => i.acted).length / typeInteractions.length;
      if (actRate > 0.7) {
        addAIMemory(
          'User consistently acts on "' + nudgeType + '" nudges (' + Math.round(actRate * 100) + '% action rate)',
          'pattern',
        );
      } else if (actRate < 0.2) {
        addAIMemory(
          'User mostly ignores "' + nudgeType + '" nudges (' + Math.round(actRate * 100) + '% action rate)',
          'pattern',
        );
      }
    }
  }

  function _getNudgeWeights() {
    const key = userKey('wb_nudge_interactions');
    let interactions = [];
    try {
      interactions = JSON.parse(localStorage.getItem(key) || '[]');
    } catch (_e) {
      /* ignore */
    }
    if (!interactions.length) return {};
    const weights = {};
    const types = [...new Set(interactions.map((i) => i.type))];
    for (const type of types) {
      const typeData = interactions.filter((i) => i.type === type);
      if (typeData.length < 3) continue;
      const actRate = typeData.filter((i) => i.acted).length / typeData.length;
      // Weight: 0.3 (ignored) to 1.5 (frequently acted on)
      weights[type] = 0.3 + actRate * 1.2;
    }
    return weights;
  }

  function matchProactivePattern(t) {
    return PROACTIVE_PATTERNS.find((p) => p.regex.test(t || ''));
  }

  function saveProactiveLog() {
    try {
      localStorage.setItem(userKey('wb_proactive_log_' + todayStr()), JSON.stringify(getProactiveLog()));
    } catch (_e) {
      console.warn('proactive log save failed:', _e.message || _e);
    }
  }

  function getAIPreparedTaskIds() {
    return new Set(getProactiveLog().map((l) => l.taskId));
  }

  function filterAIPrepared() {
    const ids = getAIPreparedTaskIds();
    if (!ids.size) {
      showToast('No AI-prepared tasks today');
      return;
    }
    const data = getData();
    const tasks = data.tasks.filter(function (t) {
      return ids.has(t.id) && t.status !== 'done';
    });
    if (!tasks.length) {
      showToast('No active AI-prepared tasks');
      return;
    }
    let h =
      '<div style="padding:20px"><h3 style="margin-bottom:16px;color:var(--accent)">AI Prepared Tasks (' +
      tasks.length +
      ')</h3>';
    tasks.forEach(function (t) {
      h +=
        '<div class="task-row" data-task="' +
        t.id +
        '" style="cursor:pointer" data-action="cmd-go-task" data-task-id="' +
        t.id +
        '" data-project-id=""><div class="task-body"><div class="task-title">' +
        esc(t.title) +
        '</div></div></div>';
    });
    h += '</div>';
    $('#modalRoot').innerHTML =
      '<div class="modal-overlay" data-action="close-modal" data-click-self="true"><div class="modal" style="max-width:600px">' +
      h +
      '</div></div>';
  }

  function maybeProactiveEnhance(tk) {
    if (!hasAI() || !tk) return;
    const m = matchProactivePattern(tk.title);
    if (!m) return;
    setTimeout(async () => {
      try {
        const data = getData();
        const t = data.tasks.find((x) => x.id === tk.id);
        if (!t || t.status === 'done' || (t.notes && t.notes.length > 50)) return;
        const r = await callAI('Draft:' + t.title + ' Type:' + m.type, {
          maxTokens: 2048,
          system:
            AI_PERSONA_SHORT +
            '\n\nDraft a brief, actionable expansion of this task. 2-3 bullet points max. No preamble.',
        });
        if (!r) return;
        updateTask(tk.id, { notes: (t.notes || '') + '\n**AI Draft:**\n' + r.trim() });
        const log = getProactiveLog();
        log.push({ taskId: tk.id, taskTitle: t.title, action: m.action, timestamp: Date.now() });
        setProactiveLog(log);
        saveProactiveLog();
        render();
      } catch (_e) {
        console.warn('proactive AI enhance failed:', _e.message || _e);
      }
    }, AI_DELAY_MS);
  }

  async function runProactiveWorker() {
    if (!hasAI()) return;
    const flagKey = userKey('whiteboard_proactive_' + todayStr());
    if (localStorage.getItem(flagKey)) return; // already ran today
    if (getProactiveRunning()) return;
    setProactiveRunning(true);
    localStorage.setItem(flagKey, '1'); // set early to prevent re-entry

    try {
      const _patterns = [
        {
          regex: /\b(email|write to|reach out|message|send a message|draft)\b/i,
          type: 'email',
          instruction:
            'Draft the email/message for them. Include a subject line, greeting, body, and sign-off. Be professional but warm. Use placeholders like [Name] where needed.',
        },
        {
          regex: /\b(apply|application|sign up|register|enroll)\b/i,
          type: 'application',
          instruction:
            'Find the most likely URL where they would go to do this. Provide the direct link and a brief step-by-step of what they will need (documents, info, etc.).',
        },
        {
          regex: /\b(call|schedule|book|phone)\b/i,
          type: 'call',
          instruction:
            'Write a brief call script or meeting agenda. Include key talking points, questions to ask, and any prep needed beforehand.',
        },
        {
          regex: /\b(research|look into|find|investigate|compare)\b/i,
          type: 'research',
          instruction:
            'Provide initial research findings. List key facts, options, pros/cons, or recommendations. Be specific and cite what you know.',
        },
        {
          regex: /\b(prepare|presentation|deck|outline|plan|proposal)\b/i,
          type: 'prepare',
          instruction:
            'Create a structured outline with sections, key points for each, and suggested content. Make it immediately usable as a starting framework.',
        },
      ];

      const data = getData();
      const proactiveLog = getProactiveLog();
      const candidates = data.tasks
        .filter((t) => {
          if (t.status === 'done') return false;
          if (t.notes && t.notes.length > 50) return false; // don't overwrite substantial notes
          if (proactiveLog.some((l) => l.taskId === t.id)) return false; // already enhanced
          return matchProactivePattern(t.title);
        })
        .slice(0, 10); // max 10 tasks per daily run

      if (candidates.length === 0) {
        setProactiveRunning(false);
        return;
      }

      // Build a single batched prompt for all candidates
      const taskDescriptions = candidates
        .map((t, i) => {
          const matched = matchProactivePattern(t.title);
          const proj = data.projects.find((p) => p.id === t.project);
          return `TASK ${i + 1}:
ID: ${t.id}
Title: ${t.title}
Project: ${proj ? proj.name : 'none'}
Current notes: ${t.notes || '(empty)'}
Type: ${matched.type}
Instruction: ${matched.instruction}`;
        })
        .join('\n\n');

      const prompt = `You are the user's productivity partner who already started the work. For each task below, generate the most useful head start. Be specific and actionable — write as if you've already begun doing the task for them.

${taskDescriptions}

Return ONLY a JSON array with one object per task, no other text:
[
  { "id": "task_id", "notes": "the pre-work content you generated" },
  ...
]

RULES:
- Each notes field should be 100-400 words of genuinely useful content
- If it's an email, write the full draft
- If it's an application, include the URL and steps
- If it's research, provide real findings
- If it's a call, write a script/agenda
- If it's preparation, write the outline
- Use markdown formatting (headers, bullets, bold) for readability
- Do NOT wrap in code fences`;

      const reply = await callAI(prompt, { maxTokens: 4096, temperature: 0.3 });
      const json = JSON.parse(
        reply
          .replace(/```json?\s*/g, '')
          .replace(/```/g, '')
          .trim(),
      );

      if (Array.isArray(json) && json.length) {
        let filled = 0;
        const log = getProactiveLog();
        for (const item of json) {
          const task = findTask(item.id);
          if (task && item.notes && (!task.notes || task.notes.length <= 50)) {
            const prefix = task.notes ? task.notes + '\n\n---\n**AI Draft:**\n' : '**AI Draft:**\n';
            updateTask(item.id, { notes: prefix + item.notes });
            const matched = matchProactivePattern(task.title);
            log.push({
              taskId: item.id,
              taskTitle: task.title,
              action: matched ? matched.action : 'pre-filled notes',
              timestamp: Date.now(),
            });
            filled++;
          }
        }
        if (filled > 0) {
          setProactiveLog(log);
          saveProactiveLog();
          setProactiveResults({
            count: filled,
            taskIds: json.map(function (x) {
              return x.id;
            }),
            date: todayStr(),
          });
          showToast(
            '\u2726 AI prepared ' + filled + ' task' + (filled > 1 ? 's' : '') + ' with smart suggestions',
            false,
          );
          render();
        }
      }
    } catch (err) {
      console.error('Proactive worker error:', err);
      // Silent failure — don't bother user with background worker errors
    } finally {
      setProactiveRunning(false);
    }
  }

  async function planMyDay() {
    if (!hasAI()) return;
    const data = getData();
    const active = data.tasks.filter((t) => t.status !== 'done');
    if (active.length === 0) {
      showToast('No active tasks to plan — add some tasks first');
      return;
    }
    const btn = document.getElementById('planBtn');
    if (btn)
      btn.innerHTML =
        '<span class="spinner" style="width:14px;height:14px;margin-right:6px;vertical-align:middle"></span>Planning...';

    const ctx = buildAIContext('all');
    const taskList = active
      .map((t) => {
        const proj = data.projects.find((p) => p.id === t.project);
        const est = t.estimatedMinutes ? `${t.estimatedMinutes}m` : 'no estimate';
        return `${t.id}|${t.title}|${t.priority}|${t.status}|${t.dueDate || 'no date'}|${proj ? proj.name : 'unassigned'}|${isBlocked(t) ? 'BLOCKED' : 'ready'}|${est}`;
      })
      .join('\n');

    const totalEstimated = active.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
    const estNote =
      totalEstimated > 0
        ? `\nTIME ESTIMATES: ${Math.round((totalEstimated / 60) * 10) / 10} hours of estimated work across all active tasks. Assume 6-8 productive hours available today — don't overload the plan.`
        : '';

    const memInsights =
      typeof deps.getAIMemory === 'function' ? extractMemoryInsights(deps.getAIMemory()) : extractMemoryInsights([]);
    const insightsSection = _buildInsightsPromptSection(memInsights);
    const orderHint =
      memInsights.task_order_preference === 'easy-first'
        ? '\n- User prefers easy/quick wins first to build momentum, then harder tasks.'
        : memInsights.task_order_preference === 'hard-first'
          ? '\n- User prefers tackling hard tasks first while energy is high.'
          : '';

    const prompt = `${AI_PERSONA}

Plan the user's day. Pick 5-8 tasks they should focus on TODAY, in the order they should do them.
${insightsSection}
${ctx}
${estNote}

ALL ACTIVE TASKS (id|title|priority|status|due|project|blocked|estimate):
${taskList}

RULES:
- Pick tasks that are ACTUALLY doable today — not blocked, not vague multi-day efforts
- Put urgent/overdue first, then high-impact, then quick wins
- Consider energy: harder tasks earlier, lighter tasks later${orderHint}
- Include at least one in-progress task (momentum matters)
- Skip blocked tasks
- If a task has subtasks, it's fine to include it — just note which subtask to start with
- Respect time estimates — don't plan more than 6-8 hours of work total. If tasks have estimates, keep the total under ~7 hours.

Return ONLY a JSON array, no other text:
[
  { "id": "task_id", "why": "brief reason — 8 words max" },
  ...
]`;

    try {
      const reply = await callAI(prompt, { maxTokens: 2048, temperature: 0.3 });
      const json = JSON.parse(
        reply
          .replace(/```json?\s*/g, '')
          .replace(/```/g, '')
          .trim(),
      );
      if (Array.isArray(json) && json.length) {
        // Validate IDs exist
        const valid = json.filter((p) => findTask(p.id));
        localStorage.setItem(userKey('whiteboard_plan_' + todayStr()), JSON.stringify(valid));
        setPlanIndexCache(null, ''); // invalidate sort cache
        render();
        showToast(`Day planned: ${valid.length} tasks`);
        notifyOverdueTasks();
      }
    } catch (err) {
      console.error('Plan error:', err);
      // Only show error toast if user manually triggered (button exists and says "Planning...")
      if (btn && btn.innerHTML.includes('Planning')) showToast('Planning failed — try again', true);
    }
    if (btn) btn.textContent = '◎ Plan My Day';
  }

  function snoozePlanTask(taskId) {
    const planKey = userKey('whiteboard_plan_' + todayStr());
    try {
      const plan = JSON.parse(localStorage.getItem(planKey) || '[]');
      const updated = plan.filter((p) => p.id !== taskId);
      localStorage.setItem(planKey, JSON.stringify(updated));
      setPlanIndexCache(null, '');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr =
        tomorrow.getFullYear() +
        '-' +
        String(tomorrow.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(tomorrow.getDate()).padStart(2, '0');
      updateTask(taskId, { dueDate: tomorrowStr });
      showToast('Snoozed to tomorrow');
      render();
    } catch (e) {
      console.warn('Snooze failed:', e);
    }
  }

  function replanDay() {
    localStorage.removeItem(userKey('whiteboard_plan_' + todayStr()));
    setPlanIndexCache(null, '');
    setBriefingGenerating(false); // not needed but safe
    setPlanGenerating(true);
    render();
    planMyDay().finally(() => {
      setPlanGenerating(false);
    });
  }

  async function generateAIBriefing() {
    if (!hasAI()) return;
    const btn = document.getElementById('briefingBtn');
    const body = document.getElementById('briefingBody');
    if (btn)
      btn.innerHTML =
        '<span class="spinner" style="width:14px;height:14px;margin-right:6px;vertical-align:middle"></span>Generating...';

    const ctx = buildAIContext('all');
    const briefingMemInsights =
      typeof deps.getAIMemory === 'function' ? extractMemoryInsights(deps.getAIMemory()) : extractMemoryInsights([]);
    const briefingInsightsSection = _buildInsightsPromptSection(briefingMemInsights);

    const prompt = `${AI_PERSONA}

You're not just summarizing — you're my partner. Think strategically about my day.
${briefingInsightsSection}
${ctx}

STRUCTURE (use all 4 sections, 1-2 bullets each):

**Right Now** — What needs immediate action? Be blunt about overdue and urgent items.

**Strategy** — Don't just list tasks. Tell me WHAT to do first and WHY. "Start with X because it unblocks Y" or "Batch these 3 quick ones to build momentum before tackling Z." Consider energy: hard tasks in the morning, quick wins in the afternoon.

**Flags** — Be my second brain. Call out: tasks that have been sitting too long, priorities that seem wrong, projects that are drifting, workload that's unsustainable, things I might be avoiding.

**Push** — One specific thing I should do today that I probably won't unless you tell me. Could be: break down a vague task, set a deadline on something that's been floating, reach out to someone, or just knock out that one annoying 5-minute task.

Be direct. Use task names. Under 200 words. No fluff. You're not a reporter — you're their assistant.`;

    try {
      let text = await callAI(prompt, { maxTokens: 1024, temperature: 0.3 });
      text = text.replace(/^[-•*]\s*/gm, '');
      const briefingKey = userKey('whiteboard_briefing_' + todayStr());
      localStorage.setItem(briefingKey, text);
      if (body) body.innerHTML = sanitizeAIHTML(text);
      if (btn) btn.textContent = 'Refresh with AI';
      notifyOverdueTasks();
    } catch (err) {
      if (btn) btn.textContent = 'Error — try again';
      showToast('Briefing failed — try again', true);
      console.error('Briefing error:', err);
    }
  }

  async function submitEndOfDay() {
    const input = document.getElementById('eodInput');
    const btn = document.getElementById('eodBtn');
    if (!input || !input.value.trim()) {
      showToast('Write a few words about your day first');
      return;
    }
    const userInput = input.value.trim();
    if (btn) btn.innerHTML = '<div class="spinner"></div> Reflecting...';
    const today = todayStr();
    const data = getData();
    const eodCompleted = data.tasks.filter(
      (t) => t.status === 'done' && t.completedAt && t.completedAt.slice(0, 10) === today,
    );
    const eodOpen = data.tasks.filter((t) => t.status !== 'done');
    const eodOverdue = eodOpen.filter((t) => t.dueDate && t.dueDate < today);
    const eodPrompt =
      AI_PERSONA_SHORT +
      '\n\nThe user is wrapping up their day. Here\'s what they said about today:\n"' +
      userInput +
      '"\n\nContext:\n- Completed today: ' +
      eodCompleted.map((t) => t.title).join(', ') +
      '\n- Still open: ' +
      eodOpen.length +
      ' tasks\n- Overdue: ' +
      eodOverdue.length +
      ' tasks\n\nRespond in 2-3 sentences. Acknowledge what was done. If they mentioned blockers or feelings, respond warmly. Suggest ONE thing for tomorrow morning. Be genuine, not performative.';
    try {
      const reply = await callAI(eodPrompt, { maxTokens: 512, temperature: 0.3 });
      localStorage.setItem(userKey('wb_eod_' + today), reply);
      addAIMemory(userInput + ' — AI: ' + reply.replace(/\n/g, ' ').slice(0, TRUNCATE_DESC), 'reflection');
      const card = document.getElementById('eodCard');
      if (card) {
        card.innerHTML =
          '<div class="eod-header"><span style="font-size:14px;color:var(--purple)">&#9790;</span><div class="eod-title">End of Day</div><span style="font-size:11px;color:var(--text3);margin-left:auto">Today</span></div><div class="eod-response">' +
          sanitizeAIHTML(reply) +
          '</div>';
      }
    } catch (err) {
      console.error('EOD error:', err);
      if (btn) btn.textContent = 'Error — try again';
      showToast('End of day reflection failed — try again', true);
    }
  }

  function getSmartNudges() {
    const today = todayStr();
    const nudges = [];
    const data = getData();
    const active = data.tasks.filter((t) => t.status !== 'done' && !t.archived);
    const done = data.tasks.filter((t) => t.status === 'done');
    const overdue = active.filter((t) => t.dueDate && t.dueDate < today);
    const inProgress = active.filter((t) => t.status === 'in-progress');
    const stale = active.filter((t) => {
      const lastTouch = t.updates?.length ? t.updates[t.updates.length - 1].date : t.createdAt;
      return lastTouch && Date.now() - new Date(lastTouch).getTime() > STALE_TASK_DAYS * MS_PER_DAY;
    });

    // Overload detection
    if (active.length > 30)
      nudges.push({
        type: 'warning',
        icon: '\u26A1',
        text: `${active.length} active tasks. Consider archiving some to stay focused.`,
      });

    // Stale tasks
    if (stale.length >= 3)
      nudges.push({
        type: 'stale',
        icon: '\uD83D\uDD78',
        text: `${stale.length} tasks untouched for 10+ days: ${stale
          .slice(0, 3)
          .map((t) => esc(t.title))
          .join(', ')}${stale.length > 3 ? '...' : ''}. Still relevant?`,
        actionLabel: 'Review stale',
        actionFn: `nudgeFilterStale()`,
      });

    // No tasks in progress
    if (inProgress.length === 0 && active.length > 0)
      nudges.push({
        type: 'action',
        icon: '\u25B6',
        text: `Nothing in progress yet. Pick one to get started.`,
        actionLabel: 'Start one',
        actionFn: `startFocus()`,
      });

    // Too many in progress
    if (inProgress.length > 5)
      nudges.push({
        type: 'warning',
        icon: '\uD83C\uDFAA',
        text: `${inProgress.length} tasks in progress at once. Try finishing some before starting more.`,
        actionLabel: 'Focus on one',
        actionFn: `startFocus()`,
      });

    // Overdue pileup
    if (overdue.length >= 3)
      nudges.push({
        type: 'urgent',
        icon: '\uD83D\uDD25',
        text: `${overdue.length} overdue tasks. Worth rescheduling ones you won't get to.`,
        actionLabel: 'Review overdue',
        actionFn: `nudgeFilterOverdue()`,
      });

    // Weekly completion count (no comparison)
    const weekAgo = new Date(Date.now() - 7 * MS_PER_DAY).toISOString().slice(0, 10);
    const doneThisWeek = done.filter((t) => t.completedAt && t.completedAt.slice(0, 10) >= weekAgo).length;
    if (doneThisWeek > 0)
      nudges.push({
        type: 'positive',
        icon: '\u2713',
        text: `${doneThisWeek} task${doneThisWeek === 1 ? '' : 's'} completed this week.`,
      });

    // Unassigned tasks
    const unassigned = active.filter((t) => !t.project);
    if (unassigned.length >= 3)
      nudges.push({
        type: 'action',
        icon: '\uD83D\uDCC2',
        text: `${unassigned.length} tasks without a project. Assigning them helps AI give better advice.`,
        actionLabel: 'Assign them',
        actionFn: `nudgeFilterUnassigned()`,
      });

    // Big tasks without subtasks
    const bigNoSubs = active.filter((t) => t.title.length > 40 && (!t.subtasks || t.subtasks.length === 0));
    if (bigNoSubs.length >= 2)
      nudges.push({
        type: 'action',
        icon: '\u2702',
        text: `"${esc(bigNoSubs[0].title.slice(0, 35))}..." looks complex. Break it into subtasks?`,
      });

    // Apply memory-based weighting to nudges
    const nudgeWeights = _getNudgeWeights();
    const weightedNudges = nudges.map((n) => {
      const weight = nudgeWeights[n.type] !== undefined ? nudgeWeights[n.type] : 1.0;
      return { ...n, _weight: weight };
    });
    weightedNudges.sort((a, b) => b._weight - a._weight);
    return weightedNudges.slice(0, MAX_NUDGES); // Max 4 nudges at a time
  }

  function nudgeFilterOverdue() {
    setNudgeFilter('overdue');
    setView('dashboard');
    render();
    showToast('Showing overdue tasks');
  }

  function nudgeFilterStale() {
    setNudgeFilter('stale');
    setView('dashboard');
    render();
    showToast('Showing stale tasks');
  }

  function nudgeFilterUnassigned() {
    setNudgeFilter('unassigned');
    setView('dashboard');
    render();
    showToast('Showing unassigned tasks');
  }

  function maybeReflect(t) {
    if (!hasAI()) return;
    // Significance-based: always reflect on important completions, rarely on trivial ones
    const daysSinceCreation = t.createdAt ? Math.floor((Date.now() - new Date(t.createdAt).getTime()) / MS_PER_DAY) : 0;
    const significance =
      (t.priority === 'urgent' ? 3 : t.priority === 'important' ? 2 : 0) +
      (t.subtasks && t.subtasks.length >= 3 ? 2 : 0) +
      (t.notes && t.notes.length > 50 ? 1 : 0) +
      (daysSinceCreation > 7 ? 2 : daysSinceCreation > 3 ? 1 : 0);
    const threshold = significance >= 4 ? 0 : significance >= 2 ? 0.5 : 0.85;
    if (Math.random() > 1 - threshold) return;

    const data = getData();
    const proj = data.projects.find((p) => p.id === t.project);
    const relatedActive = data.tasks.filter((x) => x.status !== 'done' && x.project === t.project && x.id !== t.id);

    const ctx = buildAIContext('all', null, 'minimal');
    const prompt = `${AI_PERSONA_SHORT}

${ctx}

The user just completed: "${t.title}"
${t.notes ? 'Notes: ' + t.notes : ''}
${proj ? 'Project: ' + proj.name : ''}
${
  relatedActive.length
    ? 'Still active in this project: ' +
      relatedActive
        .slice(0, 5)
        .map((x) => x.title)
        .join(', ')
    : 'No other active tasks in this project.'
}

Choose ONE of these responses (whichever fits best):
A) If this completion unlocks or enables something else → suggest what to do next. "Now that X is done, you could tackle Y."
B) If this was a big or long-running task → one sentence of genuine acknowledgment + what it means for the bigger picture.
C) If there's a pattern worth noticing → name it. "That's the third outreach task you've done this week — is networking becoming a focus?"
D) If the project is now nearly done → note it. "Only 2 tasks left in [project]. Finish line is close."
E) If nothing noteworthy → respond with just "✓" and nothing else.

ONE sentence max. Be genuine, not performative. No "Great job!" energy.`;

    callAI(prompt, { maxTokens: 100 })
      .then((reply) => {
        const clean = reply.replace(/\n/g, ' ').trim();
        if (clean && clean !== '✓' && clean.length > 2) {
          showReflectionToast(clean);
          // Save insightful reflections to AI memory
          if (clean.length > 20) {
            addAIMemory(clean, 'reflection');
          }
        }
      })
      .catch((e) => console.warn('AI call failed:', e.message));
  }

  function showReflectionToast(text) {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid var(--border);color:var(--text2);padding:12px 20px;border-radius:var(--radius);font-size:13px;z-index:var(--z-toast);max-width:420px;text-align:center;box-shadow:var(--shadow);line-height:1.4;animation:toastIn 0.3s ease';
    el.innerHTML = `<span style="color:var(--accent);margin-right:6px">✦</span>${esc(text)}`;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.5s';
      setTimeout(() => el.remove(), 500);
    }, REFLECTION_TOAST_MS);
  }

  function getStuckTasks() {
    const now = Date.now();
    const data = getData();
    return data.tasks.filter((t) => {
      if (t.status !== 'in-progress') return false;
      // In progress for 3+ days
      const lastTouch = t.updates?.length
        ? new Date(t.updates[t.updates.length - 1].date).getTime()
        : new Date(t.createdAt).getTime();
      const daysSince = (now - lastTouch) / MS_PER_DAY;
      if (daysSince < 3) return false;
      // Has subtasks but none completed recently
      if (t.subtasks?.length) {
        const doneCount = t.subtasks.filter((s) => s.done).length;
        if (doneCount === 0 || doneCount === t.subtasks.length) return false; // not started or all done
      }
      return true;
    });
  }

  function processRecurringTasks() {
    const today = todayStr();
    const data = getData();
    const recurring = data.tasks.filter((t) => t.recurrence && t.status === 'done' && t.completedAt);
    let created = 0;

    recurring.forEach((t) => {
      const completedDate = new Date(t.completedAt);
      const nextDate = new Date(completedDate);

      if (t.recurrence === 'daily') nextDate.setDate(nextDate.getDate() + 1);
      else if (t.recurrence === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (t.recurrence === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      else return;

      const nextStr = localISO(nextDate);
      if (nextStr > today) return; // Not due yet

      // Check if we already created a new instance
      const exists = data.tasks.find(
        (x) => x.title === t.title && x.project === t.project && x.status !== 'done' && x.recurrence === t.recurrence,
      );
      if (exists) return;

      const newTask = createTask({
        title: t.title,
        notes: t.notes,
        priority: t.priority,
        project: t.project,
        phase: t.phase,
        recurrence: t.recurrence,
        dueDate: nextStr,
        subtasks: (t.subtasks || []).map((s) => ({ id: genId('st'), title: s.title, done: false })),
      });
      addTask(newTask);
      created++;
    });

    if (created) showToast(`${created} recurring task${created > 1 ? 's' : ''} created`);
  }

  function getAIStatusItems() {
    const items = [];
    const flagKey = userKey('whiteboard_proactive_' + todayStr());
    const _proactiveRan = localStorage.getItem(flagKey);

    // Check proactive log for today
    const logKey = userKey('wb_proactive_log_' + new Date().toISOString().slice(0, 10));
    let _todayLog = [];
    try {
      _todayLog = JSON.parse(localStorage.getItem(logKey) || '[]');
    } catch (_e) {
      console.warn('proactive log parse failed:', _e.message || _e);
    }

    // Check how many tasks were AI-drafted today
    const data = getData();
    const draftedTasks = data.tasks.filter(
      (t) => t.notes && t.notes.startsWith('**AI Draft:**') && t.createdAt && t.createdAt.slice(0, 10) === todayStr(),
    );
    if (draftedTasks.length > 0) {
      items.push({
        icon: '\u2726',
        text: `Prepared ${draftedTasks.length} task${draftedTasks.length > 1 ? 's' : ''} with drafts`,
      });
    }

    // Check completions since last visit (tasks done by others or by automation)
    const completedToday = data.tasks.filter(
      (t) => t.status === 'done' && t.completedAt && t.completedAt.slice(0, 10) === todayStr(),
    );
    if (completedToday.length > 0) {
      items.push({
        icon: '\u2713',
        text: `${completedToday.length} task${completedToday.length > 1 ? 's' : ''} completed today`,
      });
    }

    // Check if briefing was generated
    const briefingKey = userKey('whiteboard_briefing_' + todayStr());
    if (localStorage.getItem(briefingKey)) {
      items.push({ icon: '\u25CE', text: 'Daily briefing ready' });
    }

    // Check if plan exists
    const planKey = userKey('whiteboard_plan_' + todayStr());
    if (localStorage.getItem(planKey)) {
      items.push({ icon: '\u25B6', text: 'Day plan prepared' });
    }

    return items;
  }

  // ============================================================
  // SMART DEFAULTS — AI-suggested fields on task creation
  // ============================================================
  function getSmartDefaults(title) {
    if (!title || !title.trim()) return {};
    const data = getData();
    const lower = title.toLowerCase();
    const result = {};
    const urgentKW = /\b(urgent|asap|deadline|emergency|critical|immediately|right now|time.?sensitive)\b/i;
    const importantKW = /\b(important|high.?priority|must|need to|essential|key|vital)\b/i;
    const lowKW = /\b(someday|maybe|eventually|low.?priority|nice to have|when I get around)\b/i;
    if (urgentKW.test(title)) {
      result.suggestedPriority = 'urgent';
    } else if (importantKW.test(title)) {
      result.suggestedPriority = 'important';
    } else if (lowKW.test(title)) {
      result.suggestedPriority = 'low';
    } else {
      const ct = data.tasks.filter((t) => t.status === 'done' && t.completedAt);
      const ws = lower.split(/\s+/).filter((w) => w.length > 3);
      if (ws.length > 0) {
        const pc = { urgent: 0, important: 0, normal: 0, low: 0 };
        let matched = 0;
        ct.forEach((t) => {
          const tl = t.title.toLowerCase();
          const ov = ws.filter((w) => tl.includes(w)).length;
          if (ov >= Math.max(1, ws.length * 0.4)) {
            pc[t.priority] = (pc[t.priority] || 0) + 1;
            matched++;
          }
        });
        if (matched >= 3) {
          const top = Object.entries(pc)
            .filter(([p]) => p !== 'normal')
            .sort((a, b) => b[1] - a[1])[0];
          if (top && top[1] >= matched * 0.5) result.suggestedPriority = top[0];
        }
      }
    }
    const doneT = data.tasks.filter((t) => t.status === 'done' && t.completedAt && t.createdAt);
    const words = lower.split(/\s+/).filter((w) => w.length > 3);
    if (words.length > 0 && doneT.length >= 5) {
      const durations = [];
      doneT.forEach((t) => {
        const tl = t.title.toLowerCase();
        const ov = words.filter((w) => tl.includes(w)).length;
        if (ov >= Math.max(1, words.length * 0.4)) {
          const d = Math.round((new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / MS_PER_DAY);
          if (d >= 0 && d <= 90) durations.push(d);
        }
      });
      if (durations.length >= 2) {
        durations.sort((a, b) => a - b);
        const med = durations[Math.floor(durations.length / 2)];
        const sd = Math.max(1, med);
        result.suggestedDueDate = localISO(new Date(Date.now() + sd * MS_PER_DAY));
        result.suggestedDueDays = sd;
      }
    }
    if (data.projects.length > 0) {
      let bestProj = null,
        bestScore = 0;
      data.projects.forEach((p) => {
        const pw = p.name.toLowerCase().split(/\s+/);
        let sc = 0;
        pw.forEach((w) => {
          if (w.length >= 3 && lower.includes(w)) sc += 2;
        });
        data.tasks
          .filter((t) => t.project === p.id)
          .forEach((t) => {
            const tl = t.title.toLowerCase();
            const ov = words.filter((w) => tl.includes(w)).length;
            if (ov >= Math.max(1, words.length * 0.3)) sc += 1;
          });
        if (sc > bestScore) {
          bestScore = sc;
          bestProj = p;
        }
      });
      if (bestProj && bestScore >= 2) {
        result.suggestedProject = bestProj.id;
        result.suggestedProjectName = bestProj.name;
      }
    }
    if (doneT.length >= 3) {
      const ests = [];
      doneT.forEach((t) => {
        if (!t.estimatedMinutes || t.estimatedMinutes <= 0) return;
        const tl = t.title.toLowerCase();
        const ov = words.filter((w) => tl.includes(w)).length;
        if (ov >= Math.max(1, words.length * 0.4)) ests.push(t.estimatedMinutes);
      });
      if (ests.length >= 2) {
        ests.sort((a, b) => a - b);
        result.suggestedEstimate = ests[Math.floor(ests.length / 2)];
      }
    }
    if (typeof deps.getAIMemory === 'function') {
      const mem = deps.getAIMemory();
      mem
        .filter((m) => m.type === 'pattern' || m.type === 'preference')
        .forEach((m) => {
          const ml = (m.text || '').toLowerCase();
          if (!result.suggestedPriority && ml.includes('always urgent') && words.some((w) => ml.includes(w)))
            result.suggestedPriority = 'urgent';
          if (!result.suggestedPriority && ml.includes('always important') && words.some((w) => ml.includes(w)))
            result.suggestedPriority = 'important';
        });
    }
    return result;
  }

  // ============================================================
  // TASK COMPLETION PREDICTIONS
  // ============================================================
  function predictCompletion(taskId) {
    const data = getData();
    const t = findTask(taskId);
    if (!t || t.status === 'done') return null;
    const today = todayStr();
    const ct = data.tasks.filter((x) => x.status === 'done' && x.completedAt && x.createdAt);
    const thirtyAgo = new Date(Date.now() - 30 * MS_PER_DAY).toISOString().slice(0, 10);
    const recentDone = ct.filter((x) => x.completedAt.slice(0, 10) >= thirtyAgo);
    const avgPerDay = recentDone.length / 30;
    const activeList = data.tasks.filter((x) => x.status !== 'done' && !x.archived);
    const activeCount = activeList.length;
    const pw = t.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const simDur = [];
    ct.forEach((x) => {
      const xl = x.title.toLowerCase();
      const ov = pw.filter((w) => xl.includes(w)).length;
      if (ov >= Math.max(1, pw.length * 0.3)) {
        const d = Math.round((new Date(x.completedAt).getTime() - new Date(x.createdAt).getTime()) / MS_PER_DAY);
        if (d >= 0 && d <= 90) simDur.push(d);
      }
    });
    const pf = { urgent: 0.7, important: 0.85, normal: 1.0, low: 1.3 }[t.priority] || 1.0;
    let estDays;
    if (simDur.length >= 2) {
      simDur.sort((a, b) => a - b);
      estDays = simDur[Math.floor(simDur.length / 2)] * pf;
    } else if (t.estimatedMinutes && avgPerDay > 0) {
      estDays = Math.ceil((t.estimatedMinutes / 240) * pf);
    } else {
      estDays = avgPerDay > 0 ? Math.ceil((activeCount / avgPerDay) * 0.3 * pf) : 7;
    }
    estDays = Math.max(1, Math.min(Math.round(estDays), 60));
    const startD = t.createdAt && t.createdAt.slice(0, 10) > today ? t.createdAt.slice(0, 10) : today;
    const estDate = new Date(new Date(startD + 'T12:00:00').getTime() + estDays * MS_PER_DAY);
    const estimatedDate = localISO(estDate);
    const blockers = [];
    if (isBlocked(t)) blockers.push('Task is blocked by dependencies');
    if (t.dueDate && t.dueDate < today) blockers.push('Already overdue');
    if (activeCount > 30) blockers.push('Heavy workload (' + activeCount + ' active tasks)');
    if (t.createdAt) {
      const dsc = Math.round((Date.now() - new Date(t.createdAt).getTime()) / MS_PER_DAY);
      if (dsc > 14 && t.status === 'todo') blockers.push('Untouched for ' + dsc + ' days');
    }
    let likelihood;
    if (blockers.length >= 2 || isBlocked(t)) likelihood = 'low';
    else if (blockers.length === 1 || estDays > 14 || activeCount > 20) likelihood = 'medium';
    else likelihood = 'high';
    return { likelihood, estimatedDate, estimatedDays: estDays, blockers };
  }

  // ============================================================
  // FOLLOW-UP SUGGESTIONS — after completing a task
  // ============================================================
  function getFollowUpSuggestions(completedTask) {
    if (!completedTask) return [];
    const data = getData();
    const suggestions = [];
    // 1. Tasks unblocked by this completion
    data.tasks
      .filter((t) => {
        if (t.status === 'done' || t.archived) return false;
        if (!t.blockedBy || !t.blockedBy.includes(completedTask.id)) return false;
        return t.blockedBy
          .filter((bid) => bid !== completedTask.id)
          .every((bid) => {
            const b = findTask(bid);
            return !b || b.status === 'done';
          });
      })
      .forEach((t) => {
        suggestions.push({
          type: 'unblocked',
          taskId: t.id,
          text: ' + t.title +  is no longer blocked — ready to start?',
        });
      });
    // 2. Related tasks in same project
    if (completedTask.project) {
      const spTasks = data.tasks.filter(
        (t) => t.id !== completedTask.id && t.project === completedTask.project && t.status !== 'done' && !t.archived,
      );
      const fw = completedTask.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      if (fw.length > 0 && spTasks.length > 0) {
        const scored = spTasks
          .map((t) => ({ task: t, score: fw.filter((w) => t.title.toLowerCase().includes(w)).length }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score);
        if (scored.length > 0 && !suggestions.find((s) => s.taskId === scored[0].task.id)) {
          suggestions.push({
            type: 'related',
            taskId: scored[0].task.id,
            text:
              'Since you finished "' +
              completedTask.title +
              '", you might want to tackle "' +
              scored[0].task.title +
              '" next',
          });
        }
      }
      if (!suggestions.find((s) => s.type === 'related') && spTasks.length > 0) {
        const po = { urgent: 0, important: 1, normal: 2, low: 3 };
        const sorted = [...spTasks].sort((a, b) => (po[a.priority] || 2) - (po[b.priority] || 2));
        if (!suggestions.find((s) => s.taskId === sorted[0].id)) {
          suggestions.push({
            type: 'related',
            taskId: sorted[0].id,
            text: 'Next up in this project: "' + sorted[0].title + '"',
          });
        }
      }
    }
    // 3. Project nearly done
    if (completedTask.project) {
      const rem = data.tasks.filter((t) => t.project === completedTask.project && t.status !== 'done' && !t.archived);
      if (rem.length > 0 && rem.length <= 3) {
        const proj = data.projects.find((p) => p.id === completedTask.project);
        suggestions.push({
          type: 'almost-done',
          text:
            'Only ' +
            rem.length +
            ' task' +
            (rem.length === 1 ? '' : 's') +
            ' left in ' +
            (proj ? proj.name : 'this project') +
            ' — finish line is close!',
        });
      }
    }
    return suggestions.slice(0, 3);
  }

  // == Mid-Day Check-In ==================================================

  function maybeShowCheckIn() {
    const hour = new Date().getHours();
    if (hour < 14 || hour >= 16) return '';
    const today = todayStr();
    const checkinKey = userKey('wb_checkin_' + today);
    if (localStorage.getItem(checkinKey)) return '';
    const planKey = userKey('whiteboard_plan_' + today);
    const planRaw = localStorage.getItem(planKey);
    if (!planRaw) return '';
    let plan;
    try {
      plan = JSON.parse(planRaw);
    } catch (_e) {
      return '';
    }
    if (!Array.isArray(plan) || plan.length === 0) return '';

    const planTasks = plan.map((p) => findTask(p.id)).filter(Boolean);
    const completed = planTasks.filter((t) => t.status === 'done');
    const remaining = planTasks.filter((t) => t.status !== 'done');
    const total = planTasks.length;
    const pct = total > 0 ? Math.round((completed.length / total) * 100) : 0;

    let h = '<div class="checkin-card">';
    h +=
      '<div class="checkin-header"><span style="font-size:14px">&#9745;</span><span class="checkin-title">Mid-Day Check-In</span><button class="btn btn-sm" data-action="checkin-dismiss" style="margin-left:auto;font-size:11px;padding:3px 10px">Dismiss</button></div>';
    h +=
      '<div class="checkin-progress"><div class="checkin-progress-bar"><div class="checkin-progress-fill" style="width:' +
      pct +
      '%"></div></div><span class="checkin-progress-label">' +
      pct +
      '% &mdash; ' +
      completed.length +
      '/' +
      total +
      ' done</span></div>';
    if (remaining.length > 0) {
      h +=
        '<div class="checkin-remaining"><div style="font-size:12px;color:var(--text3);margin-bottom:8px">Remaining tasks:</div>';
      remaining.forEach((t) => {
        h += '<div class="checkin-task-row">';
        h += '<span class="checkin-task-title">' + esc(t.title) + '</span>';
        h += '<div class="checkin-task-actions">';
        h +=
          '<button class="btn btn-sm" data-action="checkin-do-now" data-task-id="' +
          t.id +
          '" style="font-size:10px;padding:2px 8px">Do Now</button>';
        h +=
          '<button class="btn btn-sm" data-action="checkin-push-tomorrow" data-task-id="' +
          t.id +
          '" style="font-size:10px;padding:2px 8px">Push</button>';
        h +=
          '<button class="btn btn-sm" data-action="checkin-drop" data-task-id="' +
          t.id +
          '" style="font-size:10px;padding:2px 8px">Drop</button>';
        h += '</div></div>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function dismissCheckIn() {
    const today = todayStr();
    localStorage.setItem(userKey('wb_checkin_' + today), '1');
  }

  // == Auto Task Breakdown ===============================================

  function detectVagueTasks() {
    const data = getData();
    const now = Date.now();
    let dismissed = [];
    try {
      dismissed = JSON.parse(localStorage.getItem(userKey('wb_vague_dismissed')) || '[]');
    } catch (_e) {
      /* ignore */
    }
    const dismissedSet = new Set(dismissed);

    return (
      data.tasks.find((t) => {
        if (t.status === 'done' || t.archived) return false;
        if (t.subtasks && t.subtasks.length > 0) return false;
        if (dismissedSet.has(t.id)) return false;
        const titleLower = (t.title || '').toLowerCase();
        const isVague = t.title.length > 40 || VAGUE_WORDS.some((w) => titleLower.includes(w));
        if (!isVague) return false;
        const lastTouch = t.updates?.length
          ? new Date(t.updates[t.updates.length - 1].date).getTime()
          : new Date(t.createdAt).getTime();
        const daysSince = (now - lastTouch) / MS_PER_DAY;
        return daysSince >= 2;
      }) || null
    );
  }

  async function breakdownTask(taskId) {
    if (!hasAI()) {
      showToast('AI not available');
      return;
    }
    const task = findTask(taskId);
    if (!task) return;
    try {
      const prompt =
        'Break down this task into 3-6 concrete subtasks:\n"' +
        task.title +
        '"' +
        (task.notes ? '\nNotes: ' + task.notes : '') +
        '\n\nReturn ONLY a JSON array of strings, no other text:\n["subtask 1", "subtask 2", ...]';
      const reply = await callAI(prompt, { maxTokens: 1024, temperature: 0.3 });
      const subtasks = JSON.parse(
        reply
          .replace(/```json?\s*/g, '')
          .replace(/```/g, '')
          .trim(),
      );
      if (Array.isArray(subtasks) && subtasks.length > 0) {
        const existing = task.subtasks || [];
        const newSubs = subtasks.slice(0, 6).map((s) => ({ id: genId('st'), title: String(s), done: false }));
        updateTask(taskId, { subtasks: [...existing, ...newSubs] });
        showToast('Added ' + newSubs.length + ' subtask' + (newSubs.length > 1 ? 's' : ''));
        render();
      }
    } catch (err) {
      console.error('Breakdown error:', err);
      showToast('Breakdown failed \u2014 try again', true);
    }
  }

  function dismissVagueTask(taskId) {
    let dismissed = [];
    try {
      dismissed = JSON.parse(localStorage.getItem(userKey('wb_vague_dismissed')) || '[]');
    } catch (_e) {
      /* ignore */
    }
    dismissed.push(taskId);
    localStorage.setItem(userKey('wb_vague_dismissed'), JSON.stringify(dismissed));
  }

  function getSmartFeedItems() {
    const today = todayStr();
    const data = getData();
    const active = data.tasks.filter((t) => t.status !== 'done' && !t.archived);
    const weekFromNow = new Date(Date.now() + 7 * MS_PER_DAY).toISOString().slice(0, 10);

    // Check if there's a day plan — if so, exclude plan tasks from smart feed
    const planKey = userKey('whiteboard_plan_' + today);
    const cachedPlan = localStorage.getItem(planKey);
    let planTaskIds = new Set();
    if (cachedPlan) {
      try {
        const plan = JSON.parse(cachedPlan);
        planTaskIds = new Set(plan.map((p) => p.id));
      } catch (_e) {
        console.warn('proactive log parse failed:', _e.message || _e);
      }
    }

    // Build smart feed from task data (excluding plan tasks when a plan exists)
    const items = [];
    const seen = new Set();

    // 1. Overdue first
    const overdue = active.filter((t) => t.dueDate && t.dueDate < today && !planTaskIds.has(t.id));
    overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    overdue.forEach((t) => {
      if (!seen.has(t.id)) {
        items.push({ task: t, source: 'overdue' });
        seen.add(t.id);
      }
    });

    // 2. Urgent
    const urgent = active.filter((t) => t.priority === 'urgent' && !seen.has(t.id) && !planTaskIds.has(t.id));
    urgent.forEach((t) => {
      items.push({ task: t, source: 'urgent' });
      seen.add(t.id);
    });

    // 3. In progress
    const inProg = active.filter((t) => t.status === 'in-progress' && !seen.has(t.id) && !planTaskIds.has(t.id));
    inProg.forEach((t) => {
      items.push({ task: t, source: 'in-progress' });
      seen.add(t.id);
    });

    // 4. Due soon (this week)
    const dueSoon = active.filter(
      (t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekFromNow && !seen.has(t.id) && !planTaskIds.has(t.id),
    );
    dueSoon.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    dueSoon.forEach((t) => {
      items.push({ task: t, source: 'due-soon' });
      seen.add(t.id);
    });

    // 5. Due today
    const dueToday = active.filter((t) => t.dueDate === today && !seen.has(t.id) && !planTaskIds.has(t.id));
    dueToday.forEach((t) => {
      items.push({ task: t, source: 'due-today' });
      seen.add(t.id);
    });

    return items;
  }

  // ── Smart Auto-Reschedule ─────────────────────────────────────────

  function analyzeWorkload() {
    const data = getData();
    const active = data.tasks.filter(function (t) {
      return t.status !== 'done' && !t.archived;
    });
    const dailyTasks = {};
    const overloadedDays = [];
    const emptyDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const ds =
        d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const dayTasks = active.filter(function (t) {
        return t.dueDate === ds;
      });
      dailyTasks[ds] = dayTasks;
      if (dayTasks.length > 5) overloadedDays.push(ds);
      if (dayTasks.length === 0) emptyDays.push(ds);
    }
    const done = data.tasks.filter(function (t) {
      return t.status === 'done' && t.completedAt;
    });
    const twoWeeksAgo = new Date(Date.now() - 14 * MS_PER_DAY).toISOString().slice(0, 10);
    const recentDone = done.filter(function (t) {
      return t.completedAt.slice(0, 10) >= twoWeeksAgo;
    });
    const daysWithCompletions = {};
    recentDone.forEach(function (t) {
      const ds2 = t.completedAt.slice(0, 10);
      daysWithCompletions[ds2] = (daysWithCompletions[ds2] || 0) + 1;
    });
    const completionDays = Object.keys(daysWithCompletions).length;
    const avgCapacity = completionDays > 0 ? Math.round((recentDone.length / completionDays) * 10) / 10 : 5;
    return { dailyTasks: dailyTasks, overloadedDays: overloadedDays, emptyDays: emptyDays, avgCapacity: avgCapacity };
  }

  async function suggestReschedule() {
    const data = getData();
    const today = todayStr();
    const workload = analyzeWorkload();
    const candidates = data.tasks.filter(function (t) {
      return t.status !== 'done' && !t.archived && t.dueDate && t.dueDate <= today;
    });
    if (candidates.length === 0) return [];
    if (hasAI()) {
      const ctx = buildAIContext('all', null, 'minimal');
      const taskList = candidates
        .map(function (t) {
          const proj = data.projects.find(function (p) {
            return p.id === t.project;
          });
          return (
            t.id +
            '|' +
            t.title +
            '|' +
            t.priority +
            '|' +
            t.dueDate +
            '|' +
            (proj ? proj.name : 'none') +
            '|' +
            (t.estimatedMinutes || 0) +
            'm'
          );
        })
        .join('\n');
      const weekDays = Object.entries(workload.dailyTasks)
        .map(function (entry) {
          return entry[0] + ': ' + entry[1].length + ' tasks';
        })
        .join(', ');
      const prompt =
        ctx +
        "\n\nYou need to reschedule overdue/today tasks to balance the user's week.\n\nOVERDUE/TODAY TASKS (id|title|priority|dueDate|project|estimate):\n" +
        taskList +
        '\n\nCURRENT WEEK LOAD: ' +
        weekDays +
        '\nAverage daily capacity: ' +
        workload.avgCapacity +
        ' tasks/day\n\nRULES:\n- Spread tasks across the next 7 days, avoiding overload (max ' +
        Math.ceil(workload.avgCapacity) +
        ' tasks per day)\n- Urgent tasks should be moved to sooner days (tomorrow or day after)\n- Important tasks within 3 days, normal/low tasks can go further out\n- Keep estimated time per day reasonable\n- Give a brief reason for each suggestion (8 words max)\n\nReturn ONLY a JSON array:\n[{ "id": "task_id", "suggestedDate": "YYYY-MM-DD", "reason": "brief reason" }]';
      try {
        const reply = await callAI(prompt, { maxTokens: 2048, temperature: 0.3 });
        const json = JSON.parse(
          reply
            .replace(/```json?\s*/g, '')
            .replace(/```/g, '')
            .trim(),
        );
        if (Array.isArray(json)) {
          return json
            .map(function (item) {
              const task = findTask(item.id);
              if (!task) return null;
              return {
                taskId: item.id,
                taskTitle: task.title,
                currentDueDate: task.dueDate,
                suggestedDueDate: item.suggestedDate,
                reason: item.reason || 'AI-suggested rebalance',
              };
            })
            .filter(Boolean);
        }
      } catch (err) {
        console.error('AI reschedule failed, falling back to simple algorithm:', err);
      }
    }
    const priorityOrder = { urgent: 0, important: 1, normal: 2, low: 3 };
    const sorted = [...candidates].sort(function (a, b) {
      return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    });
    const suggestions = [];
    sorted.forEach(function (t, i) {
      const dayOffset = Math.floor(i / Math.max(Math.ceil(sorted.length / 3), 1)) + 1;
      const dd = new Date();
      dd.setDate(dd.getDate() + dayOffset);
      const suggestedDate =
        dd.getFullYear() +
        '-' +
        String(dd.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(dd.getDate()).padStart(2, '0');
      const reasons = {
        urgent: 'High priority \u2014 scheduled soon',
        important: 'Important \u2014 near-term slot',
        normal: 'Spread to balance load',
        low: 'Low priority \u2014 later slot',
      };
      suggestions.push({
        taskId: t.id,
        taskTitle: t.title,
        currentDueDate: t.dueDate,
        suggestedDueDate: suggestedDate,
        reason: reasons[t.priority] || 'Rebalanced across week',
      });
    });
    return suggestions;
  }

  function showRescheduleModal(suggestions) {
    if (!suggestions || suggestions.length === 0) {
      showToast('No tasks to reschedule');
      return;
    }
    let rows = '';
    suggestions.forEach(function (s, i) {
      rows +=
        '<tr class="reschedule-row" data-idx="' +
        i +
        '">' +
        '<td class="reschedule-cell reschedule-title">' +
        esc(s.taskTitle) +
        '</td>' +
        '<td class="reschedule-cell reschedule-date">' +
        s.currentDueDate +
        '</td>' +
        '<td class="reschedule-cell reschedule-date reschedule-suggested">' +
        s.suggestedDueDate +
        '</td>' +
        '<td class="reschedule-cell reschedule-reason">' +
        esc(s.reason) +
        '</td>' +
        '<td class="reschedule-cell reschedule-actions">' +
        '<button class="btn btn-sm reschedule-accept-btn" data-action="reschedule-accept" data-idx="' +
        i +
        '">Accept</button>' +
        '<button class="btn btn-sm reschedule-skip-btn" data-action="reschedule-skip" data-idx="' +
        i +
        '">Skip</button>' +
        '</td></tr>';
    });
    const html =
      '<div class="modal-overlay" data-action="close-modal" data-click-self="true">' +
      '<div class="modal reschedule-modal">' +
      '<div class="reschedule-header">' +
      '<span class="reschedule-icon">\uD83D\uDD04</span>' +
      '<div><h3 class="reschedule-heading">Rebalance Your Week</h3>' +
      '<p class="reschedule-subtext">AI suggests rescheduling ' +
      suggestions.length +
      ' task' +
      (suggestions.length > 1 ? 's' : '') +
      ' to balance your week</p></div>' +
      '</div>' +
      '<div class="reschedule-table-wrap"><table class="reschedule-table">' +
      '<thead><tr><th>Task</th><th>Current Due</th><th>Suggested Due</th><th>Reason</th><th></th></tr></thead>' +
      '<tbody id="rescheduleBody">' +
      rows +
      '</tbody>' +
      '</table></div>' +
      '<div class="reschedule-footer">' +
      '<button class="btn reschedule-accept-all-btn" data-action="reschedule-accept-all">Accept All</button>' +
      '<button class="btn reschedule-cancel-btn" data-action="close-modal">Cancel</button>' +
      '</div>' +
      '</div></div>';
    $('#modalRoot').innerHTML = html;
    const modal = document.querySelector('.reschedule-modal');
    if (modal) modal._suggestions = suggestions;
  }

  function acceptReschedule(idx) {
    const modal = document.querySelector('.reschedule-modal');
    if (!modal || !modal._suggestions) return;
    const s = modal._suggestions[idx];
    if (!s) return;
    updateTask(s.taskId, { dueDate: s.suggestedDueDate });
    const row = document.querySelector('.reschedule-row[data-idx="' + idx + '"]');
    if (row) {
      row.style.opacity = '0.4';
      row.style.textDecoration = 'line-through';
      row.querySelectorAll('button').forEach(function (b) {
        b.disabled = true;
      });
    }
    s._accepted = true;
  }

  function skipReschedule(idx) {
    const row = document.querySelector('.reschedule-row[data-idx="' + idx + '"]');
    if (row) row.remove();
    const modal = document.querySelector('.reschedule-modal');
    if (modal && modal._suggestions) modal._suggestions[idx] = null;
  }

  function acceptAllReschedules() {
    const modal = document.querySelector('.reschedule-modal');
    if (!modal || !modal._suggestions) return;
    let count = 0;
    modal._suggestions.forEach(function (s) {
      if (s && !s._accepted) {
        updateTask(s.taskId, { dueDate: s.suggestedDueDate });
        count++;
      }
    });
    $('#modalRoot').innerHTML = '';
    if (count > 0) {
      showToast('Rescheduled ' + count + ' task' + (count > 1 ? 's' : ''));
      render();
    }
  }

  async function autoRebalanceWeek() {
    const workload = analyzeWorkload();
    const today = todayStr();
    const data = getData();
    const overdueCount = data.tasks.filter(function (t) {
      return t.status !== 'done' && !t.archived && t.dueDate && t.dueDate < today;
    }).length;
    if (workload.overloadedDays.length === 0 && overdueCount === 0) {
      showToast('Your week looks balanced \u2014 no rebalancing needed');
      return;
    }
    showToast('Analyzing workload...', false);
    try {
      const suggestions = await suggestReschedule();
      if (suggestions.length === 0) {
        showToast('No tasks to reschedule');
        return;
      }
      showRescheduleModal(suggestions);
    } catch (err) {
      console.error('Rebalance error:', err);
      showToast('Rebalancing failed \u2014 try again', true);
    }
  }

  function isWeekOverloaded() {
    const data = getData();
    const today = todayStr();
    const overdueCount = data.tasks.filter(function (t) {
      return t.status !== 'done' && !t.archived && t.dueDate && t.dueDate < today;
    }).length;
    if (overdueCount >= 3) return true;
    const workload = analyzeWorkload();
    return workload.overloadedDays.length > 0;
  }

  return {
    matchProactivePattern,
    saveProactiveLog,
    getAIPreparedTaskIds,
    filterAIPrepared,
    maybeProactiveEnhance,
    runProactiveWorker,
    planMyDay,
    snoozePlanTask,
    replanDay,
    generateAIBriefing,
    submitEndOfDay,
    getSmartNudges,
    nudgeFilterOverdue,
    nudgeFilterStale,
    nudgeFilterUnassigned,
    maybeReflect,
    showReflectionToast,
    getStuckTasks,
    processRecurringTasks,
    getAIStatusItems,
    getSmartFeedItems,
    getSmartDefaults,
    predictCompletion,
    getFollowUpSuggestions,
    maybeShowCheckIn,
    dismissCheckIn,
    detectVagueTasks,
    breakdownTask,
    dismissVagueTask,
    analyzeWorkload,
    suggestReschedule,
    showRescheduleModal,
    acceptReschedule,
    skipReschedule,
    acceptAllReschedules,
    autoRebalanceWeek,
    isWeekOverloaded,
    extractMemoryInsights,
    trackNudgeInteraction,
    PROACTIVE_PATTERNS,
  };
}
