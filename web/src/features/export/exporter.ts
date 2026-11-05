import type { Project } from '@salla/shared';
import { catalog, catalogMap } from '../../model/store';
import type { CameraPreset } from '../viewer3d/cameras';
import { renderBlueprint } from './blueprintSnapshot';
import { loadPdfFonts } from './fonts';
import { buildPdf, pdfFileName } from './pdf';
import { render3d } from './render3d';

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** For a hall template the editable items are its structure. */
function plan(project: Project) {
  return { hall: project.hall, items: project.items };
}

export async function exportPdf(project: Project, evening: boolean): Promise<string> {
  const { hall, items } = plan(project);
  const [blueprint, [perspective, entrance], fonts] = await Promise.all([
    renderBlueprint(hall, items, catalogMap),
    render3d(hall, items, catalogMap, ['perspective', 'entrance'], { evening }),
    loadPdfFonts(),
  ]);
  const doc = buildPdf(
    project,
    catalog,
    { blueprint, perspective: perspective!, entrance: entrance! },
    fonts,
  );
  const name = pdfFileName(project);
  const url = URL.createObjectURL(doc.output('blob'));
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return name;
}

export async function exportPlanPng(project: Project): Promise<void> {
  const { hall, items } = plan(project);
  const img = await renderBlueprint(hall, items, catalogMap, { pixelRatio: 3 });
  download(img.url, pdfFileName(project).replace(/\.pdf$/, '-plani.png'));
}

export async function export3dPng(
  project: Project,
  preset: CameraPreset,
  evening: boolean,
): Promise<void> {
  const { hall, items } = plan(project);
  const [url] = await render3d(hall, items, catalogMap, [preset], { evening, mime: 'image/png' });
  download(url!, pdfFileName(project).replace(/\.pdf$/, '-3d.png'));
}
