// parsers.js — Pure parsing/transformation functions (zero DOM, zero state)

import { parseNaturalDate } from './dates.js';

/**
 * Parse AI JSON response with fallbacks for malformed output.
 * Tries: direct parse → extract {...} → bracket-balance → extract [...] → individual objects.
 */
export function parseDumpResponse(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m)
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        const f = m[0];
        const stack = [];
        let inStr = false,
          esc = false;
        for (const ch of f) {
          if (esc) {
            esc = false;
            continue;
          }
          if (ch === '\\') {
            esc = true;
            continue;
          }
          if (ch === '"') {
            inStr = !inStr;
            continue;
          }
          if (inStr) continue;
          if (ch === '{' || ch === '[') stack.push(ch);
          else if (ch === '}' || ch === ']') stack.pop();
        }
        let suffix = '';
        while (stack.length) {
          const open = stack.pop();
          suffix += open === '{' ? '}' : ']';
        }
        try {
          parsed = JSON.parse(f + suffix);
        } catch (_e) {
          console.warn('AI response JSON repair failed:', _e.message || _e);
        }
      }
    if (!parsed) {
      const arrM = content.match(/\[[\s\S]*\]/);
      if (arrM)
        try {
          parsed = { tasks: JSON.parse(arrM[0]) };
        } catch (_e) {
          console.warn('AI response array parse failed:', _e.message || _e);
          const objs = content.match(/\{[^{}]*\}/g);
          if (objs)
            parsed = {
              tasks: objs
                .map((o) => {
                  try {
                    return JSON.parse(o);
                  } catch (_e) {
                    console.warn('AI response object parse failed:', _e.message || _e);
                    return null;
                  }
                })
                .filter(Boolean),
            };
        }
    }
  }
  return parsed;
}

/**
 * Truncate a description to a short, clean first sentence (≤80 chars).
 */
export function enforceShortDesc(desc) {
  if (!desc) return '';
  let s = desc.split(/[.!?]\s/)[0];
  if (s.length > 80) {
    s = s.slice(0, 80);
    const lastSpace = s.lastIndexOf(' ');
    if (lastSpace > 40) s = s.slice(0, lastSpace);
  }
  return s.replace(/[,;:\-–—]+$/, '').trim();
}

/**
 * Detect if input is complex enough to warrant AI processing.
 */
export function isComplexInput(text) {
  if (!text || text.length < 15) return false;
  const complexVerbs =
    /\b(email|send|draft|write|schedule|reschedule|move all|move everything|clear|reorganize|push back|remind me to|set up|plan out|break down)\b/i;
  const multiPart = /,\s*(and |then |also |plus )/i;
  const containsInstructions = /\b(include|attach|mention|make sure|don't forget)\b/i;
  return complexVerbs.test(text) || multiPart.test(text) || containsInstructions.test(text);
}

/**
 * Parse quick-capture input for priority markers, dates, and #project tags.
 * @param {string} raw - Raw user input
 * @param {object} opts
 * @param {function} opts.findSimilarProject - Project fuzzy-matcher (injected to avoid state coupling)
 * @returns {{ title: string, priority: string, dueDate: string, quickProject: object|null }}
 */
export function parseQuickInput(raw, { findSimilarProject } = {}) {
  let priority = 'normal';
  if (/!{3}|\burgent\b/i.test(raw)) {
    priority = 'urgent';
    raw = raw.replace(/!{3}|\burgent\b/gi, '').trim();
  } else if (/!{2}|\bimportant\b/i.test(raw)) {
    priority = 'important';
    raw = raw.replace(/!{2}|\bimportant\b/gi, '').trim();
  } else if (/!+/.test(raw)) {
    raw = raw.replace(/!+/g, '').trim();
  }

  const { dueDate, cleaned } = parseNaturalDate(raw);
  raw = cleaned;

  const projMatch = raw.match(/#(\S+)/);
  let quickProject = null;
  if (projMatch && findSimilarProject) {
    quickProject = findSimilarProject(projMatch[1]);
    raw = raw.replace(/#\S+/, '').trim();
  }

  raw = raw
    .replace(/[-,]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { title: raw, priority, dueDate, quickProject };
}
