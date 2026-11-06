import { jsPDF } from 'jspdf';
import {
  catalogById,
  occupancy,
  seatingTables,
  formatDate,
  formatEUR,
  formatMeters,
  quoteTotals,
  summarize,
  type CatalogItem,
  type Project,
} from '@salla/shared';
import { sq } from '../../i18n/sq';

/** TTF fonts (base64) embedded so ë, ç and € render in every PDF reader. */
export interface PdfFonts {
  regular: string;
  bold: string;
  title: string;
}

export interface PdfImages {
  /** 2D blueprint PNG data URL and its pixel size. */
  blueprint: { url: string; width: number; height: number };
  perspective: string;
  entrance: string;
  /** Eye-level renders from walk-mode viewpoints (up to 4), shown on their own page. */
  eyeViews?: Array<{ url: string; caption: string }>;
  /** One render per design option with its totals, for the comparison page. */
  options?: Array<{ url: string; name: string; total: number; capacity: number; final: boolean }>;
}

/**
 * Seating plan: one card per table with its guests, then an alphabetical list (name → table)
 * for the entrance board.
 */
function seatingPages(doc: jsPDF, project: Project, catalog: readonly CatalogItem[]) {
  const guests = project.guests ?? [];
  const tables = seatingTables(project.items, catalogById(catalog));
  const occ = occupancy(guests);
  const labelOf = new Map(tables.map((t) => [t.id, t.label]));

  doc.addPage();
  header(doc, project, sq.guests.pdfTitle);
  const cols = 4;
  const gap = 5;
  const cardW = (PAGE_W - 2 * M - gap * (cols - 1)) / cols;
  const lineH = 4.2;
  const top = 30;
  const colY = Array<number>(cols).fill(top);
  for (const t of tables) {
    const names = guests
      .filter((g) => g.tableId === t.id)
      .map((g) => g.name)
      .sort((a, b) => a.localeCompare(b, 'sq'));
    const h = 10 + Math.max(1, names.length) * lineH + 3;
    let c = colY.indexOf(Math.min(...colY));
    if (colY[c]! + h > PAGE_H - 14) {
      doc.addPage();
      header(doc, project, sq.guests.pdfTitle);
      colY.fill(top);
      c = 0;
    }
    const x = M + c * (cardW + gap);
    const y = colY[c]!;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, h, 1.5, 1.5, 'S');
    doc.setFont('Figtree', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(t.label, x + 3, y + 6);
    doc.setFont('Figtree', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${occ.get(t.id) ?? 0}/${t.capacity}`, x + cardW - 3, y + 6, { align: 'right' });
    doc.setTextColor(...INK);
    names.forEach((n, i) => {
      const line = (doc.splitTextToSize(n, cardW - 6) as string[])[0] ?? '';
      doc.text(line, x + 3, y + 11.5 + i * lineH);
    });
    colY[c] = y + h + gap;
  }

  // Alphabetical list, three columns per page.
  const sorted = [...guests]
    .filter((g) => g.rsvp !== 'jo')
    .sort((a, b) => a.name.localeCompare(b.name, 'sq'));
  const perCol = Math.floor((PAGE_H - 30 - 14) / 5.2);
  const listCols = 3;
  const colW = (PAGE_W - 2 * M) / listCols;
  for (let start = 0; start < sorted.length; start += perCol * listCols) {
    doc.addPage();
    header(doc, project, sq.guests.pdfAlphabetical);
    sorted.slice(start, start + perCol * listCols).forEach((g, i) => {
      const x = M + Math.floor(i / perCol) * colW;
      const y = 32 + (i % perCol) * 5.2;
      doc.setFont('Figtree', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      const name = (doc.splitTextToSize(g.name, colW - 26) as string[])[0] ?? '';
      doc.text(name, x, y);
      doc.setFont('Figtree', 'bold');
      doc.text(g.tableId ? (labelOf.get(g.tableId) ?? '—') : '—', x + colW - 6, y, {
        align: 'right',
      });
    });
  }
}

/** Up to four 16:9 images in a 2×2 grid with captions below each. */
function imageGrid(doc: jsPDF, cells: Array<{ url: string; caption: string; sub?: string }>) {
  const gap = 8;
  const top = 30;
  const cellW = (PAGE_W - 2 * M - gap) / 2;
  const cellH = (PAGE_H - top - 16 - gap) / 2 - 9;
  const img = fit(1920, 1080, cellW, cellH);
  cells.slice(0, 4).forEach((c, i) => {
    const x = M + (i % 2) * (cellW + gap) + (cellW - img.w) / 2;
    const y = top + Math.floor(i / 2) * (cellH + 9 + gap);
    doc.addImage(c.url, imageFormat(c.url), x, y, img.w, img.h, undefined, 'FAST');
    doc.setFont('Figtree', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(c.caption, x, y + img.h + 4.5);
    if (c.sub) {
      doc.setFont('Figtree', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(c.sub, x + img.w, y + img.h + 4.5, { align: 'right' });
    }
  });
}

const PAGE_W = 297;
const PAGE_H = 210;
const M = 12;
const INK: [number, number, number] = [22, 34, 58];
const MUTED: [number, number, number] = [91, 103, 128];
const GOLD: [number, number, number] = [201, 164, 76];
const LINE: [number, number, number] = [216, 222, 231];

/** Agency line in every PDF header; the exporter sets it from the agency settings. */
let agencyLine: string = sq.export.agency;
export function setPdfAgency(name: string | undefined): void {
  agencyLine = name?.trim() || sq.export.agency;
}

export function setupFonts(doc: jsPDF, fonts: PdfFonts) {
  doc.addFileToVFS('Figtree-Regular.ttf', fonts.regular);
  doc.addFont('Figtree-Regular.ttf', 'Figtree', 'normal');
  doc.addFileToVFS('Figtree-SemiBold.ttf', fonts.bold);
  doc.addFont('Figtree-SemiBold.ttf', 'Figtree', 'bold');
  doc.addFileToVFS('Cormorant-SemiBold.ttf', fonts.title);
  doc.addFont('Cormorant-SemiBold.ttf', 'Cormorant', 'normal');
}

function header(doc: jsPDF, project: Project, title: string) {
  doc.setFillColor(...INK);
  doc.rect(0, 0, PAGE_W, 22, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 22, PAGE_W, 0.8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('Cormorant', 'normal');
  doc.setFontSize(20);
  doc.text(project.name, M, 11);
  doc.setFont('Figtree', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(214, 224, 240);
  doc.text(agencyLine, M, 17.5);
  doc.setFont('Figtree', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text(title, PAGE_W - M, 11, { align: 'right' });
}

function footer(doc: jsPDF, page: number, total: number) {
  doc.setFont('Figtree', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(sq.export.page(page, total), PAGE_W - M, PAGE_H - 6, { align: 'right' });
}

function infoLine(doc: jsPDF, project: Project, y: number) {
  const h = project.hall;
  const pairs: Array<[string, string]> = [
    [sq.export.client, project.clientName || sq.topbar.noClient],
    [sq.export.eventDate, project.eventDate ? formatDate(project.eventDate) : sq.export.noDate],
    [sq.export.hall, h.name],
    [
      sq.export.dimensions,
      `${formatMeters(h.width)} × ${formatMeters(h.length)} × ${formatMeters(h.height)}`,
    ],
  ];
  // With several design options, say which one this PDF shows (and if the client chose it).
  if (project.option && project.otherOptions?.length) {
    const final = project.finalOptionId === project.option.id ? ` (${sq.options.final})` : '';
    pairs.push([sq.options.pdfOption, `${project.option.name}${final}`]);
  }
  let x = M;
  for (const [label, value] of pairs) {
    doc.setFont('Figtree', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(label, x, y);
    doc.setFont('Figtree', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(value, x, y + 5);
    x += Math.max(48, doc.getTextWidth(value) + 12);
  }
}

const imageFormat = (url: string) => (url.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG');

function fit(w: number, h: number, maxW: number, maxH: number) {
  const k = Math.min(maxW / w, maxH / h);
  return { w: w * k, h: h * k };
}

/** Builds the 3-page A4 landscape PDF: blueprint, 3D views, item list with prices. */
export function buildPdf(
  project: Project,
  catalog: readonly CatalogItem[],
  images: PdfImages,
  fonts: PdfFonts,
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  setupFonts(doc, fonts);
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const summary = summarize(project.items, catalog);

  // ---- Page 1: blueprint + legend
  header(doc, project, sq.export.blueprintTitle);
  infoLine(doc, project, 31);
  const legendW = 62;
  const area = { x: M, y: 42, w: PAGE_W - 2 * M - legendW - 6, h: PAGE_H - 42 - 14 };
  const bp = fit(images.blueprint.width, images.blueprint.height, area.w, area.h);
  doc.addImage(
    images.blueprint.url,
    imageFormat(images.blueprint.url),
    area.x + (area.w - bp.w) / 2,
    area.y + (area.h - bp.h) / 2,
    bp.w,
    bp.h,
    undefined,
    'FAST',
  );

  const lx = PAGE_W - M - legendW;
  let ly = 46;
  doc.setFont('Figtree', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(sq.export.legend, lx, ly);
  ly += 6;
  doc.setFontSize(8.5);
  for (const line of summary.lines) {
    if (ly > PAGE_H - 18) break;
    const cat = byId.get(line.type);
    const color =
      project.items.find((i) => i.type === line.type)?.color ?? cat?.defaultColor ?? '#FFFFFF';
    doc.setFillColor(color);
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.2);
    if (cat?.shape2d === 'circle') doc.circle(lx + 2, ly - 1.2, 1.8, 'FD');
    else doc.rect(lx + 0.2, ly - 3, 3.6, 3.6, 'FD');
    doc.setFont('Figtree', 'normal');
    doc.setTextColor(...INK);
    const name = doc.splitTextToSize(line.name, legendW - 16) as string[];
    doc.text(name[0] ?? '', lx + 6, ly);
    doc.setFont('Figtree', 'bold');
    doc.text(`${line.quantity}`, PAGE_W - M, ly, { align: 'right' });
    ly += 5.2;
  }

  // ---- Page 2: two 3D views
  doc.addPage();
  header(doc, project, sq.export.view3dTitle);
  const imgW = PAGE_W - 2 * M;
  const slotH = (PAGE_H - 30 - 16) / 2 - 6;
  const view = fit(1920, 1080, imgW, slotH);
  const views: Array<[string, string]> = [
    [images.perspective, sq.export.perspective],
    [images.entrance, sq.export.entrance],
  ];
  views.forEach(([url, caption], i) => {
    const y = 30 + i * (slotH + 10);
    const x = (PAGE_W - view.w) / 2;
    doc.addImage(url, imageFormat(url), x, y, view.w, view.h, undefined, 'FAST');
    doc.setFont('Figtree', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(caption, x, y + view.h + 4.5);
  });

  // ---- Optional: eye-level views (walk-mode viewpoints)
  if (images.eyeViews?.length) {
    doc.addPage();
    header(doc, project, sq.export.eyeViewsTitle);
    imageGrid(doc, images.eyeViews);
  }

  // ---- Optional: design options side by side with their totals
  if (images.options && images.options.length > 1) {
    doc.addPage();
    header(doc, project, sq.options.compareTitle);
    imageGrid(
      doc,
      images.options.map((o) => ({
        url: o.url,
        caption: o.final ? `${o.name} – ${sq.options.final}` : o.name,
        sub: `${sq.summary.guests(o.capacity)} · ${formatEUR(o.total)}`,
      })),
    );
  }

  // ---- Page 3: item list with prices
  doc.addPage();
  header(doc, project, sq.export.listTitle);
  const cols = { item: M, qty: 175, unit: 225, total: PAGE_W - M };
  let y = 34;
  doc.setFont('Figtree', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(sq.export.colItem, cols.item, y);
  doc.text(sq.export.colQty, cols.qty, y, { align: 'right' });
  doc.text(sq.export.colUnit, cols.unit, y, { align: 'right' });
  doc.text(sq.export.colTotal, cols.total, y, { align: 'right' });
  y += 2.5;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, y, PAGE_W - M, y);
  y += 5.5;
  doc.setFontSize(10);
  const priced = summary.lines;
  const rowH = priced.length > 18 ? 5.2 : 6.4;
  for (const l of priced) {
    if (y > PAGE_H - 30) {
      doc.addPage();
      header(doc, project, sq.export.listTitle);
      y = 36;
      doc.setFontSize(10);
    }
    doc.setFont('Figtree', 'normal');
    doc.setTextColor(...INK);
    doc.text(l.name, cols.item, y);
    doc.text(String(l.quantity), cols.qty, y, { align: 'right' });
    doc.text(l.unitPrice > 0 ? formatEUR(l.unitPrice) : '—', cols.unit, y, { align: 'right' });
    doc.text(l.total > 0 ? formatEUR(l.total) : '—', cols.total, y, { align: 'right' });
    doc.setDrawColor(...LINE);
    doc.line(M, y + 2, PAGE_W - M, y + 2);
    y += rowH;
  }

  y += 3;
  // Totals, notes and signatures need ~70 mm (more with quote lines); new page if the list is long.
  const quoteLines =
    (project.pricing?.discountPercent ? 2 : 0) + (project.pricing?.extras?.length ?? 0);
  if (y > PAGE_H - 70 - quoteLines * 5.5) {
    doc.addPage();
    header(doc, project, sq.export.listTitle);
    y = 36;
  }
  // Discount and extra services (Oferta) come between the decor total and the grand total.
  const quote = quoteTotals(summary.total, project.pricing);
  const adjusted = quote.discount > 0 || quote.extras.length > 0;
  const totals: Array<[string, string, boolean]> = [
    [sq.export.totalChairs, String(summary.totalChairs), false],
    [sq.export.capacity, String(summary.capacity), false],
    ...(adjusted
      ? ([
          [sq.quote.subtotal, formatEUR(quote.subtotal), false],
          ...(quote.discount > 0
            ? [
                [
                  sq.quote.discountLine(quote.discountPercent),
                  `−${formatEUR(quote.discount)}`,
                  false,
                ],
              ]
            : []),
          ...quote.extras.map((e) => [
            e.label || sq.quote.extraPlaceholder,
            formatEUR(e.amount),
            false,
          ]),
        ] as Array<[string, string, boolean]>)
      : []),
    [sq.export.grandTotal, formatEUR(quote.total), true],
  ];
  for (const [label, value, strong] of totals) {
    doc.setFont('Figtree', strong ? 'bold' : 'normal');
    doc.setFontSize(strong ? 12 : 10);
    doc.setTextColor(...INK);
    doc.text(label, cols.unit, y, { align: 'right' });
    doc.text(value, cols.total, y, { align: 'right' });
    y += strong ? 7 : 5.5;
  }

  if (project.notes) {
    doc.setFont('Figtree', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(sq.export.notes, M, y + 2);
    doc.setFont('Figtree', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const lines = (doc.splitTextToSize(project.notes, PAGE_W - 2 * M) as string[]).slice(0, 6);
    doc.text(lines, M, y + 7);
  }

  const sy = PAGE_H - 22;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(M, sy, M + 80, sy);
  doc.line(PAGE_W - M - 80, sy, PAGE_W - M, sy);
  doc.setFont('Figtree', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(sq.export.signClient, M, sy + 5);
  doc.text(sq.export.signAgency, PAGE_W - M - 80, sy + 5);
  if (project.guests?.length) seatingPages(doc, project, catalog);

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    footer(doc, p, pages);
  }
  return doc;
}

const CHECK_STAGES = ['loaded', 'installed', 'returned'] as const;
const CHECK_CATEGORIES = ['tables', 'stage', 'floral', 'lighting', 'other'] as const;

/**
 * "Fleta e ngarkimit": the team's loading / installation / return sheet with a box to tick for
 * every decor line (already ticked ones are filled), and the free tasks.
 */
export function buildChecklistPdf(
  project: Project,
  catalog: readonly CatalogItem[],
  fonts: PdfFonts,
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  setupFonts(doc, fonts);
  const byId = catalogById(catalog);
  const lines = summarize(project.items, catalog).lines;
  const entries = project.checklist?.lines ?? {};
  const colX = { qty: 150, stages: [190, 225, 260] };
  const top = () => {
    header(doc, project, sq.checklist.pdfTitle);
    infoLine(doc, project, 31);
    doc.setFont('Figtree', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(sq.export.colItem, M, 46);
    doc.text(sq.export.colQty, colX.qty, 46, { align: 'right' });
    CHECK_STAGES.forEach((s, i) =>
      doc.text(sq.checklist.stages[s], colX.stages[i]!, 46, { align: 'center' }),
    );
    return 53;
  };
  let y = top();
  const box = (x: number, yy: number, done: boolean) => {
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.35);
    doc.rect(x - 2.5, yy - 3.6, 5, 5, done ? 'FD' : 'S');
  };
  doc.setFillColor(...GOLD);
  for (const category of CHECK_CATEGORIES) {
    const group = lines.filter((l) => (byId.get(l.type)?.category ?? 'other') === category);
    if (!group.length) continue;
    if (y > PAGE_H - 30) {
      doc.addPage();
      y = top();
    }
    doc.setFont('Figtree', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(sq.categories[category], M, y);
    y += 6;
    for (const l of group) {
      if (y > PAGE_H - 18) {
        doc.addPage();
        y = top();
      }
      doc.setFont('Figtree', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(l.name, M + 4, y);
      doc.text(String(l.quantity), colX.qty, y, { align: 'right' });
      CHECK_STAGES.forEach((s, i) => box(colX.stages[i]!, y, !!entries[l.type]?.[s]));
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(M, y + 2.5, PAGE_W - M, y + 2.5);
      y += 7.5;
    }
    y += 2;
  }
  const tasks = project.checklist?.tasks ?? [];
  if (tasks.length) {
    if (y > PAGE_H - 30) {
      doc.addPage();
      y = top();
    }
    doc.setFont('Figtree', 'bold');
    doc.setFontSize(10);
    doc.text(sq.checklist.tasks, M, y);
    y += 6;
    for (const t of tasks) {
      if (y > PAGE_H - 18) {
        doc.addPage();
        y = top();
      }
      box(M + 2.5, y, t.done);
      doc.setFont('Figtree', 'normal');
      doc.text(t.assignee ? `${t.text} · ${t.assignee}` : t.text, M + 9, y);
      y += 7.5;
    }
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    footer(doc, p, pages);
  }
  return doc;
}

/** `Plan-<client>-<date>.pdf` with characters that are unsafe in file names removed. */
export function pdfFileName(project: Project, today = new Date()): string {
  const client =
    (project.clientName || project.name)
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '-') || 'projekt';
  const date = project.eventDate ?? today.toISOString().slice(0, 10);
  return `${sq.export.filePrefix}-${client}-${date}.pdf`;
}
