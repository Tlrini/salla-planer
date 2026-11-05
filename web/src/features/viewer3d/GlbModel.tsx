import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';

/**
 * Uploaded .glb model scaled to the item's width x height x depth box, centered, standing on
 * the floor. Draco is disabled (it would load its decoder from a CDN).
 */
export function GlbModel({
  url,
  width,
  depth,
  height,
}: {
  url: string;
  width: number;
  depth: number;
  height: number;
}) {
  const gltf = useGLTF(url, false);
  const object = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const wrapper = new THREE.Group();
    root.position.set(-center.x, -box.min.y, -center.z);
    wrapper.add(root);
    wrapper.scale.set(width / (size.x || 1), height / (size.y || 1), depth / (size.z || 1));
    return wrapper;
  }, [gltf.scene, width, depth, height]);
  return <primitive object={object} />;
}
