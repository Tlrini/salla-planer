import { canopyPoles, isOpenAir, type Hall, type Item } from '@salla/shared';
import { geo, mat } from '../resources';

const POLE = 0.07;
const POLE_COLOR = '#2E2E2E';

/**
 * In the open air there is no ceiling to hang lights or fabric from, so poles carry them.
 * `top` is the height of the fixed ends in the builder's frame; the ground is `hall.height` below.
 */
export function CanopyPoles({ item, hall, top }: { item: Item; hall: Hall; top: number }) {
  if (!isOpenAir(hall)) return null;
  const g = geo();
  const material = mat('metal', POLE_COLOR);
  return (
    <>
      {canopyPoles(item).map((p, i) => (
        <mesh
          key={i}
          geometry={g.cylinderLow}
          material={material}
          position={[p.x, top - hall.height / 2, p.z]}
          scale={[POLE, hall.height, POLE]}
          castShadow
        />
      ))}
    </>
  );
}
