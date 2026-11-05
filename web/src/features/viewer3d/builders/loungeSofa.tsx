import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** Three-seat lounge sofa: base, back, arms and seat cushions. */
export function LoungeSofa({ item, cat }: BuilderProps) {
  const g = geo();
  const w = item.width;
  const d = item.depth;
  const h = heightOf(item, cat);
  const fabric = mat('cloth', item.color);
  const legs = mat('gold', item.color2 ?? '#C9A44C');
  const arm = 0.18;
  return (
    <group>
      <mesh
        geometry={g.box}
        material={fabric}
        position={[0, 0.25, 0]}
        scale={[w, 0.3, d]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={g.box}
        material={fabric}
        position={[0, h * 0.62, -d / 2 + 0.1]}
        scale={[w, h * 0.75, 0.2]}
        castShadow
      />
      <mesh
        geometry={g.box}
        material={fabric}
        position={[-w / 2 + arm / 2, 0.45, 0]}
        scale={[arm, 0.45, d]}
        castShadow
      />
      <mesh
        geometry={g.box}
        material={fabric}
        position={[w / 2 - arm / 2, 0.45, 0]}
        scale={[arm, 0.45, d]}
        castShadow
      />
      {[-1, 0, 1].map((i) => (
        <mesh
          key={i}
          geometry={g.box}
          material={fabric}
          position={[(i * (w - 2 * arm)) / 3, 0.45, 0.06]}
          scale={[(w - 2 * arm) / 3 - 0.02, 0.12, d - 0.25]}
        />
      ))}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}${sz}`}
            geometry={g.cylinderLow}
            material={legs}
            position={[(sx * (w - 0.1)) / 2, 0.05, (sz * (d - 0.1)) / 2]}
            scale={[0.04, 0.1, 0.04]}
          />
        )),
      )}
    </group>
  );
}
