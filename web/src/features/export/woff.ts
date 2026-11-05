/**
 * Converts a WOFF 1.0 font to a plain TrueType (sfnt) font, so jsPDF can embed the fonts we
 * already bundle via @fontsource (no extra font files, no network). WOFF is the same sfnt
 * tables, each optionally zlib-compressed, behind a 44-byte header.
 */

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function woffToTtf(woff: ArrayBuffer): Promise<ArrayBuffer> {
  const src = new DataView(woff);
  if (src.getUint32(0) !== 0x774f4646) throw new Error('Not a WOFF 1.0 font');
  const flavor = src.getUint32(4);
  const numTables = src.getUint16(12);

  const tables: Array<{ tag: number; checksum: number; data: Uint8Array }> = [];
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const tag = src.getUint32(e);
    const offset = src.getUint32(e + 4);
    const compLength = src.getUint32(e + 8);
    const origLength = src.getUint32(e + 12);
    const checksum = src.getUint32(e + 16);
    const raw = new Uint8Array(woff, offset, compLength);
    const data = compLength < origLength ? await inflate(raw) : raw.slice();
    if (data.length !== origLength) throw new Error('Corrupt WOFF table');
    tables.push({ tag, checksum, data });
  }

  // sfnt table records must be sorted by tag.
  tables.sort((a, b) => a.tag - b.tag);
  const headerSize = 12 + numTables * 16;
  const pad = (n: number) => (n + 3) & ~3;
  const total = tables.reduce((s, t) => s + pad(t.data.length), headerSize);
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  let pow2 = 1;
  let log2 = 0;
  while (pow2 * 2 <= numTables) {
    pow2 *= 2;
    log2++;
  }
  view.setUint32(0, flavor);
  view.setUint16(4, numTables);
  view.setUint16(6, pow2 * 16);
  view.setUint16(8, log2);
  view.setUint16(10, numTables * 16 - pow2 * 16);

  let offset = headerSize;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    view.setUint32(r, t.tag);
    view.setUint32(r + 4, t.checksum);
    view.setUint32(r + 8, offset);
    view.setUint32(r + 12, t.data.length);
    bytes.set(t.data, offset);
    offset += pad(t.data.length);
  });
  return out;
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
