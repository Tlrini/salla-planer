import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

const POST = 0.09;
const VALANCE = 0.28;

/** A small party tent: four posts and a fabric roof, which shows from below only. */
export function Gazebo({ item, cat, evening }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const { width: w, depth: d } = item;
  const rise = Math.min(1.1, Math.min(w, d) * 0.2);
  const eave = h - rise;

  const roof = useMemo(() => {
    const [hw, hd] = [w / 2, d / 2];
    const corners = [
      [-hw, eave, -hd],
      [-hw, eave, hd],
      [hw, eave, hd],
      [hw, eave, -hd],
    ] as const;
    const positions: number[] = [];
    corners.forEach((a, i) => {
      // This order makes the faces look down, into the tent.
      positions.push(...corners[(i + 1) % 4]!, ...a, 0, h, 0);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }, [w, d, h, eave]);
  useEffect(() => () => roof.dispose(), [roof]);

  const cloth = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: item.color,
        roughness: 0.85,
        // Sunlight comes through the fabric.
        emissive: new THREE.Color(item.color),
        emissiveIntensity: evening ? 0.04 : 0.28,
        shadowSide: THREE.DoubleSide,
      }),
    [item.color, evening],
  );
  useEffect(() => () => cloth.dispose(), [cloth]);

  const frame = mat('metal', item.color2 ?? '#E8E8EA');
  const [x, z] = [w / 2 - POST, d / 2 - POST];
  const posts = [
    [-x, -z],
    [-x, z],
    [x, -z],
    [x, z],
  ] as const;
  const valances = [
    { p: [0, -d / 2], s: [w, VALANCE, 0.02] },
    { p: [0, d / 2], s: [w, VALANCE, 0.02] },
    { p: [-w / 2, 0], s: [0.02, VALANCE, d] },
    { p: [w / 2, 0], s: [0.02, VALANCE, d] },
  ] as const;

  return (
    <group>
      <mesh geometry={roof} material={cloth} castShadow />
      {posts.map(([px, pz], i) => (
        <mesh
          key={i}
          geometry={g.cylinderLow}
          material={frame}
          position={[px, eave / 2, pz]}
          scale={[POST, eave, POST]}
          castShadow
        />
      ))}
      {valances.map((v, i) => (
        <mesh
          key={i}
          geometry={g.box}
          material={cloth}
          position={[v.p[0], eave - VALANCE / 2, v.p[1]]}
          scale={[v.s[0], v.s[1], v.s[2]]}
        />
      ))}
    </group>
  );
}
