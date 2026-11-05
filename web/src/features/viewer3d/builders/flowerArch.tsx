import { useMemo } from 'react';
import * as THREE from 'three';
import { geo, mat, LEAF } from '../resources';
import { archFlowers } from '../merged';
import { heightOf, type BuilderProps } from './types';

const tori = new Map<string, THREE.TorusGeometry>();

/** Gold arch (two posts + half torus) with flowers along it. */
export function FlowerArch({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const R = item.width / 2 - 0.05;
  const cy = h - R;
  const torus = useMemo(() => {
    const key = R.toFixed(2);
    let t = tori.get(key);
    if (!t) {
      t = new THREE.TorusGeometry(R, 0.03, 10, 48, Math.PI);
      tori.set(key, t);
    }
    return t;
  }, [R]);
  const frame = mat('gold', item.color2 ?? '#C9A44C');
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh
            geometry={g.cylinderLow}
            material={frame}
            position={[s * R, cy / 2, 0]}
            scale={[0.06, cy, 0.06]}
            castShadow
          />
          <mesh
            geometry={g.box}
            material={frame}
            position={[s * R, 0.01, 0]}
            scale={[0.35, 0.02, 0.35]}
          />
        </group>
      ))}
      <mesh geometry={torus} material={frame} position={[0, cy, 0]} castShadow />
      <mesh geometry={archFlowers(R, cy)} material={mat('flower', item.color)} castShadow />
      <mesh
        geometry={archFlowers(R * 1.02, cy - 0.04)}
        material={mat('leaf', LEAF)}
        rotation={[0, 0.12, 0]}
        scale={[0.96, 1, 1.2]}
      />
    </group>
  );
}
