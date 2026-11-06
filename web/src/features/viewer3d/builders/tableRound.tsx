import { drapedCylinder, geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** Round banquet table: tablecloth cylinder to the floor, slightly wider top, runner ring. */
export function TableRound({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const r = item.width / 2;
  return (
    <group>
      <mesh
        geometry={g.cylinder}
        material={drapedCylinder(item.color)}
        position={[0, h / 2, 0]}
        scale={[r * 2 + 0.06, h, r * 2 + 0.06]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={g.cylinder}
        material={mat('cloth', item.color)}
        position={[0, h + 0.005, 0]}
        scale={[r * 2 + 0.1, 0.012, r * 2 + 0.1]}
      />
      <mesh
        geometry={g.cylinder}
        material={mat('cloth', item.color2 ?? item.color)}
        position={[0, h + 0.012, 0]}
        scale={[r * 1.05, 0.004, r * 1.05]}
      />
    </group>
  );
}
