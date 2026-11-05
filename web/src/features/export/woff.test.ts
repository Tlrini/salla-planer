import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { toBase64, woffToTtf } from './woff';

const require = createRequire(import.meta.url);
const woffPath = require.resolve('@fontsource/figtree/files/figtree-latin-400-normal.woff');

function tags(ttf: ArrayBuffer): string[] {
  const v = new DataView(ttf);
  const n = v.getUint16(4);
  return Array.from({ length: n }, (_, i) =>
    String.fromCharCode(...new Uint8Array(ttf, 12 + i * 16, 4)),
  );
}

describe('woffToTtf', () => {
  it('produces a valid TrueType font', async () => {
    const buf = fs.readFileSync(woffPath);
    const ttf = await woffToTtf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(new DataView(ttf).getUint32(0)).toBe(0x00010000);
    expect(tags(ttf)).toEqual(
      expect.arrayContaining(['cmap', 'glyf', 'head', 'hmtx', 'loca', 'name']),
    );
  });

  it('lets jsPDF embed Albanian characters and the euro sign', async () => {
    const buf = fs.readFileSync(woffPath);
    const ttf = await woffToTtf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.addFileToVFS('Figtree.ttf', toBase64(ttf));
    doc.addFont('Figtree.ttf', 'Figtree', 'normal');
    doc.setFont('Figtree', 'normal');
    doc.text('Dasmë – Çifti: 1.250,00 €', 20, 20);
    const pdf = doc.output();
    expect(pdf).toContain('/FontFile2');
    // ToUnicode map lets readers copy/search the text: ë, Ç and € must be mapped.
    expect(pdf.toLowerCase()).toContain('<00eb>');
    expect(pdf.toLowerCase()).toContain('<00c7>');
    expect(pdf.toLowerCase()).toContain('<20ac>');
  });
});
