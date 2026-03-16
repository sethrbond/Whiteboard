// @ts-check
import { test, expect } from '@playwright/test';
import { mockAuthAndGoToDashboard } from './helpers.js';

test.describe('Brainstorm Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndGoToDashboard(page);
  });

  test('navigate to brainstorm view', async ({ page }) => {
    const brainstormNav = page.locator('[data-view="dump"]');
    await expect(brainstormNav).toBeVisible({ message: 'Brainstorm nav item should be visible in sidebar' });
    await brainstormNav.click();
    await page.waitForTimeout(300);

    const viewTitle = page.locator('#viewTitle');
    await expect(viewTitle).toContainText(/brainstorm/i, { message: 'View title should show Brainstorm after navigating' });
  });

  test('enter text in brainstorm textarea', async ({ page }) => {
    await page.locator('[data-view="dump"]').click();
    await page.waitForTimeout(500);

    const textarea = page.locator('#dumpText, textarea[placeholder*="brainstorm" i], textarea[placeholder*="paste" i], .dump-textarea').first();
    await expect(textarea).toBeVisible({ message: 'Brainstorm textarea should be visible after navigating to brainstorm view' });

    await textarea.fill('I need to buy milk, schedule a meeting with Bob, and finish the quarterly report by Friday');
    await page.waitForTimeout(300);

    await expect(textarea).toHaveValue(/buy milk/, { message: 'Textarea should contain the entered text' });
  });

  test.skip('manual process creates tasks from brainstorm', async ({ page }) => {
    // Skipped: processDump calls addTask which has a getCurrentUser() auth guard.
    // Without real Supabase auth or a deeper mock, tasks cannot be created through
    // the brainstorm process flow. The process button renders and is clickable, but
    // addTask silently returns without creating tasks.
  });

  test('brainstorm view has file attachment support', async ({ page }) => {
    await page.locator('[data-view="dump"]').click();
    await page.waitForTimeout(500);

    const fileInput = page.locator(
      'input[type="file"], [data-onchange-action="dump-files"], .dump-drop-zone, .file-attach, [data-action*="attach"]'
    );

    const count = await fileInput.count();
    expect(count).toBeGreaterThan(0);
  });
});
