import { test, expect } from '@playwright/test';
import { enableMockContract } from './fixtures';

test.describe('Landing page', () => {
  // Injecting the mock client is harmless on the landing page (it never calls
  // the contract) and ensures the marketplace renders cleanly once the CTA
  // navigates there.
  test.beforeEach(async ({ page }) => {
    await enableMockContract(page);
  });

  test('loads and the hero CTA navigates to the marketplace', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /Decentralized/i }),
    ).toBeVisible();

    await page.getByRole('link', { name: /Browse AI Agents/ }).click();

    await expect(page).toHaveURL(/\/marketplace/);
  });
});
