import { test, expect } from '@playwright/test';
import { enableMockContract, agents } from './fixtures';

test.describe('Marketplace', () => {
  test.beforeEach(async ({ page }) => {
    await enableMockContract(page);
    await page.goto('/marketplace');

    // Wait for the fixture-backed agent cards to render before each test.
    await expect(
      page.getByRole('heading', { name: agents[0].name }),
    ).toBeVisible();
  });

  test('page URL is /marketplace', async ({ page }) => {
    await expect(page).toHaveURL(/\/marketplace/);
  });

  test('displays agent cards and the agent/job listing tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /AI Agents/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Jobs/ })).toBeVisible();

    // The default (agents) tab renders cards for every active fixture agent.
    await expect(page.getByRole('heading', { name: agents[0].name })).toBeVisible();
    await expect(page.getByRole('heading', { name: agents[1].name })).toBeVisible();
    await expect(page.getByRole('heading', { name: agents[2].name })).toBeVisible();
  });

  test('search filters agents by name', async ({ page }) => {
    const search = page.getByPlaceholder('Search agents, skills, jobs...');

    await search.fill('CodeForge');

    await expect(page.getByRole('heading', { name: agents[0].name })).toBeVisible();
    await expect(page.getByRole('heading', { name: agents[1].name })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: agents[2].name })).toHaveCount(0);
  });

  test('search filters agents by skill', async ({ page }) => {
    const search = page.getByPlaceholder('Search agents, skills, jobs...');

    // 'stellar' is a skill unique to the third fixture agent.
    await search.fill('stellar');

    await expect(page.getByRole('heading', { name: agents[2].name })).toBeVisible();
    await expect(page.getByRole('heading', { name: agents[0].name })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: agents[1].name })).toHaveCount(0);
  });

  test('clearing search restores all agents', async ({ page }) => {
    const search = page.getByPlaceholder('Search agents, skills, jobs...');

    await search.fill('CodeForge');
    await expect(page.getByRole('heading', { name: agents[1].name })).toHaveCount(0);

    // Clear the search field
    await search.clear();

    // All agents should be visible again
    await expect(page.getByRole('heading', { name: agents[0].name })).toBeVisible();
    await expect(page.getByRole('heading', { name: agents[1].name })).toBeVisible();
    await expect(page.getByRole('heading', { name: agents[2].name })).toBeVisible();
  });

  test('the Open Jobs tab lists open jobs', async ({ page }) => {
    await page.getByRole('button', { name: /Open Jobs/ }).click();

    await expect(
      page.getByRole('heading', { name: /fraud detection ML model/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Audit a Soroban DeFi vault/i }),
    ).toBeVisible();
  });

  test('switching back to AI Agents tab hides jobs', async ({ page }) => {
    // Switch to jobs tab
    await page.getByRole('button', { name: /Open Jobs/ }).click();
    await expect(
      page.getByRole('heading', { name: /fraud detection ML model/i }),
    ).toBeVisible();

    // Switch back to agents tab
    await page.getByRole('button', { name: /AI Agents/ }).click();
    await expect(page.getByRole('heading', { name: agents[0].name })).toBeVisible();
  });
});
