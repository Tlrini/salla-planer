import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { canopyPanels, canopySettings, sagAt, type Panel } from '@salla/shared';
import { mat } from '../resources';
import { CanopyPoles } from './canopyPoles';
import { heightOf, type BuilderProps } from './types';

const FOLD_DEPTH = 0.035;
const FOLDS = 3;
const ROSETTE_RADIUS = 0.25;
const WARM_GLOW = new THREE.Color('#FFD9A8');
const NEUTRAL_GLOW = new THREE.Color('#FFFFFF');

/** Adds one panel to the arrays: a grid following the hanging curve, with soft folds across it. */
function addPanel(p: Panel, h: number, positions: number[], indices: number[], uvs: number[]) {
  const len = Math.hypot(
    (p.b1.x + p.b2.x - p.a1.x - p.a2.x) / 2,
    (p.b1.z + p.b2.z - p.a1.z - p.a2.z) / 2,
  );
  const nu = Math.min(60, Math.max(8, Math.ceil(len / 0.3)));
  const nv = 12;
  const start = positions.length / 3;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const lerp = (k: 'x' | 'z') => {
        const a = p.a1[k] + (p.a2[k] - p.a1[k]) * v;
        const b = p.b1[k] + (p.b2[k] - p.b1[k]) * v;
        return a + (b - a) * u;
      };
      // Folds fade out where the fabric is pulled tight at its ends.
      const fold = FOLD_DEPTH * Math.sin(v * Math.PI * 2 * FOLDS) * Math.sin(u * Math.PI);
      positions.push(lerp('x'), h - sagAt(u, h) - fold, lerp('z'));
      uvs.push(v, u);
    }
  }
  const at = (i: number, j: number) => start + i * (nv + 1) + j;
  // Normals must point down: the fabric is only visible from below, like the ceiling.
  const ax = positions[at(0, 0) * 3]!;
  const az = positions[at(0, 0) * 3 + 2]!;
  const ux = positions[at(nu, 0) * 3]! - ax;
  const uz = positions[at(nu, 0) * 3 + 2]! - az;
  const vx = positions[at(nu, nv) * 3]! - positions[at(nu, 0) * 3]!;
  const vz = positions[at(nu, nv) * 3 + 2]! - positions[at(nu, 0) * 3 + 2]!;
  const flip = uz * vx - ux * vz > 0;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
      if (flip) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
}

/** Fabric draped across the ceiling, in strips or as a star gathered at a rosette. */
export function CeilingDrape({ item, cat, hall, evening }: BuilderProps) {
  const h = heightOf(item, cat);
  const { width, depth, type, canopy } = item;
  const isStar = canopySettings({ type, canopy }).pattern === 'star';

  const geometry = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    for (const p of canopyPanels({ type, canopy, width, depth }))
      addPanel(p, h, positions, indices, uvs);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [type, canopy, width, depth, h]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(item.color).multiplyScalar(0.9),
        roughness: 0.9,
        // Thin fabric glows a little with the light behind it.
        emissive: new THREE.Color(item.color).multiply(evening ? WARM_GLOW : NEUTRAL_GLOW),
        emissiveIntensity: evening ? 0.32 : 0.08,
      }),
    [item.color, evening],
  );
  useEffect(() => () => material.dispose(), [material]);

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow />
      <CanopyPoles item={item} hall={hall} top={h} />
      {isStar && (
        // Faces down only, so it does not float in the view from above.
        <mesh
          material={mat('gold', item.color2 ?? '#C9A44C')}
          position={[0, h - 0.06, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[ROSETTE_RADIUS, 32]} />
        </mesh>
      )}
    </group>
  );
}
