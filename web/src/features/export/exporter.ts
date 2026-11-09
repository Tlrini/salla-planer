import { quoteTotals, summarize, walkArea, walkTarget, type Project } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { catalog, catalogMap } from '../../model/store';
import {
  autoViewpoints,
  poseLookingAt,
  walkState,
  type CameraPreset,
  type Pose,
} from '../viewer3d/cameras';
import { PANO_HEIGHT, PANO_WIDTH, renderPanorama } from './panorama';
import { dataUrlBytes, panoramaXmp, withXmp } from './xmp';
import { renderBlueprint } from './blueprintSnapshot';
import { loadPdfFonts } from './fonts';
import type { AgencySettings } from '@salla/shared';
import { api } from '../../api/client';
import { buildContractPdf } from './contract';
import { buildChecklistPdf, buildPdf, pdfFileName, setPdfAgency, type PdfImages } from './pdf';
import { render3d } from './render3d';

export function download(href: string, name: string) {
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

/** Eye-level views for the PDF (max 4). */
function eyeViewpoints(project: Project): Array<{ pose: Pose; caption: string }> {
  const { hall, items } = plan(project);
  const area = walkArea(hall, items, catalogMap);
  // The agent's saved views first, topped up with the automatic ones (the entrance view is
  // already on the 3D page).
  const wanted = [
    ...(project.viewpoints ?? []).map((v) => ({ pose: v as Pose, caption: v.name })),
    ...autoViewpoints(hall, items)
      .filter((a) => a.key !== 'entrance')
      .map((a) => ({ pose: a.pose, caption: sq.walk.auto[a.key] })),
  ];
  return wanted.slice(0, 4).map(({ pose, caption }) => {
    const spot = walkTarget(pose, area);
    const moved = spot && Math.hypot(spot.x - pose.x, spot.y - pose.y) > 0.05;
    const aimed = moved && pose.look ? poseLookingAt(spot.x, spot.y, pose.look) : pose;
    return { pose: { ...aimed, ...(spot ?? {}) }, caption };
  });
}

/** Agency details from the server (empty name if not set or offline). */
async function loadAgency(): Promise<AgencySettings> {
  const agency = await api.get<AgencySettings>('/api/settings/agency').catch(() => ({ name: '' }));
  setPdfAgency(agency.name);
  return agency;
}

export async function exportPdf(
  project: Project,
  evening: boolean,
  sunset = false,
): Promise<string> {
  await loadAgency();
  const { hall, items } = plan(project);
  const eyes = eyeViewpoints(project);
  const [blueprint, [perspective, entrance, ...eyeUrls], fonts] = await Promise.all([
    renderBlueprint(hall, items, catalogMap, { annotations: project.annotations }),
    render3d(hall, items, catalogMap, ['perspective', 'entrance', ...eyes.map((e) => e.pose)], {
      evening,
      sunset,
    }),
    loadPdfFonts(),
  ]);

  // One perspective render per design option, for the comparison page.
  let options: PdfImages['options'];
  if (project.otherOptions?.length) {
    const active = { ...(project.option ?? { id: 'A', name: sq.options.name(0) }), items };
    const all = [active, ...project.otherOptions].sort((a, b) =>
      a.name.localeCompare(b.name, 'sq', { numeric: true }),
    );
    options = [];
    for (const o of all.slice(0, 4)) {
      const [url] = await render3d(hall, o.items, catalogMap, ['perspective'], {
        evening,
        sunset,
      });
      const s = summarize(o.items, catalog);
      options.push({
        url: url!,
        name: o.name,
        total: quoteTotals(s.total, project.pricing).total,
        capacity: s.capacity,
        final: project.finalOptionId === o.id,
      });
    }
  }

  const doc = buildPdf(
    project,
    catalog,
    {
      blueprint,
      perspective: perspective!,
      entrance: entrance!,
      eyeViews: eyes.map((e, i) => ({ url: eyeUrls[i]!, caption: e.caption })),
      options,
    },
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
  const img = await renderBlueprint(hall, items, catalogMap, {
    pixelRatio: 3,
    annotations: project.annotations,
  });
  download(img.url, pdfFileName(project).replace(/\.pdf$/, '-plani.png'));
}

export async function export3dPng(
  project: Project,
  preset: CameraPreset,
  evening: boolean,
  sunset = false,
): Promise<void> {
  const { hall, items } = plan(project);
  const [url] = await render3d(hall, items, catalogMap, [preset], {
    evening,
    sunset,
    mime: 'image/png',
  });
  download(url!, pdfFileName(project).replace(/\.pdf$/, '-3d.png'));
}

/**
 * 360° panorama JPEG (with photo-sphere metadata) from where the visitor stands in walk mode,
 * or from the entrance.
 */
export async function export360(
  project: Project,
  evening: boolean,
  fromWalk: boolean,
  sunset = false,
) {
  const { hall, items } = plan(project);
  const wanted = (fromWalk && walkState.last) || autoViewpoints(hall, items)[0]!.pose;
  const spot = walkTarget(wanted, walkArea(hall, items, catalogMap)) ?? wanted;
  const url = await renderPanorama(
    hall,
    items,
    catalogMap,
    { ...wanted, ...spot },
    evening,
    sunset,
  );
  const bytes = withXmp(dataUrlBytes(url), panoramaXmp(PANO_WIDTH, PANO_HEIGHT));
  const blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
  download(blobUrl, pdfFileName(project).replace(/\.pdf$/, '-360.jpg'));
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
}

/** The team's loading / installation sheet as a PDF ("Lista-<client>-<date>.pdf"). */
export async function exportChecklistPdf(project: Project): Promise<void> {
  await loadAgency();
  const doc = buildChecklistPdf(project, catalog, await loadPdfFonts());
  const url = URL.createObjectURL(doc.output('blob'));
  download(url, pdfFileName(project).replace(/^[^-]+/, sq.checklist.filePrefix));
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Service contract ("Kontrata-<client>-<date>.pdf") with the agency details. */
export async function exportContractPdf(project: Project): Promise<void> {
  const agency = await loadAgency();
  const doc = buildContractPdf(project, catalog, agency, await loadPdfFonts());
  const url = URL.createObjectURL(doc.output('blob'));
  download(url, pdfFileName(project).replace(/^[^-]+/, sq.contract.filePrefix));
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
