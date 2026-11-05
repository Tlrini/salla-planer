import { geo, mat, LEAF } from '../resources';
import { flowerDome, leafRing } from '../merged';
import { heightOf, type BuilderProps } from './types';

/** Tall flower stand: slim gold column, bowl and an abundant flower dome. */
export function FlowerStand({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const stem = h * 0.72;
  const gold = mat('gold', item.color2 ?? '#C9A44C');
  const d = item.width;
  return (
    <group>
      <mesh
        geometry={g.cylinder}
        material={gold}
        position={[0, 0.015, 0]}
        scale={[d * 0.6, 0.03, d * 0.6]}
      />
      <mesh
        geometry={g.cylinderLow}
        material={gold}
        position={[0, stem / 2, 0]}
        scale={[0.05, stem, 0.05]}
        castShadow
      />
      <mesh
        geometry={g.cylinder}
        material={gold}
        position={[0, stem, 0]}
        scale={[d * 0.45, 0.06, d * 0.45]}
      />
      <mesh
        geometry={leafRing()}
        material={mat('leaf', LEAF)}
        position={[0, stem + 0.02, 0]}
        scale={[d * 1.2, d, d * 1.2]}
      />
      <mesh
        geometry={flowerDome()}
        material={mat('flower', item.color)}
        position={[0, stem + 0.02, 0]}
        scale={[d * 1.1, h - stem, d * 1.1]}
        castShadow
      />
    </group>
  );
}
