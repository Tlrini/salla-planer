import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { HallShell } from '@salla/shared';

const DEG = Math.PI / 180;

/**
 * The scanned room itself (walls, ceiling, tent fabric…) as the hall's shell, placed with the
 * transform measured in the scan dialog: floor corner at the origin, one unit = one meter.
 * Only faces looking into the room are drawn, so the dollhouse view still looks inside;
 * `shell.flip` is for scans whose faces came out the other way around.
 */
export function ScanShell({ shell }: { shell: HallShell }) {
  const gltf = useGLTF(shell.url, false);
  const invalidate = useThree((s) => s.invalidate);

  const { root, materials } = useMemo(() => {
    const content = gltf.scene.clone(true);
    const owned: THREE.Material[] = [];
    content.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const own = (m: THREE.Material) => {
        const c = m.clone();
        c.side = shell.flip ? THREE.BackSide : THREE.FrontSide;
        owned.push(c);
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
      mesh.receiveShadow = true;
    });
    // Same nesting as the scan dialog: upright turn → wall alignment → scale and offset.
    const upright = new THREE.Group();
    upright.rotation.set(shell.turn.x * DEG, 0, shell.turn.z * DEG);
    upright.add(content);
    const yaw = new THREE.Group();
    yaw.rotation.set(0, shell.turn.yaw * DEG, 0);
    yaw.add(upright);
    const group = new THREE.Group();
    group.scale.setScalar(shell.scale);
    group.position.set(shell.offset.x, shell.offset.y, shell.offset.z);
    group.add(yaw);
    return { root: group, materials: owned };
  }, [gltf.scene, shell]);

  useEffect(() => {
    invalidate();
    return () => {
      for (const m of materials) m.dispose();
    };
  }, [materials, invalidate]);

  return <primitive object={root} />;
}
