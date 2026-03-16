// Test setup — provides minimal DOM and globals that app.js expects
// This runs before each test file via vitest setup

// Mock import.meta.env
if (!import.meta.env) {
  import.meta.env = {};
}
import.meta.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
import.meta.env.VITE_SUPABASE_ANON = 'test-anon-key';

// Minimal DOM structure that app.js checks during initialization
const minimalHTML = `
<div id="splashScreen"><div id="splashStatus"></div></div>
<div id="landingPage"></div>
<div id="authScreen" style="display:none">
  <form id="authForm">
    <div id="authError"></div>
    <div id="authMsg"></div>
    <input id="authEmail" type="email">
    <input id="authPassword" type="password">
    <button id="authBtn">Sign In</button>
    <span id="authSwitchText"></span>
    <span id="authSwitchLink"></span>
  </form>
</div>
<div class="sidebar" style="display:none">
  <div id="projectList"></div>
  <div id="syncBar"><div id="syncDot"></div><span id="syncLabel"></span></div>
  <div id="archiveBadge"></div>
</div>
<div class="main" style="display:none">
  <h1 id="viewTitle"></h1>
  <p id="viewSub"></p>
  <div id="headerActions"></div>
  <div id="content"></div>
</div>
<div id="modalRoot" role="dialog" aria-modal="true" aria-label="Dialog"></div>
<div id="chatPanel">
  <div id="chatMessages"></div>
  <div id="chatChips"></div>
  <textarea id="chatInput"></textarea>
</div>
<button id="chatToggle" style="display:none"></button>
<button id="mobileChatFab" class="mobile-chat-fab"></button>
<div id="pullIndicator" class="pull-indicator"><div class="pull-spinner"></div></div>
<div id="ariaLive" aria-live="polite"></div>
`;

document.body.innerHTML = minimalHTML;
