import { chairPositions, hasChairs, localToWorld, type CatalogMap, type Item } from '@salla/shared';
import { GOLD } from './resources';

export interface ChairPose {
  x: number;
  /** Plan y (becomes 3D z). */
  y: number;
  /** Plan rotation in degrees (clockwise). */
  rotation: number;
  frame: string;
  cushion: string;
}

/**
 * All chairs in the layout: automatic chairs around tables plus standalone chair items.
 * With a scanned chair model GlbInstances draws them instead, so this is empty, unless
 * `ignoreModel` asks for the procedural chairs (the model is broken or still loading).
 */
export function collectChairs(
  items: readonly Item[],
  catalog: CatalogMap,
  ignoreModel = false,
): ChairPose[] {
  if (!ignoreModel && catalog.get('chair')?.modelFile) return [];
  const out: ChairPose[] = [];
  for (const item of items) {
    const cat = catalog.get(item.type);
    if (item.type === 'chair') {
      out.push({
        x: item.x,
        y: item.y,
        rotation: item.rotation,
        frame: item.color,
        cushion: item.color2 ?? cat?.defaultColor2 ?? '#F3EBDD',
      });
      continue;
    }
    if (!hasChairs(cat)) continue;
    const cushion = item.color2 ?? cat?.defaultColor2 ?? '#F3EBDD';
    for (const p of chairPositions(item, cat)) {
      const w = localToWorld(item, p);
      out.push({ x: w.x, y: w.y, rotation: item.rotation + p.rotation, frame: GOLD, cushion });
    }
  }
  return out;
}

/** The automatic chairs around tables as items, to draw them with a scanned chair model. */
export function autoChairItems(items: readonly Item[], catalog: CatalogMap): Item[] {
  const chair = catalog.get('chair');
  if (!chair) return [];
  const out: Item[] = [];
  for (const item of items) {
    const cat = catalog.get(item.type);
    if (item.type === 'chair' || !hasChairs(cat)) continue;
    chairPositions(item, cat).forEach((p, i) => {
      const w = localToWorld(item, p);
      out.push({
        id: `${item.id}-chair-${i}`,
        type: 'chair',
        x: w.x,
        y: w.y,
        rotation: item.rotation + p.rotation,
        width: chair.width,
        depth: chair.depth,
        color: chair.defaultColor,
      });
    });
  }
  return out;
}

/** Group chairs by colors so each group is one pair of InstancedMeshes. */
export function groupChairs(chairs: readonly ChairPose[]): Map<string, ChairPose[]> {
  const groups = new Map<string, ChairPose[]>();
  for (const c of chairs) {
    const key = `${c.frame}|${c.cushion}`;
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }
  return groups;
}
