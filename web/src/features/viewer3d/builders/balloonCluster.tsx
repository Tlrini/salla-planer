import { geo, mat } from '../resources';
import { balloons } from '../merged';
import { heightOf, type BuilderProps } from './types';

/** Balloon column in two alternating colors on a weighted base. */
export function BalloonCluster({ item, cat }: BuilderProps) {
  const h = heightOf(item, cat);
  return (
    <group>
      <mesh
        geometry={geo().cylinder}
        material={mat('gold', '#C9A44C')}
        position={[0, 0.06, 0]}
        scale={[0.3, 0.12, 0.3]}
      />
      <mesh
        geometry={balloons(item.width, h, 0)}
        material={mat('balloon', item.color)}
        castShadow
      />
      <mesh
        geometry={balloons(item.width, h, 1)}
        material={mat('balloon', item.color2 ?? '#FFFFFF')}
        castShadow
      />
    </group>
  );
}
