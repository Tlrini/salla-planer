import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { CatalogItem, Item } from '@salla/shared';
import { modelScale, normalizeModel } from './modelTransform';

/**
 * One uploaded .glb model at the item's real size, centered, standing on the floor. Used for
 * previews; the hall scene draws repeated models with GlbInstances. Draco is disabled (it would
 * load its decoder from a CDN).
 */
export function GlbModel({
  cat,
  item,
}: {
  cat: CatalogItem;
  item: Pick<Item, 'width' | 'depth' | 'height'>;
}) {
  const gltf = useGLTF(cat.modelFile!, false);
  const normalized = useMemo(() => {
    const n = normalizeModel(gltf.scene, cat.modelRotation);
    n.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return n;
  }, [gltf.scene, cat.modelRotation]);
  const scale = modelScale(normalized.size, item, cat);
  return <primitive object={normalized.object} scale={scale} />;
}
