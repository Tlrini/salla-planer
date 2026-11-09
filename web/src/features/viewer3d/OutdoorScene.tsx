import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Hall } from '@salla/shared';
import { groundTint, tiled, usePbr } from './pbrTextures';

/** How far the ground goes on; beyond this the sky photo's own land takes over (m). */
const RADIUS = 400;
/** Where the ground starts to fade into the photo, as a share of the radius. */
const FADE_FROM = 0.82;
/** Far land repeats its photo less often, or the tiles show as stripes from above (m). */
const FAR_TILE = 9;
const LOWER = 0.03;

let fade: THREE.CanvasTexture | null = null;

/** White in the middle, black at the edge: an alpha map that melts the ground into the photo. */
function fadeTexture(): THREE.CanvasTexture {
  if (fade) return fade;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 128 * FADE_FROM, 128, 128, 128);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  fade = new THREE.CanvasTexture(cv);
  return fade;
}

/** The land around the place, just under its own floor. A beach has sand around it, others grass. */
export function OutdoorScene({ hall, wait }: { hall: Hall; wait: boolean }) {
  const name = hall.floor === 'rere' ? 'sand' : 'grass';
  const set = usePbr(name, wait);
  const geometry = useMemo(() => new THREE.CircleGeometry(RADIUS, 96), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => {
    const size = set ? (RADIUS * 2 * set.tile) / FAR_TILE : 0;
    const maps = set ? { ...tiled(set, size, size), color: groundTint(name, set) } : null;
    return new THREE.MeshStandardMaterial({
      ...(maps ?? { color: hall.floor === 'rere' ? '#CDB98F' : '#5E7337' }),
      alphaMap: fadeTexture(),
      transparent: true,
      roughness: 1,
      normalScale: new THREE.Vector2(0.7, 0.7),
    });
  }, [set, name, hall.floor]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.normalMap?.dispose();
      material.roughnessMap?.dispose();
      material.dispose();
    },
    [material],
  );
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[hall.width / 2, -LOWER, hall.length / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-1}
      receiveShadow
    />
  );
}
