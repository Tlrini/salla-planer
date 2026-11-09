import { use, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Hall, Item } from '@salla/shared';
import { loadedHdri, loadHdri } from './environment';
import { lampColor, lampPositions, windowLight } from './lightPlan';
import { TONE_MAPPING } from './composer';
import { WARM_LIGHT } from './resources';

/** Brightness of one evening lamp; with real (inverse-square) falloff it lights a pool below it. */
const LAMP_CANDELA = { evening: 52, day: 16 };
const WHITE = new THREE.Color('#FFFFFF');

interface Props {
  hall: Hall;
  items: readonly Item[];
  evening: boolean;
  /** Off-screen renders: suspend until the HDRI has loaded. */
  waitForEnv?: boolean;
}

/**
 * Reflections: the bundled ballroom HDRI (see environment.ts). Until it has loaded, or if it is
 * missing, three's RoomEnvironment (generated locally) stands in so metal and glass never look
 * flat. Off-screen renders pass `waitForEnv` and suspend until the HDRI is there.
 */
function useEnvironment(evening: boolean, waitForEnv: boolean) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const [hdri, setHdri] = useState(loadedHdri);
  useEffect(() => {
    let alive = true;
    if (!hdri) void loadHdri().then((t) => alive && t && setHdri(t));
    return () => {
      alive = false;
    };
  }, [hdri]);
  // React 19 `use` may be called conditionally: only exports wait for the file.
  const source = waitForEnv ? use(loadHdri()) : hdri;

  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    let target: THREE.WebGLRenderTarget;
    if (source) {
      target = pmrem.fromEquirectangular(source);
    } else {
      const room = new RoomEnvironment();
      target = pmrem.fromScene(room, 0.04);
      room.dispose();
    }
    pmrem.dispose();
    return { target, real: !!source };
  }, [gl, source]);
  useEffect(() => {
    scene.environment = env.target.texture;
    invalidate();
    return () => {
      scene.environment = null;
      env.target.dispose();
    };
  }, [scene, env, invalidate]);
  useEffect(() => {
    scene.environmentIntensity = env.real
      ? evening
        ? HDRI_INTENSITY.evening
        : HDRI_INTENSITY.day
      : evening
        ? 0.12
        : 0.55;
    invalidate();
  }, [scene, evening, env, invalidate]);
}

/** HDRI brightness (the photo is brighter than the generated studio light). */
const HDRI_INTENSITY = { day: 0.7, evening: 0.1 };

/**
 * Day: soft light from above, bounced colour from the floor, daylight from the windows.
 * Evening: dark room lit by warm chandeliers with real falloff, so light gathers in pools.
 */
export function Lighting({ hall, items, evening, waitForEnv = false }: Props) {
  useEnvironment(evening, waitForEnv);
  const gl = useThree((s) => s.gl);
  const W = hall.width;
  const L = hall.length;
  const H = hall.height;
  const target = useMemo(() => new THREE.Object3D(), []);
  const size = Math.max(W, L);
  const lamps = useMemo(
    () => lampPositions({ width: W, length: L, height: H }, items),
    [items, W, L, H],
  );
  const daylight = useMemo(() => (evening ? null : windowLight(hall)), [evening, hall]);
  const windowTarget = useMemo(() => new THREE.Object3D(), []);
  // Light that comes back up from the floor takes on its colour; this is what lights the ceiling.
  const bounce = useMemo(
    () => `#${new THREE.Color(hall.floorColor).lerp(WHITE, 0.55).getHexString()}`,
    [hall.floorColor],
  );
  useEffect(() => {
    gl.toneMapping = TONE_MAPPING;
  }, [gl]);

  return (
    <>
      <color attach="background" args={[evening ? '#0D1018' : '#E9EDF2']} />
      <ambientLight intensity={evening ? 0.02 : 0.08} />
      <hemisphereLight
        args={[evening ? '#4A4238' : '#FFFDF8', evening ? '#6A5238' : bounce, evening ? 0.6 : 0.85]}
      />
      <primitive object={target} position={[W / 2, 0, L / 2]} />
      <directionalLight
        target={target}
        position={[W * 0.25, H + size * 0.9, L * 0.8]}
        color="#FFF4E6"
        intensity={evening ? 0.08 : 1.45}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={7}
        shadow-blurSamples={14}
        shadow-camera-left={-size * 0.75}
        shadow-camera-right={size * 0.75}
        shadow-camera-top={size * 0.75}
        shadow-camera-bottom={-size * 0.75}
        shadow-camera-near={0.5}
        shadow-camera-far={size * 3 + H}
      />
      {daylight && (
        <>
          <primitive object={windowTarget} position={daylight.target} />
          <spotLight
            target={windowTarget}
            position={daylight.position}
            color="#FFF7EC"
            intensity={Math.max(30, size * 6)}
            angle={1.15}
            penumbra={1}
            decay={1.4}
            distance={0}
          />
        </>
      )}
      {/* The hall's lights are on by day too: softer, but they give the walls some shape. */}
      {lamps.map((p, i) => (
        <pointLight
          key={i}
          position={p}
          color={lampColor(items, WARM_LIGHT)}
          intensity={evening ? LAMP_CANDELA.evening : LAMP_CANDELA.day}
          distance={0}
          decay={2}
        />
      ))}
    </>
  );
}
