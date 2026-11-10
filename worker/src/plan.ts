/** Pure decisions of the scan worker (unit tested in plan.test.ts). */

/** At most this many frames go into photogrammetry (more mostly adds time, not detail). */
export const MAX_FRAMES = 200;
/** Frames per second taken from a video when its length is unknown or short. */
export const MAX_FPS = 2;

export type ScanQuality = 'quick' | 'detailed';
export type ScanPurpose = 'decor' | 'hall';

/** Frames that go into photogrammetry: a whole hall needs more than one decoration. */
export function framesFor(quality: ScanQuality, purpose: ScanPurpose): number {
  if (quality === 'detailed') return MAX_FRAMES;
  return purpose === 'hall' ? 120 : 80;
}

/** Width the frames are scaled down to. */
export const frameWidthFor = (quality: ScanQuality): number => (quality === 'quick' ? 1280 : 1920);

/** Triangles of the final model: a quick scan keeps 60 % of the detailed budget. */
export const triangleBudget = (quality: ScanQuality, detailed: number): number =>
  quality === 'quick' ? Math.round(detailed * 0.6) : detailed;

/** Usual minutes per job, for the progress bar. Mirrors scanExpectedMinutes in shared. */
export function expectedMinutes(quality: ScanQuality, purpose: ScanPurpose): number {
  if (purpose === 'hall') return quality === 'quick' ? 18 : 35;
  return quality === 'quick' ? 12 : 25;
}

/**
 * Frame rate for ffmpeg so a video gives about MAX_FRAMES frames. Unknown durations (browser
 * WebM recordings often have none) use MAX_FPS; pickEvenly trims the result afterwards.
 */
export function framesPerSecond(
  durationSec: number | null,
  maxFrames = MAX_FRAMES,
  maxFps = MAX_FPS,
): number {
  if (durationSec === null || !Number.isFinite(durationSec) || durationSec <= 0) return maxFps;
  const fps = Math.min(maxFps, maxFrames / durationSec);
  return Math.max(0.1, Math.round(fps * 1000) / 1000);
}

/** Twice the frames needed are taken from the video, to have sharp ones to choose from. */
export const FRAME_OVERSAMPLE = 2;
/** The frame rate that allows, at most. */
export const MAX_CANDIDATE_FPS = 4;

/**
 * The sharpest frame of each stretch of the video, in order. A moving phone blurs many frames,
 * and blurred frames are what most often breaks photogrammetry. At the same quality setting a
 * sharper picture makes a larger JPEG, so the file size needs no image processing.
 */
export function pickSharpest<T extends { size: number }>(frames: readonly T[], max: number): T[] {
  if (frames.length <= max) return [...frames];
  if (max <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    const from = Math.floor((i * frames.length) / max);
    const to = Math.floor(((i + 1) * frames.length) / max);
    let best = frames[from]!;
    for (let k = from + 1; k < to; k++) if (frames[k]!.size > best.size) best = frames[k]!;
    out.push(best);
  }
  return out;
}

/** Up to `max` items spread evenly over the list, first and last included. */
export function pickEvenly<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  if (max <= 0) return [];
  if (max === 1) return [items[0]!];
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]!);
  return out;
}

/**
 * Progress shown while photogrammetry runs, which reports no percentage of its own: it rises
 * from `from` towards `to` and slows down, so a longer run never shows 100 % too early.
 */
export function reconstructProgress(
  elapsedMs: number,
  expectedMs: number,
  from = 10,
  to = 88,
): number {
  if (elapsedMs <= 0 || expectedMs <= 0) return from;
  const share = 1 - Math.exp(-(elapsedMs / expectedMs) * 1.6);
  return Math.round(from + (to - from) * share);
}

/** Share of triangles to keep so the model ends near `target` triangles (1 = keep all). */
export function simplifyRatio(triangles: number, target: number): number {
  if (triangles <= target || triangles <= 0) return 1;
  return Math.max(0.01, target / triangles);
}

export type MeshKind = 'glb' | 'gltf' | 'obj';

/**
 * The textured mesh among the photogrammetry outputs: glb, then gltf, then obj; a name with
 * "textured" wins within a format. Null when there is none.
 */
export function pickMeshOutput(files: readonly string[]): { file: string; kind: MeshKind } | null {
  for (const kind of ['glb', 'gltf', 'obj'] as const) {
    const matches = files.filter((f) => f.toLowerCase().endsWith(`.${kind}`));
    if (!matches.length) continue;
    const file = matches.find((f) => f.toLowerCase().includes('textured')) ?? matches[0]!;
    return { file, kind };
  }
  return null;
}

const TEXTURE_EXT = /\.(exr|png|tif|tiff|jpe?g)$/i;

/** Texture images among the outputs (they are converted to JPEG of at most 2048 px). */
export const isTextureFile = (name: string): boolean => TEXTURE_EXT.test(name);

/** "texture_1001.exr" -> "texture_1001.jpg" */
export const jpegName = (name: string): string => name.replace(TEXTURE_EXT, '.jpg');

/** An .mtl file with every renamed texture pointing at its new file. */
export function rewriteMtl(text: string, renames: Readonly<Record<string, string>>): string {
  let out = text;
  for (const [from, to] of Object.entries(renames)) out = out.split(from).join(to);
  return out;
}

/** Short failure text for the agent's list (the server allows 500 characters). */
export function failureText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, ' ').trim().slice(0, 480) || 'unknown error';
}
