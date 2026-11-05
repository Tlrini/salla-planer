import { geo, mat } from '../resources';
import { heightOf, type BuilderProps } from './types';

/** Aisle runner carpet. */
export function CarpetAisle({ item, cat }: BuilderProps) {
  const h = Math.max(0.01, heightOf(item, cat));
  return (
    <mesh
      geometry={geo().box}
      material={mat('cloth', item.color)}
      position={[0, h / 2, 0]}
      scale={[item.width, h, item.depth]}
      receiveShadow
    />
  );
}
