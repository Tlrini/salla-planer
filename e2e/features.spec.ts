import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from '../playwright.config';

test('guests, checklist, payments, share link, calendar, dashboard', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel('Përdoruesi').fill(E2E_ADMIN.user);
  await page.getByLabel('Fjalëkalimi').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Hyr' }).click();
  await expect(page.getByRole('heading', { name: 'Projektet' })).toBeVisible();

  // Project dated this month, with two round tables.
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
  await page.getByRole('button', { name: 'Projekt i ri' }).first().click();
  await page.getByLabel('Emri i projektit', { exact: true }).fill('Dasma e plotë');
  await page.getByLabel('Klienti', { exact: true }).fill('Drita');
  await page.getByLabel('Data e eventit').fill(date);
  await page.getByRole('button', { name: 'Krijo projektin' }).click();
  await expect(page.locator('.topbar-title')).toContainText('Dasma e plotë');
  const table = page.getByRole('button', { name: 'Shto: Tavolinë e rrumbullakët (10 vende)' });
  await table.click();
  await table.click();
  await page.keyboard.press('Escape');

  const openTool = async (name: string) => {
    await page.locator('.topbar').getByRole('button', { name: 'Projekti' }).click();
    await page.getByRole('menuitem', { name }).click();
  };

  // Guests: paste 15 names in two groups, seat them automatically.
  await openTool('Të ftuarit dhe ulja');
  await page.getByRole('button', { name: 'Ngjit listën' }).click();
  const names = Array.from(
    { length: 15 },
    (_, i) => `Mysafir ${i + 1};${i < 8 ? 'Familja' : 'Miqtë'}`,
  );
  await page.locator('.paste-area').fill(names.join('\n'));
  await page.locator('dialog[open] .dialog-actions').getByRole('button', { name: 'Shto' }).click();
  await expect(page.getByTestId('seating-stats')).toContainText('15 pa vend');
  await page.getByRole('button', { name: 'Ulja automatike' }).click();
  await expect(page.getByTestId('seating-stats')).toContainText('0 pa vend');
  await page.locator('dialog[open] .dialog-actions').getByRole('button', { name: 'Mbyll' }).click();

  // Checklist: tick a line as loaded.
  await openTool('Lista e punës (ekipi)');
  await page.getByRole('button', { name: /^Ngarkuar: Tavolinë/ }).click();
  await expect(page.locator('.progress-item').first()).not.toContainText('· 0%');
  await page.locator('dialog[open] .dialog-actions').getByRole('button', { name: 'Mbyll' }).click();

  // Payments: record a deposit.
  await openTool('Pagesat dhe kontrata');
  await page.getByLabel('Shuma', { exact: true }).fill('20');
  await page.getByLabel('Shuma', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Shto pagesë' }).click();
  await expect(page.locator('.payments-stats')).toContainText('20,00 €');
  await page.locator('dialog[open] .dialog-actions').getByRole('button', { name: 'Mbyll' }).click();
  await expect(page.locator('.save-status')).toContainText('U ruajt', { timeout: 10_000 });

  // Share link → client (no account) approves and comments.
  await openTool('Ndaj me klientin');
  await page.getByRole('button', { name: 'Krijo lidhje të re' }).click();
  const link = await page.getByLabel('Lidhja për klientin').first().inputValue();
  expect(link).toMatch(/#\/share\/[\w-]{24}$/);
  const client = await (await browser.newContext()).newPage();
  await client.goto(link);
  await expect(client.getByRole('heading', { name: 'Dasma e plotë' })).toBeVisible();
  await expect(client.locator('.share-page')).not.toContainText('Mysafir');
  await client.getByLabel('Emri juaj').first().fill('Drita');
  await client.getByRole('button', { name: 'Aprovoj dizajnin' }).click();
  await expect(client.locator('.share-approved')).toContainText('Drita aprovoi');
  await client.getByLabel('Shkruani një koment ose kërkesë…').fill('Faleminderit!');
  await client.getByRole('button', { name: 'Dërgo' }).click();
  await expect(client.locator('.comment')).toContainText('Faleminderit!');
  await client.close();

  // The agent sees the approval when reopening the dialog.
  await page.locator('dialog[open] .dialog-actions').getByRole('button', { name: 'Mbyll' }).click();
  await openTool('Ndaj me klientin');
  await expect(page.locator('.share-approval')).toContainText('Drita aprovoi');
  await expect(page.locator('.comment')).toContainText('Faleminderit!');
  await page.locator('dialog[open] .dialog-actions').getByRole('button', { name: 'Mbyll' }).click();

  // Calendar shows the event; dashboard shows the payment.
  await page.locator('.topbar').getByRole('button', { name: 'Kthehu' }).click();
  await page.getByRole('button', { name: 'Kalendari' }).click();
  await expect(page.locator('.calendar-event')).toContainText('Drita');
  await page.getByRole('button', { name: 'Paneli' }).click();
  // A draft counts as an open offer (2 tables + 20 chairs = 110 €); its payment shows by month.
  await expect(page.locator('.kpi-row')).toContainText('110,00 €');
  await page.getByRole('button', { name: 'Shfaq tabelën' }).click();
  await expect(page.locator('.dashboard .summary-table')).toContainText('20,00 €');
});
