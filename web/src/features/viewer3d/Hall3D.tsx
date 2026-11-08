import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { WINDOW_SILL, type Hall, type Item } from '@salla/shared';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ScanShell } from './ScanShell';
import { TentShell } from './TentShell';
import { geo, mat } from './resources';
import { FLOOR_TILE_METERS, floorTextures } from './textures';
import { tiled, tintToward, usePbr, type PbrName } from './pbrTextures';

/** Relief strength per floor: deep plank seams and grout, faint slab joints, soft carpet pile. */
const FLOOR_BUMP: Record<Hall['floor'], number> = {
  parket: 1.2,
  mermer: 0.6,
  pllake: 1.6,
  tapet: 0.5,
};

/** Photo texture set per floor type (the carpet only borrows the velvet pile relief). */
const FLOOR_PBR: Record<Hall['floor'], PbrName> = {
  parket: 'parquet',
  mermer: 'marble',
  pllake: 'tiles',
  tapet: 'velvet',
};
/** Overall shine on top of each photo's roughness map: polished marble, varnish, glaze. */
const FLOOR_ROUGHNESS: Record<Hall['floor'], number> = {
  parket: 0.85,
  mermer: 0.35,
  pllake: 0.75,
  tapet: 1,
};

function disposeMaterial(m: THREE.MeshStandardMaterial) {
  m.map?.dispose();
  m.bumpMap?.dispose();
  m.normalMap?.dispose();
  m.roughnessMap?.dispose();
  m.dispose();
}

function useFloorMaterial(hall: Hall, wait: boolean) {
  const set = usePbr(FLOOR_PBR[hall.floor], wait);
  const material = useMemo(() => {
    const W = hall.width;
    const L = hall.length;
    if (set?.map) {
      // A real parquet / marble / tile photo, tinted toward the chosen floor colour.
      const maps = tiled(set, W, L);
      return new THREE.MeshStandardMaterial({
        ...maps,
        color: tintToward(set, hall.floorColor),
        roughness: FLOOR_ROUGHNESS[hall.floor],
        metalness: 0,
        normalScale: new THREE.Vector2(0.9, 0.9),
      });
    }
    const tile = FLOOR_TILE_METERS[hall.floor];
    const maps = floorTextures(hall.floor, hall.floorColor);
    // Clones share the image but get their own repeat for this hall's size.
    const [map, bump, rough] = [maps.map, maps.bump, maps.rough].map((t) => {
      const c = t.clone();
      c.repeat.set(W / tile, L / tile);
      c.needsUpdate = true;
      return c;
    });
    if (set && hall.floor === 'tapet') {
      // Carpet: the generated pattern with a real woven pile relief.
      const pile = tiled(set, W * 0.5, L * 0.5);
      bump!.dispose();
      rough!.dispose();
      return new THREE.MeshStandardMaterial({
        map,
        normalMap: pile.normalMap,
        roughnessMap: pile.roughnessMap,
        roughness: 1,
        normalScale: new THREE.Vector2(0.6, 0.6),
      });
    }
    return new THREE.MeshStandardMaterial({
      map,
      bumpMap: bump,
      bumpScale: FLOOR_BUMP[hall.floor],
      // The roughness map holds the real values (polished marble, worn varnish, matte grout).
      roughness: 1,
      roughnessMap: rough,
      metalness: hall.floor === 'mermer' ? 0.08 : 0,
    });
  }, [hall.floor, hall.floorColor, hall.width, hall.length, set]);
  useEffect(() => () => disposeMaterial(material), [material]);
  return material;
}

/** Painted plaster: the wall colour with a real plaster relief, sized per wall. */
function usePlaster(color: string, w: number, h: number, wait: boolean) {
  const set = usePbr('plaster', wait);
  const material = useMemo(() => {
    if (!set) return null;
    const maps = tiled(set, w, h);
    return new THREE.MeshStandardMaterial({
      color,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: 0.95,
      normalScale: new THREE.Vector2(0.45, 0.45),
    });
  }, [set, color, w, h]);
  useEffect(
    () => () => {
      if (material) disposeMaterial(material);
    },
    [material],
  );
  return material;
}

