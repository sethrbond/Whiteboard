// ============================================================
// UTILITY FUNCTIONS — Pure, no state dependencies
// ============================================================

export function esc(s) {
  return s != null
    ? String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;')
    : '';
}

export function sanitizeAIHTML(s) {
  if (s == null) return '';
  let out = esc(String(s));
  out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.*?)\*/g, '<em>$1</em>');
  out = out.replace(/\n/g, '<br>');
  return out;
}

export function normalizeTitle(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleSimilarity(a, b) {
  const na = normalizeTitle(a),
    nb = normalizeTitle(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const wa = new Set(na.split(' ')),
    wb = new Set(nb.split(' '));
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union ? intersection / union : 0;
}

// SAFETY: callers must pre-escape `text` via esc() before passing to this function
export function highlightMatch(text, q) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + q.length) + '</mark>' + text.slice(idx + q.length);
}

export function genId(prefix = 't') {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export function chunkText(text, maxChars = 8000) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }
    let splitAt = -1;
    const searchWindow = remaining.slice(0, maxChars);
    const lastPara = searchWindow.lastIndexOf('\n\n');
    if (lastPara > maxChars * 0.3) {
      splitAt = lastPara + 2;
    }
    if (splitAt < 0) {
      const lastSentence = searchWindow.lastIndexOf('. ');
      if (lastSentence > maxChars * 0.3) {
        splitAt = lastSentence + 2;
      }
    }
    if (splitAt < 0) {
      const lastNL = searchWindow.lastIndexOf('\n');
      if (lastNL > maxChars * 0.3) {
        splitAt = lastNL + 1;
      }
    }
    if (splitAt < 0) {
      splitAt = maxChars;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

export function fmtEstimate(mins) {
  if (!mins || mins <= 0) return '';
  if (mins < 60) return mins + 'm';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
