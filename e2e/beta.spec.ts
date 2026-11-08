import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from '../playwright.config';

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'flower-vase.glb',
);

test('beta: scan library → decor on tables → option B → walk in 3D → PDF', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Përdoruesi').fill(E2E_ADMIN.user);
  await page.getByLabel('Fjalëkalimi').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Hyr' }).click();
  await expect(page.getByRole('heading', { name: 'Projektet' })).toBeVisible();

  // Upload a scan (lying on its side, in centimeters) and set it up.
  await page.getByRole('button', { name: 'Biblioteka' }).click();
  await page.getByTestId('library-file').setInputFiles(fixture);
  await expect(page.getByRole('heading', { name: 'Rregullimi i dekorit' })).toBeVisible();
  await page.getByRole('button', { name: 'Ngrije −90°' }).click();
  const height = page.getByLabel('Lartësia reale');
  await height.fill('0,46');
  await height.press('Tab');
  await expect(page.getByTestId('setup-size')).toContainText('0,37 × 0,37 × 0,46');
  const name = page.getByLabel('Emri', { exact: true });
  await name.fill('Peonia testi');
  const price = page.getByLabel('Çmimi për copë');
  await price.fill('28');
  await price.press('Tab');
  await page.getByText('Vendoset mbi tavolinë').click();
  await page.getByRole('button', { name: 'Ruaj në bibliotekë' }).click();
  // Other test files share this run's library (e.g. the scanned vase), so find our card.
  const card = page.locator('.library-card').filter({ hasText: 'Peonia testi' });
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toBeVisible();

  // New project with two round tables.
  await page.getByRole('button', { name: 'Projektet' }).click();
  await page.getByRole('button', { name: 'Projekt i ri' }).first().click();
  await page.getByLabel('Emri i projektit', { exact: true }).fill('Dasma beta');
  await page.getByLabel('Klienti', { exact: true }).fill('Besa');
  await page.getByRole('button', { name: 'Krijo projektin' }).click();
  await expect(page.locator('.topbar-title')).toContainText('Dasma beta');
  const table = page.getByRole('button', { name: 'Shto: Tavolinë e rrumbullakët (10 vende)' });
  await table.click();
  await table.click();

  // The second table is selected: put the scanned peonies on it, then on all tables.
  await page.getByRole('button', { name: 'Vendos dekorin: Peonia testi' }).click();
  await page.getByRole('button', { name: /Apliko te të gjitha tavolinat e këtij lloji/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('item-summary')).toContainText('Peonia testi');
  await expect(page.getByTestId('item-summary')).toContainText('56,00 €');

  // Option B with candles instead.
  await page.getByRole('button', { name: 'Opsion i ri' }).click();
  await expect(page.locator('.options-tabs')).toContainText('Opsioni B');
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'Vendos dekorin: Grup qirinjsh' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.options-compare')).toContainText('Opsioni A');
  await expect(page.locator('.save-status')).toContainText('U ruajt', { timeout: 10_000 });

  // Walk through the hall in 3D and save a viewpoint.
  await page.locator('.segmented').getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.locator('.viewer3d canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Ec nëpër sallë' }).click();
  await expect(page.locator('.walk-panel')).toContainText('Hyrja');
  await page.getByRole('button', { name: 'Ruaj këtë pamje' }).click();
  await expect(page.locator('.walk-panel')).toContainText('Pamja 1');

  // PDF with the option comparison page.
  const download = page.waitForEvent('download');
  await page.getByTestId('export-pdf').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Plan-Besa-\d{4}-\d{2}-\d{2}\.pdf$/);
  const fs = await import('node:fs');
  const text = fs.readFileSync((await file.path())!).toString('latin1');
  expect((text.match(/\/Type \/Page[^s]/g) ?? []).length).toBe(5);
});
