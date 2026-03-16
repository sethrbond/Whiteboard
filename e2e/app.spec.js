// @ts-check
import { test, expect } from '@playwright/test';

test.describe('App Loading', () => {
  test('page loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Whiteboards/);
  });

  test('auth screen shows for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    // Dismiss splash screen first — wait for landing page to appear
    const landing = page.locator('#landingPage');
    await expect(landing).toBeVisible({ timeout: 10000 });

    // Click "Sign In" on the landing page to show auth screen
    await page.click('[data-action="auth-landing-login"]');

    const authScreen = page.locator('#authScreen');
    await expect(authScreen).toBeVisible();

    // Auth form elements should be present
    await expect(page.locator('#authEmail')).toBeVisible();
    await expect(page.locator('#authPassword')).toBeVisible();
    await expect(page.locator('#authBtn')).toBeVisible();
  });

  test('main layout elements exist in the DOM', async ({ page }) => {
    await page.goto('/');

    // These elements exist in the HTML but are hidden until auth
    await expect(page.locator('.sidebar')).toBeAttached();
    await expect(page.locator('.main')).toBeAttached();
    await expect(page.locator('#chatPanel')).toBeAttached();
    await expect(page.locator('#modalRoot')).toBeAttached();
  });

  test('landing page shows feature descriptions', async ({ page }) => {
    await page.goto('/');
    const landing = page.locator('#landingPage');
    await expect(landing).toBeVisible({ timeout: 10000 });

    // Feature cards should be visible
    await expect(page.locator('.landing-feature')).toHaveCount(3);
    await expect(page.locator('.landing-cta')).toBeVisible();
  });

  test('can toggle between sign in and sign up', async ({ page }) => {
    await page.goto('/');
    const landing = page.locator('#landingPage');
    await expect(landing).toBeVisible({ timeout: 10000 });

    // Click Sign In from landing
    await page.click('[data-action="auth-landing-login"]');
    await expect(page.locator('#authBtn')).toHaveText('Sign In');

    // Toggle to Sign Up
    await page.click('[data-action="toggle-auth"]');
    await expect(page.locator('#authBtn')).toHaveText('Sign Up');

    // Toggle back to Sign In
    await page.click('[data-action="toggle-auth"]');
    await expect(page.locator('#authBtn')).toHaveText('Sign In');
  });
});
