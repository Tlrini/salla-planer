import { useMemo } from 'react';
import * as THREE from 'three';
import { geo, mat } from '../resources';
import { flowerWallTexture } from '../textures';
import { heightOf, type BuilderProps } from './types';

const faces = new Map<string, THREE.MeshStandardMaterial>();

/** Flower wall: green panel with a dense procedural flower texture on the front. */
export function FlowerWall({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const color2 = item.color2 ?? '#9CAF88';
  const face = useMemo(() => {
    const key = `${item.color}|${color2}|${item.width.toFixed(2)}|${h.toFixed(2)}`;
    let m = faces.get(key);
    if (!m) {
      const tex = flowerWallTexture(item.color, color2).clone();
      tex.needsUpdate = true;
      tex.repeat.set(item.width / 1.2, h / 1.2);
      m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      faces.set(key, m);
    }
    return m;
  }, [item.color, color2, item.width, h]);
  return (
    <group>
      <mesh
        geometry={g.box}
        material={mat('leaf', color2)}
        position={[0, h / 2, -0.02]}
        scale={[item.width, h, item.depth * 0.6]}
        castShadow
      />
      <mesh
        geometry={g.plane}
        material={face}
        position={[0, h / 2, item.depth * 0.3 - 0.01]}
        scale={[item.width, h, 1]}
      />
      <mesh
        geometry={g.box}
        material={mat('gold', '#C9A44C')}
        position={[0, 0.04, 0]}
        scale={[item.width + 0.1, 0.08, item.depth + 0.1]}
      />
    </group>
  );
}
