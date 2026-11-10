import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TENT_BAY, TENT_PITCH, type Hall } from '@salla/shared';
import { geo, mat } from './resources';
import { useGlassPane, useTentCloth } from './tentMaterials';

/** Fabric sags a little between the poles and most in the middle of the slope. */
const SAG = 0.1;
const ROOF_RINGS = 12;
const ROOF_SEGMENTS = 144;
const WALL_SEGMENTS = 128;
const MULLION_SPACING = 1.25;
const MULLION = 0.05;
const RAIL = 0.04;
const FRAME_COLOR = '#D8DCE0';

/**
 * A cone roof with its eaves at y = 0 and centre on the axis. Only the underside faces front:
 * from an outside camera it disappears, like the ceiling of a normal hall.
 */
function roofGeometry(radius: number, rise: number): THREE.BufferGeometry {
  const bays = Math.max(8, Math.ceil((2 * Math.PI * radius) / TENT_BAY));
  const slope = Math.hypot(radius, rise);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= ROOF_SEGMENTS; i++) {
    const angle = (i / ROOF_SEGMENTS) * 2 * Math.PI;
    for (let j = 0; j <= ROOF_RINGS; j++) {
      const v = j / ROOF_RINGS;
      const r = radius * (1 - v);
      const between = 0.6 + 0.4 * Math.cos(bays * angle);
      positions.push(
        r * Math.cos(angle),
        v * rise - SAG * Math.sin(Math.PI * v) * between,
        r * Math.sin(angle),
      );
      uvs.push(angle * radius, v * slope);
    }
  }
  const at = (i: number, j: number) => i * (ROOF_RINGS + 1) + j;
  for (let i = 0; i < ROOF_SEGMENTS; i++) {
    for (let j = 0; j < ROOF_RINGS; j++) {
      const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
      indices.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** The slim aluminium frame of the glass wall: posts as one draw call, a ring at each end. */
function RoundFrame({ radius, height }: { radius: number; height: number }) {
  const g = geo();
  const count = Math.max(12, Math.round((2 * Math.PI * radius) / MULLION_SPACING));
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 2 * Math.PI;
      m.makeScale(MULLION, height, MULLION).setPosition(
        radius * Math.cos(a),
        height / 2,
        radius * Math.sin(a),
      );
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, radius, height]);
  const ring = useMemo(() => new THREE.TorusGeometry(radius, RAIL, 6, WALL_SEGMENTS), [radius]);
  useEffect(() => () => ring.dispose(), [ring]);
  const material = mat('matte', FRAME_COLOR);
  return (
    <>
      <instancedMesh key={count} ref={ref} args={[g.box, material, count]} />
      {[RAIL, height].map((y) => (
        <mesh
          key={y}
          geometry={ring}
          material={material}
          position={[0, y, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      ))}
    </>
  );
}

/** The round pavilion: a circle of floor-to-roof glass under a fabric cone. */
export function RoundPavilionShell({
  hall,
  evening,
  wait,
}: {
  hall: Hall;
  evening: boolean;
  wait: boolean;
}) {
  const radius = hall.width / 2;
  const H = hall.height;
  const rise = radius * Math.tan((TENT_PITCH * Math.PI) / 180);
  const cloth = useTentCloth(hall.wallColor, evening, wait);
  // A cylinder's faces look outward, so its back side is the one seen from inside the room.
  const pane = useGlassPane(evening, THREE.BackSide);
  const geometry = useMemo(
    () => ({
      roof: roofGeometry(radius, rise),
      wall: new THREE.CylinderGeometry(radius, radius, H, WALL_SEGMENTS, 1, true),
    }),
    [radius, rise, H],
  );
  useEffect(
    () => () => {
      geometry.roof.dispose();
      geometry.wall.dispose();
    },
    [geometry],
  );
  return (
    <group position={[radius, 0, hall.length / 2]}>
      <mesh geometry={geometry.roof} material={cloth} position={[0, H, 0]} />
      <mesh geometry={geometry.wall} material={pane} position={[0, H / 2, 0]} renderOrder={1} />
      <RoundFrame radius={radius} height={H} />
    </group>
  );
}
