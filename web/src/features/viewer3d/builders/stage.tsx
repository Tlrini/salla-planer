import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** Stage / podium: platform with a skirt and a gold edge trim. */
export function Stage({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  return (
    <group>
      <mesh
        geometry={g.box}
        material={mat('cloth', item.color)}
        position={[0, h / 2, 0]}
        scale={[item.width, h, item.depth]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={g.box}
        material={mat('glossy', item.color2 ?? '#F3EBDD')}
        position={[0, h + 0.005, 0]}
        scale={[item.width - 0.04, 0.01, item.depth - 0.04]}
        receiveShadow
      />
      <mesh
        geometry={g.box}
        material={mat('gold', '#C9A44C')}
        position={[0, h - 0.02, item.depth / 2 + 0.005]}
        scale={[item.width, 0.04, 0.012]}
      />
    </group>
  );
}
