import { jsPDF } from 'jspdf';
import {
  formatDate,
  formatEUR,
  formatMeters,
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
}

const PAGE_W = 297;
const PAGE_H = 210;
const M = 12;
const INK: [number, number, number] = [22, 34, 58];
const MUTED: [number, number, number] = [91, 103, 128];
const GOLD: [number, number, number] = [201, 164, 76];
const LINE: [number, number, number] = [216, 222, 231];

function setupFonts(doc: jsPDF, fonts: PdfFonts) {
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
  doc.text(sq.export.agency, M, 17.5);
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
  // Totals, notes and signatures need ~70 mm; continue on a new page if the list is long.
  if (y > PAGE_H - 70) {
    doc.addPage();
    header(doc, project, sq.export.listTitle);
    y = 36;
  }
  const totals: Array<[string, string, boolean]> = [
    [sq.export.totalChairs, String(summary.totalChairs), false],
    [sq.export.capacity, String(summary.capacity), false],
    [sq.export.grandTotal, formatEUR(summary.total), true],
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
