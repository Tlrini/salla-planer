import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { CatalogMap, Item } from '@salla/shared';
import { chairCushion, chairFrame } from './merged';
import { mat } from './resources';
import { collectChairs, groupChairs, type ChairPose } from './chairs';

const dummy = new THREE.Object3D();

/** Round capacity up so the InstancedMesh is only recreated when a group grows a lot. */
const capacityFor = (n: number) => Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, n))));

function ChairGroup({
  poses,
  frame,
  cushion,
}: {
  poses: ChairPose[];
  frame: string;
  cushion: string;
}) {
  const frameRef = useRef<THREE.InstancedMesh>(null);
  const cushionRef = useRef<THREE.InstancedMesh>(null);
  const capacity = capacityFor(poses.length);

  useLayoutEffect(() => {
    for (const mesh of [frameRef.current, cushionRef.current]) {
      if (!mesh) continue;
      poses.forEach((p, i) => {
        dummy.position.set(p.x, 0, p.y);
        dummy.rotation.set(0, (-p.rotation * Math.PI) / 180, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.count = poses.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [poses, capacity]);

  return (
    <>
      <instancedMesh
        key={`f${capacity}`}
        ref={frameRef}
        args={[chairFrame(), mat('gold', frame), capacity]}
        castShadow
        frustumCulled={false}
      />
      <instancedMesh
        key={`c${capacity}`}
        ref={cushionRef}
        args={[chairCushion(), mat('cloth', cushion), capacity]}
        frustumCulled={false}
      />
    </>
  );
}

/** Every chair in the hall, drawn with one InstancedMesh pair per color combination. */
export function ChairInstances({
  items,
  catalog,
  ignoreModel = false,
}: {
  items: readonly Item[];
  catalog: CatalogMap;
  /** Draw the procedural chairs even though a scanned chair model is set. */
  ignoreModel?: boolean;
}) {
  const groups = useMemo(
    () => groupChairs(collectChairs(items, catalog, ignoreModel)),
    [items, catalog, ignoreModel],
  );
  return (
    <>
      {[...groups.entries()].map(([key, poses]) => {
        const [frame, cushion] = key.split('|') as [string, string];
        return <ChairGroup key={key} poses={poses} frame={frame} cushion={cushion} />;
      })}
    </>
  );
}
