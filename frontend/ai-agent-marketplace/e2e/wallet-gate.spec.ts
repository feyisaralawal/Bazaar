import { test, expect } from '@playwright/test';

/**
 * These routes gate on a connected Freighter wallet. In the e2e browser there
 * is no Freighter extension, so `useWallet().isConnected` stays false and the
 * connect-gate UI renders. No contract mock is needed because each page short-
 * circuits on `!isConnected` before touching the contract client.
 */
test.describe('Wallet-gated routes', () => {
  test('navigating to /create-job without a wallet shows the Connect Wallet Required gate', async ({
    page,
  }) => {
    await page.goto('/create-job');

    await expect(
      page.getByRole('heading', { name: 'Connect Wallet Required' }),
    ).toBeVisible();
    await expect(
      page.getByText('You need to connect your Stellar wallet to post a job.'),
    ).toBeVisible();
  });

  test('navigating to /dashboard without a wallet shows a connect prompt', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    await expect(
      page.getByText('Connect your Freighter wallet to access your dashboard'),
    ).toBeVisible();
  });
});
