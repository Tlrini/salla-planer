import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Cached, merged geometries for repeated small parts (flowers, balloons, crystals, chairs).
 * One merged geometry = one draw call; the cache key captures every size that shapes it.
 */
const cache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function place(
  src: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  s: number | [number, number, number],
) {
  const g = src.clone();
  const [sx, sy, sz] = Array.isArray(s) ? s : [s, s, s];
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

const ball = () => new THREE.SphereGeometry(0.5, 10, 8);
const ballLow = () => new THREE.IcosahedronGeometry(0.5, 1);

function nonIndexed(list: THREE.BufferGeometry[]) {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** Dome of blossoms, radius ~0.5, base at y = 0. */
export function flowerDome(): THREE.BufferGeometry {
  return cached('dome', () => {
    const r = rng(11);
    const parts: THREE.BufferGeometry[] = [];
    const b = ballLow();
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const up = r() * Math.PI * 0.45;
      const rad = 0.36;
      parts.push(
        place(
          b,
          Math.cos(a) * Math.cos(up) * rad,
          Math.sin(up) * rad + 0.08,
          Math.sin(a) * Math.cos(up) * rad,
          0.2 + r() * 0.1,
        ),
      );
    }
    parts.push(place(b, 0, 0.32, 0, 0.3));
    return nonIndexed(parts)!;
  });
}

/** Leaves under a flower dome. */
export function leafRing(): THREE.BufferGeometry {
  return cached('leaves', () => {
    const r = rng(5);
    const parts: THREE.BufferGeometry[] = [];
    const b = ballLow();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + r() * 0.3;
      parts.push(place(b, Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.42, [0.26, 0.08, 0.14]));
    }
    return nonIndexed(parts)!;
  });
}

/** Flowers along a half-arch of radius R whose center sits at height cy. */
export function archFlowers(R: number, cy: number): THREE.BufferGeometry {
  return cached(`arch|${R.toFixed(2)}|${cy.toFixed(2)}`, () => {
    const r = rng(3);
    const parts: THREE.BufferGeometry[] = [];
    const b = ballLow();
    const n = Math.round(R * 34);
    for (let i = 0; i < n; i++) {
      // cluster heavier on the left shoulder, like real arches
      const t = Math.pow(r(), 1.3) * Math.PI * 0.8 + Math.PI * 0.2;
      const jitter = (r() - 0.5) * 0.08;
      parts.push(
        place(
          b,
          Math.cos(t) * (R + jitter),
          cy + Math.sin(t) * (R + jitter),
          (r() - 0.5) * 0.12,
          0.09 + r() * 0.08,
        ),
      );
    }
    for (let i = 0; i < 10; i++) {
      parts.push(
        place(b, -R + (r() - 0.5) * 0.2, r() * 0.35, (r() - 0.5) * 0.25, 0.12 + r() * 0.1),
      );
    }
    return nonIndexed(parts)!;
  });
}

/** Balloon column: `split` selects balloons for the first (0) or second (1) color. */
export function balloons(width: number, height: number, split: 0 | 1): THREE.BufferGeometry {
  return cached(`balloons|${width.toFixed(2)}|${height.toFixed(2)}|${split}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const b = ball();
    const size = Math.min(0.32, width * 0.32);
    const rows = Math.max(3, Math.floor((height - 0.1) / (size * 0.8)));
    let k = 0;
    for (let row = 0; row < rows; row++) {
      const y = 0.15 + row * size * 0.8 + size / 2;
      for (let i = 0; i < 4; i++, k++) {
        if (k % 2 !== split) continue;
        const a = (i / 4) * Math.PI * 2 + row * 0.6;
        parts.push(
          place(b, Math.cos(a) * size * 0.55, y, Math.sin(a) * size * 0.55, [
            size,
            size * 1.12,
            size,
          ]),
        );
      }
    }
    if (split === 0) parts.push(place(b, 0, height - size * 0.6, 0, size * 1.2));
    return nonIndexed(parts)!;
  });
}

/** Hanging crystal drops in rings for the chandelier (local: top at y = 0, hanging down). */
export function crystals(radius: number, drop: number): THREE.BufferGeometry {
  return cached(`crystals|${radius.toFixed(2)}|${drop.toFixed(2)}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const c = new THREE.OctahedronGeometry(0.5, 0);
    const rings = [
      { r: radius, y: -drop * 0.55, n: 28 },
      { r: radius * 0.72, y: -drop * 0.75, n: 20 },
      { r: radius * 0.42, y: -drop * 0.92, n: 12 },
    ];
    for (const ring of rings) {
      for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2;
        parts.push(
          place(c, Math.cos(a) * ring.r, ring.y, Math.sin(a) * ring.r, [0.045, 0.09, 0.045]),
        );
        parts.push(
          place(c, Math.cos(a) * ring.r, ring.y - 0.1, Math.sin(a) * ring.r, [0.03, 0.06, 0.03]),
        );
      }
    }
    return nonIndexed(parts)!;
  });
}

/** Wavy curtain plane (width x height), base at y = 0, folds along x. */
export function wavyCurtain(width: number, height: number): THREE.BufferGeometry {
  return cached(`curtain|${width.toFixed(2)}|${height.toFixed(2)}`, () => {
    const seg = Math.max(24, Math.round(width * 16));
    const g = new THREE.PlaneGeometry(width, height, seg, 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin(x * 9) * 0.045 + Math.sin(x * 23) * 0.012);
    }
    g.translate(0, height / 2, 0);
    g.computeVertexNormals();
    return g;
  });
}

/** Chiavari chair frame (legs, back posts, rails, spindles), facing +z, floor at y = 0. */
export function chairFrame(): THREE.BufferGeometry {
  return cached('chairFrame', () => {
    const parts: THREE.BufferGeometry[] = [];
    const leg = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    const bar = new THREE.BoxGeometry(1, 1, 1);
    for (const sx of [-1, 1]) {
      parts.push(place(leg, sx * 0.18, 0.225, 0.17, [0.03, 0.45, 0.03]));
      parts.push(place(leg, sx * 0.18, 0.46, -0.18, [0.032, 0.92, 0.032]));
    }
    parts.push(place(bar, 0, 0.44, 0, [0.4, 0.03, 0.4]));
    for (const y of [0.62, 0.76, 0.9]) parts.push(place(bar, 0, y, -0.18, [0.36, 0.025, 0.025]));
    for (const x of [-0.06, 0.06]) parts.push(place(leg, x, 0.69, -0.18, [0.02, 0.28, 0.02]));
    parts.push(place(bar, 0, 0.12, 0.17, [0.36, 0.015, 0.015]));
    parts.push(place(bar, 0, 0.12, -0.17, [0.36, 0.015, 0.015]));
    return nonIndexed(parts)!;
  });
}

/** Seat cushion matching chairFrame(). */
export function chairCushion(): THREE.BufferGeometry {
  return cached('chairCushion', () =>
    place(new THREE.BoxGeometry(1, 1, 1), 0, 0.475, 0.01, [0.38, 0.05, 0.37]),
  );
}
