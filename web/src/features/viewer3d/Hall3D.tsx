import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { WINDOW_SILL, type Hall, type Item } from '@salla/shared';
import { geo, mat } from './resources';
import { FLOOR_TILE_METERS, floorTexture } from './textures';

function useFloorMaterial(hall: Hall) {
  const material = useMemo(() => {
    const tex = floorTexture(hall.floor, hall.floorColor).clone();
    tex.needsUpdate = true;
    const tile = FLOOR_TILE_METERS[hall.floor];
    tex.repeat.set(hall.width / tile, hall.length / tile);
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: hall.floor === 'mermer' ? 0.18 : hall.floor === 'tapet' ? 0.95 : 0.55,
      metalness: hall.floor === 'mermer' ? 0.08 : 0,
    });
  }, [hall.floor, hall.floorColor, hall.width, hall.length]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );
  return material;
}

function StructureMesh({ item, hall }: { item: Item; hall: Hall }) {
  const g = geo();
  const rot = (-item.rotation * Math.PI) / 180;
  if (item.type === 'column') {
    return (
      <mesh
        geometry={g.box}
        material={mat('matte', item.color)}
        position={[item.x, hall.height / 2, item.y]}
        rotation={[0, rot, 0]}
        scale={[item.width, hall.height, item.depth]}
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
export function Hall3D({ hall }: { hall: Hall }) {
  const g = geo();
  const floor = useFloorMaterial(hall);
  const W = hall.width;
  const L = hall.length;
  const H = hall.height;
  // FrontSide culling: a wall is only visible from inside the room, so near walls vanish.
  const wall = mat('matte', hall.wallColor);
  const ceiling = mat('matte', '#FAF7F2');
  return (
    <group>
      <mesh
        geometry={g.plane}
        material={floor}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[W / 2, 0, L / 2]}
        scale={[W, L, 1]}
        receiveShadow
      />
      <mesh
        geometry={g.plane}
        material={wall}
        position={[W / 2, H / 2, 0]}
        scale={[W, H, 1]}
        receiveShadow
      />
      <mesh
        geometry={g.plane}
        material={wall}
        position={[W / 2, H / 2, L]}
        rotation={[0, Math.PI, 0]}
        scale={[W, H, 1]}
        receiveShadow
      />
      <mesh
        geometry={g.plane}
        material={wall}
        position={[0, H / 2, L / 2]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[L, H, 1]}
        receiveShadow
      />
      <mesh
        geometry={g.plane}
        material={wall}
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
      {hall.structure.map((s) => (
        <StructureMesh key={s.id} item={s} hall={hall} />
      ))}
    </group>
  );
}
