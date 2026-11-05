import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Hall, Item } from '@salla/shared';
import { WARM_LIGHT } from './resources';

/** Max real point lights in the evening (plus hemisphere, ambient and one directional). */
const MAX_POINT_LIGHTS = 5;

interface Props {
  hall: Hall;
  items: readonly Item[];
  evening: boolean;
}

/** Day: bright neutral with one shadow-casting sun. Evening: dark ambient, warm chandeliers. */
/**
 * Procedural studio environment (three's RoomEnvironment, generated locally — no HDR download)
 * so metallic gold and glass have something to reflect.
 */
function useRoomEnvironment(evening: boolean) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    return target;
  }, [gl]);
  useEffect(() => {
    scene.environment = env.texture;
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [scene, env]);
  useEffect(() => {
    scene.environmentIntensity = evening ? 0.12 : 0.55;
    invalidate();
  }, [scene, evening, invalidate]);
}

export function Lighting({ hall, items, evening }: Props) {
  useRoomEnvironment(evening);
  const W = hall.width;
  const L = hall.length;
  const H = hall.height;
  const target = useMemo(() => new THREE.Object3D(), []);
  const size = Math.max(W, L);

  const lamps = useMemo(() => {
    const chandeliers = items.filter((i) => i.type === 'chandelier').slice(0, MAX_POINT_LIGHTS);
    if (chandeliers.length)
      return chandeliers.map((c) => [c.x, Math.max(1.8, H - 1.6), c.y] as [number, number, number]);
    return [
      [W * 0.3, H - 0.6, L / 2],
      [W * 0.7, H - 0.6, L / 2],
    ] as Array<[number, number, number]>;
  }, [items, W, L, H]);

  return (
    <>
      <color attach="background" args={[evening ? '#0D1018' : '#E9EDF2']} />
      <ambientLight intensity={evening ? 0.04 : 0.25} />
      <hemisphereLight
        args={[
          evening ? '#30406A' : '#FFFFFF',
          evening ? '#1A1410' : '#D8CBB5',
          evening ? 0.12 : 0.8,
        ]}
      />
      <primitive object={target} position={[W / 2, 0, L / 2]} />
      <directionalLight
        target={target}
        position={[W * 0.25, H + size * 0.9, L * 0.8]}
        intensity={evening ? 0.12 : 2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-size * 0.75}
        shadow-camera-right={size * 0.75}
        shadow-camera-top={size * 0.75}
        shadow-camera-bottom={-size * 0.75}
        shadow-camera-near={0.5}
        shadow-camera-far={size * 3 + H}
      />
      {evening &&
        lamps.map((p, i) => (
          <pointLight
            key={i}
            position={p}
            color={WARM_LIGHT}
            intensity={14}
            distance={0}
            decay={1.6}
          />
        ))}
    </>
  );
}
