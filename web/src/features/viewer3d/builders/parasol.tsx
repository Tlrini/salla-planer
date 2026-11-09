import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

const RISE = 0.7;

/** A garden parasol; only the inside of its shade shows, so it hides nothing from above. */
export function Parasol({ item, cat, evening }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const pole = mat('wood', item.color2 ?? '#8A6A4A');
  const shade = useMemo(
    () => new THREE.ConeGeometry(item.width / 2, RISE, 32, 1, true),
    [item.width],
  );
  useEffect(() => () => shade.dispose(), [shade]);
  const cloth = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: item.color,
        roughness: 0.85,
        side: THREE.BackSide,
        shadowSide: THREE.DoubleSide,
        emissive: new THREE.Color(item.color),
        emissiveIntensity: evening ? 0.04 : 0.28,
      }),
    [item.color, evening],
  );
  useEffect(() => () => cloth.dispose(), [cloth]);
  return (
    <group>
      <mesh
        geometry={g.cylinderLow}
        material={pole}
        position={[0, h / 2, 0]}
        scale={[0.06, h, 0.06]}
        castShadow
      />
      <mesh
        geometry={g.cylinderLow}
        material={mat('metal', '#3A3A3A')}
        position={[0, 0.03, 0]}
        scale={[0.5, 0.06, 0.5]}
        castShadow
      />
      <mesh geometry={shade} material={cloth} position={[0, h - RISE / 2, 0]} castShadow />
    </group>
  );
}
