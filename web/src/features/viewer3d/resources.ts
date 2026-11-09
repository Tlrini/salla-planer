import * as THREE from 'three';
import { glowTexture, pleatTexture } from './textures';
import { tiled, type PbrSet } from './pbrTextures';

/**
 * Shared geometries and materials. Everything here is created once and reused by every
 * builder; components only scale/position meshes, they never create GPU resources per render.
 */

let _geo: ReturnType<typeof createGeometries> | null = null;

function createGeometries() {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    /** Unit cylinder: radius 0.5, height 1, centered. */
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 40),
    cylinderLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    /** Cone for crystal drops / lamp shades. */
    cone: new THREE.ConeGeometry(0.5, 1, 24),
    sphere: new THREE.SphereGeometry(0.5, 20, 14),
    sphereLow: new THREE.SphereGeometry(0.5, 10, 8),
    plane: new THREE.PlaneGeometry(1, 1),
  };
}

export function geo() {
  if (!_geo) _geo = createGeometries();
  return _geo;
}

export type MatKind =
  | 'cloth'
  | 'matte'
  | 'wood'
  | 'gold'
  | 'metal'
  | 'glossy'
  | 'flower'
  | 'leaf'
  | 'glass'
  | 'emissive'
  | 'balloon';

const mats = new Map<string, THREE.Material>();

/** Cached material by kind + color (+ optional emissive intensity). */
export function mat(kind: MatKind, color: string, intensity = 1): THREE.MeshStandardMaterial {
  const key = `${kind}|${color}|${intensity}`;
  const hit = mats.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const c = new THREE.Color(color);
  let m: THREE.MeshStandardMaterial;
  switch (kind) {
    case 'cloth':
      // Real white fabric reflects ~80% of light; pure white clips to a flat, shapeless white.
      m = new THREE.MeshStandardMaterial({
        color: c.clone().multiplyScalar(0.84),
        roughness: 0.92,
        metalness: 0,
      });
      addWeave(m);
      break;
    case 'wood':
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, metalness: 0 });
      break;
    case 'gold':
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.85 });
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.9 });
      break;
    case 'glossy':
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.12, metalness: 0.15 });
      break;
    case 'flower':
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0 });
      break;
    case 'leaf':
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0 });
      break;
    case 'glass':
      m = new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.05,
        metalness: 0.1,
        transparent: true,
        opacity: 0.55,
        emissive: c,
        emissiveIntensity: 0.25 * intensity,
      });
      break;
    case 'emissive':
      m = new THREE.MeshStandardMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: intensity,
        roughness: 0.5,
      });
      break;
    case 'balloon':
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.28, metalness: 0.05 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  }
  mats.set(key, m);
  return m;
}

/** Double-sided variant of a cached material (curtains, panels seen from both sides). */
export function sided(kind: MatKind, color: string): THREE.MeshStandardMaterial {
  const key = `sided|${kind}|${color}`;
  const hit = mats.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = mat(kind, color).clone();
  m.side = THREE.DoubleSide;
  mats.set(key, m);
  return m;
}

/** Leaf green used by every plant/flower builder. */
export const LEAF = '#5F7F4F';
export const GOLD = '#C9A44C';
export const WARM_LIGHT = '#FFD39A';

/** Tablecloth skirt: cloth with soft vertical folds. */
export function drape(color: string): THREE.MeshStandardMaterial {
  const key = `drape|${color}`;
  const hit = mats.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = mat('cloth', color).clone();
  // The folds are a bump map; three.js uses a normal map instead of it, so drop the weave.
  m.normalMap = null;
  m.bumpMap = pleatTexture();
  m.bumpScale = 14;
  mats.set(key, m);
  return m;
}

/** Per-face materials for a draped cylinder: folds on the side, plain top and bottom caps. */
export function drapedCylinder(color: string): THREE.Material[] {
  const plain = mat('cloth', color);
  return [drape(color), plain, plain];
}

/** Per-face materials for a draped box (+x, -x, +y, -y, +z, -z): folds on the four sides. */
export function drapedBox(color: string): THREE.Material[] {
  const side = drape(color);
  const plain = mat('cloth', color);
  return [side, side, plain, plain, side, side];
}

// ----- fabric weave (photo normal map, loaded later) ------------------------------------

let weave: THREE.Texture | null = null;

function addWeave(m: THREE.MeshStandardMaterial) {
  if (!weave) return;
  m.normalMap = weave;
  m.normalScale.set(0.35, 0.35);
  m.needsUpdate = true;
}

/**
 * Give every cloth material (tablecloth tops, runners, cushions) the real woven relief once the
 * fabric texture has loaded. Idempotent; pleated skirts keep their folds instead.
 */
export function setFabricWeave(set: PbrSet): boolean {
  if (weave) return false;
  weave = tiled(set, 1.2, 1.2).normalMap;
  for (const [key, m] of mats) {
    if (key.startsWith('cloth|')) addWeave(m as THREE.MeshStandardMaterial);
  }
  return true;
}

let glow: THREE.MeshBasicMaterial | null = null;

/** Additive warm circle: candlelight on the surface around the flames (shared, one material). */
export function candleGlow(): THREE.MeshBasicMaterial {
  glow ??= new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: '#FFB067',
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return glow;
}
