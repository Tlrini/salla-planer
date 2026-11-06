import { Suspense, useEffect } from 'react';
import { createRoot, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CatalogItem } from '@salla/shared';
import { GlbModel } from '../viewer3d/GlbModel';

extend(THREE as unknown as Parameters<typeof extend>[0]);

const SIZE = 512;
const TIMEOUT_MS = 30_000;

export interface ModelImages {
  /** 3/4 perspective view, transparent background (library cards, sidebar). */
  thumbnail: string;
  /**
   * Straight top-down orthographic view covering a square of side max(width, depth) centered on
   * the item, transparent background (drawn inside the item in the 2D plan).
   */
  topView: string;
}

/** Square the top view covers, in meters (the 2D plan draws the image at this size). */
export const topViewSpan = (cat: Pick<CatalogItem, 'width' | 'depth'>) =>
  Math.max(cat.width, cat.depth, 0.05);

function Capture({ cat, onDone }: { cat: CatalogItem; onDone: (r: ModelImages) => void }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.setClearColor(0x000000, 0);
    const h = Math.max(cat.height, 0.05);
    const span = topViewSpan(cat);

    const persp = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
    const radius = Math.max(span, h) * 0.75;
    const dist = radius / Math.tan((15 * Math.PI) / 180);
    persp.position.set(dist * 0.5, h * 0.5 + dist * 0.42, dist * 0.78);
    persp.lookAt(0, h * 0.45, 0);
    persp.updateMatrixWorld();
    // First render compiles shaders and uploads textures; the second is the clean frame.
    gl.render(scene, persp);
    gl.render(scene, persp);
    const thumbnail = gl.domElement.toDataURL('image/png');

    const top = new THREE.OrthographicCamera(
      -span / 2,
      span / 2,
      span / 2,
      -span / 2,
      0.01,
      h + 20,
    );
    top.position.set(0, h + 10, 0);
    top.up.set(0, 0, -1); // image top = plan top (3D -z)
    top.lookAt(0, 0, 0);
    top.updateMatrixWorld();
    gl.render(scene, top);
    const topView = gl.domElement.toDataURL('image/png');
    onDone({ thumbnail, topView });
  }, [gl, scene, cat, onDone]);
  return null;
}

/** Render the library thumbnails of a set-up decor off-screen (its own WebGL canvas). */
export async function renderModelImages(cat: CatalogItem): Promise<ModelImages> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const root = createRoot(canvas);
  await root.configure({
    size: { width: SIZE, height: SIZE, top: 0, left: 0 },
    dpr: 1,
    frameloop: 'never',
    gl: { preserveDrawingBuffer: true, antialias: true, alpha: true },
  });
  try {
    return await new Promise<ModelImages>((resolve, reject) => {
      setTimeout(() => reject(new Error('thumbnail render timed out')), TIMEOUT_MS);
      root.render(
        <>
          <hemisphereLight args={['#ffffff', '#b8b0a4', 2.2]} />
          <directionalLight position={[2, 4, 3]} intensity={2.2} />
          <directionalLight position={[-3, 2, -2]} intensity={0.6} />
          <Suspense fallback={null}>
            <GlbModel cat={cat} item={cat} />
            <Capture cat={cat} onDone={resolve} />
          </Suspense>
        </>,
      );
    });
  } finally {
    root.unmount();
  }
}
