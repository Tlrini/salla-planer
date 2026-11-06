import { Suspense, useEffect } from 'react';
import { createRoot, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CatalogItem, Hall, Item } from '@salla/shared';
import { EYE_HEIGHT, type Pose } from '../viewer3d/cameras';
import { HallScene } from '../viewer3d/HallScene';

extend(THREE as unknown as Parameters<typeof extend>[0]);

export const PANO_WIDTH = 4096;
export const PANO_HEIGHT = 2048;
const CUBE_SIZE = 1536;
const TIMEOUT_MS = 90_000;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Equirectangular projection of the cube map; the image center looks along `yaw`.
const fragmentShader = /* glsl */ `
  uniform samplerCube cube;
  uniform float yaw;
  varying vec2 vUv;
  const float PI_ = 3.141592653589793;
  void main() {
    float lon = (vUv.x - 0.5) * 2.0 * PI_ + yaw;
    float lat = (vUv.y - 0.5) * PI_;
    vec3 dir = vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
    gl_FragColor = textureCube(cube, dir);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Capture({
  pose,
  onDone,
  onError,
}: {
  pose: Pose;
  onDone: (url: string) => void;
  onError: (err: unknown) => void;
}) {
  const { gl, scene } = useThree();
  useEffect(() => {
    try {
      onDone(capture());
    } catch (err) {
      // Errors inside the off-screen root never reach the caller on their own.
      onError(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture once per pose
  }, [gl, scene, pose]);

  function capture(): string {
    const target = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, {
      type: THREE.HalfFloatType,
      generateMipmaps: false,
    });
    const cubeCamera = new THREE.CubeCamera(0.05, 600, target);
    cubeCamera.position.set(pose.x, EYE_HEIGHT, pose.y);
    cubeCamera.updateMatrixWorld();
    // First pass builds shadow maps and uploads textures; the second is the clean one.
    cubeCamera.update(gl, scene);
    cubeCamera.update(gl, scene);

    const material = new THREE.ShaderMaterial({
      uniforms: { cube: { value: target.texture }, yaw: { value: (pose.yaw * Math.PI) / 180 } },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    gl.setRenderTarget(null);
    gl.render(quadScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    const url = gl.domElement.toDataURL('image/jpeg', 0.9);

    quad.geometry.dispose();
    material.dispose();
    target.dispose();
    return url;
  }
  return null;
}

/**
 * A 360° equirectangular panorama (4096×2048 JPEG data URL) seen from a person standing at
 * `pose`, rendered off-screen from the same scene as the live 3D view.
 */
export async function renderPanorama(
  hall: Hall,
  items: readonly Item[],
  catalog: ReadonlyMap<string, CatalogItem>,
  pose: Pose,
  evening: boolean,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = PANO_WIDTH;
  canvas.height = PANO_HEIGHT;
  const root = createRoot(canvas);
  await root.configure({
    size: { width: PANO_WIDTH, height: PANO_HEIGHT, top: 0, left: 0 },
    dpr: 1,
    frameloop: 'never',
    shadows: true,
    gl: { preserveDrawingBuffer: true, antialias: false },
  });
  try {
    return await new Promise<string>((resolve, reject) => {
      setTimeout(() => reject(new Error('panorama render timed out')), TIMEOUT_MS);
      root.render(
        <Suspense fallback={null}>
          <HallScene
            project={{ hall, items: [...items] }}
            catalog={catalog}
            evening={evening}
            waitForModels
          />
          <Capture pose={pose} onDone={resolve} onError={reject} />
        </Suspense>,
      );
    });
  } finally {
    root.unmount();
  }
}
