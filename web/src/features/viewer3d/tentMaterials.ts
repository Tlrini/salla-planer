import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { tiled, usePbr } from './pbrTextures';

/** Tent fabric: daylight comes through it, so the roof glows softly; at night it stays dark. */
export function useTentCloth(color: string, evening: boolean, wait: boolean) {
  const fabric = usePbr('fabric', wait);
  const cloth = useMemo(() => {
    const maps = fabric ? tiled(fabric, 1.2, 1.2) : null;
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      emissive: new THREE.Color(color),
      emissiveIntensity: evening ? 0.05 : 0.32,
      ...(maps ? { normalMap: maps.normalMap } : {}),
      normalScale: new THREE.Vector2(0.4, 0.4),
    });
  }, [fabric, color, evening]);
  useEffect(
    () => () => {
      cloth.normalMap?.dispose();
      cloth.dispose();
    },
    [cloth],
  );
  return cloth;
}

/**
 * Floor-to-roof glass; it hides nothing from outside. Unlit on purpose: on a lit pane every
 * lamp would show as a white dot.
 */
export function useGlassPane(evening: boolean, side: THREE.Side = THREE.FrontSide) {
  const pane = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: evening ? '#74848F' : '#E6F0F4',
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        side,
      }),
    [evening, side],
  );
  useEffect(() => () => pane.dispose(), [pane]);
  return pane;
}
