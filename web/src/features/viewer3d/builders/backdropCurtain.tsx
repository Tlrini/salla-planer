import { geo, mat, sided } from '../resources';
import { wavyCurtain } from '../merged';
import { heightOf, type BuilderProps } from './types';

/** Draped curtain backdrop on a gold frame. */
export function BackdropCurtain({ item, cat }: BuilderProps) {
  const g = geo();
  const h = heightOf(item, cat);
  const frame = mat('gold', item.color2 ?? '#C9A44C');
  return (
    <group>
      <mesh
        geometry={wavyCurtain(item.width, h - 0.05)}
        material={sided('cloth', item.color)}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={g.cylinderLow}
        material={frame}
        position={[0, h, 0]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[0.04, item.width + 0.1, 0.04]}
      />
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh
            geometry={g.cylinderLow}
            material={frame}
            position={[(s * (item.width + 0.1)) / 2, h / 2, 0]}
            scale={[0.04, h, 0.04]}
            castShadow
          />
          <mesh
            geometry={g.box}
            material={frame}
            position={[(s * (item.width + 0.1)) / 2, 0.01, 0]}
            scale={[0.3, 0.02, 0.3]}
          />
        </group>
      ))}
    </group>
  );
}
