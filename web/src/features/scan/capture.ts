import { MAX_SCAN_PHOTOS, MIN_SCAN_PHOTOS, type ScanPurpose } from '@salla/shared';

/** Shortest video worth processing, the length the guide aims for, and the hard stop. */
export const RECORD_LIMITS: Record<ScanPurpose, { min: number; target: number; max: number }> = {
  decor: { min: 20, target: 90, max: 120 },
  // A whole hall: one slow walk along all walls, then the middle.
  hall: { min: 45, target: 180, max: 240 },
};
/**
 * Decor: about 90 MB for the target length. A hall video is longer, so a lower rate keeps it
 * under the 500 MB upload limit (240 s × 6 Mbit/s ≈ 180 MB).
 */
export const RECORD_BITS_PER_SECOND: Record<ScanPurpose, number> = {
  decor: 8_000_000,
  hall: 6_000_000,
};

/** Longest side of the photo sent to the AI: more only adds upload time. */
export const AI_PHOTO_MAX_SIDE = 1600;

/** Size that fits inside `max` without enlarging. Pure. */
export function fitSize(w: number, h: number, max: number): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/** A smaller JPEG of the photo; the original when the browser cannot read it. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitSize(bitmap.width, bitmap.height, AI_PHOTO_MAX_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}

export type PhotoWarning = 'dark' | 'blurry';

/** Side of the small grey copy the photo is judged on. */
export const PHOTO_CHECK_SIDE = 256;
const DARK_BELOW = 45;
const BLURRY_BELOW = 25;

/**
 * What might spoil an AI result, judged on a small grey copy: average brightness, and the
 * strength of the edges (variance of the Laplacian). Only a hint; thresholds are rough. Pure.
 */
export function photoWarnings(
  grey: ArrayLike<number>,
  width: number,
  height: number,
): PhotoWarning[] {
  const n = width * height;
  if (n === 0 || width < 3 || height < 3) return [];
  let total = 0;
  for (let i = 0; i < n; i++) total += grey[i]!;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const l = grey[i - 1]! + grey[i + 1]! + grey[i - width]! + grey[i + width]! - 4 * grey[i]!;
      sum += l;
      sumSquares += l * l;
      count++;
    }
  }
  const mean = sum / count;
  const out: PhotoWarning[] = [];
  if (total / n < DARK_BELOW) out.push('dark');
  if (sumSquares / count - mean * mean < BLURRY_BELOW) out.push('blurry');
  return out;
}

/** Warnings for a photo; none when the browser cannot read it. */
export async function checkPhoto(file: Blob): Promise<PhotoWarning[]> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitSize(bitmap.width, bitmap.height, PHOTO_CHECK_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const rgba = g.getImageData(0, 0, width, height).data;
    const grey = new Float32Array(width * height);
    for (let i = 0; i < grey.length; i++) {
      grey[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
    }
    return photoWarnings(grey, width, height);
  } catch {
    return [];
  }
}

export type CaptureStep = 'ring1' | 'ring2' | 'details' | 'walls' | 'corners' | 'middle';

/** What the guide asks for at this point of the recording. Pure. */
export function stepAt(seconds: number, purpose: ScanPurpose = 'decor'): CaptureStep {
  if (purpose === 'hall') {
    if (seconds < 100) return 'walls';
    if (seconds < 150) return 'corners';
    return 'middle';
  }
  if (seconds < 40) return 'ring1';
  if (seconds < 80) return 'ring2';
  return 'details';
}

// MP4 first: Safari records only MP4, and newer Chrome versions can too (smaller, H.264).
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/** First recording format the browser supports; undefined = let the browser choose. Pure. */
export function pickRecorderMime(isSupported: (type: string) => boolean): string | undefined {
  return MIME_CANDIDATES.find((t) => {
    try {
      return isSupported(t);
    } catch {
      return false;
    }
  });
}

/** File extension for an upload name (the server checks the real type by content). */
export const videoExtension = (mime: string): string => (mime.includes('mp4') ? 'mp4' : 'webm');

/** Why a set of photos cannot be sent yet, or null when it can. Pure. */
export function photoCountProblem(count: number): 'tooFew' | 'tooMany' | null {
  if (count < MIN_SCAN_PHOTOS) return 'tooFew';
  if (count > MAX_SCAN_PHOTOS) return 'tooMany';
  return null;
}
