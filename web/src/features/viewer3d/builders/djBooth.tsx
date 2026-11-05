import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** DJ booth: dark console with a glowing front strip and two decks. */
export function DjBooth({ item, cat, evening }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const w = item.width;
  const d = item.depth;
  return (
    <group>
      <mesh
        geometry={g.box}
        material={mat('glossy', item.color)}
        position={[0, h / 2, 0]}
        scale={[w, h, d]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={g.box}
        material={mat('emissive', item.color2 ?? '#C9A44C', evening ? 3 : 0.8)}
        position={[0, h * 0.55, d / 2 + 0.005]}
        scale={[w * 0.9, 0.05, 0.01]}
      />
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          geometry={g.cylinder}
          material={mat('metal', '#3A3A3A')}
          position={[(s * w) / 4, h + 0.02, 0]}
          scale={[0.32, 0.04, 0.32]}
        />
      ))}
    </group>
  );
}
