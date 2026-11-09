import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TENT_BAY, tentRoof, type Hall } from '@salla/shared';
import { geo, mat } from './resources';
import { tiled, usePbr } from './pbrTextures';

/** Fabric sags a little between the frame bays and most in the middle of a slope. */
const SAG = 0.08;

/**
 * Roof of a frame tent as one mesh, in a local frame: ridge along x from 0 to `len`, the span
 * along z around 0, eaves at y = 0. Only the underside faces front: from an outside camera the
 * roof disappears, like the ceiling of a normal hall.
 */
function roofGeometry(len: number, span: number, rise: number): THREE.BufferGeometry {
  const nu = Math.min(120, Math.ceil(len / 0.5));
  const nv = 10;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const slopeLength = Math.hypot(span / 2, rise);
  for (const side of [1, -1]) {
    const start = positions.length / 3;
    for (let i = 0; i <= nu; i++) {
      const x = (i / nu) * len;
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const between = 0.6 + 0.4 * Math.cos((2 * Math.PI * x) / TENT_BAY);
        positions.push(
          x,
          v * rise - SAG * Math.sin(Math.PI * v) * between,
          side * (span / 2) * (1 - v),
        );
        uvs.push(x, v * slopeLength);
      }
    }
    const at = (i: number, j: number) => start + i * (nv + 1) + j;
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
        // Winding so the normals point down, into the tent.
        if (side > 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** The two triangles above the end walls, facing into the tent. */
function gablesGeometry(len: number, span: number, rise: number): THREE.BufferGeometry {
  const h = span / 2;
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0, 0, h, 0, 0, -h, 0, rise, 0, len, 0, -h, len, 0, h, len, rise, 0],
      3,
    ),
  );
  g.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([h, 0, -h, 0, 0, rise, -h, 0, h, 0, 0, rise], 2),
  );
  g.computeVertexNormals();
  return g;
}

/** A white frame tent over the hall's rectangle: fabric walls (or open sides) and a ridge roof. */
const MULLION_SPACING = 1.25;
const MULLION = 0.05;
const MULLION_COLOR = '#D8DCE0';

