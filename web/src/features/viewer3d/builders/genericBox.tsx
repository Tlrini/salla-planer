import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** Simple box/cylinder for item types without a dedicated builder. */
export function GenericBox({ item, cat }: BuilderProps) {
  const h = Math.max(0.05, heightOf(item, cat));
  const g = cat.shape2d === 'circle' ? geo().cylinder : geo().box;
  return (
    <mesh
      geometry={g}
      material={mat('matte', item.color)}
      position={[0, h / 2, 0]}
      scale={[item.width, h, item.depth]}
      castShadow
      receiveShadow
    />
  );
}
