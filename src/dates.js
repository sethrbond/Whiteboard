// ============================================================
// DATE UTILITIES — Pure, no state dependencies
// ============================================================

import { MS_PER_DAY } from './constants.js';

let _todayStrCache = '';
let _todayStrTs = 0;

export function todayStr() {
  const now = Date.now();
  if (now - _todayStrTs < 60000 && _todayStrCache) return _todayStrCache;
  const d = new Date();
  _todayStrCache =
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  _todayStrTs = now;
  return _todayStrCache;
}

export function localISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / MS_PER_DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff <= 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function relativeTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function parseNaturalDate(text) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const shortDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const shortMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let raw = text;
  let dueDate = '';

  // "today"
  if (/\btoday\b/i.test(raw)) {
    dueDate = localISO(today);
    raw = raw.replace(/\btoday\b/i, '').trim();
  }
  // "tomorrow"
  else if (/\btomorrow\b/i.test(raw)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    dueDate = localISO(d);
    raw = raw.replace(/\btomorrow\b/i, '').trim();
  }
  // "next week" (next Monday)
  else if (/\bnext\s+week\b/i.test(raw)) {
    const d = new Date(today);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7) || 7);
    dueDate = localISO(d);
    raw = raw.replace(/\bnext\s+week\b/i, '').trim();
  }
  // "end of month"
  else if (/\bend\s+of\s+month\b/i.test(raw)) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    dueDate = localISO(d);
    raw = raw.replace(/\bend\s+of\s+month\b/i, '').trim();
  }
  // "in N days/weeks"
  else if (/\bin\s+(\d+)\s+(day|days|week|weeks)\b/i.test(raw)) {
    const m = raw.match(/\bin\s+(\d+)\s+(day|days|week|weeks)\b/i);
    const n = parseInt(m[1]);
    const d = new Date(today);
    if (/week/i.test(m[2])) d.setDate(d.getDate() + n * 7);
    else d.setDate(d.getDate() + n);
    dueDate = localISO(d);
    raw = raw.replace(m[0], '').trim();
  }
  // "month day" or "month day, year"
  else {
    const monthPat = `(${monthNames.join('|')}|${shortMonths.join('|')})`;
    const mdMatch = raw.match(
      new RegExp(`\\b${monthPat}\\s+(\\d{1,2})(?:(?:st|nd|rd|th))?(?:[,\\s]+(\\d{4}))?\\b`, 'i'),
    );
    if (mdMatch) {
      let mi = monthNames.indexOf(mdMatch[1].toLowerCase());
      if (mi === -1) mi = shortMonths.indexOf(mdMatch[1].toLowerCase());
      const day = parseInt(mdMatch[2]);
      const year = mdMatch[3]
        ? parseInt(mdMatch[3])
        : new Date(today.getFullYear(), mi, day) >= today
          ? today.getFullYear()
          : today.getFullYear() + 1;
      const d = new Date(year, mi, day);
      if (!isNaN(d.getTime()) && d.getDate() === day) {
        dueDate = localISO(d);
        raw = raw.replace(mdMatch[0], '').trim();
      }
    }
  }
  // "M/D" or "M/D/YYYY"
  if (!dueDate) {
    const slashMatch = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
    if (slashMatch) {
      const mi = parseInt(slashMatch[1]) - 1,
        day = parseInt(slashMatch[2]);
      const year = slashMatch[3]
        ? parseInt(slashMatch[3])
        : new Date(today.getFullYear(), mi, day) >= today
          ? today.getFullYear()
          : today.getFullYear() + 1;
      const d = new Date(year, mi, day);
      if (!isNaN(d.getTime()) && d.getDate() === day && mi >= 0 && mi <= 11) {
        dueDate = localISO(d);
        raw = raw.replace(slashMatch[0], '').trim();
      }
    }
  }
  // Day names: "friday", "next monday", "next fri"
  if (!dueDate) {
    const dayMatch = raw.match(new RegExp(`\\b(?:next\\s+)?(${dayNames.join('|')}|${shortDays.join('|')})\\b`, 'i'));
    if (dayMatch) {
      const dayStr = dayMatch[1].toLowerCase();
      let targetDay = dayNames.indexOf(dayStr);
      if (targetDay === -1) targetDay = shortDays.indexOf(dayStr);
      if (targetDay !== -1) {
        const d = new Date(today);
        let diff = targetDay - d.getDay();
        if (dayMatch[0].toLowerCase().startsWith('next')) {
          if (diff <= 0) diff += 7;
          diff += 7;
        } else if (diff <= 0) {
          diff += 7;
        }
        d.setDate(d.getDate() + diff);
        dueDate = localISO(d);
        raw = raw.replace(dayMatch[0], '').trim();
      }
    }
  }

  return { dueDate, cleaned: raw };
}
