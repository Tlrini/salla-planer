import { useMemo } from 'react';
import * as THREE from 'three';
import { geo, mat } from '../resources';
import { fairyLightsTexture } from '../textures';
import { heightOf, type BuilderProps } from './types';

const lights = new Map<string, THREE.MeshBasicMaterial>();

/** Curtain of fairy lights: additive emissive dots on a thin gold bar. */
export function LightCurtain({ item, cat, evening }: BuilderProps) {
  const h = heightOf(item, cat);
  const material = useMemo(() => {
    const key = `${item.color}|${item.width.toFixed(2)}|${h.toFixed(2)}|${evening}`;
    let m = lights.get(key);
    if (!m) {
      const tex = fairyLightsTexture().clone();
      tex.needsUpdate = true;
      tex.repeat.set(item.width / 0.6, h / 0.6);
      m = new THREE.MeshBasicMaterial({
        map: tex,
        color: new THREE.Color(item.color).multiplyScalar(evening ? 1.6 : 0.9),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      lights.set(key, m);
    }
    return m;
  }, [item.color, item.width, h, evening]);
  return (
    <group>
      <mesh
        geometry={geo().plane}
        material={material}
        position={[0, h / 2, 0]}
        scale={[item.width, h, 1]}
      />
      <mesh
        geometry={geo().box}
        material={mat('gold', '#C9A44C')}
        position={[0, h + 0.01, 0]}
        scale={[item.width, 0.03, 0.03]}
      />
    </group>
  );
}
