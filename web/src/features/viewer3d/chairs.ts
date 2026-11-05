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

/** All chairs in the layout: automatic chairs around tables plus standalone chair items. */
export function collectChairs(items: readonly Item[], catalog: CatalogMap): ChairPose[] {
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
