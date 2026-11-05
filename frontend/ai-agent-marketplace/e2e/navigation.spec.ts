import { test, expect } from '@playwright/test';
import { enableMockContract } from './fixtures';

/**
 * Top-level navigation smoke tests.
 *
 * Verifies that the application's router handles key routes without
 * throwing a 404 or blank-screen error. These are intentionally broad
 * smoke tests that complement the focused feature specs.
 */
test.describe('Navigation smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await enableMockContract(page);
  });

  test('/ resolves without error', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
    // App shell should mount
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('/marketplace resolves without error', async ({ page }) => {
    const response = await page.goto('/marketplace');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('/create-job resolves without error', async ({ page }) => {
    const response = await page.goto('/create-job');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('/dashboard resolves without error', async ({ page }) => {
    const response = await page.goto('/dashboard');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('/register-agent resolves without error', async ({ page }) => {
    const response = await page.goto('/register-agent');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('/settings resolves without error', async ({ page }) => {
    const response = await page.goto('/settings');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
