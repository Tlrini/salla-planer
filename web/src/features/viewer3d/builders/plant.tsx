import { geo, mat } from '../resources';
import { flowerDome } from '../merged';
import { heightOf, type BuilderProps } from './types';

/** Decorative potted plant. */
export function Plant({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const d = item.width;
  const pot = h * 0.28;
  return (
    <group>
      <mesh
        geometry={g.cylinder}
        material={mat('matte', item.color2 ?? '#E6D3B3')}
        position={[0, pot / 2, 0]}
        scale={[d * 0.55, pot, d * 0.55]}
        castShadow
      />
      <mesh
        geometry={g.cylinderLow}
        material={mat('wood', '#6B4F35')}
        position={[0, pot + 0.15, 0]}
        scale={[0.04, 0.3, 0.04]}
      />
      <mesh
        geometry={flowerDome()}
        material={mat('leaf', item.color)}
        position={[0, pot + 0.1, 0]}
        scale={[d * 1.2, (h - pot) * 1.1, d * 1.2]}
        castShadow
      />
    </group>
  );
}
