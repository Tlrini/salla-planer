import { geo, mat, LEAF } from '../resources';
import { flowerDome, leafRing } from '../merged';
import { heightOf, type BuilderProps } from './types';

/** Table centerpiece: gold vase with a flower dome. */
export function Centerpiece({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const vaseH = h * 0.45;
  const d = item.width;
  return (
    <group>
      <mesh
        geometry={g.cylinder}
        material={mat('gold', item.color2 ?? '#C9A44C')}
        position={[0, vaseH / 2, 0]}
        scale={[d * 0.35, vaseH, d * 0.35]}
        castShadow
      />
      <mesh
        geometry={leafRing()}
        material={mat('leaf', LEAF)}
        position={[0, vaseH, 0]}
        scale={[d, d, d]}
      />
      <mesh
        geometry={flowerDome()}
        material={mat('flower', item.color)}
        position={[0, vaseH, 0]}
        scale={[d, h - vaseH, d]}
        castShadow
      />
    </group>
  );
}
