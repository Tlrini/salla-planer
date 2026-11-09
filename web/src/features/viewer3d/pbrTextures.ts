import { use, useEffect, useState } from 'react';
import * as THREE from 'three';

/**
 * Photo-based (PBR) surface textures: CC0 sets from Poly Haven, bundled in
 * web/public/textures (see CREDITS.txt there; no CDN). Each set has a normal and a roughness
 * map, floors also a colour map. Everything falls back to the procedural textures while a set
 * loads or if its files are missing.
 */
export const PBR_SETS = {
  parquet: { dir: 'herringbone_parquet', tile: 3.4, color: true },
  marble: { dir: 'marble_01', tile: 3, color: true },
  tiles: { dir: 'floor_tiles_06', tile: 3, color: true },
  plaster: { dir: 'plastered_wall_04', tile: 3.2, color: false },
  fabric: { dir: 'fabric_pattern_07', tile: 0.4, color: false },
  velvet: { dir: 'velour_velvet', tile: 0.28, color: false },
  grass: { dir: 'leafy_grass', tile: 2.5, color: true },
  stone: { dir: 'stone_tiles_02', tile: 2, color: true },
  gravel: { dir: 'sandy_gravel', tile: 2.1, color: true },
  sand: { dir: 'coast_sand_01', tile: 6, color: true },
} as const;
export type PbrName = keyof typeof PBR_SETS;

export interface PbrSet {
  /** Real-world size (m) one texture tile covers. */
  tile: number;
  map: THREE.Texture | null;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  /** Average colour of the colour map (linear), to tint it toward a chosen colour. */
  average: THREE.Color | null;
}

const BASE = `${import.meta.env.BASE_URL}textures/`;
const promises = new Map<PbrName, Promise<PbrSet | null>>();
const loaded = new Map<PbrName, PbrSet>();

function averageColor(image: CanvasImageSource): THREE.Color {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  const g = cv.getContext('2d')!;
  g.drawImage(image, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data;
  let r = 0;
  let gr = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]!;
    gr += d[i + 1]!;
    b += d[i + 2]!;
  }
  const n = d.length / 4;
  // The image is sRGB; tinting happens in linear space.
  return new THREE.Color().setRGB(r / n / 255, gr / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

/** Loads a texture set once per page (shared by the live view and the off-screen renders). */
export function loadPbr(name: PbrName): Promise<PbrSet | null> {
  let p = promises.get(name);
  if (!p) {
    const def = PBR_SETS[name];
    const loader = new THREE.TextureLoader();
    const get = (file: string, srgb: boolean) =>
      loader.loadAsync(`${BASE}${def.dir}/${file}.jpg`).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return t;
      });
    p = Promise.all([def.color ? get('diff', true) : null, get('nor', false), get('rough', false)])
      .then(([map, normalMap, roughnessMap]) => {
        const set: PbrSet = {
          tile: def.tile,
          map,
          normalMap,
          roughnessMap,
          average: map ? averageColor(map.image as CanvasImageSource) : null,
        };
        loaded.set(name, set);
        return set;
      })
      .catch(() => null);
    promises.set(name, p);
  }
  return p;
}

/**
 * The texture set, or null while it loads (the caller shows its procedural look meanwhile).
 * `wait` (off-screen renders) suspends until it is there instead.
 */
export function usePbr(name: PbrName | null, wait = false): PbrSet | null {
  // Re-render once the set has arrived; the value itself is read from the cache below.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!name || loaded.has(name)) return;
    let alive = true;
    void loadPbr(name).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [name]);
  if (!name) return null;
  // React 19 `use` may be called conditionally: only exports wait for the files.
  if (wait) return use(loadPbr(name));
  return loaded.get(name) ?? null;
}

/** Clones of the set's maps repeated over a surface of `w` × `h` meters. */
export function tiled(
  set: PbrSet,
  w: number,
  h: number,
): Pick<THREE.MeshStandardMaterial, 'map' | 'normalMap' | 'roughnessMap'> {
  const rep = (t: THREE.Texture | null) => {
    if (!t) return null;
    const c = t.clone();
    c.repeat.set(w / set.tile, h / set.tile);
    c.needsUpdate = true;
    return c;
  };
  return {
    map: rep(set.map),
    normalMap: rep(set.normalMap)!,
    roughnessMap: rep(set.roughnessMap)!,
  };
}

/** The grass photo is a dry lawn; this is the colour it takes for a garden. */
const LAWN = '#5C8236';

/** Natural ground shows its photo as it is, except grass, which is made a healthy green. */
export function groundTint(name: PbrName, set: PbrSet): THREE.Color {
  return name === 'grass' ? tintToward(set, LAWN) : new THREE.Color('#FFFFFF');
}

/**
 * Material colour that shifts the photo's average colour to `hex`, so a parquet or marble
 * photo follows the colour picked for the floor. Per channel, limited to a sane range.
 */
export function tintToward(set: PbrSet, hex: string): THREE.Color {
  const target = new THREE.Color(hex);
  const avg = set.average;
  if (!avg) return target;
  const k = (t: number, a: number) => Math.min(2.5, Math.max(0.15, t / Math.max(0.02, a)));
  return new THREE.Color(k(target.r, avg.r), k(target.g, avg.g), k(target.b, avg.b));
}
