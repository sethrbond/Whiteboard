// ============================================================
// WINDOW EXPOSURE — Required for template-string onclick handlers
// These functions are called from dynamically generated HTML (innerHTML)
// which runs in global scope, not module scope.
// Extracted from app.js for modularity.
// ============================================================

/**
 * Exposes the given module functions and state on `window` so that
 * dynamically-rendered HTML (innerHTML onclick handlers) can call them.
 *
 * @param {object} fns       — map of name -> function to expose
 * @param {object} stateDesc — map of name -> { get, set? } property descriptors
 */
export function exposeWindowAPI(fns, stateDesc) {
  Object.entries(fns).forEach(([k, fn]) => {
    if (typeof fn === 'function') window[k] = fn;
  });
  Object.entries(stateDesc).forEach(([k, desc]) => {
    Object.defineProperty(window, k, { ...desc, configurable: true });
  });
}
