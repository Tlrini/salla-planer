import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

const POST = 0.14;
const SLAT_GAP = 0.45;
const MAX_SLATS = 40;

/** A wooden pergola: four posts, two beams and open slats that let the sky through. */
export function Pergola({ item, cat }: BuilderProps) {
  const g = geo();
  const wood = mat('wood', item.color);
  const h = heightOf(item, cat);
  const { width: w, depth: d } = item;
  const [x, z] = [w / 2 - POST, d / 2 - POST];
  const count = Math.min(MAX_SLATS, Math.max(2, Math.floor(d / SLAT_GAP)));
  const slats = Array.from({ length: count }, (_, i) => ((i + 0.5) / count - 0.5) * d);
  const posts = [
    [-x, -z],
    [-x, z],
    [x, -z],
    [x, z],
  ] as const;
  return (
    <group>
      {posts.map(([px, pz], i) => (
        <mesh
          key={i}
          geometry={g.box}
          material={wood}
          position={[px, (h - 0.2) / 2, pz]}
          scale={[POST, h - 0.2, POST]}
          castShadow
        />
      ))}
      {[-x, x].map((px) => (
        <mesh
          key={px}
          geometry={g.box}
          material={wood}
          position={[px, h - 0.2, 0]}
          scale={[0.1, 0.22, d]}
          castShadow
        />
      ))}
      {slats.map((sz) => (
        <mesh
          key={sz}
          geometry={g.box}
          material={wood}
          position={[0, h - 0.05, sz]}
          scale={[w, 0.1, 0.05]}
          castShadow
        />
      ))}
    </group>
  );
}
