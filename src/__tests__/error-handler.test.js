import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createErrorHandler } from '../error-handler.js';

describe('error-handler.js — createErrorHandler()', () => {
  let handler;
  let onErrorSpy;

  beforeEach(() => {
    onErrorSpy = vi.fn();
    handler = createErrorHandler({ onError: onErrorSpy });
    // Clean up any recovery overlays from previous tests
    document.querySelectorAll('.recovery-overlay').forEach((el) => el.remove());
  });

  afterEach(() => {
    handler.destroy();
  });

  it('returns init, destroy, handleError, handleRejection, showRecoveryUI', () => {
    expect(typeof handler.init).toBe('function');
    expect(typeof handler.destroy).toBe('function');
    expect(typeof handler.handleError).toBe('function');
    expect(typeof handler.handleRejection).toBe('function');
    expect(typeof handler.showRecoveryUI).toBe('function');
  });

  describe('error counting and threshold', () => {
    it('increments error count on handleError', () => {
      const event = { message: 'test error', filename: 'test.js', lineno: 1 };
      handler.handleError(event);
      expect(handler.getErrorCount()).toBe(1);
    });

    it('increments error count on handleRejection', () => {
      const event = { reason: new Error('test'), preventDefault: vi.fn() };
      handler.handleRejection(event);
      expect(handler.getErrorCount()).toBe(1);
    });

    it('does not show recovery UI before MAX_ERRORS threshold', () => {
      for (let i = 0; i < 4; i++) {
        handler.handleError({ message: 'err', filename: '', lineno: 0 });
      }
      expect(handler.isRecoveryShowing()).toBe(false);
      expect(document.querySelector('.recovery-overlay')).toBeNull();
    });

    it('shows recovery UI after MAX_ERRORS (5) errors', () => {
      for (let i = 0; i < 5; i++) {
        handler.handleError({ message: 'err', filename: '', lineno: 0 });
      }
      expect(handler.isRecoveryShowing()).toBe(true);
      expect(document.querySelector('.recovery-overlay')).not.toBeNull();
    });

    it('counts mixed errors and rejections toward threshold', () => {
      for (let i = 0; i < 3; i++) {
        handler.handleError({ message: 'err', filename: '', lineno: 0 });
      }
      for (let i = 0; i < 2; i++) {
        handler.handleRejection({ reason: new Error('rej'), preventDefault: vi.fn() });
      }
      expect(handler.getErrorCount()).toBe(5);
      expect(handler.isRecoveryShowing()).toBe(true);
    });
  });

  describe('recovery UI', () => {
    it('creates overlay with correct structure', () => {
      handler.showRecoveryUI();
      const overlay = document.querySelector('.recovery-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay.getAttribute('role')).toBe('alert');
      expect(overlay.querySelector('.recovery-dialog')).not.toBeNull();
      expect(overlay.querySelector('h2').textContent).toBe('Something went wrong');
      expect(overlay.querySelector('p').textContent).toContain('Your data is safe');
    });

    it('has a reload button', () => {
      handler.showRecoveryUI();
      const btn = document.querySelector('.recovery-reload-btn');
      expect(btn).not.toBeNull();
      expect(btn.textContent).toBe('Reload App');
      expect(btn.type).toBe('button');
    });

    it('reload button calls window.location.reload', () => {
      const reloadMock = vi.fn();
      // jsdom does not allow redefining location.reload directly,
      // so we replace the entire location object.
      const originalLocation = window.location;
      delete window.location;
      window.location = { ...originalLocation, reload: reloadMock };

      handler.showRecoveryUI();
      document.querySelector('.recovery-reload-btn').click();
      expect(reloadMock).toHaveBeenCalled();

      window.location = originalLocation;
    });

    it('prevents duplicate recovery UI', () => {
      handler.showRecoveryUI();
      handler.showRecoveryUI();
      handler.showRecoveryUI();
      const overlays = document.querySelectorAll('.recovery-overlay');
      expect(overlays.length).toBe(1);
    });
  });

  describe('promise rejection handling', () => {
    it('calls preventDefault on rejection events', () => {
      const preventDefault = vi.fn();
      handler.handleRejection({ reason: new Error('test'), preventDefault });
      expect(preventDefault).toHaveBeenCalled();
    });

    it('calls onError callback for rejections', () => {
      const event = { reason: new Error('test'), preventDefault: vi.fn() };
      handler.handleRejection(event);
      expect(onErrorSpy).toHaveBeenCalledWith(event);
    });
  });

  describe('destroy removes listeners', () => {
    it('removes error and rejection listeners', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      handler.destroy();
      expect(removeSpy).toHaveBeenCalledWith('error', handler.handleError);
      expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', handler.handleRejection);
      removeSpy.mockRestore();
    });

    it('init adds listeners that destroy removes', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      handler.init();
      expect(addSpy).toHaveBeenCalledWith('error', handler.handleError);
      expect(addSpy).toHaveBeenCalledWith('unhandledrejection', handler.handleRejection);

      handler.destroy();
      expect(removeSpy).toHaveBeenCalledWith('error', handler.handleError);
      expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', handler.handleRejection);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('onError callback', () => {
    it('calls onError for errors', () => {
      const event = { message: 'boom', filename: 'x.js', lineno: 42 };
      handler.handleError(event);
      expect(onErrorSpy).toHaveBeenCalledWith(event);
    });

    it('works without onError callback', () => {
      const h = createErrorHandler();
      expect(() => {
        h.handleError({ message: 'err', filename: '', lineno: 0 });
        h.handleRejection({ reason: new Error('x'), preventDefault: vi.fn() });
      }).not.toThrow();
      h.destroy();
    });
  });
});
