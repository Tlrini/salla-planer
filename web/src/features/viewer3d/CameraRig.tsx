import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import type { Hall, Item } from '@salla/shared';

/** The part of drei's OrbitControls we use (avoids importing a transitive dependency). */
type OrbitControlsImpl = { target: THREE.Vector3; update: () => void };
import { cameraFor, type CameraPreset } from './cameras';

/** Moves the camera and orbit target when the preset (or the hall size) changes. */
export function CameraRig({
  preset,
  hall,
  items,
  nonce,
}: {
  preset: CameraPreset;
  hall: Hall;
  items: readonly Item[];
  nonce: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const { position, target } = cameraFor(preset, hall, items);
    camera.position.set(...position);
    if (controls) {
      controls.target.set(...target);
      controls.update();
    } else {
      camera.lookAt(...target);
    }
    invalidate();
    // Only re-aim on preset / hall size changes (or an explicit re-click), not on every item edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, hall.width, hall.length, hall.height, controls, nonce]);

  return null;
}
