import { use, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { isOpenAir, seesSky, type Hall, type Item } from '@salla/shared';
import {
  HDRI_URL,
  loadedHdri,
  loadedSkyPhoto,
  loadHdri,
  loadSkyPhoto,
  skyHdriUrl,
} from './environment';
import {
  bounceColor,
  lampColor,
  lampPositions,
  SKY_LIGHT,
  skyName,
  sunPlan,
  windowLight,
  type SkyName,
} from './lightPlan';
import { TONE_MAPPING } from './composer';
import { WARM_LIGHT } from './resources';

/** Brightness of one evening lamp; with real (inverse-square) falloff it lights a pool below it. */
const LAMP_CANDELA = { evening: 52, day: 16 };
const WHITE = new THREE.Color('#FFFFFF');

interface Props {
  hall: Hall;
  items: readonly Item[];
  evening: boolean;
  /** Outdoors, the evening is the golden hour instead of the night. */
  sunset?: boolean;
  /** Off-screen renders: suspend until the HDRI has loaded. */
  waitForEnv?: boolean;
}

/**
 * Reflections: the bundled ballroom HDRI (see environment.ts). Until it has loaded, or if it is
 * missing, three's RoomEnvironment (generated locally) stands in so metal and glass never look
 * flat. Off-screen renders pass `waitForEnv` and suspend until the HDRI is there.
 */
function useEnvironment(
  evening: boolean,
  waitForEnv: boolean,
  sky: { url: string; intensity: number } | null,
) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const url = sky?.url ?? HDRI_URL;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (loadedHdri(url)) return;
    let alive = true;
    void loadHdri(url).then((t) => alive && t && setTick((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [url]);
  // React 19 `use` may be called conditionally: only exports wait for the file.
  const source = waitForEnv ? use(loadHdri(url)) : loadedHdri(url);

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
  const skyIntensity = sky?.intensity;
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
      ? (skyIntensity ?? (evening ? HDRI_INTENSITY.evening : HDRI_INTENSITY.day))
      : evening
        ? 0.12
        : 0.55;
    invalidate();
  }, [scene, evening, env, invalidate, skyIntensity]);
}

/** What is behind the scene: the sky photo outdoors, otherwise a plain colour. */
function useBackground(evening: boolean, sky: SkyName | null, wait: boolean) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!sky || loadedSkyPhoto(sky)) return;
    let alive = true;
    void loadSkyPhoto(sky).then((t) => alive && t && setTick((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [sky]);
  // React 19 `use` may be called conditionally: only exports wait for the file.
  const photo = !sky ? null : wait ? use(loadSkyPhoto(sky)) : loadedSkyPhoto(sky);
  useEffect(() => {
    scene.background = photo ?? new THREE.Color(evening ? '#0D1018' : '#E9EDF2');
    scene.backgroundIntensity = sky ? SKY_LIGHT[sky].background : 1;
    invalidate();
  }, [scene, photo, evening, sky, invalidate]);
}

/** HDRI brightness (the photo is brighter than the generated studio light). */
const HDRI_INTENSITY = { day: 0.7, evening: 0.1 };

/**
 * Day: soft light from above, bounced colour from the floor, daylight from the windows.
 * Evening: dark room lit by warm chandeliers with real falloff, so light gathers in pools.
 */
export function Lighting({ hall, items, evening, sunset = false, waitForEnv = false }: Props) {
  const sky = seesSky(hall) ? skyName(evening, sunset) : null;
  const sun = sky ? sunPlan(hall, sky) : null;
  const open = isOpenAir(hall);
  useEnvironment(
    evening,
    waitForEnv,
    sky && sun ? { url: skyHdriUrl(sky), intensity: sun.environment } : null,
  );
  useBackground(evening, sky, waitForEnv);
  const gl = useThree((s) => s.gl);
  const W = hall.width;
  const L = hall.length;
  const H = hall.height;
  const target = useMemo(() => new THREE.Object3D(), []);
  const size = Math.max(W, L);
  const lamps = useMemo(
    () => (open && !evening ? [] : lampPositions(hall, items)),
    [items, hall, open, evening],
  );
  const daylight = useMemo(() => (evening ? null : windowLight(hall)), [evening, hall]);
  const windowTarget = useMemo(() => new THREE.Object3D(), []);
  // Light that comes back up from the floor takes on its colour; this is what lights the ceiling.
  const bounce = useMemo(
    () => `#${new THREE.Color(bounceColor(hall)).lerp(WHITE, 0.55).getHexString()}`,
    [hall],
  );
  useEffect(() => {
    gl.toneMapping = TONE_MAPPING;
  }, [gl]);

  return (
    <>
      <ambientLight intensity={evening ? 0.02 : 0.08} />
      <hemisphereLight
        args={
          sky
            ? [SKY_LIGHT[sky].sky, bounce, SKY_LIGHT[sky].hemisphere]
            : [evening ? '#4A4238' : '#FFFDF8', evening ? '#6A5238' : bounce, evening ? 0.6 : 0.85]
        }
      />
      <primitive object={target} position={[W / 2, 0, L / 2]} />
      <directionalLight
        target={target}
        position={sun?.position ?? [W * 0.25, H + size * 0.9, L * 0.8]}
        color={sun?.color ?? '#FFF4E6'}
        intensity={sun?.intensity ?? (evening ? 0.08 : 1.45)}
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
