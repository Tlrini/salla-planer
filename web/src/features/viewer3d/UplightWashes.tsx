import * as THREE from 'three';
import { nearestWall, type Hall, type Item } from '@salla/shared';
import { geo } from './resources';
import { washTexture } from './textures';

const washes = new Map<string, THREE.MeshBasicMaterial>();

function washMaterial(color: string, evening: boolean) {
  const key = `${color}|${evening}`;
  let m = washes.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: washTexture(),
      color,
      transparent: true,
      opacity: evening ? 0.95 : 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    washes.set(key, m);
  }
  return m;
}

/** Additive colored "light wash" on the wall nearest to each uplight. */
export function UplightWashes({
  items,
  hall,
  evening,
}: {
  items: readonly Item[];
  hall: Hall;
  evening: boolean;
}) {
  const H = Math.min(hall.height, 4);
  return (
    <>
      {items
        .filter((i) => i.type === 'uplight')
        .map((u) => {
          const { wall } = nearestWall(u.x, u.y, hall);
          const off = 0.03;
          const pos: [number, number, number] =
            wall === 'top'
              ? [u.x, H / 2, off]
              : wall === 'bottom'
                ? [u.x, H / 2, hall.length - off]
                : wall === 'left'
                  ? [off, H / 2, u.y]
                  : [hall.width - off, H / 2, u.y];
          const rotY =
            wall === 'top'
              ? 0
              : wall === 'bottom'
                ? Math.PI
                : wall === 'left'
                  ? Math.PI / 2
                  : -Math.PI / 2;
          return (
            <mesh
              key={u.id}
              geometry={geo().plane}
              material={washMaterial(u.color, evening)}
              position={pos}
              rotation={[0, rotY, 0]}
              scale={[1.8, H, 1]}
              renderOrder={2}
            />
          );
        })}
    </>
  );
}
