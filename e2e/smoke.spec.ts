import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from '../playwright.config';

test('login → new project → add 3 items → 3D → export PDF', async ({ page }) => {
  await page.goto('/');

  // Login (Hyr)
  await page.getByLabel('Përdoruesi').fill(E2E_ADMIN.user);
  await page.getByLabel('Fjalëkalimi').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Hyr' }).click();
  await expect(page.getByRole('heading', { name: 'Projektet' })).toBeVisible();

  // New project
  await page.getByRole('button', { name: 'Projekt i ri' }).first().click();
  await page.getByLabel('Emri i projektit', { exact: true }).fill('Dasma e testit');
  await page.getByLabel('Klienti', { exact: true }).fill('Arta Ë Ç');
  await page.getByRole('button', { name: 'Krijo projektin' }).click();
  await expect(page.locator('.topbar-title')).toContainText('Dasma e testit');

  // Add 3 items by tapping the catalog
  for (const name of ['Tavolinë e rrumbullakët (10 vende)', 'Skenë / podium', 'Hark me lule']) {
    await page.getByRole('button', { name: `Shto: ${name}` }).click();
  }
  await page.keyboard.press('Escape'); // deselect → the right panel shows the summary
  await expect(page.locator('.summary-table')).toContainText('Skenë / podium');
  await expect(page.locator('.save-status')).toContainText('U ruajt', { timeout: 10_000 });

  // 3D view
  await page.locator('.segmented').getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.locator('.viewer3d canvas')).toBeVisible();

  // Export PDF
  const download = page.waitForEvent('download');
  await page.getByTestId('export-pdf').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Plan-Arta-Ë-Ç-\d{4}-\d{2}-\d{2}\.pdf$/);
  const path = await file.path();
  const fs = await import('node:fs');
  const bytes = fs.readFileSync(path);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(50_000);
});
