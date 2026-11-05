import figtreeRegular from '@fontsource/figtree/files/figtree-latin-400-normal.woff?url';
import figtreeBold from '@fontsource/figtree/files/figtree-latin-600-normal.woff?url';
import cormorant from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff?url';
import type { PdfFonts } from './pdf';
import { toBase64, woffToTtf } from './woff';

let cached: Promise<PdfFonts> | null = null;

async function load(url: string): Promise<string> {
  const res = await fetch(url);
  return toBase64(await woffToTtf(await res.arrayBuffer()));
}

/** The bundled UI fonts converted to TTF for jsPDF (loaded once, from our own server). */
export function loadPdfFonts(): Promise<PdfFonts> {
  cached ??= Promise.all([load(figtreeRegular), load(figtreeBold), load(cormorant)])
    .then(([regular, bold, title]) => ({ regular, bold, title }))
    .catch((err: unknown) => {
      cached = null;
      throw err;
    });
  return cached;
}
