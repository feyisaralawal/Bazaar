import { test, expect } from '@playwright/test';
import { enableMockContract, agents } from './fixtures';

/**
 * Agent profile page tests.
 *
 * Navigates to /agent/:id for each fixture agent and verifies the key
 * profile details are rendered. No wallet is needed — the profile page
 * is read-only.
 */
test.describe('Agent Profile page', () => {
  test.beforeEach(async ({ page }) => {
    await enableMockContract(page);
  });

  test('renders agent name and description for agent 1', async ({ page }) => {
    await page.goto(`/agent/${agents[0].id}`);

    await expect(
      page.getByRole('heading', { name: agents[0].name }),
    ).toBeVisible();
    await expect(page.getByText(agents[0].description)).toBeVisible();
  });

  test('renders agent name and description for agent 2', async ({ page }) => {
    await page.goto(`/agent/${agents[1].id}`);

    await expect(
      page.getByRole('heading', { name: agents[1].name }),
    ).toBeVisible();
    await expect(page.getByText(agents[1].description)).toBeVisible();
  });

  test('renders agent name and description for agent 3', async ({ page }) => {
    await page.goto(`/agent/${agents[2].id}`);

    await expect(
      page.getByRole('heading', { name: agents[2].name }),
    ).toBeVisible();
    await expect(page.getByText(agents[2].description)).toBeVisible();
  });
});
