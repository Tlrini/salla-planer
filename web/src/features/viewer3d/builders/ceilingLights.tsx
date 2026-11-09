import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { canopyLights, canopyStrands, sagAt, strandLength } from '@salla/shared';
import { glowTexture } from '../textures';
import { CanopyPoles } from './canopyPoles';
import { heightOf, type BuilderProps } from './types';

const WIRE_STEP = 0.5;
const WIRE_COLOR = '#3A3A36';

/** Strings of lights across the ceiling: thin wires plus one point cloud of glowing bulbs. */
export function CeilingLights({ item, cat, hall, evening }: BuilderProps) {
  const h = heightOf(item, cat);
  const { width, depth, type, canopy } = item;

  const geometry = useMemo(() => {
    const strands = canopyStrands({ type, canopy, width, depth });
    const bulbs = canopyLights(strands, h);
    const points = new THREE.BufferGeometry();
    points.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        bulbs.flatMap((b) => [b.x, h - b.y, b.z]),
        3,
      ),
    );
    const wire: number[] = [];
    for (const s of strands) {
      const n = Math.max(2, Math.ceil(strandLength(s) / WIRE_STEP));
      const at = (t: number) => [
        s.a.x + (s.b.x - s.a.x) * t,
        h - sagAt(t, h),
        s.a.z + (s.b.z - s.a.z) * t,
      ];
      for (let i = 0; i < n; i++) wire.push(...at(i / n), ...at((i + 1) / n));
    }
    const wires = new THREE.BufferGeometry();
    wires.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    return { points, wires };
  }, [type, canopy, width, depth, h]);
  useEffect(
    () => () => {
      geometry.points.dispose();
      geometry.wires.dispose();
    },
    [geometry],
  );

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        map: glowTexture(),
        color: new THREE.Color(item.color).multiplyScalar(evening ? 2.4 : 1),
        size: evening ? 0.2 : 0.11,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [item.color, evening],
  );
  useEffect(() => () => material.dispose(), [material]);

  const wires = useRef<THREE.LineSegments>(null);
  const wireMaterial = useMemo(() => new THREE.LineBasicMaterial({ color: WIRE_COLOR }), []);
  useEffect(() => () => wireMaterial.dispose(), [wireMaterial]);

  return (
    <group>
      <lineSegments
        ref={wires}
        geometry={geometry.wires}
        material={wireMaterial}
        onBeforeRender={(_gl, _scene, camera) => {
          // From above, like the ceiling itself, the wires must not cross the view into the room.
          const top = (wires.current?.matrixWorld.elements[13] ?? 0) + h;
          wireMaterial.colorWrite = camera.matrixWorld.elements[13]! < top;
          wireMaterial.depthWrite = wireMaterial.colorWrite;
        }}
      />
      <points geometry={geometry.points} material={material} renderOrder={3} />
      <CanopyPoles item={item} hall={hall} top={h} />
    </group>
  );
}
