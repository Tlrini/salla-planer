import { candleGlow, geo, mat } from '../resources';
import type { BuilderProps } from './types';

const CANDLES: Array<[number, number, number]> = [
  [-0.09, 0.02, 0.22],
  [0.07, -0.05, 0.16],
  [0.03, 0.08, 0.1],
];

/** Group of three pillar candles with glowing flames (stronger in the evening). */
export function CandleGroup({ item, evening }: BuilderProps) {
  const g = geo();
  const k = item.width / 0.4;
  const wax = mat('cloth', item.color);
  const flame = mat('emissive', '#FFB347', evening ? 4 : 1.2);
  return (
    <group scale={[k, 1, k]}>
      <mesh
        geometry={g.cylinder}
        material={mat('gold', item.color2 ?? '#C9A44C')}
        position={[0, 0.01, 0]}
        scale={[0.36, 0.02, 0.36]}
      />
      {CANDLES.map(([x, z, h], i) => (
        <group key={i} position={[x, 0.02, z]}>
          <mesh
            geometry={g.cylinder}
            material={wax}
            position={[0, h / 2, 0]}
            scale={[0.07, h, 0.07]}
            castShadow
          />
          <mesh
            geometry={g.sphereLow}
            material={flame}
            position={[0, h + 0.025, 0]}
            scale={[0.02, 0.045, 0.02]}
          />
        </group>
      ))}
      {evening && (
        // The warm light the flames throw on the cloth around them.
        <mesh
          geometry={g.plane}
          material={candleGlow()}
          position={[0, 0.008, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[1.7, 1.7, 1]}
          renderOrder={2}
        />
      )}
    </group>
  );
}
