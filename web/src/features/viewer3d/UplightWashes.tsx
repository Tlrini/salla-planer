import * as THREE from 'three';
import { isOpenAir, nearestWall, type Hall, type Item } from '@salla/shared';
import { geo } from './resources';
import { glowTexture, washTexture } from './textures';

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

const POOL = 3.5;
const pools = new Map<string, THREE.MeshBasicMaterial>();

/** Without a wall, the uplight leaves a soft pool of colour on the ground. */
function poolMaterial(color: string, evening: boolean) {
  const key = `${color}|${evening}`;
  let m = pools.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity: evening ? 0.8 : 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    pools.set(key, m);
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
  // Nothing solid to shine on: open air, glass walls, a tent with its sides rolled up.
  const noWalls =
    isOpenAir(hall) || hall.kind === 'xham' || (hall.kind === 'tende' && hall.tent?.openSides);
  return (
    <>
      {items
        .filter((i) => i.type === 'uplight')
        .map((u) => {
          if (noWalls) {
            return (
              <mesh
                key={u.id}
                geometry={geo().plane}
                material={poolMaterial(u.color, evening)}
                position={[u.x, 0.02, u.y]}
                rotation={[-Math.PI / 2, 0, 0]}
                scale={[POOL, POOL, 1]}
                renderOrder={2}
              />
            );
          }
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
