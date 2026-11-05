import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** Bar counter: front body, overhanging glossy top, gold foot rail and a few bottles. */
export function BarCounter({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const w = item.width;
  const d = item.depth;
  const bottles = Math.max(2, Math.floor(w / 0.5));
  return (
    <group>
      <mesh
        geometry={g.box}
        material={mat('matte', item.color)}
        position={[0, (h - 0.05) / 2, 0]}
        scale={[w, h - 0.05, d]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={g.box}
        material={mat('glossy', item.color2 ?? '#F3EBDD')}
        position={[0, h - 0.025, 0.04]}
        scale={[w + 0.08, 0.05, d + 0.08]}
        castShadow
      />
      <mesh
        geometry={g.cylinderLow}
        material={mat('gold', '#C9A44C')}
        position={[0, 0.18, d / 2 + 0.12]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[0.03, w, 0.03]}
      />
      {Array.from({ length: bottles }, (_, i) => (
        <mesh
          key={i}
          geometry={g.cylinderLow}
          material={mat('glass', i % 2 ? '#3F6B4E' : '#8A6A3A')}
          position={[-w / 2 + (i + 0.5) * (w / bottles), h + 0.15, -d / 4]}
          scale={[0.07, 0.3, 0.07]}
        />
      ))}
    </group>
  );
}
