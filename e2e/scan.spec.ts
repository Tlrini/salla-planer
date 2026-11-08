import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_WORKER_TOKEN } from '../playwright.config';

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'flower-vase.glb',
);

// The server checks photos by their first bytes only; the "photogrammetry" below is simulated.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

test('beta 5: photos → queue → (simulated) GPU worker → crop → library setup', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByLabel('Përdoruesi').fill(E2E_ADMIN.user);
  await page.getByLabel('Fjalëkalimi').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Hyr' }).click();
  await expect(page.getByRole('heading', { name: 'Projektet' })).toBeVisible();

  // The agent sends 24 photos of a decor.
  await page.getByRole('button', { name: 'Biblioteka' }).click();
  await page.getByRole('button', { name: 'Skano një dekor' }).click();
  await expect(page.getByRole('heading', { name: 'Skano një dekor' })).toBeVisible();
  await page.getByLabel('Emri i dekorit').fill('Vazo e skanuar');
  await page.getByTestId('scan-photos').setInputFiles(
    Array.from({ length: 24 }, (_, i) => ({
      name: `foto-${i + 1}.jpg`,
      mimeType: 'image/jpeg',
      buffer: jpeg,
    })),
  );
  await expect(page.getByText('24 foto të zgjedhura')).toBeVisible();
  await page.getByRole('button', { name: 'Dërgo për përpunim' }).click();
  await expect(page.getByText('U dërgua.', { exact: false })).toBeVisible();

  // Play the GPU worker: claim the job and send a model back.
  const auth = { authorization: `Bearer ${E2E_WORKER_TOKEN}` };
  const claim = await request.post('/api/worker/claim', { headers: auth });
  expect(claim.status()).toBe(200);
  const job = (await claim.json()) as { id: string; lease: string; files: string[] };
  expect(job.files).toHaveLength(24);
  const result = await request.post(`/api/worker/jobs/${job.id}/result`, {
    headers: { ...auth, 'x-scan-lease': job.lease },
    multipart: {
      file: { name: 'scan.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(fixture) },
    },
  });
  expect(result.status()).toBe(200);

  // The library shows it ready; the agent trims it and finishes the setup.
  await page.getByRole('button', { name: 'Shko te biblioteka' }).click();
  const row = page.getByTestId('scan-job').filter({ hasText: 'Vazo e skanuar' });
  await expect(row).toContainText('Gati, duhet pastruar');
  await row.getByRole('button', { name: 'Pastro dhe ruaj' }).click();
  await expect(page.getByRole('heading', { name: 'Pastrimi i modelit' })).toBeVisible();
  await page.locator('.crop-range input[type="range"]').first().fill('5');
  await page.getByRole('button', { name: 'Ruaj dhe vazhdo' }).click();

  await expect(page.getByRole('heading', { name: 'Rregullimi i dekorit' })).toBeVisible();
  await expect(page.getByLabel('Emri', { exact: true })).toHaveValue('Vazo e skanuar');
  await page.getByRole('button', { name: 'Ruaj në bibliotekë' }).click();
  await expect(page.locator('.library-card').filter({ hasText: 'Vazo e skanuar' })).toBeVisible();
  await expect(page.getByTestId('scan-job').filter({ hasText: 'Vazo e skanuar' })).toHaveCount(0);
});
