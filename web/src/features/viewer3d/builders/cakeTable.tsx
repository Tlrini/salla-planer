import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** Round cake table with a three-tier cake. */
export function CakeTable({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const r = item.width / 2;
  const icing = mat('cloth', '#FFFDF8');
  const ribbon = mat('cloth', item.color2 ?? '#E8C4C4');
  const tiers = [
    { r: 0.2, h: 0.16 },
    { r: 0.15, h: 0.14 },
    { r: 0.1, h: 0.12 },
  ];
  let y = h + 0.06;
  return (
    <group>
      <mesh
        geometry={g.cylinder}
        material={mat('cloth', item.color)}
        position={[0, h / 2, 0]}
        scale={[r * 2 + 0.04, h, r * 2 + 0.04]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={g.cylinder}
        material={mat('gold', '#C9A44C')}
        position={[0, h + 0.03, 0]}
        scale={[0.5, 0.06, 0.5]}
      />
      {tiers.map((t, i) => {
        const cy = y + t.h / 2;
        y += t.h;
        return (
          <group key={i}>
            <mesh
              geometry={g.cylinder}
              material={icing}
              position={[0, cy, 0]}
              scale={[t.r * 2, t.h, t.r * 2]}
              castShadow
            />
            <mesh
              geometry={g.cylinder}
              material={ribbon}
              position={[0, cy - t.h / 2 + 0.02, 0]}
              scale={[t.r * 2 + 0.005, 0.025, t.r * 2 + 0.005]}
            />
          </group>
        );
      })}
    </group>
  );
}
