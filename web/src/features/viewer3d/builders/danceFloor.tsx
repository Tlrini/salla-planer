import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** Glossy dance floor with a thin gold edge. */
export function DanceFloor({ item, cat }: BuilderProps) {
  const g = geo();
  const h = Math.max(0.02, heightOf(item, cat));
  return (
    <group>
      <mesh
        geometry={g.box}
        material={mat('gold', '#C9A44C')}
        position={[0, h / 2 - 0.002, 0]}
        scale={[item.width + 0.06, h - 0.004, item.depth + 0.06]}
        receiveShadow
      />
      <mesh
        geometry={g.box}
        material={mat('glossy', item.color)}
        position={[0, h / 2, 0]}
        scale={[item.width, h, item.depth]}
        receiveShadow
      />
    </group>
  );
}
