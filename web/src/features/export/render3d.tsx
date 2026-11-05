import { Suspense, useEffect } from 'react';
import { createRoot, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CatalogItem, Hall, Item } from '@salla/shared';
import { CAMERA_FOV, cameraFor, type CameraPreset } from '../viewer3d/cameras';
import { HallScene } from '../viewer3d/HallScene';

// <Canvas> registers the three.js classes itself; a bare createRoot needs this once.
extend(THREE as unknown as Parameters<typeof extend>[0]);

const RENDER_TIMEOUT_MS = 60_000;

export const RENDER_WIDTH = 1920;
export const RENDER_HEIGHT = 1080;

function Capture({
  hall,
  items,
  presets,
  mime,
  onDone,
}: {
  hall: Hall;
  items: readonly Item[];
  presets: CameraPreset[];
  mime: 'image/png' | 'image/jpeg';
  onDone: (urls: string[]) => void;
}) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.aspect = RENDER_WIDTH / RENDER_HEIGHT;
    cam.updateProjectionMatrix();
    const urls = presets.map((preset) => {
      const { position, target } = cameraFor(preset, hall, items);
      cam.position.set(...position);
      cam.lookAt(...target);
      cam.updateMatrixWorld();
      // First render builds shadow maps and uploads textures; the second is the clean frame.
      gl.render(scene, cam);
      gl.render(scene, cam);
      return gl.domElement.toDataURL(mime, 0.92);
    });
    onDone(urls);
  }, [gl, scene, camera, hall, items, presets, mime, onDone]);
  return null;
}

/**
 * Renders the 3D hall off-screen at 1920x1080 (its own WebGL canvas with
 * preserveDrawingBuffer), one image per camera preset. Never a screenshot of the live view.
 */
export async function render3d(
  hall: Hall,
  items: readonly Item[],
  catalog: ReadonlyMap<string, CatalogItem>,
  presets: CameraPreset[],
  {
    evening = false,
    mime = 'image/jpeg',
  }: { evening?: boolean; mime?: 'image/png' | 'image/jpeg' } = {},
): Promise<string[]> {
  const canvas = document.createElement('canvas');
  canvas.width = RENDER_WIDTH;
  canvas.height = RENDER_HEIGHT;
  const root = createRoot(canvas);
  await root.configure({
    size: { width: RENDER_WIDTH, height: RENDER_HEIGHT, top: 0, left: 0 },
    dpr: 1,
    frameloop: 'never',
    shadows: true,
    gl: { preserveDrawingBuffer: true, antialias: true },
    camera: { fov: CAMERA_FOV, near: 0.05, far: 600 },
  });
  try {
    return await new Promise<string[]>((resolve, reject) => {
      // Errors inside the off-screen fiber root never reach us; don't spin forever.
      setTimeout(() => reject(new Error('3D render timed out')), RENDER_TIMEOUT_MS);
      root.render(
        <Suspense fallback={null}>
          <HallScene project={{ hall, items: [...items] }} catalog={catalog} evening={evening} />
          <Capture hall={hall} items={items} presets={presets} mime={mime} onDone={resolve} />
        </Suspense>,
      );
    });
  } finally {
    root.unmount();
  }
}
