// @ts-check
import { test, expect } from '@playwright/test';
import { mockAuthAndGoToDashboard, addTaskDirectly } from './helpers.js';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndGoToDashboard(page);
  });

  test('sidebar project switching', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible({ message: 'Sidebar should be visible after auth' });

    // Inject a task so the project renders in sidebar (projects only show when they have tasks or after render)
    await page.evaluate(() => {
      const task = window.createTask({ title: 'Nav test task', project: 'life', priority: 'medium' });
      window.data.tasks.push(task);
      if (!window.data.projects.some(p => p.id === 'life')) {
        window.data.projects.push({ id: 'life', name: 'Life', color: '#818cf8' });
      }
      window.render();
    });
    await page.waitForTimeout(300);

    // Project items render as .project-nav-item with data-project attribute
    const projectItem = page.locator('#projectList .project-nav-item, [data-project]').first();
    await expect(projectItem).toBeVisible({ message: 'Project nav item should be visible in sidebar after adding a task' });

    await projectItem.click();
    await page.waitForTimeout(300);

    const viewTitle = page.locator('#viewTitle');
    await expect(viewTitle).toBeVisible({ message: 'View title should be visible after clicking a project' });
    await expect(viewTitle).toContainText(/life/i, { message: 'View title should show the project name' });
  });

  test('view toggles - dashboard', async ({ page }) => {
    const dashboardNav = page.locator('[data-view="dashboard"]');
    await expect(dashboardNav).toBeVisible({ message: 'Dashboard nav item should be visible in sidebar' });
    await dashboardNav.click();
    await page.waitForTimeout(300);

    const viewTitle = page.locator('#viewTitle');
    await expect(viewTitle).toContainText(/dashboard/i, { message: 'View title should show Dashboard' });
  });

  test('view toggles - brainstorm', async ({ page }) => {
    const brainstormNav = page.locator('[data-view="dump"]');
    await expect(brainstormNav).toBeVisible({ message: 'Brainstorm nav item should be visible in sidebar' });
    await brainstormNav.click();
    await page.waitForTimeout(300);

    const viewTitle = page.locator('#viewTitle');
    await expect(viewTitle).toContainText(/brainstorm/i, { message: 'View title should show Brainstorm' });
  });

  test('command palette opens with Cmd+K', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(300);

    // Command palette renders inside #modalRoot with class cmd-palette
    const cmdPalette = page.locator('.cmd-palette').first();
    await expect(cmdPalette).toBeVisible({ timeout: 3000, message: 'Command palette should open after Cmd+K' });
  });

  test('settings panel opens', async ({ page }) => {
    const settingsBtn = page.locator('[data-action="settings"]');
    await expect(settingsBtn).toBeVisible({ message: 'Settings button should be visible in sidebar' });
    await settingsBtn.click();
    await page.waitForTimeout(500);

    const settingsModal = page.locator('.modal-overlay, .modal-title:has-text("Settings")').first();
    await expect(settingsModal).toBeVisible({ timeout: 3000, message: 'Settings modal should appear after clicking settings' });
  });

  test('sidebar collapse toggle works', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible({ message: 'Sidebar should be visible' });

    const collapseBtn = page.locator('[data-action="toggle-sidebar"]');
    await expect(collapseBtn).toBeVisible({ message: 'Sidebar collapse button should be visible' });

    await collapseBtn.click();
    await page.waitForTimeout(300);

    await expect(sidebar).toHaveClass(/collapsed/, { message: 'Sidebar should have collapsed class after toggle' });

    await collapseBtn.click();
    await page.waitForTimeout(300);
    await expect(sidebar).not.toHaveClass(/collapsed/, { message: 'Sidebar should not have collapsed class after second toggle' });
  });
});
