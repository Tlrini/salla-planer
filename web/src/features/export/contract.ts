import { jsPDF } from 'jspdf';
import {
  formatDate,
  formatEUR,
  formatMeters,
  projectFinance,
  quoteTotals,
  summarize,
  type AgencySettings,
  type CatalogItem,
  type Project,
} from '@salla/shared';
import { sq } from '../../i18n/sq';
import { setupFonts, type PdfFonts } from './pdf';

const W = 210;
const H = 297;
const M = 18;
const INK: [number, number, number] = [22, 34, 58];
const MUTED: [number, number, number] = [91, 103, 128];
const LINE: [number, number, number] = [216, 222, 231];

/** "K-2026-AB12CD": year of today + the start of the project id. */
export function contractNumber(project: Project, today = new Date()): string {
  return `K-${today.getFullYear()}-${project.id
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 6)
    .toUpperCase()}`;
}

/**
 * Service contract for the event decoration (A4 portrait): parties, object, price with discount
 * and services, deposit and payments, terms and signatures.
 */
export function buildContractPdf(
  project: Project,
  catalog: readonly CatalogItem[],
  agency: AgencySettings,
  fonts: PdfFonts,
  today = new Date(),
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  setupFonts(doc, fonts);
  let y = M;
  const ensure = (h: number) => {
    if (y + h > H - 20) {
      doc.addPage();
      y = M;
    }
  };
  const heading = (text: string) => {
    ensure(14);
    y += 4;
    doc.setFont('Figtree', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(text, M, y);
    y += 6;
  };
  const para = (text: string, size = 10) => {
    doc.setFont('Figtree', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...INK);
    for (const line of doc.splitTextToSize(text, W - 2 * M) as string[]) {
      ensure(5);
      doc.text(line, M, y);
      y += size * 0.5;
    }
    y += 1.5;
  };
  const row = (label: string, value: string, bold = false) => {
    ensure(6);
    doc.setFont('Figtree', bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(label, M, y);
    doc.text(value, W - M, y, { align: 'right' });
    y += 5.5;
  };

  const agencyName = agency.name.trim() || sq.export.agency;
  // Title block
  doc.setFont('Cormorant', 'normal');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text(sq.contract.title, W / 2, y + 4, { align: 'center' });
  y += 11;
  doc.setFont('Figtree', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(
    sq.contract.numberDate(contractNumber(project, today), formatDate(today.toISOString())),
    W / 2,
    y,
    { align: 'center' },
  );
  y += 8;

  heading(sq.contract.parties);
  const agencyLines = [
    agencyName,
    [agency.address, agency.city].filter(Boolean).join(', '),
    agency.nipt ? `${sq.contract.nipt}: ${agency.nipt}` : '',
    [agency.phone, agency.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  para(`${sq.contract.agencyRole}: ${agencyLines.join(', ')}.`);
  para(
    `${sq.contract.clientRole}: ${project.clientName || '—'}${project.clientPhone ? `, ${sq.contract.phone} ${project.clientPhone}` : ''}.`,
  );

  heading(sq.contract.article(1, sq.contract.object));
  const h = project.hall;
  para(
    sq.contract.objectText(
      sq.eventTypes[project.eventType],
      project.name,
      project.eventDate ? formatDate(project.eventDate) : undefined,
      h.name,
      `${formatMeters(h.width)} × ${formatMeters(h.length)}`,
    ),
  );

  heading(sq.contract.article(2, sq.contract.price));
  const summary = summarize(project.items, catalog);
  for (const l of summary.lines.filter((x) => x.total > 0)) {
    row(`${l.quantity} × ${l.name}`, formatEUR(l.total));
  }
  doc.setDrawColor(...LINE);
  doc.line(M, y - 3, W - M, y - 3);
  const q = quoteTotals(summary.total, project.pricing);
  row(sq.quote.subtotal, formatEUR(q.subtotal));
  if (q.discount > 0) row(sq.quote.discountLine(q.discountPercent), `−${formatEUR(q.discount)}`);
  for (const e of q.extras) row(e.label || sq.quote.extraPlaceholder, formatEUR(e.amount));
  row(sq.quote.total, formatEUR(q.total), true);

  heading(sq.contract.article(3, sq.contract.payment));
  const f = projectFinance(project.items, project.pricing, project.payments, catalog);
  if (f.deposit > 0)
    para(sq.contract.depositText(project.pricing?.depositPercent ?? 0, formatEUR(f.deposit)));
  para(sq.contract.balanceText);
  if (agency.iban)
    para(`${sq.contract.bankAccount}: ${[agency.bank, agency.iban].filter(Boolean).join(' · ')}`);
  for (const p of project.payments ?? [])
    row(`${formatDate(p.date)} · ${sq.payments.methods[p.method]}`, formatEUR(p.amount));
  if (project.payments?.length) {
    row(sq.payments.paid, formatEUR(f.paid), true);
    row(sq.payments.balance, formatEUR(f.balance), true);
  }

  heading(sq.contract.article(4, sq.contract.terms));
  const terms = agency.contractTerms?.trim() ? agency.contractTerms : sq.contract.defaultTerms;
  terms
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((t, i) => para(`${i + 1}. ${t}`, 9.5));
  if (project.notes?.trim()) para(`${sq.export.notes}: ${project.notes.trim()}`, 9.5);

  // Signatures
  ensure(34);
  y = Math.max(y + 16, H - 52);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(M, y, M + 70, y);
  doc.line(W - M - 70, y, W - M, y);
  doc.setFont('Figtree', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${sq.export.signAgency} – ${agencyName}`, M, y + 5);
  doc.text(`${sq.export.signClient} – ${project.clientName || ''}`, W - M - 70, y + 5);

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(sq.export.page(p, pages), W - M, H - 8, { align: 'right' });
  }
  return doc;
}