function StructureMesh({ item, hall }: { item: Item; hall: Hall }) {
  const g = geo();
  const rot = (-item.rotation * Math.PI) / 180;
  if (item.type === 'column') {
    const height = item.height ?? hall.height;
    // Thin columns are the round aluminium poles of a tent.
    if (Math.max(item.width, item.depth) <= 0.25) {
      return (
        <mesh
          geometry={g.cylinderLow}
          material={mat('metal', item.color)}
          position={[item.x, height / 2, item.y]}
          scale={[item.width, height, item.depth]}
          castShadow
        />
      );
    }
    return (
      <mesh
        geometry={g.box}
        material={mat('matte', item.color)}
        position={[item.x, height / 2, item.y]}
        rotation={[0, rot, 0]}
        scale={[item.width, height, item.depth]}
        castShadow
        receiveShadow
      />
    );
  }
  if (item.type === 'door') {
    const h = item.height ?? 2.4;
    return (
      <group position={[item.x, 0, item.y]} rotation={[0, rot, 0]}>
        <mesh
          geometry={g.box}
          material={mat('gold', '#B08D3E')}
          position={[0, h / 2 + 0.03, 0]}
          scale={[item.width + 0.12, h + 0.06, 0.08]}
        />
        <mesh
          geometry={g.box}
          material={mat('wood', item.color)}
          position={[0, h / 2, 0]}
          scale={[item.width, h, 0.1]}
        />
        <mesh
          geometry={g.box}
          material={mat('metal', '#C9A44C')}
          position={[0, h / 2, 0]}
          scale={[0.02, h * 0.95, 0.11]}
        />
      </group>
    );
  }
  if (item.type === 'window') {
    const h = item.height ?? 1.6;
    return (
      <group position={[item.x, WINDOW_SILL + h / 2, item.y]} rotation={[0, rot, 0]}>
        <mesh
          geometry={g.box}
          material={mat('matte', '#FFFFFF')}
          scale={[item.width + 0.1, h + 0.1, 0.08]}
        />
        <mesh
          geometry={g.box}
          material={mat('glass', '#BFD9F2', 1.6)}
          scale={[item.width, h, 0.1]}
        />
      </group>
    );
  }
  return null;
}

/** Floor, inward-facing walls (dollhouse effect), ceiling and structure items. */
/** `wait`: off-screen renders wait for the photo textures instead of the procedural stand-ins. */
export function Hall3D({
  hall,
  evening = false,
  wait = false,
}: {
  hall: Hall;
  evening?: boolean;
  wait?: boolean;
}) {
  const g = geo();
  const floor = useFloorMaterial(hall, wait);
  const W = hall.width;
  const L = hall.length;
  const H = hall.height;
  // FrontSide culling: a wall is only visible from inside the room, so near walls vanish.
  const plain = mat('matte', hall.wallColor);
  const longWall = usePlaster(hall.wallColor, W, H, wait) ?? plain;
  const shortWall = usePlaster(hall.wallColor, L, H, wait) ?? plain;
  const ceiling = usePlaster('#FAF7F2', W, L, wait) ?? mat('matte', '#FAF7F2');
  const box = (
    <>
      <mesh
        geometry={g.plane}
        material={longWall}
        position={[W / 2, H / 2, 0]}
        scale={[W, H, 1]}
        receiveShadow
      />
      <mesh
        geometry={g.plane}
        material={longWall}
        position={[W / 2, H / 2, L]}
        rotation={[0, Math.PI, 0]}
        scale={[W, H, 1]}
        receiveShadow
      />
      <mesh
        geometry={g.plane}
        material={shortWall}
        position={[0, H / 2, L / 2]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[L, H, 1]}
        receiveShadow
      />
      <mesh
        geometry={g.plane}
        material={shortWall}
        position={[W, H / 2, L / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={[L, H, 1]}
        receiveShadow
      />
      <mesh
        geometry={g.plane}
        material={ceiling}
        position={[W / 2, H, L / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[W, L, 1]}
      />
    </>
  );
  const kind = hall.kind ?? 'salle';
  let shell = box;
  if (kind === 'tende') {
    shell = <TentShell hall={hall} evening={evening} wait={wait} />;
  } else if (kind === 'skan' && hall.shell) {
    // A missing or broken scan (or one still loading) shows the plain room.
    shell = (
      <ErrorBoundary fallback={box} resetKey={hall.shell.url}>
        {wait ? (
          <ScanShell shell={hall.shell} />
        ) : (
          <Suspense fallback={box}>
            <ScanShell shell={hall.shell} />
          </Suspense>
        )}
      </ErrorBoundary>
    );
  }
  const scanFloor = kind === 'skan' && !!hall.shell?.scanFloor;
  return (
    <group>
      {!scanFloor && (
        <mesh
          geometry={g.plane}
          material={floor}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[W / 2, 0, L / 2]}
          scale={[W, L, 1]}
          receiveShadow
        />
      )}
      {shell}
      {hall.structure.map((s) => (
        <StructureMesh key={s.id} item={s} hall={hall} />
      ))}
    </group>
  );
}
