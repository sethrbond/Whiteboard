import { describe, it, expect } from 'vitest';
import { parseDumpResponse, enforceShortDesc, isComplexInput, parseQuickInput } from '../parsers.js';

describe('parsers.js', () => {
  describe('parseDumpResponse()', () => {
    it('parses valid JSON directly', () => {
      const result = parseDumpResponse('{"tasks": [{"title": "Test"}]}');
      expect(result).toEqual({ tasks: [{ title: 'Test' }] });
    });

    it('extracts JSON object from surrounding text', () => {
      const result = parseDumpResponse('Here is the result: {"tasks": [{"title": "Buy milk"}]} Hope that helps!');
      expect(result.tasks[0].title).toBe('Buy milk');
    });

    it('handles unclosed brackets by auto-closing', () => {
      const result = parseDumpResponse('{"tasks": [{"title": "Test"}');
      expect(result).toBeTruthy();
      expect(result.tasks).toBeDefined();
    });

    it('extracts array when no top-level object found', () => {
      const result = parseDumpResponse('Tasks: [{"title": "A"}, {"title": "B"}]');
      expect(result.tasks).toHaveLength(2);
    });

    it('extracts array-wrapped objects as fallback', () => {
      // When content has a valid array but no top-level object
      const result = parseDumpResponse('Here: [{"title": "A"}, {"title": "B"}] done');
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].title).toBe('A');
    });

    it('returns undefined for completely unparseable input', () => {
      const result = parseDumpResponse('This is just plain text with no JSON at all');
      expect(result).toBeUndefined();
    });

    it('handles empty string', () => {
      const result = parseDumpResponse('');
      expect(result).toBeUndefined();
    });

    it('parses nested structures correctly', () => {
      const input = JSON.stringify({
        tasks: [{ title: 'Task 1', subtasks: ['a', 'b'] }],
        project: { name: 'Work' },
      });
      const result = parseDumpResponse(input);
      expect(result.tasks[0].subtasks).toEqual(['a', 'b']);
      expect(result.project.name).toBe('Work');
    });
  });

  describe('enforceShortDesc()', () => {
    it('returns empty string for falsy input', () => {
      expect(enforceShortDesc('')).toBe('');
      expect(enforceShortDesc(null)).toBe('');
      expect(enforceShortDesc(undefined)).toBe('');
    });

    it('takes first sentence', () => {
      expect(enforceShortDesc('First sentence. Second sentence. Third.')).toBe('First sentence');
    });

    it('truncates at 80 chars on word boundary', () => {
      const long =
        'This is a very long description that goes on and on and should be truncated at a reasonable word boundary';
      const result = enforceShortDesc(long);
      expect(result.length).toBeLessThanOrEqual(80);
      expect(result).not.toMatch(/\s$/);
    });

    it('strips trailing punctuation clutter', () => {
      expect(enforceShortDesc('Do the thing —')).toBe('Do the thing');
      expect(enforceShortDesc('Setup the project;')).toBe('Setup the project');
      expect(enforceShortDesc('Fix bugs,')).toBe('Fix bugs');
    });

    it('handles short descriptions unchanged', () => {
      expect(enforceShortDesc('Buy milk')).toBe('Buy milk');
    });

    it('splits on ! and ? as sentence boundaries', () => {
      expect(enforceShortDesc('Done! Now move on.')).toBe('Done');
      expect(enforceShortDesc('Ready? Start working.')).toBe('Ready');
    });
  });

  describe('isComplexInput()', () => {
    it('returns false for short input', () => {
      expect(isComplexInput('hi')).toBe(false);
      expect(isComplexInput('')).toBe(false);
      expect(isComplexInput(null)).toBe(false);
    });

    it('detects complex verbs', () => {
      expect(isComplexInput('email John about the meeting')).toBe(true);
      expect(isComplexInput('schedule a call for tomorrow')).toBe(true);
      expect(isComplexInput('draft a proposal for the client')).toBe(true);
      expect(isComplexInput('remind me to call the dentist')).toBe(true);
      expect(isComplexInput('break down the project into phases')).toBe(true);
    });

    it('detects multi-part inputs', () => {
      expect(isComplexInput('buy groceries, and then pick up kids')).toBe(true);
      expect(isComplexInput('finish report, also send to manager')).toBe(true);
    });

    it('detects instruction patterns', () => {
      expect(isComplexInput('write the email and include the attachment')).toBe(true);
      expect(isComplexInput("prepare slides and don't forget the charts")).toBe(true);
    });

    it('returns false for simple task input', () => {
      expect(isComplexInput('buy groceries from the store')).toBe(false);
      expect(isComplexInput('fix the login page styling')).toBe(false);
    });
  });

  describe('parseQuickInput()', () => {
    it('parses plain text as normal priority', () => {
      const result = parseQuickInput('Buy groceries');
      expect(result.title).toBe('Buy groceries');
      expect(result.priority).toBe('normal');
    });

    it('detects !!! as urgent', () => {
      const result = parseQuickInput('Fix server !!! now');
      expect(result.priority).toBe('urgent');
      expect(result.title).not.toContain('!!!');
    });

    it('detects !! as important', () => {
      const result = parseQuickInput('Review PR !!');
      expect(result.priority).toBe('important');
      expect(result.title).not.toContain('!!');
    });

    it('detects "urgent" keyword', () => {
      const result = parseQuickInput('urgent fix the build');
      expect(result.priority).toBe('urgent');
      expect(result.title).not.toMatch(/urgent/i);
    });

    it('strips single ! without setting priority', () => {
      const result = parseQuickInput('Do the thing!');
      expect(result.priority).toBe('normal');
    });

    it('uses findSimilarProject for #tags when provided', () => {
      const mockProject = { id: 'p1', name: 'Work' };
      const result = parseQuickInput('Fix bug #work', {
        findSimilarProject: () => mockProject,
      });
      expect(result.quickProject).toEqual(mockProject);
      expect(result.title).not.toContain('#');
    });

    it('leaves #tags alone when no findSimilarProject provided', () => {
      const result = parseQuickInput('Fix bug #work');
      expect(result.quickProject).toBeNull();
    });

    it('cleans up trailing commas and extra spaces', () => {
      const result = parseQuickInput('  Do  this   thing  ,  ');
      expect(result.title).toBe('Do this thing');
    });

    it('handles empty input', () => {
      const result = parseQuickInput('');
      expect(result.title).toBe('');
      expect(result.priority).toBe('normal');
    });

    it('handles input with only priority markers', () => {
      const result = parseQuickInput('!!!');
      expect(result.priority).toBe('urgent');
    });

    it('parses date expressions from quick input', () => {
      const result = parseQuickInput('buy milk tomorrow');
      expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.title).not.toContain('tomorrow');
    });

    it('combines priority and date parsing', () => {
      const result = parseQuickInput('fix server !!! tomorrow');
      expect(result.priority).toBe('urgent');
      expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('handles #project with no match gracefully', () => {
      const result = parseQuickInput('task #nonexistent', {
        findSimilarProject: () => null,
      });
      expect(result.quickProject).toBeNull();
    });
  });

  describe('parseDumpResponse() — edge cases', () => {
    it('handles JSON with trailing commas', () => {
      const _result = parseDumpResponse('{"tasks": [{"title": "A"},]}');
      // Should either parse or return undefined, not throw
      expect(() => parseDumpResponse('{"tasks": [{"title": "A"},]}')).not.toThrow();
    });

    it('handles deeply nested JSON', () => {
      const input = JSON.stringify({
        tasks: [
          {
            title: 'Complex',
            subtasks: [{ id: 'st1', title: 'Sub', done: false }],
            tags: ['work', 'urgent'],
          },
        ],
        questions: ['What priority?'],
      });
      const result = parseDumpResponse(input);
      expect(result.tasks[0].tags).toEqual(['work', 'urgent']);
      expect(result.questions).toHaveLength(1);
    });

    it('handles JSON with markdown code fences', () => {
      const input = '```json\n{"tasks": [{"title": "Test"}]}\n```';
      const result = parseDumpResponse(input);
      expect(result).toBeTruthy();
    });

    it('handles null input', () => {
      expect(() => parseDumpResponse(null)).not.toThrow();
    });
  });

  describe('isComplexInput() — edge cases', () => {
    it('detects reorganize as complex verb', () => {
      expect(isComplexInput('reorganize my tasks by priority')).toBe(true);
    });

    it('detects long multi-sentence input', () => {
      const long =
        'I need to finish the report by Friday and send it to the team. Also make sure to update the dashboard.';
      expect(isComplexInput(long)).toBe(true);
    });

    it('returns false for moderate-length simple input', () => {
      expect(isComplexInput('update the project readme file')).toBe(false);
    });
  });

  describe('enforceShortDesc() — edge cases', () => {
    it('handles strings with only punctuation', () => {
      const result = enforceShortDesc('...');
      expect(result).toBeDefined();
    });

    it('handles very long single word', () => {
      const result = enforceShortDesc('a'.repeat(200));
      expect(result.length).toBeLessThanOrEqual(80);
    });

    it('preserves hyphens in words', () => {
      expect(enforceShortDesc('Set up CI-CD pipeline')).toBe('Set up CI-CD pipeline');
    });
  });
});
