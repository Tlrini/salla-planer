import { NodeIO, type Document } from '@gltf-transform/core';
import { dedup, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

/** Triangle budget of one chair: a wedding draws hundreds of them. */
export const CHAIR_TRIANGLES = 4_000;
/** Triangle budget of one table (tens per hall). */
export const TABLE_TRIANGLES = 30_000;

export const trianglesFor = (catalogId: string): number =>
  catalogId === 'chair' ? CHAIR_TRIANGLES : TABLE_TRIANGLES;

/** Share of triangles to keep so the model ends near `target` (1 = keep all). Pure. */
export function keepRatio(triangles: number, target: number): number {
  if (triangles <= target || triangles <= 0) return 1;
  return Math.max(0.005, target / triangles);
}

function countTriangles(doc: Document): number {
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      triangles += (indices ? indices.getCount() : (position?.getCount() ?? 0)) / 3;
    }
  return Math.round(triangles);
}

/** Write a copy of the .glb at `target` reduced to about `maxTriangles`. */
export async function simplifyGlb(
  source: string,
  target: string,
  maxTriangles: number,
): Promise<{ before: number; after: number }> {
  await MeshoptSimplifier.ready;
  const io = new NodeIO();
  const doc = await io.read(source);
  const before = countTriangles(doc);
  await doc.transform(weld(), dedup());
  const ratio = keepRatio(before, maxTriangles);
  if (ratio < 1)
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.05 }));
  await doc.transform(prune());
  await io.write(target, doc);
  return { before, after: countTriangles(doc) };
}
