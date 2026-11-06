import { drapedBox, geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** Rectangular / imperial / head table: draped box to the floor with a runner in color2. */
export function TableRect({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  return (
    <group>
      <mesh
        geometry={g.box}
        material={drapedBox(item.color)}
        position={[0, h / 2, 0]}
        scale={[item.width + 0.06, h, item.depth + 0.06]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={g.box}
        material={mat('cloth', item.color2 ?? item.color)}
        position={[0, h + 0.004, 0]}
        scale={[item.width * 0.96, 0.006, Math.min(0.4, item.depth * 0.4)]}
      />
    </group>
  );
}
