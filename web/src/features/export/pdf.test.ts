import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOG,
  EXAMPLE_HALLS,
  catalogById,
  findFreeSpot,
  type Item,
  type Project,
} from '@salla/shared';
import { buildPdf, pdfFileName, type PdfFonts } from './pdf';
import { toBase64, woffToTtf } from './woff';

const require = createRequire(import.meta.url);
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function font(spec: string): Promise<string> {
  const buf = fs.readFileSync(require.resolve(spec));
  return toBase64(
    await woffToTtf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
  );
}

function wedding(): Project {
  const hall = EXAMPLE_HALLS[0]!.hall;
  const cat = catalogById(DEFAULT_CATALOG);
  const items: Item[] = [];
  const add = (type: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const c = cat.get(type)!;
      const draft: Item = {
        id: `${type}-${i}`,
        type,
        x: 0,
        y: 0,
        rotation: 0,
        width: c.width,
        depth: c.depth,
        color: c.defaultColor,
      };
      items.push({ ...draft, ...findFreeSpot(draft, { x: 15, y: 9 }, items, hall, cat) });
    }
  };
  add('stage', 1);
  add('table_head', 1);
  add('table_round_10', 20);
  add('flower_arch', 1);
  add('backdrop_curtain', 1);
  add('flower_stand', 6);
  return {
    id: 'p1',
    name: 'Dasma – 14 qershor',
    clientName: 'Arta Krasniqi',
    eventType: 'dasme',
    eventDate: '2027-06-14',
    guestTarget: 200,
    status: 'konfirmuar',
    hall,
    items,
    notes: 'Lule të bardha dhe rozë pudër. Çmimi përfshin instalimin; € pagesë në dorëzim.',
    createdBy: 'Admin',
    updatedBy: 'Admin',
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
    version: 1,
  };
}

describe('buildPdf', () => {
  it('builds a 3-page A4 landscape PDF with embedded Unicode fonts', async () => {
    const fonts: PdfFonts = {
      regular: await font('@fontsource/figtree/files/figtree-latin-400-normal.woff'),
      bold: await font('@fontsource/figtree/files/figtree-latin-600-normal.woff'),
      title: await font(
        '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff',
      ),
    };
    const project = wedding();
    const doc = buildPdf(
      project,
      DEFAULT_CATALOG,
      {
        blueprint: { url: PNG_1PX, width: 3000, height: 1800 },
        perspective: PNG_1PX,
        entrance: PNG_1PX,
      },
      fonts,
    );
    expect(doc.getNumberOfPages()).toBe(3);
    const size = doc.internal.pageSize;
    expect(Math.round(size.getWidth())).toBe(297);
    expect(Math.round(size.getHeight())).toBe(210);
    const out = doc.output();
    // Three embedded TrueType fonts (Figtree regular + semibold, Cormorant); the character
    // mapping itself is checked uncompressed in woff.test.ts.
    expect(out.match(/\/FontFile2/g)?.length).toBe(3);
    // Keep a copy to open in a real PDF reader.
    const file = path.join(os.tmpdir(), 'salla-test-plan.pdf');
    fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  });

  it('names the file Plan-<client>-<date>.pdf', () => {
    expect(pdfFileName(wedding())).toBe('Plan-Arta-Krasniqi-2027-06-14.pdf');
    expect(
      pdfFileName(
        { ...wedding(), clientName: 'A/B: "x"', eventDate: undefined },
        new Date('2026-11-05T12:00:00Z'),
      ),
    ).toBe('Plan-AB-x-2026-11-05.pdf');
  });
});
