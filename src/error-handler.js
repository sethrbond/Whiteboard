// Global error handling and recovery UI
// Factory function pattern — instantiate early in app.js to catch init errors.

export function createErrorHandler(deps = {}) {
  const { onError } = deps;

  let errorCount = 0;
  const MAX_ERRORS = 5;
  let recoveryShowing = false;

  function init() {
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
  }

  function handleError(event) {
    errorCount++;
    console.error('[ErrorHandler] Global error:', event.message, event.filename, event.lineno);
    if (onError) onError(event);
    if (errorCount >= MAX_ERRORS && !recoveryShowing) {
      showRecoveryUI();
    }
  }

  function handleRejection(event) {
    errorCount++;
    event.preventDefault();
    console.error('[ErrorHandler] Unhandled rejection:', event.reason);
    if (onError) onError(event);
    if (errorCount >= MAX_ERRORS && !recoveryShowing) {
      showRecoveryUI();
    }
  }

  function showRecoveryUI() {
    if (recoveryShowing) return;
    recoveryShowing = true;

    const overlay = document.createElement('div');
    overlay.className = 'recovery-overlay';
    overlay.setAttribute('role', 'alert');
    overlay.innerHTML = `
      <div class="recovery-dialog">
        <h2>Something went wrong</h2>
        <p>Multiple errors have occurred. Your data is safe&mdash;it&rsquo;s saved in localStorage.</p>
        <button class="recovery-reload-btn" type="button">Reload App</button>
      </div>
    `;

    overlay.querySelector('.recovery-reload-btn').addEventListener('click', () => {
      window.location.reload();
    });

    document.body.appendChild(overlay);
  }

  function destroy() {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  }

  function getErrorCount() {
    return errorCount;
  }

  function isRecoveryShowing() {
    return recoveryShowing;
  }

  return { init, destroy, handleError, handleRejection, showRecoveryUI, getErrorCount, isRecoveryShowing };
}
