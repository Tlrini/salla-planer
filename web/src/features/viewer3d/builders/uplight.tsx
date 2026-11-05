import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** LED uplight fixture. The colored wash on the nearest wall is drawn by UplightWashes. */
export function Uplight({ item, cat, evening }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  return (
    <group>
      <mesh
        geometry={g.box}
        material={mat('metal', '#1A1A1A')}
        position={[0, h * 0.4, 0]}
        scale={[item.width, h * 0.8, item.depth]}
        castShadow
      />
      <mesh
        geometry={g.box}
        material={mat('emissive', item.color, evening ? 6 : 1.5)}
        position={[0, h * 0.82, 0]}
        scale={[item.width * 0.8, 0.02, item.depth * 0.8]}
      />
    </group>
  );
}
