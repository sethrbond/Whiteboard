// Shared helpers for E2E tests

/**
 * Mock Supabase auth by intercepting API calls and setting up the app
 * as if a user is authenticated. This bypasses the real Supabase auth flow.
 */
export async function mockAuthAndGoToDashboard(page) {
  const mockUser = {
    id: 'e2e-test-user-001',
    email: 'test@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    created_at: '2025-01-01T00:00:00Z',
  };

  const mockSession = {
    access_token: 'e2e-mock-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'e2e-mock-refresh-token',
    user: mockUser,
  };

  // Intercept all Supabase auth API calls
  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/token') || url.includes('/session')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSession),
      });
    } else if (url.includes('/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    }
  });

  // Intercept Supabase REST/realtime calls (data sync)
  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Set up localStorage before page loads
  await page.addInitScript(({ user }) => {
    const uid = user.id;
    const prefix = 'wb_' + uid + '_';

    const initialData = {
      tasks: [],
      projects: [{ id: 'life', name: 'Life', color: '#818cf8' }],
    };

    localStorage.setItem(prefix + 'whiteboard_data_v3', JSON.stringify(initialData));
    localStorage.setItem(prefix + 'whiteboard_settings', JSON.stringify({
      theme: 'dark',
      dateFormat: 'relative',
      defaultProject: 'life',
      calendarStartDay: 0,
      enableNotifications: false,
      aiModel: 'claude-sonnet',
      aiMemory: '',
    }));
    localStorage.setItem(prefix + 'wb_onboarding_done', 'true');
    localStorage.setItem(prefix + 'wb_tips_seen', '1');
  }, { user: mockUser });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // Force the app into authenticated state by manipulating the DOM
  await page.evaluate(({ user }) => {
    // Remove blocking overlays completely
    const splash = document.getElementById('splashScreen');
    if (splash) splash.remove();

    const lp = document.getElementById('landingPage');
    if (lp) lp.remove();

    const auth = document.getElementById('authScreen');
    if (auth) auth.style.display = 'none';

    // Show app UI
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.style.display = '';
      sidebar.classList.remove('collapsed');
    }
    const main = document.querySelector('.main');
    if (main) main.style.display = '';
    const chatToggle = document.getElementById('chatToggle');
    if (chatToggle) chatToggle.style.display = '';

    // Try to use app's own render if available
    if (typeof window.render === 'function') {
      try {
        window.render();
      } catch (e) {
        console.warn('render() failed:', e);
      }
    }
  }, { user: mockUser });

  // Wait for sidebar to be visible and interactive
  await page.waitForSelector('.sidebar', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);
}

/**
 * Add a task via evaluate — directly mutates app data and re-renders.
 */
export async function addTaskDirectly(page, task) {
  await page.evaluate((taskData) => {
    if (window.data && window.data.tasks) {
      window.data.tasks.push({
        id: taskData.id || 'task-' + Date.now(),
        title: taskData.title,
        done: false,
        project: taskData.project || 'life',
        priority: taskData.priority || 'medium',
        tags: taskData.tags || [],
        subtasks: taskData.subtasks || [],
        created: new Date().toISOString(),
        ...taskData,
      });
      if (typeof window.render === 'function') window.render();
    }
  }, task);
  await page.waitForTimeout(300);
}
