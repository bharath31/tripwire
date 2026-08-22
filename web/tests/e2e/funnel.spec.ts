import { expect, test } from '@playwright/test';

test('landing page leads directly to the first prompt builder', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Run your first prompt/ }).first().click();
  await expect(page).toHaveURL(/\/setup/);
  await page.getByLabel('Representative user prompt').fill('Review this pull request for security problems');
  await page.getByRole('button', { name: 'Build my test command →' }).click();
  await expect(page.getByText(/npx tripwire-skills@latest test/)).toBeVisible();
});

test('playground correction leads to setup', async ({ page }) => {
  await page.goto('/playground');
  await expect(page.getByText('Fix blockers before probing')).toBeVisible();
  await page.getByRole('button', { name: 'Passing example' }).click();
  await expect(page.getByText('Ready for a behavioral probe')).toBeVisible();
  await page.getByRole('link', { name: 'Run a real prompt →' }).click();
  await expect(page).toHaveURL(/\/setup/);
});

test('mobile layout has no horizontal overflow', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
