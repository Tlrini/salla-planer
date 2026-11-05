import { nearestWall, type Hall, type Item } from '@salla/shared';

export type CameraPreset = 'top' | 'perspective' | 'entrance';
export type Vec3 = [number, number, number];

export const CAMERA_FOV = 45;
export const EYE_HEIGHT = 1.6;

const INWARD = {
  top: [0, 1],
  bottom: [0, -1],
  left: [1, 0],
  right: [-1, 0],
} as const;

/** Camera position and orbit target (3D coordinates: plan x -> x, plan y -> z) for a preset. */
export function cameraFor(
  preset: CameraPreset,
  hall: Hall,
  items: readonly Item[],
): { position: Vec3; target: Vec3 } {
  const W = hall.width;
  const L = hall.length;
  const H = hall.height;
  const center: Vec3 = [W / 2, 0, L / 2];

  if (preset === 'top') {
    const halfFov = ((CAMERA_FOV / 2) * Math.PI) / 180;
    const dist = (Math.max(L, W * 0.62) / 2 / Math.tan(halfFov)) * 1.12 + H;
    return { position: [W / 2, dist, L / 2 + 0.001], target: center };
  }

  if (preset === 'perspective') {
    const size = Math.max(W, L);
    return {
      position: [-W * 0.12, H + size * 0.55, L + size * 0.42],
      target: [W / 2, 0.6, L * 0.45],
    };
  }

  const door = hall.structure.find((s) => s.type === 'door') ?? { x: W / 2, y: L };
  const { wall } = nearestWall(door.x, door.y, hall);
  const [ix, iy] = INWARD[wall];
  const position: Vec3 = [door.x + ix * 1.2, EYE_HEIGHT, door.y + iy * 1.2];
  const stage = items.find((i) => i.type === 'stage') ?? items.find((i) => i.type === 'table_head');
  const look = stage
    ? [stage.x, stage.y]
    : [door.x + ix * Math.max(W, L) * 0.6, door.y + iy * Math.max(W, L) * 0.6];
  const lx = Math.min(W - 0.5, Math.max(0.5, look[0]!));
  const lz = Math.min(L - 0.5, Math.max(0.5, look[1]!));
  return { position, target: [lx, 1.2, lz] };
}
