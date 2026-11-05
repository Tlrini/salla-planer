import { geo, mat } from '../resources';
import { crystals } from '../merged';
import { heightOf, type BuilderProps } from './types';

/** Crystal chandelier hanging from the ceiling (emissive; the evening point light is added by the scene). */
export function Chandelier({ item, cat, hall, evening }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const r = item.width / 2;
  const top = hall.height;
  const chain = Math.max(0.2, Math.min(1.2, top - h - 2.6));
  const glow = evening ? 2.6 : 0.6;
  return (
    <group position={[0, top, 0]}>
      <mesh
        geometry={g.cylinderLow}
        material={mat('gold', '#C9A44C')}
        position={[0, -chain / 2, 0]}
        scale={[0.02, chain, 0.02]}
      />
      <group position={[0, -chain, 0]}>
        <mesh
          geometry={g.cylinder}
          material={mat('gold', '#C9A44C')}
          position={[0, -0.04, 0]}
          scale={[r * 0.5, 0.08, r * 0.5]}
        />
        <mesh
          geometry={g.cone}
          material={mat('glass', item.color, glow)}
          position={[0, -h * 0.55, 0]}
          rotation={[Math.PI, 0, 0]}
          scale={[r * 0.9, h * 0.9, r * 0.9]}
        />
        <mesh geometry={crystals(r, h)} material={mat('glass', '#FFFFFF', glow)} />
        <mesh
          geometry={g.sphereLow}
          material={mat('emissive', '#FFE2B0', evening ? 5 : 1)}
          position={[0, -h * 0.45, 0]}
          scale={[r * 0.5, r * 0.4, r * 0.5]}
        />
      </group>
    </group>
  );
}
