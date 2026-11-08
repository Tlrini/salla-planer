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