/** The slim aluminium frame of the glass walls, as one draw call. */
function GlassFrame({ width, length, height }: { width: number; length: number; height: number }) {
  const g = geo();
  const posts = useMemo(() => {
    const out: Array<[number, number]> = [];
    const along = (size: number, at: (t: number) => [number, number]) => {
      const n = Math.max(1, Math.round(size / MULLION_SPACING));
      for (let i = 0; i <= n; i++) out.push(at((i / n) * size));
    };
    along(width, (t) => [t, 0]);
    along(width, (t) => [t, length]);
    along(length, (t) => [0, t]);
    along(length, (t) => [width, t]);
    return out;
  }, [width, length]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    posts.forEach(([x, z], i) => {
      m.makeScale(MULLION, height, MULLION).setPosition(x, height / 2, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [posts, height]);
  const material = mat('matte', MULLION_COLOR);
  const rails: Array<{ p: [number, number, number]; s: [number, number, number] }> = [
    0.04,
    height,
  ].flatMap((y) => [
    {
      p: [width / 2, y, 0] as [number, number, number],
      s: [width, 0.08, 0.08] as [number, number, number],
    },
    {
      p: [width / 2, y, length] as [number, number, number],
      s: [width, 0.08, 0.08] as [number, number, number],
    },
    {
      p: [0, y, length / 2] as [number, number, number],
      s: [0.08, 0.08, length] as [number, number, number],
    },
    {
      p: [width, y, length / 2] as [number, number, number],
      s: [0.08, 0.08, length] as [number, number, number],
    },
  ]);
  return (
    <>
      <instancedMesh key={posts.length} ref={ref} args={[g.box, material, posts.length]} />
      {rails.map((r, i) => (
        <mesh key={i} geometry={g.box} material={material} position={r.p} scale={r.s} />
      ))}
    </>
  );
}

export function TentShell({
  hall,
  evening,
  wait,
}: {
  hall: Hall;
  evening: boolean;
  wait: boolean;
}) {
  const g = geo();
  const W = hall.width;
  const L = hall.length;
  const H = hall.height;
  const { len, span, rise, alongX } = tentRoof(hall);
  const glass = hall.kind === 'xham';
  const open = !glass && (hall.tent?.openSides ?? false);
  const fabric = usePbr('fabric', wait);

  const geometry = useMemo(
    () => ({ roof: roofGeometry(len, span, rise), gables: gablesGeometry(len, span, rise) }),
    [len, span, rise],
  );
  useEffect(
    () => () => {
      geometry.roof.dispose();
      geometry.gables.dispose();
    },
    [geometry],
  );

  const cloth = useMemo(() => {
    const maps = fabric ? tiled(fabric, 1.2, 1.2) : null;
    return new THREE.MeshStandardMaterial({
      color: hall.wallColor,
      roughness: 0.85,
      // Daylight comes through the fabric, so the roof glows softly; at night it stays dark.
      emissive: new THREE.Color(hall.wallColor),
      emissiveIntensity: evening ? 0.05 : 0.32,
      ...(maps ? { normalMap: maps.normalMap } : {}),
      normalScale: new THREE.Vector2(0.4, 0.4),
    });
  }, [fabric, hall.wallColor, evening]);
  useEffect(
    () => () => {
      cloth.normalMap?.dispose();
      cloth.dispose();
    },
    [cloth],
  );

  // Floor-to-roof glass: it hides nothing from outside.
  const pane = useMemo(
    () =>
      // Unlit on purpose: on a lit pane every lamp would show as a white dot.
      new THREE.MeshBasicMaterial({
        color: evening ? '#74848F' : '#E6F0F4',
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    [evening],
  );
  useEffect(() => () => pane.dispose(), [pane]);
  const wallMaterial = glass ? pane : cloth;

  // Ridge along world x, or along world z (local x → world z, local z → world −x).
  const roofFrame = alongX
    ? { position: [0, H, L / 2] as const, rotation: 0 }
    : { position: [W / 2, H, 0] as const, rotation: -Math.PI / 2 };

  const walls: Array<{
    position: [number, number, number];
    rotation: number;
    width: number;
  }> = [
    { position: [W / 2, H / 2, 0], rotation: 0, width: W },
    { position: [W / 2, H / 2, L], rotation: Math.PI, width: W },
    { position: [0, H / 2, L / 2], rotation: Math.PI / 2, width: L },
    { position: [W, H / 2, L / 2], rotation: -Math.PI / 2, width: L },
  ];
  // Open sides: the wall fabric is rolled up under the eaves of the long sides.
  const rolls: Array<{ position: [number, number, number]; along: 'x' | 'z'; length: number }> =
    alongX
      ? [
          { position: [W / 2, H - 0.07, 0.06], along: 'x', length: W },
          { position: [W / 2, H - 0.07, L - 0.06], along: 'x', length: W },
        ]
      : [
          { position: [0.06, H - 0.07, L / 2], along: 'z', length: L },
          { position: [W - 0.06, H - 0.07, L / 2], along: 'z', length: L },
        ];

  return (
    <group>
      <group
        position={[roofFrame.position[0], roofFrame.position[1], roofFrame.position[2]]}
        rotation={[0, roofFrame.rotation, 0]}
      >
        <mesh geometry={geometry.roof} material={cloth} />
        <mesh geometry={geometry.gables} material={wallMaterial} />
      </group>
      {!open &&
        walls.map((w, i) => (
          <mesh
            key={i}
            geometry={g.plane}
            material={wallMaterial}
            position={w.position}
            rotation={[0, w.rotation, 0]}
            scale={[w.width, H, 1]}
            receiveShadow
          />
        ))}
      {glass && <GlassFrame width={W} length={L} height={H} />}
      {open &&
        rolls.map((r, i) => (
          <mesh
            key={i}
            geometry={g.cylinderLow}
            material={mat('cloth', hall.wallColor)}
            position={r.position}
            rotation={r.along === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
            scale={[0.14, r.length, 0.14]}
          />
        ))}
    </group>
  );
}
