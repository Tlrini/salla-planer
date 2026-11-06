import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { CatalogItem, Item } from '@salla/shared';
import { modelScale, normalizeModel } from './modelTransform';

export interface PlacedModel {
  item: Item;
  /** Height the model stands on (floor 0, or a table top). */
  baseY: number;
}

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * All placements of one uploaded .glb model, drawn with one InstancedMesh per mesh of the model.
 * 40 tables with the same scanned centerpiece cost a handful of draw calls instead of hundreds.
 */
export function GlbInstances({ cat, placed }: { cat: CatalogItem; placed: PlacedModel[] }) {
  const gltf = useGLTF(cat.modelFile!, false);
  const invalidate = useThree((s) => s.invalidate);

  // Meshes of the upright, floor-centered model with their transform inside it.
  const parts = useMemo(() => {
    const { object, size } = normalizeModel(gltf.scene, cat.modelRotation);
    const meshes: Array<{ mesh: THREE.Mesh; local: THREE.Matrix4 }> = [];
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh)
        meshes.push({ mesh, local: mesh.matrixWorld.clone() });
    });
    return { meshes, size };
  }, [gltf.scene, cat.modelRotation]);

  const group = useMemo(() => {
    const g = new THREE.Group();
    const itemMatrix = new THREE.Matrix4();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    for (const { mesh, local } of parts.meshes) {
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, placed.length);
      inst.castShadow = true;
      inst.receiveShadow = true;
      placed.forEach(({ item, baseY }, i) => {
        pos.set(item.x, baseY, item.y);
        q.setFromAxisAngle(UP, -item.rotation * DEG);
        scl.set(...modelScale(parts.size, item, cat));
        itemMatrix.compose(pos, q, scl);
        inst.setMatrixAt(i, m.multiplyMatrices(itemMatrix, local));
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      g.add(inst);
    }
    return g;
  }, [parts, placed, cat]);

  useEffect(() => {
    invalidate();
    return () => {
      // Geometry and materials belong to the cached glTF; only the instance buffers are ours.
      for (const child of group.children) (child as THREE.InstancedMesh).dispose();
    };
  }, [group, invalidate]);

  return <primitive object={group} />;
}
