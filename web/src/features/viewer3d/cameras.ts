import { nearestWall, type Hall, type Item } from '@salla/shared';

export type CameraPreset = 'top' | 'perspective' | 'entrance' | 'ceiling';
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

  if (preset === 'ceiling') {
    // Standing in the room looking up, so decor can be dragged onto the ceiling.
    return { position: [W / 2, EYE_HEIGHT, L * 0.75], target: [W / 2, H, L * 0.4] };
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

// ---------------------------------------------------------------------------------------------
// Eye-level walking (Beta 3)

export interface Pose {
  /** Plan position (m). */
  x: number;
  y: number;
  /** Degrees: yaw clockwise from "up the plan" (−y), pitch up (+) / down (−). */
  yaw: number;
  pitch: number;
  /**
   * What the view is about (3D point). If the spot is taken and the visitor ends up elsewhere,
   * the view is re-aimed at this point.
   */
  look?: Vec3;
}

const RAD = 180 / Math.PI;

/** Yaw/pitch of an eye at plan (x, y), height EYE_HEIGHT, looking at a 3D point (x, height, z). */
export function poseLookingAt(x: number, y: number, target: Vec3): Pose {
  const dx = target[0] - x;
  const dz = target[2] - y;
  const yaw = Math.atan2(dx, -dz) * RAD;
  const pitch = Math.atan2(target[1] - EYE_HEIGHT, Math.hypot(dx, dz)) * RAD;
  return {
    x,
    y,
    yaw: Math.round(yaw * 10) / 10,
    pitch: Math.round(pitch * 10) / 10,
    look: target,
  };
}

/** Camera Euler angles (order YXZ) for a pose. */
export function poseEuler(p: Pick<Pose, 'yaw' | 'pitch'>): [number, number, number] {
  return [p.pitch / RAD, -p.yaw / RAD, 0];
}

/** Plan direction of a yaw (unit vector). */
export function yawDirection(yaw: number): { x: number; y: number } {
  return { x: Math.sin(yaw / RAD), y: -Math.cos(yaw / RAD) };
}

/** Where the visitor stands right now in walk mode (read by the 360° export). */
export const walkState: { last: Pose | null } = { last: null };

export type AutoViewpointKey = 'entrance' | 'headTable' | 'danceFloor' | 'stage';

/**
 * Ready-made eye-level views derived from the layout: the entrance, in front of the couple's
 * table, on the dance floor and in front of the stage. Positions are not yet collision-checked.
 */
export function autoViewpoints(
  hall: Hall,
  items: readonly Item[],
): Array<{ key: AutoViewpointKey; pose: Pose }> {
  const out: Array<{ key: AutoViewpointKey; pose: Pose }> = [];
  const entrance = cameraFor('entrance', hall, items);
  out.push({
    key: 'entrance',
    pose: poseLookingAt(entrance.position[0], entrance.position[2], entrance.target),
  });

  const front = (item: Item, distance: number): { x: number; y: number } => {
    const r = (item.rotation * Math.PI) / 180;
    // Local +y (the open side of a head table, the audience side of a stage) in plan space.
    const ly = item.depth / 2 + distance;
    return { x: item.x - ly * Math.sin(r), y: item.y + ly * Math.cos(r) };
  };

  const head = items.find((i) => i.type === 'table_head');
  if (head) {
    const p = front(head, 3);
    out.push({ key: 'headTable', pose: poseLookingAt(p.x, p.y, [head.x, 1.1, head.y]) });
  }
  const stage = items.find((i) => i.type === 'stage');
  const dance = items.find((i) => i.type === 'dance_floor');
  if (dance) {
    const look = stage ?? head;
    const target: Vec3 = look ? [look.x, 1.2, look.y] : [hall.width / 2, 1.2, hall.length / 2];
    out.push({ key: 'danceFloor', pose: poseLookingAt(dance.x, dance.y, target) });
  }
  if (stage) {
    const p = front(stage, 4);
    out.push({ key: 'stage', pose: poseLookingAt(p.x, p.y, [stage.x, 1.4, stage.y]) });
  }
  return out;
}
