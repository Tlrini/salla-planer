/** Turning a hall scan into a hall template (pure math, unit tested). */

/** The plan photo shows the scan cut at this height (m): floor, columns and wall bases. */
export const PLAN_CUT_HEIGHT = 1.2;
/** Longer side of the plan photo in pixels. */
export const PLAN_IMAGE_MAX_PX = 2048;
/** Largest hall the data model allows (Hall.width / Hall.length). */
export const MAX_HALL_SIDE = 500;

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Real size of the hall from the size of the aligned scan (its own units; x = width,
 * y = height, z = length) and the real ceiling height the agent typed.
 */
export function hallFromScan(
  size: { x: number; y: number; z: number },
  realHeight: number,
): { scale: number; width: number; length: number; height: number } {
  const scale = size.y > 0 ? realHeight / size.y : 1;
  return { scale, width: r2(size.x * scale), length: r2(size.z * scale), height: r2(realHeight) };
}

/** Where the scaled scan goes so that its lowest corner (`min`, own units) lands on the origin. */
export function shellOffset(
  min: { x: number; y: number; z: number },
  scale: number,
): { x: number; y: number; z: number } {
  // `+ 0` turns a -0 into 0.
  return { x: -min.x * scale + 0, y: -min.y * scale + 0, z: -min.z * scale + 0 };
}

/** Whether these dimensions fit the data model (a wrongly turned scan comes out huge or flat). */
export const validHallSize = (width: number, length: number): boolean =>
  width >= 1 && length >= 1 && width <= MAX_HALL_SIDE && length <= MAX_HALL_SIDE;

/** Pixel size of the plan photo: same proportions as the hall, longer side `maxPx`. */
export function planImageSize(
  width: number,
  length: number,
  maxPx = PLAN_IMAGE_MAX_PX,
): { w: number; h: number } {
  if (width <= 0 || length <= 0) return { w: maxPx, h: maxPx };
  const k = maxPx / Math.max(width, length);
  return { w: Math.max(1, Math.round(width * k)), h: Math.max(1, Math.round(length * k)) };
}
