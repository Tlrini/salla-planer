import { geo, mat, LEAF } from '../resources';
import { flowerDome } from '../merged';
import { heightOf, type BuilderProps } from './types';

/** Photo corner: framed backdrop panel at the back, rug, and flower clusters on the frame corners. */
export function PhotoCorner({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const w = item.width;
  const d = item.depth;
  const back = -d / 2 + 0.05;
  const gold = mat('gold', item.color2 ?? '#C9A44C');
  return (
    <group>
      <mesh
        geometry={g.box}
        material={mat('cloth', '#F3EBDD')}
        position={[0, 0.005, 0.1]}
        scale={[w * 0.8, 0.01, d * 0.7]}
        receiveShadow
      />
      <mesh
        geometry={g.box}
        material={mat('cloth', item.color)}
        position={[0, h / 2, back]}
        scale={[w - 0.12, h - 0.12, 0.04]}
        castShadow
      />
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          geometry={g.box}
          material={gold}
          position={[(s * (w - 0.06)) / 2, h / 2, back]}
          scale={[0.06, h, 0.08]}
          castShadow
        />
      ))}
      <mesh
        geometry={g.box}
        material={gold}
        position={[0, h - 0.03, back]}
        scale={[w, 0.06, 0.08]}
      />
      <mesh
        geometry={flowerDome()}
        material={mat('flower', '#E8C4C4')}
        position={[-w / 2 + 0.15, h - 0.25, back + 0.08]}
        scale={[0.7, 0.5, 0.4]}
      />
      <mesh
        geometry={flowerDome()}
        material={mat('leaf', LEAF)}
        position={[w / 2 - 0.2, 0, back + 0.1]}
        scale={[0.6, 0.5, 0.4]}
      />
    </group>
  );
}
